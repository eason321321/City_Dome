import {
  CitizenProfile,
} from '../types/citizen';
import {
  PlacedBuilding,
  ResidenceVehicle,
} from '../types/building';
import { RoadNetwork } from '../systems/RoadNetwork';
import { PedestrianNetwork } from '../systems/PedestrianNetwork';
import { VehicleModelFactory } from '../rendering/VehicleModelFactory';
import { PedestrianManager } from './PedestrianManager';
import { VehicleManager } from './VehicleManager';
import { ParkingManager } from './ParkingManager';
import { CitizenStateContext, CitizenStateMachine } from './CitizenStateMachine';
import { IndustrialStateMachine } from './IndustrialStateMachine';
import { ResidentialStateMachine } from './ResidentialStateMachine';
import { TravelModeEvaluator, TravelDecisionPlan } from './TravelModeEvaluator';

export interface CitizenManagerSyncHooks {
  onBuildingStateChanged?: (building: PlacedBuilding) => void;
}

/**
 * 全城市民生命週期與出行調度管理器 (CitizenManager)
 * 負責：
 * 1. 全城市民 Map 註冊與 O(1) 查詢、基本資料生成
 * 2. 每 10 虛擬分鐘推進全城共用狀態機檢查、每 10 次同步觸發找工作任務入隊與列隊消費
 * 3. 市民出行方式純決策評估 (evaluateCitizenTravel) 與住宅車輛借出/歸還統一窗口
 */
export class CitizenManager {
  public static readonly STATE_CHECK_INTERVAL_MIN: number = 10;
  public static readonly JOB_ENQUEUE_EVERY_N_CHECKS: number = 10;

  private pedestrianNetwork: PedestrianNetwork;
  private pedestrianManager: PedestrianManager;
  private parkingManager: ParkingManager | null = null;

  private citizens: Map<string, CitizenProfile> = new Map();
  private nextCitizenId: number = 1;
  private lastCheckVirtualMin: number = 0;
  private periodicCheckCount: number = 0;
  private hooks: CitizenManagerSyncHooks = {};

  constructor(
    _roadNetwork: RoadNetwork,
    pedestrianNetwork: PedestrianNetwork,
    pedestrianManager: PedestrianManager,
    _vehicleManager: VehicleManager
  ) {
    this.pedestrianNetwork = pedestrianNetwork;
    this.pedestrianManager = pedestrianManager;
  }

  public setParkingManager(parkingManager: ParkingManager | null): void {
    this.parkingManager = parkingManager;
  }

  public getPedestrianManager(): PedestrianManager {
    return this.pedestrianManager;
  }

  public setSyncHooks(hooks: CitizenManagerSyncHooks): void {
    this.hooks = hooks;
  }

  /**
   * 隨機生成家庭或合居市民的基本靜態與狀態資料，並登錄於全城市民註冊表
   */
  public generateCitizenProfiles(buildingId: string, count: number): CitizenProfile[] {
    const surnames = ['林', '陳', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '洪', '郭', '曾', '邱', '廖', '賴', '周'];
    const maleNames = ['冠廷', '宇軒', '柏翰', '宗翰', '承翰', '家豪', '志偉', '俊傑', '冠宇', '威廷', '哲瑋', '廷宇', '建宏', '柏睿', '翔宇', '子豪', '彥廷', '志明', '文傑', '俊宇'];
    const femaleNames = ['雅婷', '佳穎', '婷萱', '怡萱', '詩涵', '佩萱', '欣妤', '鈺婷', '雅筑', '怡君', '詠晴', '郁婷', '冠妤', '巧涵', '芝瑩', '心妤', '惠雯', '淑芬', '雅雯', '佳蓉'];

    const profiles: CitizenProfile[] = [];
    const isSingle = count === 1;

    for (let i = 0; i < count; i++) {
      let gender: 'male' | 'female';
      let age: number;

      if (isSingle) {
        gender = Math.random() < 0.5 ? 'male' : 'female';
        age = 22 + Math.floor(Math.random() * 32);
      } else if (i === 0) {
        gender = Math.random() < 0.5 ? 'male' : 'female';
        age = 27 + Math.floor(Math.random() * 20);
      } else if (i === 1) {
        gender = Math.random() < 0.75
          ? (profiles[0].gender === 'male' ? 'female' : 'male')
          : (Math.random() < 0.5 ? 'male' : 'female');
        age = Math.max(22, profiles[0].age + Math.floor(Math.random() * 7) - 3);
      } else {
        gender = Math.random() < 0.5 ? 'male' : 'female';
        const isChild = Math.random() < 0.7;
        age = isChild ? (5 + Math.floor(Math.random() * 14)) : (20 + Math.floor(Math.random() * 25));
      }

      const surname = surnames[Math.floor(Math.random() * surnames.length)];
      const givenName = gender === 'male'
        ? maleNames[Math.floor(Math.random() * maleNames.length)]
        : femaleNames[Math.floor(Math.random() * femaleNames.length)];

      const profile: CitizenProfile = {
        id: `cit_${this.nextCitizenId++}`,
        name: `${surname}${givenName}`,
        gender,
        age,
        homeBuildingId: buildingId,
        workBuildingId: undefined,
        earliestWorkTime: undefined,
        currentActivity: 'MovingIn',
        atHome: false,
        hasVisibleModel: false,
        currentLocationBuildingId: undefined,
        vehicleRegistration: {
          isUsingVehicle: false,
        },
        taskQueue: [],
        activePipeline: undefined,
      };

      this.citizens.set(profile.id, profile);
      profiles.push(profile);
    }

    return profiles;
  }

