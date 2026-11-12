import {
  CitizenActivityState,
  CitizenProfile,
  CitizenTaskItem,
  CitizenTaskType,
  TravelMode,
} from '../types/citizen';
import { EntityId } from '../types/common';

/**
 * 狀態機執行時傳入之外部世界服務上下文
 */
export interface CitizenStateContext {
  currentVirtualMin?: number;
  /** 由市民端出發尋找最近、營運中、未滿且可步行到達的工廠並完成入職；成功回傳 true，找不到回傳 false */
  tryAssignNearestJob?: (citizen: CitizenProfile) => boolean;
}

/**
 * 市民狀態機事件結構
 */
export type CitizenStateEvent =
  | { type: 'ARRIVED_HOME' }
  | { type: 'DEPARTED_HOME' }
  | { type: 'ARRIVED_WORK' }
  | { type: 'EXECUTE_TASK'; task: CitizenTaskItem; currentVirtualMin: number }
  | { type: 'CUSTOM'; name: string; payload?: unknown };

/**
 * 單一任務類型之雙段條件與執行規則（入隊條件 ≠ 執行條件）
 */
export interface CitizenTaskRule {
  /** 預設優先度 (1 ~ 100，由低到高) */
  defaultPriority: number;
  /** 預設有效期限（遊戲虛擬分鐘；null 代表無期限） */
  defaultValidDurationMin: number | null;
  /** 入隊條件（除通用防重複檢查之外的專屬條件） */
  canEnqueue: (
    citizen: CitizenProfile,
    currentVirtualMin: number,
    context?: CitizenStateContext
  ) => boolean;
  /** 執行條件（除通用最後接受時間過期判斷之外的專屬條件；失敗則自列隊移除） */
  canExecute: (
    citizen: CitizenProfile,
    task: CitizenTaskItem,
    currentVirtualMin: number,
    context?: CitizenStateContext
  ) => boolean;
  /** 執行動作：成功回傳 true（自列隊移除）；失敗回傳 false（保留於列隊等待下一輪優先度篩選） */
  execute: (
    citizen: CitizenProfile,
    task: CitizenTaskItem,
    context?: CitizenStateContext
  ) => boolean;
}

/**
 * 全城共用之任務規則定義表
 */
export const CITIZEN_TASK_RULES: Record<CitizenTaskType, CitizenTaskRule> = {
  FIND_JOB: {
    defaultPriority: 50,
    defaultValidDurationMin: 190,
    canEnqueue(citizen) {
      return citizen.age >= 18 && !citizen.workBuildingId;
    },
    canExecute(citizen) {
      // 執行條件：再次確認無工作（不要求必須在家），且符合成年工作資格
      return citizen.age >= 18 && !citizen.workBuildingId;
    },
    execute(citizen, _task, context) {
      return context?.tryAssignNearestJob?.(citizen) ?? false;
    },
  },
};

/**
 * 單一市民狀態處理器介面（全城所有市民共用）
 * 注意：此介面內不保存任何個別市民狀態，所有操作皆透過傳入之 citizen 資料物件進行
 */
export interface CitizenStateHandler {
  onEnter?: (citizen: CitizenProfile, context?: CitizenStateContext) => void;
  onExit?: (citizen: CitizenProfile, context?: CitizenStateContext) => void;
  onEvent?: (citizen: CitizenProfile, event: CitizenStateEvent, context?: CitizenStateContext) => void;
  onTick?: (citizen: CitizenProfile, deltaTime: number, context?: CitizenStateContext) => void;
}

/**
 * 共用任務事件處理邏輯（所有允許執行列隊任務的狀態統一呼叫）：
 * 1. 檢查最後接受時間是否過期 + 執行條件（任一失敗即從列隊移除）
 * 2. 執行成功 -> 從列隊移除；執行失敗 -> 繼續留在列隊等待下一輪優先度篩選
 */
function handleSharedTaskEvent(
  citizen: CitizenProfile,
  event: CitizenStateEvent,
  context?: CitizenStateContext
): void {
  if (event.type !== 'EXECUTE_TASK') return;
  const { task, currentVirtualMin } = event;
  const rule = CITIZEN_TASK_RULES[task.type];
  if (!rule) {
    removeTaskById(citizen, task.id);
    return;
  }

  // 執行條件判斷：過期判斷 + 任務執行條件，任何一項失敗直接移出列隊
  if (
    CitizenStateMachine.isTaskExpired(task, currentVirtualMin) ||
    !rule.canExecute(citizen, task, currentVirtualMin, context)
  ) {
    removeTaskById(citizen, task.id);
    return;
  }

  // 執行事件任務：成功則移出列隊，失敗則保留於列隊等待下輪篩選
  const succeeded = rule.execute(citizen, task, context);
  if (succeeded) {
    removeTaskById(citizen, task.id);
  }
}

