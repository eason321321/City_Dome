import * as THREE from 'three';
import { VehicleModelFactory } from '../rendering/VehicleModelFactory';
import { RoadNetwork, DirectedLane } from '../systems/RoadNetwork';
import { Pathfinding, PathResult } from '../systems/Pathfinding';

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
  disappearImmediately?: boolean; // 抵達終點後是否立即消失（市民到家）
  keepMeshOnArrive?: boolean;     // 抵達終點後保留車輛 Mesh (由路邊停車管理器接管為停車實體)
  onArrived?: (vehicle: ActiveVehicle) => void; // 抵達終點之業務回調 (傳入自身實體)
  currentLaneId?: string;    // 當前行駛所在之車道 ID (供車道隊列管理)
  distToLaneExit?: number;   // 距離當前車道出口之剩餘累積距離 (m)
  isHoldingForBoxClearance?: boolean; // 是否正因路口淨空防死鎖機制在停止線停等
}

export interface LaneVehicleEntry {
  vehicle: ActiveVehicle;
  distToExit: number;        // 距離當前車道出口之剩餘累積距離 (m)
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

  // 車道空間隊列 (Lane Queue)：以車道 ID 為 key，紀錄位於該車道上的車輛 (依距離出口剩餘距離由小到大排序)
  private laneQueues: Map<string, LaneVehicleEntry[]> = new Map();

  // 車道幾何長度快取 (避免每幀重複計算)
  private laneLengthCache: Map<string, number> = new Map();

  // 車身長度補償與跟車安全參數 (單位: 公尺)
  // 幾何體縮放後實際車長: 0.82m * 0.45 = 0.369m
  public static readonly VEHICLE_LENGTH: number = 0.37;
  // 停等時兩車保險桿之間的視覺安全舒適空隙
  public static readonly STOPPING_GAP: number = 0.38;
  // 兩車中心點靜止停等時之最小安全車距 = 車長 + 保險桿間隔 = 0.75m
  public static readonly MIN_FOLLOWING_DIST: number = 0.75;
  // 路口停止線前車身中心點緩衝距離 (已校準保險桿不壓停止線且不侵入行人穿越道)
  public static readonly STOP_LINE_BUFFER: number = 0.62;
  // 前方視野探測最大距離 (超過此距離不觸發跟車減速)
  public static readonly LOOKAHEAD_DISTANCE: number = 8.0;

  // 外部公路過境車流定時器 (平常路過的車輛：左邊出來右邊出去，反之)
  private ambientTrafficTimer: number = 0;
  private readonly AMBIENT_SPAWN_INTERVAL: number = 3.5;

  constructor(scene: THREE.Scene, roadNetwork: RoadNetwork) {
    this.scene = scene;
    this.roadNetwork = roadNetwork;
  }

  /**
   * 計算並快取單一車道之總幾何長度 (m)
   */
  private getLaneLength(lane: DirectedLane): number {
    let len = this.laneLengthCache.get(lane.id);
    if (len !== undefined) return len;

    len = 0;
    const wps = lane.waypoints;
    if (wps && wps.length >= 2) {
      for (let i = 0; i < wps.length - 1; i++) {
        len += wps[i].distanceTo(wps[i + 1]);
      }
    } else {
      len = 2.0; // 預設標準道路格位長度
    }

    this.laneLengthCache.set(lane.id, len);
    return len;
  }

