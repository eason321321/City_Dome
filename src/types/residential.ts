import { BasePipelineSession, BaseTaskItem, BuildingDensityLevel, EntityId } from './common';
import type { ResidenceVehicle } from './building';

/**
 * 住宅區共用狀態機所有狀態定義（支援各密度住宅共用）
 */
export type ResidentialState =
  | 'Constructing'   // 施工興建中
  | 'WaitingForRoad' // 缺乏聯外道路等待遷入中
  | 'MovingIn'       // 市民開車與步行遷入中
  | 'Active'         // 正常居住運作中（至少有一名市民入屋）
  | 'Abandoned';     // 廢棄（預留）

/**
 * 住宅區任務列隊事件類型（預留後續擴充維護、修繕、環境衛生或定期租稅檢查等任務）
 */
export type ResidentialTaskType = 'MAINTENANCE';

/**
 * 住宅區任務列隊項目（繼承共用 BaseTaskItem，包含優先度、最早執行時間與截止時間機制）
 */
export interface ResidentialTaskItem extends BaseTaskItem<ResidentialTaskType> {}

/**
 * 住宅區複合任務微觀子階段定義
 */
export type ResidentialStage =
  | 'INSPECTING'       // 階段 1：檢查住宅結構、屋況與安全
  | 'ORDERING_PARTS'   // 階段 2：叫修／訂購修繕建材
  | 'REPAIRING'        // 階段 3：工班到場修繕維護中
  | 'COMPLETED';       // 階段 4：維護完成驗收

/**
 * 住宅區複合任務微觀管線會話
 */
export interface ResidentialPipelineSession
  extends BasePipelineSession<ResidentialTaskType, ResidentialStage> {
  payload?: {
    cost?: number;
    inspectorId?: string;
    repairProgress?: number;
    [key: string]: any;
  };
}

/**
 * 住宅區建築狀態清單項目（每棟住宅建築出現時各自持有一份）
 */
export interface ResidentialProfile {
  buildingId: EntityId;           // 所屬住宅建築 ID
  modelId: string;                // 建築型號 ID (例: Residential_2x2)
  name: string;                   // 建築名稱
  density: BuildingDensityLevel;  // 密度分級 ('Low' | 'Medium' | 'High')，供共用住宅狀態機判斷
  state: ResidentialState;        // 當前狀態機狀態

  // 住宅／家庭資產與等級
  funds: number;                  // 住宅家庭資金
  level: number;                  // 住宅等級（預設 1）

  // 居住人口統計與居民 ID 索引（僅存 EntityId，完整個資由 CitizenManager 統一持有）
  maxResidents: number;           // 最大居住容量
  registeredResidents: number;    // 登記居住人數
  insideResidentCount: number;    // 目前在屋內人數（嚴格對應 AT_home = true 之人數）
  isCoLiving: boolean;            // 是否合居
  residentIds: EntityId[];        // 登記入住之市民 ID 清單

  // 住宅名下車輛資料與統計（單一事實來源）
  vehicles: ResidenceVehicle[];   // 登記於此住宅名下之車輛資料清單
  vehicleCount: number;           // 登記車輛總數
  availableVehicleCount: number;  // 目前閒置可用車輛數

  // 住宅任務列隊清單（依優先度排序）
  taskQueue: ResidentialTaskItem[];

  /**
   * 當前正在執行之微觀子任務管線會話（若為 undefined 表示當前無微觀子任務推進中）
   */
  activePipeline?: ResidentialPipelineSession;
}

export type ResidentialLowProfile = ResidentialProfile;

