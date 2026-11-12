import { BuildingDensityLevel, EntityId } from '../types/common';
import { IndustrialLowProfile, IndustrialLowState } from '../types/industrial';

/**
 * 工業區狀態機執行上下文（預留後續跨系統連動用）
 */
export interface IndustrialStateContext {
  timestamp?: number;
}

/**
 * 工業區狀態機事件結構骨架（預留後續與市民／物流系統連動）
 */
export type IndustrialStateEvent =
  | { type: 'CONSTRUCTION_COMPLETED' }
  | { type: 'WORKER_HIRED'; citizenId: EntityId }
  | { type: 'WORKER_ENTERED'; citizenId: EntityId }
  | { type: 'WORKER_LEFT'; citizenId: EntityId }
  | { type: 'CUSTOM'; name: string; payload?: unknown };

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
 * 全城共用一份之工業區狀態機定義表（支援 Low / Medium / High 不同密度透過 density 欄位區分）
 * 目前僅完成基礎架構與插槽預留；具體生產、資金結算與事件轉換規則待後續討論確認後實作。
 */
export const INDUSTRIAL_LOW_STATE_MACHINE: Record<IndustrialLowState, IndustrialStateHandler> = {
  Constructing: {},
  Idle: {},
  Operating: {},
  Paused: {},
  Abandoned: {},
};

export const INDUSTRIAL_STATE_MACHINE = INDUSTRIAL_LOW_STATE_MACHINE;

/**
 * 全城共用工業區狀態機調度器
 */
export class IndustrialStateMachine {
  /**
   * 建置工業建築出現時之初始狀態清單資料
   */
  public static createDefaultProfile(
    buildingId: EntityId,
    modelId: string,
    name: string,
    maxWorkers: number,
    initialState: IndustrialLowState = 'Constructing',
    density: BuildingDensityLevel = 'Low'
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
      workerCount: 0,
      insideWorkerCount: 0,
      insideTruckCount: 1, // 預設 1 台貨車
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
   * 同步工廠人員統計欄位（已入職員工數 & 工廠內現有人數）
   */
  public static syncWorkerCounts(
    factory: IndustrialLowProfile,
    workerCount: number,
    insideWorkerCount: number
  ): void {
    factory.workerCount = Math.max(0, workerCount);
    factory.insideWorkerCount = Math.max(0, insideWorkerCount);
  }
}
