import { EntityId, GridCoord, Vector3D } from './common';

/**
 * 土地規劃分區類型 (Zoning)
 */
export enum ZoneType {
  None = 'None',
  ResidentialLow = 'ResidentialLow',     // 低密度住宅（郊區平房）
  ResidentialHigh = 'ResidentialHigh',   // 高密度住宅（大廈公寓）
  Commercial = 'Commercial',             // 商業區（商場、辦公室）
  Industrial = 'Industrial',             // 工業區（工廠、倉儲）
  ServicePolice = 'ServicePolice',       // 警察局
  ServiceFire = 'ServiceFire',           // 消防局
  ServiceHospital = 'ServiceHospital',   // 醫院
  Park = 'Park',                         // 市民公園/綠地
}

/**
 * 建築生命週期狀態
 */
export enum BuildingState {
  Planned = 'Planned',                   // 規劃劃定中
  UnderConstruction = 'UnderConstruction',// 施工興建中
  Active = 'Active',                     // 正常運作中
  Degrading = 'Degrading',               // 衰微中（缺乏服務或環境惡化）
  Abandoned = 'Abandoned',               // 廢棄（需拆除或重建）
  OnFire = 'OnFire',                     // 火災中
}

/**
 * 建築尺寸與佔地（網格單元）
 */
export interface BuildingFootprint {
  width: number;                         // 網格寬度 (X 軸單元數)
  depth: number;                         // 網格深度 (Z 軸單元數)
}

/**
 * 建築升級與資源指標
 */
export interface BuildingMetrics {
  landValue: number;                     // 地價指數 (0 - 100)
  crimeRate: number;                     // 犯罪率 (0 - 100)
  pollutionLevel: number;                // 污染指數 (0 - 100)
  fireRisk: number;                      // 火災風險 (0 - 100)
  
  // 市政公共服務覆蓋
  hasWater: boolean;
  hasPower: boolean;
  hasRoadAccess: boolean;
}

/**
 * 建築實體數據結構
 */
export interface Building {
  id: EntityId;
  zoneType: ZoneType;
  level: number;                         // 建築等級 (1 ~ 5)
  state: BuildingState;
  
  // 空間座標
  gridCoord: GridCoord;                  // 網格坐標
  worldPosition: Vector3D;               // 3D 世界座標
  footprint: BuildingFootprint;
  
  // 容量與住戶/工人/車輛
  capacity: number;                      // 最大容納人數
  residentIds: EntityId[];               // 登記於此的市民 ID (若為住宅)
  workerIds: EntityId[];                 // 在此上班的市民 ID (若為商業/工業)
  registeredVehicleIds?: EntityId[];     // 登記於此住宅之私家車輛 ID (一輛或多輛)
  
  // 經濟與發展
  constructionProgress: number;          // 建造/升級進度 (0.0 - 1.0)
  taxRevenue: number;                    // 每週期提供的稅收
  metrics: BuildingMetrics;
  
  // 渲染優化關聯
  instanceIndex?: number;
}
