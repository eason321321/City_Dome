import { MapOverlayMode } from './mapOverlay';

/**
 * 模擬速度等級
 */
export enum SimulationSpeed {
  Paused = 0,
  Normal = 1,                            // 1x (例如 1 虛擬小時 = 10 實際秒)
  Fast = 2,                              // 2x
  Hyper = 4,                             // 4x
}

/**
 * 虛擬世界時間
 */
export interface WorldTime {
  totalTicks: number;                    // 累計邏輯 Tick 數 (例如 20 Ticks = 1 秒)
  year: number;                          // 當前西元年份 (例如 2027)
  month: number;                         // 當前月份 (1 ~ 12)
  day: number;                           // 當前日期 (1 ~ 31)
  hour: number;                          // 當前小時 (0 ~ 23)
  minute: number;                        // 當前分鐘 (0 ~ 59)
}

/**
 * 城市整體宏觀統計數據 (KPIs)
 */
export interface CityStats {
  population: number;                    // 總人口數
  employedCount: number;                 // 就業人口
  unemployedRate: number;                // 失業率 (0.0 - 1.0)
  treasury: number;                      // 市政國庫存款
  cashFlow: number;                      // 每週期淨收支
  overallHappiness: number;              // 總體居民滿意度 (0 - 100)
  averageTrafficCongestion: number;      // 全城平均塞車指數 (1.0 = 順暢)
  taxRate: number;                       // 綜合稅率百分比 (例如 12%)
}

/**
 * 整個模擬核心的總體狀態結構 (World State)
 */
export interface WorldSimulationState {
  time: WorldTime;
  speed: SimulationSpeed;
  stats: CityStats;
  activeOverlayMode: MapOverlayMode;
}
