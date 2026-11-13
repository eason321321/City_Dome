import { BuildingManager } from '../systems/BuildingManager';
import { TimeManager } from '../simulation/TimeManager';
import { MatchingResult } from '../types';

/**
 * 市政顧問通知系統 (City Advisor / Chirper)
 * 
 * 位於畫面右上角的小鳥圖示，提供市政顧問提示、市民向市長發聲的彈出氣泡對話框。
 * 支援懸停微放大互動、有話要說時的輕快跳動擺動動畫、4秒自動淡出與相同對話真實世界 10 秒冷卻。
 */
export class CityAdvisor {
  private container!: HTMLElement;
  private birdBtn!: HTMLElement;
  private bubble!: HTMLElement;
  private bubbleTitle!: HTMLElement;
  private bubbleText!: HTMLElement;
  private bubbleTime!: HTMLElement;

  private dismissTimerId: number | null = null;
  private chirpAnimTimerId: number | null = null;

  // 記錄相同訊息上次彈出的真實時間戳記 (毫秒)，防止短時間內重複彈出
  private messageLastShownRealTime: Map<string, number> = new Map();
  private lastMessage: string | null = null;

  // 預設冷卻時間：10 秒真實世界時間
  private readonly DEFAULT_COOLDOWN_MS = 10000;
  // 預設對話框浮現時間：4 秒後自動淡出
  private readonly DEFAULT_DISMISS_MS = 4000;

  private cleanupDemandListener?: () => void;

  constructor(
    private buildingManager: BuildingManager,
    private timeManager: TimeManager
  ) {
    this.injectStyles();
    this.createDom();
    this.bindEvents();
  }

  /**
   * 注入顧問 UI 樣式
   */
  private injectStyles(): void {
    const styleId = 'city-dome-advisor-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .advisor-container {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 95;
        display: flex;
        flex-direction: row-reverse;
        align-items: flex-start;
        gap: 12px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      /* 右上角小鳥按鈕 (常態樣式與 Hover 動態反饋) */
      .advisor-bird-btn {
        pointer-events: auto;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1.5px solid rgba(56, 189, 248, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 12px rgba(56, 189, 248, 0.2);
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
                    border-color 0.2s ease,
                    box-shadow 0.2s ease,
                    background 0.2s ease;
        user-select: none;
        position: relative;
      }

      .advisor-bird-btn:hover {
        transform: scale(1.12);
        border-color: rgba(56, 189, 248, 0.9);
        background: rgba(30, 41, 59, 0.96);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5), 0 0 18px rgba(56, 189, 248, 0.45);
      }

      .advisor-bird-btn:active {
        transform: scale(0.96);
      }

      /* 說話時的小鳥動畫：輕快跳動與歡樂擺動 */
      .advisor-bird-btn.chirping {
        animation: advisor-chirp-bounce 1.0s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
      }

      @keyframes advisor-chirp-bounce {
        0% { transform: scale(1) translateY(0) rotate(0deg); }
        20% { transform: scale(1.18) translateY(-5px) rotate(-9deg); }
        40% { transform: scale(1.12) translateY(2px) rotate(7deg); }
        60% { transform: scale(1.16) translateY(-3px) rotate(-4deg); }
        80% { transform: scale(1.06) translateY(0) rotate(2deg); }
        100% { transform: scale(1) translateY(0) rotate(0deg); }
      }

      /* 顧問對話氣泡框 (在小鳥左側彈出) */
      .advisor-bubble {
        position: relative;
        max-width: 320px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(56, 189, 248, 0.4);
        border-radius: 12px;
        padding: 10px 14px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 16px rgba(56, 189, 248, 0.18);
        opacity: 0;
        transform: translateX(14px) scale(0.96);
        pointer-events: none;
        transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .advisor-bubble.visible {
        opacity: 1;
        transform: translateX(0) scale(1);
        pointer-events: auto;
      }

      /* 氣泡右側小箭頭尾巴指向小鳥 */
      .advisor-bubble::after {
        content: '';
        position: absolute;
        top: 15px;
        right: -6px;
        width: 0;
        height: 0;
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        border-left: 6px solid rgba(15, 23, 42, 0.94);
      }

      .advisor-bubble-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }

      .advisor-title-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(56, 189, 248, 0.18);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #38bdf8;
        font-size: 11px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 6px;
        letter-spacing: 0.3px;
      }

