import { BuildingDensityLevel, EntityId } from './common';

/**
 * 工業區共用狀態機所有狀態定義（低／中／高密度工業區共用）
 */
export type IndustrialLowState =
  | 'Constructing' // 施工興建中
  | 'Idle'         // 待命／招募中（預設完工後狀態）
  | 'Operating'    // 營運生產中（預留）
  | 'Paused'       // 暫停營運（預留）
  | 'Abandoned';   // 停業／廢棄（預留）

export type IndustrialState = IndustrialLowState;

/**
 * 工業區建築狀態清單項目（每棟工業建築出現時各自持有一份，含密度分級欄位供共用狀態機判斷）
 */
export interface IndustrialLowProfile {
  buildingId: EntityId;           // 所屬工業建築 ID
  modelId: string;                // 建築型號 ID (例: Industrial_4x4)
  name: string;                   // 建築名稱
  density: BuildingDensityLevel;  // 密度分級 ('Low' | 'Medium' | 'High')，供共用工業狀態機判斷
  state: IndustrialLowState;      // 當前狀態機狀態

  // 1. 工廠資金
  funds: number;
  // 2. 原物料種類
  rawMaterialType: string;
  // 3. 原物料數量
  rawMaterialAmount: number;
  // 4. 產品種類
  productType: string;
  // 5. 產品數量
  productAmount: number;
  // 6. 最大員工數
  maxWorkers: number;
  // 7. 員工數（已入職）
  workerCount: number;
  // 8. 工廠內員工數（此刻實際在廠內工作之人數）
  insideWorkerCount: number;
  // 9. 工廠內貨車數（預設 1）
  insideTruckCount: number;
}

export type IndustrialProfile = IndustrialLowProfile;