  /**
   * 依據車道隊列與跨車道銜接（隊頭感知）搜尋前方最近的車輛 (Leader)
   * 1. 若同車道前方有車，以 O(1) 複雜度直接命中同一車道的前車
   * 2. 若同車道前方無車（本車為該車道隊頭），沿著行車路徑自動向下游車道探測
   */
  private findLeadVehicle(
    v: ActiveVehicle,
    maxLookahead: number
  ): { leadVehicle: ActiveVehicle; distance: number } | null {
    const rwps = v.route.routeWaypoints;
    if (!rwps || v.currentWaypointIndex >= rwps.length) return null;

    const currLaneId = v.currentLaneId;
    if (!currLaneId || v.distToLaneExit === undefined) return null;

    const vDistToExit = v.distToLaneExit;
    const sameLaneQueue = this.laneQueues.get(currLaneId);

    // 1. 同車道前車查找：尋找在同車道中 distToExit 比自車小（更靠前）且距離最近的車輛
    if (sameLaneQueue && sameLaneQueue.length > 1) {
      let closestAhead: LaneVehicleEntry | null = null;
      for (const entry of sameLaneQueue) {
        if (entry.vehicle === v) continue;
        // 需比自車更靠前（至少留 0.01m 避免同點浮點數微小誤差）
        if (entry.distToExit < vDistToExit - 0.01) {
          if (!closestAhead || entry.distToExit > closestAhead.distToExit) {
            closestAhead = entry;
          }
        }
      }

      if (closestAhead) {
        const dist = vDistToExit - closestAhead.distToExit;
        if (dist <= maxLookahead) {
          return { leadVehicle: closestAhead.vehicle, distance: dist };
        }
      }
    }

    // 2. 跨車道銜接（隊頭感知）：若同車道前方無車，沿著航點路徑向下游車道探測
    // 收集自車即將進入的後續車道清單 (最多預覽前 3 段下游車道)
    const upcomingLaneIds: string[] = [];
    for (let k = v.currentWaypointIndex; k < rwps.length; k++) {
      const lid = rwps[k].laneId;
      if (lid && lid !== currLaneId && !upcomingLaneIds.includes(lid)) {
        upcomingLaneIds.push(lid);
        if (upcomingLaneIds.length >= 3) break;
      }
    }

    if (upcomingLaneIds.length === 0) return null;

    let accumulatedDist = vDistToExit; // 距當前車道出口之剩餘距離

    for (const nextLaneId of upcomingLaneIds) {
      if (accumulatedDist > maxLookahead) break;

      const nextQueue = this.laneQueues.get(nextLaneId);
      const nextLane = this.roadNetwork.getAllLanes().get(nextLaneId);
      const nextLaneLen = nextLane ? this.getLaneLength(nextLane) : 2.0;

      if (nextQueue && nextQueue.length > 0) {
        // 在下游車道中，離自車最近的是排在該車道最尾端（distToExit 最大者）的車輛
        const tailEntry = nextQueue[nextQueue.length - 1]; // 已依 distToExit 升冪排序
        const distIntoNextLane = Math.max(0, nextLaneLen - tailEntry.distToExit);
        const totalDist = accumulatedDist + distIntoNextLane;

        if (totalDist <= maxLookahead) {
          return {
            leadVehicle: tailEntry.vehicle,
            distance: totalDist,
          };
        }
      }

      // 下游該車道無車，累加車道長度後繼續探測再下一段車道
      accumulatedDist += nextLaneLen;
    }

    return null;
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
   * 生成一輛自外部城市遷入住宅的市民車輛
   * 行駛至家門前或最近停車位停車，並呼叫入住回調
   */
  public spawnMovingInVehicle(
    route: PathResult,
    colorHex?: number,
    onArrived?: (vehicle: ActiveVehicle) => void,
    keepMeshOnArrive: boolean = false
  ): ActiveVehicle | null {
    const rwps = route.routeWaypoints;
    if (!route || !rwps || rwps.length < 2) {
      console.warn('⚠️ 無法生成市民遷入車輛：路徑無效');
      return null;
    }

    const startPos = rwps[0].position.clone();
    const nextPos = rwps[1].position.clone();
    const initDir = new THREE.Vector3().subVectors(nextPos, startPos).normalize();
    const initRotY = Math.atan2(initDir.x, initDir.z);

    const mesh = VehicleModelFactory.createVehicle(colorHex ?? 0x2563eb);
    mesh.position.copy(startPos);
    mesh.rotation.y = initRotY;
    this.scene.add(mesh);

    const vehicle: ActiveVehicle = {
      id: `citizen_car_${this.nextVehicleId++}`,
      mesh,
      route,
      currentWaypointIndex: 1,
      currentPosition: startPos,
      speed: 0,
      targetSpeed: 6.5, // 舒適巡航速 (適度放慢提供流暢優雅的行車與轉彎觀察感)
      acceleration: 4.2,
      deceleration: 6.5,
      state: 'Cruising',
      disappearImmediately: !keepMeshOnArrive,
      keepMeshOnArrive,
      onArrived,
    };

    this.vehicles.push(vehicle);
    return vehicle;
  }

  /**
   * 生成橫貫外部公路之過境車輛 (平常會有路過的車在這邊開：左邊出來右邊出去，反之)
   */
  private spawnAmbientHighwayVehicle(): void {
    const isWestToEast = Math.random() < 0.5;
    const startLane = isWestToEast
      ? this.roadNetwork.getHighwayWestEntryLane()
      : this.roadNetwork.getHighwayEastEntryLane();
    const goalLane = isWestToEast
      ? this.roadNetwork.getHighwayEastExitLane()
      : this.roadNetwork.getHighwayWestExitLane();

    if (!startLane || !goalLane) return;

    const path = Pathfinding.findShortestPath(startLane.id, goalLane.id, this.roadNetwork.getAllLanes());
    if (!path || !path.routeWaypoints || path.routeWaypoints.length < 2) return;

    // 隨機自用車顏色 (紅白黑藍銀灰金)
    const colors = [0xdc2626, 0xffffff, 0x1e293b, 0x2563eb, 0x94a3b8, 0xeab308];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const startPos = path.routeWaypoints[0].position.clone();
    const nextPos = path.routeWaypoints[1].position.clone();
    const initDir = new THREE.Vector3().subVectors(nextPos, startPos).normalize();
    const initRotY = Math.atan2(initDir.x, initDir.z);

    const mesh = VehicleModelFactory.createVehicle(color);
    mesh.position.copy(startPos);
    mesh.rotation.y = initRotY;
    this.scene.add(mesh);

    const vehicle: ActiveVehicle = {
      id: `highway_through_${this.nextVehicleId++}`,
      mesh,
      route: path,
      currentWaypointIndex: 1,
      currentPosition: startPos,
      speed: 10.0 + Math.random() * 2.5, // 公路巡航速度 10~12.5 m/s
      targetSpeed: 11.5 + Math.random() * 2.5,
      acceleration: 5.5,
      deceleration: 7.5,
      state: 'Cruising',
      disappearImmediately: true, // 到達另一端邊界後立即駛離銷毀
    };

    this.vehicles.push(vehicle);
  }

  /**
   * 每幀更新所有車輛位置、航向與號誌檢查 (整合車道隊列、跟車防追撞與紅綠燈平滑煞停)
   */
  public update(deltaTime: number, isPaused: boolean = false): void {
    if (isPaused || deltaTime <= 0) return;

    // 1. 定時生成邊境過境公路行駛車流 (平常路過之車流)
    this.ambientTrafficTimer += deltaTime;
    if (this.ambientTrafficTimer >= this.AMBIENT_SPAWN_INTERVAL) {
      this.ambientTrafficTimer = 0;
      this.spawnAmbientHighwayVehicle();
    }

    // 2. 清理已抵達或已結束生命週期之車輛
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];

      if (v.state === 'Arrived') {
        if (v.keepMeshOnArrive) {
          if (v.onArrived) {
            v.onArrived(v);
            v.onArrived = undefined;
          }
          this.vehicles.splice(i, 1);
          continue;
        }

        if (v.disappearImmediately) {
          if (v.onArrived) {
            v.onArrived(v);
            v.onArrived = undefined;
          }
          this.scene.remove(v.mesh);
          this.vehicles.splice(i, 1);
          continue;
        }

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
        if (v.keepMeshOnArrive) {
          if (v.onArrived) {
            v.onArrived(v);
            v.onArrived = undefined;
          }
          this.vehicles.splice(i, 1);
          continue;
        }

        if (v.disappearImmediately) {
          if (v.onArrived) {
            v.onArrived(v);
            v.onArrived = undefined;
          }
          this.scene.remove(v.mesh);
          this.vehicles.splice(i, 1);
        }
        continue;
      }
    }

