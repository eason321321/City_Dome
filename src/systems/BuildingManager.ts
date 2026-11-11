import * as THREE from 'three';
import { BuildingModelFactory, BuildingMetadata } from '../rendering/BuildingModelFactory';
import { ZoningManager, ZoneType } from './ZoningManager';
import { RoadNetwork, DirectedLane } from './RoadNetwork';
import { Pathfinding, PathResult, RouteWaypoint } from './Pathfinding';
import { PedestrianNetwork, PedestrianWaypoint } from './PedestrianNetwork';
import { VehicleManager } from '../simulation/VehicleManager';
import { ParkingManager, CurbsideSpot } from '../simulation/ParkingManager';
import { CitizenModelFactory } from '../rendering/CitizenModelFactory';
import { VehicleModelFactory } from '../rendering/VehicleModelFactory';

export type VehicleMoveInSource = 'construction' | 'merge';
export type VehicleStatus = 'available' | 'in_use' | 'en_route_move_in';
export type TravelMode = 'drive' | 'walk' | 'transit';
export type TransitPreference = 'DriveOnly' | 'PreferTransit' | 'WalkIfClose';
export type CitizenActivityState = 'AtHome' | 'Traveling' | 'CommutingToWork' | 'AtWork' | 'Leisure';

export interface ResidenceVehicle {
  id: string;                         // 車輛唯一識別碼 (例: veh_bld_1_1)
  buildingId: string;                 // 所屬住宅建築 ID
  source: VehicleMoveInSource;        // 來源：'construction' (建屋遷入) | 'merge' (併入遷入)
  sourceLabel: string;                // 易讀標籤：'建屋遷入' | '併入遷入'
  color: number;                      // 車身烤漆顏色 HEX
  colorName: string;                  // 車身顏色名稱 (例: '蔚藍色', '曜石黑')
  status: VehicleStatus;              // 'available' (住宅可用) | 'in_use' (市民出行中) | 'en_route_move_in' (初次遷入在途)
  parkedCarId?: string;               // 停放在 ParkingManager 中的 ParkedCar ID
  parkedSpot?: CurbsideSpot;          // 停放的路側位置
  currentDriverCitizenId?: string;    // 當前借出駕駛的市民 ID
  currentDriverName?: string;         // 當前借出駕駛的市民姓名
  mesh?: THREE.Group;                 // 3D 模型實體參照
  registeredAt: number;               // 登記時間戳記
}

export interface CitizenProfile {
  id: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  homeBuildingId: string;
  workBuildingId?: string;               // 若已入職，其工作場所工廠之建築 ID
  transitPreference: TransitPreference;  // 通勤出行偏好
  currentActivity: CitizenActivityState; // 當前活動狀態 (預設 'AtHome')
  currentVehicleId?: string;            // 若當前出行駕駛中，所使用之住宅車輛 ID
  currentTravelMode?: TravelMode;       // 當前出行交通方式 ('drive' | 'walk' | 'transit')
}

export interface TravelDecisionOptions {
  destination?: THREE.Vector3;
  distanceMeters?: number;           // 預計出行距離 (米)
  purpose?: string;                  // 出行目的 (如 '上班', '休閒購物')
  forceMode?: TravelMode;            // 強制指定方式 (供測試與控制)
}

export interface TravelDecisionResult {
  success: boolean;
  citizenId: string;
  citizenName: string;
  citizenAge: number;
  buildingId: string;
  buildingName: string;
  selectedMode: TravelMode;          // 最終決策之出行方式
  selectedVehicle?: ResidenceVehicle;// 若選擇開車，所使用的住宅名下車輛
  canDrive: boolean;                 // 是否具備開車資格 (年齡 >= 18 且住宅名下有閒置車輛)
  availableVehiclesCount: number;    // 住宅名下目前可用車輛數
  totalVehiclesCount: number;        // 住宅名下總登記車輛數
  reason: string;                    // 決策詳細原因說明
  timestamp: number;
}

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
  currentOccupants: number;         // 當前房內/廠內人數
  employedWorkerIds?: string[];     // 工廠入職市民 ID 清單 (入職人數 = employedWorkerIds.length)
  isCoLiving: boolean;              // 是否合居 (true: 與人合居, false: 自己住)
  moveInStatus: 'none' | 'enRoute' | 'arrived' | 'waitingForRoad';
  residents: CitizenProfile[];      // 入住市民詳細個資清單
  vehicles: ResidenceVehicle[];     // 登記於此住宅之名下車輛清單 (建屋遷入與併入遷入)
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

export interface MovingInPedestrian {
  id: string;
  buildingId: string;
  profile: CitizenProfile;
  mesh?: THREE.Group;
  spawnDelay: number;
  currentWaypointIndex: number;
  waypoints: THREE.Vector3[];
  routeWaypoints?: PedestrianWaypoint[];
  isWaitingLight?: boolean;
  isCrossingCrosswalk?: boolean;
  crossingIntersectionKey?: string;
  crossingArm?: 'N' | 'S' | 'E' | 'W';
  speed: number;
  walkTimer: number;
  isAlighted: boolean;
  hasEnteredHouse: boolean;
  onArrivedDestination?: () => void;
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
  private parkingManager: ParkingManager | null = null;

  // 格位尺寸與建物縮放 (配合 0.5m x 0.5m 小格子，建築物底面積為原先 1/4)
  private readonly CELL_SIZE: number = 0.5;

  // 建築群組與資料儲存
  private buildingsContainer: THREE.Group;
  private buildings: Map<string, PlacedBuilding> = new Map();
  private occupiedCells: Set<string> = new Set();
  private nextBuildingId: number = 1;

  // 市民行人生命週期與走路動線管理
  private activePedestrians: MovingInPedestrian[] = [];
  private pedestrianContainer: THREE.Group;
  private nextCitizenId: number = 1;
  private pedestrianNetwork: PedestrianNetwork;

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
    this.pedestrianNetwork = roadNetwork.getPedestrianNetwork();

    this.buildingsContainer = new THREE.Group();
    this.buildingsContainer.name = 'BuildingsContainer';
    this.scene.add(this.buildingsContainer);

    this.pedestrianContainer = new THREE.Group();
    this.pedestrianContainer.name = 'PedestrianContainer';
    this.scene.add(this.pedestrianContainer);

