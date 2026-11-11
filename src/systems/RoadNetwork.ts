import * as THREE from 'three';
import { RoadTextureFactory } from '../rendering/RoadTextureFactory';
import { TrafficLightRenderer, TrafficSignalState } from '../rendering/TrafficLightRenderer';
import { RoadMarkingFactory } from '../rendering/RoadMarkingFactory';

export type RoadTileType = 'Straight' | 'Corner' | 'ThreeWay' | 'FourWay' | 'DeadEnd';

export interface DirectedLane {
  id: string;                      // 唯一車道編號，例如 "lane_1_1_S"
  tileKey: string;
  direction: 'N' | 'S' | 'E' | 'W';// 行駛方位 (N=-Z, S=+Z, E=+X, W=-X)
  entryPoint: THREE.Vector3;       // 進入車道點 (世界座標)
  centerPoint: THREE.Vector3;      // 車道中心點
  exitPoint: THREE.Vector3;        // 離開車道點
  waypoints: THREE.Vector3[];      // 平滑路徑點序列 (車輛行駛依循此序列)
  connectedNextLaneIds: string[];  // 下游可無縫銜接的車道編號 (支援尋路)
  speedLimit: number;              // 速限 (m/s)
  isIntersection: boolean;
  intersectionKey?: string;        // 若為路口車道，記錄所屬之 Intersection Key
  controllingSignal?: 'northSouth' | 'eastWest'; // 控制進入該車道之號誌
}

export interface IntersectionData {
  key: string;
  gx: number;
  gz: number;
  type: 'ThreeWay' | 'FourWay';
  trafficLight: TrafficLightRenderer | null;
  phase: 'NorthSouthGreen' | 'NorthSouthYellow' | 'AllRed1' | 'EastWestGreen' | 'EastWestYellow' | 'AllRed2';
  timer: number;
  signalState: TrafficSignalState;
  hasNorthSouth: boolean;
  hasEastWest: boolean;
}

export interface RoadTile {
  key: string;                     // "gx,gz"
  gx: number;
  gz: number;
  type: RoadTileType;
  orientation: 'X' | 'Z';
  rotationY: number;
  mesh: THREE.Mesh;
  sidewalkGroup: THREE.Group;      // 兩側立體高架人行道網格群組
  markingsGroup: THREE.Group;      // 路口行車導向標線與轉彎引導線群組
  connectedNeighbors: string[];    // 相鄰相通的格位 key
  lanes: DirectedLane[];           // 本格位內部承載的車道
}

/**
 * 道路有向網絡圖與路口控制核心 (RoadNetwork)
 * 負責：
 * 1. 自動拓撲計算（直線相連、十字路口、T 字路口、彎道）
 * 2. 路口標線與斑馬線動態切換
 * 3. 3D 紅綠燈狀態機管理（隨虛擬世界時間切換號誌，紀錄於節點）
 * 4. 車道層級連續有向圖（分批鋪設之同方向車道自動縫合，支援未來尋路與車流運行）
 */
export class RoadNetwork {
  private scene: THREE.Scene;
  private tiles: Map<string, RoadTile> = new Map();
  private intersections: Map<string, IntersectionData> = new Map();
  private allLanes: Map<string, DirectedLane> = new Map();

  // 共享道路幾何體 (2m x 0.05m x 2m)
  private roadGeometry: THREE.BoxGeometry = new THREE.BoxGeometry(2, 0.05, 2);

  // 號誌時間參數 (虛擬秒數)
  private readonly GREEN_TIME = 8.0;
  private readonly YELLOW_TIME = 2.0;
  private readonly ALL_RED_TIME = 1.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public getTile(key: string): RoadTile | undefined {
    return this.tiles.get(key);
  }

  public getAllTiles(): IterableIterator<RoadTile> {
    return this.tiles.values();
  }

  public getIntersection(key: string): IntersectionData | undefined {
    return this.intersections.get(key);
  }

  public getAllLanes(): Map<string, DirectedLane> {
    return this.allLanes;
  }

  public hasTile(key: string): boolean {
    return this.tiles.has(key);
  }

  /**
   * 批次建立邊界橫貫高速公路 (從西邊界 gx=minGx 到東邊界 gx=maxGx)
   */
  public createHighwayCorridor(gz: number = 97, minGx: number = -99, maxGx: number = 99): void {
    for (let gx = minGx; gx <= maxGx; gx += 2) {
      const key = `${gx},${gz}`;
      if (!this.tiles.has(key)) {
        const mesh = new THREE.Mesh(this.roadGeometry, RoadTextureFactory.getStraightMaterials());
        mesh.position.set(gx, 0.03, gz);
        mesh.rotation.y = Math.PI / 2; // 東西向
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        const sidewalkGroup = new THREE.Group();
        this.scene.add(sidewalkGroup);

        const markingsGroup = new THREE.Group();
        this.scene.add(markingsGroup);

        this.tiles.set(key, {
          key,
          gx,
          gz,
          type: 'Straight',
          orientation: 'X',
          rotationY: mesh.rotation.y,
          mesh,
          sidewalkGroup,
          markingsGroup,
          connectedNeighbors: [],
          lanes: [],
        });
      }
    }

    // 重新拓撲分類與車道編織
    for (const tile of this.tiles.values()) {
      this.refreshTileClassification(tile);
    }
    this.rebuildLaneGraph();
    for (const tile of this.tiles.values()) {
      this.updateMarkings(tile);
    }
  }

