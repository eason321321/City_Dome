import * as THREE from 'three';
import { BuildingModelFactory, BuildingMetadata } from '../rendering/BuildingModelFactory';
import { ZoningManager, ZoneType } from './ZoningManager';
import { RoadNetwork, DirectedLane } from './RoadNetwork';
import { Pathfinding, PathResult } from './Pathfinding';
import { PedestrianNetwork } from './PedestrianNetwork';
import { VehicleManager } from '../simulation/VehicleManager';
import { ParkingManager, CurbsideSpot } from '../simulation/ParkingManager';
import { PedestrianManager, ActivePedestrian, MovingInPedestrian } from '../simulation/PedestrianManager';
import { CitizenManager } from '../simulation/CitizenManager';
import { TrafficDispatchHelper } from '../simulation/TrafficDispatchHelper';
import { BuildingTooltip } from '../ui/BuildingTooltip';
import { BuildingDensityLevel } from '../types/common';
import {
  CitizenActivityState,
  TransitPreference,
  TravelMode,
  CitizenVehicleRegistration,
  CitizenProfile,
} from '../types/citizen';
import {
  VehicleMoveInSource,
  VehicleStatus,
  ResidenceVehicle,
  PlacedBuilding,
  MoveInType,
  DemandStatus,
  HousingDemand,
  MatchingResult,
  TravelDecisionOptions,
  TravelDecisionResult,
} from '../types/building';
import { IndustrialLowState, IndustrialLowProfile, IndustrialProfile } from '../types/industrial';
import { ResidentialState, ResidentialProfile, ResidentialLowProfile } from '../types/residential';
import { CitizenStateMachine } from '../simulation/CitizenStateMachine';
import { IndustrialStateMachine } from '../simulation/IndustrialStateMachine';
import { ResidentialStateMachine } from '../simulation/ResidentialStateMachine';

export type {
  BuildingDensityLevel,
  CitizenActivityState,
  TransitPreference,
  TravelMode,
  CitizenVehicleRegistration,
  CitizenProfile,
  IndustrialLowState,
  IndustrialLowProfile,
  IndustrialProfile,
  ResidentialState,
  ResidentialProfile,
  ResidentialLowProfile,
  VehicleMoveInSource,
  VehicleStatus,
  ResidenceVehicle,
  PlacedBuilding,
  MoveInType,
  DemandStatus,
  HousingDemand,
  MatchingResult,
  TravelDecisionOptions,
  TravelDecisionResult,
  ActivePedestrian,
  MovingInPedestrian,
};

/**
 * 建築與分區落位管理器 (BuildingManager)
 * 職責聚焦於：
 * 1. 住房需求產生與土地媒合 (buildNew / joinExisting)
 * 2. 建築落位、施工進度與施工吊臂動畫
 * 3. 住宅與工業建築狀態清單維護 (ResidentialStateMachine / IndustrialStateMachine)
 * 4. 透過 PedestrianManager、CitizenManager 與 TrafficDispatchHelper 協調人車出入
 */
