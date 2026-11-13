import { BasePipelineSession, BaseTaskItem, BuildingDensityLevel, EntityId } from './common';

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
 * 工業區任務列隊事件類型（預留後續擴充進貨、出貨、設備維修等任務）
 */
export type IndustrialTaskType = 'RESTOCK_MATERIALS' | 'SHIP_PRODUCTS' | 'MAINTENANCE';

/**
 * 工業區任務列隊項目（繼承共用 BaseTaskItem，包含優先度、最早執行時間與截止時間機制）
 */
export interface IndustrialTaskItem extends BaseTaskItem<IndustrialTaskType> {}

/**
 * 工業區複合任務微觀子階段定義
 */
export type IndustrialStage =
  // RESTOCK_MATERIALS 原料進貨子階段
  | 'ORDER_MATERIALS'        // 階段 1：下達進貨訂單
  | 'DISPATCH_SUPPLY_TRUCK'  // 階段 2：派遣貨車前往供應地
  | 'LOADING_SUPPLIES'       // 階段 3：裝載原料中
  | 'TRUCK_RETURNING'        // 階段 4：貨車返廠途中
  | 'UNLOAD_TO_STORAGE'      // 階段 5：卸貨入庫更新原料

  // SHIP_PRODUCTS 產品出貨子階段
  | 'PREPARE_SHIPMENT'       // 階段 1：備貨包裝
  | 'TRUCK_DELIVERY'         // 階段 2：貨車出貨運送至客戶
  | 'DELIVERY_SETTLEMENT'    // 階段 3：交付簽收與資金結算

  // MAINTENANCE 設備檢修子階段
  | 'INSPECT_EQUIPMENT'      // 階段 1：巡檢機具
  | 'SERVICING'              // 階段 2：停機維修保養中
  | 'RESUME_PRODUCTION';     // 階段 3：復機回歸運作

/**
 * 工業區複合任務微觀管線會話
 */
export interface IndustrialPipelineSession
  extends BasePipelineSession<IndustrialTaskType, IndustrialStage> {
  payload?: {
    materialAmount?: number;
    productAmount?: number;
    truckId?: string;
    cost?: number;
    revenue?: number;
    [key: string]: any;
  };
}

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
  // 7. 已入職員工 ID 清單與數量（單一事實來源，僅存 ID 以利存檔與避免循環參考）
  employedWorkerIds: EntityId[];
  workerCount: number;
  // 8. 工廠內員工數（此刻實際在廠內工作之人數）
  insideWorkerCount: number;
  // 9. 工廠內貨車數（預設 1）
  insideTruckCount: number;

  // 工業區最早上班時間（例如 '06:00'，低密度工業區預設為 '06:00'）
  earliestWorkTime: string;

  // 工業區任務列隊清單（依優先度排序）
  taskQueue: IndustrialTaskItem[];

  /**
   * 當前正在執行之微觀子任務管線會話（若為 undefined 表示當前無微觀子任務推進中）
   */
  activePipeline?: IndustrialPipelineSession;
}

export type IndustrialProfile = IndustrialLowProfile;

