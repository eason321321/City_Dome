import { RoadManager } from '../systems/RoadManager';
import { ZoningManager } from '../systems/ZoningManager';

/**
 * 建造與土地規劃選單管理器 (BuildMenu)
 * 位於畫面左下方，具備多分類擴充架構。
 * 目前提供：
 * 1. 土地劃分分類按鈕（綠色分區圖標，位於左側）
 *    - 土地分區子選單：低密度住宅區 (Residential Zone)、清除土地劃分 (Dezone)
 * 2. 道路建造分類按鈕（道路圖標，往右配置）
 *    - 雙向二線道卡片（包含兩側立體高架人行道）
 * 3. 懸浮上方一致性規格面板與不擋視線之操作說明氣泡
 */
export class BuildMenu {
  private container: HTMLDivElement;
  private roadManager: RoadManager;
  private zoningManager: ZoningManager;

  // 狀態
  private isRoadMenuOpen: boolean = false;
  private isTwoLaneSelected: boolean = false;

  private isZoningMenuOpen: boolean = false;
  private currentZoningMode: 'Residential' | 'Dezone' = 'Residential';

  // DOM 參照 - 分類導航
  private zoningCategoryBtn!: HTMLButtonElement;
  private roadCategoryBtn!: HTMLButtonElement;

  // DOM 參照 - 道路選單
  private roadSubMenuPanel!: HTMLDivElement;
  private twoLaneCard!: HTMLDivElement;
  private roadSpecCard!: HTMLDivElement;

  // DOM 參照 - 土地劃分選單
  private zoningSubMenuPanel!: HTMLDivElement;
  private residentialCard!: HTMLDivElement;
  private dezoneCard!: HTMLDivElement;

  // DOM 參照 - 說明氣泡
  private instructionPill!: HTMLDivElement;
  private instructionBadgeSpan!: HTMLSpanElement;
  private instructionTextSpan!: HTMLSpanElement;

