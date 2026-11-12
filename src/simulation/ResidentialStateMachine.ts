import { BuildingDensityLevel, EntityId } from '../types/common';
import { ResidentialProfile, ResidentialState } from '../types/residential';

/**
 * 住宅區狀態機執行上下文（預留後續與市民／市政稅收系統連動）
 */
export interface ResidentialStateContext {
  timestamp?: number;
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
  | { type: 'CUSTOM'; name: string; payload?: unknown };

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
 * 全城共用一份之住宅區狀態機定義表
 * 目前僅完成基礎架構與插槽預留；具體升級、稅收與廢棄規則待後續討論確認後填入。
 */
export const RESIDENTIAL_STATE_MACHINE: Record<ResidentialState, ResidentialStateHandler> = {
  Constructing: {},
  WaitingForRoad: {},
  MovingIn: {},
  Active: {},
  Abandoned: {},
};

/**
 * 全城共用住宅區狀態機調度器
 */
export class ResidentialStateMachine {
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
      vehicleCount: 0,
      availableVehicleCount: 0,
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
   * 同步住宅人員與名下車輛統計欄位
   */
  public static syncCounts(
    residence: ResidentialProfile,
    registeredResidents: number,
    insideResidentCount: number,
    vehicleCount: number,
    availableVehicleCount: number,
    isCoLiving: boolean
  ): void {
    residence.registeredResidents = Math.max(0, registeredResidents);
    residence.insideResidentCount = Math.max(0, insideResidentCount);
    residence.vehicleCount = Math.max(0, vehicleCount);
    residence.availableVehicleCount = Math.max(0, availableVehicleCount);
    residence.isCoLiving = isCoLiving;
  }
}
