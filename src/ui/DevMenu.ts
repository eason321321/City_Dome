import * as THREE from 'three';
import { CameraManager } from '../rendering/CameraManager';
import { RoadNetwork, DirectedLane, RoadTile } from '../systems/RoadNetwork';
import { Pathfinding, PathResult } from '../systems/Pathfinding';
import { VehicleManager } from '../simulation/VehicleManager';
import { VehicleModelFactory } from '../rendering/VehicleModelFactory';
import { BuildingModelFactory } from '../rendering/BuildingModelFactory';
import { BuildingManager } from '../systems/BuildingManager';

/**
 * 開發者工具箱 (DevMenu)
 * 位於畫面左上角，支援：
 * 1. 簡潔圖標按鈕（純工具圖標 🛠️，無中文干擾）
 * 2. 多大分類子分頁切換：
 *    - 🚗 車輛道路測試 (A* 最短路徑、起訖點地標、導航光路、號誌停等實測)
 *    - 🏛️ 模型檢視器 (Model Inspector：檢視遊戲中車輛與全部低密度住宅模型 2x2, 2x3, 3x2, 3x3, 4x4)
 *    - 🏡 房屋需求與生成 (檢視當前住房需求、觸發生成、聯外道路進度)
 * 3. 3D 展台旋轉檢視、正面朝向標示與規格卡片
 */
export class DevMenu {
  private domElement: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private cameraManager: CameraManager;
  private roadNetwork: RoadNetwork;
  private vehicleManager: VehicleManager;
  private buildingManager: BuildingManager | null = null;

  // UI 元素
  private toggleButton!: HTMLButtonElement;
  private panelContainer!: HTMLDivElement;

  // 分頁狀態
  private activeTab: 'traffic' | 'modelViewer' | 'housing' = 'traffic';

  // --- 車輛道路測試狀態 ---
  private isTestModeActive: boolean = false;
  private currentStep: 'selectStart' | 'selectEnd' | 'ready' = 'selectStart';
  private selectedStartLane: DirectedLane | null = null;
  private selectedEndLane: DirectedLane | null = null;
  private currentRoute: PathResult | null = null;

  // 車輛測試 3D 視覺物件
  private testVisualGroup: THREE.Group;
  private hoverMarker: THREE.Mesh;
  private startBeacon: THREE.Group | null = null;
  private endBeacon: THREE.Group | null = null;
  private pathLineMesh: THREE.Line | null = null;

  // --- 3D 模型檢視器狀態 ---
  private showroomGroup: THREE.Group;
  private modelHolder: THREE.Group;
  private currentPreviewMesh: THREE.Group | null = null;
  private isAutoRotating: boolean = true;
  private currentModelId: string = 'car';

  // 射線器
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mousePos: THREE.Vector2 = new THREE.Vector2();

