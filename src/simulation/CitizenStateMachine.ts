import {
  CitizenActivityState,
  CitizenPipelineSession,
  CitizenProfile,
  CitizenTaskItem,
  CitizenTaskType,
  CitizenTravelStage,
  TravelMode,
} from '../types/citizen';
import { BaseTaskRule, EntityId, PipelineAdvanceResult } from '../types/common';

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
 * 單一任務類型之雙段條件與執行規則（入隊條件 ≠ 執行條件，繼承 BaseTaskRule）
 */
export interface CitizenTaskRule
  extends BaseTaskRule<CitizenProfile, CitizenTaskItem, CitizenStateContext> {}


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
  COMMUTE_TO_WORK: {
    defaultPriority: 80,
    defaultValidDurationMin: 120,
    canEnqueue(citizen) {
      return Boolean(citizen.workBuildingId) && citizen.currentActivity === 'AtHome' && citizen.atHome;
    },
    canExecute(citizen) {
      return (
        Boolean(citizen.workBuildingId) &&
        (citizen.currentActivity === 'AtHome' || citizen.currentActivity === 'CommutingToWork')
      );
    },
    execute(citizen, task, context) {
      if (!citizen.workBuildingId) return false;
      const currentVirtualMin = context?.currentVirtualMin ?? task.createdAtVirtualMin;
      // 啟動微觀出行管線，初始微觀子階段為 EVALUATE_MODE
      CitizenStateMachine.startPipeline(
        citizen,
        task.id,
        'COMMUTE_TO_WORK',
        'EVALUATE_MODE',
        currentVirtualMin,
        { targetBuildingId: citizen.workBuildingId }
      );
      CitizenStateMachine.transitionTo(citizen, 'CommutingToWork', context);
      return true;
    },
  },
  COMMUTE_TO_HOME: {
    defaultPriority: 70,
    defaultValidDurationMin: 120,
    canEnqueue(citizen) {
      return citizen.currentActivity === 'AtWork';
    },
    canExecute(citizen) {
      return citizen.currentActivity === 'AtWork' || citizen.currentActivity === 'CommutingToHome';
    },
    execute(citizen, task, context) {
      const currentVirtualMin = context?.currentVirtualMin ?? task.createdAtVirtualMin;
      // 啟動微觀出行管線，初始微觀子階段為 EVALUATE_MODE
      CitizenStateMachine.startPipeline(
        citizen,
        task.id,
        'COMMUTE_TO_HOME',
        'EVALUATE_MODE',
        currentVirtualMin,
        { targetBuildingId: citizen.homeBuildingId }
      );
      CitizenStateMachine.transitionTo(citizen, 'CommutingToHome', context);
      return true;
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

  // 1. 若尚未達最早執行時間，跳過不執行且保留於列隊中（不移除）
  if (!CitizenStateMachine.isTaskReady(task, currentVirtualMin)) {
    return;
  }

  // 2. 執行條件判斷：過期判斷 + 任務執行條件，任何一項失敗直接移出列隊
  if (
    CitizenStateMachine.isTaskExpired(task, currentVirtualMin) ||
    !rule.canExecute(citizen, task, currentVirtualMin, context)
  ) {
    removeTaskById(citizen, task.id);
    return;
  }

  // 3. 執行事件任務：成功則移出列隊，失敗則保留於列隊等待下輪篩選
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
   * 檢查任務是否已就緒（已到達最早執行時間，或未設定 null）
   */
  public static isTaskReady(task: CitizenTaskItem, currentVirtualMin: number): boolean {
    return task.earliestStartVirtualMin === null || currentVirtualMin >= task.earliestStartVirtualMin;
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
   * 3. 寫入優先度 (1~100)、最早執行時間與最後接受時間，並依優先度由高到低排序
   */
  public static enqueueTask(
    citizen: CitizenProfile,
    type: CitizenTaskType,
    currentVirtualMin: number,
    context?: CitizenStateContext,
    overrides?: {
      priority?: number;
      earliestStartVirtualMin?: number | null;
      validDurationMin?: number | null;
      payload?: unknown;
    }
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

    const earliestStart =
      overrides?.earliestStartVirtualMin !== undefined
        ? overrides.earliestStartVirtualMin
        : rule.defaultDelayMin !== undefined && rule.defaultDelayMin !== null
        ? currentVirtualMin + rule.defaultDelayMin
        : null;

    const item: CitizenTaskItem = {
      id: `task_${type}_${this.nextTaskSeq++}`,
      type,
      priority,
      createdAtVirtualMin: currentVirtualMin,
      earliestStartVirtualMin: earliestStart,
      latestAcceptVirtualMin: validDuration !== null ? currentVirtualMin + validDuration : null,
      payload: overrides?.payload,
    };

    citizen.taskQueue.push(item);
    this.sortTaskQueue(citizen);
    return item;
  }

  /**
   * 依優先度由高到低（100 -> 1）處理市民任務列隊，同優先度先入先出：
   * - 僅篩選出已就緒（已達最早執行時間，或無限制）之任務進行分派；未達時間之任務保留於列隊中跳過
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

    // 1. 先主動清除逾期任務
    for (let i = citizen.taskQueue.length - 1; i >= 0; i--) {
      if (this.isTaskExpired(citizen.taskQueue[i], currentVirtualMin)) {
        citizen.taskQueue.splice(i, 1);
      }
    }

    // 2. 篩選出目前已就緒之任務（已達最早執行時間，或未設定限制）
    const readyTasks = citizen.taskQueue.filter((task) =>
      this.isTaskReady(task, currentVirtualMin)
    );

    // 3. 依優先度依序評估派發
    for (const task of readyTasks) {
      if (!citizen.taskQueue.some((t) => t.id === task.id)) continue;
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

  // =========================================================================
  // 複合任務微觀管線會話管理 (Pipeline Session Management)
  // =========================================================================

  /**
   * 啟動複合任務微觀管線會話：
   * 建立 activePipeline 並將微觀子階段設為 initialStage，同時更新 payload
   */
  public static startPipeline(
    citizen: CitizenProfile,
    taskId: string,
    taskType: CitizenTaskType,
    initialStage: CitizenTravelStage,
    currentVirtualMin: number,
    payload?: Record<string, any>
  ): CitizenPipelineSession {
    const session: CitizenPipelineSession = {
      taskId,
      taskType,
      currentStage: initialStage,
      startedAtVirtualMin: currentVirtualMin,
      stageStartedAtVirtualMin: currentVirtualMin,
      payload: {
        targetBuildingId: payload?.targetBuildingId ?? citizen.workBuildingId ?? citizen.homeBuildingId,
        ...payload,
      },
    };
    citizen.activePipeline = session;
    return session;
  }

  /**
   * 推進市民複合任務微觀管線至下一子階段（同幀 0 延遲或回調時調用）
   */
  public static advancePipelineStage(
    citizen: CitizenProfile,
    nextStage: CitizenTravelStage,
    currentVirtualMin: number,
    payloadUpdate?: Record<string, any>
  ): PipelineAdvanceResult<CitizenTravelStage> {
    const session = citizen.activePipeline;
    if (!session) {
      return { success: false, previousStage: nextStage, currentStage: nextStage, isCompleted: false };
    }
    const previousStage = session.currentStage;
    session.currentStage = nextStage;
    session.stageStartedAtVirtualMin = currentVirtualMin;
    if (payloadUpdate) {
      session.payload = { ...session.payload, ...payloadUpdate };
    }
    return { success: true, previousStage, currentStage: nextStage, isCompleted: false };
  }

  /**
   * 完成複合任務微觀管線：
   * 清除 activePipeline，並自任務列隊移除該宏觀任務
   */
  public static completePipeline(
    citizen: CitizenProfile,
    _context?: CitizenStateContext
  ): boolean {
    const session = citizen.activePipeline;
    if (!session) return false;
    removeTaskById(citizen, session.taskId);
    citizen.activePipeline = undefined;
    return true;
  }

  /**
   * 中止／取消複合任務微觀管線（若發生異常、道路中斷或降級重置）
   */
  public static cancelPipeline(
    citizen: CitizenProfile,
    _reason?: string,
    _context?: CitizenStateContext
  ): void {
    if (!citizen.activePipeline) return;
    removeTaskById(citizen, citizen.activePipeline.taskId);
    citizen.activePipeline = undefined;
  }

  /**
   * 取得市民當前微觀管線會話
   */
  public static getActivePipeline(citizen: CitizenProfile): CitizenPipelineSession | undefined {
    return citizen.activePipeline;
  }
}