      .advisor-bubble-time {
        font-size: 10px;
        color: #94a3b8;
      }

      .advisor-bubble-text {
        color: #f1f5f9;
        font-size: 13px;
        line-height: 1.5;
        font-weight: 500;
        word-break: break-word;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 建立 DOM 元素結構
   */
  private createDom(): void {
    this.container = document.createElement('div');
    this.container.className = 'advisor-container';

    // 1. 小鳥按鈕 (內嵌精緻向量圖標，朝向左側對話框)
    this.birdBtn = document.createElement('div');
    this.birdBtn.className = 'advisor-bird-btn interactive';
    this.birdBtn.title = '市政顧問（點選可查看市民建議）';
    this.birdBtn.innerHTML = `
      <svg viewBox="0 0 36 36" width="26" height="26" fill="none">
        <defs>
          <linearGradient id="advisorBirdGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8"/>
            <stop offset="100%" stop-color="#0284c7"/>
          </linearGradient>
          <linearGradient id="advisorWingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0284c7"/>
            <stop offset="100%" stop-color="#0369a1"/>
          </linearGradient>
        </defs>
        <!-- 小鳥羽翼主體 (面向左方對話氣泡) -->
        <path d="M26 10 C22 8 16 10 14 13 C12 11 8 13 8 17 C8 23 15 26.5 22 25.5 C26.5 24.5 30 20.5 30.5 15.5 C31 13 29 11 26 10 Z" fill="url(#advisorBirdGrad)"/>
        <!-- 翅膀 -->
        <path d="M15 18 C17.5 20.5 22.5 21 24.5 17.5 C22.5 22 17 23.5 13 21.5 C13 19.5 14 18.5 15 18 Z" fill="url(#advisorWingGrad)"/>
        <!-- 鳥喙 (向左) -->
        <polygon points="5,15.5 8.5,13.5 8.5,17.5" fill="#f59e0b"/>
        <!-- 眼睛與高光 -->
        <circle cx="11.5" cy="14.5" r="1.6" fill="#0f172a"/>
        <circle cx="12" cy="14" r="0.6" fill="#ffffff"/>
        <!-- 頭頂冠羽 -->
        <path d="M14 11 C13 7 17 6.5 17.5 8.5" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;

    // 2. 顧問氣泡對話框
    this.bubble = document.createElement('div');
    this.bubble.className = 'advisor-bubble interactive';

    const header = document.createElement('div');
    header.className = 'advisor-bubble-header';

    this.bubbleTitle = document.createElement('span');
    this.bubbleTitle.className = 'advisor-title-badge';
    this.bubbleTitle.textContent = '🏛️ 市政顧問';

    this.bubbleTime = document.createElement('span');
    this.bubbleTime.className = 'advisor-bubble-time';

    header.appendChild(this.bubbleTitle);
    header.appendChild(this.bubbleTime);

    this.bubbleText = document.createElement('div');
    this.bubbleText.className = 'advisor-bubble-text';

    this.bubble.appendChild(header);
    this.bubble.appendChild(this.bubbleText);

    this.container.appendChild(this.birdBtn);
    this.container.appendChild(this.bubble);

    // 掛載至 ui-overlay，若無則降級掛至 document.body
    const uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) {
      uiOverlay.appendChild(this.container);
    } else {
      document.body.appendChild(this.container);
    }
  }

  /**
   * 綁定事件監聽
   */
  private bindEvents(): void {
    // 點選小鳥圖示互動：已顯示則立即收起，未顯示則重播上一則訊息或致意
    this.birdBtn.addEventListener('click', () => {
      if (this.bubble.classList.contains('visible')) {
        this.dismissBubble();
      } else {
        const msg = this.lastMessage ?? '市長，目前的各項市政運作良好！隨時向我諮詢市民的聲音。';
        this.showAdvisorMessage(msg, '市政顧問', 0);
      }
    });

    // 監聽建築系統之住房需求配對結果
    this.cleanupDemandListener = this.buildingManager.onDemandProcessed((result: MatchingResult) => {
      // 僅在配對失敗且原因為「無可用建地」時觸發市政顧問提示
      if (!result.success) {
        const reason = result.reason ?? '';
        if (reason.includes('無可用建地')) {
          this.showAdvisorMessage('市長，我們需要規劃更多住宅土地供應市民入住', '市政顧問', this.DEFAULT_COOLDOWN_MS);
        }
      }
    });
  }

  /**
   * 彈出市政顧問提示訊息
   * @param message 說話內容
   * @param speaker 說話者稱謂 (預設 "市政顧問")
   * @param cooldownMs 相同訊息之真實世界冷卻時間 (毫秒，預設 10,000ms = 10s)
   * @returns boolean 是否成功彈出 (若在冷卻期內則回傳 false)
   */
  public showAdvisorMessage(
    message: string,
    speaker: string = '市政顧問',
    cooldownMs: number = this.DEFAULT_COOLDOWN_MS
  ): boolean {
    const now = performance.now();
    const lastShown = this.messageLastShownRealTime.get(message) ?? 0;

    // 檢驗真實世界冷卻時間 (防止短時間內相同文字頻繁洗版)
    if (cooldownMs > 0 && now - lastShown < cooldownMs) {
      return false;
    }

    this.messageLastShownRealTime.set(message, now);
    this.lastMessage = message;

    // 設定稱謂與內容
    this.bubbleTitle.textContent = `🏛️ ${speaker}`;
    this.bubbleText.textContent = message;

    // 設定當前虛擬遊戲時間標籤
    const time = this.timeManager.getTime();
    const hourStr = String(time.hour).padStart(2, '0');
    const minStr = String(time.minute).padStart(2, '0');
    this.bubbleTime.textContent = `${hourStr}:${minStr}`;

    // 觸發小鳥跳動/擺動動畫
    this.triggerBirdAnimation();

    // 浮現對話氣泡
    this.bubble.classList.add('visible');

    // 重設 4 秒自動淡出定時器
    if (this.dismissTimerId !== null) {
      window.clearTimeout(this.dismissTimerId);
    }
    this.dismissTimerId = window.setTimeout(() => {
      this.dismissBubble();
    }, this.DEFAULT_DISMISS_MS);

    return true;
  }

  /**
   * 觸發小鳥說話動態動畫
   */
  private triggerBirdAnimation(): void {
    this.birdBtn.classList.remove('chirping');
    // 強制重繪以重啟 CSS 動畫
    void this.birdBtn.offsetWidth;
    this.birdBtn.classList.add('chirping');

    if (this.chirpAnimTimerId !== null) {
      window.clearTimeout(this.chirpAnimTimerId);
    }
    this.chirpAnimTimerId = window.setTimeout(() => {
      this.birdBtn.classList.remove('chirping');
      this.chirpAnimTimerId = null;
    }, 1000);
  }

  /**
   * 關閉/淡出對話氣泡
   */
  public dismissBubble(): void {
    if (this.dismissTimerId !== null) {
      window.clearTimeout(this.dismissTimerId);
      this.dismissTimerId = null;
    }
    this.bubble.classList.remove('visible');
  }

  /**
   * 釋放資源
   */
  public destroy(): void {
    if (this.dismissTimerId !== null) {
      window.clearTimeout(this.dismissTimerId);
    }
    if (this.chirpAnimTimerId !== null) {
      window.clearTimeout(this.chirpAnimTimerId);
    }
    if (this.cleanupDemandListener) {
      this.cleanupDemandListener();
    }
    this.container.remove();
  }
}
