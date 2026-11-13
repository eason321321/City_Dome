import * as THREE from 'three';
import { CitizenModelFactory, CitizenGender } from '../rendering/CitizenModelFactory';
import { RoadNetwork } from '../systems/RoadNetwork';
import { PedestrianWaypoint, PedestrianPathResult } from '../systems/PedestrianNetwork';
import { CitizenProfile } from '../types/citizen';
import { CitizenStateMachine } from './CitizenStateMachine';

export interface ActivePedestrian {
  id: string;
  buildingId: string;
  profile?: CitizenProfile;
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
  isTest?: boolean;
  arrivedWaitTimer?: number;
}

export type MovingInPedestrian = ActivePedestrian;

export interface SpawnPedestrianOptions {
  id: string;
  buildingId: string;
  profile: CitizenProfile;
  waypoints: THREE.Vector3[];
  routeWaypoints?: PedestrianWaypoint[];
  speed: number;
  spawnDelay?: number;
  isAlighted?: boolean;
  walkTimer?: number;
  onArrivedDestination?: () => void;
}

/**
 * 行人移動與斑馬線模擬管理器 (PedestrianManager)
 * 對稱於 VehicleManager，統一負責：
 * 1. 全城 3D 行人實體之生成、延遲下車、步行更新與進門移除
 * 2. 人行道號誌停等與斑馬線穿越狀態管理
 * 3. 提供 VehicleManager 查詢路口斑馬線穿越行人與近距離防撞禮讓偵測
 */
export class PedestrianManager {
  public static readonly WALK_SPEED_SCALE: number = 0.8;

  private scene: THREE.Scene;
  private roadNetwork: RoadNetwork;
  private pedestrianContainer: THREE.Group;
  private activePedestrians: ActivePedestrian[] = [];

  constructor(scene: THREE.Scene, roadNetwork: RoadNetwork) {
    this.scene = scene;
    this.roadNetwork = roadNetwork;

    this.pedestrianContainer = new THREE.Group();
    this.pedestrianContainer.name = 'PedestrianContainer';
    this.scene.add(this.pedestrianContainer);
  }

  /**
   * 生成並註冊一位步行行人實體（支援立即現身或下車交錯延遲現身）
   */
  public spawnPedestrian(options: SpawnPedestrianOptions): ActivePedestrian {
    const isAlighted = options.isAlighted ?? true;
    let mesh: THREE.Group | undefined = undefined;

    if (isAlighted && options.waypoints.length > 0) {
      mesh = CitizenModelFactory.createCitizen({
        gender: options.profile.gender,
        variant: Math.floor(Math.random() * 3),
      });
      mesh.position.copy(options.waypoints[0]);
      this.pedestrianContainer.add(mesh);
      CitizenStateMachine.markModelSpawned(options.profile);
    }

    const ped: ActivePedestrian = {
      id: options.id,
      buildingId: options.buildingId,
      profile: options.profile,
      mesh,
      spawnDelay: options.spawnDelay ?? 0,
      currentWaypointIndex: 1,
      waypoints: options.waypoints,
      routeWaypoints: options.routeWaypoints,
      speed: options.speed * PedestrianManager.WALK_SPEED_SCALE,
      walkTimer: options.walkTimer ?? 0,
      isAlighted,
      hasEnteredHouse: false,
      onArrivedDestination: options.onArrivedDestination,
    };

    this.activePedestrians.push(ped);
    return ped;
  }