    // 3. 建立本幀各車道之空間隊列 (Lane Queues)
    this.laneQueues.clear();
    for (const v of this.vehicles) {
      if (v.state === 'Arrived') continue;
      const rwps = v.route.routeWaypoints;
      if (!rwps || v.currentWaypointIndex >= rwps.length) continue;

      const currWp = rwps[v.currentWaypointIndex];
      const currLaneId = currWp.laneId;

      // 計算自車當前中心點沿航點到達當前車道出口的剩餘距離
      let distToExit = v.currentPosition.distanceTo(currWp.position);
      for (let k = v.currentWaypointIndex; k + 1 < rwps.length && rwps[k + 1].laneId === currLaneId; k++) {
        distToExit += rwps[k].position.distanceTo(rwps[k + 1].position);
      }

      v.currentLaneId = currLaneId;
      v.distToLaneExit = distToExit;

      let queue = this.laneQueues.get(currLaneId);
      if (!queue) {
        queue = [];
        this.laneQueues.set(currLaneId, queue);
      }
      queue.push({ vehicle: v, distToExit });
    }

    // 對每個車道隊列依據 distToExit 進行升冪排序 (最靠近出口者排在前面，即隊頭)
    for (const queue of this.laneQueues.values()) {
      if (queue.length > 1) {
        queue.sort((a, b) => a.distToExit - b.distToExit);
      }
    }

