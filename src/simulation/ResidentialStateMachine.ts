import { BaseTaskRule, BuildingDensityLevel, EntityId, PipelineAdvanceResult } from '../types/common';
import type { ResidenceVehicle } from '../types/building';
import {
  ResidentialPipelineSession,
  ResidentialProfile,
  ResidentialStage,
  ResidentialState,
  ResidentialTaskItem,
  ResidentialTaskType,
} from '../types/residential';

/**
 * 住宅區狀態機執行上下文（預留後續與市民／市政稅收系統連動）
 */
export interface ResidentialStateContext {
  timestamp?: number;
  currentVirtualMin?: number;
}

/**
 * 住宅區狀態機事件結構骨架（預留後續跨系統通知使用）
 */
export type ResidentialStateEvent =
  | { type: 'CONSTRUCTION_COMPLETED' }
  | { type: 'ROAD_MISSING' }
  | { type: 'MOVE_IN_STARTED' }
  | { type: 'RESIDENT_ENTERED'; citizenId: EntityId }
  | { type: 'RESIDENT_LEFT'; citizenId: EntityId }
  | { type: 'EXECUTE_TASK'; task: ResidentialTaskItem; currentVirtualMin: number }
  | { type: 'CUSTOM'; name: string; payload?: unknown };

/**
 * 住宅區任務規則定義介面
 */
export interface ResidentialTaskRule
  extends BaseTaskRule<ResidentialProfile, ResidentialTaskItem, ResidentialStateContext> {}

/**
 * 全城共用之住宅區任務規則定義表
 */
export const RESIDENTIAL_TASK_RULES: Record<ResidentialTaskType, ResidentialTaskRule> = {
  MAINTENANCE: {
    defaultPriority: 50,
    defaultValidDurationMin: null,
    canEnqueue: (residence) => residence.state === 'Active',
    canExecute: (residence) => residence.state === 'Active',
    execute(residence, task, context) {
      const currentVirtualMin = context?.currentVirtualMin ?? task.createdAtVirtualMin;
      // 啟動住宅複合任務管線，初始微觀子階段為 INSPECTING
      ResidentialStateMachine.startPipeline(
        residence,
        task.id,
        'MAINTENANCE',
        'INSPECTING',
        currentVirtualMin,
        { cost: 100 }
      );
      return true;
    },
  },
};

/**
 * 單一住宅區狀態處理器介面（全城各密度住宅共用）
 * 注意：處理器內不保存個別住宅狀態，統一操作傳入之 residence 資料清單（可透過 residence.density 判斷密度分級）
 */
export interface ResidentialStateHandler {
  onEnter?: (residence: ResidentialProfile, context?: ResidentialStateContext) => void;
  onExit?: (residence: ResidentialProfile, context?: ResidentialStateContext) => void;
  onEvent?: (residence: ResidentialProfile, event: ResidentialStateEvent, context?: ResidentialStateContext) => void;
  onTick?: (residence: ResidentialProfile, deltaTime: number, context?: ResidentialStateContext) => void;
}

/**
 * 共用住宅任務事件處理邏輯：
 * 1. 檢查最早執行時間（未達時間則跳過並保留於列隊中，不移除）
 * 2. 檢查最後接受時間是否過期 + 執行條件（任一失敗即從列隊移除）
 * 3. 執行成功 -> 從列隊移除；執行失敗 -> 保留於列隊等待下一輪篩選
 */
function handleSharedResidentialTaskEvent(
  residence: ResidentialProfile,
  event: ResidentialStateEvent,
  context?: ResidentialStateContext
): void {
  if (event.type !== 'EXECUTE_TASK') return;
  const { task, currentVirtualMin } = event;
  const rule = RESIDENTIAL_TASK_RULES[task.type];
  if (!rule) {
    removeTaskById(residence, task.id);
    return;
  }

  // 1. 若尚未達最早執行時間，跳過不執行且保留於列隊中（不移除）
  if (!ResidentialStateMachine.isTaskReady(task, currentVirtualMin)) {
    return;
  }

  // 2. 執行條件判斷：過期判斷 + 任務執行條件，任一失敗直接移出列隊
  if (
    ResidentialStateMachine.isTaskExpired(task, currentVirtualMin) ||
    !rule.canExecute(residence, task, currentVirtualMin, context)
  ) {
    removeTaskById(residence, task.id);
    return;
  }

  // 3. 執行任務：成功則移出列隊，失敗則保留於列隊等待下輪篩選
  const succeeded = rule.execute(residence, task, context);
  if (succeeded) {
    removeTaskById(residence, task.id);
  }
}

