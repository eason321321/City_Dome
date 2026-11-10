import * as THREE from 'three';
import { VehicleModelFactory } from '../rendering/VehicleModelFactory';
import { RoadNetwork } from '../systems/RoadNetwork';
import { PathResult } from '../systems/Pathfinding';

export interface ActiveVehicle {
  id: string;
  mesh: THREE.Group;
  route: PathResult;
  currentWaypointIndex: number;
  currentPosition: THREE.Vector3;
  speed: number;             // 當前行駛速度 (m/s)
  targetSpeed: number;       // 目標巡航速度 (m/s)
  acceleration: number;      // 加速度 (m/s^2)
  deceleration: number;      // 煞車減速度 (m/s^2)
  state: 'Cruising' | 'WaitingLight' | 'Arrived';
  arrivedTimer?: number;
}

/**
 * 車輛行駛與交通模擬管理器 (VehicleManager)
 * 負責：
 * 1. 3D 車輛實體生成與生命週期管理
 * 2. 依循 A* 導航路徑點平滑巡航、轉彎平滑插值轉向
 * 3. 嚴格遵守路口交通號誌（紅黃燈路口停止線前平滑煞停、綠燈放行啟步直行或轉彎）
 * 4. 支援遊戲暫停與世界時間解耦
 */
export class VehicleManager {
  private scene: THREE.Scene;
  private roadNetwork: RoadNetwork;
  private vehicles: ActiveVehicle[] = [];
  private nextVehicleId: number = 1;

  constructor(scene: THREE.Scene, roadNetwork: RoadNetwork) {
    this.scene = scene;
    this.roadNetwork = roadNetwork;
  }

  /**
   * 生成一輛沿著特定路徑行駛的測試車輛
   */
  public spawnTestVehicle(route: PathResult, colorHex?: number): ActiveVehicle | null {
    const rwps = route.routeWaypoints;
    if (!route || !rwps || rwps.length < 2) {
      console.warn('⚠️ 無法生成車輛：路徑無效或點數過少');
      return null;
    }

    const startPos = rwps[0].position.clone();
    const nextPos = rwps[1].position.clone();
    const initDir = new THREE.Vector3().subVectors(nextPos, startPos).normalize();
    const initRotY = Math.atan2(initDir.x, initDir.z);

    const mesh = VehicleModelFactory.createVehicle(colorHex);
    mesh.position.copy(startPos);
    mesh.rotation.y = initRotY;
    this.scene.add(mesh);

    const vehicle: ActiveVehicle = {
      id: `veh_${this.nextVehicleId++}`,
      mesh,
      route,
      currentWaypointIndex: 1,
      currentPosition: startPos,
      speed: 0,
      targetSpeed: 8.5,       // 約 30 km/h 穩定巡航
      acceleration: 4.5,      // 平滑起步加速
      deceleration: 7.0,      // 平滑舒適煞車
      state: 'Cruising',
    };

    this.vehicles.push(vehicle);
    return vehicle;
  }

  /**
   * 每幀更新所有車輛位置、航向與號誌檢查
   */
  public update(deltaTime: number, isPaused: boolean = false): void {
    if (isPaused || deltaTime <= 0) return;

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];

      if (v.state === 'Arrived') {
        // 抵達後停留數秒後自動淡出銷毀
        v.arrivedTimer = (v.arrivedTimer ?? 0) + deltaTime;
        if (v.arrivedTimer > 5.0) {
          this.scene.remove(v.mesh);
          this.vehicles.splice(i, 1);
        }
        continue;
      }

      const rwps = v.route.routeWaypoints;
      if (v.currentWaypointIndex >= rwps.length) {
        v.state = 'Arrived';
        v.speed = 0;
        continue;
      }

      // 1. 檢測前方最近的下一個路口停止線 (Stop Line)
      let nextStopLineIndex = -1;
      for (let k = v.currentWaypointIndex; k < rwps.length; k++) {
        if (rwps[k].isStopLine) {
          nextStopLineIndex = k;
          break;
        }
      }

      let isRedOrYellow = false;
      let distToStopLine = Infinity;