  constructor(
    domElement: HTMLElement,
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    cameraManager: CameraManager,
    roadNetwork: RoadNetwork,
    vehicleManager: VehicleManager
  ) {
    this.domElement = domElement;
    this.camera = camera;
    this.scene = scene;
    this.cameraManager = cameraManager;
    this.roadNetwork = roadNetwork;
    this.vehicleManager = vehicleManager;

    // 1. 車輛測試 3D 視覺輔助群組
    this.testVisualGroup = new THREE.Group();
    this.testVisualGroup.name = 'DevTestVisuals';
    this.scene.add(this.testVisualGroup);

    const hoverGeo = new THREE.BoxGeometry(0.5, 0.02, 1.8);
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      depthTest: true,
    });
    this.hoverMarker = new THREE.Mesh(hoverGeo, hoverMat);
    this.hoverMarker.visible = false;
    this.testVisualGroup.add(this.hoverMarker);

    // 2. 3D 模型展台檢視群組
    this.showroomGroup = new THREE.Group();
    this.showroomGroup.name = 'DevModelShowroom';
    this.showroomGroup.visible = false;
    this.scene.add(this.showroomGroup);

    this.modelHolder = new THREE.Group();
    this.showroomGroup.add(this.modelHolder);

    this.buildShowroomPedestal();

    this.createUI();
    this.bindEvents();
  }

  /**
   * 建立 3D 展台底座與正面朝向標示指示環
   */
  private buildShowroomPedestal(): void {
    // 圓形金屬展台底座 (直徑 5m)
    const baseGeo = new THREE.CylinderGeometry(2.6, 2.7, 0.08, 36);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.25,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.04;
    baseMesh.receiveShadow = true;
    this.showroomGroup.add(baseMesh);

    // 外圈發光水藍色霓虹導光環
    const ringGeo = new THREE.RingGeometry(2.62, 2.68, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.082;
    this.showroomGroup.add(ring);

    // 正面朝向標示標籤 (正面 +Z 側，朝向馬路)
    const arrowGroup = new THREE.Group();
    arrowGroup.position.set(0, 0.085, 2.0);

    const arrowHeadGeo = new THREE.ConeGeometry(0.18, 0.35, 16);
    arrowHeadGeo.rotateX(-Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const arrowHead = new THREE.Mesh(arrowHeadGeo, arrowMat);
    arrowHead.position.z = 0.2;
    arrowGroup.add(arrowHead);

    const arrowShaftGeo = new THREE.BoxGeometry(0.08, 0.02, 0.3);
    const arrowShaft = new THREE.Mesh(arrowShaftGeo, arrowMat);
    arrowGroup.add(arrowShaft);

    this.showroomGroup.add(arrowGroup);

    // 展台上方柔和聚焦投射光
    const spotLight = new THREE.DirectionalLight(0xffffff, 1.2);
    spotLight.position.set(5, 10, 5);
    this.showroomGroup.add(spotLight);
  }

  private createUI(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* 左上角純圖標按鈕（無中文） */
      .dev-menu-btn {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 100;
        width: 38px;
        height: 38px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
      }
      .dev-menu-btn:hover {
        background: rgba(30, 41, 59, 0.95);
        border-color: rgba(56, 189, 248, 0.5);
        transform: translateY(-1px) scale(1.04);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5), 0 0 12px rgba(56, 189, 248, 0.2);
      }

      /* 抽屜式面板 */
      .dev-menu-panel {
        position: fixed;
        top: 64px;
        left: 16px;
        width: 340px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        color: #f8fafc;
        font-family: system-ui, -apple-system, sans-serif;
        z-index: 100;
        display: none;
        flex-direction: column;
        overflow: hidden;
        user-select: none;
        animation: devSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes devSlideIn {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .dev-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: rgba(30, 41, 59, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .dev-panel-header h3 {
        margin: 0;
        font-size: 13.5px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #f1f5f9;
      }
      .dev-panel-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
      }
      .dev-panel-close:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.1);
      }

      /* 子分頁導航列 */
      .dev-tabs-bar {
        display: flex;
        padding: 6px 10px;
        gap: 6px;
        background: rgba(15, 23, 42, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .dev-tab-btn {
        flex: 1;
        padding: 7px 10px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.15s ease;
      }
      .dev-tab-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #f8fafc;
      }
      .dev-tab-btn.active {
        background: rgba(2, 132, 199, 0.25);
        border-color: #38bdf8;
        color: #38bdf8;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
      }

      .dev-panel-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 480px;
        overflow-y: auto;
      }

      /* 內容卡片 */
      .dev-tool-card {
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dev-tool-title {
        font-size: 12.5px;
        font-weight: 600;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dev-tool-desc {
        font-size: 11.5px;
        color: #94a3b8;
        line-height: 1.4;
      }

      .dev-status-box {
        background: rgba(15, 23, 42, 0.6);
        border-radius: 6px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 11.5px;
        border: 1px solid rgba(255, 255, 255, 0.04);
      }
      .dev-status-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .dev-status-label { color: #94a3b8; }
      .dev-status-val { font-weight: 600; color: #f8fafc; }

      .dev-btn-row {
        display: flex;
        gap: 8px;
      }
      .dev-action-btn {
        flex: 1;
        background: #0284c7;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        transition: all 0.15s ease;
      }
      .dev-action-btn:hover:not(:disabled) {
        background: #0369a1;
        transform: translateY(-1px);
      }
      .dev-action-btn:disabled {
        background: rgba(51, 65, 85, 0.5);
        color: #64748b;
        cursor: not-allowed;
      }
      .dev-action-btn.secondary {
        background: rgba(51, 65, 85, 0.6);
        color: #e2e8f0;
      }
      .dev-action-btn.secondary:hover:not(:disabled) {
        background: rgba(71, 85, 105, 0.8);
      }
      .dev-action-btn.active {
        background: #16a34a;
      }

      /* 模型檢視器項目列表 */
      .model-list-select {
        width: 100%;
        padding: 7px 10px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        color: #f8fafc;
        font-size: 12px;
        outline: none;
      }
      .model-list-select option {
        background: #0f172a;
        color: #f8fafc;
      }

      .model-spec-badge {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 4px;
        font-size: 10.5px;
        font-weight: 700;
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
      }
    `;
    document.head.appendChild(style);

    // 1. 左上角純圖標按鈕（移除所有中文，僅留 🛠️ 圖標）
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'dev-menu-btn';
    this.toggleButton.title = '開發者工具箱 (Dev Tools)';
    this.toggleButton.innerHTML = `🛠️`;
    document.body.appendChild(this.toggleButton);

    // 2. 建立浮動面板
    this.panelContainer = document.createElement('div');
    this.panelContainer.className = 'dev-menu-panel';
    this.panelContainer.innerHTML = `
      <div class="dev-panel-header">
        <h3>🛠️ 開發者工具箱</h3>
        <button class="dev-panel-close" id="dev-close-btn">✕</button>
      </div>

      <!-- 子功能切換分頁 -->
      <div class="dev-tabs-bar">
        <button class="dev-tab-btn active" id="tab-traffic-btn">🚗 車輛測試</button>
        <button class="dev-tab-btn" id="tab-models-btn">🏛️ 檢視模型</button>
        <button class="dev-tab-btn" id="tab-housing-btn">🏡 房屋需求</button>
      </div>

      <div class="dev-panel-body">
        <!-- 分頁 1：車輛道路測試 -->
        <div id="dev-section-traffic">
          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>車輛尋路與號誌遵守測試</span>
              <span id="dev-test-badge" style="font-size: 10px; color: #94a3b8;">待命中</span>
            </div>
            <div class="dev-tool-desc">
              在車道上點選起點與終點，車輛將以 A* 最短路徑出發行駛，並嚴格遵守路口號誌。
            </div>

            <button class="dev-action-btn" id="dev-toggle-test-btn">
              🎯 開啟道路選點模式
            </button>

            <div class="dev-status-box">
              <div class="dev-status-row">
                <span class="dev-status-label">步驟提示:</span>
                <span class="dev-status-val" id="dev-step-hint" style="color: #38bdf8;">點選上方開啟測試</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">出發起點:</span>
                <span class="dev-status-val" id="dev-start-lane">未設定</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">抵達終點:</span>
                <span class="dev-status-val" id="dev-end-lane">未設定</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">路徑狀態:</span>
                <span class="dev-status-val" id="dev-route-status">未規劃</span>
              </div>
            </div>

            <div class="dev-btn-row">
              <button class="dev-action-btn" id="dev-spawn-car-btn" disabled>
                🚀 發車實測
              </button>
              <button class="dev-action-btn secondary" id="dev-reset-btn">
                🔄 重設起訖
              </button>
            </div>
            <button class="dev-action-btn secondary" id="dev-clear-cars-btn" style="width: 100%;">
              🗑️ 清除所有測試車輛
            </button>
          </div>
        </div>

        <!-- 分頁 2：模型檢視器 -->
        <div id="dev-section-models" style="display: none; flex-direction: column; gap: 10px;">
          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>3D 模型庫檢視器</span>
              <span class="model-spec-badge">低多邊形</span>
            </div>
            <div class="dev-tool-desc">
              檢視遊戲內所有已建立的 3D 車輛與低密度住宅模型，支援 360° 旋轉與正面朝向標示。
            </div>

            <select class="model-list-select" id="dev-model-select">
              <optgroup label="交通載具">
                <option value="car">🚗 現代自用轎車 (Passenger Vehicle)</option>
              </optgroup>
              <optgroup label="低密度住宅模型 (正面朝向 +Z 馬路)">
                <option value="Residential_2x2">🏡 低密度住宅 2x2 (2 人 / Two People)</option>
                <option value="Residential_2x3">🏡 低密度住宅 2x3 (2 人 / 窄面寬深庭)</option>
                <option value="Residential_3x2">🏡 低密度住宅 3x2 (2 人 / 寬面寬淺進)</option>
                <option value="Residential_3x3">🏡 低密度住宅 3x3 (3 人 / 3p 雙層別墅)</option>
                <option value="Residential_4x4">🏡 低密度住宅 4x4 (4 人 / 4p 豪華莊園)</option>
              </optgroup>
            </select>

            <div class="dev-status-box" id="dev-model-spec-box">
              <!-- 動態填入模型規格說明 -->
            </div>

            <div class="dev-btn-row">
              <button class="dev-action-btn secondary" id="dev-rotate-toggle-btn">
                🔄 停止旋轉
              </button>
              <button class="dev-action-btn secondary" id="dev-reset-view-btn">
                📐 正面視角
              </button>
            </div>
          </div>
        </div>

        <!-- 分頁 3：房屋需求與生成測試 -->
        <div id="dev-section-housing" style="display: none; flex-direction: column; gap: 10px;">
          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>住房需求與配對起建</span>
              <span id="dev-housing-badge" style="font-size: 10px; color: #4ade80;">待命中</span>
            </div>
            <div class="dev-tool-desc">
              產生需求後檢驗「正面貼合道路」與「有道路連通至外部公路」，若配對成功則起建房屋（完工後市民自公路開車遷入）；若不滿足則配對失敗並流失需求。
            </div>

            <div class="dev-status-box">
              <div class="dev-status-row">
                <span class="dev-status-label">外部邊界公路:</span>
                <span class="dev-status-val" style="color: #4ade80;">南界 Z=97 (西界 ↔ 東界 雙向行駛)</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">已建房屋總數:</span>
                <span class="dev-status-val" id="dev-housing-count-val">0 棟</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">全市市民人數:</span>
                <span class="dev-status-val" id="dev-housing-pop-val" style="color: #38bdf8;">0 人</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">需求統計:</span>
                <span class="dev-status-val" id="dev-demand-stats-val" style="font-size: 11px;">成功 0 / 流失 0</span>
              </div>
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08);">
                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 2px;">最新配對反饋:</div>
                <div id="dev-matching-status-val" style="font-size: 11.5px; color: #cbd5e1; font-weight: 500;">
                  尚未產生需求 (點選下方按鈕測試)
                </div>
              </div>
            </div>

            <div style="color: #cbd5e1; font-size: 11px; font-weight: 600; margin-top: 2px;">新增住房需求 (依人數自動適配房型):</div>
            <div style="display: flex; gap: 6px;">
              <button class="dev-action-btn" id="dev-demand-1-btn" style="flex: 1; font-size: 11.5px; padding: 7px 4px;">
                ➕ 1 人需求
              </button>
              <button class="dev-action-btn" id="dev-demand-2-btn" style="flex: 1; font-size: 11.5px; padding: 7px 4px;">
                ➕ 2 人需求
              </button>
              <button class="dev-action-btn" id="dev-demand-3-btn" style="flex: 1; font-size: 11.5px; padding: 7px 4px;">
                ➕ 3 人需求
              </button>
            </div>
          </div>

          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>全市已建房屋清單</span>
            </div>
            <div id="dev-housing-list" style="font-size: 11px; color: #94a3b8; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
              暫無已建房屋
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.panelContainer);

    this.panelContainer.addEventListener('mousedown', (e) => e.stopPropagation());
    this.toggleButton.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  private bindEvents(): void {
    // 1. 開關面板
    this.toggleButton.addEventListener('click', () => {
      const isOpen = this.panelContainer.style.display === 'flex';
      this.panelContainer.style.display = isOpen ? 'none' : 'flex';
      if (!isOpen && this.activeTab === 'modelViewer') {
        this.openModelViewer();
      } else if (isOpen) {
        this.closeModelViewer();
      }
    });

    const closeBtn = this.panelContainer.querySelector('#dev-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.panelContainer.style.display = 'none';
        this.closeModelViewer();
      });
    }

    // 2. 分頁切換
    const tabTrafficBtn = this.panelContainer.querySelector('#tab-traffic-btn') as HTMLButtonElement;
    const tabModelsBtn = this.panelContainer.querySelector('#tab-models-btn') as HTMLButtonElement;
    const tabHousingBtn = this.panelContainer.querySelector('#tab-housing-btn') as HTMLButtonElement;
    const secTraffic = this.panelContainer.querySelector('#dev-section-traffic') as HTMLDivElement;
    const secModels = this.panelContainer.querySelector('#dev-section-models') as HTMLDivElement;
    const secHousing = this.panelContainer.querySelector('#dev-section-housing') as HTMLDivElement;

    tabTrafficBtn.addEventListener('click', () => {
      this.activeTab = 'traffic';
      tabTrafficBtn.classList.add('active');
      tabModelsBtn.classList.remove('active');
      tabHousingBtn.classList.remove('active');
      secTraffic.style.display = 'block';
      secModels.style.display = 'none';
      secHousing.style.display = 'none';
      this.closeModelViewer();
    });

    tabModelsBtn.addEventListener('click', () => {
      this.activeTab = 'modelViewer';
      tabModelsBtn.classList.add('active');
      tabTrafficBtn.classList.remove('active');
      tabHousingBtn.classList.remove('active');
      secTraffic.style.display = 'none';
      secModels.style.display = 'flex';
      secHousing.style.display = 'none';

      // 關閉車輛選點模式
      if (this.isTestModeActive) {
        this.setTestModeActive(false);
      }
      this.openModelViewer();
    });

    tabHousingBtn.addEventListener('click', () => {
      this.activeTab = 'housing';
      tabHousingBtn.classList.add('active');
      tabTrafficBtn.classList.remove('active');
      tabModelsBtn.classList.remove('active');
      secTraffic.style.display = 'none';
      secModels.style.display = 'none';
      secHousing.style.display = 'flex';

      if (this.isTestModeActive) {
        this.setTestModeActive(false);
      }
      this.closeModelViewer();
      this.updateHousingUI();
    });

    // 房屋需求按鈕綁定 (支援 1 人、2 人、3 人住房需求，依人數排除不足房型)
    const demand1Btn = this.panelContainer.querySelector('#dev-demand-1-btn');
    if (demand1Btn) {
      demand1Btn.addEventListener('click', () => {
        this.buildingManager?.requestHousingDemand(1);
        this.updateHousingUI();
      });
    }

    const demand2Btn = this.panelContainer.querySelector('#dev-demand-2-btn');
    if (demand2Btn) {
      demand2Btn.addEventListener('click', () => {
        this.buildingManager?.requestHousingDemand(2);
        this.updateHousingUI();
      });
    }

    const demand3Btn = this.panelContainer.querySelector('#dev-demand-3-btn');
    if (demand3Btn) {
      demand3Btn.addEventListener('click', () => {
        this.buildingManager?.requestHousingDemand(3);
        this.updateHousingUI();
      });
    }

    // 3. 模型下拉選單切換
    const modelSelect = this.panelContainer.querySelector('#dev-model-select') as HTMLSelectElement;
    modelSelect.addEventListener('change', () => {
      this.currentModelId = modelSelect.value;
      this.switchInspectedModel(this.currentModelId);
    });

    // 4. 展台旋轉控制
    const rotBtn = this.panelContainer.querySelector('#dev-rotate-toggle-btn') as HTMLButtonElement;
    rotBtn.addEventListener('click', () => {
      this.isAutoRotating = !this.isAutoRotating;
      rotBtn.textContent = this.isAutoRotating ? '🔄 停止旋轉' : '▶️ 自動旋轉';
    });

    const resetViewBtn = this.panelContainer.querySelector('#dev-reset-view-btn') as HTMLButtonElement;
    resetViewBtn.addEventListener('click', () => {
      this.modelHolder.rotation.y = 0; // 重設為正面面向 +Z
    });

    // --- 車輛測試相關按鈕綁定 ---
    const toggleTestBtn = this.panelContainer.querySelector('#dev-toggle-test-btn') as HTMLButtonElement;
    toggleTestBtn.addEventListener('click', () => {
      this.setTestModeActive(!this.isTestModeActive);
    });

    const spawnBtn = this.panelContainer.querySelector('#dev-spawn-car-btn') as HTMLButtonElement;
    spawnBtn.addEventListener('click', () => {
      if (this.currentRoute) {
        this.vehicleManager.spawnTestVehicle(this.currentRoute);
      }
    });

    const resetBtn = this.panelContainer.querySelector('#dev-reset-btn') as HTMLButtonElement;
    resetBtn.addEventListener('click', () => {
      this.resetPoints();
    });

    const clearBtn = this.panelContainer.querySelector('#dev-clear-cars-btn') as HTMLButtonElement;
    clearBtn.addEventListener('click', () => {
      this.vehicleManager.clearAllVehicles();
    });

    // 3D 視圖射線監聽
    this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
  }

  // ==========================================
  // 模型檢視器實作邏輯 (Model Inspector)
  // ==========================================

  private openModelViewer(): void {
    this.showroomGroup.visible = true;
    this.switchInspectedModel(this.currentModelId);
  }

  private closeModelViewer(): void {
    this.showroomGroup.visible = false;
  }

  private switchInspectedModel(modelId: string): void {
    // 移除當前預覽物件
    if (this.currentPreviewMesh) {
      this.modelHolder.remove(this.currentPreviewMesh);
      this.currentPreviewMesh = null;
    }

    const specBox = this.panelContainer.querySelector('#dev-model-spec-box') as HTMLDivElement;
    this.modelHolder.rotation.y = 0; // 預設歸零面向 +Z

    if (modelId === 'car') {
      const car = VehicleModelFactory.createVehicle(0xdc2626);
      car.position.set(0, 0.08, 0);
      this.currentPreviewMesh = car;
      this.modelHolder.add(car);

      specBox.innerHTML = `
        <div class="dev-status-row">
          <span class="dev-status-label">名稱:</span>
          <span class="dev-status-val" style="color: #38bdf8;">現代自用轎車 (0.9x 縮放)</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">規格尺寸:</span>
          <span class="dev-status-val">寬 0.396m × 長 0.738m × 高 0.315m</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">車道居中:</span>
          <span class="dev-status-val" style="color: #4ade80;">行駛偏移 LANE_OFFSET = 0.325m</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">車頭大燈:</span>
          <span class="dev-status-val">自發光白光 (面向 +Z 軸前進)</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">車尾煞車:</span>
          <span class="dev-status-val" style="color: #ef4444;">自發光晶亮紅光 (位於 -Z 軸)</span>
        </div>
      `;
    } else {
      const buildingMesh = BuildingModelFactory.createBuildingById(modelId);
      if (buildingMesh) {
        buildingMesh.position.set(0, 0.08, 0);
        this.currentPreviewMesh = buildingMesh;
        this.modelHolder.add(buildingMesh);
      }

      const catalog = BuildingModelFactory.getModelsCatalog();
      const meta = catalog.find((m) => m.id === modelId);

      if (meta) {
        const featureItems = meta.features
          .map((f) => `<div style="color: #cbd5e1;">· ${f}</div>`)
          .join('');

        specBox.innerHTML = `
          <div class="dev-status-row">
            <span class="dev-status-label">名稱:</span>
            <span class="dev-status-val" style="color: #4ade80;">${meta.name}</span>
          </div>
          <div class="dev-status-row">
            <span class="dev-status-label">地塊佔地:</span>
            <span class="dev-status-val">面寬 ${meta.frontageWidth}m × 縱深 ${meta.lotDepth}m</span>
          </div>
          <div class="dev-status-row">
            <span class="dev-status-label">居住人口:</span>
            <span class="dev-status-val" style="color: #fbbf24; font-size: 13px;">${meta.capacity} 人 (Capacity)</span>
          </div>
          <div class="dev-status-row">
            <span class="dev-status-label">正面朝向:</span>
            <span class="dev-status-val" style="color: #22c55e;">正門面向 +Z 軸（面朝馬路）</span>
          </div>
          <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px;">
            ${featureItems}
          </div>
        `;
      }
    }
  }

  public setBuildingManager(bm: BuildingManager): void {
    this.buildingManager = bm;
  }

  public updateHousingUI(): void {
    if (!this.buildingManager) return;
    const countVal = this.panelContainer.querySelector('#dev-housing-count-val');
    const popVal = this.panelContainer.querySelector('#dev-housing-pop-val');
    const statsVal = this.panelContainer.querySelector('#dev-demand-stats-val');
    const matchStatusVal = this.panelContainer.querySelector('#dev-matching-status-val');
    const listElem = this.panelContainer.querySelector('#dev-housing-list');

    const buildings = this.buildingManager.getAllBuildings();
    if (countVal) countVal.textContent = `${buildings.length} 棟`;
    if (popVal) popVal.textContent = `${this.buildingManager.getTotalPopulation()} 人`;

    const stats = this.buildingManager.getDemandStats();
    if (statsVal) {
      statsVal.innerHTML = `<span style="color: #4ade80;">成功 ${stats.matched}</span> / <span style="color: #ef4444;">流失 ${stats.lost}</span>`;
    }

    const lastResult = this.buildingManager.getLatestMatchingResult();
    if (matchStatusVal) {
      if (!lastResult) {
        matchStatusVal.innerHTML = '<span style="color: #94a3b8;">尚未產生需求 (點選下方按鈕測試)</span>';
      } else if (lastResult.success) {
        matchStatusVal.innerHTML = `
          <div style="color: #4ade80;">✅ 配對成功！起建 [${lastResult.buildingName}] (${lastResult.peopleCount} 人戶)</div>
          <div style="font-size: 10.5px; color: #94a3b8;">已開始蓋房子，完工後市民將自邊界公路開車遷入。</div>
        `;
      } else {
        matchStatusVal.innerHTML = `
          <div style="color: #ef4444;">❌ 配對失敗！流失 ${lastResult.peopleCount} 人住房需求</div>
          <div style="font-size: 10.5px; color: #fca5a5;">原因: ${lastResult.reason}</div>
        `;
      }
    }

    if (listElem) {
      if (buildings.length === 0) {
        listElem.innerHTML = '暫無已建房屋';
      } else {
        listElem.innerHTML = buildings
          .map((b) => {
            const st = b.status === 'constructing'
              ? `<span style="color: #fbbf24;">建造中 (${Math.floor(b.constructionProgress * 100)}%)</span>`
              : `<span style="color: #4ade80;">入住 ${b.currentOccupants}/${b.registeredResidents}人</span>`;
            return `
              <div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                <span style="color: #f1f5f9;">${b.metadata.name} (${b.lot.frontageWidth}x${b.lot.lotDepth})</span>
                ${st}
              </div>
            `;
          })
          .join('');
      }
    }
  }

  /**
   * 每幀更新：驅動模型檢視展台之自動慢速 360° 旋轉與房屋需求資訊即時刷新
   */
  public update(deltaTime: number): void {
    if (this.showroomGroup.visible && this.isAutoRotating) {
      this.modelHolder.rotation.y += 0.5 * deltaTime;
    }
    if (this.panelContainer.style.display === 'flex' && this.activeTab === 'housing') {
      this.updateHousingUI();
    }
  }

  // ==========================================
  // 車輛道路測試實作邏輯 (Traffic Test)
  // ==========================================

  private setTestModeActive(active: boolean): void {
    this.isTestModeActive = active;
    const toggleTestBtn = this.panelContainer.querySelector('#dev-toggle-test-btn') as HTMLButtonElement;
    const badge = this.panelContainer.querySelector('#dev-test-badge') as HTMLElement;

    if (active) {
      toggleTestBtn.classList.add('active');
      toggleTestBtn.textContent = '🛑 退出選點測試';
      badge.textContent = '選點進行中';
      badge.style.color = '#4ade80';
      this.cameraManager.setLeftDragEnabled(false);
      this.currentStep = 'selectStart';
      this.updateUIStatus();
    } else {
      toggleTestBtn.classList.remove('active');
      toggleTestBtn.textContent = '🎯 開啟道路選點模式';
      badge.textContent = '待命中';
      badge.style.color = '#94a3b8';
      this.hoverMarker.visible = false;
      this.cameraManager.setLeftDragEnabled(true);
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isTestModeActive) return;

    this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mousePos, this.camera);
    const hoveredLane = this.pickLaneUnderMouse();

    if (hoveredLane) {
      this.hoverMarker.visible = true;
      this.hoverMarker.position.copy(hoveredLane.centerPoint);
      this.hoverMarker.position.y += 0.01;

      if (hoveredLane.direction === 'N' || hoveredLane.direction === 'S') {
        this.hoverMarker.rotation.y = 0;
      } else {
        this.hoverMarker.rotation.y = Math.PI / 2;
      }
    } else {
      this.hoverMarker.visible = false;
    }
  }

  private onPointerDown(e: MouseEvent): void {
    if (!this.isTestModeActive || e.button !== 0) return;

    const clickedLane = this.pickLaneUnderMouse();
    if (!clickedLane) return;

    if (this.currentStep === 'selectStart') {
      this.selectedStartLane = clickedLane;
      this.createBeacon('start', clickedLane.entryPoint);
      this.currentStep = 'selectEnd';
      this.updateUIStatus();
    } else if (this.currentStep === 'selectEnd') {
      this.selectedEndLane = clickedLane;
      this.createBeacon('end', clickedLane.exitPoint);
      this.currentStep = 'ready';
      this.calculateRouteAndSpawn();
    } else if (this.currentStep === 'ready') {
      this.resetPoints();
      this.selectedStartLane = clickedLane;
      this.createBeacon('start', clickedLane.entryPoint);
      this.currentStep = 'selectEnd';
      this.updateUIStatus();
    }
  }

  private pickLaneUnderMouse(): DirectedLane | null {
    const tiles: RoadTile[] = Array.from(this.roadNetwork.getAllTiles());
    if (tiles.length === 0) return null;

    const meshes = tiles.map((t) => t.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const hitPoint = hit.point;

      const tile = tiles.find((t) => t.mesh === hit.object);
      if (tile && tile.lanes.length > 0) {
        let closestLane: DirectedLane | null = null;
        let minDist = Infinity;

        for (const lane of tile.lanes) {
          const dist = lane.centerPoint.distanceTo(hitPoint);
          if (dist < minDist) {
            minDist = dist;
            closestLane = lane;
          }
        }
        return closestLane;
      }
    }

    return null;
  }

  private calculateRouteAndSpawn(): void {
    if (!this.selectedStartLane || !this.selectedEndLane) return;

    const allLanes = this.roadNetwork.getAllLanes();
    const route = Pathfinding.findShortestPath(
      this.selectedStartLane.id,
      this.selectedEndLane.id,
      allLanes
    );

    this.currentRoute = route;

    if (route) {
      this.drawRoutePath(route.waypoints);
      this.vehicleManager.spawnTestVehicle(route);
    } else {
      this.clearRoutePath();
    }

    this.updateUIStatus();
  }

  private createBeacon(type: 'start' | 'end', pos: THREE.Vector3): void {
    if (type === 'start') {
      if (this.startBeacon) this.testVisualGroup.remove(this.startBeacon);
      this.startBeacon = this.buildBeaconGroup(0x22c55e, '🏁');
      this.startBeacon.position.copy(pos);
      this.testVisualGroup.add(this.startBeacon);
    } else {
      if (this.endBeacon) this.testVisualGroup.remove(this.endBeacon);
      this.endBeacon = this.buildBeaconGroup(0xef4444, '🎯');
      this.endBeacon.position.copy(pos);
      this.testVisualGroup.add(this.endBeacon);
    }
  }

  private buildBeaconGroup(color: number, _icon: string): THREE.Group {
    const group = new THREE.Group();

    const ringGeo = new THREE.RingGeometry(0.18, 0.32, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.8,
      roughness: 0.2,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 0.45;
    group.add(pole);

    const topGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const topMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.5,
    });
    const topSphere = new THREE.Mesh(topGeo, topMat);
    topSphere.position.y = 0.85;
    group.add(topSphere);

    return group;
  }

  private drawRoutePath(waypoints: THREE.Vector3[]): void {
    this.clearRoutePath();

    if (waypoints.length < 2) return;

    const points = waypoints.map((p) => new THREE.Vector3(p.x, p.y + 0.04, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(points);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });

    this.pathLineMesh = new THREE.Line(geo, lineMat);
    this.testVisualGroup.add(this.pathLineMesh);
  }

  private clearRoutePath(): void {
    if (this.pathLineMesh) {
      this.testVisualGroup.remove(this.pathLineMesh);
      this.pathLineMesh.geometry.dispose();
      this.pathLineMesh = null;
    }
  }

  private resetPoints(): void {
    this.selectedStartLane = null;
    this.selectedEndLane = null;
    this.currentRoute = null;
    this.currentStep = 'selectStart';

    if (this.startBeacon) {
      this.testVisualGroup.remove(this.startBeacon);
      this.startBeacon = null;
    }
    if (this.endBeacon) {
      this.testVisualGroup.remove(this.endBeacon);
      this.endBeacon = null;
    }
    this.clearRoutePath();
    this.updateUIStatus();
  }

  private updateUIStatus(): void {
    const stepHint = this.panelContainer.querySelector('#dev-step-hint') as HTMLElement;
    const startVal = this.panelContainer.querySelector('#dev-start-lane') as HTMLElement;
    const endVal = this.panelContainer.querySelector('#dev-end-lane') as HTMLElement;
    const routeVal = this.panelContainer.querySelector('#dev-route-status') as HTMLElement;
    const spawnBtn = this.panelContainer.querySelector('#dev-spawn-car-btn') as HTMLButtonElement;

    if (this.selectedStartLane) {
      startVal.textContent = this.selectedStartLane.id;
      startVal.style.color = '#4ade80';
    } else {
      startVal.textContent = '未設定';
      startVal.style.color = '#94a3b8';
    }

    if (this.selectedEndLane) {
      endVal.textContent = this.selectedEndLane.id;
      endVal.style.color = '#f87171';
    } else {
      endVal.textContent = '未設定';
      endVal.style.color = '#94a3b8';
    }

    if (this.currentRoute) {
      routeVal.textContent = `規劃成功 (${this.currentRoute.totalDistance.toFixed(1)}m)`;
      routeVal.style.color = '#38bdf8';
      spawnBtn.disabled = false;
    } else {
      routeVal.textContent = this.selectedEndLane ? '無可行路徑' : '未規劃';
      routeVal.style.color = '#94a3b8';
      spawnBtn.disabled = true;
    }

    switch (this.currentStep) {
      case 'selectStart':
        stepHint.textContent = '👉 步驟 1: 在車道上點擊【起點】';
        stepHint.style.color = '#4ade80';
        break;
      case 'selectEnd':
        stepHint.textContent = '👉 步驟 2: 在車道上點擊【終點】';
        stepHint.style.color = '#f87171';
        break;
      case 'ready':
        stepHint.textContent = '✅ 已完成起訖規劃，車輛出發！';
        stepHint.style.color = '#38bdf8';
        break;
    }
  }
}
