import * as THREE from 'three';
import type { BuildingMetadata } from '../rendering/BuildingModelFactory';
import type { CurbsideSpot } from '../simulation/ParkingManager';
import type { BuildingDensityLevel } from './common';
import type { IndustrialLowProfile } from './industrial';
import type { ResidentialLowProfile } from './residential';

export type VehicleMoveInSource = 'construction' | 'merge';
export type VehicleStatus = 'available' | 'in_use' | 'en_route_move_in';

export interface ResidenceVehicle {
  id: string;                         // 車輛唯一識別碼 (例: veh_bld_1_1)
  buildingId: string;                 // 所屬住宅建築 ID
  source: VehicleMoveInSource;        // 來源：'construction' (建屋遷入) | 'merge' (併入遷入)
  sourceLabel: string;                // 易讀標籤：'建屋遷入' | '併入遷入'
  color: number;                      // 車身烤漆顏色 HEX
  colorName: string;                  // 車身顏色名稱 (例: '蔚藍色', '曜石黑')
  status: VehicleStatus;              // 'available' (住宅可用) | 'in_use' (市民出行中) | 'en_route_move_in' (初次遷入在途)
  parkedCarId?: string;               // 停放在 ParkingManager 中的 ParkedCar ID
  parkedSpot?: CurbsideSpot;          // 停放的路側位置
  currentDriverCitizenId?: string;    // 當前借出駕駛的市民 ID
  currentDriverName?: string;         // 當前借出駕駛的市民姓名
  registeredAt: number;               // 登記時間戳記 (純資料欄位，不含 Three.js 實體參考)
}

/**
 * 地圖上之建築實體外殼（專責 3D 模型、座標、土地與聯外道路關係；業務狀態統一收斂至對應 Profile）
 */
export interface PlacedBuilding {
  id: string;
  metadata: BuildingMetadata;
  modelId: string;
  lot: {
    originZx: number;
    originZz: number;
    frontageWidth: number;
    lotDepth: number;
  };
  occupiedCellKeys: string[];
  facing: 'N' | 'S' | 'E' | 'W';
  worldCenter: THREE.Vector3;
  frontWorldPos: THREE.Vector3;
  targetRoadTileKey: string;
  group: THREE.Group;
  buildingMesh: THREE.Group;
  scaffoldingGroup: THREE.Group;
  status: 'constructing' | 'completed';
  constructionProgress: number;     // 0.0 ~ 1.0
  constructionDuration: number;     // 建造總秒數 (以遊戲模擬時間計)
  industrialProfile?: IndustrialLowProfile;   // 工業區狀態清單項目（單一事實來源）
  residentialProfile?: ResidentialLowProfile; // 住宅區狀態清單項目（單一事實來源）
  craneRefs?: {
    slewArm: THREE.Group;
    trolley: THREE.Group;
    cable: THREE.Mesh;
    hookAndCargo: THREE.Group;
    beacon: THREE.Mesh;
    baseAngle: number;
    jibLength: number;
    mastHeight: number;
    animTimer: number;
  };
}

export type MoveInType = 'joinExisting' | 'buildNew';
export type DemandStatus = 'pending' | 'matched' | 'lost';

export interface HousingDemand {
  id: string;
  peopleCount: number;                 // 入住人數 1 - 5
  moveInType: MoveInType;              // 併入別人 (joinExisting) vs 建立新房屋 (buildNew)
  density: BuildingDensityLevel;       // 需求住宅密度 (目前皆為 'Low')
  preferredModels: string[];           // 2 個可接受之偏好房型 ID
  status: DemandStatus;                // 'pending' | 'matched' | 'lost'
  createdAt: number;
  matchedBuildingId?: string;          // 成功配對之房屋 ID
  matchedBuildingName?: string;        // 成功配對之房屋名稱
  matchedType?: MoveInType;            // 實際配對類型
  failReason?: string;                 // 配對失敗流失原因
}

export interface MatchingResult {
  success: boolean;
  peopleCount: number;
  timestamp: number;
  buildingName?: string;
  reason?: string;
  demand?: HousingDemand;
}


