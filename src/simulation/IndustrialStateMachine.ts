import { BaseTaskRule, BuildingDensityLevel, EntityId, PipelineAdvanceResult } from '../types/common';
import {
  IndustrialLowProfile,
  IndustrialLowState,
  IndustrialPipelineSession,
  IndustrialStage,
  IndustrialTaskItem,
  IndustrialTaskType,
} from '../types/industrial';

/**
 * 工業區狀態機執行上下文（預留後續跨系統連動用）
 */
export interface IndustrialStateContext {
  timestamp?: number;
  currentVirtualMin?: number;
}

/**
 * 工業區狀態機事件結構骨架（預留後續與市民／物流系統連動）
 */
export type IndustrialStateEvent =
  | { type: 'CONSTRUCTION_COMPLETED' }
  | { type: 'WORKER_HIRED'; citizenId: EntityId }
  | { type: 'WORKER_FIRED'; citizenId: EntityId }
  | { type: 'WORKER_ENTERED'; citizenId: EntityId }
  | { type: 'WORKER_LEFT'; citizenId: EntityId }
  | { type: 'EXECUTE_TASK'; task: IndustrialTaskItem; currentVirtualMin: number }
  | { type: 'CUSTOM'; name: string; payload?: unknown };

/**
 * 工業區任務規則定義介面
 */
export interface IndustrialTaskRule
  extends BaseTaskRule<IndustrialLowProfile, IndustrialTaskItem, IndustrialStateContext> {}

/**
 * 全城共用之工業區任務規則定義表
 */
export const INDUSTRIAL_TASK_RULES: Record<IndustrialTaskType, IndustrialTaskRule> = {
  RESTOCK_MATERIALS: {
    defaultPriority: 60,
    defaultValidDurationMin: null,
    canEnqueue: (factory) => factory.state === 'Operating' || factory.state === 'Idle',
    canExecute: (factory) => factory.state === 'Operating' || factory.state === 'Idle',
    execute(factory, task, context) {
      const currentVirtualMin = context?.currentVirtualMin ?? task.createdAtVirtualMin;
      // 啟動進貨管線，初始微觀子階段為 ORDER_MATERIALS
      IndustrialStateMachine.startPipeline(
        factory,
        task.id,
        'RESTOCK_MATERIALS',
        'ORDER_MATERIALS',
        currentVirtualMin,
        { materialAmount: 100 }
      );
      return true;
    },
  },
  SHIP_PRODUCTS: {
    defaultPriority: 50,
    defaultValidDurationMin: null,
    canEnqueue: (factory) => factory.state === 'Operating',
    canExecute: (factory) => factory.state === 'Operating',
    execute(factory, task, context) {
      const currentVirtualMin = context?.currentVirtualMin ?? task.createdAtVirtualMin;
      // 啟動出貨管線，初始微觀子階段為 PREPARE_SHIPMENT
      IndustrialStateMachine.startPipeline(
        factory,
        task.id,
        'SHIP_PRODUCTS',
        'PREPARE_SHIPMENT',
        currentVirtualMin,
        { productAmount: 50 }
      );
      return true;
    },
  },
  MAINTENANCE: {
    defaultPriority: 30,
    defaultValidDurationMin: null,
    canEnqueue: () => true,
    canExecute: () => true,
    execute(factory, task, context) {
      const currentVirtualMin = context?.currentVirtualMin ?? task.createdAtVirtualMin;
      // 啟動設備維護管線，初始微觀子階段為 INSPECT_EQUIPMENT
      IndustrialStateMachine.startPipeline(
        factory,
        task.id,
        'MAINTENANCE',
        'INSPECT_EQUIPMENT',
        currentVirtualMin,
        { cost: 200 }
      );
      return true;
    },
  },
};

/**
 * 單一工業區狀態處理器介面（全城各密度工業區共用）
 * 注意：處理器內不存放任何單一工廠的實例狀態，僅操作傳入之 factory 資料清單（可透過 factory.density 判斷密度分級）
 */
export interface IndustrialStateHandler {
  onEnter?: (factory: IndustrialLowProfile, context?: IndustrialStateContext) => void;
  onExit?: (factory: IndustrialLowProfile, context?: IndustrialStateContext) => void;
  onEvent?: (factory: IndustrialLowProfile, event: IndustrialStateEvent, context?: IndustrialStateContext) => void;
  onTick?: (factory: IndustrialLowProfile, deltaTime: number, context?: IndustrialStateContext) => void;
}

/**
 * 共用工業任務事件處理邏輯：
 * 1. 檢查最早執行時間（未達時間則跳過並保留於列隊中，不移除）
 * 2. 檢查最後接受時間是否過期 + 執行條件（任一失敗即從列隊移除）
 * 3. 執行成功 -> 從列隊移除；執行失敗 -> 保留於列隊等待下一輪篩選
 */
