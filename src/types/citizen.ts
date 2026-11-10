import { EntityId } from './common';

/**
 * 市民行為狀態機
 */
export enum CitizenActivityState {
  Sleeping = 'Sleeping',                 // 在家睡覺
  AtHome = 'AtHome',                     // 在家休閒
  CommutingToWork = 'CommutingToWork',   // 前往工作地點（駕駛或搭乘）
  Working = 'Working',                   // 工作中
  CommutingToLeisure = 'CommutingToLeisure', // 前往休閒/購物
  Leisure = 'Leisure',                   // 在商業區休閒/消費
  CommutingToHome = 'CommutingToHome',   // 下班返回住家
}

/**
 * 市民通勤偏好交通方式
 */
export enum TransitPreference {
  DriveOnly = 'DriveOnly',               // 堅持開私家車
  PreferTransit = 'PreferTransit',       // 偏好公車/大眾運輸
  WalkIfClose = 'WalkIfClose',           // 短距離步行
}

/**
 * 市民滿意度與需求指標（0 - 100）
 */
export interface CitizenNeeds {
  overallHappiness: number;              // 總體滿意度
  health: number;                        // 健康指標（受醫療與污染影響）
  education: number;                     // 受教育程度
  commuteSatisfaction: number;          // 通勤舒適度（受塞車時間長短影響）
  wealthLevel: number;                   // 財富階層 (1-3)
}

/**
 * 市民日常時間表（以 24 小時制的虛擬小時為單位）
 */
export interface DailySchedule {
  wakeHour: number;                      // 起床時間（例如 7:00）
  workStartHour: number;                 // 上班時間（例如 8:30）
  workEndHour: number;                   // 下班時間（例如 17:30）
  sleepHour: number;                     // 就寢時間（例如 23:00）
  leisureFrequency: number;              // 每週休閒頻率 (0.0 - 1.0)
}

/**
 * 市民個體數據結構
 */
export interface Citizen {
  id: EntityId;
  name: string;
  age: number;
  
  // 地點綁定
  homeBuildingId: EntityId;              // 住家建築 ID
  workplaceBuildingId?: EntityId;        // 工作地點 ID（老人、小孩或失業者為空）
  currentLocationBuildingId?: EntityId;  // 當前所在建築 ID
  currentVehicleId?: EntityId;           // 正在駕駛或乘坐的車輛 ID
  
  // 狀態與作息
  activityState: CitizenActivityState;
  schedule: DailySchedule;
  transitPreference: TransitPreference;
  needs: CitizenNeeds;
}
