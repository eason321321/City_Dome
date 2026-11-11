import * as THREE from 'three';
import { BuildingModelFactory, BuildingMetadata } from '../rendering/BuildingModelFactory';
import { ZoningManager } from './ZoningManager';
import { RoadNetwork } from './RoadNetwork';
import { Pathfinding, PathResult } from './Pathfinding';
import { VehicleManager } from '../simulation/VehicleManager';

export interface PlacedBuilding {
  id: string;
  metadata: BuildingMetadata;
  modelId: string;
  lot: {
    originZx: number;
    originZz: number;
    frontageWidth: number;
    lotDepth: number;
  };
  occupiedCellKeys: string[];
  facing: 'N' | 'S' | 'E' | 'W';
  worldCenter: THREE.Vector3;
  frontWorldPos: THREE.Vector3;
  targetRoadTileKey: string;
  group: THREE.Group;
  buildingMesh: THREE.Group;
  scaffoldingGroup: THREE.Group;
  status: 'constructing' | 'completed';
  constructionProgress: number;     // 0.0 ~ 1.0
  constructionDuration: number;     // 建造總秒數 (以遊戲模擬時間計)
  registeredResidents: number;      // 登記居住人數
  currentOccupants: number;         // 當前房內人數
  isCoLiving: boolean;              // 是否合居 (true: 與人合居, false: 自己住)
  moveInStatus: 'none' | 'enRoute' | 'arrived' | 'waitingForRoad';
  // 施工吊臂作業相關動畫元件參照
  craneRefs?: {
    slewArm: THREE.Group;
    trolley: THREE.Group;
    cable: THREE.Mesh;
    hookAndCargo: THREE.Group;
    beacon: THREE.Mesh;
    baseAngle: number;
    jibLength: number;
    mastHeight: number;
    animTimer: number;
  };
}

export type HousingDensity = 'Low' | 'Medium' | 'High';
export type MoveInType = 'joinExisting' | 'buildNew';
export type DemandStatus = 'pending' | 'matched' | 'lost';

export interface HousingDemand {
  id: string;
  peopleCount: number;                 // 入住人數 1 - 5
  moveInType: MoveInType;             // 併入別人 (joinExisting) vs 建立新房屋 (buildNew)
  density: HousingDensity;            // 需求住宅密度 (目前皆為 'Low')
  preferredModels: string[];          // 2 個可接受之偏好房型 ID
  status: DemandStatus;               // 'pending' | 'matched' | 'lost'
  createdAt: number;
  matchedBuildingId?: string;         // 成功配對之房屋 ID
  matchedBuildingName?: string;       // 成功配對之房屋名稱
  matchedType?: MoveInType;           // 實際配對類型
  failReason?: string;                // 配對失敗流失原因
}

export interface MatchingResult {
  success: boolean;
  peopleCount: number;
  timestamp: number;
  buildingName?: string;
  reason?: string;
  demand?: HousingDemand;
}

/**
 * 建築與住宅生命週期管理器 (BuildingManager)
 * 負責：
 * 1. 住房需求產生與嚴謹配對 (支援 1人、2人、3人住戶需求)
 * 2. 嚴格檢驗「正面貼合馬路」與「外部道路必須有可供車子通行之連通道路」之落位條件
 * 3. 排除容量不足房型，於合法模型中隨機選擇起建
 * 4. 施工建造動畫（鷹架、警示燈球、地底升起）
 * 5. 完工後市民自外部公路開車抵達家門前並消失遷入
 * 6. 懸停顯示建造進度、居住人數與現房內人數
 */