  /**
   * 每幀更新所有在途行人之移動、紅綠燈停等、走路動畫與抵達銷毀
   */
  public update(deltaTime: number, isPaused: boolean = false): void {
    if (isPaused || deltaTime <= 0) return;

    for (let i = this.activePedestrians.length - 1; i >= 0; i--) {
      const ped = this.activePedestrians[i];

      // 階段 1：等待交錯下車時間
      if (!ped.isAlighted) {
        ped.spawnDelay -= deltaTime;
        if (ped.spawnDelay <= 0) {
          ped.isAlighted = true;
          const mesh = CitizenModelFactory.createCitizen({
            gender: ped.profile ? ped.profile.gender : 'male',
            variant: Math.floor(Math.random() * 3),
          });
          mesh.position.copy(ped.waypoints[0]);
          this.pedestrianContainer.add(mesh);
          ped.mesh = mesh;
          if (ped.profile) {
            CitizenStateMachine.markModelSpawned(ped.profile);
          }
        }
        continue;
      }

      // 階段 2：若已進門或模型不存在，清理該行人
      if (ped.hasEnteredHouse || !ped.mesh) {
        this.activePedestrians.splice(i, 1);
        continue;
      }

      // 階段 3：沿著航點序列步行
      const wps = ped.waypoints;
      if (ped.currentWaypointIndex < wps.length) {
        const targetPos = wps[ped.currentWaypointIndex];
        const targetWp = ped.routeWaypoints ? ped.routeWaypoints[ped.currentWaypointIndex] : null;

        // 號誌檢測：即將踏上斑馬線時檢查行人綠燈
        if (
          targetWp &&
          targetWp.isCrosswalk &&
          (!ped.isCrossingCrosswalk || targetWp.crosswalkArm !== ped.crossingArm)
        ) {
          const interKey = targetWp.intersectionKey;
          const signalPhase = targetWp.pedestrianSignal;
          if (interKey && signalPhase) {
            const inter = this.roadNetwork.getIntersection(interKey);
            if (inter) {
              const signal = inter.signalState[signalPhase];
              if (signal !== 'green') {
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
                continue;
              }
            }
          }

          ped.isWaitingLight = false;
          ped.isCrossingCrosswalk = true;
          ped.crossingIntersectionKey = targetWp.intersectionKey;
          ped.crossingArm = targetWp.crosswalkArm;
        } else if (targetWp && !targetWp.isCrosswalk && ped.isCrossingCrosswalk) {
          ped.isCrossingCrosswalk = false;
          ped.crossingIntersectionKey = undefined;
          ped.crossingArm = undefined;
          ped.isWaitingLight = false;
        }

        const toTarget = new THREE.Vector3().subVectors(targetPos, ped.mesh.position);
        toTarget.y = 0;
        const dist = toTarget.length();
        const moveDist = ped.speed * deltaTime;

        if (dist <= moveDist + 0.01) {
          ped.mesh.position.copy(targetPos);
          ped.currentWaypointIndex++;
        } else {
          toTarget.normalize().multiplyScalar(moveDist);
          ped.mesh.position.add(toTarget);
          ped.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z);
        }

        ped.walkTimer += deltaTime;
        CitizenModelFactory.animateCitizenWalk(
          ped.mesh,
          ped.walkTimer,
          7.8 * PedestrianManager.WALK_SPEED_SCALE,
          1.0
        );
      } else {
        // 抵達終點處理
        if (ped.isTest) {
          // 測試行人：停止行走動作、恢復站姿、停留 3 秒後自動銷毀消失，不產生正式市民記錄
          ped.isCrossingCrosswalk = false;
          ped.crossingIntersectionKey = undefined;
          ped.crossingArm = undefined;
          ped.isWaitingLight = false;
          if (ped.mesh) {
            CitizenModelFactory.resetCitizenPose(ped.mesh);
          }
          ped.arrivedWaitTimer = (ped.arrivedWaitTimer ?? 0) + deltaTime;
          if (ped.arrivedWaitTimer >= 3.0) {
            if (ped.mesh) {
              this.pedestrianContainer.remove(ped.mesh);
              ped.mesh = undefined;
            }
            if (ped.onArrivedDestination) {
              ped.onArrivedDestination();
            }
            this.activePedestrians.splice(i, 1);
          }
          continue;
        }

        // 常規市民抵達終點：移除模型並標記消失，最後才觸發抵達回調（嚴格確保 AT_home 等狀態轉移順序）
        ped.isCrossingCrosswalk = false;
        ped.crossingIntersectionKey = undefined;
        ped.crossingArm = undefined;
        ped.isWaitingLight = false;
        ped.hasEnteredHouse = true;
        if (ped.mesh) {
          this.pedestrianContainer.remove(ped.mesh);
          ped.mesh = undefined;
        }
        if (ped.profile) {
          CitizenStateMachine.markModelDespawned(ped.profile);
        }

        if (ped.onArrivedDestination) {
          ped.onArrivedDestination();
        }
        this.activePedestrians.splice(i, 1);
      }
    }
  }

  /**
   * 生成一位測試行人實體（專為開發者選單測試設計，無正式 Profile，到達目的地後停留 3 秒消失）
   */
  public spawnTestPedestrian(
    route: PedestrianPathResult,
    options?: {
      gender?: CitizenGender;
      speed?: number;
      onArrived?: () => void;
    }
  ): ActivePedestrian | null {
    if (!route || route.waypoints.length < 1) return null;

    const gender: CitizenGender = options?.gender ?? (Math.random() < 0.5 ? 'male' : 'female');
    const mesh = CitizenModelFactory.createCitizen({
      gender,
      variant: Math.floor(Math.random() * 3),
    });
    mesh.position.copy(route.waypoints[0]);
    if (route.waypoints.length > 1) {
      const dir = new THREE.Vector3().subVectors(route.waypoints[1], route.waypoints[0]);
      dir.y = 0;
      if (dir.lengthSq() > 0.0001) {
        mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }
    this.pedestrianContainer.add(mesh);

    const testPed: ActivePedestrian = {
      id: `test_ped_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      buildingId: 'dev_test',
      isTest: true,
      mesh,
      spawnDelay: 0,
      currentWaypointIndex: 1,
      waypoints: route.waypoints,
      routeWaypoints: route.routeWaypoints,
      speed: (options?.speed ?? 1.0) * PedestrianManager.WALK_SPEED_SCALE,
      walkTimer: 0,
      isAlighted: true,
      hasEnteredHouse: false,
      arrivedWaitTimer: 0,
      onArrivedDestination: options?.onArrived,
    };

    this.activePedestrians.push(testPed);
    return testPed;
  }

  /**
   * 清除所有正在道路上行走的測試行人實體
   */
  public clearAllTestPedestrians(): void {
    for (let i = this.activePedestrians.length - 1; i >= 0; i--) {
      const ped = this.activePedestrians[i];
      if (ped.isTest) {
        if (ped.mesh) {
          this.pedestrianContainer.remove(ped.mesh);
          ped.mesh = undefined;
        }
        this.activePedestrians.splice(i, 1);
      }
    }
  }

  /**
   * 依市民 ID 移除其在場上之所有活動行人實體
   */
  public removePedestriansByCitizenId(citizenId: string): void {
    for (let i = this.activePedestrians.length - 1; i >= 0; i--) {
      const ped = this.activePedestrians[i];
      if (ped.profile?.id === citizenId) {
        if (ped.mesh) {
          this.pedestrianContainer.remove(ped.mesh);
          ped.mesh = undefined;
        }
        CitizenStateMachine.markModelDespawned(ped.profile);
        this.activePedestrians.splice(i, 1);
      }
    }
  }

  /**
   * 清除所有場上行人實體並標記模型消失
   */
  public clearAllPedestrians(): void {
    for (const ped of this.activePedestrians) {
      if (ped.mesh) {
        this.pedestrianContainer.remove(ped.mesh);
        ped.mesh = undefined;
      }
      if (ped.profile) {
        CitizenStateMachine.markModelDespawned(ped.profile);
      }
    }
    this.activePedestrians = [];
  }

  public findActivePedestrianByCitizenId(citizenId: string): ActivePedestrian | undefined {
    return this.activePedestrians.find((p) => p.profile?.id === citizenId);
  }

  public getActivePedestrians(): ActivePedestrian[] {
    return this.activePedestrians;
  }

  /**
   * 查詢指定路口指定路口臂之斑馬線人行道，是否有行人正在穿越中
   */
  public isPedestrianCrossingCrosswalk(intersectionKey: string, arm: 'N' | 'S' | 'E' | 'W'): boolean {
    for (const ped of this.activePedestrians) {
      if (!ped.isAlighted || ped.hasEnteredHouse || !ped.mesh) continue;
      if (
        ped.isCrossingCrosswalk &&
        ped.crossingIntersectionKey === intersectionKey &&
        ped.crossingArm === arm
      ) {
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
  ): { pedestrian: ActivePedestrian; distance: number } | null {
    const dirX = Math.sin(headingY);
    const dirZ = Math.cos(headingY);

    let closestDist = Infinity;
    let closestPed: ActivePedestrian | null = null;

    for (const ped of this.activePedestrians) {
      if (!ped.isAlighted || ped.hasEnteredHouse || !ped.mesh || !ped.isCrossingCrosswalk) continue;

      const dx = ped.mesh.position.x - vehiclePos.x;
      const dz = ped.mesh.position.z - vehiclePos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= maxDist && dist < closestDist) {
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