    this.tooltipElement = this.createTooltipElement();
    this.bindHoverEvents();
  }

  public setParkingManager(parkingManager: ParkingManager): void {
    this.parkingManager = parkingManager;
  }

  public getPedestrianNetwork(): PedestrianNetwork {
    return this.pedestrianNetwork;
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

    // 房屋已完工，立即派遣市民開車自邊界公路前往家門，車到消失時正式增加入住人數 (來源：併入遷入)
    this.dispatchCitizenVehicle(chosenBuilding, demand.peopleCount, 'merge');
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
    const targetZoneType: ZoneType =
      meta.category === 'Industrial_Low' ? 'Industrial' : 'Residential';

    for (const cell of cells.values()) {
      if (cell.zoneType !== targetZoneType || this.occupiedCells.has(cell.key)) {
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
    const targetZoneType: ZoneType =
      meta.category === 'Industrial_Low' ? 'Industrial' : 'Residential';

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
            if (!c || c.zoneType !== targetZoneType) return false;
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
            if (!c || c.zoneType !== targetZoneType) return false;
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
            if (!c || c.zoneType !== targetZoneType) return false;
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
            if (!c || c.zoneType !== targetZoneType) return false;
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
      residents: [],
      vehicles: [],
      employedWorkerIds: [],
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

    // 更新正在下車與走入房內的市民動態與走路動畫
    for (let i = this.activePedestrians.length - 1; i >= 0; i--) {
      const ped = this.activePedestrians[i];

      // 階段 1：等待交錯下車時間
      if (!ped.isAlighted) {
        ped.spawnDelay -= deltaTime;
        if (ped.spawnDelay <= 0) {
          ped.isAlighted = true;
          // 下車時生成市民模型，以市民基本資料之性別決定性別模型
          const mesh = CitizenModelFactory.createCitizen({
            gender: ped.profile.gender,
            variant: Math.floor(Math.random() * 3),
          });
          mesh.position.copy(ped.waypoints[0]);
          this.pedestrianContainer.add(mesh);
          ped.mesh = mesh;
        }
        continue;
      }

      // 階段 2：若已進入屋內或模型不存在，清理該市民
      if (ped.hasEnteredHouse || !ped.mesh) {
        this.activePedestrians.splice(i, 1);
        continue;
      }

      // 階段 3：驅動市民沿著航點序列步行走向房子
      const wps = ped.waypoints;
      if (ped.currentWaypointIndex < wps.length) {
        const targetPos = wps[ped.currentWaypointIndex];
        const targetWp = ped.routeWaypoints ? ped.routeWaypoints[ped.currentWaypointIndex] : null;

        // 號誌檢測：若行人即將踏上斑馬線（當前尚未進入該斑馬線穿越狀態，或是轉換至不同路口臂之斑馬線）
        if (targetWp && targetWp.isCrosswalk && (!ped.isCrossingCrosswalk || targetWp.crosswalkArm !== ped.crossingArm)) {
          const interKey = targetWp.intersectionKey;
          const signalPhase = targetWp.pedestrianSignal;
          if (interKey && signalPhase) {
            const inter = this.roadNetwork.getIntersection(interKey);
            if (inter) {
              const signal = inter.signalState[signalPhase];
              if (signal !== 'green') {
                // 行人號誌非綠燈（紅燈或黃燈）：在路緣石安全停等
                ped.isWaitingLight = true;
                ped.isCrossingCrosswalk = false;
                ped.crossingIntersectionKey = undefined;
                ped.crossingArm = undefined;
                CitizenModelFactory.resetCitizenPose(ped.mesh);
                const toTarget = new THREE.Vector3().subVectors(targetPos, ped.mesh.position);
                toTarget.y = 0;
                if (toTarget.lengthSq() > 0.001) {
                  ped.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z);
                }
                continue; // 停等不前進，不驅動走路動畫
              }
            }
          }

          // 行人號誌為綠燈：獲准踏上斑馬線開始過馬路
          ped.isWaitingLight = false;
          ped.isCrossingCrosswalk = true;
          ped.crossingIntersectionKey = targetWp.intersectionKey;
          ped.crossingArm = targetWp.crosswalkArm;
        } else if (targetWp && !targetWp.isCrosswalk && ped.isCrossingCrosswalk) {
          // 已完全穿過斑馬線並登上對側人行道：解除穿越馬路狀態
          ped.isCrossingCrosswalk = false;
          ped.crossingIntersectionKey = undefined;
          ped.crossingArm = undefined;
          ped.isWaitingLight = false;
        }

        const toTarget = new THREE.Vector3().subVectors(targetPos, ped.mesh.position);
        toTarget.y = 0; // 平面步行
        const dist = toTarget.length();
        const moveDist = ped.speed * deltaTime;

        if (dist <= moveDist + 0.01) {
          ped.mesh.position.copy(targetPos);
          ped.currentWaypointIndex++;
        } else {
          toTarget.normalize().multiplyScalar(moveDist);
          ped.mesh.position.add(toTarget);
          // 面朝前進方向
          const angle = Math.atan2(toTarget.x, toTarget.z);
          ped.mesh.rotation.y = angle;
        }

        // 驅動即時走路動畫 (男女通用關節擺動、反相擺臂、顛簸起伏與重心微搖)
        ped.walkTimer += deltaTime;
        CitizenModelFactory.animateCitizenWalk(ped.mesh, ped.walkTimer, 7.8, 1.0);
      } else {
        // 已走入屋內/廠內：市民正式進屋，解除過路狀態並移除 3D 模型
        ped.isCrossingCrosswalk = false;
        ped.crossingIntersectionKey = undefined;
        ped.crossingArm = undefined;
        ped.isWaitingLight = false;
        ped.hasEnteredHouse = true;
        if (ped.mesh) {
          this.pedestrianContainer.remove(ped.mesh);
          ped.mesh = undefined;
        }

        // 觸發抵達目的地之自訂回調 (如進入工廠就職或上車)
        if (ped.onArrivedDestination) {
          ped.onArrivedDestination();
        }

        // 檢查該棟建築是否所有市民皆已走入屋內
        const bld = this.buildings.get(ped.buildingId);
        if (bld) {
          const remainingForBuilding = this.activePedestrians.some(
            (p) => p.buildingId === bld.id && !p.hasEnteredHouse
          );
          if (!remainingForBuilding) {
            bld.moveInStatus = 'arrived';
          }
        }
        this.activePedestrians.splice(i, 1);
      }
    }

    this.updateTooltipContent();
  }

  /**
   * 隨機生成家庭或合居市民的基本個資（年齡、性別、姓名）
   */
  private generateCitizenProfiles(buildingId: string, count: number): CitizenProfile[] {
    const surnames = ['林', '陳', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '洪', '郭', '曾', '邱', '廖', '賴', '周'];
    const maleNames = ['冠廷', '宇軒', '柏翰', '宗翰', '承翰', '家豪', '志偉', '俊傑', '冠宇', '威廷', '哲瑋', '廷宇', '建宏', '柏睿', '翔宇', '子豪', '彥廷', '志明', '文傑', '俊宇'];
    const femaleNames = ['雅婷', '佳穎', '婷萱', '怡萱', '詩涵', '佩萱', '欣妤', '鈺婷', '雅筑', '怡君', '詠晴', '郁婷', '冠妤', '巧涵', '芝瑩', '心妤', '惠雯', '淑芬', '雅雯', '佳蓉'];

    const profiles: CitizenProfile[] = [];
    const isSingle = count === 1;

    for (let i = 0; i < count; i++) {
      let gender: 'male' | 'female';
      let age: number;

      if (isSingle) {
        gender = Math.random() < 0.5 ? 'male' : 'female';
        age = 22 + Math.floor(Math.random() * 32); // 22 ~ 53 歲單身青年/壯年
      } else if (i === 0) {
        gender = Math.random() < 0.5 ? 'male' : 'female';
        age = 27 + Math.floor(Math.random() * 20); // 27 ~ 46 歲戶長
      } else if (i === 1) {
        // 配偶或伴侶 (75% 機率為異性)
        gender = Math.random() < 0.75
          ? (profiles[0].gender === 'male' ? 'female' : 'male')
          : (Math.random() < 0.5 ? 'male' : 'female');
        age = Math.max(22, profiles[0].age + Math.floor(Math.random() * 7) - 3); // 年齡相近
      } else {
        // 第 3 人以上可能是小孩或家人
        gender = Math.random() < 0.5 ? 'male' : 'female';
        const isChild = Math.random() < 0.7;
        age = isChild ? (5 + Math.floor(Math.random() * 14)) : (20 + Math.floor(Math.random() * 25));
      }

      const surname = surnames[Math.floor(Math.random() * surnames.length)];
      const givenName = gender === 'male'
        ? maleNames[Math.floor(Math.random() * maleNames.length)]
        : femaleNames[Math.floor(Math.random() * femaleNames.length)];

      const isAdult = age >= 18;
      const transitPreference: TransitPreference = !isAdult
        ? (Math.random() < 0.6 ? 'WalkIfClose' : 'PreferTransit')
        : (Math.random() < 0.45 ? 'DriveOnly' : (Math.random() < 0.75 ? 'WalkIfClose' : 'PreferTransit'));

      profiles.push({
        id: `cit_${this.nextCitizenId++}`,
        name: `${surname}${givenName}`,
        gender,
        age,
        homeBuildingId: buildingId,
        transitPreference,
        currentActivity: 'AtHome',
      });
    }

    return profiles;
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

    // 觸發市民開車自邊界公路進入城市，遷入已登記之首批居民 (來源：建屋遷入)
    this.dispatchCitizenVehicle(building, building.registeredResidents, 'construction');
  }

  /**
   * 派遣市民車輛自外部邊界公路開車進入城市，尋找離家最近之停車位停車後下車步入家門
   * @param arrivingCount 本批抵達遷入之市民人數
   * @param source 遷入來源 ('construction' 建屋遷入 vs 'merge' 併入遷入)
   */
  private dispatchCitizenVehicle(
    building: PlacedBuilding,
    arrivingCount: number,
    source: VehicleMoveInSource = 'construction'
  ): void {
    // 1. 市民尋找離家最近之合法路邊停車位
    let parkingSpot: CurbsideSpot | null = null;
    if (this.parkingManager) {
      parkingSpot = this.parkingManager.findClosestAvailableSpot(
        building.frontWorldPos,
        building.targetRoadTileKey
      );
    }

    // 若找到車位，以車位所在路塊為導航目標；若無則以房屋正前方路塊為目標
    const targetTileKey = parkingSpot ? parkingSpot.tileKey : building.targetRoadTileKey;
    const roadTile = this.roadNetwork.getTile(targetTileKey);
    if (!roadTile || roadTile.lanes.length === 0) {
      building.moveInStatus = 'waitingForRoad';
      return;
    }

    const allLanes = this.roadNetwork.getAllLanes();
    const westEntry = this.roadNetwork.getHighwayWestEntryLane();
    const eastEntry = this.roadNetwork.getHighwayEastEntryLane();

    let bestPath: PathResult | null = null;

    // 若有車位，優先匹配停車側對應方位之車道 (確保車輛順行靠邊)
    // 西側路緣: 南向(S); 東側路緣: 北向(N); 北側路緣: 西向(W); 南側路緣: 東向(E)
    let candidateLanes = roadTile.lanes;
    if (parkingSpot) {
      const preferredDir = ParkingManager.getDirectionForSide(parkingSpot.side);
      const preferred = roadTile.lanes.filter((l) => l.direction === preferredDir);
      if (preferred.length > 0) {
        candidateLanes = preferred;
      }
    }

    const targetPos = parkingSpot ? parkingSpot.position : building.frontWorldPos;

    // 搜尋自特定聯外公路進口 (西側或東側) 到達目標車道之最佳路徑
    const findBestPathForEntry = (
      entry: DirectedLane | null
    ): { path: PathResult; isPreferred: boolean } | null => {
      if (!entry) return null;

      // 1. 優先嘗試候選車道 (順向停車側車道)
      let bestPrefPath: PathResult | null = null;
      let bestPrefDist = Infinity;
      for (const lane of candidateLanes) {
        const p = Pathfinding.findShortestPath(entry.id, lane.id, allLanes);
        if (p && p.routeWaypoints && p.routeWaypoints.length >= 2) {
          const dist = lane.centerPoint.distanceTo(targetPos);
          if (!bestPrefPath || dist < bestPrefDist) {
            bestPrefPath = p;
            bestPrefDist = dist;
          }
        }
      }
      if (bestPrefPath) {
        return { path: bestPrefPath, isPreferred: true };
      }

      // 2. 若首選車道無外聯路徑，退回嘗試該路塊之所有車道
      if (candidateLanes !== roadTile.lanes) {
        let bestFallbackPath: PathResult | null = null;
        let bestFallbackDist = Infinity;
        for (const lane of roadTile.lanes) {
          const p = Pathfinding.findShortestPath(entry.id, lane.id, allLanes);
          if (p && p.routeWaypoints && p.routeWaypoints.length >= 2) {
            const dist = lane.centerPoint.distanceTo(targetPos);
            if (!bestFallbackPath || dist < bestFallbackDist) {
              bestFallbackPath = p;
              bestFallbackDist = dist;
            }
          }
        }
        if (bestFallbackPath) {
          return { path: bestFallbackPath, isPreferred: false };
        }
      }

      return null;
    };

    const westResult = findBestPathForEntry(westEntry);
    const eastResult = findBestPathForEntry(eastEntry);

    // 依據西側與東側外聯可行性，實現雙向隨機進入 (各 50% 機率)
    if (westResult && eastResult) {
      if (westResult.isPreferred === eastResult.isPreferred) {
        // 兩側優先級相同 (皆為首選車道或皆為退回車道)，以 50% 機率隨機選自西側或東側進入
        bestPath = Math.random() < 0.5 ? westResult.path : eastResult.path;
      } else {
        // 若僅其中一側能停靠首選車道，以首選車道優先
        bestPath = westResult.isPreferred ? westResult.path : eastResult.path;
      }
    } else if (westResult) {
      bestPath = westResult.path;
    } else if (eastResult) {
      bestPath = eastResult.path;
    }

    if (!bestPath) {
      building.moveInStatus = 'waitingForRoad';
      return;
    }

    // 預約該停車位，避免後續其他車輛爭搶
    if (parkingSpot && this.parkingManager) {
      this.parkingManager.reserveSpot(parkingSpot);
    }

    // 將停車位座標加入導航路徑最後，使車輛順暢靠邊駛入車位
    if (parkingSpot) {
      bestPath = this.attachCurbsideArrival(bestPath, parkingSpot);
    }

    building.moveInStatus = 'enRoute';
    const carColors = [0x1d4ed8, 0x0f172a, 0x94a3b8, 0x047857, 0xb91c1c];
    const chosenColor = carColors[Math.floor(Math.random() * carColors.length)];

    // 建立住宅名下車輛登記記錄 (一間住宅可有一輛或多輛車，建屋遷入一輛，併入遷入一輛)
    const vehicleId = `veh_${building.id}_${building.vehicles.length + 1}`;
    const resVehicle: ResidenceVehicle = {
      id: vehicleId,
      buildingId: building.id,
      source,
      sourceLabel: source === 'construction' ? '建屋遷入' : '併入遷入',
      color: chosenColor,
      colorName: this.getVehicleColorName(chosenColor),
      status: 'en_route_move_in',
      registeredAt: Date.now(),
    };
    building.vehicles.push(resVehicle);

    this.vehicleManager.spawnMovingInVehicle(
      bestPath,
      chosenColor,
      (arrivedVehicle) => {
        // 1. 車輛成功停車：將其登記為路邊停放車輛 (保留 Mesh，永駐路側)
        if (parkingSpot && this.parkingManager) {
          const parkedCar = this.parkingManager.parkExistingCarMesh(
            arrivedVehicle.mesh,
            parkingSpot,
            chosenColor,
            building.id,
            resVehicle.id
          );
          resVehicle.parkedCarId = parkedCar.id;
          resVehicle.parkedSpot = parkingSpot;
          resVehicle.mesh = arrivedVehicle.mesh;
          resVehicle.status = 'available';
        } else {
          resVehicle.status = 'available';
          resVehicle.mesh = arrivedVehicle.mesh;
        }

        // 2. 車子成功停車時計算房內人數增加 (立即生效)
        building.currentOccupants += arrivingCount;

        // 3. 車子停車成功後生成車內所有市民基本資料 (年齡、性別、出行偏好)
        const newResidents = this.generateCitizenProfiles(building.id, arrivingCount);
        building.residents.push(...newResidents);

        // 4. 計算市民下車走入房內之人行動線
        const carParkPos = parkingSpot ? parkingSpot.position.clone() : building.frontWorldPos.clone();

        // 人行道下車側位置 (靠向人行道外側 0.18m)
        const sidewalkPos = carParkPos.clone();
        if (parkingSpot) {
          if (parkingSpot.side === 'west') sidewalkPos.x -= 0.18;
          else if (parkingSpot.side === 'east') sidewalkPos.x += 0.18;
          else if (parkingSpot.side === 'north') sidewalkPos.z -= 0.18;
          else if (parkingSpot.side === 'south') sidewalkPos.z += 0.18;
        }
        sidewalkPos.y = 0.07; // 立體高架人行道高度 0.07m

        const frontDoorPos = building.worldCenter.clone().lerp(building.frontWorldPos, 0.45);
        frontDoorPos.y = 0.04;

        const houseGatePos = building.frontWorldPos.clone();
        houseGatePos.y = 0.07;

        // 5. 如果車內有多個人，應當依序下車而非同時 (設定交錯延遲時間)
        for (let i = 0; i < newResidents.length; i++) {
          const res = newResidents[i];
          const pedestrian: MovingInPedestrian = {
            id: `ped_${res.id}`,
            buildingId: building.id,
            profile: res,
            spawnDelay: 0.35 + i * 1.1, // 每人相隔 1.1 秒依序下車
            currentWaypointIndex: 1, // 起始點即為第0點，朝向第1點出發
            waypoints: [
              sidewalkPos.clone(),
              houseGatePos.clone(),
              frontDoorPos.clone(),
            ],
            speed: 0.95 + Math.random() * 0.15, // 自然步速約 1.0 m/s
            walkTimer: Math.random() * 5.0,
            isAlighted: false,
            hasEnteredHouse: false,
          };
          this.activePedestrians.push(pedestrian);
        }
      },
      !!parkingSpot
    );
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
          <span>預計工期剩餘:</span>
          <span style="color: #f1f5f9;">約 ${Math.round(remaining * 6)} 遊戲分鐘 (${(remaining / 10).toFixed(1)} 遊戲小時)</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; margin-top: 2px;">
          <span>規劃入住人數:</span>
          <span style="color: #4ade80;">${b.registeredResidents} 人 (房型上限 ${meta.capacity}人)</span>
        </div>
      `;
    } else {
      if (meta.category === 'Industrial_Low') {
        const employedCount = b.employedWorkerIds ? b.employedWorkerIds.length : 0;
        const currentInside = b.currentOccupants;
        const statusColor = employedCount > 0 ? '#4ade80' : '#fbbf24';
        const statusText = employedCount >= meta.capacity ? '已額滿運轉中' : (employedCount > 0 ? '招募中·運轉中' : '缺工招募中');

        this.tooltipElement.innerHTML = `
          <div style="font-weight: bold; font-size: 13px; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
            <span>🏭 ${meta.name}</span>
            <span style="font-size: 10px; color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 1px 5px; border-radius: 4px;">低密度工業</span>
          </div>
          <div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 6px;">
            ${meta.description}
          </div>
          <div style="background: rgba(15, 23, 42, 0.55); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px;">
              <span style="color: #cbd5e1;">💼 入職人數:</span>
              <span style="color: #38bdf8; font-weight: bold;">${employedCount} / ${meta.capacity} 人</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
              <span style="color: #cbd5e1;">👥 現在內部人數:</span>
              <span style="color: #4ade80; font-weight: bold;">${currentInside} 人</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;">
            <span>建築佔地規格:</span>
            <span style="color: #f1f5f9;">面寬 ${meta.frontageWidth} 格 × 縱深 ${meta.lotDepth} 格 (${(meta.frontageWidth * 0.5).toFixed(1)}m × ${(meta.lotDepth * 0.5).toFixed(1)}m)</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-top: 2px;">
            <span>運營狀態:</span>
            <span style="color: ${statusColor};">● ${statusText}</span>
          </div>
        `;
        return;
      }

      const coLivingText = b.isCoLiving ? '🤝 與人合居' : '👤 獨立自住';
      const moveInBadge = b.currentOccupants > 0
        ? '<span style="color: #4ade80;">● 已入住</span>'
        : (b.moveInStatus === 'waitingForRoad'
            ? '<span style="color: #ef4444;">⚠️ 等待聯外道路</span>'
            : '<span style="color: #38bdf8;">🚗 遷入中...</span>');

      let vehiclesHtml = '';
      if (b.vehicles && b.vehicles.length > 0) {
        const listVehicles = b.vehicles.map((v, idx) => {
          const statusText = v.status === 'available'
            ? '<span style="color: #4ade80;">● 閒置可用</span>'
            : (v.status === 'in_use'
                ? `<span style="color: #fbbf24;">🚗 出行中 (${v.currentDriverName || '市民'})</span>`
                : '<span style="color: #38bdf8;">🚚 遷入中</span>');
          return `
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
              <span style="color: #cbd5e1;">🚗 #${idx + 1} [${v.sourceLabel} · ${v.colorName}]</span>
              <span>${statusText}</span>
            </div>
          `;
        }).join('');

        vehiclesHtml = `
          <div style="margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div style="color: #38bdf8; font-weight: bold; font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between;">
              <span>🚗 住宅名下車輛:</span>
              <span style="color: #f1f5f9; font-weight: normal;">共 ${b.vehicles.length} 輛</span>
            </div>
            ${listVehicles}
          </div>
        `;
      }

      let residentsHtml = '';
      if (b.residents && b.residents.length > 0) {
        const listItems = b.residents.map((r) => {
          const icon = r.gender === 'male' ? '👨' : '👩';
          const genderText = r.gender === 'male' ? '男' : '女';
          const prefText = r.transitPreference === 'DriveOnly'
            ? '偏好開車'
            : (r.transitPreference === 'WalkIfClose' ? '短途步行' : '大眾運輸');
          let actText = '<span style="color: #4ade80;">在家</span>';
          if (r.currentActivity !== 'AtHome') {
            if (r.currentTravelMode === 'drive') {
              const activePed = this.activePedestrians.find((p) => p.profile.id === r.id);
              if (activePed) {
                if (activePed.isWaitingLight) {
                  actText = '<span style="color: #ef4444; font-weight: bold;">🚦 停等紅綠燈 (走向車輛)</span>';
                } else if (activePed.isCrossingCrosswalk) {
                  actText = '<span style="color: #38bdf8; font-weight: bold;">🚸 穿越斑馬線 (走向車輛)</span>';
                } else {
                  actText = '<span style="color: #4ade80;">🚶 走向車輛中</span>';
                }
              } else {
                actText = '<span style="color: #fbbf24;">開車出行</span>';
              }
            } else {
              const activePed = this.activePedestrians.find((p) => p.profile.id === r.id);
              if (activePed?.isWaitingLight) {
                actText = '<span style="color: #ef4444; font-weight: bold;">🚶 停等紅綠燈</span>';
              } else if (activePed?.isCrossingCrosswalk) {
                actText = '<span style="color: #38bdf8; font-weight: bold;">🚸 穿越斑馬線</span>';
              } else {
                actText = '<span style="color: #38bdf8;">步行通勤</span>';
              }
            }
          }
          return `
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
              <span style="color: #f1f5f9;">${icon} ${r.name} <span style="font-size: 10px; color: #64748b;">(${prefText})</span></span>
              <span>${actText} · <span style="color: #94a3b8;">${genderText} ${r.age}歲</span></span>
            </div>
          `;
        }).join('');

        residentsHtml = `
          <div style="margin-top: 6px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div style="color: #38bdf8; font-weight: bold; font-size: 11px; margin-bottom: 3px;">👥 入住市民個資:</div>
            ${listItems}
          </div>
        `;
      }

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
        ${vehiclesHtml}
        ${residentsHtml}
      `;
    }
  }

  // ==========================================
  // 市民出行與車輛管理核心邏輯 (市民出行版本預備)
  // ==========================================

  /**
   * 取得指定住宅名下所有登記車輛清單
   */
  public getBuildingVehicles(buildingId: string): ResidenceVehicle[] {
    const b = this.buildings.get(buildingId);
    return b ? [...b.vehicles] : [];
  }

  /**
   * 取得指定住宅名下目前閒置可用之車輛清單
   */
  public getAvailableVehicles(buildingId: string): ResidenceVehicle[] {
    const b = this.buildings.get(buildingId);
    if (!b) return [];
    return b.vehicles.filter((v) => v.status === 'available');
  }

  /**
   * 住宅內市民出行方式決策 (核心邏輯)
   * 住宅內市民要出行時，可以選擇從該市民住宅之下的車輛作為出行的方式 (注意: 是方式，不一定要開車出發)
   * @param citizenId 要出行的市民 ID
   * @param options 可選出行設定 (目的地、距離、強制方式等)
   */
  public decideCitizenTravel(citizenId: string, options?: TravelDecisionOptions): TravelDecisionResult {
    let foundCitizen: CitizenProfile | null = null;
    let homeBuilding: PlacedBuilding | null = null;

    for (const b of this.buildings.values()) {
      const c = b.residents.find((r) => r.id === citizenId);
      if (c) {
        foundCitizen = c;
        homeBuilding = b;
        break;
      }
    }

    if (!foundCitizen || !homeBuilding) {
      return {
        success: false,
        citizenId,
        citizenName: '未知市民',
        citizenAge: 0,
        buildingId: '',
        buildingName: '',
        selectedMode: 'walk',
        canDrive: false,
        availableVehiclesCount: 0,
        totalVehiclesCount: 0,
        reason: '找不到該市民或其所屬住宅',
        timestamp: Date.now(),
      };
    }

    if (foundCitizen.currentActivity !== 'AtHome') {
      return {
        success: false,
        citizenId: foundCitizen.id,
        citizenName: foundCitizen.name,
        citizenAge: foundCitizen.age,
        buildingId: homeBuilding.id,
        buildingName: homeBuilding.metadata.name,
        selectedMode: foundCitizen.currentTravelMode || 'walk',
        canDrive: false,
        availableVehiclesCount: this.getAvailableVehicles(homeBuilding.id).length,
        totalVehiclesCount: homeBuilding.vehicles.length,
        reason: `市民目前已在出行狀態中 (${foundCitizen.currentActivity})，需返家後方能再次出發`,
        timestamp: Date.now(),
      };
    }

    const isAdult = foundCitizen.age >= 18;
    const availableVehicles = homeBuilding.vehicles.filter((v) => v.status === 'available');
    const totalVehicles = homeBuilding.vehicles.length;
    const canDrive = isAdult && availableVehicles.length > 0;

    let selectedMode: TravelMode = 'walk';
    let selectedVehicle: ResidenceVehicle | undefined = undefined;
    let reason = '';

    if (options?.forceMode) {
      if (options.forceMode === 'drive') {
        if (canDrive) {
          selectedMode = 'drive';
          selectedVehicle = availableVehicles[0];
          reason = `指定開車出行：成功選用住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 出發。`;
        } else if (!isAdult) {
          selectedMode = 'walk';
          reason = `指定開車失敗：市民未滿 18 歲 (${foundCitizen.age}歲)，無法駕車，改為步行出發。`;
        } else {
          selectedMode = 'walk';
          reason = `指定開車失敗：住宅名下 ${totalVehicles} 輛車目前皆在出行使用中，改為步行出發。`;
        }
      } else {
        selectedMode = options.forceMode;
        reason = `指定以 ${selectedMode === 'walk' ? '步行' : '大眾運輸'} 出行，住宅名下車輛保留在住宅旁。`;
      }
    } else {
      // 自主決策模式 (市民日常出行決策)
      if (canDrive) {
        // 住宅名下有車可用且市民年滿 18 歲，市民可選擇車輛作為出行方式之一
        if (foundCitizen.transitPreference === 'DriveOnly') {
          selectedMode = 'drive';
          selectedVehicle = availableVehicles[0];
          reason = `市民偏好開車，選擇使用住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 出行。`;
        } else if (foundCitizen.transitPreference === 'WalkIfClose') {
          const isClose = options?.distanceMeters !== undefined ? options.distanceMeters <= 20 : Math.random() < 0.5;
          if (isClose) {
            selectedMode = 'walk';
            reason = `市民偏好短途步行，雖住宅有名下車輛可用，評估後仍選擇步行出發。`;
          } else {
            selectedMode = 'drive';
            selectedVehicle = availableVehicles[0];
            reason = `出行距離較遠，市民決定開住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 出發。`;
          }
        } else {
          // PreferTransit
          const chooseTransit = Math.random() < 0.6;
          if (chooseTransit) {
            selectedMode = 'transit';
            reason = `市民偏好大眾運輸，保留住宅名下車輛，選擇搭乘公車/捷運出行。`;
          } else {
            selectedMode = 'drive';
            selectedVehicle = availableVehicles[0];
            reason = `市民考慮班次後，改選住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 開車出行。`;
          }
        }
      } else {
        // 無法開車 (未成年、無車、或車輛全數在用)
        if (!isAdult) {
          selectedMode = 'walk';
          reason = `市民年齡為 ${foundCitizen.age} 歲（未滿 18 歲），不可單獨駕車，選擇步行/大眾運輸出行。`;
        } else if (totalVehicles === 0) {
          selectedMode = 'walk';
          reason = `住宅名下尚無登記車輛，選擇步行出行。`;
        } else {
          selectedMode = 'walk';
          reason = `住宅名下 ${totalVehicles} 輛車已全數由其他合居成員出行使用中，選擇步行出行。`;
        }
      }
    }

    // 執行狀態轉換
    if (selectedMode === 'drive' && selectedVehicle) {
      selectedVehicle.status = 'in_use';
      selectedVehicle.currentDriverCitizenId = foundCitizen.id;
      selectedVehicle.currentDriverName = foundCitizen.name;
      foundCitizen.currentVehicleId = selectedVehicle.id;
    } else {
      foundCitizen.currentVehicleId = undefined;
    }

    foundCitizen.currentTravelMode = selectedMode;
    foundCitizen.currentActivity = 'Traveling';
    homeBuilding.currentOccupants = Math.max(0, homeBuilding.currentOccupants - 1);

    return {
      success: true,
      citizenId: foundCitizen.id,
      citizenName: foundCitizen.name,
      citizenAge: foundCitizen.age,
      buildingId: homeBuilding.id,
      buildingName: homeBuilding.metadata.name,
      selectedMode,
      selectedVehicle,
      canDrive,
      availableVehiclesCount: this.getAvailableVehicles(homeBuilding.id).length,
      totalVehiclesCount: totalVehicles,
      reason,
      timestamp: Date.now(),
    };
  }

  /**
   * 市民出行返家 (歸還車輛，重設狀態)
   */
  public returnCitizenToResidence(citizenId: string): { success: boolean; reason: string } {
    let foundCitizen: CitizenProfile | null = null;
    let homeBuilding: PlacedBuilding | null = null;

    for (const b of this.buildings.values()) {
      const c = b.residents.find((r) => r.id === citizenId);
      if (c) {
        foundCitizen = c;
        homeBuilding = b;
        break;
      }
    }

    if (!foundCitizen || !homeBuilding) {
      return { success: false, reason: '找不到該市民或其所屬住宅' };
    }

    if (foundCitizen.currentActivity === 'AtHome') {
      return { success: false, reason: `${foundCitizen.name} 已經在家中` };
    }

    // 若此前開車，歸還車輛給住宅
    if (foundCitizen.currentVehicleId) {
      const v = homeBuilding.vehicles.find((veh) => veh.id === foundCitizen!.currentVehicleId);
      if (v) {
        v.status = 'available';
        v.currentDriverCitizenId = undefined;
        v.currentDriverName = undefined;
      }
    }

    foundCitizen.currentVehicleId = undefined;
    foundCitizen.currentTravelMode = undefined;
    foundCitizen.currentActivity = 'AtHome';
    homeBuilding.currentOccupants += 1;

    return {
      success: true,
      reason: `${foundCitizen.name} 已順利返家，所用交通方式已結算，住宅名下車輛已歸還恢復可用。`,
    };
  }

  /**
   * 取得特定市民詳細檔案
   */
  public getCitizenProfile(citizenId: string): CitizenProfile | undefined {
    for (const b of this.buildings.values()) {
      const c = b.residents.find((r) => r.id === citizenId);
      if (c) return c;
    }
    return undefined;
  }

  /**
   * 取得指定住宅或全城所有市民清單
   */
  public getAllResidents(buildingId?: string): CitizenProfile[] {
    if (buildingId) {
      const b = this.buildings.get(buildingId);
      return b ? [...b.residents] : [];
    }
    const list: CitizenProfile[] = [];
    for (const b of this.buildings.values()) {
      list.push(...b.residents);
    }
    return list;
  }

  /**
   * 車身烤漆顏色中文對照
   */
  private getVehicleColorName(hex: number): string {
    switch (hex) {
      case 0x1d4ed8:
      case 0x0284c7:
      case 0x2563eb:
        return '蔚藍色';
      case 0xdc2626:
      case 0xb91c1c:
        return '烈紅色';
      case 0x16a34a:
      case 0x047857:
        return '墨綠色';
      case 0xea580c:
        return '暖橙色';
      case 0xf8fafc:
      case 0xffffff:
        return '珍珠白';
      case 0x334155:
      case 0x94a3b8:
        return '鐵灰色';
      case 0x0f172a:
      case 0x1e293b:
        return '曜石黑';
      case 0xeab308:
        return '鮮黃色';
      case 0x7c3aed:
        return '紫羅蘭';
      default:
        return '自用車';
    }
  }

  // ==========================================
  // 外部讀取與除錯介面
  // ==========================================

  public getAllBuildings(): PlacedBuilding[] {
    return Array.from(this.buildings.values());
  }

  public getResidentialBuildings(): PlacedBuilding[] {
    const list: PlacedBuilding[] = [];
    for (const b of this.buildings.values()) {
      if (b.metadata.category === 'Residential_Low') {
        list.push(b);
      }
    }
    return list;
  }

  public getTotalPopulation(): number {
    let total = 0;
    for (const b of this.buildings.values()) {
      if (b.metadata.category === 'Residential_Low') {
        // 總居住人口以登記居住市民數為準
        total += b.residents.length > 0 ? b.residents.length : b.currentOccupants;
      }
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

  /**
   * 開發者專用：檢查低密度工業區是否有合法建地並立即起建工業建築
   * 1. 支援隨機或自動適配任意尺寸之工業建築 (4x4, 5x5, 5x6, 6x6)
   * 2. 亦支援指定特定房型 ID 起建
   * 3. 嚴格檢驗正面臨路、已連通外聯道路且不被佔用
   */
  public buildIndustrialBuilding(preferredModelId?: string): {
    success: boolean;
    message: string;
    building?: PlacedBuilding;
  } {
    const catalog = BuildingModelFactory.getModelsCatalog().filter(
      (m) => m.category === 'Industrial_Low'
    );

    let candidateModels: BuildingMetadata[] = [];
    if (preferredModelId) {
      const targetMeta = catalog.find((m) => m.id === preferredModelId);
      if (!targetMeta) {
        return { success: false, message: `找不到指定的工業建築型號：${preferredModelId}` };
      }
      candidateModels = [targetMeta];
    } else {
      // 依序嘗試或隨機匹配各款工業建築
      candidateModels = [...catalog].sort(() => Math.random() - 0.5);
    }

    // 檢查是否有劃分低密度工業區
    let totalIndustrialCells = 0;
    for (const cell of this.zoningManager.getCells().values()) {
      if (cell.zoneType === 'Industrial' && !this.occupiedCells.has(cell.key)) {
        totalIndustrialCells++;
      }
    }

    if (totalIndustrialCells === 0) {
      return {
        success: false,
        message: '全市尚未劃分低密度工業區（琥珀黃）或現有工業區已全數被佔用！請先在區塊劃分工具中指定工業區。',
      };
    }

    for (const meta of candidateModels) {
      const site = this.findSiteForModel(meta);
      if (site) {
        const building = this.spawnBuilding(meta, site, meta.capacity);
        building.registeredResidents = 0;
        building.currentOccupants = 0;
        building.employedWorkerIds = [];
        // 建造完成並隱藏鷹架
        building.status = 'completed';
        building.constructionProgress = 1.0;
        building.buildingMesh.position.y = 0;
        building.buildingMesh.scale.set(1.0, 1.0, 1.0);
        building.scaffoldingGroup.visible = false;

        return {
          success: true,
          message: `成功於 (${site.originZx}, ${site.originZz}) 起建【${meta.name}】！工作人數上限：${meta.capacity} 人`,
          building,
        };
      }
    }

    return {
      success: false,
      message: '現存低密度工業區中未找到符合「正面緊貼馬路」與「具外聯公路路徑」之足夠空間！請確認工業區緊鄰已鋪設的雙向車道。',
    };
  }

  /**
   * 取得全市所有已建之工業建築清單
   */
  public getIndustrialBuildings(): PlacedBuilding[] {
    const list: PlacedBuilding[] = [];
    for (const b of this.buildings.values()) {
      if (b.metadata.category === 'Industrial_Low') {
        list.push(b);
      }
    }
    return list;
  }

  /**
   * 取得全市工業建築總職缺容量、當前入職人數與當前內部工人人數
   */
  public getTotalIndustrialCapacity(): {
    currentWorkers: number;
    totalEmployed: number;
    totalCapacity: number;
    count: number;
  } {
    const list = this.getIndustrialBuildings();
    let totalCapacity = 0;
    let currentWorkers = 0;
    let totalEmployed = 0;
    for (const b of list) {
      totalCapacity += b.metadata.capacity;
      currentWorkers += b.currentOccupants;
      totalEmployed += b.employedWorkerIds ? b.employedWorkerIds.length : 0;
    }
    return {
      currentWorkers,
      totalEmployed,
      totalCapacity,
      count: list.length,
    };
  }

  /**
   * 搜尋兩路塊間之最佳連續車道行車路徑
   * @param originTileKey 起點道路網格 Key
   * @param destTileKey 終點道路網格 Key
   * @param requiredStartDir 嚴格限制起步車道之行駛方向 (如路邊車位起步，只允許對應順向車道)
   * @param preferredGoalDir 偏好抵達車道之行駛方向 (如工廠同側順向車道，供靠右行駛路邊停車)
   */
  public findBestRoadPath(
    originTileKey: string,
    destTileKey: string,
    requiredStartDir?: 'N' | 'S' | 'E' | 'W',
    preferredGoalDir?: 'N' | 'S' | 'E' | 'W'
  ): PathResult | null {
    const originTile = this.roadNetwork.getTile(originTileKey);
    const destTile = this.roadNetwork.getTile(destTileKey);
    if (!originTile || !destTile) return null;

    const allLanes = this.roadNetwork.getAllLanes();

    // 篩選起步車道：不從交叉路口內彎道或 UTurn 道直接起步
    let startLanes = originTile.lanes.filter((l) => !l.isIntersection && !l.isUTurn);
    if (startLanes.length === 0) startLanes = originTile.lanes;

    // 若指定起步方向（來自路邊車位朝向），嚴格限制起步車道方向
    if (requiredStartDir) {
      const matched = startLanes.filter((l) => l.direction === requiredStartDir);
      if (matched.length > 0) {
        startLanes = matched;
      }
    }

    // 目標車道：優先考量目的地同側之順向車道
    let goalLanes = destTile.lanes.filter((l) => !l.isIntersection && !l.isUTurn);
    if (goalLanes.length === 0) goalLanes = destTile.lanes;

    if (preferredGoalDir) {
      // 將符合 preferredGoalDir 的目標車道排在前面
      goalLanes.sort((a, b) => {
        const aPref = a.direction === preferredGoalDir ? 1 : 0;
        const bPref = b.direction === preferredGoalDir ? 1 : 0;
        return bPref - aPref;
      });
    }

    let bestPath: PathResult | null = null;
    let shortestDist = Infinity;

    for (const startLane of startLanes) {
      for (const goalLane of goalLanes) {
        const path = Pathfinding.findShortestPath(startLane.id, goalLane.id, allLanes);
        if (path && path.routeWaypoints && path.routeWaypoints.length >= 2) {
          // 若偏好抵達方向且此目標車道符合，給予虛擬權重優勢使車輛偏好開到建築同側
          const isPreferredGoal = preferredGoalDir && goalLane.direction === preferredGoalDir;
          const effectiveDist = isPreferredGoal ? path.totalDistance : path.totalDistance + 50.0;
          if (effectiveDist < shortestDist) {
            shortestDist = effectiveDist;
            bestPath = path;
          }
        }
      }
    }

    // 備援：若嚴格限制 requiredStartDir 找不到任何路徑（極端斷路狀況），嘗試不限起步方向
    if (!bestPath && requiredStartDir) {
      return this.findBestRoadPath(originTileKey, destTileKey, undefined, preferredGoalDir);
    }

    return bestPath;
  }

  /**
   * 修正車輛自路邊停車位起步之旅程路徑：
   * 1. 嚴格以車位座標 (carSpot.position) 作為第 0 個節點，杜絕車輛瞬移
   * 2. 僅在起步車道內部剪除位於車位後方的節點，平滑匯入前方順向車道，絕不倒退
   * 3. 離開起步車道後之所有沿途道路節點 100% 完整保留，杜絕截斷為直線飛越！
   */
  public attachCurbsideDeparture(drivePath: PathResult, carSpot: CurbsideSpot): PathResult {
    if (!drivePath.routeWaypoints || drivePath.routeWaypoints.length < 2) return drivePath;

    const dir = ParkingManager.getDirectionForSide(carSpot.side);
    const dirVec = new THREE.Vector3();
    if (dir === 'N') dirVec.set(0, 0, -1);
    else if (dir === 'S') dirVec.set(0, 0, 1);
    else if (dir === 'E') dirVec.set(1, 0, 0);
    else if (dir === 'W') dirVec.set(-1, 0, 0);

    const rwps = drivePath.routeWaypoints;
    const startLaneId = rwps[0].laneId;

    const newRwps: RouteWaypoint[] = [];

    // 起點嚴格錨定於車位座標
    const startRwp: RouteWaypoint = {
      position: carSpot.position.clone(),
      laneId: startLaneId,
      isIntersection: false,
      isStopLine: false,
    };
    startRwp.position.y = 0.04;
    newRwps.push(startRwp);

    let hasExitedStartLane = false;
    for (let i = 0; i < rwps.length; i++) {
      const wp = rwps[i];
      if (!hasExitedStartLane && wp.laneId === startLaneId) {
        const toWp = new THREE.Vector3().subVectors(wp.position, carSpot.position);
        const forwardDist = toWp.dot(dirVec);
        // 僅在起步車道內，剃除位於車身後方或緊鄰（<= 0.2m）之節點
        if (forwardDist <= 0.2) {
          continue;
        }
      } else {
        hasExitedStartLane = true;
      }
      // 只要是起步車道前方之節點，或已進入後續車道/路口之節點，100% 完整保留！
      newRwps.push(wp);
    }

    // 若起點車道節點全部在後方且沒有其他車道節點（極端情況），至少保留原本最後一個節點
    if (newRwps.length === 1 && rwps.length > 0) {
      newRwps.push(rwps[rwps.length - 1]);
    }

    const newWaypoints = newRwps.map((r) => r.position.clone());
    let totalDist = 0;
    for (let i = 1; i < newWaypoints.length; i++) {
      totalDist += newWaypoints[i].distanceTo(newWaypoints[i - 1]);
    }

    return {
      laneIds: drivePath.laneIds,
      waypoints: newWaypoints,
      routeWaypoints: newRwps,
      totalDistance: totalDist,
    };
  }

  /**
   * 修正車輛抵達目的地路邊停車位之路徑（過渡性停車動線）：
   * 1. 嚴格完整保留到達終點車道前之所有歷史道路航點（高速公路、沿途轉彎、十字路口等 100% 保留！）
   * 2. 僅在終點車道內部剪除超過切入點的前方節點，防止衝過頭後倒退
   * 3. 平滑插入四階泊車動線「車道切入點 -> 斜向進場點 -> 路緣對齊點 -> 最終停車位」，實現自然流暢的靠邊停車過渡畫面
   */
  public attachCurbsideArrival(drivePath: PathResult, parkSpot: CurbsideSpot): PathResult {
    if (!drivePath.routeWaypoints || drivePath.routeWaypoints.length < 2) return drivePath;

    const dir = ParkingManager.getDirectionForSide(parkSpot.side);
    const dirVec = new THREE.Vector3();
    if (dir === 'N') dirVec.set(0, 0, -1);
    else if (dir === 'S') dirVec.set(0, 0, 1);
    else if (dir === 'E') dirVec.set(1, 0, 0);
    else if (dir === 'W') dirVec.set(-1, 0, 0);

    // 靠右行駛：由行進方向旋轉 90 度得到指向右側路緣之向量 (-dirVec.z, 0, dirVec.x)
    const latVec = new THREE.Vector3(-dirVec.z, 0, dirVec.x);

    // 車道中心與路緣車位中心之橫向距 0.295m (0.62 - 0.325)
    const LATERAL_OFFSET = 0.295;
    const TURN_IN_LEAD = 0.65; // 在車位前方 0.65m 處由車道開始向右轉向

    // 車位正對之車道中心點
    const laneAtSpot = parkSpot.position.clone().sub(latVec.clone().multiplyScalar(LATERAL_OFFSET));
    laneAtSpot.y = 0.04;

    // 1. 車道切入點 (仍在車道中心線上順行)
    const turnInPoint = laneAtSpot.clone().sub(dirVec.clone().multiplyScalar(TURN_IN_LEAD));
    turnInPoint.y = 0.04;

    // 2. 斜向進場過渡點 (車身微斜切入路緣，前進約 0.35m，向右偏移 55%)
    const midPoint = laneAtSpot.clone()
      .sub(dirVec.clone().multiplyScalar(TURN_IN_LEAD * 0.45))
      .add(latVec.clone().multiplyScalar(LATERAL_OFFSET * 0.55));
    midPoint.y = 0.04;

    // 3. 路緣對齊點 (車身已到達路緣側邊，距離車位 0.12m，車頭回正與路緣完全平行)
    const alignPoint = parkSpot.position.clone().sub(dirVec.clone().multiplyScalar(0.12));
    alignPoint.y = 0.04;

    // 4. 最終停車位精確位置
    const spotTarget = parkSpot.position.clone();
    spotTarget.y = 0.04;

    const rwps = drivePath.routeWaypoints;
    const destLaneId = rwps[rwps.length - 1].laneId;
    const firstDestLaneIdx = rwps.findIndex((w) => w.laneId === destLaneId);

    const newRwps: RouteWaypoint[] = [];

    // ★ 關鍵保護：嚴格保留到達終點車道前之所有歷史路徑航點 (包括高速公路、沿途街區與路口，絕不跨街剪除！)
    const prefixEnd = firstDestLaneIdx !== -1 ? firstDestLaneIdx : rwps.length - 1;
    for (let i = 0; i < prefixEnd; i++) {
      newRwps.push(rwps[i]);
    }

    // 僅在終點車道內部，過濾超過切入點的前方節點
    if (firstDestLaneIdx !== -1) {
      for (let i = firstDestLaneIdx; i < rwps.length; i++) {
        const wp = rwps[i];
        const toTurnIn = new THREE.Vector3().subVectors(wp.position, turnInPoint);
        const forwardDist = toTurnIn.dot(dirVec);

        // 若該節點已超過或接近 turnInPoint，則停止保留
        if (forwardDist >= -0.15) {
          break;
        }
        newRwps.push(wp);
      }
    }

    // 依序加入泊車四階動線「車道切入點 -> 斜向進場點 -> 路緣對齊點 -> 停車位」
    newRwps.push({
      position: turnInPoint,
      laneId: destLaneId,
      isIntersection: false,
      isStopLine: false,
    });
    newRwps.push({
      position: midPoint,
      laneId: destLaneId,
      isIntersection: false,
      isStopLine: false,
    });
    newRwps.push({
      position: alignPoint,
      laneId: destLaneId,
      isIntersection: false,
      isStopLine: false,
    });
    newRwps.push({
      position: spotTarget,
      laneId: destLaneId,
      isIntersection: false,
      isStopLine: false,
    });

    const newWaypoints = newRwps.map((r) => r.position.clone());
    let totalDist = 0;
    for (let i = 1; i < newWaypoints.length; i++) {
      totalDist += newWaypoints[i].distanceTo(newWaypoints[i - 1]);
    }

    return {
      laneIds: drivePath.laneIds,
      waypoints: newWaypoints,
      routeWaypoints: newRwps,
      totalDistance: totalDist,
    };
  }

  /**
   * 邊界斷路或特殊無解情況之直達備援路徑
   */
  private createDirectFallbackPath(fromPos: THREE.Vector3, toPos: THREE.Vector3): PathResult {
    const p1 = fromPos.clone();
    p1.y = 0.04;
    const p2 = toPos.clone();
    p2.y = 0.04;
    const rwps: RouteWaypoint[] = [
      { position: p1, laneId: 'fallback_start', isIntersection: false, isStopLine: false },
      { position: p2, laneId: 'fallback_end', isIntersection: false, isStopLine: false },
    ];
    return {
      laneIds: ['fallback_lane'],
      waypoints: [p1, p2],
      routeWaypoints: rwps,
      totalDistance: p1.distanceTo(p2),
    };
  }

  /**
   * 邊界斷路或特殊無解情況之行人直達備援路徑
   */
  private createDirectPedestrianFallback(home: PlacedBuilding, factory: PlacedBuilding): THREE.Vector3[] {
    const homeDoor = home.worldCenter.clone().lerp(home.frontWorldPos, 0.45);
    homeDoor.y = 0.04;
    const homeGate = home.frontWorldPos.clone();
    homeGate.y = 0.07;
    const factoryGate = factory.frontWorldPos.clone();
    factoryGate.y = 0.07;
    const factoryDoor = factory.worldCenter.clone().lerp(factory.frontWorldPos, 0.45);
    factoryDoor.y = 0.04;
    return [homeDoor, homeGate, factoryGate, factoryDoor];
  }

  private onCommuteStateChanged?: () => void;

  public setOnCommuteStateChangedCallback(cb: () => void): void {
    this.onCommuteStateChanged = cb;
  }

  /**
   * 隨機市民上班測試：
   * 1. 隨機選取一位在家的市民
   * 2. 隨機分配到入職人數未滿的工廠
   * 3. 50% 機率開車、50% 機率步行
   * 4. 開車時若住宅無閒置車輛，自動改以步行
   * 5. 走路直接走入工廠；開車則開至工廠後尋找就近停車位，停車、下車並步行進入工廠
   */
  public testRandomCitizenCommute(): {
    success: boolean;
    citizen?: CitizenProfile;
    homeBuilding?: PlacedBuilding;
    factory?: PlacedBuilding;
    mode?: 'drive' | 'walk';
    vehicle?: ResidenceVehicle;
    reason: string;
  } {
    // 1. 隨機選取一位在家的市民
    const atHomeCitizens = this.getAllResidents().filter((r) => r.currentActivity === 'AtHome');
    if (atHomeCitizens.length === 0) {
      return {
        success: false,
        reason: '⚠️ 全市目前無在家中的市民可供上班（請先在上方產生住房需求入住，或召回已出行的市民）。',
      };
    }

    // 2. 檢驗工廠職缺狀態
    const factories = this.getIndustrialBuildings();
    if (factories.length === 0) {
      return {
        success: false,
        reason: '⚠️ 全市尚未建造任何低密度工業建築！請先使用下方「低密度工業區建造」工具起建工廠。',
      };
    }

    const availableFactories = factories.filter(
      (f) => (f.employedWorkerIds ? f.employedWorkerIds.length : 0) < f.metadata.capacity
    );
    if (availableFactories.length === 0) {
      return {
        success: false,
        reason: `⚠️ 全市已建的 ${factories.length} 棟工廠入職人數皆已額滿！請建造更多工廠以提供工作職缺。`,
      };
    }

    // 3. 隨機選取一名市民與一家尚有入職缺額的工廠
    const citizen = atHomeCitizens[Math.floor(Math.random() * atHomeCitizens.length)];
    const homeBuilding = this.buildings.get(citizen.homeBuildingId);
    if (!homeBuilding) {
      return { success: false, reason: '找不到市民所屬的住宅建築。' };
    }

    const targetFactory = availableFactories[Math.floor(Math.random() * availableFactories.length)];
    if (!targetFactory.employedWorkerIds) targetFactory.employedWorkerIds = [];
    if (!targetFactory.employedWorkerIds.includes(citizen.id)) {
      targetFactory.employedWorkerIds.push(citizen.id);
    }
    citizen.workBuildingId = targetFactory.id;

    // 4. 決策交通方式：50% 機率開車，50% 機率步行 (先不考慮市民偏好)
    const rollDrive = Math.random() < 0.5;
    const availableVehicles = homeBuilding.vehicles.filter((v) => v.status === 'available');

    let mode: 'drive' | 'walk' = 'walk';
    let chosenVehicle: ResidenceVehicle | undefined = undefined;
    let reason = '';

    if (rollDrive) {
      if (availableVehicles.length > 0) {
        mode = 'drive';
        chosenVehicle = availableVehicles[0];
        reason = `隨機 50% 機率決定【開車上班】。住宅名下具可用車輛 [${chosenVehicle.sourceLabel} · ${chosenVehicle.colorName}]，市民走向車輛並開車前往。`;
      } else {
        mode = 'walk';
        reason = `隨機 50% 機率決定【開車上班】，但住宅名下暫無可用閒置車輛，自動改以【步行上班】前往。`;
      }
    } else {
      mode = 'walk';
      reason = `隨機 50% 機率決定【步行上班】。市民自住宅直接徒步前往工廠。`;
    }

    // 5. 更新市民與住宅狀態
    homeBuilding.currentOccupants = Math.max(0, homeBuilding.currentOccupants - 1);
    citizen.currentActivity = 'CommutingToWork';
    citizen.currentTravelMode = mode;

    // 6. 執行通勤動態
    if (mode === 'walk') {
      citizen.currentVehicleId = undefined;

      // 透過行人路徑規劃系統 (PedestrianNetwork) 規劃門對門高架立體人行道路徑
      const pedResult = this.pedestrianNetwork.findPathBetweenBuildings(
        homeBuilding,
        targetFactory
      );

      let waypoints: THREE.Vector3[];
      let routeDesc = '';
      if (pedResult && pedResult.waypoints.length >= 2) {
        waypoints = pedResult.waypoints;
        routeDesc = pedResult.description;
      } else {
        // 備援方案：若無連通人行道，使用安全人行直達備援動線
        waypoints = this.createDirectPedestrianFallback(homeBuilding, targetFactory);
        routeDesc = '無連通人行道，採人行直達備援動線前往';
      }

      reason += ` 【人行動線】${routeDesc}。`;

      const pedMesh = CitizenModelFactory.createCitizen({
        gender: citizen.gender,
        variant: Math.floor(Math.random() * 3),
      });
      pedMesh.position.copy(waypoints[0]);
      this.pedestrianContainer.add(pedMesh);

      const walkPed: MovingInPedestrian = {
        id: `commute_walk_${citizen.id}_${Date.now()}`,
        buildingId: targetFactory.id,
        profile: citizen,
        mesh: pedMesh,
        spawnDelay: 0,
        currentWaypointIndex: 1,
        waypoints,
        routeWaypoints: pedResult?.routeWaypoints,
        speed: 1.4, // 標準人行步速約 1.4 m/s (5.0 km/h)
        walkTimer: 0,
        isAlighted: true,
        hasEnteredHouse: false,
        onArrivedDestination: () => {
          targetFactory.currentOccupants += 1;
          citizen.currentActivity = 'AtWork';
          this.updateTooltipContent();
          if (this.onCommuteStateChanged) this.onCommuteStateChanged();
        },
      };
      this.activePedestrians.push(walkPed);
    } else {
      // 開車模式
      chosenVehicle!.status = 'in_use';
      chosenVehicle!.currentDriverCitizenId = citizen.id;
      chosenVehicle!.currentDriverName = citizen.name;
      citizen.currentVehicleId = chosenVehicle!.id;

      // 取得車輛目前停放位置
      let carSpot = chosenVehicle!.parkedSpot;
      if (!carSpot && chosenVehicle!.parkedCarId && this.parkingManager) {
        const parkedCar = this.parkingManager.getParkedCar(chosenVehicle!.parkedCarId);
        if (parkedCar) {
          carSpot = {
            position: parkedCar.position.clone(),
            rotationY: parkedCar.rotationY,
            side: parkedCar.side,
            tileKey: parkedCar.tileKey,
          };
          chosenVehicle!.parkedSpot = carSpot;
        }
      }

      const carSpotPos = carSpot
        ? carSpot.position.clone()
        : homeBuilding.frontWorldPos.clone();
      carSpotPos.y = 0.02;

      // 使用行人專屬尋路系統規劃自住家出發前往車輛旁之動線（支援近距直達與遠距多路口跨斑馬線尋路）
      const pedToCarResult = this.pedestrianNetwork.findPathToCar(
        homeBuilding,
        carSpotPos,
        carSpot
      );

      let walkToCarWaypoints: THREE.Vector3[];
      let routeWaypoints: PedestrianWaypoint[] | undefined = undefined;
      let walkDesc = '';

      if (pedToCarResult && pedToCarResult.waypoints.length >= 2) {
        walkToCarWaypoints = pedToCarResult.waypoints;
        routeWaypoints = pedToCarResult.routeWaypoints;
        walkDesc = pedToCarResult.description;
      } else {
        // 備援方案：若無連通人行道，採用直達備援動線走向車輛
        const homeDoor = homeBuilding.worldCenter.clone().lerp(homeBuilding.frontWorldPos, 0.45);
        homeDoor.y = 0.04;
        const homeGate = homeBuilding.frontWorldPos.clone();
        homeGate.y = 0.07;
        walkToCarWaypoints = [
          homeDoor,
          homeGate,
          carSpotPos.clone(),
        ];
        walkDesc = '人行道未連通，採直達備援動線走向車輛';
      }

      reason += ` 【走向車輛】${walkDesc}。`;

      const pedMesh = CitizenModelFactory.createCitizen({
        gender: citizen.gender,
        variant: Math.floor(Math.random() * 3),
      });
      pedMesh.position.copy(walkToCarWaypoints[0]);
      this.pedestrianContainer.add(pedMesh);

      const walkToCarPed: MovingInPedestrian = {
        id: `commute_to_car_${citizen.id}_${Date.now()}`,
        buildingId: homeBuilding.id,
        profile: citizen,
        mesh: pedMesh,
        spawnDelay: 0,
        currentWaypointIndex: 1,
        waypoints: walkToCarWaypoints,
        routeWaypoints,
        speed: 1.35,
        walkTimer: 0,
        isAlighted: true,
        hasEnteredHouse: false,
        onArrivedDestination: () => {
          // 市民上車！解鎖路邊停車位
          const startTileKey = carSpot?.tileKey || homeBuilding.targetRoadTileKey;
          if (chosenVehicle!.parkedCarId && this.parkingManager) {
            this.parkingManager.removeParkedCar(chosenVehicle!.parkedCarId);
            chosenVehicle!.parkedCarId = undefined;
            chosenVehicle!.parkedSpot = undefined;
          }

          // 尋找行車路徑：
          // 1. 嚴格限制起步車道：依車位所在路緣方向順向行駛 (西側->S, 東側->N, 北側->W, 南側->E)，絕不逆向或跨越雙黃線瞬移！
          // 2. 偏好抵達目標工廠同側車道，以便靠右行駛時直接停入工廠門前路緣車位
          const requiredStartDir = carSpot ? ParkingManager.getDirectionForSide(carSpot.side) : undefined;
          const targetRoadTile = this.roadNetwork.getTile(targetFactory.targetRoadTileKey);
          const preferredGoalDir = targetRoadTile
            ? ParkingManager.getPreferredArrivalDirection(targetRoadTile, targetFactory.frontWorldPos)
            : undefined;

          let drivePath = this.findBestRoadPath(
            startTileKey,
            targetFactory.targetRoadTileKey,
            requiredStartDir,
            preferredGoalDir
          );
          if (!drivePath && startTileKey !== homeBuilding.targetRoadTileKey) {
            drivePath = this.findBestRoadPath(
              homeBuilding.targetRoadTileKey,
              targetFactory.targetRoadTileKey,
              requiredStartDir,
              preferredGoalDir
            );
          }
          let destParkSpot: CurbsideSpot | null = null;
          if (!drivePath) {
            drivePath = this.createDirectFallbackPath(carSpotPos, targetFactory.frontWorldPos);
          } else {
            if (carSpot) {
              // 平滑接合路邊車位起步點，車輛直接自車位順向切出匯入車道，絕不倒退瞬移
              drivePath = this.attachCurbsideDeparture(drivePath, carSpot);
            }

            // 靠右行駛規則：抵達目的地時就近尋找車位，只能判定行駛車道右側之合法車位
            let finalDir: 'N' | 'S' | 'E' | 'W' = 'S';
            const rwps = drivePath.routeWaypoints;
            if (rwps && rwps.length >= 2) {
              const pEnd = rwps[rwps.length - 1].position;
              const pPrev = rwps[rwps.length - 2].position;
              const dX = pEnd.x - pPrev.x;
              const dZ = pEnd.z - pPrev.z;
              if (Math.abs(dX) > Math.abs(dZ)) {
                finalDir = dX > 0 ? 'E' : 'W';
              } else {
                finalDir = dZ > 0 ? 'S' : 'N';
              }
            }

            const allowedParkingSide = ParkingManager.getRightSideForDirection(finalDir);
            destParkSpot = this.parkingManager
              ? this.parkingManager.findClosestAvailableSpot(
                  targetFactory.frontWorldPos,
                  targetFactory.targetRoadTileKey,
                  allowedParkingSide
                )
              : null;

            // 平滑接合目的地路邊停車進場過渡動線：車道切入 -> 斜向進場 -> 對齊路緣 -> 停入車位
            if (destParkSpot && this.parkingManager) {
              this.parkingManager.reserveSpot(destParkSpot);
              drivePath = this.attachCurbsideArrival(drivePath, destParkSpot);
            }
          }

          // 生成行駛中的市民車輛
          this.vehicleManager.spawnMovingInVehicle(
            drivePath,
            chosenVehicle!.color,
            (arrivedVeh) => {
              let dropOffPos: THREE.Vector3;
              if (destParkSpot && this.parkingManager) {
                const parkedCar = this.parkingManager.parkExistingCarMesh(
                  arrivedVeh.mesh,
                  destParkSpot,
                  chosenVehicle!.color,
                  targetFactory.id,
                  chosenVehicle!.id
                );
                chosenVehicle!.parkedCarId = parkedCar.id;
                chosenVehicle!.parkedSpot = destParkSpot;
                dropOffPos = destParkSpot.position.clone();
              } else {
                // 若無該側合法路邊車位，停留在車輛抵達處之右側路緣，嚴禁跨越雙黃線逆向瞬移
                dropOffPos = arrivedVeh.mesh.position.clone();
              }

              // 市民下車，透過行人尋路系統規劃從下車處步行進入工廠之動線
              const pedToFactoryResult = this.pedestrianNetwork.findPathFromCarToBuilding(
                dropOffPos,
                targetFactory,
                destParkSpot ?? undefined
              );

              let walkToFactoryWaypoints: THREE.Vector3[];
              let factoryRouteWps: PedestrianWaypoint[] | undefined = undefined;

              if (pedToFactoryResult && pedToFactoryResult.waypoints.length >= 2) {
                walkToFactoryWaypoints = pedToFactoryResult.waypoints;
                factoryRouteWps = pedToFactoryResult.routeWaypoints;
              } else {
                const factoryDoor = targetFactory.worldCenter.clone().lerp(targetFactory.frontWorldPos, 0.45);
                factoryDoor.y = 0.04;
                const factoryFrontPos = targetFactory.frontWorldPos.clone();
                factoryFrontPos.y = 0.07;

                walkToFactoryWaypoints = [
                  dropOffPos.clone(),
                  factoryFrontPos,
                  factoryDoor.clone(),
                ];
              }

              const alightedPedMesh = CitizenModelFactory.createCitizen({
                gender: citizen.gender,
                variant: Math.floor(Math.random() * 3),
              });
              alightedPedMesh.position.copy(walkToFactoryWaypoints[0]);
              this.pedestrianContainer.add(alightedPedMesh);

              const walkToFactoryPed: MovingInPedestrian = {
                id: `commute_alight_walk_${citizen.id}_${Date.now()}`,
                buildingId: targetFactory.id,
                profile: citizen,
                mesh: alightedPedMesh,
                spawnDelay: 0.15,
                currentWaypointIndex: 1,
                waypoints: walkToFactoryWaypoints,
                routeWaypoints: factoryRouteWps,
                speed: 1.25,
                walkTimer: 0,
                isAlighted: true,
                hasEnteredHouse: false,
                onArrivedDestination: () => {
                  targetFactory.currentOccupants += 1;
                  citizen.currentActivity = 'AtWork';
                  this.updateTooltipContent();
                  if (this.onCommuteStateChanged) this.onCommuteStateChanged();
                },
              };
              this.activePedestrians.push(walkToFactoryPed);
            },
            true // keepMeshOnArrive = true
          );
        },
      };
      this.activePedestrians.push(walkToCarPed);
    }

    this.updateTooltipContent();
    if (this.onCommuteStateChanged) this.onCommuteStateChanged();

    return {
      success: true,
      citizen,
      homeBuilding,
      factory: targetFactory,
      mode,
      vehicle: chosenVehicle,
      reason,
    };
  }

  /**
   * 召回所有外出上班與通勤中的市民平安返家
   */
  public recallAllCitizensToResidence(): number {
    let count = 0;

    // 清理在途中步行的行人模型
    for (const ped of this.activePedestrians) {
      if (ped.mesh) {
        this.pedestrianContainer.remove(ped.mesh);
      }
    }
    this.activePedestrians = [];

    // 將所有不在家的市民召回住宅
    for (const bld of this.buildings.values()) {
      if (bld.metadata.category === 'Residential_Low') {
        for (const c of bld.residents) {
          if (c.currentActivity !== 'AtHome') {
            count++;
            // 若在工廠上班中，扣除工廠現在內部人數
            if (c.workBuildingId) {
              const fac = this.buildings.get(c.workBuildingId);
              if (fac && fac.currentOccupants > 0) {
                fac.currentOccupants = Math.max(0, fac.currentOccupants - 1);
              }
            }

            // 若借出車輛，歸還並重新停放在住宅旁
            if (c.currentVehicleId) {
              const veh = bld.vehicles.find((v) => v.id === c.currentVehicleId);
              if (veh) {
                if (veh.parkedCarId && this.parkingManager) {
                  this.parkingManager.removeParkedCar(veh.parkedCarId);
                  veh.parkedCarId = undefined;
                  veh.parkedSpot = undefined;
                }

                // 重新停放回住宅門前可用車位
                const homeSpot = this.parkingManager?.findClosestAvailableSpot(
                  bld.frontWorldPos,
                  bld.targetRoadTileKey
                );
                if (homeSpot && this.parkingManager) {
                  const mesh = veh.mesh ?? VehicleModelFactory.createVehicle(veh.color);
                  const parked = this.parkingManager.parkExistingCarMesh(
                    mesh,
                    homeSpot,
                    veh.color,
                    bld.id,
                    veh.id
                  );
                  veh.parkedCarId = parked.id;
                  veh.parkedSpot = homeSpot;
                  veh.mesh = mesh;
                }

                veh.status = 'available';
                veh.currentDriverCitizenId = undefined;
                veh.currentDriverName = undefined;
              }
            }

            c.currentActivity = 'AtHome';
            c.currentTravelMode = undefined;
            c.currentVehicleId = undefined;
            bld.currentOccupants += 1;
          }
        }
      }
    }

    this.updateTooltipContent();
    if (this.onCommuteStateChanged) this.onCommuteStateChanged();
    return count;
  }

  /**
   * 查詢指定路口指定路口臂之斑馬線人行道，是否有行人正在穿越中
   * 轉彎車輛於進入路口前必須依此判定，若有行人正在穿越，必須在路口停止線前停等禮讓，嚴禁進入路口
   * @param intersectionKey 路口唯一鍵值 (例: "0,0")
   * @param arm 欲轉入之路口臂 ('N' | 'S' | 'E' | 'W')
   */
  public isPedestrianCrossingCrosswalk(intersectionKey: string, arm: 'N' | 'S' | 'E' | 'W'): boolean {
    for (const ped of this.activePedestrians) {
      if (!ped.isAlighted || ped.hasEnteredHouse || !ped.mesh) continue;

      // 行人明確處於正在穿越該路口指定臂之斑馬線狀態中
      if (ped.isCrossingCrosswalk && ped.crossingIntersectionKey === intersectionKey && ped.crossingArm === arm) {
        return true;
      }
    }
    return false;
  }

  /**
   * 輔助車輛近距離防撞避讓：偵測車輛前方扇形範圍內是否有正在穿越斑馬線之行人
   */
  public findPedestrianAhead(
    vehiclePos: THREE.Vector3,
    headingY: number,
    maxDist: number = 2.2
  ): { pedestrian: MovingInPedestrian; distance: number } | null {
    const dirX = Math.sin(headingY);
    const dirZ = Math.cos(headingY);

    let closestDist = Infinity;
    let closestPed: MovingInPedestrian | null = null;

    for (const ped of this.activePedestrians) {
      if (!ped.isAlighted || ped.hasEnteredHouse || !ped.mesh || !ped.isCrossingCrosswalk) continue;

      const dx = ped.mesh.position.x - vehiclePos.x;
      const dz = ped.mesh.position.z - vehiclePos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= maxDist && dist < closestDist) {
        // 前方扇形檢測（夾角內積 > 0.45，約前方 63 度錐體）
        const dot = (dx * dirX + dz * dirZ) / (dist || 1);
        if (dot > 0.45) {
          closestDist = dist;
          closestPed = ped;
        }
      }
    }

    if (closestPed) {
      return { pedestrian: closestPed, distance: closestDist };
    }
    return null;
  }
}