export class BuildingManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private zoningManager: ZoningManager;
  private roadNetwork: RoadNetwork;
  private vehicleManager: VehicleManager;

  // 格位尺寸與建物縮放 (配合 0.5m x 0.5m 小格子，建築物底面積為原先 1/4)
  private readonly CELL_SIZE: number = 0.5;

  // 建築群組與資料儲存
  private buildingsContainer: THREE.Group;
  private buildings: Map<string, PlacedBuilding> = new Map();
  private occupiedCells: Set<string> = new Set();
  private nextBuildingId: number = 1;

  // 住房需求統計與佇列清單 (需求清單最新在最上方)
  private demandQueue: HousingDemand[] = [];
  private nextDemandId: number = 1;
  private totalDemandGenerated: number = 0;
  private totalMatchedSuccess: number = 0;
  private totalDemandLost: number = 0;
  private latestMatchingResult: MatchingResult | null = null;

  // 懸停射線與浮動 Tooltip
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mousePos: THREE.Vector2 = new THREE.Vector2();
  private hoveredBuilding: PlacedBuilding | null = null;
  private tooltipElement: HTMLDivElement;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    zoningManager: ZoningManager,
    roadNetwork: RoadNetwork,
    vehicleManager: VehicleManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.zoningManager = zoningManager;
    this.roadNetwork = roadNetwork;
    this.vehicleManager = vehicleManager;

    this.buildingsContainer = new THREE.Group();
    this.buildingsContainer.name = 'BuildingsContainer';
    this.scene.add(this.buildingsContainer);

    this.tooltipElement = this.createTooltipElement();
    this.bindHoverEvents();
  }

  // ==========================================
  // 住房需求產生與三階段配對入住機制
  // 流程：1. 產生需求 -> 2. 配對需求 -> 3. 配對成功開車入住 / 失敗流失
  // ==========================================

  /**
   * 產生隨機或指定人數之住房需求，並加入需求清單、立即執行配對
   * @param forcedPeopleCount 可選指定人數 (1-5 人)，未指定則 1-5 隨機
   */
  public generateRandomDemand(forcedPeopleCount?: number): HousingDemand {
    const peopleCount = forcedPeopleCount ?? (Math.floor(Math.random() * 5) + 1);
    const moveInType: MoveInType = Math.random() < 0.5 ? 'joinExisting' : 'buildNew';
    const density: HousingDensity = 'Low';

    // 隨機自目前模型庫選取 2 個不重複的偏好房型
    const catalog = BuildingModelFactory.getModelsCatalog();
    const shuffled = [...catalog].sort(() => Math.random() - 0.5);
    const preferredModels = [shuffled[0].id, shuffled[1].id];

    const demand: HousingDemand = {
      id: `dem_${this.nextDemandId++}`,
      peopleCount,
      moveInType,
      density,
      preferredModels,
      status: 'pending',
      createdAt: Date.now(),
    };

    // 最新需求置於最上方 (清單開頭)
    this.demandQueue.unshift(demand);

    // 進行核心配對流程
    this.processDemand(demand);

    return demand;
  }

  /**
   * 住房需求產生請求 (相容舊呼叫介面)
   */
  public requestHousingDemand(peopleCount?: number): MatchingResult {
    this.generateRandomDemand(peopleCount);
    return this.latestMatchingResult!;
  }

  /**
   * 配對需求核心處理：依入住方式分別判定
   */
  private processDemand(demand: HousingDemand): void {
    this.totalDemandGenerated += demand.peopleCount;

    if (demand.moveInType === 'joinExisting') {
      this.matchJoinExisting(demand);
    } else {
      this.matchBuildNew(demand);
    }
  }

  /**
   * 配對條件 1：入住方式選擇「併入別人 (合居)」
   * 條件 1-1：篩選現有候選房屋（需求密度符合、房型在偏好內、剩餘容量 >= 人數、且已完工建造完畢）
   * 條件 1-2：隨機洗牌，逐一擲 50%，第一個通過就入住，全部沒過才失敗
   */
  private matchJoinExisting(demand: HousingDemand): void {
    const candidates = Array.from(this.buildings.values()).filter((b) => {
      // 建造中的房屋無法作為候選房屋
      if (b.status !== 'completed') return false;
      // 需求密度符合 (Low 對應 Residential_Low)
      if (b.metadata.category !== 'Residential_Low') return false;
      // 房型在偏好內
      if (!demand.preferredModels.includes(b.modelId)) return false;
      // 剩餘容量 >= 人數
      const remainingCapacity = b.metadata.capacity - b.registeredResidents;
      if (remainingCapacity < demand.peopleCount) return false;
      return true;
    });

    if (candidates.length === 0) {
      demand.status = 'lost';
      demand.failReason = '無符合偏好房型且容量足夠之已完工房舍可供併入';
      this.totalDemandLost += demand.peopleCount;
      this.latestMatchingResult = {
        success: false,
        peopleCount: demand.peopleCount,
        timestamp: Date.now(),
        reason: demand.failReason,
        demand,
      };
      return;
    }

    // 條件 1-2：候選房屋隨機洗牌，逐一擲 50%
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    let chosenBuilding: PlacedBuilding | null = null;

    for (const b of shuffled) {
      if (Math.random() < 0.5) {
        chosenBuilding = b;
        break;
      }
    }

    if (!chosenBuilding) {
      demand.status = 'lost';
      demand.failReason = `現有 ${candidates.length} 棟符合房舍，但合居媒合意願 (50%) 皆未通過`;
      this.totalDemandLost += demand.peopleCount;
      this.latestMatchingResult = {
        success: false,
        peopleCount: demand.peopleCount,
        timestamp: Date.now(),
        reason: demand.failReason,
        demand,
      };
      return;
    }

    // 媒合成功！
    demand.status = 'matched';
    demand.matchedBuildingId = chosenBuilding.id;
    demand.matchedBuildingName = chosenBuilding.metadata.name;
    demand.matchedType = 'joinExisting';

    chosenBuilding.registeredResidents += demand.peopleCount;
    chosenBuilding.isCoLiving = true;

    this.totalMatchedSuccess += demand.peopleCount;
    this.latestMatchingResult = {
      success: true,
      peopleCount: demand.peopleCount,
      timestamp: Date.now(),
      buildingName: chosenBuilding.metadata.name,
      demand,
    };

    // 房屋已完工，立即派遣市民開車自邊界公路前往家門，車到消失時正式增加入住人數
    this.dispatchCitizenVehicle(chosenBuilding, demand.peopleCount);
  }

  /**
   * 配對條件 2：選擇「建立新房屋」
   * 1. 先排除人數不足之房型以及不同密度之房型
   * 2. 從兩個偏好房型中，隨機選一個開始檢查是否有符合之土地
   * 3. 第一個無法被滿足則檢查第二個偏好房型，皆不符合則配對失敗流失
   * (判定候選地時：屬於需求密度住宅區、空間放得下、正面緊貼馬路、已連通外聯道路、未被其他需求預留)
   */
  private matchBuildNew(demand: HousingDemand): void {
    const catalog = BuildingModelFactory.getModelsCatalog();

    // 先排除人數不足之房型以及不同密度之房型 (目前密度為 Low，對應 Residential_Low)
    const validPreferredModels = demand.preferredModels
      .map((modelId) => catalog.find((m) => m.id === modelId))
      .filter((m): m is BuildingMetadata => {
        if (!m) return false;
        if (m.category !== 'Residential_Low') return false;
        if (m.capacity < demand.peopleCount) return false;
        return true;
      });

    if (validPreferredModels.length === 0) {
      demand.status = 'lost';
      demand.failReason = `偏好房型容量皆小於 ${demand.peopleCount} 人（無法容納此需求人數）`;
      this.totalDemandLost += demand.peopleCount;
      this.latestMatchingResult = {
        success: false,
        peopleCount: demand.peopleCount,
        timestamp: Date.now(),
        reason: demand.failReason,
        demand,
      };
      return;
    }

    // 從偏好房型中先從隨機某一個開始檢查是否有符合土地
    const checkOrder = [...validPreferredModels].sort(() => Math.random() - 0.5);

    let chosenModel: BuildingMetadata | null = null;
    let chosenSite: {
      originZx: number;
      originZz: number;
      facing: 'N' | 'S' | 'E' | 'W';
      targetRoadTileKey: string;
      frontWorldPos: THREE.Vector3;
    } | null = null;

    for (const model of checkOrder) {
      const site = this.findSiteForModel(model);
      if (site) {
        chosenModel = model;
        chosenSite = site;
        break;
      }
    }

    if (!chosenModel || !chosenSite) {
      demand.status = 'lost';
      demand.failReason = '偏好房型無可用建地（未連通外聯道路、正面未貼路或空間不足）';
      this.totalDemandLost += demand.peopleCount;
      this.latestMatchingResult = {
        success: false,
        peopleCount: demand.peopleCount,
        timestamp: Date.now(),
        reason: demand.failReason,
        demand,
      };
      return;
    }

    // 成功配對建地！起建新房屋 (進入施工狀態，建造動畫 6s，完工後開車遷入)
    demand.status = 'matched';
    demand.matchedBuildingName = chosenModel.name;
    demand.matchedType = 'buildNew';

    this.totalMatchedSuccess += demand.peopleCount;

    const building = this.spawnBuilding(chosenModel, chosenSite, demand.peopleCount);
    demand.matchedBuildingId = building.id;

    this.latestMatchingResult = {
      success: true,
      peopleCount: demand.peopleCount,
      timestamp: Date.now(),
      buildingName: chosenModel.name,
      demand,
    };
  }

  /**
   * 搜尋指定模型之合法候選建地：
   * 1. 屬於需求密度之住宅區
   * 2. 空間放得下該房型且正面緊貼馬路
   * 3. 已連通外聯道路 (已在選地時完整判定，後續無須重複驗證)
   * 4. 沒被其他需求預留或佔用
   */
  private findSiteForModel(meta: BuildingMetadata): {
    originZx: number;
    originZz: number;
    facing: 'N' | 'S' | 'E' | 'W';
    targetRoadTileKey: string;
    frontWorldPos: THREE.Vector3;
  } | null {
    const cells = this.zoningManager.getCells();
    const candidateSites: {
      originZx: number;
      originZz: number;
      facing: 'N' | 'S' | 'E' | 'W';
      targetRoadTileKey: string;
      frontWorldPos: THREE.Vector3;
    }[] = [];

    const facings: ('N' | 'S' | 'E' | 'W')[] = ['N', 'S', 'E', 'W'];

    for (const cell of cells.values()) {
      if (cell.zoneType !== 'Residential' || this.occupiedCells.has(cell.key)) {
        continue;
      }

      for (const facing of facings) {
        // 檢查放得下、正面緊貼馬路、未被佔用
        if (!this.canFitModelAt(meta, cell.zx, cell.zz, facing)) {
          continue;
        }

        const { frontWorldPos, roadKey } = this.calculateFrontRoadPoint(
          cell.zx,
          cell.zz,
          meta.frontageWidth,
          facing
        );

        if (!roadKey || !this.roadNetwork.hasTile(roadKey)) {
          continue;
        }

        // 檢查已連通外聯道路
        if (!this.hasPathFromHighway(roadKey)) {
          continue;
        }

        candidateSites.push({
          originZx: cell.zx,
          originZz: cell.zz,
          facing,
          targetRoadTileKey: roadKey,
          frontWorldPos,
        });
      }
    }

    if (candidateSites.length === 0) return null;
    return candidateSites[Math.floor(Math.random() * candidateSites.length)];
  }

  /**
   * 檢驗目標道路是否由外部邊界公路 (南界 Z=97 東西向幹線) 具備可供車輛通行的路徑
   */
  private hasPathFromHighway(targetRoadTileKey: string): boolean {
    const roadTile = this.roadNetwork.getTile(targetRoadTileKey);
    if (!roadTile || roadTile.lanes.length === 0) return false;

    const allLanes = this.roadNetwork.getAllLanes();
    const westEntry = this.roadNetwork.getHighwayWestEntryLane();
    const eastEntry = this.roadNetwork.getHighwayEastEntryLane();

    for (const targetLane of roadTile.lanes) {
      if (westEntry) {
        const p = Pathfinding.findShortestPath(westEntry.id, targetLane.id, allLanes);
        if (p && p.routeWaypoints && p.routeWaypoints.length >= 2) return true;
      }
      if (eastEntry) {
        const p = Pathfinding.findShortestPath(eastEntry.id, targetLane.id, allLanes);
        if (p && p.routeWaypoints && p.routeWaypoints.length >= 2) return true;
      }
    }
    return false;
  }

  /**
   * 嚴格檢驗指定模型在 (originZx, originZz) 沿 facing 朝向時：
   * 1. 整個正面 (長度 frontageWidth) 的每一個 0.5m 格子是否皆緊貼馬路 (規則 1)
   * 2. 建築佔地 (frontageWidth x lotDepth) 內的所有格子是否皆為已劃分的住宅區且未被佔用
   */
  private canFitModelAt(
    meta: BuildingMetadata,
    originZx: number,
    originZz: number,
    facing: 'N' | 'S' | 'E' | 'W'
  ): boolean {
    const W = meta.frontageWidth;
    const D = meta.lotDepth;
    const cs = this.CELL_SIZE;

    switch (facing) {
      case 'S': {
        const frontZ = originZz;
        const testZ = (frontZ + 1) * cs + 0.25;
        for (let x = originZx; x < originZx + W; x++) {
          const testX = (x + 0.5) * cs;
          if (!this.isRoadAdjacent(testX, testZ)) return false;
          for (let z = frontZ - D + 1; z <= frontZ; z++) {
            const key = `${x},${z}`;
            if (this.occupiedCells.has(key)) return false;
            const c = this.zoningManager.getCell(key);
            if (!c || c.zoneType !== 'Residential') return false;
          }
        }
        return true;
      }

      case 'N': {
        const frontZ = originZz;
        const testZ = frontZ * cs - 0.25;
        for (let x = originZx; x < originZx + W; x++) {
          const testX = (x + 0.5) * cs;
          if (!this.isRoadAdjacent(testX, testZ)) return false;
          for (let z = frontZ; z < frontZ + D; z++) {
            const key = `${x},${z}`;
            if (this.occupiedCells.has(key)) return false;
            const c = this.zoningManager.getCell(key);
            if (!c || c.zoneType !== 'Residential') return false;
          }
        }
        return true;
      }

      case 'E': {
        const frontX = originZx;
        const testX = (frontX + 1) * cs + 0.25;
        for (let z = originZz; z < originZz + W; z++) {
          const testZ = (z + 0.5) * cs;
          if (!this.isRoadAdjacent(testX, testZ)) return false;
          for (let x = frontX - D + 1; x <= frontX; x++) {
            const key = `${x},${z}`;
            if (this.occupiedCells.has(key)) return false;
            const c = this.zoningManager.getCell(key);
            if (!c || c.zoneType !== 'Residential') return false;
          }
        }
        return true;
      }

      case 'W': {
        const frontX = originZx;
        const testX = frontX * cs - 0.25;
        for (let z = originZz; z < originZz + W; z++) {
          const testZ = (z + 0.5) * cs;
          if (!this.isRoadAdjacent(testX, testZ)) return false;
          for (let x = frontX; x < frontX + D; x++) {
            const key = `${x},${z}`;
            if (this.occupiedCells.has(key)) return false;
            const c = this.zoningManager.getCell(key);
            if (!c || c.zoneType !== 'Residential') return false;
          }
        }
        return true;
      }
    }
  }

  private isRoadAdjacent(worldX: number, worldZ: number): boolean {
    // 道路中心座標均吸附於奇數網格 (Math.floor(val / 2) * 2 + 1)
    const gx = Math.floor(worldX / 2) * 2 + 1;
    const gz = Math.floor(worldZ / 2) * 2 + 1;
    if (!this.roadNetwork.hasTile(`${gx},${gz}`)) return false;
    return Math.abs(worldX - gx) <= 1.05 && Math.abs(worldZ - gz) <= 1.05;
  }

  private calculateFrontRoadPoint(
    originZx: number,
    originZz: number,
    frontageWidth: number,
    facing: 'N' | 'S' | 'E' | 'W'
  ): { frontWorldPos: THREE.Vector3; roadKey: string } {
    const cs = this.CELL_SIZE;
    let roadGx = 0;
    let roadGz = 0;
    let fx = 0;
    let fz = 0;

    switch (facing) {
      case 'S':
        fx = (originZx + frontageWidth / 2) * cs;
        fz = (originZz + 1.0) * cs;
        roadGx = Math.floor(fx / 2) * 2 + 1;
        roadGz = Math.floor((fz + 0.25) / 2) * 2 + 1;
        break;
      case 'N':
        fx = (originZx + frontageWidth / 2) * cs;
        fz = originZz * cs;
        roadGx = Math.floor(fx / 2) * 2 + 1;
        roadGz = Math.floor((fz - 0.25) / 2) * 2 + 1;
        break;
      case 'E':
        fx = (originZx + 1.0) * cs;
        fz = (originZz + frontageWidth / 2) * cs;
        roadGx = Math.floor((fx + 0.25) / 2) * 2 + 1;
        roadGz = Math.floor(fz / 2) * 2 + 1;
        break;
      case 'W':
        fx = originZx * cs;
        fz = (originZz + frontageWidth / 2) * cs;
        roadGx = Math.floor((fx - 0.25) / 2) * 2 + 1;
        roadGz = Math.floor(fz / 2) * 2 + 1;
        break;
    }

    return {
      frontWorldPos: new THREE.Vector3(fx, 0.04, fz),
      roadKey: `${roadGx},${roadGz}`,
    };
  }

  // ==========================================
  // 建築實體生成與施工動畫 (規則 5)
  // ==========================================

  private spawnBuilding(
    meta: BuildingMetadata,
    site: {
      originZx: number;
      originZz: number;
      facing: 'N' | 'S' | 'E' | 'W';
      targetRoadTileKey: string;
      frontWorldPos: THREE.Vector3;
    },
    peopleCount: number
  ): PlacedBuilding {
    const W = meta.frontageWidth;
    const D = meta.lotDepth;
    const occupiedKeys: string[] = [];

    // 鎖定佔用小格子
    switch (site.facing) {
      case 'S':
        for (let x = site.originZx; x < site.originZx + W; x++) {
          for (let z = site.originZz - D + 1; z <= site.originZz; z++) {
            const k = `${x},${z}`;
            this.occupiedCells.add(k);
            occupiedKeys.push(k);
          }
        }
        break;
      case 'N':
        for (let x = site.originZx; x < site.originZx + W; x++) {
          for (let z = site.originZz; z < site.originZz + D; z++) {
            const k = `${x},${z}`;
            this.occupiedCells.add(k);
            occupiedKeys.push(k);
          }
        }
        break;
      case 'E':
        for (let z = site.originZz; z < site.originZz + W; z++) {
          for (let x = site.originZx - D + 1; x <= site.originZx; x++) {
            const k = `${x},${z}`;
            this.occupiedCells.add(k);
            occupiedKeys.push(k);
          }
        }
        break;
      case 'W':
        for (let z = site.originZz; z < site.originZz + W; z++) {
          for (let x = site.originZx; x < site.originZx + D; x++) {
            const k = `${x},${z}`;
            this.occupiedCells.add(k);
            occupiedKeys.push(k);
          }
        }
        break;
    }

    const cs = this.CELL_SIZE;
    let cx = 0;
    let cz = 0;
    let rotY = 0;

    switch (site.facing) {
      case 'S':
        cx = (site.originZx + W / 2) * cs;
        cz = (site.originZz - D / 2 + 1.0) * cs;
        rotY = 0;
        break;
      case 'N':
        cx = (site.originZx + W / 2) * cs;
        cz = (site.originZz + D / 2) * cs;
        rotY = Math.PI;
        break;
      case 'E':
        cx = (site.originZx - D / 2 + 1.0) * cs;
        cz = (site.originZz + W / 2) * cs;
        rotY = Math.PI / 2;
        break;
      case 'W':
        cx = (site.originZx + D / 2) * cs;
        cz = (site.originZz + W / 2) * cs;
        rotY = -Math.PI / 2;
        break;
    }

    const worldCenter = new THREE.Vector3(cx, 0, cz);

    const buildingGroup = new THREE.Group();
    buildingGroup.position.copy(worldCenter);
    buildingGroup.rotation.y = rotY;

    // 建築實體 (初起建時沉於地底，配合 1/4 面積建築沉降深度為 -0.4)
    const buildingMesh = BuildingModelFactory.createBuildingById(meta.id)!;
    buildingMesh.position.y = -0.4;
    buildingMesh.scale.set(1.0, 0.05, 1.0);
    buildingGroup.add(buildingMesh);

    // 施工鷹架、警示信號燈與作業起重吊臂 (傳入實際米數寬度 W*cs 與縱深 D*cs)
    const constructionSite = this.createConstructionSiteMesh(W * cs, D * cs);
    buildingGroup.add(constructionSite.container);

    this.buildingsContainer.add(buildingGroup);

    // 居住模式：複數為合居，單人為自住
    const isCoLiving = peopleCount > 1;

    const building: PlacedBuilding = {
      id: `bld_${this.nextBuildingId++}`,
      metadata: meta,
      modelId: meta.id,
      lot: {
        originZx: site.originZx,
        originZz: site.originZz,
        frontageWidth: W,
        lotDepth: D,
      },
      occupiedCellKeys: occupiedKeys,
      facing: site.facing,
      worldCenter,
      frontWorldPos: site.frontWorldPos,
      targetRoadTileKey: site.targetRoadTileKey,
      group: buildingGroup,
      buildingMesh,
      scaffoldingGroup: constructionSite.container,
      status: 'constructing',
      constructionProgress: 0.0,
      constructionDuration: 18.0, // 建造時間為原先 6.0s 的 3 倍 = 18.0s (以遊戲模擬時間推進)
      registeredResidents: peopleCount,
      currentOccupants: 0,
      isCoLiving,
      moveInStatus: 'none',
      craneRefs: constructionSite.craneRefs,
    };

    this.buildings.set(building.id, building);
    buildingGroup.userData = { buildingId: building.id };
    return building;
  }

  /**
   * 建立施工現場視覺組合：
   * 1. 建築周邊鷹架框架 (Scaffolding) 與旋轉警示信號燈
   * 2. 全功能作業塔式起重吊臂 (Construction Tower Crane)：
   *    - 四角角柱桁架塔身與底座配重
   *    - 迴轉駕駛室與塔頂 A 型尖架
   *    - 後方平衡臂與水泥平衡配重塊
   *    - 前方主作業起重臂 (三角格構桁架)
   *    - 沿臂前後滑動之變幅小車 (Trolley)
   *    - 起升鋼纜、滑輪吊鉤、以及吊索下懸掛微晃的建築工字鋼樑 (Working Cargo)
   */
  private createConstructionSiteMesh(w: number, d: number): {
    container: THREE.Group;
    craneRefs: {
      slewArm: THREE.Group;
      trolley: THREE.Group;
      cable: THREE.Mesh;
      hookAndCargo: THREE.Group;
      beacon: THREE.Mesh;
      baseAngle: number;
      jibLength: number;
      mastHeight: number;
      animTimer: number;
    };
  } {
    const siteGroup = new THREE.Group();
    siteGroup.name = 'ConstructionSiteGroup';

    // ----------------------------------------
    // 1. 周邊施工鷹架 (Scaffolding Frame)
    // ----------------------------------------
    const scaffoldingGroup = new THREE.Group();
    scaffoldingGroup.name = 'ScaffoldingGroup';

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.8,
      roughness: 0.3,
    });

    const hw = w / 2;
    const hd = d / 2;
    const scafHeight = 0.95;

    const corners = [
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, hd],
    ];

    const poleGeo = new THREE.CylinderGeometry(0.012, 0.012, scafHeight, 6);
    corners.forEach(([px, pz]) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(px, scafHeight / 2, pz);
      scaffoldingGroup.add(pole);
    });

    const barGeoX = new THREE.BoxGeometry(w, 0.016, 0.016);
    const barGeoZ = new THREE.BoxGeometry(0.016, 0.016, d);

    [scafHeight * 0.45, scafHeight * 0.95].forEach((y) => {
      const barN = new THREE.Mesh(barGeoX, poleMat);
      barN.position.set(0, y, -hd);
      scaffoldingGroup.add(barN);

      const barS = new THREE.Mesh(barGeoX, poleMat);
      barS.position.set(0, y, hd);
      scaffoldingGroup.add(barS);

      const barW = new THREE.Mesh(barGeoZ, poleMat);
      barW.position.set(-hw, y, 0);
      scaffoldingGroup.add(barW);

      const barE = new THREE.Mesh(barGeoZ, poleMat);
      barE.position.set(hw, y, 0);
      scaffoldingGroup.add(barE);
    });

    const scafBeaconGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const scafBeaconMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const scafBeacon = new THREE.Mesh(scafBeaconGeo, scafBeaconMat);
    scafBeacon.name = 'scaffoldingBeacon';
    scafBeacon.position.set(hw, scafHeight + 0.05, hd);
    scaffoldingGroup.add(scafBeacon);

    siteGroup.add(scaffoldingGroup);

    // ----------------------------------------
    // 2. 施工塔式起重吊臂 (Construction Tower Crane)
    // ----------------------------------------
    const craneGroup = new THREE.Group();
    craneGroup.name = 'ConstructionCraneGroup';

    // 吊臂立足點：置於庭院後側角落 (內部邊界內)，不遮擋正門路面與入戶通道
    const baseX = hw - 0.14;
    const baseZ = -hd + 0.14;
    craneGroup.position.set(baseX, 0, baseZ);

    const craneYellowMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.65,
      roughness: 0.35,
    });
    const craneDarkMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.3,
    });
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.9,
      metalness: 0.1,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.25,
    });
    const beamRedMat = new THREE.MeshStandardMaterial({
      color: 0xc2410c, // 施工鋼構防鏽紅漆
      metalness: 0.7,
      roughness: 0.4,
    });

    // 塔身高於鷹架與屋頂 (約 1.35m ~ 1.7m)
    const mastHeight = Math.max(1.35, 0.95 + Math.max(w, d) * 0.32);
    const mastW = 0.08;
    const mhw = mastW / 2;

    // 地基鋼板
    const basePlateGeo = new THREE.BoxGeometry(0.16, 0.02, 0.16);
    const basePlate = new THREE.Mesh(basePlateGeo, craneDarkMat);
    basePlate.position.y = 0.01;
    craneGroup.add(basePlate);

    // 塔身四根立柱 (Vertical Corner Posts)
    const mastPostGeo = new THREE.CylinderGeometry(0.006, 0.006, mastHeight, 6);
    [
      [-mhw, -mhw],
      [mhw, -mhw],
      [-mhw, mhw],
      [mhw, mhw],
    ].forEach(([px, pz]) => {
      const post = new THREE.Mesh(mastPostGeo, craneYellowMat);
      post.position.set(px, mastHeight / 2, pz);
      craneGroup.add(post);
    });

    // 塔身水平橫桿與對角斜撐腹桿 (Mast Lattice Truss Bracing)
    const rungLevels = Math.floor(mastHeight / 0.18);
    const hBarGeoX = new THREE.BoxGeometry(mastW, 0.006, 0.006);
    const hBarGeoZ = new THREE.BoxGeometry(0.006, 0.006, mastW);
    const diagGeo = new THREE.BoxGeometry(Math.hypot(mastW, 0.18), 0.005, 0.005);

    for (let i = 1; i <= rungLevels; i++) {
      const ry = i * 0.18;
      if (ry >= mastHeight - 0.05) break;

      const barN = new THREE.Mesh(hBarGeoX, craneYellowMat);
      barN.position.set(0, ry, -mhw);
      craneGroup.add(barN);

      const barS = new THREE.Mesh(hBarGeoX, craneYellowMat);
      barS.position.set(0, ry, mhw);
      craneGroup.add(barS);

      const barW = new THREE.Mesh(hBarGeoZ, craneYellowMat);
      barW.position.set(-mhw, ry, 0);
      craneGroup.add(barW);

      const barE = new THREE.Mesh(hBarGeoZ, craneYellowMat);
      barE.position.set(mhw, ry, 0);
      craneGroup.add(barE);

      const diag1 = new THREE.Mesh(diagGeo, craneYellowMat);
      diag1.position.set(0, ry - 0.09, mhw);
      diag1.rotation.z = Math.atan2(0.18, mastW);
      craneGroup.add(diag1);
    }

    // ----------------------------------------
    // 3. 迴轉上部構造 (Slewing Arm Assembly)
    // ----------------------------------------
    const slewArm = new THREE.Group();
    slewArm.name = 'CraneSlewArm';
    slewArm.position.set(0, mastHeight, 0);

    // 迴轉支承座 (Turntable)
    const turnTableGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12);
    const turnTable = new THREE.Mesh(turnTableGeo, craneDarkMat);
    turnTable.position.y = 0.015;
    slewArm.add(turnTable);

    // 駕駛室 (Operator Cabin)
    const cabGroup = new THREE.Group();
    const cabBodyGeo = new THREE.BoxGeometry(0.08, 0.11, 0.10);
    const cabBody = new THREE.Mesh(cabBodyGeo, craneYellowMat);
    cabGroup.add(cabBody);

    const cabWindowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.75,
    });
    const cabWinGeo = new THREE.BoxGeometry(0.082, 0.06, 0.06);
    const cabWin = new THREE.Mesh(cabWinGeo, cabWindowMat);
    cabWin.position.set(0, 0.015, 0.025);
    cabGroup.add(cabWin);

    cabGroup.position.set(0.06, 0.06, 0.03);
    slewArm.add(cabGroup);

    // 塔頂尖架 (A-Frame Tower Apex)
    const apexHeight = 0.28;
    const apexGroup = new THREE.Group();
    const apexLegGeo = new THREE.CylinderGeometry(0.005, 0.005, Math.hypot(mhw, apexHeight), 6);

    [
      [-mhw, -mhw],
      [mhw, -mhw],
      [-mhw, mhw],
      [mhw, mhw],
    ].forEach(([px, pz]) => {
      const leg = new THREE.Mesh(apexLegGeo, craneYellowMat);
      leg.position.set(px / 2, apexHeight / 2, pz / 2);
      leg.rotation.z = (px > 0 ? -1 : 1) * Math.atan2(mhw, apexHeight);
      leg.rotation.x = (pz > 0 ? 1 : -1) * Math.atan2(mhw, apexHeight);
      apexGroup.add(leg);
    });

    // 塔頂航空警示閃爍燈 (Top Aviation Beacon)
    const beaconGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, apexHeight + 0.015, 0);
    apexGroup.add(beacon);

    slewArm.add(apexGroup);

    // ----------------------------------------
    // 4. 平衡臂與水泥配重塊 (Counter-Jib & Weights)
    // ----------------------------------------
    const counterJibLen = 0.42;
    const counterJib = new THREE.Group();

    const cBeamGeo = new THREE.BoxGeometry(counterJibLen, 0.015, 0.06);
    const cBeam = new THREE.Mesh(cBeamGeo, craneYellowMat);
    cBeam.position.set(-counterJibLen / 2, 0.025, 0);
    counterJib.add(cBeam);

    const weightGeo = new THREE.BoxGeometry(0.12, 0.11, 0.08);
    const weight = new THREE.Mesh(weightGeo, concreteMat);
    weight.position.set(-counterJibLen + 0.06, 0.06, 0);
    counterJib.add(weight);

    const cTieGeo = new THREE.CylinderGeometry(0.003, 0.003, Math.hypot(counterJibLen * 0.8, apexHeight), 4);
    const cTie = new THREE.Mesh(cTieGeo, cableMat);
    cTie.position.set(-counterJibLen * 0.4, apexHeight / 2 + 0.025, 0);
    cTie.rotation.z = Math.atan2(counterJibLen * 0.8, apexHeight);
    counterJib.add(cTie);

    slewArm.add(counterJib);

    // ----------------------------------------
    // 5. 起重臂作業工作臂 (Main Jib Lattice Boom)
    // ----------------------------------------
    const jibLength = Math.max(1.15, Math.hypot(w, d) * 0.86);
    const mainJib = new THREE.Group();

    const railGeo = new THREE.BoxGeometry(jibLength, 0.008, 0.008);
    const botRail1 = new THREE.Mesh(railGeo, craneYellowMat);
    botRail1.position.set(jibLength / 2, 0.01, -0.025);
    mainJib.add(botRail1);

    const botRail2 = new THREE.Mesh(railGeo, craneYellowMat);
    botRail2.position.set(jibLength / 2, 0.01, 0.025);
    mainJib.add(botRail2);

    const topRail = new THREE.Mesh(railGeo, craneYellowMat);
    topRail.position.set(jibLength / 2, 0.06, 0);
    mainJib.add(topRail);

    const segCount = Math.floor(jibLength / 0.15);
    for (let i = 1; i <= segCount; i++) {
      const jx = i * 0.15;
      const xBar = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.05), craneYellowMat);
      xBar.position.set(jx, 0.01, 0);
      mainJib.add(xBar);

      const vBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.005), craneYellowMat);
      vBar1.position.set(jx, 0.035, -0.012);
      vBar1.rotation.z = 0.1;
      mainJib.add(vBar1);

      const vBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.005), craneYellowMat);
      vBar2.position.set(jx, 0.035, 0.012);
      vBar2.rotation.z = -0.1;
      mainJib.add(vBar2);
    }

    // 主起重臂拉索 (Main Jib Tie Cables from Apex)
    const tieDist1 = jibLength * 0.45;
    const tie1Geo = new THREE.CylinderGeometry(0.003, 0.003, Math.hypot(tieDist1, apexHeight), 4);
    const tie1 = new THREE.Mesh(tie1Geo, cableMat);
    tie1.position.set(tieDist1 / 2, apexHeight / 2 + 0.025, 0);
    tie1.rotation.z = -Math.atan2(tieDist1, apexHeight);
    mainJib.add(tie1);

    const tieDist2 = jibLength * 0.78;
    const tie2Geo = new THREE.CylinderGeometry(0.003, 0.003, Math.hypot(tieDist2, apexHeight), 4);
    const tie2 = new THREE.Mesh(tie2Geo, cableMat);
    tie2.position.set(tieDist2 / 2, apexHeight / 2 + 0.025, 0);
    tie2.rotation.z = -Math.atan2(tieDist2, apexHeight);
    mainJib.add(tie2);

    slewArm.add(mainJib);

    // ----------------------------------------
    // 6. 變幅載重小車 (Trolley)
    // ----------------------------------------
    const trolley = new THREE.Group();
    trolley.name = 'CraneTrolley';
    const trolleyBodyGeo = new THREE.BoxGeometry(0.06, 0.02, 0.07);
    const trolleyBody = new THREE.Mesh(trolleyBodyGeo, craneDarkMat);
    trolley.add(trolleyBody);
    trolley.position.set(jibLength * 0.5, 0.005, 0);
    slewArm.add(trolley);

    // ----------------------------------------
    // 7. 起升鋼纜、吊鉤與吊掛鋼樑 (Cable, Hook & Cargo)
    // ----------------------------------------
    const cableGeo = new THREE.CylinderGeometry(0.002, 0.002, 1.0, 4);
    const cable = new THREE.Mesh(cableGeo, cableMat);
    cable.name = 'CraneCable';
    slewArm.add(cable);

    const hookAndCargo = new THREE.Group();
    hookAndCargo.name = 'CraneHookAndCargo';

    const blockGeo = new THREE.BoxGeometry(0.035, 0.045, 0.03);
    const hookBlock = new THREE.Mesh(blockGeo, craneYellowMat);
    hookAndCargo.add(hookBlock);

    const hookRingGeo = new THREE.TorusGeometry(0.016, 0.004, 6, 12, Math.PI * 1.3);
    const hookRing = new THREE.Mesh(hookRingGeo, craneDarkMat);
    hookRing.position.set(0, -0.03, 0);
    hookRing.rotation.z = -Math.PI * 0.65;
    hookAndCargo.add(hookRing);

    // 鋼索索具
    const sling1Geo = new THREE.CylinderGeometry(0.0015, 0.0015, 0.11, 4);
    const sling1 = new THREE.Mesh(sling1Geo, cableMat);
    sling1.position.set(-0.08, -0.075, 0);
    sling1.rotation.z = 0.55;
    hookAndCargo.add(sling1);

    const sling2 = new THREE.Mesh(sling1Geo, cableMat);
    sling2.position.set(0.08, -0.075, 0);
    sling2.rotation.z = -0.55;
    hookAndCargo.add(sling2);

    // 吊運中的兩根大型建築工字鋼樑
    const beamLength = 0.42;
    const beamGroup = new THREE.Group();
    beamGroup.position.set(0, -0.13, 0);

    [-0.022, 0.022].forEach((bz) => {
      const web = new THREE.Mesh(new THREE.BoxGeometry(beamLength, 0.035, 0.006), beamRedMat);
      web.position.set(0, 0, bz);
      beamGroup.add(web);

      const flangeT = new THREE.Mesh(new THREE.BoxGeometry(beamLength, 0.006, 0.022), beamRedMat);
      flangeT.position.set(0, 0.017, bz);
      beamGroup.add(flangeT);

      const flangeB = new THREE.Mesh(new THREE.BoxGeometry(beamLength, 0.006, 0.022), beamRedMat);
      flangeB.position.set(0, -0.017, bz);
      beamGroup.add(flangeB);
    });

    [-0.12, 0.12].forEach((sx) => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.045, 0.07), craneDarkMat);
      strap.position.set(sx, 0, 0);
      beamGroup.add(strap);
    });

    hookAndCargo.add(beamGroup);
    slewArm.add(hookAndCargo);

    craneGroup.add(slewArm);
    siteGroup.add(craneGroup);

    // 初始朝向：吊臂指向建築中心
    const baseAngle = Math.atan2(-baseZ, -baseX);
    slewArm.rotation.y = baseAngle;

    return {
      container: siteGroup,
      craneRefs: {
        slewArm,
        trolley,
        cable,
        hookAndCargo,
        beacon,
        baseAngle,
        jibLength,
        mastHeight,
        animTimer: 0,
      },
    };
  }

  // ==========================================
  // 更新循環與完工開車遷入
  // ==========================================

  public update(deltaTime: number, isPaused: boolean = false): void {
    if (isPaused || deltaTime <= 0) return;

    for (const building of this.buildings.values()) {
      if (building.status === 'constructing') {
        building.constructionProgress += deltaTime / building.constructionDuration;

        const prog = Math.min(1.0, building.constructionProgress);
        building.buildingMesh.position.y = (prog - 1.0) * 0.4;
        building.buildingMesh.scale.set(1.0, Math.max(0.05, prog), 1.0);

        // 驅動施工吊臂作業動態動畫 (迴轉、變幅、起升、微晃、警示燈)
        if (building.craneRefs) {
          const refs = building.craneRefs;
          refs.animTimer += deltaTime;
          const t = refs.animTimer;

          // 1. 吊臂迴轉作業：在基礎角周圍平滑往復掃動 (以遊戲時間推進)
          const swingAngle = Math.sin(t * 0.45) * 0.72 + Math.sin(t * 0.9) * 0.18;
          refs.slewArm.rotation.y = refs.baseAngle + swingAngle;

          // 2. 變幅小車沿臂前後滑移
          const minReach = refs.jibLength * 0.35;
          const maxReach = refs.jibLength * 0.82;
          const reachFactor = (Math.sin(t * 0.6 + 1.2) + 1) * 0.5;
          const currentReach = minReach + (maxReach - minReach) * reachFactor;
          refs.trolley.position.x = currentReach;

          // 3. 鋼纜起升與吊鉤升降
          const minDrop = refs.mastHeight * 0.35;
          const maxDrop = refs.mastHeight * 0.75;
          const dropFactor = (Math.sin(t * 0.75 + 2.5) + 1) * 0.5;
          const currentDrop = minDrop + (maxDrop - minDrop) * dropFactor;

          refs.cable.scale.set(1, currentDrop, 1);
          refs.cable.position.set(currentReach, -currentDrop / 2, 0);
          refs.hookAndCargo.position.set(currentReach, -currentDrop, 0);

          // 4. 吊掛鋼樑隨動微晃
          refs.hookAndCargo.rotation.z = Math.sin(t * 1.5) * 0.07;
          refs.hookAndCargo.rotation.x = Math.cos(t * 1.2) * 0.05;

          // 5. 塔頂航空警示紅燈以遊戲時間閃爍
          const isBlinkOn = Math.floor(t * 3.0) % 2 === 0;
          (refs.beacon.material as THREE.MeshBasicMaterial).color.setHex(isBlinkOn ? 0xef4444 : 0x450a0a);

          // 6. 鷹架警示燈亦以遊戲時間平滑呼吸閃爍
          const beacon = building.scaffoldingGroup.getObjectByName('scaffoldingBeacon') as THREE.Mesh;
          if (beacon && beacon.material instanceof THREE.MeshBasicMaterial) {
            const blink = (Math.sin(t * 5.0) + 1) * 0.5;
            beacon.material.color.setRGB(1.0, 0.8 * blink, 0.1);
          }
        }

        if (building.constructionProgress >= 1.0) {
          this.completeConstruction(building);
        }
      }
    }

    this.updateTooltipContent();
  }

  /**
   * 建築完工：移除鷹架，並自外部公路派遣市民車輛開車進入城市抵達家門
   */
  private completeConstruction(building: PlacedBuilding): void {
    building.status = 'completed';
    building.constructionProgress = 1.0;

    building.buildingMesh.position.y = 0;
    building.buildingMesh.scale.set(1.0, 1.0, 1.0);
    building.group.remove(building.scaffoldingGroup);

    // 觸發市民開車自邊界公路進入城市，遷入已登記之首批居民
    this.dispatchCitizenVehicle(building, building.registeredResidents);
  }

  /**
   * 派遣市民車輛自外部邊界公路開車進入城市直達住處家門
   * @param arrivingCount 本批抵達遷入之市民人數
   */
  private dispatchCitizenVehicle(building: PlacedBuilding, arrivingCount: number): void {
    const roadTile = this.roadNetwork.getTile(building.targetRoadTileKey);
    if (!roadTile || roadTile.lanes.length === 0) {
      building.moveInStatus = 'waitingForRoad';
      return;
    }

    const allLanes = this.roadNetwork.getAllLanes();
    const westEntry = this.roadNetwork.getHighwayWestEntryLane();
    const eastEntry = this.roadNetwork.getHighwayEastEntryLane();

    let bestPath: PathResult | null = null;
    let bestDistToHouse = Infinity;

    // 檢驗該路塊上的所有車道，找出可自外部公路抵達且離正門最近的有效路線
    for (const lane of roadTile.lanes) {
      let lanePath: PathResult | null = null;
      if (westEntry) {
        const pW = Pathfinding.findShortestPath(westEntry.id, lane.id, allLanes);
        if (pW && pW.routeWaypoints && pW.routeWaypoints.length >= 2) {
          lanePath = pW;
        }
      }
      if (eastEntry) {
        const pE = Pathfinding.findShortestPath(eastEntry.id, lane.id, allLanes);
        if (pE && pE.routeWaypoints && pE.routeWaypoints.length >= 2) {
          if (!lanePath || pE.totalDistance < lanePath.totalDistance) {
            lanePath = pE;
          }
        }
      }

      if (lanePath) {
        const distToHouse = lane.centerPoint.distanceTo(building.frontWorldPos);
        if (!bestPath || distToHouse < bestDistToHouse) {
          bestPath = lanePath;
          bestDistToHouse = distToHouse;
        }
      }
    }

    if (!bestPath) {
      building.moveInStatus = 'waitingForRoad';
      return;
    }

    building.moveInStatus = 'enRoute';
    const carColors = [0x1d4ed8, 0x0f172a, 0x94a3b8, 0x047857, 0xb91c1c];
    const chosenColor = carColors[Math.floor(Math.random() * carColors.length)];

    this.vehicleManager.spawnMovingInVehicle(bestPath, chosenColor, () => {
      // 開車抵達家門前消失，房內人數正式生效 (增加本次遷入之市民人數)
      building.currentOccupants += arrivingCount;
      building.moveInStatus = 'arrived';
    });
  }

  // ==========================================
  // 懸停資訊卡片與互動 (規則 5、7)
  // ==========================================

  private createTooltipElement(): HTMLDivElement {
    const tip = document.createElement('div');
    tip.id = 'building-hover-tooltip';
    tip.style.cssText = `
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 8px;
      padding: 10px 14px;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      min-width: 190px;
    `;
    document.body.appendChild(tip);
    return tip;
  }

  private bindHoverEvents(): void {
    this.domElement.addEventListener('mousemove', (e: MouseEvent) => {
      this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

      this.tooltipElement.style.left = `${e.clientX + 14}px`;
      this.tooltipElement.style.top = `${e.clientY + 14}px`;

      this.checkBuildingHover();
    });

    this.domElement.addEventListener('mouseleave', () => {
      this.hoveredBuilding = null;
      this.tooltipElement.style.display = 'none';
    });
  }

  private checkBuildingHover(): void {
    this.raycaster.setFromCamera(this.mousePos, this.camera);

    const candidates: THREE.Object3D[] = [];
    for (const b of this.buildings.values()) {
      candidates.push(b.group);
    }

    const intersects = this.raycaster.intersectObjects(candidates, true);
    if (intersects.length > 0) {
      let cur: THREE.Object3D | null = intersects[0].object;
      let foundId: string | null = null;
      while (cur) {
        if (cur.userData && cur.userData.buildingId) {
          foundId = cur.userData.buildingId;
          break;
        }
        cur = cur.parent;
      }

      if (foundId && this.buildings.has(foundId)) {
        this.hoveredBuilding = this.buildings.get(foundId)!;
        this.tooltipElement.style.display = 'block';
        return;
      }
    }

    this.hoveredBuilding = null;
    this.tooltipElement.style.display = 'none';
  }

  private updateTooltipContent(): void {
    if (!this.hoveredBuilding) return;

    const b = this.hoveredBuilding;
    const meta = b.metadata;

    if (b.status === 'constructing') {
      const percent = Math.min(100, Math.floor(b.constructionProgress * 100));
      const remaining = Math.max(0, b.constructionDuration * (1.0 - b.constructionProgress));

      this.tooltipElement.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <span>🏗️</span> ${meta.name} (建造中 · 吊臂作業中)
        </div>
        <div style="margin: 6px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #cbd5e1; margin-bottom: 2px;">
            <span>建造進度</span>
            <span style="color: #38bdf8; font-weight: bold;">${percent}%</span>
          </div>
          <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
            <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #38bdf8); border-radius: 3px;"></div>
          </div>
        </div>
        <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span>剩餘時間:</span>
          <span style="color: #f1f5f9;">${remaining.toFixed(1)} 秒</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; margin-top: 2px;">
          <span>規劃入住人數:</span>
          <span style="color: #4ade80;">${b.registeredResidents} 人 (房型上限 ${meta.capacity}人)</span>
        </div>
      `;
    } else {
      const coLivingText = b.isCoLiving ? '🤝 與人合居' : '👤 獨立自住';
      const moveInBadge = b.currentOccupants > 0
        ? '<span style="color: #4ade80;">● 已入住</span>'
        : (b.moveInStatus === 'waitingForRoad'
            ? '<span style="color: #ef4444;">⚠️ 等待聯外道路</span>'
            : '<span style="color: #38bdf8;">🚗 遷入中...</span>');

      this.tooltipElement.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: #38bdf8; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
          <span>🏠 ${meta.name}</span>
          ${moveInBadge}
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span style="color: #94a3b8;">總登記居住者:</span>
          <span style="color: #fbbf24; font-weight: bold;">${b.registeredResidents} 人 <span style="font-size: 10px; color: #64748b;">(上限 ${meta.capacity}人)</span></span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span style="color: #94a3b8;">現房內人數:</span>
          <span style="color: #4ade80; font-weight: bold;">${b.currentOccupants} 人</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span style="color: #94a3b8;">居住模式:</span>
          <span style="color: #cbd5e1;">${coLivingText}</span>
        </div>
        <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span>佔地規格:</span>
          <span style="color: #cbd5e1;">面寬 ${meta.frontageWidth}m × 縱深 ${meta.lotDepth}m</span>
        </div>
        <div style="font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span>正面朝向:</span>
          <span style="color: #22c55e;">正門面朝馬路</span>
        </div>
      `;
    }
  }

  // ==========================================
  // 外部讀取與除錯介面
  // ==========================================

  public getAllBuildings(): PlacedBuilding[] {
    return Array.from(this.buildings.values());
  }

  public getTotalPopulation(): number {
    let total = 0;
    for (const b of this.buildings.values()) {
      total += b.currentOccupants;
    }
    return total;
  }

  public getDemandStats(): { generated: number; matched: number; lost: number } {
    return {
      generated: this.totalDemandGenerated,
      matched: this.totalMatchedSuccess,
      lost: this.totalDemandLost,
    };
  }

  public getDemandQueue(): HousingDemand[] {
    return this.demandQueue;
  }

  public clearDemandQueue(): void {
    this.demandQueue = [];
  }

  public getLatestMatchingResult(): MatchingResult | null {
    return this.latestMatchingResult;
  }
}
