import { RoadManager } from '../systems/RoadManager';

/**
 * 建造選單管理器 (BuildMenu)
 * 位於畫面左下方，具備多分類擴充架構。
 * 目前提供：
 * 1. 道路建造分類按鈕（道路圖標）
 * 2. 雙向二線道卡片（包含兩側立體人行道、無原生白色 Tooltip 提示）
 * 3. 懸浮上方一致性規格面板（是否雙向、速限、人行道、路邊停車、迴轉規定）
 * 4. 視野純淨的不擋視線操作說明氣泡與即時花費指示
 */
export class BuildMenu {
  private container: HTMLDivElement;
  private roadManager: RoadManager;

  // 狀態
  private isRoadMenuOpen: boolean = false;
  private isTwoLaneSelected: boolean = false;

  // DOM 參照
  private roadCategoryBtn!: HTMLButtonElement;
  private subMenuPanel!: HTMLDivElement;
  private twoLaneCard!: HTMLDivElement;
  private specCard!: HTMLDivElement;
  private instructionPill!: HTMLDivElement;
  private instructionTextSpan!: HTMLSpanElement;

  constructor(roadManager: RoadManager) {
    this.roadManager = roadManager;

    this.container = document.createElement('div');
    this.container.className = 'build-menu-container interactive';

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

  private injectStyles(): void {
    const styleId = 'city-dome-build-menu-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .build-menu-container {
        position: fixed;
        bottom: 12px;
        left: 16px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        user-select: none;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        z-index: 100;
      }

      /* 不擋視線的精簡操作說明氣泡 */
      .build-instruction-pill {
        display: none;
        align-items: center;
        gap: 10px;
        padding: 6px 14px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 12px rgba(56, 189, 248, 0.15);
        color: #f8fafc;
        font-size: 12.5px;
        letter-spacing: 0.3px;
        line-height: 1.4;
        animation: fadeIn 0.2s ease-out;
      }

      .build-instruction-pill.active {
        display: flex;
      }

      .build-instruction-pill .pill-badge {
        background: rgba(56, 189, 248, 0.2);
        color: #38bdf8;
        font-weight: 700;
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 10px;
        border: 1px solid rgba(56, 189, 248, 0.3);
      }

      .build-instruction-pill .pill-cost-highlight {
        color: #4ade80;
        font-weight: 700;
        margin-left: 4px;
      }

      .build-instruction-pill .pill-cost-invalid {
        color: #ef4444;
        font-weight: 700;
        margin-left: 4px;
      }

      /* 道路子選單卡片抽屜面板 */
      .build-submenu-panel {
        position: relative;
        display: none;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        background: rgba(18, 15, 25, 0.92);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
        min-width: 230px;
        animation: slideUp 0.18s ease-out;
      }

      .build-submenu-panel.open {
        display: flex;
      }

      .submenu-title {
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        padding: 2px 6px;
      }

      /* 車道項目卡片 */
      .build-item-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: rgba(30, 26, 38, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .build-item-card:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
      }

      .build-item-card.selected {
        background: rgba(56, 189, 248, 0.15);
        border-color: #38bdf8;
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.25);
      }

      .build-item-icon {
        width: 36px;
        height: 36px;
        background: #1e2229;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .build-item-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .build-item-name {
        color: #f8fafc;
        font-size: 13px;
        font-weight: 600;
      }

