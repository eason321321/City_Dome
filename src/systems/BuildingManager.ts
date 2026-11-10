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
  constructionDuration: number;     // 建造總秒數
  registeredResidents: number;      // 登記居住人數
  currentOccupants: number;         // 當前房內人數
  isCoLiving: boolean;              // 是否合居 (true: 與人合居, false: 自己住)
  moveInStatus: 'none' | 'enRoute' | 'arrived' | 'waitingForRoad';
}

export interface MatchingResult {
  success: boolean;
  peopleCount: number;
  timestamp: number;
  buildingName?: string;
  reason?: string;
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

  // 建築群組與資料儲存
  private buildingsContainer: THREE.Group;
  private buildings: Map<string, PlacedBuilding> = new Map();
  private occupiedCells: Set<string> = new Set();
  private nextBuildingId: number = 1;

  // 住房需求統計與配對記錄
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
  // 住房需求產生與配對機制 (核心需求 1, 2, 3, 4)
  // ==========================================

  /**
   * 住房需求產生請求 (支援 1人、2人、3人住戶)
   * 若配對不滿足 (無相連道路、缺乏合適容量房型)，則配對失敗，流失該筆需求。
   */
  public requestHousingDemand(peopleCount: 1 | 2 | 3): MatchingResult {
    this.totalDemandGenerated += peopleCount;

    // 進行臨路、容量與連通道路完整配對檢驗
    const match = this.findMatchingSiteForDemand(peopleCount);

    if (!match.site || !match.chosenModel) {
      // 配對失敗：流失住房需求
      this.totalDemandLost += peopleCount;
      const res: MatchingResult = {
        success: false,
        peopleCount,
        timestamp: Date.now(),
        reason: match.failReason || '無滿足條件之地塊或連通道路',
      };
      this.latestMatchingResult = res;
      return res;
    }

    // 配對成功！起建房屋 (先開始蓋房子，房子蓋好之後才會開車進來)
    this.totalMatchedSuccess += peopleCount;
    this.spawnBuilding(match.chosenModel, match.site, peopleCount);

    const res: MatchingResult = {
      success: true,
      peopleCount,
      timestamp: Date.now(),
      buildingName: match.chosenModel.name,
    };
    this.latestMatchingResult = res;
    return res;
  }

