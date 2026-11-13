/**
 * 通用基礎數據結構
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Vector2D {
  x: number;
  z: number;
}

export interface GridCoord {
  gx: number;
  gz: number;
}

export type EntityId = string;

/**
 * 建築分區密度分級（供共用狀態機依不同密度分級判斷規則）
 */
export type BuildingDensityLevel = 'Low' | 'Medium' | 'High';

/**
 * 遊戲內所有狀態機共用之任務列隊基礎項目（市民、住宅、工業區通用）
 */
export interface BaseTaskItem<TType = string> {
  id: string;
  type: TType;
  /** 優先度 (1 ~ 100，由低到高；數值越大越優先處理) */
  priority: number;
  /** 加入列隊時之虛擬遊戲總分鐘 */
  createdAtVirtualMin: number;
  /** 最早執行時間 (虛擬遊戲總分鐘；未達該時間前不分派執行，null 表示無限制/立即就緒) */
  earliestStartVirtualMin: number | null;
  /** 最後接受時間 (虛擬遊戲總分鐘；超過即過期移除，null 表示無期限) */
  latestAcceptVirtualMin: number | null;
  /** 任務附帶參數（預留） */
  payload?: unknown;
}

/**
 * 複合任務微觀執行階段會話 (Pipeline Session) 通用基底介面
 * 供全城三系統（市民、住宅、工業區）通用跟蹤複合任務包內部微觀子階段
 */
export interface BasePipelineSession<TTaskType = string, TStage = string> {
  /** 觸發此流水線之宏觀任務 ID */
  taskId: string;
  /** 宏觀任務類型 */
  taskType: TTaskType;
  /** 當前正在執行之微觀子階段 */
  currentStage: TStage;
  /** 管線建立/啟動時之虛擬遊戲總分鐘 */
  startedAtVirtualMin: number;
  /** 當前子階段開始時之虛擬遊戲總分鐘 */
  stageStartedAtVirtualMin: number;
  /** 子階段間傳遞與累計之上下文數據 */
  payload?: Record<string, any>;
}

/**
 * 管線微觀階段推進結果
 */
export interface PipelineAdvanceResult<TStage = string> {
  success: boolean;
  previousStage: TStage;
  currentStage: TStage;
  isCompleted?: boolean;
}

/**
 * 狀態機任務通用條件與執行規則介面
 */
export interface BaseTaskRule<TEntity, TTask extends BaseTaskItem<any>, TContext = unknown> {
  /** 預設優先度 (1 ~ 100，由低到高) */
  defaultPriority: number;
  /** 預設有效期限（遊戲虛擬分鐘；null 代表無期限） */
  defaultValidDurationMin: number | null;
  /** 預設生效延遲（遊戲虛擬分鐘；null 或 0 代表立即生效） */
  defaultDelayMin?: number | null;
  /** 入隊條件（除通用防重複檢查之外的專屬條件） */
  canEnqueue: (
    entity: TEntity,
    currentVirtualMin: number,
    context?: TContext
  ) => boolean;
  /** 執行條件（除通用最後接受時間過期判斷與最早執行時間之外的專屬條件；失敗則自列隊移除） */
  canExecute: (
    entity: TEntity,
    task: TTask,
    currentVirtualMin: number,
    context?: TContext
  ) => boolean;
  /** 執行動作：成功回傳 true（自列隊移除）；失敗回傳 false（保留於列隊等待下一輪優先度篩選） */
  execute: (
    entity: TEntity,
    task: TTask,
    context?: TContext
  ) => boolean;
}

