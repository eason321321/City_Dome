import * as THREE from 'three';
import { RoadTile } from './RoadNetwork';
import { PlacedBuilding } from './BuildingManager';
import { CurbsideSpot } from '../simulation/ParkingManager';

export type PedestrianNodeType = 'sidewalk' | 'crosswalk' | 'corner' | 'transition';

export interface PedestrianWaypoint {
  position: THREE.Vector3;
  isCrosswalk?: boolean;
  isCrosswalkStart?: boolean;             // 進入斑馬線前的停等點（人行道路緣石處）
  intersectionKey?: string;               // 所屬路口 Key
  crosswalkArm?: 'N' | 'S' | 'E' | 'W';   // 橫跨之路口臂
  pedestrianSignal?: 'northSouth' | 'eastWest'; // 控制該穿越道通行之號誌綠燈相
}

export interface PedestrianEdge {
  targetNodeId: string;
  distance: number;
  isCrosswalk: boolean;
  intersectionKey?: string;
  crosswalkArm?: 'N' | 'S' | 'E' | 'W';
  pedestrianSignal?: 'northSouth' | 'eastWest';
}

export interface PedestrianNode {
  id: string;
  position: THREE.Vector3;
  tileKey: string;
  type: PedestrianNodeType;
  edges: PedestrianEdge[];
  intersectionKey?: string;
  crosswalkArm?: 'N' | 'S' | 'E' | 'W';
  pedestrianSignal?: 'northSouth' | 'eastWest';
}

export interface PedestrianPathResult {
  waypoints: THREE.Vector3[];
  routeWaypoints: PedestrianWaypoint[];
  nodeIds: string[];
  totalDistance: number;
  crosswalkCount: number;
  description: string;
}

/**
 * 行人人行道路網與尋路規劃系統 (Pedestrian Network & Pathfinding Engine)
 * 專門負責城市人行動線、高架立體人行道、路口斑馬線穿越道拓撲構建與雙向 A* 尋路。
 * 市民步行上班、出行、返家皆依循此路網，絕不走入機動車道。
 */
export class PedestrianNetwork {
  private nodes: Map<string, PedestrianNode> = new Map();
  private debugGroup: THREE.Group = new THREE.Group();
  private isDebugVisible: boolean = false;

  // 人行道實體規格參數（與 RoadNetwork.updateSidewalkMeshes 完全吻合）
  private readonly SW_CENTER = 0.89;   // 人行道中心偏離道路中線 0.89m (1.0 - 0.22 / 2)
  private readonly SW_HEIGHT = 0.07;   // 人行道頂部離地高 0.07m (比車道 0.035m 高，形成立體路緣)
  private readonly ZEBRA_Y = 0.045;    // 斑馬線穿越道高度 (略高於車道 0.035m，防 Z-fighting)

  constructor() {
    this.debugGroup.name = 'PedestrianNetwork_Debug';
    this.debugGroup.visible = false;
  }

  public getDebugGroup(): THREE.Group {
    return this.debugGroup;
  }

  public setDebugVisible(visible: boolean): void {
    this.isDebugVisible = visible;
    this.debugGroup.visible = visible;
  }

  public isDebugModeActive(): boolean {
    return this.isDebugVisible;
  }

  public getAllNodes(): Map<string, PedestrianNode> {
    return this.nodes;
  }

  /**
   * 重建全地圖行人路網
   * @param tiles 道路格位地圖
   */
  public rebuild(tiles: Map<string, RoadTile>): void {
    this.nodes.clear();

    for (const tile of tiles.values()) {
      this.buildTilePedestrianGraph(tile, tiles);
    }

    if (this.isDebugVisible) {
      this.updateDebugVisualization();
    }
  }

  /**
   * 節點唯一鍵值（毫米級量化，確保相鄰路塊接縫處端點無縫融合）
   */
  private getNodeKey(x: number, z: number): string {
    const rx = (Math.round(x * 100) / 100).toFixed(2);
    const rz = (Math.round(z * 100) / 100).toFixed(2);
    return `p_${rx}_${rz}`;
  }

  private getOrCreateNode(
    pos: THREE.Vector3,
    tileKey: string,
    type: PedestrianNodeType
  ): PedestrianNode {
    const key = this.getNodeKey(pos.x, pos.z);
    let node = this.nodes.get(key);
    if (!node) {
      node = {
        id: key,
        position: pos.clone(),
        tileKey,
        type,
        edges: [],
      };
      this.nodes.set(key, node);
    } else {
      // 若已有此點但先前為普通點，若當前為斑馬線或轉角則升級標記
      if (type === 'crosswalk' || type === 'corner') {
        node.type = type;
      }
    }
    return node;
  }

  /**
   * 輔助函式：根據斑馬線世界座標與路口中心，精準判定其橫跨之路口臂與受控號誌相
   * 1. 橫跨南北向切面（North/South arm）：代表車流為南北向，當南北向紅燈（東西向綠燈）時行人通行，故行人號誌綠燈相為 'eastWest'。
   * 2. 橫跨東西向切面（East/West arm）：代表車流為東西向，當東西向紅燈（南北向綠燈）時行人通行，故行人號誌綠燈相為 'northSouth'。
   */
  public static getCrosswalkArmAndSignal(
    gx: number,
    gz: number,
    crosswalkPos: THREE.Vector3
  ): { arm: 'N' | 'S' | 'E' | 'W'; signal: 'northSouth' | 'eastWest' } {
    const dx = crosswalkPos.x - gx;
    const dz = crosswalkPos.z - gz;
    if (Math.abs(dz) > Math.abs(dx)) {
      const arm: 'N' | 'S' = dz < 0 ? 'N' : 'S';
      return { arm, signal: 'eastWest' };
    } else {
      const arm: 'E' | 'W' = dx < 0 ? 'W' : 'E';
      return { arm, signal: 'northSouth' };
    }
  }