  /**
   * 取得特定市民詳細檔案 (O(1) Map 查詢)
   */
  public getCitizenProfile(citizenId: string): CitizenProfile | undefined {
    return this.citizens.get(citizenId);
  }

  /**
   * 取得指定住宅或全城所有市民清單（由 ResidentialProfile.residentIds 映射 O(1) 查找）
   */
  public getAllResidents(
    buildings: Map<string, PlacedBuilding>,
    buildingId?: string
  ): CitizenProfile[] {
    if (buildingId) {
      const ids = buildings.get(buildingId)?.residentialProfile?.residentIds ?? [];
      const result: CitizenProfile[] = [];
      for (const id of ids) {
        const c = this.citizens.get(id);
        if (c) result.push(c);
      }
      return result;
    }
    return Array.from(this.citizens.values());
  }

  /**
   * 共用車輛借出窗口（統一更新住宅車輛清單統計與市民車輛使用登記）
   * 供後續狀態機系統與出行執行系統調度住宅名下車輛借出使用
   */
  public checkoutVehicle(
    citizen: CitizenProfile,
    homeBuilding: PlacedBuilding,
    vehicle: ResidenceVehicle
  ): void {
    vehicle.status = 'in_use';
    vehicle.currentDriverCitizenId = citizen.id;
    vehicle.currentDriverName = citizen.name;
    if (homeBuilding.residentialProfile) {
      ResidentialStateMachine.refreshVehicleCounts(homeBuilding.residentialProfile);
    }
    CitizenStateMachine.registerVehicleUsage(citizen, vehicle.id, homeBuilding.id, 'drive');
    this.hooks.onBuildingStateChanged?.(homeBuilding);
  }

  /**
   * 共用車輛歸還窗口（統一更新住宅車輛清單統計、清理路邊停車位並清除市民車輛登記）
   * 供後續狀態機系統與出行執行系統調度市民返家還車使用
   */
  public returnVehicleToHome(
    citizen: CitizenProfile,
    homeBuilding: PlacedBuilding,
    reParkAtHome: boolean = false
  ): void {
    const resProfile = homeBuilding.residentialProfile;
    const usedVehicleId = citizen.vehicleRegistration.vehicleId ?? citizen.currentVehicleId;
    if (usedVehicleId && resProfile) {
      const veh = resProfile.vehicles.find((v) => v.id === usedVehicleId);
      if (veh) {
        if (reParkAtHome) {
          if (veh.parkedCarId && this.parkingManager) {
            this.parkingManager.removeParkedCar(veh.parkedCarId);
            veh.parkedCarId = undefined;
            veh.parkedSpot = undefined;
          }

          const homeSpot = this.parkingManager?.findClosestAvailableSpot(
            homeBuilding.frontWorldPos,
            homeBuilding.targetRoadTileKey
          );
          if (homeSpot && this.parkingManager) {
            const mesh = VehicleModelFactory.createVehicle(veh.color);
            const parked = this.parkingManager.parkExistingCarMesh(
              mesh,
              homeSpot,
              veh.color,
              homeBuilding.id,
              veh.id
            );
            veh.parkedCarId = parked.id;
            veh.parkedSpot = homeSpot;
          }
        }

        veh.status = 'available';
        veh.currentDriverCitizenId = undefined;
        veh.currentDriverName = undefined;
        ResidentialStateMachine.refreshVehicleCounts(resProfile);
      }
    }
    CitizenStateMachine.clearVehicleUsage(citizen);
    this.hooks.onBuildingStateChanged?.(homeBuilding);
  }

  /**
   * 市民移動時選定交通方式之純決策評估 (委派 TravelModeEvaluator，100% 無副作用)
   */
  public evaluateCitizenTravel(
    citizenId: string,
    originBuildingId: string,
    destBuildingId: string,
    buildings: Map<string, PlacedBuilding>
  ): TravelDecisionPlan | null {
    const citizen = this.citizens.get(citizenId);
    const origin = buildings.get(originBuildingId);
    const dest = buildings.get(destBuildingId);
    if (!citizen || !origin || !dest) return null;

    return TravelModeEvaluator.evaluate(citizen, origin, dest, {
      buildings,
      pedestrianNetwork: this.pedestrianNetwork,
    });
  }

