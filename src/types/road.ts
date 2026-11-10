import { EntityId, Vector3D } from './common';

/**
 * 道路節點類型（路口控制類型）
 */
export enum IntersectionType {
  DeadEnd = 'DeadEnd',       // 盡頭
  Simple = 'Simple',         // 兩路段直接相連（彎道或直路過渡）
  ThreeWay = 'ThreeWay',     // T 字路口
  FourWay = 'FourWay',       // 十字路口
  Roundabout = 'Roundabout', // 圓環
}

/**
 * 路口號誌狀態
 */
export enum TrafficLightPhase {
  NorthSouthGreen = 'NorthSouthGreen',
  EastWestGreen = 'EastWestGreen',
  AllRed = 'AllRed',
}

/**
 * 路網節點（路口或轉折點）
 */
export interface RoadNode {
  id: EntityId;
  position: Vector3D;
  connectedSegmentIds: EntityId[];
  intersectionType: IntersectionType;
  trafficLightPhase?: TrafficLightPhase;
  phaseTimer?: number; // 號誌倒數計時（Ticks）
}

/**
 * 道路等級與規格
 */
export enum RoadType {
  TwoLane = 'TwoLane',       // 雙向單線道（住宅區小路）
  FourLane = 'FourLane',     // 雙向雙線道（市區幹道）
  Avenue = 'Avenue',         // 大道（附綠化帶）
  Highway = 'Highway',       // 高速公路（單向高速）
}

/**
 * 單一車道數據
 */
export interface Lane {
  laneIndex: number;         // 從道路內側到外側的車道索引
  direction: 'forward' | 'backward'; // 正向或反向
  speedLimit: number;        // 車道速限 (m/s)
  currentVehicleIds: EntityId[]; // 當前位於此車道上的車輛
}

/**
 * 道路線段（連接兩個節點的路段邊）
 */
export interface RoadSegment {
  id: EntityId;
  startNodeId: EntityId;
  endNodeId: EntityId;
  roadType: RoadType;
  lanes: Lane[];
  length: number;            // 實體長度（米）
  
  // 動態尋路加權相關
  baseSpeed: number;         // 基準速限
  currentSpeed: number;      // 考量壅塞後的平均通過速度
  congestionFactor: number;  // 壅塞係數 (1.0 = 完全順暢, >3.0 = 嚴重塞車)
}

/**
 * 路網圖結構接口
 */
export interface RoadNetworkGraph {
  nodes: Map<EntityId, RoadNode>;
  segments: Map<EntityId, RoadSegment>;
}