      .build-item-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
      }

      .build-item-desc {
        color: #94a3b8;
      }

      .build-item-cost {
        color: #4ade80;
        font-weight: 700;
      }

      /* 懸浮於上方的一致性車道規格詳細說明卡片 (Hover Spec Card) */
      .road-spec-card {
        display: none;
        position: absolute;
        bottom: calc(100% + 10px);
        left: 0;
        width: 280px;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 8px;
        padding: 10px 12px;
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.7), 0 0 16px rgba(56, 189, 248, 0.15);
        z-index: 150;
        pointer-events: none;
        animation: fadeIn 0.15s ease-out;
      }

      .road-spec-card.visible {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .spec-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .spec-title {
        color: #f8fafc;
        font-size: 13px;
        font-weight: 700;
      }

      .spec-cost-badge {
        color: #4ade80;
        font-size: 11.5px;
        font-weight: 700;
      }

      .spec-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 2px 0;
      }

      .spec-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .spec-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11.5px;
        line-height: 1.4;
      }

      .spec-label {
        color: #94a3b8;
        font-weight: 500;
      }

      .spec-val {
        color: #f1f5f9;
        font-weight: 600;
      }

      .spec-val.cyan {
        color: #38bdf8;
      }

      .spec-val.green {
        color: #4ade80;
      }

      .spec-val.red {
        color: #f87171;
      }

      .spec-val.yellow {
        color: #fbbf24;
      }

      /* 底部主分類導航列 */
      .category-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        background: rgba(18, 15, 25, 0.86);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      .category-btn {
        width: 36px;
        height: 32px;
        background: rgba(30, 26, 38, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #cbd5e1;
        transition: all 0.15s ease;
      }

      .category-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
      }

      .category-btn.active {
        background: rgba(56, 189, 248, 0.2);
        border-color: #38bdf8;
        color: #38bdf8;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
      }

      @keyframes slideUp {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  private render(): void {
    // 移除所有原生 title 屬性，杜絕瀏覽器與 OS 原生白底 Tooltip
    this.container.innerHTML = `
      <!-- 不擋視線的簡潔操作說明氣泡 -->
      <div class="build-instruction-pill">
        <span class="pill-badge">雙向車道</span>
        <span class="pill-text">滑鼠左鍵點擊或拖曳鋪設（自動吸附網格） · 右鍵或 ESC 取消</span>
      </div>

      <!-- 道路分類子選單 -->
      <div class="build-submenu-panel">
        <!-- 懸浮於上方的一致性車道規格詳細說明卡片 -->
        <div class="road-spec-card">
          <div class="spec-header">
            <span class="spec-title">雙向二線道 (Two-Lane Road)</span>
            <span class="spec-cost-badge">$10 / 格 (2m)</span>
          </div>
          <div class="spec-divider"></div>
          <div class="spec-list">
            <div class="spec-row">
              <span class="spec-label">通行方向</span>
              <span class="spec-val cyan">雙向通行 (1順向 + 1逆向)</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">道路速限</span>
              <span class="spec-val">50 km/h</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">人行步道</span>
              <span class="spec-val green">包含 (兩側立體高架人行道)</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">路邊停車</span>
              <span class="spec-val red">禁止路邊停車</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">迴轉規定</span>
              <span class="spec-val yellow">路段禁止迴轉 (路口除外)</span>
            </div>
          </div>
        </div>

        <div class="submenu-title">道路建設工具</div>
        <div class="build-item-card two-lane-road">
          <div class="build-item-icon">
            <!-- 雙向車道迷你圖標（含兩側人行道） -->
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="3" fill="#22252a" stroke="#475569" stroke-width="1.2"/>
              <!-- 兩側人行道 -->
              <rect x="2" y="2" width="4" height="20" fill="#94a3b8"/>
              <rect x="18" y="2" width="4" height="20" fill="#94a3b8"/>
              <!-- 中央黃色虛線 -->
              <line x1="12" y1="4" x2="12" y2="8" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
              <line x1="12" y1="11" x2="12" y2="15" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
              <line x1="12" y1="18" x2="12" y2="22" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="build-item-details">
            <span class="build-item-name">雙向二線道</span>
            <div class="build-item-meta">
              <span class="build-item-desc">占1格 · 含立體人行道</span>
              <span class="build-item-cost">$10/格</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 下方左半邊建造分類按鈕導航列 (預留未來新增各種建造分類) -->
      <div class="category-toolbar">
        <button class="category-btn road-category-btn">
          <!-- 道路分類圖標 -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19L8 5M20 19L16 5"/>
            <line x1="12" y1="7" x2="12" y2="9"/>
            <line x1="12" y1="13" x2="12" y2="15"/>
          </svg>
        </button>
      </div>
    `;

    this.roadCategoryBtn = this.container.querySelector('.road-category-btn') as HTMLButtonElement;
    this.subMenuPanel = this.container.querySelector('.build-submenu-panel') as HTMLDivElement;
    this.twoLaneCard = this.container.querySelector('.two-lane-road') as HTMLDivElement;
    this.specCard = this.container.querySelector('.road-spec-card') as HTMLDivElement;
    this.instructionPill = this.container.querySelector('.build-instruction-pill') as HTMLDivElement;
    this.instructionTextSpan = this.container.querySelector('.pill-text') as HTMLSpanElement;
  }

  private bindEvents(): void {
    // 阻止點擊選單穿透至 3D 視角控制
    this.container.addEventListener('mousedown', (e) => e.stopPropagation());
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('click', (e) => e.stopPropagation());

    // 點擊道路分類按鈕：切換子選單展開/收合
    this.roadCategoryBtn.addEventListener('click', () => {
      this.isRoadMenuOpen = !this.isRoadMenuOpen;
      this.updateMenuUI();

      if (!this.isRoadMenuOpen) {
        this.specCard.classList.remove('visible');
        if (this.isTwoLaneSelected) {
          this.deselectRoadTool();
        }
      }
    });

    // 滑鼠懸停雙向二線道卡片：在上方顯示一致風格的完整規格說明面板
    this.twoLaneCard.addEventListener('mouseenter', () => {
      this.specCard.classList.add('visible');
    });

    this.twoLaneCard.addEventListener('mouseleave', () => {
      this.specCard.classList.remove('visible');
    });

    // 點擊「雙向二線道」卡片：啟用/關閉車道建造工具
    this.twoLaneCard.addEventListener('click', () => {
      if (this.isTwoLaneSelected) {
        this.deselectRoadTool();
      } else {
        this.selectRoadTool();
      }
    });

    // 訂閱 RoadManager 預覽即時花費回報
    this.roadManager.setTreasuryCallbacks(
      (newTreasury) => {
        void newTreasury;
      },
      (previewInfo) => {
        if (!this.isTwoLaneSelected) return;

        if (previewInfo && previewInfo.cellCount > 1) {
          const costClass = previewInfo.isValid ? 'pill-cost-highlight' : 'pill-cost-invalid';
          const validNote = previewInfo.isValid ? '' : '（國庫存款不足）';
          this.instructionTextSpan.innerHTML = `
            正在鋪設：${previewInfo.cellCount} 格
            <span class="${costClass}">$${previewInfo.cost}</span> ${validNote} · 放開或再次點擊確定
          `;
        } else {
          this.instructionTextSpan.textContent = '滑鼠左鍵點擊或拖曳鋪設（自動吸附網格） · 右鍵或 ESC 取消';
        }
      }
    );

    // 監聽鍵盤 ESC 與右鍵以同步 UI 選中狀態
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isTwoLaneSelected) {
        this.deselectRoadTool();
      }
    });

    // 監聽滑鼠右鍵取消建造狀態
    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 2 && this.isTwoLaneSelected) {
        setTimeout(() => {
          if (!this.roadManager.getIsToolActive()) {
            this.deselectRoadTool();
          }
        }, 50);
      }
    });
  }

  /**
   * 選取雙向車道工具
   */
  private selectRoadTool(): void {
    this.isTwoLaneSelected = true;
    this.roadManager.setToolActive(true);
    this.updateMenuUI();
  }

  /**
   * 取消選取雙向車道工具
   */
  private deselectRoadTool(): void {
    this.isTwoLaneSelected = false;
    this.roadManager.setToolActive(false);
    this.updateMenuUI();
  }

  /**
   * 刷新 UI 視覺狀態
   */
  private updateMenuUI(): void {
    // 分類按鈕
    if (this.isRoadMenuOpen) {
      this.roadCategoryBtn.classList.add('active');
      this.subMenuPanel.classList.add('open');
    } else {
      this.roadCategoryBtn.classList.remove('active');
      this.subMenuPanel.classList.remove('open');
    }

    // 車道卡片選中狀態
    if (this.isTwoLaneSelected) {
      this.twoLaneCard.classList.add('selected');
      this.instructionPill.classList.add('active');
    } else {
      this.twoLaneCard.classList.remove('selected');
      this.instructionPill.classList.remove('active');
    }
  }
}