function removeTaskById(residence: ResidentialProfile, taskId: string): void {
  const idx = residence.taskQueue.findIndex((t) => t.id === taskId);
  if (idx !== -1) {
    residence.taskQueue.splice(idx, 1);
  }
}

/**
 * 全城共用一份之住宅區狀態機定義表
 * 目前僅完成基礎架構與插槽預留；具體升級、稅收與廢棄規則待後續討論確認後填入。
 */
export const RESIDENTIAL_STATE_MACHINE: Record<ResidentialState, ResidentialStateHandler> = {
  Constructing: { onEvent: handleSharedResidentialTaskEvent },
  WaitingForRoad: { onEvent: handleSharedResidentialTaskEvent },
  MovingIn: { onEvent: handleSharedResidentialTaskEvent },
  Active: { onEvent: handleSharedResidentialTaskEvent },
  Abandoned: { onEvent: handleSharedResidentialTaskEvent },
};

/**
 * 全城共用住宅區狀態機調度器
 */
export class ResidentialStateMachine {
  private static nextTaskSeq: number = 1;

  /**
   * 檢查任務是否已就緒（已達最早執行時間，或未設定限制 null）
   */
  public static isTaskReady(task: ResidentialTaskItem, currentVirtualMin: number): boolean {
    return task.earliestStartVirtualMin === null || currentVirtualMin >= task.earliestStartVirtualMin;
  }

  /**
   * 檢查任務是否已超過最後接受時間
   */
  public static isTaskExpired(task: ResidentialTaskItem, currentVirtualMin: number): boolean {
    return task.latestAcceptVirtualMin !== null && currentVirtualMin > task.latestAcceptVirtualMin;
  }

