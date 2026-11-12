import * as THREE from 'three';
import { RoadNetwork } from '../systems/RoadNetwork';
import { Pathfinding, PathResult, RouteWaypoint } from '../systems/Pathfinding';
import { ParkingManager, CurbsideSpot } from './ParkingManager';

/**
 * 交通尋路與路邊停車銜接輔助模組 (TrafficDispatchHelper)
 * 抽離原本耦合於 BuildingManager 的共用行車導航幾何邏輯，供住宅遷入、市民通勤與未來貨車物流共同複用：
 * 1. 搜尋兩路塊間最佳車道路徑 (支援起步車道方向鎖定與抵達側偏好)
 * 2. 路邊車位起步平滑切出動線 (attachCurbsideDeparture)
 * 3. 路邊車位四階靠邊泊車動線 (attachCurbsideArrival)
 * 4. 斷路備援直線路徑
 */
export class TrafficDispatchHelper {
  /**
   * 搜尋兩路塊間之最佳連續車道行車路徑
   */
  public static findBestRoadPath(
    roadNetwork: RoadNetwork,
    originTileKey: string,
    destTileKey: string,
    requiredStartDir?: 'N' | 'S' | 'E' | 'W',
    preferredGoalDir?: 'N' | 'S' | 'E' | 'W'
  ): PathResult | null {
    const originTile = roadNetwork.getTile(originTileKey);
    const destTile = roadNetwork.getTile(destTileKey);
    if (!originTile || !destTile) return null;

    const allLanes = roadNetwork.getAllLanes();

    let startLanes = originTile.lanes.filter((l) => !l.isIntersection && !l.isUTurn);
    if (startLanes.length === 0) startLanes = originTile.lanes;

    if (requiredStartDir) {
      const matched = startLanes.filter((l) => l.direction === requiredStartDir);
      if (matched.length > 0) {
        startLanes = matched;
      }
    }

    let goalLanes = destTile.lanes.filter((l) => !l.isIntersection && !l.isUTurn);
    if (goalLanes.length === 0) goalLanes = destTile.lanes;

    if (preferredGoalDir) {
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
          const isPreferredGoal = preferredGoalDir && goalLane.direction === preferredGoalDir;
          const effectiveDist = isPreferredGoal ? path.totalDistance : path.totalDistance + 50.0;
          if (effectiveDist < shortestDist) {
            shortestDist = effectiveDist;
            bestPath = path;
          }
        }
      }
    }

    if (!bestPath && requiredStartDir) {
      return this.findBestRoadPath(roadNetwork, originTileKey, destTileKey, undefined, preferredGoalDir);
    }

    return bestPath;
  }

  /**
   * 修正車輛自路邊停車位起步之旅程路徑（平滑切出匯入車道，完整保留後續沿途道路節點）
   */
  public static attachCurbsideDeparture(drivePath: PathResult, carSpot: CurbsideSpot): PathResult {
    if (!drivePath.routeWaypoints || drivePath.routeWaypoints.length < 2) return drivePath;

    const dir = ParkingManager.getDirectionForSide(carSpot.side);
    const dirVec = this.directionToVector(dir);

    const rwps = drivePath.routeWaypoints;
    const startLaneId = rwps[0].laneId;
    const newRwps: RouteWaypoint[] = [];

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
        if (forwardDist <= 0.2) {
          continue;
        }
      } else {
        hasExitedStartLane = true;
      }
      newRwps.push(wp);
    }

    if (newRwps.length === 1 && rwps.length > 0) {
      newRwps.push(rwps[rwps.length - 1]);
    }

    return this.rebuildPathFromRouteWaypoints(drivePath.laneIds, newRwps);
  }

  /**
   * 修正車輛抵達目的地路邊停車位之路徑（完整保留抵達終點車道前的所有道路航點，並插入四階泊車動線）
   */
  public static attachCurbsideArrival(drivePath: PathResult, parkSpot: CurbsideSpot): PathResult {
    if (!drivePath.routeWaypoints || drivePath.routeWaypoints.length < 2) return drivePath;

    const dir = ParkingManager.getDirectionForSide(parkSpot.side);
    const dirVec = this.directionToVector(dir);
    const latVec = new THREE.Vector3(-dirVec.z, 0, dirVec.x);

    const LATERAL_OFFSET = 0.295;
    const TURN_IN_LEAD = 0.65;

    const laneAtSpot = parkSpot.position.clone().sub(latVec.clone().multiplyScalar(LATERAL_OFFSET));
    laneAtSpot.y = 0.04;

    const turnInPoint = laneAtSpot.clone().sub(dirVec.clone().multiplyScalar(TURN_IN_LEAD));
    turnInPoint.y = 0.04;

    const midPoint = laneAtSpot
      .clone()
      .sub(dirVec.clone().multiplyScalar(TURN_IN_LEAD * 0.45))
      .add(latVec.clone().multiplyScalar(LATERAL_OFFSET * 0.55));
    midPoint.y = 0.04;

    const alignPoint = parkSpot.position.clone().sub(dirVec.clone().multiplyScalar(0.12));
    alignPoint.y = 0.04;

    const spotTarget = parkSpot.position.clone();
    spotTarget.y = 0.04;

    const rwps = drivePath.routeWaypoints;
    const destLaneId = rwps[rwps.length - 1].laneId;
    const firstDestLaneIdx = rwps.findIndex((w) => w.laneId === destLaneId);

    const newRwps: RouteWaypoint[] = [];
    const prefixEnd = firstDestLaneIdx !== -1 ? firstDestLaneIdx : rwps.length - 1;
    for (let i = 0; i < prefixEnd; i++) {
      newRwps.push(rwps[i]);
    }

    if (firstDestLaneIdx !== -1) {
      for (let i = firstDestLaneIdx; i < rwps.length; i++) {
        const wp = rwps[i];
        const toTurnIn = new THREE.Vector3().subVectors(wp.position, turnInPoint);
        const forwardDist = toTurnIn.dot(dirVec);
        if (forwardDist >= -0.15) {
          break;
        }
        newRwps.push(wp);
      }
    }

    for (const pos of [turnInPoint, midPoint, alignPoint, spotTarget]) {
      newRwps.push({
        position: pos,
        laneId: destLaneId,
        isIntersection: false,
        isStopLine: false,
      });
    }

    return this.rebuildPathFromRouteWaypoints(drivePath.laneIds, newRwps);
  }

  /**
   * 斷路直達備援行車路徑
   */
  public static createDirectFallbackPath(fromPos: THREE.Vector3, toPos: THREE.Vector3): PathResult {
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
   * 斷路直達備援人行動線
   */
  public static createDirectPedestrianFallback(
    fromWorldCenter: THREE.Vector3,
    fromFrontWorldPos: THREE.Vector3,
    toWorldCenter: THREE.Vector3,
    toFrontWorldPos: THREE.Vector3
  ): THREE.Vector3[] {
    const startDoor = fromWorldCenter.clone().lerp(fromFrontWorldPos, 0.45);
    startDoor.y = 0.04;
    const startGate = fromFrontWorldPos.clone();
    startGate.y = 0.07;
    const endGate = toFrontWorldPos.clone();
    endGate.y = 0.07;
    const endDoor = toWorldCenter.clone().lerp(toFrontWorldPos, 0.45);
    endDoor.y = 0.04;
    return [startDoor, startGate, endGate, endDoor];
  }

  private static directionToVector(dir: 'N' | 'S' | 'E' | 'W'): THREE.Vector3 {
    switch (dir) {
      case 'N':
        return new THREE.Vector3(0, 0, -1);
      case 'S':
        return new THREE.Vector3(0, 0, 1);
      case 'E':
        return new THREE.Vector3(1, 0, 0);
      case 'W':
        return new THREE.Vector3(-1, 0, 0);
    }
  }

  private static rebuildPathFromRouteWaypoints(
    laneIds: string[],
    routeWaypoints: RouteWaypoint[]
  ): PathResult {
    const waypoints = routeWaypoints.map((r) => r.position.clone());
    let totalDist = 0;
    for (let i = 1; i < waypoints.length; i++) {
      totalDist += waypoints[i].distanceTo(waypoints[i - 1]);
    }
    return {
      laneIds,
      waypoints,
      routeWaypoints,
      totalDistance: totalDist,
    };
  }
}
