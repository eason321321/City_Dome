import * as THREE from 'three';
import { CitizenProfile } from '../types/citizen';
import { PlacedBuilding, ResidenceVehicle } from '../types/building';
import { PedestrianNetwork } from '../systems/PedestrianNetwork';
import { ResidentialStateMachine } from './ResidentialStateMachine';
import { CurbsideSpot } from './ParkingManager';

/**
 * 交通方式判定評估上下文環境
 */
export interface TravelEvaluationContext {
  /** 全城建築實體索引表 */
  buildings: Map<string, PlacedBuilding>;
  /** 行人專屬路網（用於計算真實人行道步行距離） */
  pedestrianNetwork: PedestrianNetwork;
}

/**
 * 純決策評估器產出之決策結果方案（100% 無副作用純資料物件）
 */
export interface TravelDecisionPlan {
  /** 選定之出行模式 ('drive' | 'walk') */
  selectedMode: 'drive' | 'walk';
  /** 真實人行道路網步行距離（公尺） */
  walkDistanceMeters: number;
  /** 決策原因文字描述 */
  reason: string;
  /** 是否需要前置步行前往車輛停靠處取車 */
  needsWalkToCar: boolean;
  /** 若選定開車，所選用之住宅名下車輛資料 */
  vehicle?: ResidenceVehicle;
  /** 若選定開車，車輛當前停靠之路邊車位 */
  pickupSpot?: CurbsideSpot;
  /** 若選定開車，車輛當前停靠之世界座標 */
  carPosition?: THREE.Vector3;
}

/**
 * 市民出行交通方式純決策評估器 (TravelModeEvaluator)
 *
 * 核心原則：
 * 1. 職責徹底分離：僅執行客觀條件與路網計算評估，保證 100% 無狀態機轉移、無車輛借出登記等副作用。
 * 2. 邊界清晰：僅於市民產生宏觀移動意圖且交通方式未知時調用；不介入後續「走去開車」、「開車移動」等微觀執行子行為。
 * 3. 鄰里短途步行門檻：以 100m（約 10 個標準路塊）為界。
 * 4. 停車位延遲決策：出發時不預先鎖定目的地停車位，停車位由執行器在抵達目的地附近後再動態尋找。
 */
export class TravelModeEvaluator {
  /**
   * 鄰里生活圈短途步行距離門檻（100 公尺，約 10 個標準路塊）
   */
  public static readonly SHORT_WALK_DISTANCE_THRESHOLD: number = 100;

