import { WorldTime } from '../types';
import { TimeManager } from '../simulation/TimeManager';

export interface StatusBarStats {
  population: number;
  treasury: number;
}

/**
 * 底部狀態欄 UI 元件 (BottomStatusBar)
 * 仿造現代城市建造遊戲（如 Cities: Skylines II）的半透明懸浮底欄
 * 提供：
 * 1. 最左側：開始/暫停切換按鈕、虛擬時間（起始 2027/01/01 06:00）
 * 2. 金錢數值顯示（綠色鈔票圖標）
 * 3. 城市總人口顯示（藍色市民圖標）
 */
export class BottomStatusBar {
  private container: HTMLDivElement;
  private timeManager: TimeManager;
  private currentStats: StatusBarStats;

  // DOM 節點快取
  private playPauseBtn!: HTMLButtonElement;
  private speedToggleBtn!: HTMLButtonElement;
  private timeClockSpan!: HTMLSpanElement;
  private timeDateSpan!: HTMLSpanElement;
  private moneySpan!: HTMLSpanElement;
  private popSpan!: HTMLSpanElement;

  private unsubs: Array<() => void> = [];

  constructor(timeManager: TimeManager, initialStats: StatusBarStats) {
    this.timeManager = timeManager;
    this.currentStats = { ...initialStats };

    this.container = document.createElement('div');
    this.container.className = 'bottom-status-bar interactive';

    this.injectStyles();
    this.render();
    this.bindEvents();

    // 掛載至 ui-overlay
    const uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) {
      uiOverlay.appendChild(this.container);
    } else {
      document.body.appendChild(this.container);
    }
  }

  /**
   * 格式化千分位數值
   */
  private formatNumber(num: number): string {
    return Math.floor(num).toLocaleString('en-US');
  }

  /**
   * 格式化時間與日期
   */
  private formatTime(time: WorldTime): { clockStr: string; dateStr: string } {
    const hh = String(time.hour).padStart(2, '0');
    const mm = String(time.minute).padStart(2, '0');
    const yyyy = String(time.year);
    const MM = String(time.month).padStart(2, '0');
    const dd = String(time.day).padStart(2, '0');

    return {
      clockStr: `${hh}:${mm}`,
      dateStr: `${yyyy}/${MM}/${dd}`,
    };
  }

  /**
   * 注入元件專屬樣式
   */
  private injectStyles(): void {
    const styleId = 'city-dome-bottom-status-bar-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .bottom-status-bar {
        position: fixed;
        bottom: 12px;
        right: 16px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        background: rgba(18, 15, 25, 0.86);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        user-select: none;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        z-index: 100;
      }

      .bottom-status-bar .status-segment {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(30, 26, 38, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 4px 10px;
        height: 32px;
        box-sizing: border-box;
      }

      .bottom-status-bar .time-segment {
        padding-left: 6px;
      }

      .bottom-status-bar .play-pause-btn {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: background-color 0.15s ease, transform 0.1s ease;
      }

      .bottom-status-bar .play-pause-btn:hover {
        background: rgba(255, 255, 255, 0.15);
      }

      .bottom-status-bar .play-pause-btn:active {
        transform: scale(0.92);
      }

      .bottom-status-bar .play-pause-btn svg {
        display: block;
      }

      .bottom-status-bar .speed-toggle-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        padding: 0 6px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #38bdf8;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.3px;
        font-family: inherit;
        transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
      }

      .bottom-status-bar .speed-toggle-btn:hover {
        background: rgba(56, 189, 248, 0.2);
        border-color: #38bdf8;
      }

      .bottom-status-bar .speed-toggle-btn:active {
        transform: scale(0.92);
      }

      .bottom-status-bar .time-display {
        display: flex;
        align-items: baseline;
        gap: 8px;
        line-height: 1;
      }

      .bottom-status-bar .time-clock {
        color: #38bdf8;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.5px;
        font-variant-numeric: tabular-nums;
      }

      .bottom-status-bar .time-date {
        color: #e2e8f0;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0.2px;
        font-variant-numeric: tabular-nums;
      }

      .bottom-status-bar .segment-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }

      .bottom-status-bar .stat-value {
        color: #f8fafc;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.3px;
        font-variant-numeric: tabular-nums;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 產生 Play / Pause SVG 圖標
   */
  private getPlayPauseIconHtml(isPaused: boolean): string {
    if (isPaused) {
      // 處於暫停狀態時，顯示綠色播放 ▶ 圖標（提示點擊開始）
      return `
        <svg width="10" height="12" viewBox="0 0 10 12" fill="#22c55e">
          <path d="M1.5 1.5C1.5 0.7 2.4 0.2 3.1 0.6L8.8 4.6C9.4 5 9.4 6 8.8 6.4L3.1 10.4C2.4 10.8 1.5 10.3 1.5 9.5V1.5Z"/>
        </svg>
      `;
    }
    // 處於進行狀態時，顯示紅色暫停 ⏸ 圖標（如附圖，提示點擊暫停）
    return `
      <svg width="10" height="12" viewBox="0 0 10 12" fill="#ef4444">
        <rect x="1" y="1" width="2.5" height="10" rx="0.8"/>
        <rect x="6.5" y="1" width="2.5" height="10" rx="0.8"/>
      </svg>
    `;
  }

  /**
   * 渲染 UI 結構
   */
  private render(): void {
    const isPaused = this.timeManager.getIsPaused();
    const { clockStr, dateStr } = this.formatTime(this.timeManager.getTime());

    this.container.innerHTML = `
      <!-- 最左邊：開始/暫停按鈕、模擬速度切換與虛擬時間 -->
      <div class="status-segment time-segment">
        <button class="play-pause-btn" title="開始 / 暫停 (空白鍵)">
          ${this.getPlayPauseIconHtml(isPaused)}
        </button>
        <button class="speed-toggle-btn" title="切換模擬速度 (0.75x / 1x / 2x / 3x)">
          ${this.timeManager.getTimeScale()}x
        </button>
        <div class="time-display">
          <span class="time-clock">${clockStr}</span>
          <span class="time-date">${dateStr}</span>
        </div>
      </div>

      <!-- 金錢顯示（鈔票圖標） -->
      <div class="status-segment money-segment">
        <div class="segment-icon money-icon">
          <svg width="19" height="15" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 7.5L10 3L20 6.5L12 11L2 7.5Z" fill="#4ade80" stroke="#16a34a" stroke-width="1.2"/>
            <path d="M2 7.5V10.5L12 14V11L2 7.5Z" fill="#22c55e" stroke="#16a34a" stroke-width="1.2"/>
            <path d="M20 6.5V9.5L12 14V11L20 6.5Z" fill="#15803d" stroke="#166534" stroke-width="1.2"/>
            <ellipse cx="11" cy="7" rx="2.5" ry="1.2" fill="#166534" opacity="0.6"/>
          </svg>
        </div>
        <span class="stat-value money-value">${this.formatNumber(this.currentStats.treasury)}</span>
      </div>

      <!-- 人口顯示（市民圖標） -->
      <div class="status-segment pop-segment">
        <div class="segment-icon pop-icon">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="#38bdf8" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="4.2" r="3.2"/>
            <path d="M2.5 13.8C2.5 10.8 5 9.4 8 9.4C11 9.4 13.5 10.8 13.5 13.8C13.5 14.4 13 14.8 12.4 14.8H3.6C3 14.8 2.5 14.4 2.5 13.8Z"/>
          </svg>
        </div>
        <span class="stat-value pop-value">${this.formatNumber(this.currentStats.population)}</span>
      </div>
    `;

    // 取得節點引用
    this.playPauseBtn = this.container.querySelector('.play-pause-btn') as HTMLButtonElement;
    this.speedToggleBtn = this.container.querySelector('.speed-toggle-btn') as HTMLButtonElement;
    this.timeClockSpan = this.container.querySelector('.time-clock') as HTMLSpanElement;
    this.timeDateSpan = this.container.querySelector('.time-date') as HTMLSpanElement;
    this.moneySpan = this.container.querySelector('.money-value') as HTMLSpanElement;
    this.popSpan = this.container.querySelector('.pop-value') as HTMLSpanElement;
  }

  /**
   * 綁定事件
   */
  private bindEvents(): void {
    // 阻止點擊狀態欄穿透至 3D 視角控制
    this.container.addEventListener('mousedown', (e) => e.stopPropagation());
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('click', (e) => e.stopPropagation());

    // 開始 / 暫停按鈕點擊
    this.playPauseBtn.addEventListener('click', () => {
      this.timeManager.togglePause();
    });

    // 模擬速度切換按鈕點擊 (循環: 0.75x -> 1.0x -> 2.0x -> 3.0x -> 0.75x)
    const speeds = [0.75, 1.0, 2.0, 3.0];
    this.speedToggleBtn.addEventListener('click', () => {
      const cur = this.timeManager.getTimeScale();
      const nextIdx = (speeds.findIndex((s) => Math.abs(s - cur) < 0.05) + 1) % speeds.length;
      this.timeManager.setTimeScale(speeds[nextIdx]);
    });

    // 鍵盤空白鍵快速切換開始 / 暫停，1/2/3 鍵切換對應倍速
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.timeManager.togglePause();
      } else if (e.key === '1') {
        this.timeManager.setTimeScale(1.0);
      } else if (e.key === '2') {
        this.timeManager.setTimeScale(2.0);
      } else if (e.key === '3') {
        this.timeManager.setTimeScale(3.0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 訂閱時間變更
    const unsubTime = this.timeManager.onTimeChange((time) => {
      const { clockStr, dateStr } = this.formatTime(time);
      if (this.timeClockSpan && this.timeClockSpan.textContent !== clockStr) {
        this.timeClockSpan.textContent = clockStr;
      }
      if (this.timeDateSpan && this.timeDateSpan.textContent !== dateStr) {
        this.timeDateSpan.textContent = dateStr;
      }
    });

    // 訂閱暫停狀態變更
    const unsubPause = this.timeManager.onPauseChange((isPaused) => {
      if (this.playPauseBtn) {
        this.playPauseBtn.innerHTML = this.getPlayPauseIconHtml(isPaused);
      }
    });

    // 訂閱速度變更
    const unsubSpeed = this.timeManager.onTimeScaleChange((scale) => {
      if (this.speedToggleBtn) {
        this.speedToggleBtn.textContent = `${scale}x`;
      }
    });

    this.unsubs.push(
      () => window.removeEventListener('keydown', handleKeyDown),
      unsubTime,
      unsubPause,
      unsubSpeed
    );
  }

  /**
   * 更新統計數據（金錢、人口）
   */
  public updateStats(stats: Partial<StatusBarStats>): void {
    if (stats.treasury !== undefined && stats.treasury !== this.currentStats.treasury) {
      this.currentStats.treasury = stats.treasury;
      if (this.moneySpan) {
        this.moneySpan.textContent = this.formatNumber(this.currentStats.treasury);
      }
    }
    if (stats.population !== undefined && stats.population !== this.currentStats.population) {
      this.currentStats.population = stats.population;
      if (this.popSpan) {
        this.popSpan.textContent = this.formatNumber(this.currentStats.population);
      }
    }
  }

  /**
   * 銷毀釋放資源
   */
  public destroy(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    this.container.remove();
  }
}
