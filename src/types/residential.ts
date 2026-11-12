import { BuildingDensityLevel, EntityId } from './common';

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

  // 居住人口統計
  maxResidents: number;           // 最大居住容量
  registeredResidents: number;    // 登記居住人數
  insideResidentCount: number;    // 目前在屋內人數（嚴格對應 AT_home = true 之人數）
  isCoLiving: boolean;            // 是否合居

  // 住宅名下車輛統計
  vehicleCount: number;           // 登記車輛總數
  availableVehicleCount: number;  // 目前閒置可用車輛數
}

export type ResidentialLowProfile = ResidentialProfile;