function handleSharedIndustrialTaskEvent(
  factory: IndustrialLowProfile,
  event: IndustrialStateEvent,
  context?: IndustrialStateContext
): void {
  if (event.type !== 'EXECUTE_TASK') return;
  const { task, currentVirtualMin } = event;
  const rule = INDUSTRIAL_TASK_RULES[task.type];
  if (!rule) {
    removeTaskById(factory, task.id);
    return;
  }

  // 1. 若尚未達最早執行時間，跳過不執行且保留於列隊中（不移除）
  if (!IndustrialStateMachine.isTaskReady(task, currentVirtualMin)) {
    return;
  }

  // 2. 執行條件判斷：過期判斷 + 任務執行條件，任一失敗直接移出列隊
  if (
    IndustrialStateMachine.isTaskExpired(task, currentVirtualMin) ||
    !rule.canExecute(factory, task, currentVirtualMin, context)
  ) {
    removeTaskById(factory, task.id);
    return;
  }

  // 3. 執行任務：成功則移出列隊，失敗則保留於列隊等待下輪篩選
  const succeeded = rule.execute(factory, task, context);
  if (succeeded) {
    removeTaskById(factory, task.id);
  }
}

function removeTaskById(factory: IndustrialLowProfile, taskId: string): void {
  const idx = factory.taskQueue.findIndex((t) => t.id === taskId);
  if (idx !== -1) {
    factory.taskQueue.splice(idx, 1);
  }
}

/**
 * 全城共用一份之工業區狀態機定義表（支援 Low / Medium / High 不同密度透過 density 欄位區分）
 * 目前僅完成基礎架構與插槽預留；具體生產、資金結算與事件轉換規則待後續討論確認後實作。
 */
export const INDUSTRIAL_LOW_STATE_MACHINE: Record<IndustrialLowState, IndustrialStateHandler> = {
  Constructing: { onEvent: handleSharedIndustrialTaskEvent },
  Idle: { onEvent: handleSharedIndustrialTaskEvent },
  Operating: { onEvent: handleSharedIndustrialTaskEvent },
  Paused: { onEvent: handleSharedIndustrialTaskEvent },
  Abandoned: { onEvent: handleSharedIndustrialTaskEvent },
};

export const INDUSTRIAL_STATE_MACHINE = INDUSTRIAL_LOW_STATE_MACHINE;

/**
 * 低密度工業區預設最早上班時間
 */
export const DEFAULT_LOW_INDUSTRIAL_EARLIEST_WORK_TIME = '06:00';

/**
 * 全城共用工業區狀態機調度器
 */
export class IndustrialStateMachine {
  private static nextTaskSeq: number = 1;

  /**
   * 檢查任務是否已就緒（已達最早執行時間，或未設定限制 null）
   */
  public static isTaskReady(task: IndustrialTaskItem, currentVirtualMin: number): boolean {
    return task.earliestStartVirtualMin === null || currentVirtualMin >= task.earliestStartVirtualMin;
  }

  /**
   * 檢查任務是否已超過最後接受時間
   */
  public static isTaskExpired(task: IndustrialTaskItem, currentVirtualMin: number): boolean {
    return task.latestAcceptVirtualMin !== null && currentVirtualMin > task.latestAcceptVirtualMin;
  }