function removeTaskById(citizen: CitizenProfile, taskId: string): void {
  const idx = citizen.taskQueue.findIndex((t) => t.id === taskId);
  if (idx !== -1) {
    citizen.taskQueue.splice(idx, 1);
  }
}

/**
 * 全城共用一份之市民狀態機定義表
 */
export const CITIZEN_STATE_MACHINE: Record<CitizenActivityState, CitizenStateHandler> = {
  MovingIn: {
    onEnter(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  AtHome: {
    onEnter(citizen) {
      // 嚴格守則：必須確認市民沒有殘留可見 3D 模型（已到家且模型消失）才允許設為 true
      if (citizen.hasVisibleModel) {
        citizen.atHome = false;
        console.warn(
          `[CitizenStateMachine] 拒絕將 ${citizen.name} (${citizen.id}) 的 AT_home 設為 true：3D 模型尚未消失。`
        );
        return;
      }
      citizen.atHome = true;
      citizen.currentLocationBuildingId = citizen.homeBuildingId;
    },
    onExit(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  Sleeping: {
    onEnter(citizen) {
      if (citizen.hasVisibleModel) {
        citizen.atHome = false;
        return;
      }
      citizen.atHome = true;
      citizen.currentLocationBuildingId = citizen.homeBuildingId;
    },
    onExit(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  Traveling: {
    onEnter(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  CommutingToWork: {
    onEnter(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  AtWork: {
    onEnter(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = citizen.workBuildingId;
    },
    onExit(citizen) {
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  CommutingToLeisure: {
    onEnter(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  Leisure: {
    onEnter(citizen) {
      citizen.atHome = false;
    },
    onExit(citizen) {
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },

  CommutingToHome: {
    onEnter(citizen) {
      citizen.atHome = false;
      citizen.currentLocationBuildingId = undefined;
    },
    onEvent: handleSharedTaskEvent,
  },
};

/**
 * 全城共用市民狀態機調度器
 */
export class CitizenStateMachine {
  private static nextTaskSeq: number = 1;

  /**
   * 切換市民狀態：統一執行舊狀態 onExit -> 更新狀態標籤 -> 執行新狀態 onEnter
   * 若目標為 AtHome 但 3D 模型尚未移除，onEnter 將嚴格拒絕將 atHome 設為 true
   */
  public static transitionTo(
    citizen: CitizenProfile,
    nextState: CitizenActivityState,
    context?: CitizenStateContext
  ): boolean {
    if (nextState === 'AtHome' && citizen.hasVisibleModel) {
      citizen.atHome = false;
      console.warn(
        `[CitizenStateMachine] 無法轉移 ${citizen.name} (${citizen.id}) 至 AtHome：請先移除市民 3D 模型。`
      );
      return false;
    }

    const prevState = citizen.currentActivity;
    if (prevState !== nextState) {
      CITIZEN_STATE_MACHINE[prevState]?.onExit?.(citizen, context);
      citizen.currentActivity = nextState;
    }
    CITIZEN_STATE_MACHINE[nextState]?.onEnter?.(citizen, context);
    return true;
  }

  /**
   * 分派事件至該市民當前狀態對應之處理器
   */
  public static dispatchEvent(
    citizen: CitizenProfile,
    event: CitizenStateEvent,
    context?: CitizenStateContext
  ): void {
    const handler = CITIZEN_STATE_MACHINE[citizen.currentActivity];
    handler?.onEvent?.(citizen, event, context);
  }

  /**
   * 固定週期 Tick 入口
   */
  public static tick(
    citizen: CitizenProfile,
    deltaTime: number,
    context?: CitizenStateContext
  ): void {
    const handler = CITIZEN_STATE_MACHINE[citizen.currentActivity];
    handler?.onTick?.(citizen, deltaTime, context);
  }

  /**
   * 檢查任務是否已超過最後接受時間
   */
  public static isTaskExpired(task: CitizenTaskItem, currentVirtualMin: number): boolean {
    return task.latestAcceptVirtualMin !== null && currentVirtualMin > task.latestAcceptVirtualMin;
  }

  /**
   * 嘗試將任務加入市民任務列隊：
   * 1. 通用防重複：任務列隊中若已有同類型任務，一律拒絕重複加入
   * 2. 任務專屬入隊條件檢查 (canEnqueue)
   * 3. 寫入優先度 (1~100) 與最後接受時間，並依優先度由高到低排序
   */
  public static enqueueTask(
    citizen: CitizenProfile,
    type: CitizenTaskType,
    currentVirtualMin: number,
    context?: CitizenStateContext,
    overrides?: { priority?: number; validDurationMin?: number | null; payload?: unknown }
  ): CitizenTaskItem | null {
    // 通用防重複檢查：避免任務清單重複分配相同任務
    if (citizen.taskQueue.some((t) => t.type === type)) {
      return null;
    }

    const rule = CITIZEN_TASK_RULES[type];
    if (!rule || !rule.canEnqueue(citizen, currentVirtualMin, context)) {
      return null;
    }

    const rawPriority = overrides?.priority ?? rule.defaultPriority;
    const priority = Math.max(1, Math.min(100, rawPriority));
    const validDuration =
      overrides?.validDurationMin !== undefined
        ? overrides.validDurationMin
        : rule.defaultValidDurationMin;

    const item: CitizenTaskItem = {
      id: `task_${type}_${this.nextTaskSeq++}`,
      type,
      priority,
      createdAtVirtualMin: currentVirtualMin,
      latestAcceptVirtualMin: validDuration !== null ? currentVirtualMin + validDuration : null,
      payload: overrides?.payload,
    };

    citizen.taskQueue.push(item);
    this.sortTaskQueue(citizen);
    return item;
  }

  /**
   * 依優先度由高到低（100 -> 1）處理市民任務列隊，同優先度先入先出：
   * - 若過期或執行條件失敗 -> 從列隊移除
   * - 若執行成功 -> 從列隊移除
   * - 若執行失敗 -> 保留於列隊等待下一輪優先度篩選
   */
  public static processTaskQueue(
    citizen: CitizenProfile,
    currentVirtualMin: number,
    context?: CitizenStateContext
  ): void {
    if (citizen.taskQueue.length === 0) return;

    this.sortTaskQueue(citizen);
    // 取出本輪快照順序，確保每個任務本輪只評估一次（即使執行失敗留在列隊也不重複跑）
    const roundSnapshot = [...citizen.taskQueue];
    for (const task of roundSnapshot) {
      this.dispatchEvent(
        citizen,
        { type: 'EXECUTE_TASK', task, currentVirtualMin },
        context
      );
    }
  }

  private static sortTaskQueue(citizen: CitizenProfile): void {
    citizen.taskQueue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAtVirtualMin - b.createdAtVirtualMin;
    });
  }

  /**
   * 標記市民 3D 模型已生成於場景中（此時 AT_home 嚴格強制為 false）
   */
  public static markModelSpawned(citizen: CitizenProfile): void {
    citizen.hasVisibleModel = true;
    citizen.atHome = false;
  }

  /**
   * 標記市民 3D 模型已自場景移除消失
   */
  public static markModelDespawned(citizen: CitizenProfile): void {
    citizen.hasVisibleModel = false;
  }

  /**
   * 登記市民出行使用車輛（借出住宅名下車輛時寫入靜態資料）
   */
  public static registerVehicleUsage(
    citizen: CitizenProfile,
    vehicleId: EntityId,
    ownerBuildingId: EntityId,
    travelMode: TravelMode = 'drive',
    checkedOutAt: number = Date.now()
  ): void {
    citizen.vehicleRegistration = {
      isUsingVehicle: true,
      vehicleId,
      ownerBuildingId,
      travelMode,
      checkedOutAt,
    };
    citizen.currentVehicleId = vehicleId;
    citizen.currentTravelMode = travelMode;
  }

  /**
   * 登記無車輛之出行方式（步行 / 大眾運輸），保留車輛未借出狀態
   */
  public static registerNonVehicleTravel(
    citizen: CitizenProfile,
    travelMode: Exclude<TravelMode, 'drive'>
  ): void {
    citizen.vehicleRegistration = {
      isUsingVehicle: false,
      vehicleId: undefined,
      ownerBuildingId: undefined,
      travelMode,
      checkedOutAt: undefined,
    };
    citizen.currentVehicleId = undefined;
    citizen.currentTravelMode = travelMode;
  }

  /**
   * 清除市民出行車輛使用登記（返家還車或召回時呼叫）
   */
  public static clearVehicleUsage(citizen: CitizenProfile): void {
    citizen.vehicleRegistration = {
      isUsingVehicle: false,
      vehicleId: undefined,
      ownerBuildingId: undefined,
      travelMode: undefined,
      checkedOutAt: undefined,
    };
    citizen.currentVehicleId = undefined;
    citizen.currentTravelMode = undefined;
  }
}
