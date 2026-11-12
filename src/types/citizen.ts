import { EntityId } from './common';

/**
 * 市民行為狀態機所有狀態定義（全城共用）
 */
export type CitizenActivityState =
  | 'MovingIn'           // 遷入下車走向住宅中（模型未進屋消失前 AT_home 必為 false）
  | 'AtHome'             // 在家（僅於實際到家且 3D 模型消失後才為 true）
  | 'Sleeping'           // 在家睡覺（預留）
  | 'Traveling'          // 一般出行中
  | 'CommutingToWork'    // 前往工作地點中
  | 'AtWork'             // 工作中
  | 'CommutingToLeisure' // 前往休閒/購物中（預留）
  | 'Leisure'            // 休閒/消費中（預留）
  | 'CommutingToHome';   // 返家途中（預留）

/**
 * 市民通勤偏好交通方式
 */
export type TransitPreference = 'DriveOnly' | 'PreferTransit' | 'WalkIfClose';

/**
 * 市民實際出行交通方式
 */
export type TravelMode = 'drive' | 'walk' | 'transit';

/**
 * 市民任務列隊事件類型（後續擴充新任務只需在此新增）
 */
export type CitizenTaskType = 'FIND_JOB';

/**
 * 市民任務列隊項目
 */
export interface CitizenTaskItem {
  id: string;
  type: CitizenTaskType;
  /** 優先度 (1 ~ 100，由低到高；數值越大越優先處理) */
  priority: number;
  /** 加入列隊時之虛擬遊戲總分鐘 */
  createdAtVirtualMin: number;
  /** 最後接受時間 (虛擬遊戲總分鐘；超過即過期移除，null 表示無期限) */
  latestAcceptVirtualMin: number | null;
  /** 任務附帶參數（預留） */
  payload?: unknown;
}

/**
 * 市民出行車輛使用登記（靜態資料中的借車紀錄）
 * 用於追蹤市民是否已借用住宅名下車輛外出，確保返家時能一併將車開回歸還
 */
export interface CitizenVehicleRegistration {
  /** 是否正登記使用住宅車輛外出中 */
  isUsingVehicle: boolean;
  /** 登記借用之住宅車輛 ID (對應 ResidenceVehicle.id) */
  vehicleId?: EntityId;
  /** 該車輛登記所屬之住宅建築 ID */
  ownerBuildingId?: EntityId;
  /** 本次出行登記採用的交通方式 */
  travelMode?: TravelMode;
  /** 車輛借出登記時間戳記 (ms) */
  checkedOutAt?: number;
}

/**
 * 市民滿意度與需求指標（0 - 100，預留擴充欄位）
 */
export interface CitizenNeeds {
  overallHappiness: number;              // 總體滿意度
  health: number;                        // 健康指標（受醫療與污染影響）
  education: number;                     // 受教育程度
  commuteSatisfaction: number;           // 通勤舒適度（受塞車時間長短影響）
  wealthLevel: number;                   // 財富階層 (1-3)
}

/**
 * 市民日常時間表（以 24 小時制的虛擬小時為單位，預留擴充欄位）
 */
export interface DailySchedule {
  wakeHour: number;                      // 起床時間（例如 7:00）
  workStartHour: number;                 // 上班時間（例如 8:30）
  workEndHour: number;                   // 下班時間（例如 17:30）
  sleepHour: number;                     // 就寢時間（例如 23:00）
  leisureFrequency: number;              // 每週休閒頻率 (0.0 - 1.0)
}

/**
 * 市民靜態與狀態資料清單（全城每一位市民各自的 Context 資料）
 */
export interface CitizenProfile {
  // 基本靜態個資
  id: EntityId;
  name: string;
  gender: 'male' | 'female';
  age: number;
  homeBuildingId: EntityId;              // 住家建築 ID
  workBuildingId?: EntityId;             // 工作地點建築 ID（若有入職）
  transitPreference: TransitPreference;  // 通勤出行偏好

  // 狀態機狀態與在場模型標記
  currentActivity: CitizenActivityState; // 當前狀態機狀態
  /**
   * AT_home 狀態：嚴格僅於市民實際到家且 3D 模型移除消失後才可為 true
   */
  atHome: boolean;
  /**
   * 當前場上是否存在該市民的可視化 3D 行人模型
   */
  hasVisibleModel: boolean;
  /**
   * 當前所在建築 ID（在屋內或廠內時記錄，移動途中為 undefined）
   */
  currentLocationBuildingId?: EntityId;

  // 出行車輛使用登記
  vehicleRegistration: CitizenVehicleRegistration;

  // 市民任務列隊清單（依優先度排序）
  taskQueue: CitizenTaskItem[];

  // 向下相容便捷欄位（與 vehicleRegistration 同步維護）
  currentVehicleId?: EntityId;           // 若當前出行駕駛中，所使用之住宅車輛 ID
  currentTravelMode?: TravelMode;        // 當前出行交通方式 ('drive' | 'walk' | 'transit')

  // 預留作息與需求擴充（待討論規則後啟用）
  schedule?: DailySchedule;
  needs?: CitizenNeeds;
}