  /**
   * 取得外部公路西側進口車道 (向東行駛，起點於 gx=-99, gz=97)
   */
  public getHighwayWestEntryLane(): DirectedLane | null {
    return this.allLanes.get('lane_-99_97_E') ?? null;
  }

  /**
   * 取得外部公路東側進口車道 (向西行駛，起點於 gx=99, gz=97)
   */
  public getHighwayEastEntryLane(): DirectedLane | null {
    return this.allLanes.get('lane_99_97_W') ?? null;
  }

  /**
   * 取得外部公路西側出口車道 (向西駛離地圖，終點於 gx=-99, gz=97)
   */
  public getHighwayWestExitLane(): DirectedLane | null {
    return this.allLanes.get('lane_-99_97_W') ?? null;
  }

  /**
   * 取得外部公路東側出口車道 (向東駛離地圖，終點於 gx=99, gz=97)
   */
  public getHighwayEastExitLane(): DirectedLane | null {
    return this.allLanes.get('lane_99_97_E') ?? null;
  }

  /**
   * 取得外部公路進城車道 (西側或東側進口均可作為進城起點)
   */
  public getExternalSpawnLane(): DirectedLane | null {
    return this.getHighwayWestEntryLane() || this.getHighwayEastEntryLane();
  }

  /**
   * 新增或更新單一車道路塊
   */
  public addOrUpdateTile(gx: number, gz: number, defaultOrientation: 'X' | 'Z'): void {
    const key = `${gx},${gz}`;
    if (!this.tiles.has(key)) {
      // 初始創建為標準直線車道底層
      const mesh = new THREE.Mesh(this.roadGeometry, RoadTextureFactory.getStraightMaterials());
      mesh.position.set(gx, 0.03, gz);
      mesh.rotation.y = defaultOrientation === 'X' ? Math.PI / 2 : 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // 人行道群組
      const sidewalkGroup = new THREE.Group();
      this.scene.add(sidewalkGroup);

      // 路面標線與引導線群組
      const markingsGroup = new THREE.Group();
      this.scene.add(markingsGroup);

      this.tiles.set(key, {
        key,
        gx,
        gz,
        type: 'Straight',
        orientation: defaultOrientation,
        rotationY: mesh.rotation.y,
        mesh,
        sidewalkGroup,
        markingsGroup,
        connectedNeighbors: [],
        lanes: [],
      });
    }

    // 重建本格與周圍 4 鄰居的相鄰拓撲與車道圖
    this.rebuildTopologyAround(gx, gz);
  }

  /**
   * 重建特定點周圍半徑內的相交與連通關係
   */
  public rebuildTopologyAround(centerGx: number, centerGz: number): void {
    const affectedKeys: Set<string> = new Set();
    const offsets = [
      { dx: 0, dz: 0 },
      { dx: 0, dz: -2 }, // 北
      { dx: 0, dz: 2 },  // 南
      { dx: 2, dz: 0 },  // 東
      { dx: -2, dz: 0 }, // 西
      { dx: 0, dz: -4 }, // 北2格
      { dx: 0, dz: 4 },  // 南2格
      { dx: 4, dz: 0 },  // 東2格
      { dx: -4, dz: 0 }, // 西2格
    ];

    for (const off of offsets) {
      const k = `${centerGx + off.dx},${centerGz + off.dz}`;
      if (this.tiles.has(k)) {
        affectedKeys.add(k);
      }
    }

    // 1. 重新識別每個受影響格位的相鄰鄰居與路口類型
    for (const key of affectedKeys) {
      this.refreshTileClassification(this.tiles.get(key)!);
    }

    // 2. 重新編織所有受影響格位間的連續車道有向圖
    this.rebuildLaneGraph();

    // 3. 重新生成所有受影響格位的路面導向標線與轉彎引導線
    for (const key of affectedKeys) {
      const t = this.tiles.get(key);
      if (t) {
        this.updateMarkings(t);
      }
    }
  }