    // 4. 逐車執行運動學決策、號誌判斷、跟車防追撞與航向更新
    for (const v of this.vehicles) {
      if (v.state === 'Arrived') continue;

      const rwps = v.route.routeWaypoints;
      if (!rwps || v.currentWaypointIndex >= rwps.length) continue;

      // 4.1 檢測前方最近的下一個路口停止線 (Stop Line)
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

      // 4.2 檢測路口淨空狀態（"Don't Block the Box" / 黃網線防死鎖機制）
      // 當自車尚未進入路口且前方有路口停止線時，若下游出境路段被車輛回堵或空間不足，嚴禁駛入路口
      let isBoxBlocked = false;
      const isApproachingIntersection = nextStopLineIndex !== -1 &&
        (!rwps[v.currentWaypointIndex].isIntersection || rwps[v.currentWaypointIndex].intersectionKey !== rwps[nextStopLineIndex].intersectionKey);

      if (isApproachingIntersection && distToStopLine <= VehicleManager.LOOKAHEAD_DISTANCE) {
        // 尋找該路口出境點 (走出路口範圍的第一個航點)
        let intersectionExitWpIndex = nextStopLineIndex;
        for (let k = nextStopLineIndex; k < rwps.length; k++) {
          if (rwps[k].isIntersection) {
            intersectionExitWpIndex = k;
          } else if (k > nextStopLineIndex) {
            intersectionExitWpIndex = k;
            break;
          }
        }

        // 計算自當前車輛行駛至路口完全出境的累計距離
        let distInsideBox = 0;
        for (let k = nextStopLineIndex; k < intersectionExitWpIndex; k++) {
          distInsideBox += rwps[k].position.distanceTo(rwps[k + 1].position);
        }
        const distToBoxExit = distToStopLine + distInsideBox;

        // 條件 A: 探測前方在途前車，若前車停等/減速慢行且自車預估煞停點仍位於路口內
        const leadForBox = this.findLeadVehicle(v, distToBoxExit + 4.0);
        if (leadForBox && leadForBox.leadVehicle.speed <= 2.0) {
          const projectedStopDist = leadForBox.distance - VehicleManager.MIN_FOLLOWING_DIST;
          if (projectedStopDist < distToBoxExit + 0.35) {
            isBoxBlocked = true;
          }
        }

        // 條件 B: 檢查下游目標車道隊列尾端空間
        const exitWp = rwps[intersectionExitWpIndex];
        const downstreamLaneId = exitWp?.laneId;
        if (!isBoxBlocked && downstreamLaneId && downstreamLaneId !== v.currentLaneId) {
          const downstreamQueue = this.laneQueues.get(downstreamLaneId);
          if (downstreamQueue && downstreamQueue.length > 0) {
            const tailEntry = downstreamQueue[downstreamQueue.length - 1];
            if (tailEntry.vehicle.speed <= 2.0) {
              const nextLane = this.roadNetwork.getAllLanes().get(downstreamLaneId);
              const nextLaneLen = nextLane ? this.getLaneLength(nextLane) : 2.0;
              const spaceAvailable = Math.max(0, nextLaneLen - tailEntry.distToExit);
              if (spaceAvailable < VehicleManager.VEHICLE_LENGTH + VehicleManager.STOPPING_GAP + 0.15) {
                isBoxBlocked = true;
              }
            }
          }
        }
      }

      v.isHoldingForBoxClearance = isBoxBlocked && !isRedOrYellow;

      // 4.3 計算紅綠燈號誌與路口淨空之安全速限與最大允許位移
      let targetSpeedForSignal = v.targetSpeed;
      let maxSignalMove = Infinity;

      const mustHoldAtStopLine = (isRedOrYellow || isBoxBlocked) && nextStopLineIndex !== -1 && isApproachingIntersection;

      if (mustHoldAtStopLine) {
        const remainingDistToStopLine = Math.max(0, distToStopLine - VehicleManager.STOP_LINE_BUFFER);
        maxSignalMove = remainingDistToStopLine;

        if (distToStopLine <= VehicleManager.STOP_LINE_BUFFER + 0.05) {
          targetSpeedForSignal = 0;
        } else if (distToStopLine <= VehicleManager.LOOKAHEAD_DISTANCE) {
          targetSpeedForSignal = Math.min(
            v.targetSpeed,
            Math.sqrt(2 * v.deceleration * remainingDistToStopLine)
          );
        }
      }

      // 4.3 透過車道隊列與跨車道探測搜尋前方車輛 (Leader)
      const leadInfo = this.findLeadVehicle(v, VehicleManager.LOOKAHEAD_DISTANCE);
      let targetSpeedForLead = v.targetSpeed;
      let maxLeadMove = Infinity;

      if (leadInfo) {
        const leadCar = leadInfo.leadVehicle;
        const centerDist = leadInfo.distance;
        // 考慮車身長度補償：中心點距離扣除最小停等距離，得到純空隙間距 (netGap)
        const netGap = Math.max(0, centerDist - VehicleManager.MIN_FOLLOWING_DIST);
        maxLeadMove = netGap;

        if (centerDist <= VehicleManager.MIN_FOLLOWING_DIST + 0.05) {
          // 已達或小於安全車距：速度不超過前車速度（若前車停等則本車為 0）
          targetSpeedForLead = Math.min(v.targetSpeed, leadCar.speed);
        } else if (centerDist <= VehicleManager.LOOKAHEAD_DISTANCE) {
          // 動態跟車安全煞車公式：v_safe = sqrt(v_lead^2 + 2 * a_decel * netGap)
          // 兼具巡航跟車減速與紅燈停等煞停
          const safeSpeed = Math.sqrt(
            Math.max(0, leadCar.speed * leadCar.speed + 2 * v.deceleration * netGap)
          );
          targetSpeedForLead = Math.min(v.targetSpeed, safeSpeed);
        }
      }

      // 4.4 迴轉車輛路口衝突禮讓 (Yield to Oncoming Traffic)
      // 在 T 字與十字路口，迴轉車輛路權最低，若對向有直行車流必須主動在路口前或路口內減速禮讓
      let targetSpeedForYield = v.targetSpeed;
      let maxYieldMove = Infinity;

      const currLane = v.currentLaneId ? this.roadNetwork.getAllLanes().get(v.currentLaneId) : null;
      let uTurnLane: DirectedLane | null = currLane?.isUTurn ? currLane : null;

      if (!uTurnLane) {
        // 若自車當前在進路口前，探測前方即將進入之車道是否為迴轉車道
        for (let k = v.currentWaypointIndex; k < Math.min(v.currentWaypointIndex + 6, rwps.length); k++) {
          const lid = rwps[k].laneId;
          const l = lid ? this.roadNetwork.getAllLanes().get(lid) : null;
          if (l?.isUTurn) {
            uTurnLane = l;
            break;
          }
        }
      }

      if (uTurnLane && uTurnLane.intersectionKey) {
        const interKey = uTurnLane.intersectionKey;
        let opposingPrefix = '';
        if (uTurnLane.id.includes('_N_to_N')) opposingPrefix = '_S_to_';
        else if (uTurnLane.id.includes('_S_to_S')) opposingPrefix = '_N_to_';
        else if (uTurnLane.id.includes('_E_to_E')) opposingPrefix = '_W_to_';
        else if (uTurnLane.id.includes('_W_to_W')) opposingPrefix = '_E_to_';

        if (opposingPrefix) {
          for (const other of this.vehicles) {
            if (other === v || other.state === 'Arrived') continue;
            const otherLaneId = other.currentLaneId ?? '';
            const otherLane = this.roadNetwork.getAllLanes().get(otherLaneId);
            if (otherLane?.isUTurn) continue; // 兩台迴轉車互不干擾各自轉向

            const otherInSameInter = (otherLane?.intersectionKey === interKey && otherLaneId.includes(opposingPrefix));
            const otherHeadingToInter = other.route.routeWaypoints.some(
              (wp, idx) => idx >= other.currentWaypointIndex && idx <= other.currentWaypointIndex + 8 &&
                           wp.intersectionKey === interKey && wp.laneId?.includes(opposingPrefix)
            );

            if (otherInSameInter || otherHeadingToInter) {
              const distToOther = v.currentPosition.distanceTo(other.currentPosition);
              if (distToOther < 3.2) {
                targetSpeedForYield = 0;
                maxYieldMove = Math.max(0, distToOther - 1.2);
                break;
              }
            }
          }
        }
      }

      // 4.5 融合號誌約束、跟車約束與迴轉禮讓約束
      const desiredSpeed = Math.min(v.targetSpeed, targetSpeedForSignal, targetSpeedForLead, targetSpeedForYield);
      const maxAllowedMove = Math.min(maxSignalMove, maxLeadMove, maxYieldMove);

      // 4.6 平滑加減速更新
      if (v.speed > desiredSpeed) {
        v.speed = Math.max(desiredSpeed, v.speed - v.deceleration * deltaTime);
      } else {
        v.speed = Math.min(desiredSpeed, v.speed + v.acceleration * deltaTime);
      }

      // 4.7 狀態判定 (停等紅燈、路口淨空停等、跟車停等或禮讓停等)
      const isStoppedForLight = isRedOrYellow && distToStopLine <= VehicleManager.STOP_LINE_BUFFER + 0.08;
      const isStoppedForBox = isBoxBlocked && distToStopLine <= VehicleManager.STOP_LINE_BUFFER + 0.08;
      const isStoppedForCar = leadInfo !== null && leadInfo.leadVehicle.speed <= 0.05 && leadInfo.distance <= VehicleManager.MIN_FOLLOWING_DIST + 0.08;
      const isWaitingYield = targetSpeedForYield === 0;

      if (v.speed <= 0.05 && (isStoppedForLight || isStoppedForBox || isStoppedForCar || isWaitingYield)) {
        v.state = 'WaitingLight';
        v.speed = 0;
      } else {
        v.state = 'Cruising';
      }

      // 4.8 沿著航點序列前進 (位移不超過 maxAllowedMove)
      if (v.speed > 0) {
        let remainingMove = Math.min(v.speed * deltaTime, maxAllowedMove);

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

        // 4.8 更新車輛模型 Transform 與航向角（最短圓弧平滑旋轉）
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
    this.laneQueues.clear();
  }

  public getActiveVehicles(): ActiveVehicle[] {
    return this.vehicles;
  }
}