  constructor(roadManager: RoadManager, zoningManager: ZoningManager) {
    this.roadManager = roadManager;
    this.zoningManager = zoningManager;

    this.container = document.createElement('div');
    this.container.className = 'build-menu-container interactive';

    this.injectStyles();
    this.render();
    this.bindEvents();

    // 監聽 ZoningManager 被 ESC 等關閉的事件
    this.zoningManager.setToolClosedCallback(() => {
      this.closeZoningTool();
    });

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

      .build-instruction-pill .pill-badge.green {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
        border-color: rgba(34, 197, 94, 0.4);
      }

      .build-instruction-pill .pill-badge.red {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        border-color: rgba(239, 68, 68, 0.4);
      }

      .build-instruction-pill .pill-cost-highlight {
        color: #4ade80;
        font-weight: 700;
      }

      .build-instruction-pill .pill-cost-invalid {
        color: #f87171;
        font-weight: 700;
      }

      /* 子選單面板共通樣式 */
      .build-submenu-panel {
        display: none;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        background: rgba(18, 15, 25, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        min-width: 210px;
        position: relative;
        animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .build-submenu-panel.open {
        display: flex;
      }

      .submenu-title {
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
        padding: 2px 6px 4px 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        text-transform: uppercase;
      }

      /* 項目卡片 */
      .build-item-card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        background: rgba(30, 26, 38, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .build-item-card:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.22);
        transform: translateY(-1px);
      }

      .build-item-card.selected {
        background: rgba(56, 189, 248, 0.18);
        border-color: #38bdf8;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
      }

      .build-item-card.selected.green-card {
        background: rgba(34, 197, 94, 0.2);
        border-color: #22c55e;
        box-shadow: 0 0 12px rgba(34, 197, 94, 0.3);
      }

      .build-item-icon {
        width: 32px;
        height: 32px;
        border-radius: 5px;
        background: rgba(15, 23, 42, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .build-item-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex-grow: 1;
      }

      .build-item-name {
        color: #f8fafc;
        font-size: 12.5px;
        font-weight: 600;
      }

      .build-item-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
      }

      .build-item-cost {
        color: #4ade80;
        font-weight: 700;
      }

      /* 懸浮於上方的一致性車道規格詳細說明卡片 */
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

      .category-btn.active.green-btn {
        background: rgba(34, 197, 94, 0.2);
        border-color: #22c55e;
        color: #4ade80;
        box-shadow: 0 0 10px rgba(34, 197, 94, 0.25);
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
    this.container.innerHTML = `
      <!-- 不擋視線的簡潔操作說明氣泡 -->
      <div class="build-instruction-pill">
        <span class="pill-badge">雙向車道</span>
        <span class="pill-text">滑鼠左鍵點擊或拖曳鋪設（自動吸附網格） · 右鍵或 ESC 取消</span>
      </div>

      <!-- 1. 土地劃分子選單 -->
      <div class="build-submenu-panel zoning-submenu-panel">
        <div class="submenu-title">土地分區規劃</div>

        <!-- 住宅區卡片 (預設綠色) -->
        <div class="build-item-card zoning-card residential-card selected green-card">
          <div class="build-item-icon" style="background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.35);">
            <!-- 住宅區房屋圖標 (綠色) -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div class="build-item-details">
            <span class="build-item-name" style="color: #4ade80;">低密度住宅區</span>
            <div class="build-item-meta">
              <span>點選或拖曳劃分 · 綠色</span>
            </div>
          </div>
        </div>

        <!-- 清除分區卡片 -->
        <div class="build-item-card zoning-card dezone-card">
          <div class="build-item-icon" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.35);">
            <!-- 清除橡皮擦圖標 -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z"/>
              <line x1="18" y1="13" x2="11" y2="20"/>
            </svg>
          </div>
          <div class="build-item-details">
            <span class="build-item-name">清除分區</span>
            <div class="build-item-meta">
              <span>右鍵或點此塗抹清除</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 道路分類子選單 -->
      <div class="build-submenu-panel road-submenu-panel">
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="3" fill="#22252a" stroke="#475569" stroke-width="1.2"/>
              <rect x="2" y="2" width="4" height="20" fill="#94a3b8"/>
              <rect x="18" y="2" width="4" height="20" fill="#94a3b8"/>
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

      <!-- 3. 下方主分類導航列：左側為土地劃分，右移一點為道路建造 -->
      <div class="category-toolbar">
        <!-- 土地劃分功能按鈕 (位於最左邊) -->
        <button class="category-btn zoning-category-btn">
          <!-- 土地分區圖標 (四格分區網格) -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
        </button>

        <!-- 道路建造按鈕 (往右移一點) -->
        <button class="category-btn road-category-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19L8 5M20 19L16 5"/>
            <line x1="12" y1="7" x2="12" y2="9"/>
            <line x1="12" y1="13" x2="12" y2="15"/>
          </svg>
        </button>
      </div>
    `;

    this.zoningCategoryBtn = this.container.querySelector('.zoning-category-btn') as HTMLButtonElement;
    this.roadCategoryBtn = this.container.querySelector('.road-category-btn') as HTMLButtonElement;

    this.zoningSubMenuPanel = this.container.querySelector('.zoning-submenu-panel') as HTMLDivElement;
    this.residentialCard = this.container.querySelector('.residential-card') as HTMLDivElement;
    this.dezoneCard = this.container.querySelector('.dezone-card') as HTMLDivElement;

    this.roadSubMenuPanel = this.container.querySelector('.road-submenu-panel') as HTMLDivElement;
    this.twoLaneCard = this.container.querySelector('.two-lane-road') as HTMLDivElement;
    this.roadSpecCard = this.container.querySelector('.road-spec-card') as HTMLDivElement;

    this.instructionPill = this.container.querySelector('.build-instruction-pill') as HTMLDivElement;
    this.instructionBadgeSpan = this.instructionPill.querySelector('.pill-badge') as HTMLSpanElement;
    this.instructionTextSpan = this.instructionPill.querySelector('.pill-text') as HTMLSpanElement;
  }

  private bindEvents(): void {
    // 阻止點擊選單穿透至 3D 視角控制
    this.container.addEventListener('mousedown', (e) => e.stopPropagation());
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('click', (e) => e.stopPropagation());

    // 1. 點擊「土地劃分」分類按鈕
    this.zoningCategoryBtn.addEventListener('click', () => {
      this.isZoningMenuOpen = !this.isZoningMenuOpen;
      if (this.isZoningMenuOpen) {
        // 互斥：關閉道路選單
        this.closeRoadTool();
        this.openZoningTool('Residential');
      } else {
        this.closeZoningTool();
      }
    });

    // 2. 點擊「住宅區」分區卡片
    this.residentialCard.addEventListener('click', () => {
      this.setZoningMode('Residential');
    });

    // 3. 點擊「清除劃分」卡片
    this.dezoneCard.addEventListener('click', () => {
      this.setZoningMode('Dezone');
    });

    // 4. 點擊「道路建造」分類按鈕
    this.roadCategoryBtn.addEventListener('click', () => {
      this.isRoadMenuOpen = !this.isRoadMenuOpen;
      if (this.isRoadMenuOpen) {
        // 互斥：關閉土地劃分
        this.closeZoningTool();
        this.updateRoadMenuUI();
      } else {
        this.closeRoadTool();
      }
    });

    // 5. 道路規格說明懸浮
    this.twoLaneCard.addEventListener('mouseenter', () => {
      this.roadSpecCard.classList.add('visible');
    });

    this.twoLaneCard.addEventListener('mouseleave', () => {
      this.roadSpecCard.classList.remove('visible');
    });

    // 6. 點擊「雙向二線道」卡片
    this.twoLaneCard.addEventListener('click', () => {
      if (this.isTwoLaneSelected) {
        this.deselectRoadTool();
      } else {
        this.selectRoadTool();
      }
    });

    // 7. 訂閱 RoadManager 建造預覽
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

    // 8. 鍵盤 ESC
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.isTwoLaneSelected) {
          this.deselectRoadTool();
        } else if (this.isZoningMenuOpen) {
          this.closeZoningTool();
        }
      }
    });

    // 9. 滑鼠右鍵取消建造狀態
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

  // --- 土地劃分控制邏輯 ---

  private openZoningTool(mode: 'Residential' | 'Dezone'): void {
    this.isZoningMenuOpen = true;
    this.currentZoningMode = mode;
    this.zoningManager.setToolActive(true, mode);
    this.updateZoningUI();
  }

  private closeZoningTool(): void {
    this.isZoningMenuOpen = false;
    this.zoningManager.setToolActive(false);
    this.updateZoningUI();
  }

  private setZoningMode(mode: 'Residential' | 'Dezone'): void {
    this.currentZoningMode = mode;
    this.zoningManager.setZoneMode(mode);
    this.updateZoningUI();
  }

  private updateZoningUI(): void {
    if (this.isZoningMenuOpen) {
      this.zoningCategoryBtn.classList.add('active', 'green-btn');
      this.zoningSubMenuPanel.classList.add('open');
      this.instructionPill.classList.add('active');

      if (this.currentZoningMode === 'Residential') {
        this.residentialCard.classList.add('selected', 'green-card');
        this.dezoneCard.classList.remove('selected');
        this.instructionBadgeSpan.className = 'pill-badge green';
        this.instructionBadgeSpan.textContent = '住宅區劃分';
        this.instructionTextSpan.textContent =
          '滑鼠左鍵點選或拖曳指派【綠色住宅區】 · 右鍵塗抹清除 · ESC 退出';
      } else {
        this.residentialCard.classList.remove('selected', 'green-card');
        this.dezoneCard.classList.add('selected');
        this.instructionBadgeSpan.className = 'pill-badge red';
        this.instructionBadgeSpan.textContent = '清除分區';
        this.instructionTextSpan.textContent =
          '滑鼠左鍵或右鍵塗抹清除土地分區 · ESC 退出';
      }
    } else {
      this.zoningCategoryBtn.classList.remove('active', 'green-btn');
      this.zoningSubMenuPanel.classList.remove('open');
      if (!this.isTwoLaneSelected) {
        this.instructionPill.classList.remove('active');
      }
    }
  }

  // --- 道路建造控制邏輯 ---

  private selectRoadTool(): void {
    this.isTwoLaneSelected = true;
    this.roadManager.setToolActive(true);
    this.updateRoadMenuUI();
  }

  private deselectRoadTool(): void {
    this.isTwoLaneSelected = false;
    this.roadManager.setToolActive(false);
    this.updateRoadMenuUI();
  }

  private closeRoadTool(): void {
    this.isRoadMenuOpen = false;
    this.roadSpecCard.classList.remove('visible');
    this.deselectRoadTool();
  }

  private updateRoadMenuUI(): void {
    // 道路分類按鈕
    if (this.isRoadMenuOpen) {
      this.roadCategoryBtn.classList.add('active');
      this.roadSubMenuPanel.classList.add('open');
    } else {
      this.roadCategoryBtn.classList.remove('active');
      this.roadSubMenuPanel.classList.remove('open');
    }

    // 車道卡片選中狀態
    if (this.isTwoLaneSelected) {
      this.twoLaneCard.classList.add('selected');
      this.instructionPill.classList.add('active');
      this.instructionBadgeSpan.className = 'pill-badge';
      this.instructionBadgeSpan.textContent = '雙向車道';
      this.instructionTextSpan.textContent =
        '滑鼠左鍵點擊或拖曳鋪設（自動吸附網格） · 右鍵或 ESC 取消';
    } else {
      this.twoLaneCard.classList.remove('selected');
      if (!this.isZoningMenuOpen) {
        this.instructionPill.classList.remove('active');
      }
    }
  }
}