  /**
   * 尋找滿足下列條件的合法地塊與建築模型：
   * 1. 房子正面緊貼馬路
   * 2. 外部道路有路可以通往住處 (可供車子通行的道路)
   * 3. 房型容量必須大於等於需求人數 (排除人數不足之房型)
   */
  private findMatchingSiteForDemand(peopleCount: number): {
    site?: {
      originZx: number;
      originZz: number;
      facing: 'N' | 'S' | 'E' | 'W';
      targetRoadTileKey: string;
      frontWorldPos: THREE.Vector3;
    };
    chosenModel?: BuildingMetadata;
    failReason?: string;
  } {
    const catalog = BuildingModelFactory.getModelsCatalog();
    const cells = this.zoningManager.getCells();

    let foundSitesCount = 0;
    let foundRoadTouchingCount = 0;
    let foundCapacityFitCount = 0;
    let foundConnectedRoadCount = 0;

    const candidatePairs: {
      site: {
        originZx: number;
        originZz: number;
        facing: 'N' | 'S' | 'E' | 'W';
        targetRoadTileKey: string;
        frontWorldPos: THREE.Vector3;
      };
      model: BuildingMetadata;
    }[] = [];

    for (const cell of cells.values()) {
      if (cell.zoneType !== 'Residential' || this.occupiedCells.has(cell.key)) {
        continue;
      }

      foundSitesCount++;
      const facings: ('N' | 'S' | 'E' | 'W')[] = ['N', 'S', 'E', 'W'];

      for (const facing of facings) {
        // 篩選：排除人數不足之房型 (capacity >= peopleCount)，且佔地幾何合法
        const eligibleModels = catalog.filter((meta) => {
          if (meta.capacity < peopleCount) return false;
          return this.canFitModelAt(meta, cell.zx, cell.zz, facing);
        });

        if (eligibleModels.length > 0) {
          foundCapacityFitCount++;
          // 在合格的房型中隨機抽取 (規則 4)
          const chosen = eligibleModels[Math.floor(Math.random() * eligibleModels.length)];

          const { frontWorldPos, roadKey } = this.calculateFrontRoadPoint(
            cell.zx,
            cell.zz,
            chosen.frontageWidth,
            facing
          );

          if (roadKey && this.roadNetwork.hasTile(roadKey)) {
            foundRoadTouchingCount++;

            // 新增條件：從外部道路有路可以通往住處，要有可供車子通行的道路
            if (this.hasPathFromHighway(roadKey)) {
              foundConnectedRoadCount++;
              candidatePairs.push({
                site: {
                  originZx: cell.zx,
                  originZz: cell.zz,
                  facing,
                  targetRoadTileKey: roadKey,
                  frontWorldPos,
                },
                model: chosen,
              });
            }
          }
        }
      }
    }

    if (candidatePairs.length > 0) {
      const picked = candidatePairs[Math.floor(Math.random() * candidatePairs.length)];
      return { site: picked.site, chosenModel: picked.model };
    }

    // 分析精確配對失敗原因以供介面回饋
    let failReason = '全市尚無可用之低密度住宅分區';
    if (foundRoadTouchingCount > 0 && foundConnectedRoadCount === 0) {
      failReason = '住處道路尚未連通至外部公路（缺少可供車輛通行之道路）';
    } else if (foundSitesCount > 0 && foundCapacityFitCount === 0) {
      failReason = `住宅區空地過小，無法起建可容納 ${peopleCount} 人的房型`;
    } else if (foundSitesCount > 0) {
      failReason = '住宅分區正面未貼合馬路，無法合法起建';
    }

    return { failReason };
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
   * 1. 整個正面 (長度 frontageWidth) 的每一個 1m 格子是否皆緊貼馬路 (規則 1)
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

    switch (facing) {
      case 'S': {
        const frontZ = originZz;
        for (let x = originZx; x < originZx + W; x++) {
          if (!this.isRoadAdjacent(x + 0.5, frontZ + 1.5)) return false;
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
        for (let x = originZx; x < originZx + W; x++) {
          if (!this.isRoadAdjacent(x + 0.5, frontZ - 0.5)) return false;
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
        for (let z = originZz; z < originZz + W; z++) {
          if (!this.isRoadAdjacent(frontX + 1.5, z + 0.5)) return false;
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
        for (let z = originZz; z < originZz + W; z++) {
          if (!this.isRoadAdjacent(frontX - 0.5, z + 0.5)) return false;
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
    let roadGx = 0;
    let roadGz = 0;
    let fx = 0;
    let fz = 0;

    switch (facing) {
      case 'S':
        fx = originZx + frontageWidth / 2;
        fz = originZz + 1.0;
        roadGx = Math.floor(fx / 2) * 2 + 1;
        roadGz = Math.floor((fz + 0.5) / 2) * 2 + 1;
        break;
      case 'N':
        fx = originZx + frontageWidth / 2;
        fz = originZz;
        roadGx = Math.floor(fx / 2) * 2 + 1;
        roadGz = Math.floor((fz - 0.5) / 2) * 2 + 1;
        break;
      case 'E':
        fx = originZx + 1.0;
        fz = originZz + frontageWidth / 2;
        roadGx = Math.floor((fx + 0.5) / 2) * 2 + 1;
        roadGz = Math.floor(fz / 2) * 2 + 1;
        break;
      case 'W':
        fx = originZx;
        fz = originZz + frontageWidth / 2;
        roadGx = Math.floor((fx - 0.5) / 2) * 2 + 1;
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
  ): void {
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

    let cx = 0;
    let cz = 0;
    let rotY = 0;

    switch (site.facing) {
      case 'S':
        cx = site.originZx + W / 2;
        cz = site.originZz - D / 2 + 1.0;
        rotY = 0;
        break;
      case 'N':
        cx = site.originZx + W / 2;
        cz = site.originZz + D / 2;
        rotY = Math.PI;
        break;
      case 'E':
        cx = site.originZx - D / 2 + 1.0;
        cz = site.originZz + W / 2;
        rotY = Math.PI / 2;
        break;
      case 'W':
        cx = site.originZx + D / 2;
        cz = site.originZz + W / 2;
        rotY = -Math.PI / 2;
        break;
    }

    const worldCenter = new THREE.Vector3(cx, 0, cz);

    const buildingGroup = new THREE.Group();
    buildingGroup.position.copy(worldCenter);
    buildingGroup.rotation.y = rotY;

    // 建築實體 (初起建時沉於地底)
    const buildingMesh = BuildingModelFactory.createBuildingById(meta.id)!;
    buildingMesh.position.y = -0.8;
    buildingMesh.scale.set(1.0, 0.05, 1.0);
    buildingGroup.add(buildingMesh);

    // 施工鷹架與警示信號燈 (規則 5)
    const scaffoldingGroup = this.createScaffoldingMesh(W, D);
    buildingGroup.add(scaffoldingGroup);

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
      scaffoldingGroup,
      status: 'constructing',
      constructionProgress: 0.0,
      constructionDuration: 6.0,
      registeredResidents: peopleCount,
      currentOccupants: 0,
      isCoLiving,
      moveInStatus: 'none',
    };

    this.buildings.set(building.id, building);
    buildingGroup.userData = { buildingId: building.id };
  }

  private createScaffoldingMesh(w: number, d: number): THREE.Group {
    const scaf = new THREE.Group();
    scaf.name = 'ScaffoldingGroup';

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.8,
      roughness: 0.3,
    });

    const hw = w / 2;
    const hd = d / 2;
    const height = 1.8;

    const corners = [
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, hd],
    ];

    const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, height, 6);
    corners.forEach(([px, pz]) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(px, height / 2, pz);
      scaf.add(pole);
    });

    const barGeoX = new THREE.BoxGeometry(w, 0.03, 0.03);
    const barGeoZ = new THREE.BoxGeometry(0.03, 0.03, d);

    [height * 0.45, height * 0.95].forEach((y) => {
      const barN = new THREE.Mesh(barGeoX, poleMat);
      barN.position.set(0, y, -hd);
      scaf.add(barN);

      const barS = new THREE.Mesh(barGeoX, poleMat);
      barS.position.set(0, y, hd);
      scaf.add(barS);

      const barW = new THREE.Mesh(barGeoZ, poleMat);
      barW.position.set(-hw, y, 0);
      scaf.add(barW);

      const barE = new THREE.Mesh(barGeoZ, poleMat);
      barE.position.set(hw, y, 0);
      scaf.add(barE);
    });

    const beaconGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.name = 'scaffoldingBeacon';
    beacon.position.set(hw, height + 0.1, hd);
    scaf.add(beacon);

    return scaf;
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
        building.buildingMesh.position.y = (prog - 1.0) * 0.8;
        building.buildingMesh.scale.set(1.0, Math.max(0.05, prog), 1.0);

        const beacon = building.scaffoldingGroup.getObjectByName('scaffoldingBeacon') as THREE.Mesh;
        if (beacon && beacon.material instanceof THREE.MeshBasicMaterial) {
          const blink = (Math.sin(Date.now() * 0.008) + 1) * 0.5;
          beacon.material.color.setRGB(1.0, 0.8 * blink, 0.1);
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

    // 觸發市民開車自邊界公路進入城市
    this.dispatchCitizenVehicle(building);
  }

  /**
   * 派遣市民車輛自外部邊界公路開車進入城市直達住處家門
   */
  private dispatchCitizenVehicle(building: PlacedBuilding): void {
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
      // 開車抵達家門前消失，房內人數正式生效
      building.currentOccupants = building.registeredResidents;
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
          <span>🏗️</span> ${meta.name} (建造中)
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

  public getLatestMatchingResult(): MatchingResult | null {
    return this.latestMatchingResult;
  }
}