  /**
   * 嘗試將任務加入住宅任務列隊：
   * 1. 通用防重複：任務列隊中若已有同類型任務，一律拒絕重複加入
   * 2. 任務專屬入隊條件檢查 (canEnqueue)
   * 3. 寫入優先度 (1~100)、最早執行時間與最後接受時間，並依優先度由高到低排序
   */
  public static enqueueTask(
    residence: ResidentialProfile,
    type: ResidentialTaskType,
    currentVirtualMin: number,
    context?: ResidentialStateContext,
    overrides?: {
      priority?: number;
      earliestStartVirtualMin?: number | null;
      validDurationMin?: number | null;
      payload?: unknown;
    }
  ): ResidentialTaskItem | null {
    if (residence.taskQueue.some((t) => t.type === type)) {
      return null;
    }

    const rule = RESIDENTIAL_TASK_RULES[type];
    if (!rule || !rule.canEnqueue(residence, currentVirtualMin, context)) {
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

    const item: ResidentialTaskItem = {
      id: `res_task_${type}_${this.nextTaskSeq++}`,
      type,
      priority,
      createdAtVirtualMin: currentVirtualMin,
      earliestStartVirtualMin: earliestStart,
      latestAcceptVirtualMin: validDuration !== null ? currentVirtualMin + validDuration : null,
      payload: overrides?.payload,
    };

    residence.taskQueue.push(item);
    this.sortTaskQueue(residence);
    return item;
  }

  /**
   * 依優先度由高到低（100 -> 1）處理住宅任務列隊，同優先度先入先出：
   * - 僅篩選出已就緒（已達最早執行時間，或無限制）之任務進行分派；未達時間之任務保留於列隊中跳過
   * - 若過期或執行條件失敗 -> 從列隊移除
   * - 若執行成功 -> 從列隊移除
   * - 若執行失敗 -> 保留於列隊等待下一輪優先度篩選
   */
  public static processTaskQueue(
    residence: ResidentialProfile,
    currentVirtualMin: number,
    context?: ResidentialStateContext
  ): void {
    if (residence.taskQueue.length === 0) return;

    this.sortTaskQueue(residence);

    // 1. 先主動清除逾期任務
    for (let i = residence.taskQueue.length - 1; i >= 0; i--) {
      if (this.isTaskExpired(residence.taskQueue[i], currentVirtualMin)) {
        residence.taskQueue.splice(i, 1);
      }
    }

    // 2. 篩選出目前已就緒之任務（已達最早執行時間，或未設定限制）
    const readyTasks = residence.taskQueue.filter((task) =>
      this.isTaskReady(task, currentVirtualMin)
    );

    // 3. 依優先度依序評估派發
    for (const task of readyTasks) {
      if (!residence.taskQueue.some((t) => t.id === task.id)) continue;
      this.dispatchEvent(
        residence,
        { type: 'EXECUTE_TASK', task, currentVirtualMin },
        context
      );
    }
  }

  private static sortTaskQueue(residence: ResidentialProfile): void {
    residence.taskQueue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAtVirtualMin - b.createdAtVirtualMin;
    });
  }

  /**
   * 建置住宅建築出現時之初始狀態清單資料
   */
  public static createDefaultProfile(
    buildingId: EntityId,
    modelId: string,
    name: string,
    maxResidents: number,
    registeredResidents: number,
    isCoLiving: boolean,
    density: BuildingDensityLevel = 'Low',
    initialState: ResidentialState = 'Constructing'
  ): ResidentialProfile {
    return {
      buildingId,
      modelId,
      name,
      density,
      state: initialState,
      funds: 0,
      level: 1,
      maxResidents,
      registeredResidents,
      insideResidentCount: 0,
      isCoLiving,
      residentIds: [],
      vehicles: [],
      vehicleCount: 0,
      availableVehicleCount: 0,
      taskQueue: [],
      activePipeline: undefined,
    };
  }

  /**
   * 切換住宅建築狀態：統一執行舊狀態 onExit -> 更新 state -> 執行新狀態 onEnter
   */
  public static transitionTo(
    residence: ResidentialProfile,
    nextState: ResidentialState,
    context?: ResidentialStateContext
  ): void {
    const prevState = residence.state;
    if (prevState !== nextState) {
      RESIDENTIAL_STATE_MACHINE[prevState]?.onExit?.(residence, context);
      residence.state = nextState;
    }
    RESIDENTIAL_STATE_MACHINE[nextState]?.onEnter?.(residence, context);
  }

  /**
   * 分派事件至該住宅當前狀態對應之處理器
   */
  public static dispatchEvent(
    residence: ResidentialProfile,
    event: ResidentialStateEvent,
    context?: ResidentialStateContext
  ): void {
    const handler = RESIDENTIAL_STATE_MACHINE[residence.state];
    handler?.onEvent?.(residence, event, context);
  }

  /**
   * 固定週期 Tick 入口（預留給後續住宅資金、滿意度與稅收結算使用）
   */
  public static tick(
    residence: ResidentialProfile,
    deltaTime: number,
    context?: ResidentialStateContext
  ): void {
    const handler = RESIDENTIAL_STATE_MACHINE[residence.state];
    handler?.onTick?.(residence, deltaTime, context);
  }

  /**
   * 檢查住宅是否仍可容納指定新增人數
   */
  public static hasRemainingCapacity(residence: ResidentialProfile, neededCount: number): boolean {
    return residence.maxResidents - residence.registeredResidents >= neededCount;
  }

  /**
   * 登記合居／併入新增居住名額
   */
  public static addDemandResidents(
    residence: ResidentialProfile,
    peopleCount: number,
    isCoLiving: boolean
  ): void {
    residence.registeredResidents = Math.max(0, residence.registeredResidents + peopleCount);
    if (isCoLiving) {
      residence.isCoLiving = true;
    }
  }

  /**
   * 將市民 ID 登錄至住宅居民名單（僅存 EntityId，避免重複市民物件與循環參考）
   */
  public static addResidentIds(residence: ResidentialProfile, citizenIds: EntityId[]): void {
    for (const id of citizenIds) {
      if (!residence.residentIds.includes(id)) {
        residence.residentIds.push(id);
      }
    }
  }

  /**
   * 登錄住宅名下車輛並重算車輛數量統計
   */
  public static registerVehicle(residence: ResidentialProfile, vehicle: ResidenceVehicle): void {
    residence.vehicles.push(vehicle);
    this.refreshVehicleCounts(residence);
  }

  /**
   * 依 vehicles 陣列即時重算 vehicleCount 與 availableVehicleCount
   */
  public static refreshVehicleCounts(residence: ResidentialProfile): void {
    residence.vehicleCount = residence.vehicles.length;
    residence.availableVehicleCount = residence.vehicles.filter((v) => v.status === 'available').length;
  }

  /**
   * 取得住宅目前閒置可用之車輛資料清單
   */
  public static getAvailableVehicles(residence: ResidentialProfile): ResidenceVehicle[] {
    return residence.vehicles.filter((v) => v.status === 'available');
  }

  /**
   * 記錄市民走入家門並清除模型後，增加屋內人數並在必要時切換為 Active
   */
  public static recordResidentEntered(
    residence: ResidentialProfile,
    citizenId: EntityId,
    context?: ResidentialStateContext
  ): void {
    residence.insideResidentCount += 1;
    this.dispatchEvent(residence, { type: 'RESIDENT_ENTERED', citizenId }, context);
    if (residence.state !== 'Active') {
      this.transitionTo(residence, 'Active', context);
    }
  }

  /**
   * 記錄市民離開住家出行，遞減屋內人數
   */
  public static recordResidentLeft(
    residence: ResidentialProfile,
    citizenId: EntityId,
    context?: ResidentialStateContext
  ): void {
    residence.insideResidentCount = Math.max(0, residence.insideResidentCount - 1);
    this.dispatchEvent(residence, { type: 'RESIDENT_LEFT', citizenId }, context);
  }

  // =========================================================================
  // 複合任務微觀管線會話管理 (Pipeline Session Management)
  // =========================================================================

  /**
   * 啟動住宅複合任務微觀管線會話：
   * 建立 activePipeline 並將微觀子階段設為 initialStage，同時更新 payload
   */
  public static startPipeline(
    residence: ResidentialProfile,
    taskId: string,
    taskType: ResidentialTaskType,
    initialStage: ResidentialStage,
    currentVirtualMin: number,
    payload?: Record<string, any>
  ): ResidentialPipelineSession {
    const session: ResidentialPipelineSession = {
      taskId,
      taskType,
      currentStage: initialStage,
      startedAtVirtualMin: currentVirtualMin,
      stageStartedAtVirtualMin: currentVirtualMin,
      payload: { ...payload },
    };
    residence.activePipeline = session;
    return session;
  }

  /**
   * 推進住宅複合任務微觀管線至下一子階段（同幀 0 延遲或回調時調用）
   */
  public static advancePipelineStage(
    residence: ResidentialProfile,
    nextStage: ResidentialStage,
    currentVirtualMin: number,
    payloadUpdate?: Record<string, any>
  ): PipelineAdvanceResult<ResidentialStage> {
    const session = residence.activePipeline;
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
    residence: ResidentialProfile,
    _context?: ResidentialStateContext
  ): boolean {
    const session = residence.activePipeline;
    if (!session) return false;
    removeTaskById(residence, session.taskId);
    residence.activePipeline = undefined;
    return true;
  }

  /**
   * 中止／取消複合任務微觀管線
   */
  public static cancelPipeline(
    residence: ResidentialProfile,
    _reason?: string,
    _context?: ResidentialStateContext
  ): void {
    if (!residence.activePipeline) return;
    removeTaskById(residence, residence.activePipeline.taskId);
    residence.activePipeline = undefined;
  }

  /**
   * 取得住宅當前微觀管線會話
   */
  public static getActivePipeline(residence: ResidentialProfile): ResidentialPipelineSession | undefined {
    return residence.activePipeline;
  }
}
