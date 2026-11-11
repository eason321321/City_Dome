import * as THREE from 'three';
import { DirectedLane } from './RoadNetwork';

export interface RouteWaypoint {
  position: THREE.Vector3;
  laneId: string;
  isIntersection: boolean;
  intersectionKey?: string;
  controllingSignal?: 'northSouth' | 'eastWest';
  isStopLine: boolean;
  isUTurn?: boolean;
}

export interface PathResult {
  laneIds: string[];
  waypoints: THREE.Vector3[];
  routeWaypoints: RouteWaypoint[];
  totalDistance: number;
}

/**
 * A* 道路有向圖尋路引擎 (Pathfinding Engine)
 * 在車道層級連續有向圖（Directed Lane Graph）上尋找最短且連通的行車路線，
 * 支援車道換線、轉彎曲線與連續路徑點抽樣。
 */
export class Pathfinding {
  /**
   * 執行 A* 最短路徑搜尋
   * @param startLaneId 起點車道 ID
   * @param goalLaneId 終點車道 ID
   * @param allLanes 全地圖所有車道字典
   */
  public static findShortestPath(
    startLaneId: string,
    goalLaneId: string,
    allLanes: Map<string, DirectedLane>
  ): PathResult | null {
    const startLane = allLanes.get(startLaneId);
    const goalLane = allLanes.get(goalLaneId);

    if (!startLane || !goalLane) {
      return null;
    }

    if (startLaneId === goalLaneId) {
      const rwps: RouteWaypoint[] = startLane.waypoints.map((pt, idx) => ({
        position: pt.clone(),
        laneId: startLane.id,
        isIntersection: startLane.isIntersection,
        intersectionKey: startLane.intersectionKey,
        controllingSignal: startLane.controllingSignal,
        isStopLine: startLane.isIntersection && idx === 0,
      }));
      return {
        laneIds: [startLaneId],
        waypoints: [...startLane.waypoints],
        routeWaypoints: rwps,
        totalDistance: this.calculateWaypointsDistance(startLane.waypoints),
      };
    }

    // A* 資料結構
    const openSet: Set<string> = new Set([startLaneId]);
    const cameFrom: Map<string, string> = new Map();

    const gScore: Map<string, number> = new Map();
    gScore.set(startLaneId, 0);

    const fScore: Map<string, number> = new Map();
    fScore.set(startLaneId, this.heuristic(startLane, goalLane));

    while (openSet.size > 0) {
      // 找出 openSet 中 fScore 最小之節點
      let currentId = '';
      let minF = Infinity;

      for (const id of openSet) {
        const score = fScore.get(id) ?? Infinity;
        if (score < minF) {
          minF = score;
          currentId = id;
        }
      }

      if (!currentId || minF === Infinity) {
        break;
      }

      // 抵達終點
      if (currentId === goalLaneId) {
        return this.reconstructPath(currentId, cameFrom, allLanes);
      }

      openSet.delete(currentId);
      const currentLane = allLanes.get(currentId)!;
      const currentG = gScore.get(currentId) ?? Infinity;

      for (const nextId of currentLane.connectedNextLaneIds) {
        const nextLane = allLanes.get(nextId);
        if (!nextLane) continue;

        // 計算邊長度 (以車道實際路徑點長度作為權重)
        let edgeLength = this.calculateWaypointsDistance(nextLane.waypoints);
        // 若為 180° 迴轉車道，施加阻抗懲罰 (Penalty Cost = +4.0m)，模擬減速掉頭與等待阻抗
        // 既能精準防止常態巡航車輛誤入震盪，又能確保需要迴轉時優先選擇最近路口
        if (nextLane.isUTurn) {
          edgeLength += 4.0;
        }
        const tentativeG = currentG + edgeLength;

        if (tentativeG < (gScore.get(nextId) ?? Infinity)) {
          cameFrom.set(nextId, currentId);
          gScore.set(nextId, tentativeG);
          fScore.set(nextId, tentativeG + this.heuristic(nextLane, goalLane));

          if (!openSet.has(nextId)) {
            openSet.add(nextId);
          }
        }
      }
    }

    // 無法抵達 (無連通路徑)
    return null;
  }

  /**
   * 啟發函數：當前車道出口點至終點車道出口點之歐幾里得距離
   */
  private static heuristic(laneA: DirectedLane, goalLane: DirectedLane): number {
    return laneA.exitPoint.distanceTo(goalLane.exitPoint);
  }

  /**
   * 重建完整路徑節點序列與高解析路徑點
   */
  private static reconstructPath(
    endId: string,
    cameFrom: Map<string, string>,
    allLanes: Map<string, DirectedLane>
  ): PathResult {
    const laneIds: string[] = [endId];
    let curr = endId;

    while (cameFrom.has(curr)) {
      curr = cameFrom.get(curr)!;
      laneIds.unshift(curr);
    }

    // 依序串接所有車道路徑點（自動去除重疊的相鄰接縫點）
    const waypoints: THREE.Vector3[] = [];
    const routeWaypoints: RouteWaypoint[] = [];
    let totalDist = 0;

    for (let i = 0; i < laneIds.length; i++) {
      const lane = allLanes.get(laneIds[i])!;
      for (let j = 0; j < lane.waypoints.length; j++) {
        const pt = lane.waypoints[j];
        const isStopLine = lane.isIntersection && j === 0;

        if (waypoints.length > 0) {
          const prev = waypoints[waypoints.length - 1];
          const dist = prev.distanceTo(pt);
          if (dist > 0.02) { // 避免相鄰端點重複
            waypoints.push(pt.clone());
            routeWaypoints.push({
              position: pt.clone(),
              laneId: lane.id,
              isIntersection: lane.isIntersection,
              intersectionKey: lane.intersectionKey,
              controllingSignal: lane.controllingSignal,
              isStopLine,
              isUTurn: lane.isUTurn,
            });
            totalDist += dist;
          } else {
            // 接縫處端點距離極近，若當前點為路口停止線，將停止線資訊繼承標記至前一個相鄰端點
            if (isStopLine && routeWaypoints.length > 0) {
              const lastWp = routeWaypoints[routeWaypoints.length - 1];
              lastWp.isStopLine = true;
              lastWp.isIntersection = false; // 停止線位於路口邊界之前，不屬於路口內部
              lastWp.intersectionKey = lane.intersectionKey;
              lastWp.controllingSignal = lane.controllingSignal;
              lastWp.isUTurn = lane.isUTurn;
            }
          }
        } else {
          waypoints.push(pt.clone());
          routeWaypoints.push({
            position: pt.clone(),
            laneId: lane.id,
            isIntersection: lane.isIntersection,
            intersectionKey: lane.intersectionKey,
            controllingSignal: lane.controllingSignal,
            isStopLine,
            isUTurn: lane.isUTurn,
          });
        }
      }
    }

    return {
      laneIds,
      waypoints,
      routeWaypoints,
      totalDistance: totalDist,
    };
  }

  private static calculateWaypointsDistance(points: THREE.Vector3[]): number {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += points[i - 1].distanceTo(points[i]);
    }
    return Math.max(d, 0.1);
  }
}