  /**
   * 刷新單一格位的連接拓撲與幾何材質
   */
  private refreshTileClassification(tile: RoadTile): void {
    const { gx, gz } = tile;
    const northKey = `${gx},${gz - 2}`;
    const southKey = `${gx},${gz + 2}`;
    const eastKey = `${gx + 2},${gz}`;
    const westKey = `${gx - 2},${gz}`;

    const hasN = this.tiles.has(northKey);
    const hasS = this.tiles.has(southKey);
    const hasE = this.tiles.has(eastKey);
    const hasW = this.tiles.has(westKey);

    const neighbors: string[] = [];
    if (hasN) neighbors.push(northKey);
    if (hasS) neighbors.push(southKey);
    if (hasE) neighbors.push(eastKey);
    if (hasW) neighbors.push(westKey);

    tile.connectedNeighbors = neighbors;
    const degree = neighbors.length;

    let newType: RoadTileType = 'Straight';
    let newRotY = 0;
    let newMaterials = RoadTextureFactory.getStraightMaterials();
    let isIntersection = false;

    if (degree === 4) {
      // 十字路口 (Four-Way)
      newType = 'FourWay';
      newMaterials = RoadTextureFactory.getFourWayMaterials();
      newRotY = 0;
      isIntersection = true;
    } else if (degree === 3) {
      // T 字路口 (Three-Way)
      newType = 'ThreeWay';
      newMaterials = RoadTextureFactory.getThreeWayMaterials();
      isIntersection = true;

      // 判斷哪一側是貫通無開口側（無路的一側）
      // 基準（newRotY = 0）：西側無路（連續人行道在西），開口與斑馬線在東
      if (!hasW) newRotY = 0;                      // 西側無路，支線在東
      else if (!hasN) newRotY = (3 * Math.PI) / 2; // 北側無路，支線在南
      else if (!hasE) newRotY = Math.PI;           // 東側無路，支線在西
      else if (!hasS) newRotY = Math.PI / 2;       // 南側無路，支線在北
    } else if (degree === 2) {
      if (hasN && hasS) {
        // 南北直通
        newType = 'Straight';
        newMaterials = RoadTextureFactory.getStraightMaterials();
        newRotY = 0;
      } else if (hasE && hasW) {
        // 東西直通
        newType = 'Straight';
        newMaterials = RoadTextureFactory.getStraightMaterials();
        newRotY = Math.PI / 2;
      } else {
        // 90 度彎道 (Corner)
        // 基準（newRotY = 0）：連接南 (+Z) 與東 (+X)
        newType = 'Corner';
        newMaterials = RoadTextureFactory.getCornerMaterials();
        if (hasS && hasE) newRotY = 0;
        else if (hasN && hasE) newRotY = Math.PI / 2;
        else if (hasN && hasW) newRotY = Math.PI;
        else if (hasS && hasW) newRotY = (3 * Math.PI) / 2;
      }
    } else if (degree === 1) {
      newType = 'DeadEnd';
      newMaterials = RoadTextureFactory.getStraightMaterials();
      // 依鄰居方向判定直線朝向 (鄰居在東西則為 X 軸水平直道，在南北則為 Z 軸垂直直道)
      newRotY = hasE || hasW ? Math.PI / 2 : 0;
    } else {
      // 孤立單格
      newType = 'Straight';
      newMaterials = RoadTextureFactory.getStraightMaterials();
      newRotY = tile.orientation === 'X' ? Math.PI / 2 : 0;
    }

    tile.type = newType;
    tile.rotationY = newRotY;
    tile.mesh.rotation.y = newRotY;
    tile.mesh.material = newMaterials;

    // 重建立體高架人行道實體
    this.updateSidewalkMeshes(tile);

    // 處理紅綠燈實體 (僅在十字或 T 字路口生成)
    if (isIntersection) {
      const hasNS = hasN || hasS;
      const hasEW = hasE || hasW;
      this.ensureIntersection(tile.key, gx, gz, newType as 'ThreeWay' | 'FourWay', hasNS, hasEW);
    } else {
      this.removeIntersection(tile.key);
    }
  }