      if (nextStopLineIndex !== -1) {
        const stopWp = rwps[nextStopLineIndex];
        if (stopWp.intersectionKey && stopWp.controllingSignal) {
          const inter = this.roadNetwork.getIntersection(stopWp.intersectionKey);
          if (inter) {
            const signal = inter.signalState[stopWp.controllingSignal];
            isRedOrYellow = (signal === 'red' || signal === 'yellow');

            // 計算沿行車路徑至該停止線之精準累積距離
            distToStopLine = v.currentPosition.distanceTo(rwps[v.currentWaypointIndex].position);
            for (let k = v.currentWaypointIndex; k < nextStopLineIndex; k++) {
              distToStopLine += rwps[k].position.distanceTo(rwps[k + 1].position);
            }
          }
        }
      }

      // 2. 停等與安全減速動力學
      const STOP_BUFFER = 0.25; // 停在停止線前 0.25m 處，避免壓在斑馬線上

      if (isRedOrYellow && nextStopLineIndex !== -1) {
        if (distToStopLine <= STOP_BUFFER + 0.05) {
          // 已就停等線位置：完全煞停靜止
          v.state = 'WaitingLight';
          v.speed = 0;
        } else if (distToStopLine <= 6.0) {
          // 距離路口 6m 內：依安全制動距離平滑減速 (v = sqrt(2 * a * d))
          v.state = 'WaitingLight';
          const remainingDist = Math.max(0, distToStopLine - STOP_BUFFER);
          const desiredSpeed = Math.min(v.targetSpeed, Math.sqrt(2 * v.deceleration * remainingDist));
          if (v.speed > desiredSpeed) {
            v.speed = Math.max(desiredSpeed, v.speed - v.deceleration * deltaTime);
          } else {
            v.speed = Math.min(desiredSpeed, v.speed + v.acceleration * deltaTime);
          }
        } else {
          // 距離路口尚遠：正常巡航
          v.state = 'Cruising';
          v.speed = Math.min(v.targetSpeed, v.speed + v.acceleration * deltaTime);
        }
      } else {
        // 綠燈放行或前方無路口：正常加速或巡航
        v.state = 'Cruising';
        v.speed = Math.min(v.targetSpeed, v.speed + v.acceleration * deltaTime);
      }

      // 3. 沿著航點序列前進
      if (v.speed > 0) {
        let remainingMove = v.speed * deltaTime;

        // 若前方遇紅黃燈，限制前進位移絕不越過停止線緩衝點
        if (isRedOrYellow && nextStopLineIndex !== -1) {
          const maxAllowedMove = Math.max(0, distToStopLine - STOP_BUFFER);
          remainingMove = Math.min(remainingMove, maxAllowedMove);
        }

        while (remainingMove > 0 && v.currentWaypointIndex < rwps.length) {
          const targetPos = rwps[v.currentWaypointIndex].position;
          const toTarget = new THREE.Vector3().subVectors(targetPos, v.currentPosition);
          const dist = toTarget.length();

          if (dist <= remainingMove) {
            v.currentPosition.copy(targetPos);
            remainingMove -= dist;
            v.currentWaypointIndex++;
          } else {
            const step = toTarget.normalize().multiplyScalar(remainingMove);
            v.currentPosition.add(step);
            remainingMove = 0;
          }
        }

        // 檢查是否抵達終點
        if (v.currentWaypointIndex >= rwps.length) {
          v.state = 'Arrived';
          v.speed = 0;
        }

        // 4. 更新車輛模型 Transform 與航向角（最短圓弧平滑旋轉）
        v.mesh.position.copy(v.currentPosition);

        if (v.currentWaypointIndex < rwps.length) {
          const nextTarget = rwps[v.currentWaypointIndex].position;
          const dir = new THREE.Vector3().subVectors(nextTarget, v.currentPosition);
          if (dir.lengthSq() > 0.0001) {
            const targetRotY = Math.atan2(dir.x, dir.z);
            let diff = (targetRotY - v.mesh.rotation.y) % (2 * Math.PI);
            if (diff < -Math.PI) diff += 2 * Math.PI;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            v.mesh.rotation.y += diff * Math.min(1.0, 14.0 * deltaTime);
          }
        }
      }
    }
  }

  /**
   * 清除場景中所有測試車輛
   */
  public clearAllVehicles(): void {
    for (const v of this.vehicles) {
      this.scene.remove(v.mesh);
    }
    this.vehicles = [];
  }

  public getActiveVehicles(): ActiveVehicle[] {
    return this.vehicles;
  }
}