  /**
   * 嘗試將任務加入工業區任務列隊：
   * 1. 通用防重複：任務列隊中若已有同類型任務，一律拒絕重複加入
   * 2. 任務專屬入隊條件檢查 (canEnqueue)
   * 3. 寫入優先度 (1~100)、最早執行時間與最後接受時間，並依優先度由高到低排序
   */
  public static enqueueTask(
    factory: IndustrialLowProfile,
    type: IndustrialTaskType,
    currentVirtualMin: number,
    context?: IndustrialStateContext,
    overrides?: {
      priority?: number;
      earliestStartVirtualMin?: number | null;
      validDurationMin?: number | null;
      payload?: unknown;
    }
  ): IndustrialTaskItem | null {
    if (factory.taskQueue.some((t) => t.type === type)) {
      return null;
    }

    const rule = INDUSTRIAL_TASK_RULES[type];
    if (!rule || !rule.canEnqueue(factory, currentVirtualMin, context)) {
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

    const item: IndustrialTaskItem = {
      id: `ind_task_${type}_${this.nextTaskSeq++}`,
      type,
      priority,
      createdAtVirtualMin: currentVirtualMin,
      earliestStartVirtualMin: earliestStart,
      latestAcceptVirtualMin: validDuration !== null ? currentVirtualMin + validDuration : null,
      payload: overrides?.payload,
    };

    factory.taskQueue.push(item);
    this.sortTaskQueue(factory);
    return item;
  }

  /**
   * 依優先度由高到低（100 -> 1）處理工業區任務列隊，同優先度先入先出：
   * - 僅篩選出已就緒（已達最早執行時間，或無限制）之任務進行分派；未達時間之任務保留於列隊中跳過
   * - 若過期或執行條件失敗 -> 從列隊移除
   * - 若執行成功 -> 從列隊移除
   * - 若執行失敗 -> 保留於列隊等待下一輪優先度篩選
   */
  public static processTaskQueue(
    factory: IndustrialLowProfile,
    currentVirtualMin: number,
    context?: IndustrialStateContext
  ): void {
    if (factory.taskQueue.length === 0) return;

    this.sortTaskQueue(factory);

    // 1. 先主動清除逾期任務
    for (let i = factory.taskQueue.length - 1; i >= 0; i--) {
      if (this.isTaskExpired(factory.taskQueue[i], currentVirtualMin)) {
        factory.taskQueue.splice(i, 1);
      }
    }

    // 2. 篩選出目前已就緒之任務（已達最早執行時間，或未設定限制）
    const readyTasks = factory.taskQueue.filter((task) =>
      this.isTaskReady(task, currentVirtualMin)
    );

    // 3. 依優先度依序評估派發
    for (const task of readyTasks) {
      if (!factory.taskQueue.some((t) => t.id === task.id)) continue;
      this.dispatchEvent(
        factory,
        { type: 'EXECUTE_TASK', task, currentVirtualMin },
        context
      );
    }
  }

  private static sortTaskQueue(factory: IndustrialLowProfile): void {
    factory.taskQueue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAtVirtualMin - b.createdAtVirtualMin;
    });
  }

  /**
   * 建置工業建築出現時之初始狀態清單資料
   */
  public static createDefaultProfile(
    buildingId: EntityId,
    modelId: string,
    name: string,
    maxWorkers: number,
    initialState: IndustrialLowState = 'Constructing',
    density: BuildingDensityLevel = 'Low',
    earliestWorkTime: string = DEFAULT_LOW_INDUSTRIAL_EARLIEST_WORK_TIME
  ): IndustrialLowProfile {
    return {
      buildingId,
      modelId,
      name,
      density,
      state: initialState,
      funds: 0,
      rawMaterialType: '未指定',
      rawMaterialAmount: 0,
      productType: '未指定',
      productAmount: 0,
      maxWorkers,
      employedWorkerIds: [],
      workerCount: 0,
      insideWorkerCount: 0,
      insideTruckCount: 1, // 預設 1 台貨車
      earliestWorkTime: density === 'Low' ? (earliestWorkTime || DEFAULT_LOW_INDUSTRIAL_EARLIEST_WORK_TIME) : (earliestWorkTime || DEFAULT_LOW_INDUSTRIAL_EARLIEST_WORK_TIME),
      taskQueue: [],
      activePipeline: undefined,
    };
  }


  /**
   * 切換工業建築狀態：統一執行舊狀態 onExit -> 更新 state -> 執行新狀態 onEnter
   */
  public static transitionTo(
    factory: IndustrialLowProfile,
    nextState: IndustrialLowState,
    context?: IndustrialStateContext
  ): void {
    const prevState = factory.state;
    if (prevState !== nextState) {
      INDUSTRIAL_LOW_STATE_MACHINE[prevState]?.onExit?.(factory, context);
      factory.state = nextState;
    }
    INDUSTRIAL_LOW_STATE_MACHINE[nextState]?.onEnter?.(factory, context);
  }

  /**
   * 分派事件至該工廠當前狀態對應之處理器
   */
  public static dispatchEvent(
    factory: IndustrialLowProfile,
    event: IndustrialStateEvent,
    context?: IndustrialStateContext
  ): void {
    const handler = INDUSTRIAL_LOW_STATE_MACHINE[factory.state];
    handler?.onEvent?.(factory, event, context);
  }

  /**
   * 固定週期 Tick 入口（預留給後續資產、產出與營運結算使用）
   */
  public static tick(
    factory: IndustrialLowProfile,
    deltaTime: number,
    context?: IndustrialStateContext
  ): void {
    const handler = INDUSTRIAL_LOW_STATE_MACHINE[factory.state];
    handler?.onTick?.(factory, deltaTime, context);
  }

  /**
   * 判斷工廠目前是否處於可招募狀態且尚有職缺
   */
  public static hasVacancy(factory: IndustrialLowProfile): boolean {
    return (
      (factory.state === 'Idle' || factory.state === 'Operating') &&
      factory.employedWorkerIds.length < factory.maxWorkers
    );
  }

  /**
   * 將市民正式登錄為工廠員工（直接更新單一事實來源 employedWorkerIds 與 workerCount，無需外部 sync）
   */
  public static hireWorker(
    factory: IndustrialLowProfile,
    citizenId: EntityId,
    context?: IndustrialStateContext
  ): boolean {
    if (factory.employedWorkerIds.includes(citizenId)) {
      factory.workerCount = factory.employedWorkerIds.length;
      return true;
    }
    if (!this.hasVacancy(factory)) {
      return false;
    }
    factory.employedWorkerIds.push(citizenId);
    factory.workerCount = factory.employedWorkerIds.length;
    this.dispatchEvent(factory, { type: 'WORKER_HIRED', citizenId }, context);
    return true;
  }

  /**
   * 自工廠移除指定員工（例如離職、裁員或建築拆除前清理）
   */
  public static fireWorker(
    factory: IndustrialLowProfile,
    citizenId: EntityId,
    context?: IndustrialStateContext
  ): boolean {
    const idx = factory.employedWorkerIds.indexOf(citizenId);
    if (idx < 0) return false;
    factory.employedWorkerIds.splice(idx, 1);
    factory.workerCount = factory.employedWorkerIds.length;
    factory.insideWorkerCount = Math.min(factory.insideWorkerCount, factory.workerCount);
    this.dispatchEvent(factory, { type: 'WORKER_FIRED', citizenId }, context);
    return true;
  }

  /**
   * 記錄員工實際進入工廠內部工作
   */
  public static recordWorkerEntered(
    factory: IndustrialLowProfile,
    citizenId: EntityId,
    context?: IndustrialStateContext
  ): void {
    const cap = factory.workerCount > 0 ? factory.workerCount : factory.maxWorkers;
    factory.insideWorkerCount = Math.min(cap, factory.insideWorkerCount + 1);
    this.dispatchEvent(factory, { type: 'WORKER_ENTERED', citizenId }, context);
  }

  /**
   * 記錄員工離開工廠內部（例如下班或被召回）
   */
  public static recordWorkerLeft(
    factory: IndustrialLowProfile,
    citizenId: EntityId,
    context?: IndustrialStateContext
  ): void {
    factory.insideWorkerCount = Math.max(0, factory.insideWorkerCount - 1);
    this.dispatchEvent(factory, { type: 'WORKER_LEFT', citizenId }, context);
  }

  // =========================================================================
  // 複合任務微觀管線會話管理 (Pipeline Session Management)
  // =========================================================================

  /**
   * 啟動工業區複合任務微觀管線會話：
   * 建立 activePipeline 並將微觀子階段設為 initialStage，同時更新 payload
   */
  public static startPipeline(
    factory: IndustrialLowProfile,
    taskId: string,
    taskType: IndustrialTaskType,
    initialStage: IndustrialStage,
    currentVirtualMin: number,
    payload?: Record<string, any>
  ): IndustrialPipelineSession {
    const session: IndustrialPipelineSession = {
      taskId,
      taskType,
      currentStage: initialStage,
      startedAtVirtualMin: currentVirtualMin,
      stageStartedAtVirtualMin: currentVirtualMin,
      payload: { ...payload },
    };
    factory.activePipeline = session;
    return session;
  }

  /**
   * 推進工業區複合任務微觀管線至下一子階段（同幀 0 延遲或回調時調用）
   */
  public static advancePipelineStage(
    factory: IndustrialLowProfile,
    nextStage: IndustrialStage,
    currentVirtualMin: number,
    payloadUpdate?: Record<string, any>
  ): PipelineAdvanceResult<IndustrialStage> {
    const session = factory.activePipeline;
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
    factory: IndustrialLowProfile,
    _context?: IndustrialStateContext
  ): boolean {
    const session = factory.activePipeline;
    if (!session) return false;
    removeTaskById(factory, session.taskId);
    factory.activePipeline = undefined;
    return true;
  }

  /**
   * 中止／取消複合任務微觀管線
   */
  public static cancelPipeline(
    factory: IndustrialLowProfile,
    _reason?: string,
    _context?: IndustrialStateContext
  ): void {
    if (!factory.activePipeline) return;
    removeTaskById(factory, factory.activePipeline.taskId);
    factory.activePipeline = undefined;
  }

  /**
   * 取得工廠當前微觀管線會話
   */
  public static getActivePipeline(factory: IndustrialLowProfile): IndustrialPipelineSession | undefined {
    return factory.activePipeline;
  }
}