  /**
   * 重建本格位的立體高架人行道實體
   * 人行道寬度 0.22m，高度比車道高出 0.035m，具備獨立混凝土方磚材質與投影
   * (配合路邊停車需求縮窄人行道，車輛停於 0.62m 處 [0.52m~0.72m]，人行道自 0.78m 展開，保留 6cm 充足路緣退縮淨距)
   */
  private updateSidewalkMeshes(tile: RoadTile): void {
    tile.sidewalkGroup.clear();
    tile.sidewalkGroup.position.set(tile.gx, 0, tile.gz);
    tile.sidewalkGroup.rotation.y = tile.rotationY;

    const swMat = RoadTextureFactory.getSidewalkMaterial();
    const swHeight = 0.07;
    const swPosY = 0.035; // 頂部高達 0.07m (比車道 0.035m 高出 0.035m，形成真實路緣階梯)
    const swWidth = 0.22; // 縮窄後人行道寬度 0.22m (覆蓋 0.78m ~ 1.00m)
    const swCenter = 0.89; // 人行道中心線 (1.00 - 0.11 = 0.89m)

    const addBox = (w: number, d: number, localX: number, localZ: number) => {
      const geo = new THREE.BoxGeometry(w, swHeight, d);
      const mesh = new THREE.Mesh(geo, swMat);
      mesh.position.set(localX, swPosY, localZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      tile.sidewalkGroup.add(mesh);
    };

    switch (tile.type) {
      case 'Straight':
      case 'DeadEnd':
        // 直線道路與路段末端：兩側各寬 0.22m 之高架立體人行道，車道中間 1.56m 全程暢通（絕不產生橫向人行道阻擋）
        addBox(swWidth, 2.0, -swCenter, 0);
        addBox(swWidth, 2.0, +swCenter, 0);
        break;

      case 'FourWay':
        // 十字路口四個轉角處的人行廣場小平台 (0.22m x 0.22m)
        // 斑馬線緊貼於四角平台之間，斑馬線寬度與人行道完全一致 (0.22m)
        addBox(swWidth, swWidth, -swCenter, -swCenter);
        addBox(swWidth, swWidth, +swCenter, -swCenter);
        addBox(swWidth, swWidth, -swCenter, +swCenter);
        addBox(swWidth, swWidth, +swCenter, +swCenter);
        break;

      case 'ThreeWay':
        // T 字路口：西側為直線貫通高架人行道，東側兩角為支線兩旁之人行廣場小平台
        // 直線部分車道全程暢通，僅支線設有橫跨車道之人行穿越道
        addBox(swWidth, 2.0, -swCenter, 0);
        addBox(swWidth, swWidth, +swCenter, -swCenter);
        addBox(swWidth, swWidth, +swCenter, +swCenter);
        break;

      case 'Corner':
        // 轉彎道外側連續高架人行道 (覆蓋西側與北側，無縫銜接相鄰兩條車道外側人行道)
        addBox(swWidth, 2.0, -swCenter, 0);
        addBox(2.0 - swWidth, swWidth, swWidth / 2, -swCenter);
        // 外側轉角梯形/方形補齊 (填滿外側轉角至外弧半徑處)
        addBox(0.4, 0.4, -0.45, -0.45);
        // 轉彎道內側轉角人行道 (精準連接相鄰兩條車道內側人行道)
        addBox(swWidth, swWidth, +swCenter, +swCenter);
        break;
    }
  }

  /**
   * 重建本格位的行車導向標線與路口停止線
   * 遵循標準道路工程規範：
   * 1. 路口內部 (FourWay / ThreeWay) 與彎道 (Corner) 保持純淨平整瀝青路面，絕不在路口中心繪製任何雜亂線段或箭頭。
   * 2. 導向箭頭標線僅在「進入路口前之接近直道車道 (Approach Lanes)」精準繪製 1 枚，讓駕駛人在進入路口前清楚確認可行駛之方向。
   * 3. 停止線 (Stop Line) 繪製於接近路口端單側進口車道上（距離路口交界處 0.15m），提供車輛停等號誌與防範壓上斑馬線之精確視覺基準。
   */
  private updateMarkings(tile: RoadTile): void {
    tile.markingsGroup.clear();

    const { gx, gz, type } = tile;

    // 僅在直線車道或路段末端 (Straight / DeadEnd) 上且該車道朝向路口前進時，於接近端車道繪製導向標線與停止線
    if (type !== 'Straight' && type !== 'DeadEnd') {
      return;
    }

    const northKey = `${gx},${gz - 2}`;
    const southKey = `${gx},${gz + 2}`;
    const eastKey = `${gx + 2},${gz}`;
    const westKey = `${gx - 2},${gz}`;

    const LANE_OFFSET = 0.28;
    const APPROACH_OFFSET = 0.45; // 導向箭頭中心距路口交界 0.55m
    const STOP_LINE_OFFSET = 0.85; // 停止線中心距格位中心 0.85m (即距離路口交界處 0.15m)
    const STOP_LINE_LANE_CENTER = 0.41; // 停止線中心偏離道路中線 0.41m (涵蓋 0.06m ~ 0.76m 進口車道)

    // 1. 北側相鄰為路口：本格位之北向車道 (X = +LANE_OFFSET，前進方向 -Z) 即將駛入北側路口
    const northNeighbor = this.tiles.get(northKey);
    if (northNeighbor && (northNeighbor.type === 'FourWay' || northNeighbor.type === 'ThreeWay')) {
      const canStraight = this.tiles.has(`${gx},${gz - 4}`);
      const canLeft = this.tiles.has(`${gx - 2},${gz - 2}`);
      const canRight = this.tiles.has(`${gx + 2},${gz - 2}`);
      const arrowType = RoadMarkingFactory.getArrowType(canStraight, canLeft, canRight);
      const arrowMesh = RoadMarkingFactory.createArrowMesh(arrowType, 0); // 朝向 -Z (北，直行方向)
      arrowMesh.position.set(gx + LANE_OFFSET, RoadMarkingFactory.MARKING_HEIGHT, gz - APPROACH_OFFSET);
      tile.markingsGroup.add(arrowMesh);

      // 北進口車道停止線 (沿 X 軸橫跨北向進口車道)
      const stopLineMesh = RoadMarkingFactory.createStopLineMesh(false);
      stopLineMesh.position.set(gx + STOP_LINE_LANE_CENTER, RoadMarkingFactory.MARKING_HEIGHT, gz - STOP_LINE_OFFSET);
      tile.markingsGroup.add(stopLineMesh);
    }

    // 2. 南側相鄰為路口：本格位之南向車道 (X = -LANE_OFFSET，前進方向 +Z) 即將駛入南側路口
    const southNeighbor = this.tiles.get(southKey);
    if (southNeighbor && (southNeighbor.type === 'FourWay' || southNeighbor.type === 'ThreeWay')) {
      const canStraight = this.tiles.has(`${gx},${gz + 4}`);
      const canLeft = this.tiles.has(`${gx + 2},${gz + 2}`);
      const canRight = this.tiles.has(`${gx - 2},${gz + 2}`);
      const arrowType = RoadMarkingFactory.getArrowType(canStraight, canLeft, canRight);
      const arrowMesh = RoadMarkingFactory.createArrowMesh(arrowType, Math.PI); // 朝向 +Z (南，直行方向)
      arrowMesh.position.set(gx - LANE_OFFSET, RoadMarkingFactory.MARKING_HEIGHT, gz + APPROACH_OFFSET);
      tile.markingsGroup.add(arrowMesh);

      // 南進口車道停止線 (沿 X 軸橫跨南向進口車道)
      const stopLineMesh = RoadMarkingFactory.createStopLineMesh(false);
      stopLineMesh.position.set(gx - STOP_LINE_LANE_CENTER, RoadMarkingFactory.MARKING_HEIGHT, gz + STOP_LINE_OFFSET);
      tile.markingsGroup.add(stopLineMesh);
    }

    // 3. 東側相鄰為路口：本格位之東向車道 (Z = +LANE_OFFSET，前進方向 +X) 即將駛入東側路口
    const eastNeighbor = this.tiles.get(eastKey);
    if (eastNeighbor && (eastNeighbor.type === 'FourWay' || eastNeighbor.type === 'ThreeWay')) {
      const canStraight = this.tiles.has(`${gx + 4},${gz}`);
      const canLeft = this.tiles.has(`${gx + 2},${gz - 2}`);
      const canRight = this.tiles.has(`${gx + 2},${gz + 2}`);
      const arrowType = RoadMarkingFactory.getArrowType(canStraight, canLeft, canRight);
      const arrowMesh = RoadMarkingFactory.createArrowMesh(arrowType, -Math.PI / 2); // 朝向 +X (東，直行方向)
      arrowMesh.position.set(gx + APPROACH_OFFSET, RoadMarkingFactory.MARKING_HEIGHT, gz + LANE_OFFSET);
      tile.markingsGroup.add(arrowMesh);

      // 東進口車道停止線 (沿 Z 軸橫跨東向進口車道)
      const stopLineMesh = RoadMarkingFactory.createStopLineMesh(true);
      stopLineMesh.position.set(gx + STOP_LINE_OFFSET, RoadMarkingFactory.MARKING_HEIGHT, gz + STOP_LINE_LANE_CENTER);
      tile.markingsGroup.add(stopLineMesh);
    }

    // 4. 西側相鄰為路口：本格位之西向車道 (Z = -LANE_OFFSET，前進方向 -X) 即將駛入西側路口
    const westNeighbor = this.tiles.get(westKey);
    if (westNeighbor && (westNeighbor.type === 'FourWay' || westNeighbor.type === 'ThreeWay')) {
      const canStraight = this.tiles.has(`${gx - 4},${gz}`);
      const canLeft = this.tiles.has(`${gx - 2},${gz + 2}`);
      const canRight = this.tiles.has(`${gx - 2},${gz - 2}`);
      const arrowType = RoadMarkingFactory.getArrowType(canStraight, canLeft, canRight);
      const arrowMesh = RoadMarkingFactory.createArrowMesh(arrowType, Math.PI / 2); // 朝向 -X (西，直行方向)
      arrowMesh.position.set(gx - APPROACH_OFFSET, RoadMarkingFactory.MARKING_HEIGHT, gz - LANE_OFFSET);
      tile.markingsGroup.add(arrowMesh);

      // 西進口車道停止線 (沿 Z 軸橫跨西向進口車道)
      const stopLineMesh = RoadMarkingFactory.createStopLineMesh(true);
      stopLineMesh.position.set(gx - STOP_LINE_OFFSET, RoadMarkingFactory.MARKING_HEIGHT, gz - STOP_LINE_LANE_CENTER);
      tile.markingsGroup.add(stopLineMesh);
    }
  }

  /**
   * 確保並管理路口號誌燈箱與記錄節點
   */
  private ensureIntersection(
    key: string,
    gx: number,
    gz: number,
    type: 'ThreeWay' | 'FourWay',
    hasNS: boolean,
    hasEW: boolean
  ): void {
    let inter = this.intersections.get(key);
    if (!inter) {
      const trafficLight = new TrafficLightRenderer(gx, gz, hasNS, hasEW);
      this.scene.add(trafficLight.group);

      inter = {
        key,
        gx,
        gz,
        type,
        trafficLight,
        phase: 'NorthSouthGreen',
        timer: this.GREEN_TIME,
        signalState: { northSouth: 'green', eastWest: 'red' },
        hasNorthSouth: hasNS,
        hasEastWest: hasEW,
      };
      this.intersections.set(key, inter);
    } else {
      inter.type = type;
      inter.hasNorthSouth = hasNS;
      inter.hasEastWest = hasEW;
    }
  }

  private removeIntersection(key: string): void {
    const inter = this.intersections.get(key);
    if (inter) {
      if (inter.trafficLight) {
        inter.trafficLight.destroy(this.scene);
      }
      this.intersections.delete(key);
    }
  }

  /**
   * 每幀更新紅綠燈倒數計時與狀態機（依世界時間驅動）
   */
  public updateSignals(deltaTime: number): void {
    if (deltaTime <= 0) return;

    for (const inter of this.intersections.values()) {
      inter.timer -= deltaTime;
      if (inter.timer <= 0) {
        // 進入下一個號誌相位
        switch (inter.phase) {
          case 'NorthSouthGreen':
            inter.phase = 'NorthSouthYellow';
            inter.timer = this.YELLOW_TIME;
            inter.signalState = { northSouth: 'yellow', eastWest: 'red' };
            break;
          case 'NorthSouthYellow':
            inter.phase = 'AllRed1';
            inter.timer = this.ALL_RED_TIME;
            inter.signalState = { northSouth: 'red', eastWest: 'red' };
            break;
          case 'AllRed1':
            inter.phase = 'EastWestGreen';
            inter.timer = this.GREEN_TIME;
            inter.signalState = { northSouth: 'red', eastWest: 'green' };
            break;
          case 'EastWestGreen':
            inter.phase = 'EastWestYellow';
            inter.timer = this.YELLOW_TIME;
            inter.signalState = { northSouth: 'red', eastWest: 'yellow' };
            break;
          case 'EastWestYellow':
            inter.phase = 'AllRed2';
            inter.timer = this.ALL_RED_TIME;
            inter.signalState = { northSouth: 'red', eastWest: 'red' };
            break;
          case 'AllRed2':
            inter.phase = 'NorthSouthGreen';
            inter.timer = this.GREEN_TIME;
            inter.signalState = { northSouth: 'green', eastWest: 'red' };
            break;
        }

        // 視覺刷新發光燈號
        if (inter.trafficLight) {
          inter.trafficLight.updateLights(inter.signalState);
        }
      }
    }
  }

  /**
   * 重建全網車道有向圖（生成連續且具備連通性的 LaneGraph）
   * 即使玩家分批放置車道，只要相鄰接觸，車道立即自動融合成連續網路！
   */
  private rebuildLaneGraph(): void {
    this.allLanes.clear();

    // 車道中心線偏移行車距（配合路邊停車空間規劃，行車線中心設為 0.28m，行車通道佔 0.18m~0.38m，與路緣石旁 0.62m 停車區保持 14cm 充足安全淨距，絕不碰撞）
    const LANE_OFFSET = 0.28;

    // 1. 為每個格位建立車道有向圖實體
    for (const tile of this.tiles.values()) {
      tile.lanes = [];
      const { gx, gz, type } = tile;

      // 檢查各向鄰居是否存在
      const hasN = this.tiles.has(`${gx},${gz - 2}`);
      const hasS = this.tiles.has(`${gx},${gz + 2}`);
      const hasE = this.tiles.has(`${gx + 2},${gz}`);
      const hasW = this.tiles.has(`${gx - 2},${gz}`);

      if (type === 'Straight' || type === 'DeadEnd') {
        // 直線或盡頭路段
        const isNorthSouth = tile.rotationY === 0;

        if (isNorthSouth) {
          // 南向車道 (S): entry 在北, exit 在南, 靠右行駛置中於 X = -0.325
          const entryS = new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - 1.0);
          const centerS = new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz);
          const exitS = new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + 1.0);
          const laneS: DirectedLane = {
            id: `lane_${gx}_${gz}_S`,
            tileKey: tile.key,
            direction: 'S',
            entryPoint: entryS,
            centerPoint: centerS,
            exitPoint: exitS,
            waypoints: [entryS, centerS, exitS],
            connectedNextLaneIds: [],
            speedLimit: 13.8,
            isIntersection: false,
          };
          tile.lanes.push(laneS);
          this.allLanes.set(laneS.id, laneS);

          // 北向車道 (N): entry 在南, exit 在北, 靠右行駛置中於 X = +0.325
          const entryN = new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + 1.0);
          const centerN = new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz);
          const exitN = new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - 1.0);
          const laneN: DirectedLane = {
            id: `lane_${gx}_${gz}_N`,
            tileKey: tile.key,
            direction: 'N',
            entryPoint: entryN,
            centerPoint: centerN,
            exitPoint: exitN,
            waypoints: [entryN, centerN, exitN],
            connectedNextLaneIds: [],
            speedLimit: 13.8,
            isIntersection: false,
          };
          tile.lanes.push(laneN);
          this.allLanes.set(laneN.id, laneN);

          // 若為路段末端死巷 (DeadEnd)，動態生成平滑掉頭 (U-Turn) 弧線車道
          if (type === 'DeadEnd') {
            if (!hasN) {
              const uWps = this.sampleBezier(exitN, new THREE.Vector3(gx, 0.04, gz - 0.75), entryS, 4);
              const uTurnN: DirectedLane = {
                id: `lane_${gx}_${gz}_UTurn_N`,
                tileKey: tile.key,
                direction: 'S',
                entryPoint: exitN,
                centerPoint: uWps[Math.floor(uWps.length / 2)],
                exitPoint: entryS,
                waypoints: uWps,
                connectedNextLaneIds: [],
                speedLimit: 8.3,
                isIntersection: false,
              };
              tile.lanes.push(uTurnN);
              this.allLanes.set(uTurnN.id, uTurnN);
            }
            if (!hasS) {
              const uWps = this.sampleBezier(exitS, new THREE.Vector3(gx, 0.04, gz + 0.75), entryN, 4);
              const uTurnS: DirectedLane = {
                id: `lane_${gx}_${gz}_UTurn_S`,
                tileKey: tile.key,
                direction: 'N',
                entryPoint: exitS,
                centerPoint: uWps[Math.floor(uWps.length / 2)],
                exitPoint: entryN,
                waypoints: uWps,
                connectedNextLaneIds: [],
                speedLimit: 8.3,
                isIntersection: false,
              };
              tile.lanes.push(uTurnS);
              this.allLanes.set(uTurnS.id, uTurnS);
            }
          }
        } else {
          // 東西向車道
          // 東向車道 (E): entry 在西, exit 在東, 靠右行駛置中於 Z = +0.325
          const entryE = new THREE.Vector3(gx - 1.0, 0.04, gz + LANE_OFFSET);
          const centerE = new THREE.Vector3(gx, 0.04, gz + LANE_OFFSET);
          const exitE = new THREE.Vector3(gx + 1.0, 0.04, gz + LANE_OFFSET);
          const laneE: DirectedLane = {
            id: `lane_${gx}_${gz}_E`,
            tileKey: tile.key,
            direction: 'E',
            entryPoint: entryE,
            centerPoint: centerE,
            exitPoint: exitE,
            waypoints: [entryE, centerE, exitE],
            connectedNextLaneIds: [],
            speedLimit: 13.8,
            isIntersection: false,
          };
          tile.lanes.push(laneE);
          this.allLanes.set(laneE.id, laneE);

          // 西向車道 (W): entry 在東, exit 在西, 靠右行駛置中於 Z = -0.325
          const entryW = new THREE.Vector3(gx + 1.0, 0.04, gz - LANE_OFFSET);
          const centerW = new THREE.Vector3(gx, 0.04, gz - LANE_OFFSET);
          const exitW = new THREE.Vector3(gx - 1.0, 0.04, gz - LANE_OFFSET);
          const laneW: DirectedLane = {
            id: `lane_${gx}_${gz}_W`,
            tileKey: tile.key,
            direction: 'W',
            entryPoint: entryW,
            centerPoint: centerW,
            exitPoint: exitW,
            waypoints: [entryW, centerW, exitW],
            connectedNextLaneIds: [],
            speedLimit: 13.8,
            isIntersection: false,
          };
          tile.lanes.push(laneW);
          this.allLanes.set(laneW.id, laneW);

          // 東西向路段末端死巷 (DeadEnd) 掉頭車道
          if (type === 'DeadEnd') {
            if (!hasE) {
              const uWps = this.sampleBezier(exitE, new THREE.Vector3(gx + 0.75, 0.04, gz), entryW, 4);
              const uTurnE: DirectedLane = {
                id: `lane_${gx}_${gz}_UTurn_E`,
                tileKey: tile.key,
                direction: 'W',
                entryPoint: exitE,
                centerPoint: uWps[Math.floor(uWps.length / 2)],
                exitPoint: entryW,
                waypoints: uWps,
                connectedNextLaneIds: [],
                speedLimit: 8.3,
                isIntersection: false,
              };
              tile.lanes.push(uTurnE);
              this.allLanes.set(uTurnE.id, uTurnE);
            }
            if (!hasW) {
              const uWps = this.sampleBezier(exitW, new THREE.Vector3(gx - 0.75, 0.04, gz), entryE, 4);
              const uTurnW: DirectedLane = {
                id: `lane_${gx}_${gz}_UTurn_W`,
                tileKey: tile.key,
                direction: 'E',
                entryPoint: exitW,
                centerPoint: uWps[Math.floor(uWps.length / 2)],
                exitPoint: entryE,
                waypoints: uWps,
                connectedNextLaneIds: [],
                speedLimit: 8.3,
                isIntersection: false,
              };
              tile.lanes.push(uTurnW);
              this.allLanes.set(uTurnW.id, uTurnW);
            }
          }
        }
      } else if (type === 'Corner') {
        // 90 度彎道：生成兩條平滑弧線車道
        const addCornerLane = (
          id: string,
          dir: 'N' | 'S' | 'E' | 'W',
          p0: THREE.Vector3,
          p1: THREE.Vector3,
          p2: THREE.Vector3
        ) => {
          const wps = this.sampleBezier(p0, p1, p2, 6);
          const lane: DirectedLane = {
            id,
            tileKey: tile.key,
            direction: dir,
            entryPoint: p0,
            centerPoint: wps[Math.floor(wps.length / 2)],
            exitPoint: p2,
            waypoints: wps,
            connectedNextLaneIds: [],
            speedLimit: 11.1, // 40 km/h 轉彎減速
            isIntersection: false,
          };
          tile.lanes.push(lane);
          this.allLanes.set(lane.id, lane);
        };

        if (hasS && hasW) {
          // 西往南 (右轉)
          addCornerLane(
            `lane_${gx}_${gz}_W_to_S`,
            'S',
            new THREE.Vector3(gx - 1.0, 0.04, gz + LANE_OFFSET),
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + LANE_OFFSET),
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + 1.0)
          );
          // 南往西 (左轉)
          addCornerLane(
            `lane_${gx}_${gz}_S_to_W`,
            'W',
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + 1.0),
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - LANE_OFFSET),
            new THREE.Vector3(gx - 1.0, 0.04, gz - LANE_OFFSET)
          );
        } else if (hasS && hasE) {
          // 東往南 (左轉)
          addCornerLane(
            `lane_${gx}_${gz}_E_to_S`,
            'S',
            new THREE.Vector3(gx + 1.0, 0.04, gz - LANE_OFFSET),
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - LANE_OFFSET),
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + 1.0)
          );
          // 南往東 (右轉)
          addCornerLane(
            `lane_${gx}_${gz}_S_to_E`,
            'E',
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + 1.0),
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + LANE_OFFSET),
            new THREE.Vector3(gx + 1.0, 0.04, gz + LANE_OFFSET)
          );
        } else if (hasN && hasE) {
          // 北往東 (右轉)
          addCornerLane(
            `lane_${gx}_${gz}_N_to_E`,
            'E',
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - 1.0),
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + LANE_OFFSET),
            new THREE.Vector3(gx + 1.0, 0.04, gz + LANE_OFFSET)
          );
          // 東往北 (左轉)
          addCornerLane(
            `lane_${gx}_${gz}_E_to_N`,
            'N',
            new THREE.Vector3(gx + 1.0, 0.04, gz - LANE_OFFSET),
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - LANE_OFFSET),
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - 1.0)
          );
        } else if (hasN && hasW) {
          // 北往西 (左轉)
          addCornerLane(
            `lane_${gx}_${gz}_N_to_W`,
            'W',
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - 1.0),
            new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - LANE_OFFSET),
            new THREE.Vector3(gx - 1.0, 0.04, gz - LANE_OFFSET)
          );
          // 西往北 (右轉)
          addCornerLane(
            `lane_${gx}_${gz}_W_to_N`,
            'N',
            new THREE.Vector3(gx - 1.0, 0.04, gz + LANE_OFFSET),
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + LANE_OFFSET),
            new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - 1.0)
          );
        }
      } else if (type === 'ThreeWay' || type === 'FourWay') {
        // 路口：生成所有合法連通之直行與轉彎車道，並掛載號誌控制器
        const addIntersectionLane = (
          id: string,
          dir: 'N' | 'S' | 'E' | 'W',
          p0: THREE.Vector3,
          p1: THREE.Vector3,
          p2: THREE.Vector3,
          ctrlSignal: 'northSouth' | 'eastWest'
        ) => {
          const wps = this.sampleBezier(p0, p1, p2, 6);
          const lane: DirectedLane = {
            id,
            tileKey: tile.key,
            direction: dir,
            entryPoint: p0,
            centerPoint: wps[Math.floor(wps.length / 2)],
            exitPoint: p2,
            waypoints: wps,
            connectedNextLaneIds: [],
            speedLimit: 9.7, // 35 km/h 路口減速慢行
            isIntersection: true,
            intersectionKey: tile.key,
            controllingSignal: ctrlSignal,
          };
          tile.lanes.push(lane);
          this.allLanes.set(lane.id, lane);
        };

        // 入口點定義 (Inbound) - 置中於 0.325m
        const inN = new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - 1.0);
        const inS = new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + 1.0);
        const inE = new THREE.Vector3(gx + 1.0, 0.04, gz - LANE_OFFSET);
        const inW = new THREE.Vector3(gx - 1.0, 0.04, gz + LANE_OFFSET);

        // 出口點定義 (Outbound) - 置中於 0.325m
        const outN = new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - 1.0);
        const outS = new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + 1.0);
        const outE = new THREE.Vector3(gx + 1.0, 0.04, gz + LANE_OFFSET);
        const outW = new THREE.Vector3(gx - 1.0, 0.04, gz - LANE_OFFSET);

        // 從北進入 (受南北向號誌控制)
        if (hasN) {
          if (hasS) addIntersectionLane(`lane_${gx}_${gz}_N_to_S`, 'S', inN, new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz), outS, 'northSouth');
          if (hasW) addIntersectionLane(`lane_${gx}_${gz}_N_to_W`, 'W', inN, new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - LANE_OFFSET), outW, 'northSouth');
          if (hasE) addIntersectionLane(`lane_${gx}_${gz}_N_to_E`, 'E', inN, new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + LANE_OFFSET), outE, 'northSouth');
        }

        // 從南進入 (受南北向號誌控制)
        if (hasS) {
          if (hasN) addIntersectionLane(`lane_${gx}_${gz}_S_to_N`, 'N', inS, new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz), outN, 'northSouth');
          if (hasE) addIntersectionLane(`lane_${gx}_${gz}_S_to_E`, 'E', inS, new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + LANE_OFFSET), outE, 'northSouth');
          if (hasW) addIntersectionLane(`lane_${gx}_${gz}_S_to_W`, 'W', inS, new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - LANE_OFFSET), outW, 'northSouth');
        }

        // 從東進入 (受東西向號誌控制)
        if (hasE) {
          if (hasW) addIntersectionLane(`lane_${gx}_${gz}_E_to_W`, 'W', inE, new THREE.Vector3(gx, 0.04, gz - LANE_OFFSET), outW, 'eastWest');
          if (hasN) addIntersectionLane(`lane_${gx}_${gz}_E_to_N`, 'N', inE, new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz - LANE_OFFSET), outN, 'eastWest');
          if (hasS) addIntersectionLane(`lane_${gx}_${gz}_E_to_S`, 'S', inE, new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz - LANE_OFFSET), outS, 'eastWest');
        }

        // 從西進入 (受東西向號誌控制)
        if (hasW) {
          if (hasE) addIntersectionLane(`lane_${gx}_${gz}_W_to_E`, 'E', inW, new THREE.Vector3(gx, 0.04, gz + LANE_OFFSET), outE, 'eastWest');
          if (hasS) addIntersectionLane(`lane_${gx}_${gz}_W_to_S`, 'S', inW, new THREE.Vector3(gx - LANE_OFFSET, 0.04, gz + LANE_OFFSET), outS, 'eastWest');
          if (hasN) addIntersectionLane(`lane_${gx}_${gz}_W_to_N`, 'N', inW, new THREE.Vector3(gx + LANE_OFFSET, 0.04, gz + LANE_OFFSET), outN, 'eastWest');
        }
      }
    }

    // 2. 跨格位車道拓撲自動縫合（透過 exitPoint 與相鄰格位 entryPoint 之空間鄰接自動串接）
    for (const lane of this.allLanes.values()) {
      lane.connectedNextLaneIds = [];

      for (const nextLane of this.allLanes.values()) {
        if (lane.id === nextLane.id) continue;
        // 檢查前車道出口點是否與後車道入口點緊密吻合 (< 0.08m)
        if (lane.exitPoint.distanceTo(nextLane.entryPoint) < 0.08) {
          lane.connectedNextLaneIds.push(nextLane.id);
        }
      }
    }
  }

  private sampleBezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, steps = 6): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const it = 1 - t;
      const x = it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x;
      const y = it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y;
      const z = it * it * p0.z + 2 * it * t * p1.z + t * t * p2.z;
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  }
}