  /**
   * 固定虛擬時間週期驅動全城共用狀態機檢查與任務列隊：
   * - 每 10 虛擬分鐘檢查一次全體市民狀態與任務列隊
   * - 全城同步每 10 次檢查（每 100 虛擬分鐘）觸發一次 FIND_JOB 入隊評估
   */
  public stepPeriodicSimulation(
    currentVirtualMin: number,
    buildings: Map<string, PlacedBuilding>,
    industrialBuildings: PlacedBuilding[]
  ): { checksRun: number; jobsAssigned: number } {
    let checksRun = 0;
    let jobsAssigned = 0;

    while (currentVirtualMin - this.lastCheckVirtualMin >= CitizenManager.STATE_CHECK_INTERVAL_MIN) {
      this.lastCheckVirtualMin += CitizenManager.STATE_CHECK_INTERVAL_MIN;
      const checkTimeMin = this.lastCheckVirtualMin;
      this.periodicCheckCount += 1;
      checksRun += 1;

      const isJobEnqueueRound =
        this.periodicCheckCount % CitizenManager.JOB_ENQUEUE_EVERY_N_CHECKS === 0;

      const context: CitizenStateContext = {
        currentVirtualMin: checkTimeMin,
        tryAssignNearestJob: (citizen) => {
          const assigned = this.tryAssignNearestReachableJob(
            citizen,
            buildings,
            industrialBuildings
          );
          if (assigned) {
            jobsAssigned += 1;
          }
          return assigned;
        },
      };

      for (const citizen of this.citizens.values()) {
        if (isJobEnqueueRound) {
          CitizenStateMachine.enqueueTask(citizen, 'FIND_JOB', checkTimeMin, context);
        }
        CitizenStateMachine.processTaskQueue(citizen, checkTimeMin, context);
        CitizenStateMachine.tick(citizen, CitizenManager.STATE_CHECK_INTERVAL_MIN, context);
      }
    }

    return { checksRun, jobsAssigned };
  }

  /**
   * 取得週期狀態檢查統計資訊
   */
  public getPeriodicCheckStats(): {
    periodicCheckCount: number;
    lastCheckVirtualMin: number;
  } {
    return {
      periodicCheckCount: this.periodicCheckCount,
      lastCheckVirtualMin: this.lastCheckVirtualMin,
    };
  }

  /**
   * 單一關係變更窗口：原子性建立「市民 <-> 工廠」僱傭關係
   * 避免單邊寫入導致資料不同步或殘留幽靈職位
   */
  public assignWorkerToFactory(citizen: CitizenProfile, factory: PlacedBuilding): boolean {
    if (!factory.industrialProfile) return false;
    if (!IndustrialStateMachine.hireWorker(factory.industrialProfile, citizen.id)) {
      return false;
    }
    citizen.workBuildingId = factory.id;
    citizen.earliestWorkTime = factory.industrialProfile.earliestWorkTime;
    this.hooks.onBuildingStateChanged?.(factory);
    return true;
  }

  /**
   * 單一關係變更窗口：原子性解除「市民 <-> 工廠」僱傭關係（供離職、裁員、拆廠使用）
   */
  public unassignWorkerFromFactory(
    citizen: CitizenProfile,
    buildings: Map<string, PlacedBuilding>
  ): boolean {
    if (!citizen.workBuildingId) return false;
    const factory = buildings.get(citizen.workBuildingId);
    if (factory?.industrialProfile) {
      IndustrialStateMachine.fireWorker(factory.industrialProfile, citizen.id);
      this.hooks.onBuildingStateChanged?.(factory);
    }
    citizen.workBuildingId = undefined;
    citizen.earliestWorkTime = undefined;
    return true;
  }

  /**
   * 市民端找工作核心實作：
   * 1. 篩選已完工、營運狀態為 Idle/Operating 且尚有空位的工廠
   * 2. 依住家至工廠的直線距離由近到遠排序
   * 3. 逐一檢查住家與工廠之間是否至少存在一條步行可達路徑，找到第一家即透過單一窗口錄取
   */
  private tryAssignNearestReachableJob(
    citizen: CitizenProfile,
    buildings: Map<string, PlacedBuilding>,
    industrialBuildings: PlacedBuilding[]
  ): boolean {
    const homeBuilding = buildings.get(citizen.homeBuildingId);
    if (!homeBuilding) return false;

    const candidates = industrialBuildings
      .filter((f) => {
        if (f.status !== 'completed' || !f.industrialProfile) return false;
        return IndustrialStateMachine.hasVacancy(f.industrialProfile);
      })
      .sort(
        (a, b) =>
          homeBuilding.worldCenter.distanceToSquared(a.worldCenter) -
          homeBuilding.worldCenter.distanceToSquared(b.worldCenter)
      );

    for (const factory of candidates) {
      const walkPath = this.pedestrianNetwork.findPathBetweenBuildings(homeBuilding, factory);
      if (walkPath && this.assignWorkerToFactory(citizen, factory)) {
        return true;
      }
    }

    return false;
  }
}
