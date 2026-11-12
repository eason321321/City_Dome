import {
  CitizenProfile,
  TransitPreference,
  TravelMode,
} from '../types/citizen';
import {
  PlacedBuilding,
  ResidenceVehicle,
  TravelDecisionOptions,
  TravelDecisionResult,
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

export interface CitizenManagerSyncHooks {
  onBuildingStateChanged?: (building: PlacedBuilding) => void;
  onCommuteStateChanged?: () => void;
}

/**
 * 全城市民生命週期與出行調度管理器 (CitizenManager)
 * 負責：
 * 1. 全城市民 Map 註冊與 O(1) 查詢、基本資料生成
 * 2. 每 10 虛擬分鐘推進全城共用狀態機檢查、每 10 次同步觸發找工作任務入隊與列隊消費
 * 3. 市民出行方式決策 (decideCitizenTravel) 與住宅車輛借出/歸還統一操作
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

      const isAdult = age >= 18;
      const transitPreference: TransitPreference = !isAdult
        ? (Math.random() < 0.6 ? 'WalkIfClose' : 'PreferTransit')
        : (Math.random() < 0.45 ? 'DriveOnly' : (Math.random() < 0.75 ? 'WalkIfClose' : 'PreferTransit'));

      const profile: CitizenProfile = {
        id: `cit_${this.nextCitizenId++}`,
        name: `${surname}${givenName}`,
        gender,
        age,
        homeBuildingId: buildingId,
        transitPreference,
        currentActivity: 'MovingIn',
        atHome: false,
        hasVisibleModel: false,
        currentLocationBuildingId: undefined,
        vehicleRegistration: {
          isUsingVehicle: false,
        },
        taskQueue: [],
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
   * 取得指定住宅或全城所有市民清單
   */
  public getAllResidents(
    buildings: Map<string, PlacedBuilding>,
    buildingId?: string
  ): CitizenProfile[] {
    if (buildingId) {
      const b = buildings.get(buildingId);
      return b ? [...b.residents] : [];
    }
    return Array.from(this.citizens.values());
  }

  /**
   * 共用車輛借出 helper（統一更新住宅車輛與市民車輛使用登記）
   */
  private checkoutVehicle(
    citizen: CitizenProfile,
    homeBuilding: PlacedBuilding,
    vehicle: ResidenceVehicle
  ): void {
    vehicle.status = 'in_use';
    vehicle.currentDriverCitizenId = citizen.id;
    vehicle.currentDriverName = citizen.name;
    CitizenStateMachine.registerVehicleUsage(citizen, vehicle.id, homeBuilding.id, 'drive');
  }

  /**
   * 共用車輛歸還 helper
   */
  private returnVehicleToHome(
    citizen: CitizenProfile,
    homeBuilding: PlacedBuilding,
    reParkAtHome: boolean = false
  ): void {
    const usedVehicleId = citizen.vehicleRegistration.vehicleId ?? citizen.currentVehicleId;
    if (usedVehicleId) {
      const veh = homeBuilding.vehicles.find((v) => v.id === usedVehicleId);
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
            const mesh = veh.mesh ?? VehicleModelFactory.createVehicle(veh.color);
            const parked = this.parkingManager.parkExistingCarMesh(
              mesh,
              homeSpot,
              veh.color,
              homeBuilding.id,
              veh.id
            );
            veh.parkedCarId = parked.id;
            veh.parkedSpot = homeSpot;
            veh.mesh = mesh;
          }
        }

        veh.status = 'available';
        veh.currentDriverCitizenId = undefined;
        veh.currentDriverName = undefined;
      }
    }
    CitizenStateMachine.clearVehicleUsage(citizen);
  }

  /**
   * 住宅內市民出行方式決策 (核心邏輯)
   */
  public decideCitizenTravel(
    citizenId: string,
    buildings: Map<string, PlacedBuilding>,
    options?: TravelDecisionOptions
  ): TravelDecisionResult {
    const foundCitizen = this.citizens.get(citizenId);
    const homeBuilding = foundCitizen ? buildings.get(foundCitizen.homeBuildingId) : undefined;

    if (!foundCitizen || !homeBuilding) {
      return {
        success: false,
        citizenId,
        citizenName: '未知市民',
        citizenAge: 0,
        buildingId: '',
        buildingName: '',
        selectedMode: 'walk',
        canDrive: false,
        availableVehiclesCount: 0,
        totalVehiclesCount: 0,
        reason: '找不到該市民或其所屬住宅',
        timestamp: Date.now(),
      };
    }

    if (!foundCitizen.atHome || foundCitizen.currentActivity !== 'AtHome') {
      return {
        success: false,
        citizenId: foundCitizen.id,
        citizenName: foundCitizen.name,
        citizenAge: foundCitizen.age,
        buildingId: homeBuilding.id,
        buildingName: homeBuilding.metadata.name,
        selectedMode: foundCitizen.currentTravelMode || 'walk',
        canDrive: false,
        availableVehiclesCount: homeBuilding.vehicles.filter((v) => v.status === 'available').length,
        totalVehiclesCount: homeBuilding.vehicles.length,
        reason: `市民目前已在出行狀態中 (${foundCitizen.currentActivity})，需返家後方能再次出發`,
        timestamp: Date.now(),
      };
    }

    const isAdult = foundCitizen.age >= 18;
    const availableVehicles = homeBuilding.vehicles.filter((v) => v.status === 'available');
    const totalVehicles = homeBuilding.vehicles.length;
    const canDrive = isAdult && availableVehicles.length > 0;

    let selectedMode: TravelMode = 'walk';
    let selectedVehicle: ResidenceVehicle | undefined = undefined;
    let reason = '';

    if (options?.forceMode) {
      if (options.forceMode === 'drive') {
        if (canDrive) {
          selectedMode = 'drive';
          selectedVehicle = availableVehicles[0];
          reason = `指定開車出行：成功選用住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 出發。`;
        } else if (!isAdult) {
          selectedMode = 'walk';
          reason = `指定開車失敗：市民未滿 18 歲 (${foundCitizen.age}歲)，無法駕車，改為步行出發。`;
        } else {
          selectedMode = 'walk';
          reason = `指定開車失敗：住宅名下 ${totalVehicles} 輛車目前皆在出行使用中，改為步行出發。`;
        }
      } else {
        selectedMode = options.forceMode;
        reason = `指定以 ${selectedMode === 'walk' ? '步行' : '大眾運輸'} 出行，住宅名下車輛保留在住宅旁。`;
      }
    } else {
      if (canDrive) {
        if (foundCitizen.transitPreference === 'DriveOnly') {
          selectedMode = 'drive';
          selectedVehicle = availableVehicles[0];
          reason = `市民偏好開車，選擇使用住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 出行。`;
        } else if (foundCitizen.transitPreference === 'WalkIfClose') {
          const isClose = options?.distanceMeters !== undefined ? options.distanceMeters <= 20 : Math.random() < 0.5;
          if (isClose) {
            selectedMode = 'walk';
            reason = `市民偏好短途步行，雖住宅有名下車輛可用，評估後仍選擇步行出發。`;
          } else {
            selectedMode = 'drive';
            selectedVehicle = availableVehicles[0];
            reason = `出行距離較遠，市民決定開住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 出發。`;
          }
        } else {
          const chooseTransit = Math.random() < 0.6;
          if (chooseTransit) {
            selectedMode = 'transit';
            reason = `市民偏好大眾運輸，保留住宅名下車輛，選擇搭乘公車/捷運出行。`;
          } else {
            selectedMode = 'drive';
            selectedVehicle = availableVehicles[0];
            reason = `市民考慮班次後，改選住宅名下 [${selectedVehicle.sourceLabel} · ${selectedVehicle.colorName}] 開車出行。`;
          }
        }
      } else {
        if (!isAdult) {
          selectedMode = 'walk';
          reason = `市民年齡為 ${foundCitizen.age} 歲（未滿 18 歲），不可單獨駕車，選擇步行/大眾運輸出行。`;
        } else if (totalVehicles === 0) {
          selectedMode = 'walk';
          reason = `住宅名下尚無登記車輛，選擇步行出行。`;
        } else {
          selectedMode = 'walk';
          reason = `住宅名下 ${totalVehicles} 輛車已全數由其他合居成員出行使用中，選擇步行出行。`;
        }
      }
    }

    if (selectedMode === 'drive' && selectedVehicle) {
      this.checkoutVehicle(foundCitizen, homeBuilding, selectedVehicle);
    } else {
      const nonDriveMode = selectedMode === 'transit' ? 'transit' : 'walk';
      CitizenStateMachine.registerNonVehicleTravel(foundCitizen, nonDriveMode);
    }

    CitizenStateMachine.transitionTo(foundCitizen, 'Traveling');
    homeBuilding.currentOccupants = Math.max(0, homeBuilding.currentOccupants - 1);
    this.hooks.onBuildingStateChanged?.(homeBuilding);

    return {
      success: true,
      citizenId: foundCitizen.id,
      citizenName: foundCitizen.name,
      citizenAge: foundCitizen.age,
      buildingId: homeBuilding.id,
      buildingName: homeBuilding.metadata.name,
      selectedMode,
      selectedVehicle,
      canDrive,
      availableVehiclesCount: homeBuilding.vehicles.filter((v) => v.status === 'available').length,
      totalVehiclesCount: totalVehicles,
      reason,
      timestamp: Date.now(),
    };
  }

  /**
   * 市民出行返家 (歸還車輛，嚴格清除場上模型後方重設 AT_home)
   */
  public returnCitizenToResidence(
    citizenId: string,
    buildings: Map<string, PlacedBuilding>
  ): { success: boolean; reason: string } {
    const foundCitizen = this.citizens.get(citizenId);
    const homeBuilding = foundCitizen ? buildings.get(foundCitizen.homeBuildingId) : undefined;

    if (!foundCitizen || !homeBuilding) {
      return { success: false, reason: '找不到該市民或其所屬住宅' };
    }

    if (foundCitizen.atHome && foundCitizen.currentActivity === 'AtHome') {
      return { success: false, reason: `${foundCitizen.name} 已經在家中` };
    }

    this.pedestrianManager.removePedestriansByCitizenId(citizenId);
    this.returnVehicleToHome(foundCitizen, homeBuilding, false);

    CitizenStateMachine.transitionTo(foundCitizen, 'AtHome');
    homeBuilding.currentOccupants += 1;
    if (homeBuilding.residentialProfile && homeBuilding.residentialProfile.state !== 'Active') {
      ResidentialStateMachine.transitionTo(homeBuilding.residentialProfile, 'Active');
    }
    this.hooks.onBuildingStateChanged?.(homeBuilding);

    return {
      success: true,
      reason: `${foundCitizen.name} 已順利返家，所用交通方式已結算，住宅名下車輛已歸還恢復可用。`,
    };
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

    if (jobsAssigned > 0) {
      this.hooks.onCommuteStateChanged?.();
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
   * 市民端找工作核心實作：
   * 1. 篩選已完工、營運狀態為 Idle/Operating 且尚有空位的工廠
   * 2. 依住家至工廠的直線距離由近到遠排序
   * 3. 逐一檢查住家與工廠之間是否至少存在一條步行可達路徑，找到第一家即錄取
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
        if (f.status !== 'completed') return false;
        const indState = f.industrialProfile?.state ?? 'Idle';
        if (indState !== 'Idle' && indState !== 'Operating') return false;
        const employedCount = f.employedWorkerIds ? f.employedWorkerIds.length : 0;
        return employedCount < f.metadata.capacity;
      })
      .sort(
        (a, b) =>
          homeBuilding.worldCenter.distanceToSquared(a.worldCenter) -
          homeBuilding.worldCenter.distanceToSquared(b.worldCenter)
      );

    for (const factory of candidates) {
      const walkPath = this.pedestrianNetwork.findPathBetweenBuildings(homeBuilding, factory);
      if (walkPath) {
        if (!factory.employedWorkerIds) factory.employedWorkerIds = [];
        if (!factory.employedWorkerIds.includes(citizen.id)) {
          factory.employedWorkerIds.push(citizen.id);
        }
        citizen.workBuildingId = factory.id;

        if (factory.industrialProfile) {
          IndustrialStateMachine.syncWorkerCounts(
            factory.industrialProfile,
            factory.employedWorkerIds.length,
            factory.currentOccupants
          );
          IndustrialStateMachine.dispatchEvent(factory.industrialProfile, {
            type: 'WORKER_HIRED',
            citizenId: citizen.id,
          });
        }
        return true;
      }
    }

    return false;
  }

  /**
   * 召回所有外出上班與通勤中的市民平安返家
   */
  public recallAllCitizensToResidence(buildings: Map<string, PlacedBuilding>): number {
    let count = 0;

    this.pedestrianManager.clearAllPedestrians();

    for (const bld of buildings.values()) {
      if (bld.metadata.category === 'Residential_Low') {
        for (const c of bld.residents) {
          CitizenStateMachine.markModelDespawned(c);
          if (!c.atHome || c.currentActivity !== 'AtHome') {
            count++;
            if (c.currentActivity === 'AtWork' && c.workBuildingId) {
              const fac = buildings.get(c.workBuildingId);
              if (fac && fac.currentOccupants > 0) {
                fac.currentOccupants = Math.max(0, fac.currentOccupants - 1);
                if (fac.industrialProfile) {
                  IndustrialStateMachine.syncWorkerCounts(
                    fac.industrialProfile,
                    fac.employedWorkerIds?.length ?? 0,
                    fac.currentOccupants
                  );
                }
              }
            }

            this.returnVehicleToHome(c, bld, true);
            CitizenStateMachine.transitionTo(c, 'AtHome');
            bld.currentOccupants += 1;
          }
        }
        if (bld.currentOccupants > 0 && bld.residentialProfile && bld.residentialProfile.state !== 'Active') {
          ResidentialStateMachine.transitionTo(bld.residentialProfile, 'Active');
        }
        this.hooks.onBuildingStateChanged?.(bld);
      }
    }

    this.hooks.onCommuteStateChanged?.();
    return count;
  }
}
