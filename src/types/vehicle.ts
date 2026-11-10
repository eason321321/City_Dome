import { EntityId, Vector3D } from './common';

/**
 * 車輛類型
 */
export enum VehicleType {
  Sedan = 'Sedan',           // 普通自小客車（通勤私家車）
  SUV = 'SUV',               // 休旅車
  Bus = 'Bus',               // 市區公車（大眾運輸）
  Truck = 'Truck',           // 工業貨車（物流運送）
  Police = 'Police',         // 警車（緊急服務）
  FireTruck = 'FireTruck',   // 消防車
  Ambulance = 'Ambulance',   // 救護車
}

/**
 * 車輛當前駕駛狀態
 */
export enum VehicleState {
  Spawning = 'Spawning',     // 正在從建築車庫出庫
  Cruising = 'Cruising',     // 正常行駛中
  Yielding = 'Yielding',     // 減速讓行/禮讓前車
  WaitingLight = 'WaitingLight', // 紅燈停等
  Parked = 'Parked',         // 抵達目的地並停妥
  Despawned = 'Despawned',   // 銷毀/回庫
}

/**
 * 尋路路徑點
 */
export interface RouteWaypoint {
  nodeId: EntityId;
  position: Vector3D;
}

/**
 * 導航路徑
 */
export interface VehicleRoute {
  segmentIds: EntityId[];    // 依序經過的路段
  waypoints: RouteWaypoint[];// 節點座標序列
  currentSegmentIndex: number;
  currentWaypointIndex: number;
}

/**
 * 車輛實體數據
 */
export interface Vehicle {
  id: EntityId;
  type: VehicleType;
  ownerCitizenId?: EntityId; // 駕駛的市民 ID (若為私家車)
  
  // 物理與空間狀態
  position: Vector3D;
  heading: number;           // 航向角（弧度/角度）
  speed: number;             // 當前即時速度 (m/s)
  targetSpeed: number;       // 目標速度
  acceleration: number;      // 加速度
  maxSpeed: number;          // 車輛極速
  
  // 導航與位置
  currentSegmentId?: EntityId;
  currentLaneIndex: number;
  segmentProgress: number;   // 在當前路段上的前進比例 (0.0 ~ 1.0)
  
  route?: VehicleRoute;
  state: VehicleState;
  
  // 視覺渲染優化輔助（InstancedMesh 專用）
  instanceIndex?: number;
}