export class BuildingManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private zoningManager: ZoningManager;
  private roadNetwork: RoadNetwork;
  private vehicleManager: VehicleManager;
  private parkingManager: ParkingManager | null = null;
  private pedestrianManager: PedestrianManager;
  private ownsPedestrianManager: boolean = true;
  private citizenManager: CitizenManager;

  // 格位尺寸與建物縮放 (配合 0.5m x 0.5m 小格子，建築物底面積為原先 1/4)
  private readonly CELL_SIZE: number = 0.5;

  // 建築群組與資料儲存
  private buildingsContainer: THREE.Group;
  private buildings: Map<string, PlacedBuilding> = new Map();
  private industrialStatusList: IndustrialLowProfile[] = [];
  private residentialStatusList: ResidentialLowProfile[] = [];
  private occupiedCells: Set<string> = new Set();
  private nextBuildingId: number = 1;
  private pedestrianNetwork: PedestrianNetwork;

  // 住房需求統計與佇列清單 (需求清單最新在最上方)
  private demandQueue: HousingDemand[] = [];
  private nextDemandId: number = 1;
  private totalDemandGenerated: number = 0;
  private totalMatchedSuccess: number = 0;
  private totalDemandLost: number = 0;
  private latestMatchingResult: MatchingResult | null = null;

  // 懸停射線與浮動 Tooltip 元件
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mousePos: THREE.Vector2 = new THREE.Vector2();
  private hoveredBuilding: PlacedBuilding | null = null;
  private tooltip: BuildingTooltip;

  private onCommuteStateChanged?: () => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    zoningManager: ZoningManager,
    roadNetwork: RoadNetwork,
    vehicleManager: VehicleManager,
    pedestrianManager?: PedestrianManager,
    citizenManager?: CitizenManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.zoningManager = zoningManager;
    this.roadNetwork = roadNetwork;
    this.vehicleManager = vehicleManager;
    this.pedestrianNetwork = roadNetwork.getPedestrianNetwork();

    if (pedestrianManager) {
      this.pedestrianManager = pedestrianManager;
      this.ownsPedestrianManager = false;
    } else {
      this.pedestrianManager = new PedestrianManager(scene, roadNetwork);
      this.ownsPedestrianManager = true;
    }

    this.citizenManager =
      citizenManager ??
      new CitizenManager(
        this.roadNetwork,
        this.pedestrianNetwork,
        this.pedestrianManager,
        this.vehicleManager
      );
    this.wireCitizenManagerHooks();

    this.buildingsContainer = new THREE.Group();
    this.buildingsContainer.name = 'BuildingsContainer';
    this.scene.add(this.buildingsContainer);

    this.tooltip = new BuildingTooltip();
    this.bindHoverEvents();
  }

  private wireCitizenManagerHooks(): void {
    this.citizenManager.setSyncHooks({
      onBuildingStateChanged: (building) => {
        if (building.metadata.category === 'Residential_Low') {
          this.syncResidentialProfileCounts(building);
        }
        this.updateTooltipContent();
      },
      onCommuteStateChanged: () => {
        if (this.onCommuteStateChanged) this.onCommuteStateChanged();
      },
    });
  }

  public setParkingManager(parkingManager: ParkingManager): void {
    this.parkingManager = parkingManager;
    this.citizenManager.setParkingManager(parkingManager);
  }

  public getPedestrianManager(): PedestrianManager {
    return this.pedestrianManager;
  }

  public getCitizenManager(): CitizenManager {
    return this.citizenManager;
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
    const density: BuildingDensityLevel = 'Low';

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
    this.syncResidentialProfileCounts(chosenBuilding);

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
      residents: [],
      vehicles: [],
      employedWorkerIds: [],
      craneRefs: constructionSite.craneRefs,
    };

    // 若為低密度工業區建築，出現時立即產生並登錄其狀態清單項目（含密度分級 'Low'）
    if (meta.category === 'Industrial_Low') {
      const indProfile = IndustrialStateMachine.createDefaultProfile(
        building.id,
        meta.id,
        meta.name,
        meta.capacity,
        'Constructing',
        'Low'
      );
      building.industrialProfile = indProfile;
      this.industrialStatusList.push(indProfile);
    } else if (meta.category === 'Residential_Low') {
      // 若為低密度住宅區建築，出現時立即產生並登錄其狀態清單項目（含密度分級 'Low'）
      const resProfile = ResidentialStateMachine.createDefaultProfile(
        building.id,
        meta.id,
        meta.name,
        meta.capacity,
        peopleCount,
        isCoLiving,
        'Low',
        'Constructing'
      );
      building.residentialProfile = resProfile;
      this.residentialStatusList.push(resProfile);
    }

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

    // 若未由外部主循環獨立推進 PedestrianManager，則由 BuildingManager 代為推進
    if (this.ownsPedestrianManager) {
      this.pedestrianManager.update(deltaTime, isPaused);
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

    if (building.metadata.category === 'Industrial_Low') {
      if (building.industrialProfile) {
        IndustrialStateMachine.transitionTo(building.industrialProfile, 'Idle');
      }
      return;
    }

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
      if (building.residentialProfile && building.residentialProfile.state !== 'Active') {
        ResidentialStateMachine.transitionTo(building.residentialProfile, 'WaitingForRoad');
      }
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
      if (building.residentialProfile && building.residentialProfile.state !== 'Active') {
        ResidentialStateMachine.transitionTo(building.residentialProfile, 'WaitingForRoad');
      }
      return;
    }

    // 預約該停車位，避免後續其他車輛爭搶
    if (parkingSpot && this.parkingManager) {
      this.parkingManager.reserveSpot(parkingSpot);
    }

    // 將停車位座標加入導航路徑最後，使車輛順暢靠邊駛入車位
    if (parkingSpot) {
      bestPath = TrafficDispatchHelper.attachCurbsideArrival(bestPath, parkingSpot);
    }

    if (
      building.residentialProfile &&
      (building.residentialProfile.state === 'Constructing' ||
        building.residentialProfile.state === 'WaitingForRoad')
    ) {
      ResidentialStateMachine.transitionTo(building.residentialProfile, 'MovingIn');
    }
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
    this.syncResidentialProfileCounts(building);

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

        // 2. 車子停車成功後生成車內所有市民靜態基本資料（透過 CitizenManager 註冊全城清單，AT_home 嚴格保持 false）
        const newResidents = this.citizenManager.generateCitizenProfiles(building.id, arrivingCount);
        building.residents.push(...newResidents);
        this.syncResidentialProfileCounts(building);

        // 3. 計算市民下車走入房內之人行動線
        const carParkPos = parkingSpot ? parkingSpot.position.clone() : building.frontWorldPos.clone();

        const sidewalkPos = carParkPos.clone();
        if (parkingSpot) {
          if (parkingSpot.side === 'west') sidewalkPos.x -= 0.18;
          else if (parkingSpot.side === 'east') sidewalkPos.x += 0.18;
          else if (parkingSpot.side === 'north') sidewalkPos.z -= 0.18;
          else if (parkingSpot.side === 'south') sidewalkPos.z += 0.18;
        }
        sidewalkPos.y = 0.07;

        const frontDoorPos = building.worldCenter.clone().lerp(building.frontWorldPos, 0.45);
        frontDoorPos.y = 0.04;

        const houseGatePos = building.frontWorldPos.clone();
        houseGatePos.y = 0.07;

        // 4. 委派 PedestrianManager 生成交錯下車市民，嚴格於走到大門且模型移除消失後才轉為 AtHome
        for (let i = 0; i < newResidents.length; i++) {
          const res = newResidents[i];
          this.pedestrianManager.spawnPedestrian({
            id: `ped_${res.id}`,
            buildingId: building.id,
            profile: res,
            spawnDelay: 0.35 + i * 1.1,
            waypoints: [
              sidewalkPos.clone(),
              houseGatePos.clone(),
              frontDoorPos.clone(),
            ],
            speed: 0.95 + Math.random() * 0.15,
            walkTimer: Math.random() * 5.0,
            isAlighted: false,
            onArrivedDestination: () => {
              if (CitizenStateMachine.transitionTo(res, 'AtHome')) {
                building.currentOccupants += 1;
                if (building.residentialProfile && building.residentialProfile.state !== 'Active') {
                  ResidentialStateMachine.transitionTo(building.residentialProfile, 'Active');
                }
                this.syncResidentialProfileCounts(building);
              }
              this.updateTooltipContent();
            },
          });
        }
      },
      !!parkingSpot
    );
  }

  // ==========================================
  // 懸停資訊卡片與互動 (委派 BuildingTooltip)
  // ==========================================

  private bindHoverEvents(): void {
    this.domElement.addEventListener('mousemove', (e: MouseEvent) => {
      this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

      this.checkBuildingHover(e.clientX, e.clientY);
    });

    this.domElement.addEventListener('mouseleave', () => {
      this.hoveredBuilding = null;
      this.tooltip.hide();
    });
  }

  private checkBuildingHover(clientX: number, clientY: number): void {
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
        this.tooltip.showAt(clientX, clientY, this.hoveredBuilding, this.pedestrianManager, this.buildings);
        return;
      }
    }

    this.hoveredBuilding = null;
    this.tooltip.hide();
  }

  private updateTooltipContent(): void {
    if (!this.hoveredBuilding) return;
    this.tooltip.updateContent(this.hoveredBuilding, this.pedestrianManager, this.buildings);
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
   * 住宅內市民出行方式決策 (委派 CitizenManager)
   */
  public decideCitizenTravel(citizenId: string, options?: TravelDecisionOptions): TravelDecisionResult {
    return this.citizenManager.decideCitizenTravel(citizenId, this.buildings, options);
  }

  /**
   * 市民出行返家 (委派 CitizenManager)
   */
  public returnCitizenToResidence(citizenId: string): { success: boolean; reason: string } {
    return this.citizenManager.returnCitizenToResidence(citizenId, this.buildings);
  }

  /**
   * 取得特定市民詳細檔案 (委派 CitizenManager)
   */
  public getCitizenProfile(citizenId: string): CitizenProfile | undefined {
    return this.citizenManager.getCitizenProfile(citizenId);
  }

  /**
   * 取得指定住宅或全城所有市民清單 (委派 CitizenManager)
   */
  public getAllResidents(buildingId?: string): CitizenProfile[] {
    return this.citizenManager.getAllResidents(this.buildings, buildingId);
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
        // 建造完成並隱藏鷹架，透過共用工業區狀態機切換為 Idle
        building.status = 'completed';
        building.constructionProgress = 1.0;
        building.buildingMesh.position.y = 0;
        building.buildingMesh.scale.set(1.0, 1.0, 1.0);
        building.scaffoldingGroup.visible = false;
        if (building.industrialProfile) {
          IndustrialStateMachine.transitionTo(building.industrialProfile, 'Idle');
        }

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
   * 取得全市低密度工業區狀態清單列表
   */
  public getIndustrialStatusList(): IndustrialLowProfile[] {
    return this.industrialStatusList;
  }

  /**
   * 依建築 ID 取得單一低密度工業建築狀態清單項目
   */
  public getIndustrialProfile(buildingId: string): IndustrialLowProfile | undefined {
    return this.buildings.get(buildingId)?.industrialProfile;
  }

  /**
   * 取得全市住宅區狀態清單列表
   */
  public getResidentialStatusList(): ResidentialLowProfile[] {
    return this.residentialStatusList;
  }

  /**
   * 依建築 ID 取得單一住宅建築狀態清單項目
   */
  public getResidentialProfile(buildingId: string): ResidentialLowProfile | undefined {
    return this.buildings.get(buildingId)?.residentialProfile;
  }

  /**
   * 同步住宅建築之狀態清單數據（登記人數、屋內人數、車輛數、閒置車輛數與合居旗標）
   */
  private syncResidentialProfileCounts(building: PlacedBuilding): void {
    if (!building.residentialProfile) return;
    const availableVehicles = building.vehicles.filter((v) => v.status === 'available').length;
    ResidentialStateMachine.syncCounts(
      building.residentialProfile,
      building.registeredResidents,
      building.currentOccupants,
      building.vehicles.length,
      availableVehicles,
      building.isCoLiving
    );
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
   * 搜尋兩路塊間之最佳連續車道行車路徑 (委派 TrafficDispatchHelper)
   */
  public findBestRoadPath(
    originTileKey: string,
    destTileKey: string,
    requiredStartDir?: 'N' | 'S' | 'E' | 'W',
    preferredGoalDir?: 'N' | 'S' | 'E' | 'W'
  ): PathResult | null {
    return TrafficDispatchHelper.findBestRoadPath(
      this.roadNetwork,
      originTileKey,
      destTileKey,
      requiredStartDir,
      preferredGoalDir
    );
  }

  /**
   * 修正車輛自路邊停車位起步之旅程路徑 (委派 TrafficDispatchHelper)
   */
  public attachCurbsideDeparture(drivePath: PathResult, carSpot: CurbsideSpot): PathResult {
    return TrafficDispatchHelper.attachCurbsideDeparture(drivePath, carSpot);
  }

  /**
   * 修正車輛抵達目的地路邊停車位之路徑 (委派 TrafficDispatchHelper)
   */
  public attachCurbsideArrival(drivePath: PathResult, parkSpot: CurbsideSpot): PathResult {
    return TrafficDispatchHelper.attachCurbsideArrival(drivePath, parkSpot);
  }

  public setOnCommuteStateChangedCallback(cb: () => void): void {
    this.onCommuteStateChanged = cb;
  }

  /**
   * 固定虛擬時間推進全體市民狀態機與任務列隊檢查（每 10 虛擬分鐘一次，全城每 10 次同步找工作）
   */
  public stepCitizenPeriodicSimulation(currentVirtualMin: number): {
    checksRun: number;
    jobsAssigned: number;
  } {
    return this.citizenManager.stepPeriodicSimulation(
      currentVirtualMin,
      this.buildings,
      this.getIndustrialBuildings()
    );
  }

  /**
   * 依建築 ID 取得建築實體資料
   */
  public getBuildingById(buildingId: string): PlacedBuilding | undefined {
    return this.buildings.get(buildingId);
  }

  /**
   * 召回所有外出上班與通勤中的市民平安返家 (委派 CitizenManager)
   */
  public recallAllCitizensToResidence(): number {
    return this.citizenManager.recallAllCitizensToResidence(this.buildings);
  }

  /**
   * 查詢指定路口指定路口臂之斑馬線人行道，是否有行人正在穿越中 (委派 PedestrianManager)
   */
  public isPedestrianCrossingCrosswalk(intersectionKey: string, arm: 'N' | 'S' | 'E' | 'W'): boolean {
    return this.pedestrianManager.isPedestrianCrossingCrosswalk(intersectionKey, arm);
  }

  /**
   * 輔助車輛近距離防撞避讓：偵測車輛前方扇形範圍內是否有正在穿越斑馬線之行人 (委派 PedestrianManager)
   */
  public findPedestrianAhead(
    vehiclePos: THREE.Vector3,
    headingY: number,
    maxDist: number = 2.2
  ): { pedestrian: MovingInPedestrian; distance: number } | null {
    return this.pedestrianManager.findPedestrianAhead(vehiclePos, headingY, maxDist);
  }
}