  private addEdge(
    nodeA: PedestrianNode,
    nodeB: PedestrianNode,
    isCrosswalk: boolean = false,
    intersectionKey?: string,
    crosswalkArm?: 'N' | 'S' | 'E' | 'W',
    pedestrianSignal?: 'northSouth' | 'eastWest'
  ): void {
    if (nodeA.id === nodeB.id) return;
    const dist = nodeA.position.distanceTo(nodeB.position);
    if (!nodeA.edges.some((e) => e.targetNodeId === nodeB.id)) {
      nodeA.edges.push({
        targetNodeId: nodeB.id,
        distance: dist,
        isCrosswalk,
        intersectionKey,
        crosswalkArm,
        pedestrianSignal,
      });
    }
    if (!nodeB.edges.some((e) => e.targetNodeId === nodeA.id)) {
      nodeB.edges.push({
        targetNodeId: nodeA.id,
        distance: dist,
        isCrosswalk,
        intersectionKey,
        crosswalkArm,
        pedestrianSignal,
      });
    }
  }

  /**
   * 將局部格位座標轉為世界座標（依路塊旋轉角 rotationY 精準投影）
   */
  private localToWorld(
    tile: RoadTile,
    lx: number,
    lz: number,
    y: number = this.SW_HEIGHT
  ): THREE.Vector3 {
    const v = new THREE.Vector3(lx, 0, lz);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), tile.rotationY);
    v.add(new THREE.Vector3(tile.gx, y, tile.gz));
    return v;
  }

  /**
   * 針對單一車道路塊構建行人拓撲
   */
  private buildTilePedestrianGraph(
    tile: RoadTile,
    allTiles: Map<string, RoadTile>
  ): void {
    const { gx, gz, type } = tile;
    const swC = this.SW_CENTER;

    const hasN = allTiles.has(`${gx},${gz - 2}`);
    const hasS = allTiles.has(`${gx},${gz + 2}`);
    const hasE = allTiles.has(`${gx + 2},${gz}`);
    const hasW = allTiles.has(`${gx - 2},${gz}`);

    switch (type) {
      case 'Straight':
      case 'DeadEnd': {
        // 直線與盡頭路段：兩側各有一條人行道
        // Side A (local X = -swC):
        const a1 = this.getOrCreateNode(this.localToWorld(tile, -swC, -1.0), tile.key, 'sidewalk');
        const a2 = this.getOrCreateNode(this.localToWorld(tile, -swC, 0.0), tile.key, 'sidewalk');
        const a3 = this.getOrCreateNode(this.localToWorld(tile, -swC, +1.0), tile.key, 'sidewalk');
        this.addEdge(a1, a2);
        this.addEdge(a2, a3);

        // Side B (local X = +swC):
        const b1 = this.getOrCreateNode(this.localToWorld(tile, +swC, -1.0), tile.key, 'sidewalk');
        const b2 = this.getOrCreateNode(this.localToWorld(tile, +swC, 0.0), tile.key, 'sidewalk');
        const b3 = this.getOrCreateNode(this.localToWorld(tile, +swC, +1.0), tile.key, 'sidewalk');
        this.addEdge(b1, b2);
        this.addEdge(b2, b3);

        // 若為盡頭路段 (DeadEnd)，於無路端點提供行人掉頭或橫越人行穿越道
        if (type === 'DeadEnd') {
          const isNS = tile.rotationY === 0;
          if (isNS) {
            if (!hasN) {
              const crossMid = this.getOrCreateNode(new THREE.Vector3(gx, this.ZEBRA_Y, gz - swC), tile.key, 'crosswalk');
              this.addEdge(a1, crossMid, true);
              this.addEdge(crossMid, b1, true);
            }
            if (!hasS) {
              const crossMid = this.getOrCreateNode(new THREE.Vector3(gx, this.ZEBRA_Y, gz + swC), tile.key, 'crosswalk');
              this.addEdge(a3, crossMid, true);
              this.addEdge(crossMid, b3, true);
            }
          } else {
            // 東西向
            if (!hasW) {
              const crossMid = this.getOrCreateNode(new THREE.Vector3(gx - swC, this.ZEBRA_Y, gz), tile.key, 'crosswalk');
              const wA = this.getOrCreateNode(this.localToWorld(tile, -swC, -1.0), tile.key, 'sidewalk');
              const wB = this.getOrCreateNode(this.localToWorld(tile, +swC, -1.0), tile.key, 'sidewalk');
              this.addEdge(wA, crossMid, true);
              this.addEdge(crossMid, wB, true);
            }
            if (!hasE) {
              const crossMid = this.getOrCreateNode(new THREE.Vector3(gx + swC, this.ZEBRA_Y, gz), tile.key, 'crosswalk');
              const eA = this.getOrCreateNode(this.localToWorld(tile, -swC, +1.0), tile.key, 'sidewalk');
              const eB = this.getOrCreateNode(this.localToWorld(tile, +swC, +1.0), tile.key, 'sidewalk');
              this.addEdge(eA, crossMid, true);
              this.addEdge(crossMid, eB, true);
            }
          }
        }
        break;
      }

      case 'FourWay': {
        // 十字路口：四個轉角人行廣場小平台 (NW, NE, SW, SE)
        const cNW = this.getOrCreateNode(this.localToWorld(tile, -swC, -swC), tile.key, 'corner');
        const cNE = this.getOrCreateNode(this.localToWorld(tile, +swC, -swC), tile.key, 'corner');
        const cSW = this.getOrCreateNode(this.localToWorld(tile, -swC, +swC), tile.key, 'corner');
        const cSE = this.getOrCreateNode(this.localToWorld(tile, +swC, +swC), tile.key, 'corner');

        // 與相鄰四面路塊邊界的人行道端點無縫相接
        const bN_W = this.getOrCreateNode(this.localToWorld(tile, -swC, -1.0), tile.key, 'sidewalk');
        const bN_E = this.getOrCreateNode(this.localToWorld(tile, +swC, -1.0), tile.key, 'sidewalk');
        const bS_W = this.getOrCreateNode(this.localToWorld(tile, -swC, +1.0), tile.key, 'sidewalk');
        const bS_E = this.getOrCreateNode(this.localToWorld(tile, +swC, +1.0), tile.key, 'sidewalk');
        const bW_N = this.getOrCreateNode(this.localToWorld(tile, -1.0, -swC), tile.key, 'sidewalk');
        const bW_S = this.getOrCreateNode(this.localToWorld(tile, -1.0, +swC), tile.key, 'sidewalk');
        const bE_N = this.getOrCreateNode(this.localToWorld(tile, +1.0, -swC), tile.key, 'sidewalk');
        const bE_S = this.getOrCreateNode(this.localToWorld(tile, +1.0, +swC), tile.key, 'sidewalk');

        this.addEdge(cNW, bN_W);
        this.addEdge(cNW, bW_N);

        this.addEdge(cNE, bN_E);
        this.addEdge(cNE, bE_N);

        this.addEdge(cSW, bS_W);
        this.addEdge(cSW, bW_S);

        this.addEdge(cSE, bS_E);
        this.addEdge(cSE, bE_S);

        // 4 處斑馬線行人穿越道（配備中間抽樣點，精確對齊白枕木紋，並綁定對應受控號誌相）
        const zN = this.getOrCreateNode(this.localToWorld(tile, 0.0, -swC, this.ZEBRA_Y), tile.key, 'crosswalk');
        const infoN = PedestrianNetwork.getCrosswalkArmAndSignal(gx, gz, zN.position);
        zN.intersectionKey = tile.key;
        zN.crosswalkArm = infoN.arm;
        zN.pedestrianSignal = infoN.signal;
        this.addEdge(cNW, zN, true, tile.key, infoN.arm, infoN.signal);
        this.addEdge(zN, cNE, true, tile.key, infoN.arm, infoN.signal);

        const zS = this.getOrCreateNode(this.localToWorld(tile, 0.0, +swC, this.ZEBRA_Y), tile.key, 'crosswalk');
        const infoS = PedestrianNetwork.getCrosswalkArmAndSignal(gx, gz, zS.position);
        zS.intersectionKey = tile.key;
        zS.crosswalkArm = infoS.arm;
        zS.pedestrianSignal = infoS.signal;
        this.addEdge(cSW, zS, true, tile.key, infoS.arm, infoS.signal);
        this.addEdge(zS, cSE, true, tile.key, infoS.arm, infoS.signal);

        const zW = this.getOrCreateNode(this.localToWorld(tile, -swC, 0.0, this.ZEBRA_Y), tile.key, 'crosswalk');
        const infoW = PedestrianNetwork.getCrosswalkArmAndSignal(gx, gz, zW.position);
        zW.intersectionKey = tile.key;
        zW.crosswalkArm = infoW.arm;
        zW.pedestrianSignal = infoW.signal;
        this.addEdge(cNW, zW, true, tile.key, infoW.arm, infoW.signal);
        this.addEdge(zW, cSW, true, tile.key, infoW.arm, infoW.signal);

        const zE = this.getOrCreateNode(this.localToWorld(tile, +swC, 0.0, this.ZEBRA_Y), tile.key, 'crosswalk');
        const infoE = PedestrianNetwork.getCrosswalkArmAndSignal(gx, gz, zE.position);
        zE.intersectionKey = tile.key;
        zE.crosswalkArm = infoE.arm;
        zE.pedestrianSignal = infoE.signal;
        this.addEdge(cNE, zE, true, tile.key, infoE.arm, infoE.signal);
        this.addEdge(zE, cSE, true, tile.key, infoE.arm, infoE.signal);
        break;
      }

      case 'ThreeWay': {
        // T 字路口（基準：西側無路，支線在東）
        // 西側貫通直走人行道 (local X = -swC)：
        const w1 = this.getOrCreateNode(this.localToWorld(tile, -swC, -1.0), tile.key, 'sidewalk');
        const w2 = this.getOrCreateNode(this.localToWorld(tile, -swC, -swC), tile.key, 'corner');
        const w3 = this.getOrCreateNode(this.localToWorld(tile, -swC, 0.0), tile.key, 'sidewalk');
        const w4 = this.getOrCreateNode(this.localToWorld(tile, -swC, +swC), tile.key, 'corner');
        const w5 = this.getOrCreateNode(this.localToWorld(tile, -swC, +1.0), tile.key, 'sidewalk');
        this.addEdge(w1, w2);
        this.addEdge(w2, w3);
        this.addEdge(w3, w4);
        this.addEdge(w4, w5);

        // 東側轉角平台 (NE, SE)：
        const cNE = this.getOrCreateNode(this.localToWorld(tile, +swC, -swC), tile.key, 'corner');
        const cSE = this.getOrCreateNode(this.localToWorld(tile, +swC, +swC), tile.key, 'corner');

        // 東側支線與南北兩口之邊界連接
        const bN_E = this.getOrCreateNode(this.localToWorld(tile, +swC, -1.0), tile.key, 'sidewalk');
        const bS_E = this.getOrCreateNode(this.localToWorld(tile, +swC, +1.0), tile.key, 'sidewalk');
        const bE_N = this.getOrCreateNode(this.localToWorld(tile, +1.0, -swC), tile.key, 'sidewalk');
        const bE_S = this.getOrCreateNode(this.localToWorld(tile, +1.0, +swC), tile.key, 'sidewalk');

        this.addEdge(cNE, bN_E);
        this.addEdge(cNE, bE_N);

        this.addEdge(cSE, bS_E);
        this.addEdge(cSE, bE_S);

        // 三個方向的斑馬線（北口、南口、東口支線）
        const zN = this.getOrCreateNode(this.localToWorld(tile, 0.0, -swC, this.ZEBRA_Y), tile.key, 'crosswalk');
        const infoN = PedestrianNetwork.getCrosswalkArmAndSignal(gx, gz, zN.position);
        zN.intersectionKey = tile.key;
        zN.crosswalkArm = infoN.arm;
        zN.pedestrianSignal = infoN.signal;
        this.addEdge(w2, zN, true, tile.key, infoN.arm, infoN.signal);
        this.addEdge(zN, cNE, true, tile.key, infoN.arm, infoN.signal);

        const zS = this.getOrCreateNode(this.localToWorld(tile, 0.0, +swC, this.ZEBRA_Y), tile.key, 'crosswalk');
        const infoS = PedestrianNetwork.getCrosswalkArmAndSignal(gx, gz, zS.position);
        zS.intersectionKey = tile.key;
        zS.crosswalkArm = infoS.arm;
        zS.pedestrianSignal = infoS.signal;
        this.addEdge(w4, zS, true, tile.key, infoS.arm, infoS.signal);
        this.addEdge(zS, cSE, true, tile.key, infoS.arm, infoS.signal);

        const zE = this.getOrCreateNode(this.localToWorld(tile, +swC, 0.0, this.ZEBRA_Y), tile.key, 'crosswalk');
        const infoE = PedestrianNetwork.getCrosswalkArmAndSignal(gx, gz, zE.position);
        zE.intersectionKey = tile.key;
        zE.crosswalkArm = infoE.arm;
        zE.pedestrianSignal = infoE.signal;
        this.addEdge(cNE, zE, true, tile.key, infoE.arm, infoE.signal);
        this.addEdge(zE, cSE, true, tile.key, infoE.arm, infoE.signal);
        break;
      }

      case 'Corner': {
        // 90 度彎道（基準：連接南 +Z 與東 +X，外側為西-北）
        // 外側連續彎道人行道：
        const oS = this.getOrCreateNode(this.localToWorld(tile, -swC, +1.0), tile.key, 'sidewalk');
        const oSW = this.getOrCreateNode(this.localToWorld(tile, -swC, 0.0), tile.key, 'sidewalk');
        const oCorner = this.getOrCreateNode(this.localToWorld(tile, -swC, -swC), tile.key, 'corner');
        const oNE = this.getOrCreateNode(this.localToWorld(tile, 0.0, -swC), tile.key, 'sidewalk');
        const oE = this.getOrCreateNode(this.localToWorld(tile, +1.0, -swC), tile.key, 'sidewalk');

        this.addEdge(oS, oSW);
        this.addEdge(oSW, oCorner);
        this.addEdge(oCorner, oNE);
        this.addEdge(oNE, oE);

        // 內側人行道 (SE 內角平台)：
        const iS = this.getOrCreateNode(this.localToWorld(tile, +swC, +1.0), tile.key, 'sidewalk');
        const iCorner = this.getOrCreateNode(this.localToWorld(tile, +swC, +swC), tile.key, 'corner');
        const iE = this.getOrCreateNode(this.localToWorld(tile, +1.0, +swC), tile.key, 'sidewalk');

        this.addEdge(iS, iCorner);
        this.addEdge(iCorner, iE);
        break;
      }
    }
  }

  /**
   * 搜尋兩點間的最短行人路線 (A* 演算法)
   * @param startPos 出發點（如住宅大門）
   * @param goalPos 目標點（如工廠入口）
   * @param preferSidewalkEnds 是否優先吸附至人行道邊緣節點（而非車道中央之斑馬線節點）
   */
  public findShortestPath(
    startPos: THREE.Vector3,
    goalPos: THREE.Vector3,
    preferSidewalkEnds: boolean = true
  ): PedestrianPathResult | null {
    if (this.nodes.size === 0) return null;

    // 尋找離出發點與目標點最近之人行道節點
    const startNode = this.findClosestNode(startPos, preferSidewalkEnds);
    const goalNode = this.findClosestNode(goalPos, preferSidewalkEnds);

    if (!startNode || !goalNode) return null;

    if (startNode.id === goalNode.id) {
      const rwps: PedestrianWaypoint[] = [
        { position: startPos.clone() },
        { position: startNode.position.clone() },
        { position: goalPos.clone() },
      ];
      const wps = this.deduplicateWaypoints(rwps.map((r) => r.position));
      return {
        waypoints: wps,
        routeWaypoints: rwps,
        nodeIds: [startNode.id],
        totalDistance: this.calculatePathLength(wps),
        crosswalkCount: 0,
        description: '同路段近距離直達，沿人行道步行前往。',
      };
    }

    // A* 資料結構
    const openSet: Set<string> = new Set([startNode.id]);
    const cameFrom: Map<string, {
      prevId: string;
      isCrosswalk: boolean;
      intersectionKey?: string;
      crosswalkArm?: 'N' | 'S' | 'E' | 'W';
      pedestrianSignal?: 'northSouth' | 'eastWest';
    }> = new Map();

    const gScore: Map<string, number> = new Map();
    gScore.set(startNode.id, 0);

    const fScore: Map<string, number> = new Map();
    fScore.set(startNode.id, startNode.position.distanceTo(goalNode.position));

    while (openSet.size > 0) {
      let currentId = '';
      let minF = Infinity;

      for (const id of openSet) {
        const f = fScore.get(id) ?? Infinity;
        if (f < minF) {
          minF = f;
          currentId = id;
        }
      }

      if (!currentId || minF === Infinity) break;

      if (currentId === goalNode.id) {
        return this.reconstructPath(startPos, goalPos, currentId, cameFrom);
      }

      openSet.delete(currentId);
      const currentNode = this.nodes.get(currentId)!;
      const currentG = gScore.get(currentId) ?? Infinity;

      for (const edge of currentNode.edges) {
        const nextNode = this.nodes.get(edge.targetNodeId);
        if (!nextNode) continue;

        // 計算邊成本：斑馬線橫越附加 0.8m 等效阻抗，避免無謂橫跨馬路
        const edgeCost = edge.distance + (edge.isCrosswalk ? 0.8 : 0);
        const tentativeG = currentG + edgeCost;

        if (tentativeG < (gScore.get(edge.targetNodeId) ?? Infinity)) {
          cameFrom.set(edge.targetNodeId, {
            prevId: currentId,
            isCrosswalk: edge.isCrosswalk,
            intersectionKey: edge.intersectionKey,
            crosswalkArm: edge.crosswalkArm,
            pedestrianSignal: edge.pedestrianSignal,
          });
          gScore.set(edge.targetNodeId, tentativeG);
          const h = nextNode.position.distanceTo(goalNode.position);
          fScore.set(edge.targetNodeId, tentativeG + h);

          if (!openSet.has(edge.targetNodeId)) {
            openSet.add(edge.targetNodeId);
          }
        }
      }
    }

    return null;
  }

  /**
   * 搜尋兩棟建築物之間（起點住家門口 -> 人行道路網 -> 工廠廠門）的完整人行動線
   */
  public findPathBetweenBuildings(
    originBuilding: PlacedBuilding,
    destBuilding: PlacedBuilding
  ): PedestrianPathResult | null {
    // 住家起點序列：房門 (frontDoor) -> 庭院外大門 (frontWorldPos)
    const homeDoor = originBuilding.worldCenter.clone().lerp(originBuilding.frontWorldPos, 0.45);
    homeDoor.y = 0.04;
    const homeGate = originBuilding.frontWorldPos.clone();
    homeGate.y = this.SW_HEIGHT;

    // 工廠目的地序列：工廠外門 (frontWorldPos) -> 廠區大門 (factoryDoor)
    const factoryGate = destBuilding.frontWorldPos.clone();
    factoryGate.y = this.SW_HEIGHT;
    const factoryDoor = destBuilding.worldCenter.clone().lerp(destBuilding.frontWorldPos, 0.45);
    factoryDoor.y = 0.04;

    // 先在人行道路網中規劃自 homeGate 至 factoryGate 之行人路徑
    const networkPath = this.findShortestPath(homeGate, factoryGate);
    if (!networkPath) return null;

    // 完整串接門對門動線
    const allRouteWaypoints: PedestrianWaypoint[] = [
      { position: homeDoor, isCrosswalk: false },
      ...networkPath.routeWaypoints,
      { position: factoryDoor, isCrosswalk: false },
    ];

    const cleanRouteWaypoints: PedestrianWaypoint[] = [];
    for (const rwp of allRouteWaypoints) {
      if (cleanRouteWaypoints.length > 0) {
        const last = cleanRouteWaypoints[cleanRouteWaypoints.length - 1];
        if (last.position.distanceTo(rwp.position) < 0.03) {
          if (rwp.isCrosswalkStart) last.isCrosswalkStart = true;
          if (rwp.isCrosswalk) last.isCrosswalk = true;
          if (rwp.intersectionKey) last.intersectionKey = rwp.intersectionKey;
          if (rwp.crosswalkArm) last.crosswalkArm = rwp.crosswalkArm;
          if (rwp.pedestrianSignal) last.pedestrianSignal = rwp.pedestrianSignal;
          continue;
        }
      }
      cleanRouteWaypoints.push(rwp);
    }

    const cleanWaypoints = cleanRouteWaypoints.map((rw) => rw.position.clone());
    const totalDist = this.calculatePathLength(cleanWaypoints);

    let desc = `步行總長 ${totalDist.toFixed(1)}m`;
    if (networkPath.crosswalkCount > 0) {
      desc += `，行經 ${networkPath.crosswalkCount} 處斑馬線行人穿越道`;
    } else {
      desc += '，全程沿同一側人行道直達（無需穿越馬路）';
    }

    return {
      waypoints: cleanWaypoints,
      routeWaypoints: cleanRouteWaypoints,
      nodeIds: networkPath.nodeIds,
      totalDistance: totalDist,
      crosswalkCount: networkPath.crosswalkCount,
      description: desc,
    };
  }

  /**
   * 搜尋自住家出發前往停放車輛旁上車之完整人行道尋路動線
   * 起點：住家房門 (homeDoor) -> 庭院外大門 (homeGate)
   * 途中：沿立體人行道步行，遇路口依號誌燈停等並經由斑馬線安全穿越
   * 終點：車輛停靠側之人行道邊緣 (sidewalkBoarding) -> 車門處 (carBoarding)
   * @param originBuilding 住家建築
   * @param carPosition 車輛實際停放世界座標
   * @param carSpot 車位元資訊 (若有)
   */
  public findPathToCar(
    originBuilding: PlacedBuilding,
    carPosition: THREE.Vector3,
    carSpot?: CurbsideSpot
  ): PedestrianPathResult | null {
    // 1. 住家起點序列：房門 -> 外庭大門
    const homeDoor = originBuilding.worldCenter.clone().lerp(originBuilding.frontWorldPos, 0.45);
    homeDoor.y = 0.04;
    const homeGate = originBuilding.frontWorldPos.clone();
    homeGate.y = this.SW_HEIGHT;

    // 2. 計算車輛停靠處相鄰之人行道上車等待點 (sidewalkBoarding)
    const sidewalkBoarding = carPosition.clone();
    if (carSpot) {
      // 依車位朝向向人行道中心偏移行人步道 (車位距中線 0.62m，人行道中心距中線 0.89m，差 0.27m)
      if (carSpot.side === 'west') sidewalkBoarding.x -= 0.27;
      else if (carSpot.side === 'east') sidewalkBoarding.x += 0.27;
      else if (carSpot.side === 'north') sidewalkBoarding.z -= 0.27;
      else if (carSpot.side === 'south') sidewalkBoarding.z += 0.27;
      sidewalkBoarding.y = this.SW_HEIGHT;
    } else {
      // 若無車位資訊，就近尋找最近之人行道節點
      const closest = this.findClosestNode(carPosition, true);
      if (closest) {
        sidewalkBoarding.copy(closest.position);
      } else {
        sidewalkBoarding.y = this.SW_HEIGHT;
      }
    }

    // 3. 在人行道路網中規劃自 homeGate 至 sidewalkBoarding 之尋路路徑
    const networkPath = this.findShortestPath(homeGate, sidewalkBoarding, true);
    if (!networkPath) return null;

    // 4. 車輛門邊登車點 (carBoarding)
    const carBoarding = carPosition.clone();
    carBoarding.y = 0.02; // 車輛底盤平面高度

    // 5. 完整串接人行道尋路序列
    const allRouteWaypoints: PedestrianWaypoint[] = [
      { position: homeDoor, isCrosswalk: false },
      ...networkPath.routeWaypoints,
      { position: carBoarding, isCrosswalk: false },
    ];

    // 6. 清理與去重過近航點
    const cleanRouteWaypoints: PedestrianWaypoint[] = [];
    for (const rwp of allRouteWaypoints) {
      if (cleanRouteWaypoints.length > 0) {
        const last = cleanRouteWaypoints[cleanRouteWaypoints.length - 1];
        if (last.position.distanceTo(rwp.position) < 0.03) {
          if (rwp.isCrosswalkStart) last.isCrosswalkStart = true;
          if (rwp.isCrosswalk) last.isCrosswalk = true;
          if (rwp.intersectionKey) last.intersectionKey = rwp.intersectionKey;
          if (rwp.crosswalkArm) last.crosswalkArm = rwp.crosswalkArm;
          if (rwp.pedestrianSignal) last.pedestrianSignal = rwp.pedestrianSignal;
          continue;
        }
      }
      cleanRouteWaypoints.push(rwp);
    }

    const cleanWaypoints = cleanRouteWaypoints.map((rw) => rw.position.clone());
    const totalDist = this.calculatePathLength(cleanWaypoints);

    let desc = `步行至車旁總長 ${totalDist.toFixed(1)}m`;
    if (networkPath.crosswalkCount > 0) {
      desc += `，行經 ${networkPath.crosswalkCount} 處斑馬線行人穿越道`;
    } else {
      desc += '，全程沿同側人行道直達車側（無需橫越馬路）';
    }

    return {
      waypoints: cleanWaypoints,
      routeWaypoints: cleanRouteWaypoints,
      nodeIds: networkPath.nodeIds,
      totalDistance: totalDist,
      crosswalkCount: networkPath.crosswalkCount,
      description: desc,
    };
  }

  /**
   * 搜尋自停放車輛下車處前往建築大門之完整人行道尋路動線
   * 起點：車輛停靠點 (carBoarding) -> 車旁人行道下車點 (sidewalkAlight)
   * 途中：沿立體人行道步行，遇路口依號誌燈停等並經由斑馬線安全穿越
   * 終點：建築外庭大門 (buildingGate) -> 建築內部大門 (buildingDoor)
   * @param carPosition 車輛實際停放世界座標
   * @param destBuilding 目的地建築
   * @param carSpot 車位元資訊 (若有)
   */
  public findPathFromCarToBuilding(
    carPosition: THREE.Vector3,
    destBuilding: PlacedBuilding,
    carSpot?: CurbsideSpot
  ): PedestrianPathResult | null {
    const carBoarding = carPosition.clone();
    carBoarding.y = 0.02;

    const sidewalkAlight = carPosition.clone();
    if (carSpot) {
      if (carSpot.side === 'west') sidewalkAlight.x -= 0.27;
      else if (carSpot.side === 'east') sidewalkAlight.x += 0.27;
      else if (carSpot.side === 'north') sidewalkAlight.z -= 0.27;
      else if (carSpot.side === 'south') sidewalkAlight.z += 0.27;
      sidewalkAlight.y = this.SW_HEIGHT;
    } else {
      const closest = this.findClosestNode(carPosition, true);
      if (closest) sidewalkAlight.copy(closest.position);
      else sidewalkAlight.y = this.SW_HEIGHT;
    }

    const buildingGate = destBuilding.frontWorldPos.clone();
    buildingGate.y = this.SW_HEIGHT;
    const buildingDoor = destBuilding.worldCenter.clone().lerp(destBuilding.frontWorldPos, 0.45);
    buildingDoor.y = 0.04;

    const networkPath = this.findShortestPath(sidewalkAlight, buildingGate, true);
    if (!networkPath) return null;

    const allRouteWaypoints: PedestrianWaypoint[] = [
      { position: carBoarding, isCrosswalk: false },
      ...networkPath.routeWaypoints,
      { position: buildingDoor, isCrosswalk: false },
    ];

    const cleanRouteWaypoints: PedestrianWaypoint[] = [];
    for (const rwp of allRouteWaypoints) {
      if (cleanRouteWaypoints.length > 0) {
        const last = cleanRouteWaypoints[cleanRouteWaypoints.length - 1];
        if (last.position.distanceTo(rwp.position) < 0.03) {
          if (rwp.isCrosswalkStart) last.isCrosswalkStart = true;
          if (rwp.isCrosswalk) last.isCrosswalk = true;
          if (rwp.intersectionKey) last.intersectionKey = rwp.intersectionKey;
          if (rwp.crosswalkArm) last.crosswalkArm = rwp.crosswalkArm;
          if (rwp.pedestrianSignal) last.pedestrianSignal = rwp.pedestrianSignal;
          continue;
        }
      }
      cleanRouteWaypoints.push(rwp);
    }

    const cleanWaypoints = cleanRouteWaypoints.map((rw) => rw.position.clone());
    const totalDist = this.calculatePathLength(cleanWaypoints);

    let desc = `下車步行總長 ${totalDist.toFixed(1)}m`;
    if (networkPath.crosswalkCount > 0) {
      desc += `，行經 ${networkPath.crosswalkCount} 處斑馬線行人穿越道`;
    } else {
      desc += '，沿同側人行道直達廠區';
    }

    return {
      waypoints: cleanWaypoints,
      routeWaypoints: cleanRouteWaypoints,
      nodeIds: networkPath.nodeIds,
      totalDistance: totalDist,
      crosswalkCount: networkPath.crosswalkCount,
      description: desc,
    };
  }

  /**
   * 重建 A* 尋路序列
   */
  private reconstructPath(
    startPos: THREE.Vector3,
    goalPos: THREE.Vector3,
    endNodeId: string,
    cameFrom: Map<string, {
      prevId: string;
      isCrosswalk: boolean;
      intersectionKey?: string;
      crosswalkArm?: 'N' | 'S' | 'E' | 'W';
      pedestrianSignal?: 'northSouth' | 'eastWest';
    }>
  ): PedestrianPathResult {
    const steps: Array<{
      nodeId: string;
      isCrosswalk: boolean;
      intersectionKey?: string;
      crosswalkArm?: 'N' | 'S' | 'E' | 'W';
      pedestrianSignal?: 'northSouth' | 'eastWest';
    }> = [];

    let curr = endNodeId;
    let crosswalkCount = 0;

    while (cameFrom.has(curr)) {
      const step = cameFrom.get(curr)!;
      if (step.isCrosswalk) crosswalkCount++;
      steps.unshift({
        nodeId: curr,
        isCrosswalk: step.isCrosswalk,
        intersectionKey: step.intersectionKey,
        crosswalkArm: step.crosswalkArm,
        pedestrianSignal: step.pedestrianSignal,
      });
      curr = step.prevId;
    }
    steps.unshift({ nodeId: curr, isCrosswalk: false });

    const nodeIds = steps.map((s) => s.nodeId);

    // 串接航點並判定斑馬線起步停等點 (isCrosswalkStart)
    const rawRouteWaypoints: PedestrianWaypoint[] = [
      { position: startPos.clone(), isCrosswalk: false },
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const node = this.nodes.get(step.nodeId);
      if (!node) continue;

      const nextStep = i + 1 < steps.length ? steps[i + 1] : null;
      const isEnteringCrosswalk = nextStep?.isCrosswalk === true && !step.isCrosswalk;

      rawRouteWaypoints.push({
        position: node.position.clone(),
        isCrosswalk: step.isCrosswalk,
        isCrosswalkStart: isEnteringCrosswalk,
        intersectionKey: step.isCrosswalk ? step.intersectionKey : nextStep?.intersectionKey,
        crosswalkArm: step.isCrosswalk ? step.crosswalkArm : nextStep?.crosswalkArm,
        pedestrianSignal: step.isCrosswalk ? step.pedestrianSignal : nextStep?.pedestrianSignal,
      });
    }

    rawRouteWaypoints.push({ position: goalPos.clone(), isCrosswalk: false });

    // 去除相鄰過近重複點
    const routeWaypoints: PedestrianWaypoint[] = [];
    for (const rwp of rawRouteWaypoints) {
      if (routeWaypoints.length > 0) {
        const last = routeWaypoints[routeWaypoints.length - 1];
        if (last.position.distanceTo(rwp.position) < 0.03) {
          if (rwp.isCrosswalkStart) last.isCrosswalkStart = true;
          if (rwp.isCrosswalk) last.isCrosswalk = true;
          if (rwp.intersectionKey) last.intersectionKey = rwp.intersectionKey;
          if (rwp.crosswalkArm) last.crosswalkArm = rwp.crosswalkArm;
          if (rwp.pedestrianSignal) last.pedestrianSignal = rwp.pedestrianSignal;
          continue;
        }
      }
      routeWaypoints.push(rwp);
    }

    const waypoints = routeWaypoints.map((rw) => rw.position.clone());
    const totalDist = this.calculatePathLength(waypoints);

    let desc = `步行長度 ${totalDist.toFixed(1)}m`;
    if (crosswalkCount > 0) {
      desc += `，行經 ${crosswalkCount} 處斑馬線穿越道`;
    } else {
      desc += '，沿同一側高架人行道直通';
    }

    return {
      waypoints,
      routeWaypoints,
      nodeIds,
      totalDistance: totalDist,
      crosswalkCount,
      description: desc,
    };
  }

  /**
   * 找出距離指定座標最近的人行道節點
   * @param pos 目標座標
   * @param preferSidewalk 是否排除斑馬線車道穿越點（優先連接人行道邊緣）
   */
  public findClosestNode(pos: THREE.Vector3, preferSidewalk: boolean = false): PedestrianNode | null {
    let closestNode: PedestrianNode | null = null;
    let minDistSq = Infinity;

    for (const node of this.nodes.values()) {
      if (preferSidewalk && node.type === 'crosswalk') continue;
      const dx = node.position.x - pos.x;
      const dz = node.position.z - pos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestNode = node;
      }
    }

    // 若全部都是 crosswalk (極端情況)，備援不限制
    if (!closestNode && preferSidewalk) {
      return this.findClosestNode(pos, false);
    }

    return closestNode;
  }

  /**
   * 去除過於微小的連續重疊點（間距小於 3 公分）
   */
  private deduplicateWaypoints(points: THREE.Vector3[]): THREE.Vector3[] {
    if (points.length <= 1) return points;
    const res: THREE.Vector3[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = res[res.length - 1];
      const cur = points[i];
      if (prev.distanceTo(cur) >= 0.03) {
        res.push(cur);
      }
    }
    return res;
  }

  private calculatePathLength(points: THREE.Vector3[]): number {
    let sum = 0;
    for (let i = 1; i < points.length; i++) {
      sum += points[i - 1].distanceTo(points[i]);
    }
    return sum;
  }

  /**
   * 更新行人路網 3D 視覺化調試層（青色人行道、橙黃色斑馬線）
   */
  public updateDebugVisualization(): void {
    this.debugGroup.clear();

    const sidewalkLinePositions: number[] = [];
    const crosswalkLinePositions: number[] = [];
    const visitedEdges = new Set<string>();

    for (const node of this.nodes.values()) {
      for (const edge of node.edges) {
        const otherNode = this.nodes.get(edge.targetNodeId);
        if (!otherNode) continue;

        const edgeKey = node.id < otherNode.id ? `${node.id}_${otherNode.id}` : `${otherNode.id}_${node.id}`;
        if (visitedEdges.has(edgeKey)) continue;
        visitedEdges.add(edgeKey);

        const targetArray = edge.isCrosswalk ? crosswalkLinePositions : sidewalkLinePositions;
        const liftY = 0.005; // 稍微抬高防止穿模

        targetArray.push(node.position.x, node.position.y + liftY, node.position.z);
        targetArray.push(otherNode.position.x, otherNode.position.y + liftY, otherNode.position.z);
      }
    }

    // 1. 人行道線段 (Cyan / Teal #14b8a6)
    if (sidewalkLinePositions.length > 0) {
      const swGeo = new THREE.BufferGeometry();
      swGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidewalkLinePositions, 3));
      const swMat = new THREE.LineBasicMaterial({
        color: 0x14b8a6,
        linewidth: 2,
        transparent: true,
        opacity: 0.85,
      });
      const swLines = new THREE.LineSegments(swGeo, swMat);
      this.debugGroup.add(swLines);
    }

    // 2. 斑馬線穿越道線段 (Amber #f59e0b)
    if (crosswalkLinePositions.length > 0) {
      const cwGeo = new THREE.BufferGeometry();
      cwGeo.setAttribute('position', new THREE.Float32BufferAttribute(crosswalkLinePositions, 3));
      const cwMat = new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        linewidth: 3,
        transparent: true,
        opacity: 0.95,
      });
      const cwLines = new THREE.LineSegments(cwGeo, cwMat);
      this.debugGroup.add(cwLines);
    }

    // 3. 節點小立方體 / 標記
    const nodeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const crosswalkMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    for (const node of this.nodes.values()) {
      const m = new THREE.Mesh(nodeGeo, node.type === 'crosswalk' ? crosswalkMat : nodeMat);
      m.position.copy(node.position);
      m.position.y += 0.01;
      this.debugGroup.add(m);
    }
  }

  public getStats(): { nodeCount: number; edgeCount: number; crosswalkCount: number } {
    let edgeCount = 0;
    let crosswalkCount = 0;
    for (const node of this.nodes.values()) {
      for (const edge of node.edges) {
        edgeCount++;
        if (edge.isCrosswalk) crosswalkCount++;
      }
    }
    return {
      nodeCount: this.nodes.size,
      edgeCount: edgeCount / 2, // 雙向邊除以 2
      crosswalkCount: crosswalkCount / 2,
    };
  }
}