  /**
   * 評估市民移動時應選定之交通方式（純函式，無副作用）
   * @param citizen 市民個資檔案
   * @param originBuilding 出發地建築（市民當前所在建築）
   * @param destBuilding 目的地建築
   * @param context 評估環境上下文
   */
  public static evaluate(
    citizen: CitizenProfile,
    originBuilding: PlacedBuilding,
    destBuilding: PlacedBuilding,
    context: TravelEvaluationContext
  ): TravelDecisionPlan {
    const isGoHome = destBuilding.id === citizen.homeBuildingId;
    const hasRegisteredVehicle =
      citizen.vehicleRegistration.isUsingVehicle &&
      Boolean(citizen.vehicleRegistration.vehicleId);

    // 計算起點與終點之間的真實人行道步行距離
    const walkDistanceMeters = this.calculateRealWalkDistance(
      originBuilding,
      destBuilding,
      context.pedestrianNetwork
    );

    // ========================================================
    // 策略分支 1：回家行為 (目的地為市民住家)
    // ========================================================
    if (isGoHome) {
      if (hasRegisteredVehicle) {
        const vehicle = this.findRegisteredVehicle(citizen, context.buildings);
        const pickupSpot = vehicle?.parkedSpot;
        const carPosition = pickupSpot ? pickupSpot.position.clone() : undefined;
        const label = vehicle
          ? `[${vehicle.sourceLabel} · ${vehicle.colorName}]`
          : '代步車輛';

        return {
          selectedMode: 'drive',
          walkDistanceMeters,
          reason: `市民返家，選用已登記之外出車輛 ${label} 開車回家。`,
          needsWalkToCar: true,
          vehicle,
          pickupSpot,
          carPosition,
        };
      }

      return {
        selectedMode: 'walk',
        walkDistanceMeters,
        reason: '市民返家，在外無代步車輛，選擇步行回家。',
        needsWalkToCar: false,
      };
    }

    // ========================================================
    // 策略分支 2：非回家行為 (前往工廠、商店或休閒設施)
    // ========================================================

    // 2-1: 步行距離不大於 100m -> 選擇走路
    if (walkDistanceMeters <= this.SHORT_WALK_DISTANCE_THRESHOLD) {
      return {
        selectedMode: 'walk',
        walkDistanceMeters,
        reason: `非返家移動，步行距離 (${walkDistanceMeters.toFixed(1)}m) 未超過 100m 鄰里生活圈門檻，選擇步行。`,
        needsWalkToCar: false,
      };
    }

    // 2-2: 步行距離大於 100m (長途移動)
    const isAtHome = originBuilding.id === citizen.homeBuildingId;

    if (!isAtHome) {
      // 市民出發地不在家 (在外出差/在工廠/在商店)
      if (hasRegisteredVehicle) {
        const vehicle = this.findRegisteredVehicle(citizen, context.buildings);
        const pickupSpot = vehicle?.parkedSpot;
        const carPosition = pickupSpot ? pickupSpot.position.clone() : undefined;
        const label = vehicle
          ? `[${vehicle.sourceLabel} · ${vehicle.colorName}]`
          : '代步車輛';

        return {
          selectedMode: 'drive',
          walkDistanceMeters,
          reason: `長途移動 (${walkDistanceMeters.toFixed(1)}m > 100m)，市民在外已登記代步車輛 ${label}，選擇開車。`,
          needsWalkToCar: true,
          vehicle,
          pickupSpot,
          carPosition,
        };
      }

      return {
        selectedMode: 'walk',
        walkDistanceMeters,
        reason: `長途移動 (${walkDistanceMeters.toFixed(1)}m > 100m)，但市民在外無代步車輛，選擇步行。`,
        needsWalkToCar: false,
      };
    }

    // 市民出發地在家 (從住家出發長途外出)
    const isAdult = citizen.age >= 18;
    const homeBuilding = context.buildings.get(citizen.homeBuildingId);
    const resProfile = homeBuilding?.residentialProfile;
    const availableVehicles = resProfile
      ? ResidentialStateMachine.getAvailableVehicles(resProfile)
      : [];
    const canDrive = isAdult && availableVehicles.length > 0;

    if (canDrive) {
      const selectedVehicle = availableVehicles[0];
      const pickupSpot = selectedVehicle.parkedSpot;
      const carPosition = pickupSpot
        ? pickupSpot.position.clone()
        : homeBuilding?.frontWorldPos.clone();

      return {
        selectedMode: 'drive',
        walkDistanceMeters,
        reason: `長途出行 (${walkDistanceMeters.toFixed(1)}m > 100m)，市民已成年且住宅有閒置車輛 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 可用，選擇開車。`,
        needsWalkToCar: true,
        vehicle: selectedVehicle,
        pickupSpot,
        carPosition,
      };
    }

    const totalVehicles = resProfile?.vehicles.length ?? 0;
    let fallbackReason = '';
    if (!isAdult) {
      fallbackReason = `長途出行 (${walkDistanceMeters.toFixed(1)}m > 100m)，但市民年齡為 ${citizen.age} 歲（未滿 18 歲），不可駕車，選擇步行。`;
    } else if (totalVehicles === 0) {
      fallbackReason = `長途出行 (${walkDistanceMeters.toFixed(1)}m > 100m)，但住宅名下尚無登記車輛，選擇步行。`;
    } else {
      fallbackReason = `長途出行 (${walkDistanceMeters.toFixed(1)}m > 100m)，但住宅名下 ${totalVehicles} 輛車已全數由其他成員外出使用中，選擇步行。`;
    }

    return {
      selectedMode: 'walk',
      walkDistanceMeters,
      reason: fallbackReason,
      needsWalkToCar: false,
    };
  }

  /**
   * 計算出發地與目的地之間沿人行道/斑馬線路網的真實步行距離
   * 若人行道路網暫時中斷或尚未連通，退回使用曼哈頓/歐幾里得幾何距離估算
   */
  private static calculateRealWalkDistance(
    originBuilding: PlacedBuilding,
    destBuilding: PlacedBuilding,
    pedestrianNetwork: PedestrianNetwork
  ): number {
    const walkPath = pedestrianNetwork.findPathBetweenBuildings(
      originBuilding,
      destBuilding
    );
    if (walkPath && walkPath.totalDistance > 0) {
      return walkPath.totalDistance;
    }

    // 備援幾何估算（直線歐幾里得距離 * 1.35 轉折係數）
    const straightDist = originBuilding.worldCenter.distanceTo(
      destBuilding.worldCenter
    );
    return Math.max(1.0, straightDist * 1.35);
  }

  /**
   * 根據市民登記之車輛 ID，自所屬住宅狀態清單中取得該車輛資料物件
   */
  private static findRegisteredVehicle(
    citizen: CitizenProfile,
    buildings: Map<string, PlacedBuilding>
  ): ResidenceVehicle | undefined {
    const vehicleId = citizen.vehicleRegistration.vehicleId;
    if (!vehicleId) return undefined;

    const homeBuilding = buildings.get(citizen.homeBuildingId);
    const vehicles = homeBuilding?.residentialProfile?.vehicles ?? [];
    return vehicles.find((v) => v.id === vehicleId);
  }
}
