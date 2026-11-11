import * as THREE from 'three';
import { CameraManager } from '../rendering/CameraManager';
import { RoadNetwork, DirectedLane, RoadTile } from '../systems/RoadNetwork';
import { Pathfinding, PathResult } from '../systems/Pathfinding';
import { VehicleManager } from '../simulation/VehicleManager';
import { VehicleModelFactory } from '../rendering/VehicleModelFactory';
import { BuildingModelFactory } from '../rendering/BuildingModelFactory';
import { BuildingManager } from '../systems/BuildingManager';
import { ParkingManager } from '../simulation/ParkingManager';
import { CitizenModelFactory, CitizenGender } from '../rendering/CitizenModelFactory';
import { RoadMarkingFactory } from '../rendering/RoadMarkingFactory';
import { TimeManager } from '../simulation/TimeManager';

/**
 * 開發者工具箱 (DevMenu)
 * 位於畫面左上角，支援：
 * 1. 簡潔圖標按鈕（純工具圖標 🛠️，無中文干擾）
 * 2. 多大分類子分頁切換：
 *    - 🚗 車輛道路測試 (A* 最短路徑、起訖點地標、導航光路、號誌停等實測)
 *    - 🏛️ 模型檢視器 (Model Inspector：檢視遊戲中車輛、住宅與市民模型)
 *    - 👥 市民造型檢視 (依樣照風格生成的男女基礎款、1:1 車輛比例對照、人行道放置)
 *    - 🏡 房屋需求與生成 (檢視當前住房需求、觸發生成、聯外道路進度)
 *    - 🅿️ 路邊停車工具 (點選道路兩側路緣生成路邊停車、路口禁停檢驗、行車淨距隔離)
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
  private parkingManager: ParkingManager | null = null;
  private timeManager: TimeManager | null = null;

  // UI 元素
  private toggleButton!: HTMLButtonElement;
  private panelContainer!: HTMLDivElement;

  // 分頁狀態
  private activeTab: 'traffic' | 'modelViewer' | 'housing' | 'parking' | 'citizens' = 'traffic';

  // --- 市民放置與測試工具狀態 ---
  private isCitizenModeActive: boolean = false;
  private selectedSpawnGender: 'male' | 'female' | 'random' = 'random';
  private citizenTestGroup: THREE.Group;
  private ghostCitizenMesh: THREE.Group | null = null;

  // --- 路邊停車生成工具狀態 ---
  private isParkingModeActive: boolean = false;
  private ghostCarMesh: THREE.Group | null = null;

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
  private isWalkAnimationActive: boolean = true;
  private isWorldWalkActive: boolean = true;
  private walkAnimTimer: number = 0;

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

    // 3. 市民測試 3D 視覺群組
    this.citizenTestGroup = new THREE.Group();
    this.citizenTestGroup.name = 'DevSpawnedCitizens';
    this.scene.add(this.citizenTestGroup);

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
        width: 360px;
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
        padding: 6px 8px;
        gap: 4px;
        background: rgba(15, 23, 42, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .dev-tab-btn {
        flex: 1;
        padding: 6px 3px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        white-space: nowrap;
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
        <button class="dev-tab-btn active" id="tab-traffic-btn">🚗 車輛</button>
        <button class="dev-tab-btn" id="tab-models-btn">🏛️ 模型</button>
        <button class="dev-tab-btn" id="tab-citizens-btn">👥 市民</button>
        <button class="dev-tab-btn" id="tab-housing-btn">🏡 需求</button>
        <button class="dev-tab-btn" id="tab-parking-btn">🅿️ 停車</button>
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

            <!-- 遊戲模擬速度倍率控制 -->
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
              <div class="dev-tool-title" style="margin-bottom: 4px;">
                <span>⏱️ 遊戲模擬速度 (Game Speed)</span>
                <span class="model-spec-badge" id="dev-speed-badge">0.75x</span>
              </div>
              <div class="dev-tool-desc" style="font-size: 11px; margin-bottom: 8px;">
                調整模擬時間流速。車輛移動、市民走路、房屋建造速度與進度皆嚴格依遊戲虛擬時間等比例推進 (同速度之物體在 1 遊戲小時內位移完全恆定)。
              </div>
              <div class="dev-btn-row">
                <button class="dev-action-btn secondary" id="dev-speed-075-btn">0.75x (慢速)</button>
                <button class="dev-action-btn secondary" id="dev-speed-1-btn">1.0x (標準)</button>
                <button class="dev-action-btn secondary" id="dev-speed-2-btn">2.0x (快速)</button>
                <button class="dev-action-btn secondary" id="dev-speed-3-btn">3.0x (極速)</button>
              </div>
            </div>
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
              <optgroup label="道路標線與路口引導線 (依樣照標準繪製)">
                <option value="road_markings_showcase">🛣️ 路口行車導向標線與轉彎引導線展台 (Road Markings Showcase)</option>
              </optgroup>
              <optgroup label="市民模型 (依樣照風格與比例製作，支援走路動畫)">
                <option value="citizen_walk_showcase">🚶 市民走路步態雙人展台 (Walking Animation Showcase)</option>
                <option value="citizen_lineup">👥 人車比例對照展台 (Citizen & Car Lineup)</option>
                <option value="citizen_male">👨 男性市民 (基礎款 / Casual Male #104)</option>
                <option value="citizen_female">👩 女性市民 (優雅洋裝款 / Chic Dress #110)</option>
                <option value="citizen_trendy_male">😎 潮流墨鏡男 (Polo & Sunglasses #105)</option>
                <option value="citizen_chic_female">👜 俏麗包包女 (Pastel Casual #107)</option>
              </optgroup>
              <optgroup label="低密度住宅模型 (正面朝向 +Z 馬路)">
                <option value="scale_showcase">🏘️ 住宅、市民與車輛 1:1 比例對照展台 (Scale Lineup)</option>
                <option value="Residential_2x2">🏡 低密度住宅 2x2 (2 人 / 經典 L 型別墅)</option>
                <option value="Residential_2x3">🏡 低密度住宅 2x3 (2 人 / 北歐單坡斜頂)</option>
                <option value="Residential_3x2">🏡 低密度住宅 3x2 (2 人 / 西班牙陶瓦雙拱廊)</option>
                <option value="Residential_3x3">🏡 低密度住宅 3x3 (3 人 / 雙層別墅附車道與陽台)</option>
                <option value="Residential_4x4">🏡 低密度住宅 4x4 (4 人 / 包浩斯豪華車庫大宅)</option>
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
              <button class="dev-action-btn secondary active" id="dev-walk-anim-toggle-btn">
                🚶 走路動畫: 開啟中
              </button>
            </div>
          </div>
        </div>

        <!-- 分頁：市民外觀與人車比例對照 -->
        <div id="dev-section-citizens" style="display: none; flex-direction: column; gap: 10px;">
          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>👥 市民造型與比例對照</span>
              <span id="dev-citizen-badge" style="font-size: 10px; color: #94a3b8;">待命中</span>
            </div>
            <div class="dev-tool-desc">
              參考樣照現代 3D 黏土微縮公仔風格（約 6.5 頭身），依據轎車高度 (0.142m) 定案成人身高 (男 0.178m / 女 0.168m)。
            </div>

            <!-- 性別選擇切換按鈕組 -->
            <div style="display: flex; gap: 6px; margin: 4px 0;">
              <button class="dev-action-btn secondary active" id="dev-citizen-gender-random" style="flex: 1; font-size: 11px;">🎲 隨機性別</button>
              <button class="dev-action-btn secondary" id="dev-citizen-gender-male" style="flex: 1; font-size: 11px;">👨 男性</button>
              <button class="dev-action-btn secondary" id="dev-citizen-gender-female" style="flex: 1; font-size: 11px;">👩 女性</button>
            </div>

            <button class="dev-action-btn" id="dev-toggle-citizen-btn">
              🎯 開啟地面/人行道點選放置市民
            </button>

            <div class="dev-status-box">
              <div class="dev-status-row">
                <span class="dev-status-label">工具狀態:</span>
                <span class="dev-status-val" id="dev-citizen-status" style="color: #38bdf8;">點選上方按鈕開啟</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">已放置市民總數:</span>
                <span class="dev-status-val" id="dev-citizen-count-val" style="color: #4ade80;">0 位</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">身高與車輛比:</span>
                <span class="dev-status-val" style="color: #fbbf24;">成人約 1.25x 車高 (頭頂微高於車頂)</span>
              </div>
            </div>

            <div class="dev-btn-row">
              <button class="dev-action-btn secondary" id="dev-lineup-showcase-btn">
                🎪 地圖放置人車對照組
              </button>
              <button class="dev-action-btn secondary" id="dev-scatter-citizens-btn">
                🚶 人行道隨機生成 8 位
              </button>
            </div>
            <div class="dev-btn-row">
              <button class="dev-action-btn secondary active" id="dev-world-walk-toggle-btn" style="flex: 1;">
                🚶 市民全體走路: 開啟
              </button>
              <button class="dev-action-btn secondary" id="dev-clear-citizens-btn" style="flex: 1;">
                🗑️ 清除市民
              </button>
            </div>
          </div>

          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>📐 市民與城市尺度規格</span>
            </div>
            <div style="font-size: 11px; color: #cbd5e1; line-height: 1.6;">
              <div>🧍‍♂️ <b>男性市民</b>：高 0.178m、肩寬 0.068m，休閒衛衣/Polo衫、短褲/長褲、白球鞋</div>
              <div>🧍‍♀️ <b>女性市民</b>：高 0.168m、肩寬 0.058m，優雅洋裝/粉彩套裝、高丸子頭/鮑伯頭</div>
              <div>🚗 <b>車輛尺度對照</b>：自用轎車高 0.142m、長 0.37m、寬 0.20m，符合成人略高於轎車之微觀真實比例</div>
              <div>🚶‍♀️ <b>人行道適配</b>：人行道寬 0.22m，單名市民佔 6.8cm，留有 15cm 充足會車空間</div>
              <div>🚪 <b>房屋大門相容</b>：門高 0.30m、寬 0.14m，市民可自然進出房屋</div>
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

            <div style="color: #cbd5e1; font-size: 11px; font-weight: 600; margin-top: 4px; margin-bottom: 4px;">
              產生住房需求 (1-5人 / 隨機入住 / 隨機偏好房型):
            </div>
            <button class="dev-action-btn" id="dev-demand-random-btn" style="width: 100%; margin-bottom: 6px; font-weight: 600; font-size: 12px; padding: 8px 4px; background: linear-gradient(135deg, #2563eb, #38bdf8);">
              🎲 產生隨機需求 (1-5人/隨機偏好)
            </button>
            <div style="display: flex; gap: 4px;">
              <button class="dev-action-btn secondary" id="dev-demand-1-btn" style="flex: 1; font-size: 11px; padding: 5px 2px;">➕1人</button>
              <button class="dev-action-btn secondary" id="dev-demand-2-btn" style="flex: 1; font-size: 11px; padding: 5px 2px;">➕2人</button>
              <button class="dev-action-btn secondary" id="dev-demand-3-btn" style="flex: 1; font-size: 11px; padding: 5px 2px;">➕3人</button>
              <button class="dev-action-btn secondary" id="dev-demand-4-btn" style="flex: 1; font-size: 11px; padding: 5px 2px;">➕4人</button>
              <button class="dev-action-btn secondary" id="dev-demand-5-btn" style="flex: 1; font-size: 11px; padding: 5px 2px;">➕5人</button>
            </div>
          </div>

          <!-- 需求歷史清單 (最新在最上方) -->
          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>📋 需求歷史清單 (最新在最上方)</span>
            </div>
            <div id="dev-demand-queue-list" style="max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; padding-right: 2px;">
              <span style="font-size: 11px; color: #94a3b8;">暫無需求紀錄</span>
            </div>
          </div>

          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>全市已建房屋清單</span>
            </div>
            <div id="dev-housing-list" style="font-size: 11px; color: #94a3b8; max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
              暫無已建房屋
            </div>
          </div>
        </div>

        <!-- 分頁 4：路邊停車生成工具 -->
        <div id="dev-section-parking" style="display: none; flex-direction: column; gap: 10px;">
          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>路邊停車生成工具</span>
              <span id="dev-parking-badge" style="font-size: 10px; color: #94a3b8;">待命中</span>
            </div>
            <div class="dev-tool-desc">
              點選開啟生成模式後，在道路兩側路緣石旁點擊即可生成路邊停放車輛。路口、彎道與外部公路嚴格禁止停車，行車動線與停車區域完全隔離不碰撞。
            </div>

            <button class="dev-action-btn" id="dev-toggle-parking-btn">
              🎯 開啟路邊點選停車模式
            </button>

            <div class="dev-status-box">
              <div class="dev-status-row">
                <span class="dev-status-label">工具狀態:</span>
                <span class="dev-status-val" id="dev-parking-status" style="color: #38bdf8;">點選上方按鈕開啟</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">停放車輛總數:</span>
                <span class="dev-status-val" id="dev-parked-count-val" style="color: #4ade80;">0 輛</span>
              </div>
              <div class="dev-status-row">
                <span class="dev-status-label">選中路側資訊:</span>
                <span class="dev-status-val" id="dev-parking-hover-info" style="font-size: 11px; color: #94a3b8;">未選取</span>
              </div>
            </div>

            <div class="dev-btn-row">
              <button class="dev-action-btn secondary" id="dev-random-park-btn">
                🎲 隨機停放 5 輛
              </button>
              <button class="dev-action-btn secondary" id="dev-clear-parking-btn">
                🗑️ 清除所有停車
              </button>
            </div>
          </div>

          <div class="dev-tool-card">
            <div class="dev-tool-title">
              <span>📋 停車規則說明</span>
            </div>
            <div style="font-size: 11px; color: #cbd5e1; line-height: 1.6;">
              <div>✅ <b>直線路段 & 死巷</b>：允許於兩側路緣緊靠停放 (車身距路中 0.62m)</div>
              <div>🚫 <b>路口 (十字/T字)</b>：嚴格禁止停車以確保號誌與轉向視野</div>
              <div>🚫 <b>轉彎道 (Corner)</b>：禁止停車避免內輪差盲區碰撞</div>
              <div>🚫 <b>外部邊界公路</b>：城際幹線嚴禁路側臨時停車</div>
              <div>🛡️ <b>行車安全淨距</b>：行車道中心 0.28m 與停車區 0.62m 具備 14cm 以上安全淨距，絕無碰撞疑慮</div>
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
    const tabCitizensBtn = this.panelContainer.querySelector('#tab-citizens-btn') as HTMLButtonElement;
    const tabHousingBtn = this.panelContainer.querySelector('#tab-housing-btn') as HTMLButtonElement;
    const tabParkingBtn = this.panelContainer.querySelector('#tab-parking-btn') as HTMLButtonElement;
    const secTraffic = this.panelContainer.querySelector('#dev-section-traffic') as HTMLDivElement;
    const secModels = this.panelContainer.querySelector('#dev-section-models') as HTMLDivElement;
    const secCitizens = this.panelContainer.querySelector('#dev-section-citizens') as HTMLDivElement;
    const secHousing = this.panelContainer.querySelector('#dev-section-housing') as HTMLDivElement;
    const secParking = this.panelContainer.querySelector('#dev-section-parking') as HTMLDivElement;

    tabTrafficBtn.addEventListener('click', () => {
      this.activeTab = 'traffic';
      tabTrafficBtn.classList.add('active');
      tabModelsBtn.classList.remove('active');
      tabCitizensBtn.classList.remove('active');
      tabHousingBtn.classList.remove('active');
      tabParkingBtn.classList.remove('active');
      secTraffic.style.display = 'block';
      secModels.style.display = 'none';
      secCitizens.style.display = 'none';
      secHousing.style.display = 'none';
      secParking.style.display = 'none';
      if (this.isParkingModeActive) this.setParkingModeActive(false);
      if (this.isCitizenModeActive) this.setCitizenModeActive(false);
      this.closeModelViewer();
    });

    tabModelsBtn.addEventListener('click', () => {
      this.activeTab = 'modelViewer';
      tabModelsBtn.classList.add('active');
      tabTrafficBtn.classList.remove('active');
      tabCitizensBtn.classList.remove('active');
      tabHousingBtn.classList.remove('active');
      tabParkingBtn.classList.remove('active');
      secTraffic.style.display = 'none';
      secModels.style.display = 'flex';
      secCitizens.style.display = 'none';
      secHousing.style.display = 'none';
      secParking.style.display = 'none';

      // 關閉其他模式
      if (this.isTestModeActive) this.setTestModeActive(false);
      if (this.isParkingModeActive) this.setParkingModeActive(false);
      if (this.isCitizenModeActive) this.setCitizenModeActive(false);
      this.openModelViewer();
    });

    tabCitizensBtn.addEventListener('click', () => {
      this.activeTab = 'citizens';
      tabCitizensBtn.classList.add('active');
      tabTrafficBtn.classList.remove('active');
      tabModelsBtn.classList.remove('active');
      tabHousingBtn.classList.remove('active');
      tabParkingBtn.classList.remove('active');
      secTraffic.style.display = 'none';
      secModels.style.display = 'none';
      secCitizens.style.display = 'flex';
      secHousing.style.display = 'none';
      secParking.style.display = 'none';

      if (this.isTestModeActive) this.setTestModeActive(false);
      if (this.isParkingModeActive) this.setParkingModeActive(false);
      this.closeModelViewer();
      this.updateCitizenUI();
    });

    tabHousingBtn.addEventListener('click', () => {
      this.activeTab = 'housing';
      tabHousingBtn.classList.add('active');
      tabTrafficBtn.classList.remove('active');
      tabModelsBtn.classList.remove('active');
      tabCitizensBtn.classList.remove('active');
      tabParkingBtn.classList.remove('active');
      secTraffic.style.display = 'none';
      secModels.style.display = 'none';
      secCitizens.style.display = 'none';
      secHousing.style.display = 'flex';
      secParking.style.display = 'none';

      if (this.isTestModeActive) this.setTestModeActive(false);
      if (this.isParkingModeActive) this.setParkingModeActive(false);
      if (this.isCitizenModeActive) this.setCitizenModeActive(false);
      this.closeModelViewer();
      this.updateHousingUI();
    });

    tabParkingBtn.addEventListener('click', () => {
      this.activeTab = 'parking';
      tabParkingBtn.classList.add('active');
      tabTrafficBtn.classList.remove('active');
      tabModelsBtn.classList.remove('active');
      tabCitizensBtn.classList.remove('active');
      tabHousingBtn.classList.remove('active');
      secTraffic.style.display = 'none';
      secModels.style.display = 'none';
      secCitizens.style.display = 'none';
      secHousing.style.display = 'none';
      secParking.style.display = 'flex';

      if (this.isTestModeActive) this.setTestModeActive(false);
      if (this.isCitizenModeActive) this.setCitizenModeActive(false);
      this.closeModelViewer();
      this.updateParkingUI();
    });

    // --- 市民放置相關按鈕綁定 ---
    const toggleCitizenBtn = this.panelContainer.querySelector('#dev-toggle-citizen-btn') as HTMLButtonElement | null;
    if (toggleCitizenBtn) {
      toggleCitizenBtn.addEventListener('click', () => {
        this.setCitizenModeActive(!this.isCitizenModeActive);
      });
    }

    const genderRandomBtn = this.panelContainer.querySelector('#dev-citizen-gender-random') as HTMLButtonElement | null;
    const genderMaleBtn = this.panelContainer.querySelector('#dev-citizen-gender-male') as HTMLButtonElement | null;
    const genderFemaleBtn = this.panelContainer.querySelector('#dev-citizen-gender-female') as HTMLButtonElement | null;

    genderRandomBtn?.addEventListener('click', () => {
      this.selectedSpawnGender = 'random';
      genderRandomBtn.classList.add('active');
      genderMaleBtn?.classList.remove('active');
      genderFemaleBtn?.classList.remove('active');
    });

    genderMaleBtn?.addEventListener('click', () => {
      this.selectedSpawnGender = 'male';
      genderMaleBtn.classList.add('active');
      genderRandomBtn?.classList.remove('active');
      genderFemaleBtn?.classList.remove('active');
    });

    genderFemaleBtn?.addEventListener('click', () => {
      this.selectedSpawnGender = 'female';
      genderFemaleBtn.classList.add('active');
      genderRandomBtn?.classList.remove('active');
      genderMaleBtn?.classList.remove('active');
    });

    const lineupBtn = this.panelContainer.querySelector('#dev-lineup-showcase-btn') as HTMLButtonElement | null;
    if (lineupBtn) {
      lineupBtn.addEventListener('click', () => {
        this.spawnLineupInWorld();
      });
    }

    const scatterBtn = this.panelContainer.querySelector('#dev-scatter-citizens-btn') as HTMLButtonElement | null;
    if (scatterBtn) {
      scatterBtn.addEventListener('click', () => {
        const count = this.scatterCitizensOnSidewalks(8);
        const statusVal = this.panelContainer.querySelector('#dev-citizen-status') as HTMLElement | null;
        if (statusVal) {
          statusVal.textContent = count > 0 ? `🎲 已在人行道生成 ${count} 位市民！` : '❌ 全城尚無帶人行道之直線路段';
          statusVal.style.color = count > 0 ? '#4ade80' : '#f87171';
        }
      });
    }

    const clearCitizenBtn = this.panelContainer.querySelector('#dev-clear-citizens-btn') as HTMLButtonElement | null;
    if (clearCitizenBtn) {
      clearCitizenBtn.addEventListener('click', () => {
        this.clearAllCitizens();
        const statusVal = this.panelContainer.querySelector('#dev-citizen-status') as HTMLElement | null;
        if (statusVal) {
          statusVal.textContent = '🗑️ 已清除所有測試市民';
          statusVal.style.color = '#94a3b8';
        }
      });
    }

    // --- 路邊停車按鈕事件綁定 ---
    const toggleParkBtn = this.panelContainer.querySelector('#dev-toggle-parking-btn') as HTMLButtonElement;
    if (toggleParkBtn) {
      toggleParkBtn.addEventListener('click', () => {
        this.setParkingModeActive(!this.isParkingModeActive);
      });
    }

    const randomParkBtn = this.panelContainer.querySelector('#dev-random-park-btn') as HTMLButtonElement;
    if (randomParkBtn) {
      randomParkBtn.addEventListener('click', () => {
        const count = this.parkingManager?.spawnRandomParkedCars(5) ?? 0;
        this.updateParkingUI();
        const hoverInfo = this.panelContainer.querySelector('#dev-parking-hover-info') as HTMLElement | null;
        if (hoverInfo) {
          hoverInfo.textContent = count > 0 ? `🎲 已隨機停放 ${count} 輛車！` : '❌ 全城暫無可用直線路側車位';
          hoverInfo.style.color = count > 0 ? '#4ade80' : '#f87171';
        }
      });
    }

    const clearParkBtn = this.panelContainer.querySelector('#dev-clear-parking-btn') as HTMLButtonElement;
    if (clearParkBtn) {
      clearParkBtn.addEventListener('click', () => {
        this.parkingManager?.clearAllParkedCars();
        this.updateParkingUI();
        const hoverInfo = this.panelContainer.querySelector('#dev-parking-hover-info') as HTMLElement | null;
        if (hoverInfo) {
          hoverInfo.textContent = '🗑️ 已清除所有路邊停車';
          hoverInfo.style.color = '#94a3b8';
        }
      });
    }

    // 房屋隨機需求與 1-5 人快速按鈕綁定
    const randomDemandBtn = this.panelContainer.querySelector('#dev-demand-random-btn');
    if (randomDemandBtn) {
      randomDemandBtn.addEventListener('click', () => {
        this.buildingManager?.generateRandomDemand();
        this.updateHousingUI();
      });
    }

    [1, 2, 3, 4, 5].forEach((count) => {
      const btn = this.panelContainer.querySelector(`#dev-demand-${count}-btn`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.buildingManager?.generateRandomDemand(count);
          this.updateHousingUI();
        });
      }
    });

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

    // 5. 展台走路動畫控制
    const walkAnimBtn = this.panelContainer.querySelector('#dev-walk-anim-toggle-btn') as HTMLButtonElement | null;
    walkAnimBtn?.addEventListener('click', () => {
      this.isWalkAnimationActive = !this.isWalkAnimationActive;
      walkAnimBtn.textContent = this.isWalkAnimationActive ? '🚶 走路動畫: 開啟中' : '⏸️ 走路動畫: 已暫停';
      walkAnimBtn.classList.toggle('active', this.isWalkAnimationActive);
      if (!this.isWalkAnimationActive) {
        CitizenModelFactory.resetAllCitizens(this.modelHolder);
      }
    });

    // 6. 全體市民地圖走路動畫控制
    const worldWalkBtn = this.panelContainer.querySelector('#dev-world-walk-toggle-btn') as HTMLButtonElement | null;
    worldWalkBtn?.addEventListener('click', () => {
      this.isWorldWalkActive = !this.isWorldWalkActive;
      worldWalkBtn.textContent = this.isWorldWalkActive ? '🚶 市民全體走路: 開啟' : '⏸️ 市民全體走路: 暫停';
      worldWalkBtn.classList.toggle('active', this.isWorldWalkActive);
      if (!this.isWorldWalkActive) {
        CitizenModelFactory.resetAllCitizens(this.citizenTestGroup);
      }
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

    // 模擬速度按鈕監聽
    const speed075Btn = this.panelContainer.querySelector('#dev-speed-075-btn') as HTMLButtonElement;
    speed075Btn?.addEventListener('click', () => {
      this.timeManager?.setTimeScale(0.75);
    });

    const speed1Btn = this.panelContainer.querySelector('#dev-speed-1-btn') as HTMLButtonElement;
    speed1Btn?.addEventListener('click', () => {
      this.timeManager?.setTimeScale(1.0);
    });

    const speed2Btn = this.panelContainer.querySelector('#dev-speed-2-btn') as HTMLButtonElement;
    speed2Btn?.addEventListener('click', () => {
      this.timeManager?.setTimeScale(2.0);
    });

    const speed3Btn = this.panelContainer.querySelector('#dev-speed-3-btn') as HTMLButtonElement;
    speed3Btn?.addEventListener('click', () => {
      this.timeManager?.setTimeScale(3.0);
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
          <span class="dev-status-val" style="color: #38bdf8;">現代自用轎車 (等比減半微觀規格)</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">規格尺寸:</span>
          <span class="dev-status-val">長 0.369m × 寬 0.198m × 高 0.142m</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">車道居中:</span>
          <span class="dev-status-val" style="color: #4ade80;">行駛偏移 LANE_OFFSET = 0.28m</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">路邊停車:</span>
          <span class="dev-status-val" style="color: #fbbf24;">路側停放 0.62m (距車道 14cm 距路緣 6cm)</span>
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
    } else if (modelId.startsWith('citizen_')) {
      let citizenMesh: THREE.Group | null = null;
      let titleName = '';
      let heightDesc = '';
      let styleDesc = '';
      let featuresDesc: string[] = [];

      switch (modelId) {
        case 'road_markings_showcase':
          citizenMesh = RoadMarkingFactory.createShowcase();
          titleName = '路口行車導向標線與轉彎引導線展台 (Road Markings Showcase)';
          heightDesc = '長 1.4m × 寬 1.4m (三車道標準路面實體展示)';
          styleDesc = '依遊戲內道路允許方向精準繪製之白色向量導向箭頭與圓弧轉彎引導虛線';
          featuresDesc = [
            '完全依據參考圖繪製：左轉專用標線箭頭、直行兼左轉複合箭頭、直行專用標線箭頭',
            '路口多向擴充支援：直行兼右轉、左右轉雙向分流、三向全通標線箭頭',
            '路口轉彎引導線：沿車道轉彎軌跡繪製之高辨識度純白圓弧虛線 (Turning Guide Dashes)',
            '動態幾何吸附：依遊戲中實際道路相鄰拓撲與車道可通行方向即時生成，嚴格杜絕錯誤標線',
          ];
          break;
        case 'citizen_walk_showcase':
          citizenMesh = CitizenModelFactory.createWalkShowcase();
          titleName = '市民走路步態雙人展台 (Walking Animation Showcase)';
          heightDesc = '男高 0.178m / 女高 0.168m (男女共用人體工學動畫)';
          styleDesc = '男女並肩於石板人行道，動態展示人體工學步態';
          featuresDesc = [
            '通用步態骨架：雙腿自然交替擺動 (±24°)，手臂反相擺臂 (±20°)',
            '軀幹骨盆起伏：雙倍步頻垂直顛簸 (3.5mm)，模擬跨步重心起伏',
            '重心轉向微搖：軀幹帶微幅自轉 (±2°) 與側傾 (±0.9°)，生動逼真',
            '配件同步律動：女性手提包隨右手臂擺動同步前後自然擺盪',
            '男女相同動畫：底層骨架標準化，同一套生物力學演算法通吃男女',
          ];
          break;
        case 'citizen_lineup':
          citizenMesh = CitizenModelFactory.createLineupShowcase();
          titleName = '市民與轎車 1:1 比例對照展台 (Lineup Showcase)';
          heightDesc = '男高 0.178m / 女高 0.168m (轎車高 0.142m)';
          styleDesc = '樣照風格 3D 黏土微縮公仔 (男女各款服飾與轎車)';
          featuresDesc = [
            '黃金頭身比：約 6.5 頭身，成人身高約為轎車高度的 1.25 倍',
            '人行道相容：肩寬 0.058m~0.068m，與 0.22m 人行道完美相稱',
            '多樣款式：休閒短褲、Polo衫、氣質洋裝、粉彩九分褲',
            '細緻配件：白球鞋、墨鏡、淑女手提包、腰帶細節',
          ];
          break;
        case 'citizen_male':
          citizenMesh = CitizenModelFactory.createMaleCitizen({ variant: 0, shirtColor: 0x60a5fa, pantsColor: 0x1e293b });
          titleName = '男性市民 (基礎休閒款 - 樣照 #104)';
          heightDesc = '高 0.178m × 肩寬 0.068m';
          styleDesc = '蔚藍圓領衛衣、深色運動短褲、純白厚底球鞋';
          featuresDesc = [
            '體態特徵：微縮倒梯形健美體魄，6.5 頭身黃金比例',
            '髮型特徵：深棕色俐落偏分短髮蓋 (Espresso Crop)',
            '車輛比對：站立於轎車旁時，頭頂高出車頂約 3.6cm (真實比例)',
            '服飾細節：純白厚底球鞋帶膠底飾條、休閒運動短褲',
          ];
          break;
        case 'citizen_female':
          citizenMesh = CitizenModelFactory.createFemaleCitizen({ variant: 0, shirtColor: 0xf8fafc });
          titleName = '女性市民 (優雅洋裝款 - 樣照 #110)';
          heightDesc = '高 0.168m × 肩寬 0.058m';
          styleDesc = '珍珠白 A 字裙洋裝、紅色細腰帶、厚底休閒鞋';
          featuresDesc = [
            '體態特徵：柔美纖細沙漏腰身，微曲優雅站姿',
            '髮型特徵：氣質微彎齊肩鮑伯頭 (Chestnut Bob Cut)',
            '車輛比對：站立於轎車旁時，頭頂高出車頂約 2.6cm',
            '服飾細節：純白傘狀 A 字洋裝、珊瑚紅細皮帶點綴',
          ];
          break;
        case 'citizen_trendy_male':
          citizenMesh = CitizenModelFactory.createMaleCitizen({ variant: 1, shirtColor: 0x06b6d4, pantsColor: 0xef4444, hasSunglasses: true });
          titleName = '潮流男性市民 (Polo & 墨鏡 - 樣照 #105)';
          heightDesc = '高 0.178m × 肩寬 0.068m';
          styleDesc = '沁涼海青 Polo 衫、亮紅休閒短褲、黑框墨鏡';
          featuresDesc = [
            '配件特色：時尚自發光黑框墨鏡 (Sunglasses)',
            '服飾特色：Polo 領口純白滾邊、高飽和夏日休閒配色',
            '人行道行走：肩寬 6.8cm，在 22cm 人行道上單向/雙向通行皆舒適',
          ];
          break;
        case 'citizen_chic_female':
          citizenMesh = CitizenModelFactory.createFemaleCitizen({ variant: 1, shirtColor: 0xc084fc, pantsColor: 0xc084fc, hasBag: true });
          titleName = '俏麗女性市民 (粉紫休閒九分褲 - 樣照 #107)';
          heightDesc = '高 0.174m (含丸子頭) × 肩寬 0.058m';
          styleDesc = '薰衣草紫背心、粉嫩修身九分褲、俏麗高丸子頭、粉紅手提包';
          featuresDesc = [
            '髮型特色：頂部俏麗高丸子頭 (Top Bun)',
            '配件特色：右手拎亮麗洋紅皮質手提包 (Handbag)',
            '穿搭特色：同色系薰衣草紫套裝與修身九分長褲',
          ];
          break;
      }

      if (citizenMesh) {
        citizenMesh.position.set(0, 0.08, 0);
        this.currentPreviewMesh = citizenMesh;
        this.modelHolder.add(citizenMesh);
      }

      const featureItems = featuresDesc.map((f) => `<div style="color: #cbd5e1;">· ${f}</div>`).join('');

      specBox.innerHTML = `
        <div class="dev-status-row">
          <span class="dev-status-label">名稱:</span>
          <span class="dev-status-val" style="color: #38bdf8;">${titleName}</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">規格尺寸:</span>
          <span class="dev-status-val">${heightDesc}</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">服裝風格:</span>
          <span class="dev-status-val" style="color: #4ade80;">${styleDesc}</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">正面朝向:</span>
          <span class="dev-status-val" style="color: #22c55e;">面向 +Z 軸</span>
        </div>
        <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px;">
          ${featureItems}
        </div>
      `;
    } else if (modelId === 'scale_showcase') {
      const showcaseGroup = new THREE.Group();
      showcaseGroup.name = 'HouseCitizenCar_ScaleShowcase';

      // 1. 2x2 經典住宅實體
      const houseMesh = BuildingModelFactory.createResidential_2x2();
      houseMesh.position.set(0, 0, 0);
      showcaseGroup.add(houseMesh);

      // 2. 男性市民 (站立於大門前石板步道上，面向 +Z 軸)
      const male = CitizenModelFactory.createMaleCitizen({ variant: 0, shirtColor: 0x60a5fa, pantsColor: 0x1e293b });
      male.position.set(0.15, 0.03, 0.36);
      male.rotation.y = 0;
      showcaseGroup.add(male);

      // 3. 女性市民 (站立於男性市民旁前庭草坪)
      const female = CitizenModelFactory.createFemaleCitizen({ variant: 0, shirtColor: 0xf8fafc });
      female.position.set(0.26, 0.03, 0.36);
      female.rotation.y = 0;
      showcaseGroup.add(female);

      // 4. 自用轎車 (停放於前庭右側)
      const car = VehicleModelFactory.createVehicle(0xdc2626);
      car.position.set(-0.32, 0.03, 0.36);
      car.rotation.y = 0;
      showcaseGroup.add(car);

      showcaseGroup.position.set(0, 0.08, 0);
      this.currentPreviewMesh = showcaseGroup;
      this.modelHolder.add(showcaseGroup);

      specBox.innerHTML = `
        <div class="dev-status-row">
          <span class="dev-status-label">展台名稱:</span>
          <span class="dev-status-val" style="color: #4ade80;">住宅、市民與車輛 1:1 比例展台</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">市民身高:</span>
          <span class="dev-status-val">男 0.178m / 女 0.168m</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">玄關大門:</span>
          <span class="dev-status-val" style="color: #fbbf24;">高 0.21m (淨空 3.2cm，步行自如)</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">一層簷高:</span>
          <span class="dev-status-val">簷高 0.29m / 脊高 0.46m</span>
        </div>
        <div class="dev-status-row">
          <span class="dev-status-label">車輛尺寸:</span>
          <span class="dev-status-val">長 0.369m × 寬 0.198m × 高 0.142m</span>
        </div>
        <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11px;">
          <div style="color: #cbd5e1;">· 嚴格依據市民身高與車輛等比建模，符合真實世界人體工學比例</div>
          <div style="color: #cbd5e1;">· 窗台高度約 0.08m (齊市民腰部)，白木柵欄高 0.085m</div>
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
            <span class="dev-status-val">面寬 ${meta.frontageWidth} 格 (${meta.frontageWidth * 0.5}m) × 縱深 ${meta.lotDepth} 格 (${meta.lotDepth * 0.5}m)</span>
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

  public setTimeManager(tm: TimeManager): void {
    this.timeManager = tm;
    this.updateSpeedUI();
    this.timeManager.onTimeScaleChange(() => this.updateSpeedUI());
  }

  private updateSpeedUI(): void {
    if (!this.timeManager) return;
    const badge = this.panelContainer.querySelector('#dev-speed-badge');
    if (badge) {
      badge.textContent = `${this.timeManager.getTimeScale()}x`;
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
        matchStatusVal.innerHTML = '<span style="color: #94a3b8;">尚未產生需求 (點選上方按鈕測試)</span>';
      } else if (lastResult.success) {
        const typeText = lastResult.demand?.matchedType === 'joinExisting' ? '🤝 併入他人合居' : '🏗️ 新建房屋起建';
        matchStatusVal.innerHTML = `
          <div style="color: #4ade80;">✅ 配對成功！[${lastResult.buildingName}] (${lastResult.peopleCount}人 · ${typeText})</div>
          <div style="font-size: 10px; color: #94a3b8;">市民自邊界公路開車至門前，車輛抵達消失後正式記入人口。</div>
        `;
      } else {
        matchStatusVal.innerHTML = `
          <div style="color: #ef4444;">❌ 配對失敗！流失 ${lastResult.peopleCount} 人住房需求</div>
          <div style="font-size: 10px; color: #fca5a5;">原因: ${lastResult.reason}</div>
        `;
      }
    }

    // 渲染需求歷史清單 (最新在最上方)
    const queueElem = this.panelContainer.querySelector('#dev-demand-queue-list');
    if (queueElem) {
      const queue = this.buildingManager.getDemandQueue();
      if (queue.length === 0) {
        queueElem.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">暫無需求紀錄</span>';
      } else {
        queueElem.innerHTML = queue
          .map((d) => {
            const typeBadge = d.moveInType === 'joinExisting'
              ? '<span style="color: #60a5fa; background: rgba(59, 130, 246, 0.15); padding: 1px 5px; border-radius: 4px; font-size: 10px;">🤝 併入他人</span>'
              : '<span style="color: #f59e0b; background: rgba(245, 158, 11, 0.15); padding: 1px 5px; border-radius: 4px; font-size: 10px;">🏗️ 新建房屋</span>';

            const statusBadge = d.status === 'matched'
              ? '<span style="color: #4ade80; font-weight: bold; font-size: 10.5px;">✅ 配對成功</span>'
              : (d.status === 'lost'
                  ? '<span style="color: #ef4444; font-weight: bold; font-size: 10.5px;">❌ 需求流失</span>'
                  : '<span style="color: #fbbf24; font-weight: bold; font-size: 10.5px;">⏳ 配對中</span>');

            const prefText = d.preferredModels.map((m) => m.replace('Residential_', '')).join(', ');

            const note = d.status === 'matched'
              ? `<div style="color: #38bdf8; font-size: 10px; margin-top: 2px;">🏠 落位: ${d.matchedBuildingName || '房屋'} (${d.matchedType === 'joinExisting' ? '合居' : '起建施工'})</div>`
              : (d.status === 'lost'
                  ? `<div style="color: #fca5a5; font-size: 10px; margin-top: 2px;">⚠️ 原因: ${d.failReason || '配對不滿足'}</div>`
                  : '');

            return `
              <div style="background: rgba(30, 41, 59, 0.55); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 5px 8px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <span style="color: #f1f5f9; font-weight: bold;">${d.peopleCount}人需求</span>
                    ${typeBadge}
                  </div>
                  ${statusBadge}
                </div>
                <div style="color: #94a3b8; font-size: 10px; display: flex; justify-content: space-between;">
                  <span>偏好: <span style="color: #cbd5e1;">${prefText}</span></span>
                  <span>密度: <span style="color: #cbd5e1;">低密度</span></span>
                </div>
                ${note}
              </div>
            `;
          })
          .join('');
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

            let resInfo = '';
            if (b.residents && b.residents.length > 0) {
              const resSummary = b.residents.map((r) => `${r.gender === 'male' ? '👨' : '👩'}${r.name}(${r.age}歲)`).join('、');
              resInfo = `<div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">👥 居民: <span style="color: #cbd5e1;">${resSummary}</span></div>`;
            }

            return `
              <div style="padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #f1f5f9; font-weight: 500;">${b.metadata.name} (${b.lot.frontageWidth}x${b.lot.lotDepth})</span>
                  ${st}
                </div>
                ${resInfo}
              </div>
            `;
          })
          .join('');
      }
    }
  }

  /**
   * 每幀更新：驅動模型檢視展台旋轉、市民走路動畫、房屋需求資訊與路邊停車資訊即時刷新
   */
  public update(deltaTime: number): void {
    if (this.showroomGroup.visible && this.isAutoRotating) {
      this.modelHolder.rotation.y += 0.5 * deltaTime;
    }

    // 驅動 3D 模型展台市民走路動畫
    if (this.showroomGroup.visible && this.isWalkAnimationActive) {
      this.walkAnimTimer += deltaTime;
      CitizenModelFactory.animateAllCitizens(this.modelHolder, this.walkAnimTimer);
    }

    // 驅動城市地圖上已生成市民之走路動畫
    if (this.isWorldWalkActive && this.citizenTestGroup.children.length > 0) {
      CitizenModelFactory.animateAllCitizens(this.citizenTestGroup, this.walkAnimTimer);
    }

    if (this.panelContainer.style.display === 'flex') {
      if (this.activeTab === 'housing') {
        this.updateHousingUI();
      } else if (this.activeTab === 'parking') {
        this.updateParkingUI();
      } else if (this.activeTab === 'citizens') {
        this.updateCitizenUI();
      }
    }
  }

  public setParkingManager(pm: ParkingManager): void {
    this.parkingManager = pm;
  }

  public updateParkingUI(): void {
    if (!this.parkingManager) return;
    const countVal = this.panelContainer.querySelector('#dev-parked-count-val');
    if (countVal) {
      countVal.textContent = `${this.parkingManager.getParkedCarCount()} 輛`;
    }
  }

  public updateCitizenUI(): void {
    const countVal = this.panelContainer.querySelector('#dev-citizen-count-val');
    if (countVal) {
      countVal.textContent = `${this.citizenTestGroup.children.length} 位`;
    }
  }

  // ==========================================
  // 市民生成與放置實作邏輯 (Citizen Tool)
  // ==========================================

  private setCitizenModeActive(active: boolean): void {
    this.isCitizenModeActive = active;
    const toggleBtn = this.panelContainer.querySelector('#dev-toggle-citizen-btn') as HTMLButtonElement | null;
    const badge = this.panelContainer.querySelector('#dev-citizen-badge') as HTMLElement | null;
    const statusVal = this.panelContainer.querySelector('#dev-citizen-status') as HTMLElement | null;

    if (active) {
      if (this.isTestModeActive) this.setTestModeActive(false);
      if (this.isParkingModeActive) this.setParkingModeActive(false);

      if (toggleBtn) {
        toggleBtn.classList.add('active');
        toggleBtn.textContent = '🛑 退出市民放置模式';
      }
      if (badge) {
        badge.textContent = '點選放置中';
        badge.style.color = '#4ade80';
      }
      if (statusVal) {
        statusVal.textContent = '👉 在地面或人行道點擊即可放置市民';
        statusVal.style.color = '#4ade80';
      }
      this.cameraManager.setLeftDragEnabled(false);

      if (!this.ghostCitizenMesh) {
        this.ghostCitizenMesh = this.createGhostCitizenMesh();
        this.scene.add(this.ghostCitizenMesh);
      }
      if (this.ghostCitizenMesh) {
        this.ghostCitizenMesh.visible = false;
      }
    } else {
      if (toggleBtn) {
        toggleBtn.classList.remove('active');
        toggleBtn.textContent = '🎯 開啟地面/人行道點選放置市民';
      }
      if (badge) {
        badge.textContent = '待命中';
        badge.style.color = '#94a3b8';
      }
      if (statusVal) {
        statusVal.textContent = '點選上方按鈕開啟';
        statusVal.style.color = '#38bdf8';
      }
      this.cameraManager.setLeftDragEnabled(true);
      if (this.ghostCitizenMesh) {
        this.ghostCitizenMesh.visible = false;
      }
    }
  }

  private createGhostCitizenMesh(): THREE.Group {
    const ghost = new THREE.Group();
    ghost.name = 'GhostCitizenIndicator';

    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      depthTest: true,
    });

    // 圓形立體底座光圈
    const ringGeo = new THREE.RingGeometry(0.035, 0.055, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    ghost.add(ring);

    // 簡化微縮小人輪廓
    const bodyGeo = new THREE.CylinderGeometry(0.016, 0.014, 0.10, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.06;
    ghost.add(body);

    const headGeo = new THREE.SphereGeometry(0.015, 12, 12);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 0.145;
    ghost.add(head);

    return ghost;
  }

  private handleCitizenHover(): void {
    const hitPoint = this.pickGroundOrRoadPoint();
    if (hitPoint && this.ghostCitizenMesh) {
      this.ghostCitizenMesh.visible = true;
      this.ghostCitizenMesh.position.copy(hitPoint);
    } else if (this.ghostCitizenMesh) {
      this.ghostCitizenMesh.visible = false;
    }
  }

  private handleCitizenClick(): void {
    const hitPoint = this.pickGroundOrRoadPoint();
    if (!hitPoint) return;

    const gender: CitizenGender =
      this.selectedSpawnGender === 'random'
        ? (Math.random() < 0.5 ? 'male' : 'female')
        : this.selectedSpawnGender;

    const citizen = CitizenModelFactory.createCitizen({ gender });
    citizen.position.copy(hitPoint);
    citizen.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
    this.citizenTestGroup.add(citizen);

    this.updateCitizenUI();
    const statusVal = this.panelContainer.querySelector('#dev-citizen-status') as HTMLElement | null;
    if (statusVal) {
      statusVal.textContent = `🎉 已放置一位${gender === 'male' ? '男性' : '女性'}市民！`;
      statusVal.style.color = '#38bdf8';
    }
  }

  private pickGroundOrRoadPoint(): THREE.Vector3 | null {
    // 優先射線碰撞道路與高架立體人行道
    const tiles: RoadTile[] = Array.from(this.roadNetwork.getAllTiles());
    if (tiles.length > 0) {
      const meshes: THREE.Object3D[] = [];
      tiles.forEach((t) => {
        meshes.push(t.mesh);
        t.sidewalkGroup.traverse((c) => {
          if (c instanceof THREE.Mesh) meshes.push(c);
        });
      });

      const intersects = this.raycaster.intersectObjects(meshes, true);
      if (intersects.length > 0) {
        return intersects[0].point;
      }
    }

    // 次之碰撞地面 Y=0 綠地
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (hit) {
      hitPoint.y = 0.02;
      return hitPoint;
    }
    return null;
  }

  private scatterCitizensOnSidewalks(count: number = 8): number {
    const tiles = Array.from(this.roadNetwork.getAllTiles()).filter((t) => t.type === 'Straight');
    if (tiles.length === 0) return 0;

    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const tile = tiles[Math.floor(Math.random() * tiles.length)];
      const isNorthSouth = tile.rotationY === 0;
      const isWestSide = Math.random() < 0.5;
      const offsetAlong = (Math.random() - 0.5) * 1.5;

      let pos: THREE.Vector3;
      let rotY: number;

      if (isNorthSouth) {
        const x = isWestSide ? tile.gx - 0.89 : tile.gx + 0.89;
        const z = tile.gz + offsetAlong;
        pos = new THREE.Vector3(x, 0.035, z);
        rotY = isWestSide ? (Math.random() < 0.5 ? Math.PI : 0) : (Math.random() < 0.5 ? 0 : Math.PI);
      } else {
        const x = tile.gx + offsetAlong;
        const z = isWestSide ? tile.gz - 0.89 : tile.gz + 0.89;
        pos = new THREE.Vector3(x, 0.035, z);
        rotY = isWestSide ? (Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      }

      const gender: CitizenGender = Math.random() < 0.5 ? 'male' : 'female';
      const citizen = CitizenModelFactory.createCitizen({ gender });
      citizen.position.copy(pos);
      citizen.rotation.y = rotY;
      this.citizenTestGroup.add(citizen);
      spawned++;
    }

    this.updateCitizenUI();
    return spawned;
  }

  private spawnLineupInWorld(): void {
    const showcase = CitizenModelFactory.createLineupShowcase();
    showcase.position.set(0, 0.02, 0);
    this.citizenTestGroup.add(showcase);
    this.updateCitizenUI();

    this.cameraManager.target.set(0, 0, 0);
    const statusVal = this.panelContainer.querySelector('#dev-citizen-status') as HTMLElement | null;
    if (statusVal) {
      statusVal.textContent = '🎪 已在座標 (0,0) 放置人車比例對照排陣！';
      statusVal.style.color = '#38bdf8';
    }
  }

  private clearAllCitizens(): void {
    while (this.citizenTestGroup.children.length > 0) {
      const c = this.citizenTestGroup.children.pop();
      if (c) this.citizenTestGroup.remove(c);
    }
    this.updateCitizenUI();
  }

  // ==========================================
  // 路邊停車生成實作邏輯 (Curbside Parking Tool)
  // ==========================================

  private setParkingModeActive(active: boolean): void {
    this.isParkingModeActive = active;
    const toggleBtn = this.panelContainer.querySelector('#dev-toggle-parking-btn') as HTMLButtonElement;
    const badge = this.panelContainer.querySelector('#dev-parking-badge') as HTMLElement;
    const statusVal = this.panelContainer.querySelector('#dev-parking-status') as HTMLElement;

    if (active) {
      if (this.isTestModeActive) {
        this.setTestModeActive(false);
      }
      if (toggleBtn) {
        toggleBtn.classList.add('active');
        toggleBtn.textContent = '🛑 退出停車模式';
      }
      if (badge) {
        badge.textContent = '點選放置中';
        badge.style.color = '#4ade80';
      }
      if (statusVal) {
        statusVal.textContent = '👉 在路邊路緣點擊放置車輛';
        statusVal.style.color = '#4ade80';
      }
      this.cameraManager.setLeftDragEnabled(false);

      if (!this.ghostCarMesh && this.parkingManager) {
        this.ghostCarMesh = this.parkingManager.createGhostCarMesh();
        this.scene.add(this.ghostCarMesh);
      }
      if (this.ghostCarMesh) {
        this.ghostCarMesh.visible = false;
      }
    } else {
      if (toggleBtn) {
        toggleBtn.classList.remove('active');
        toggleBtn.textContent = '🎯 開啟路邊點選停車模式';
      }
      if (badge) {
        badge.textContent = '待命中';
        badge.style.color = '#94a3b8';
      }
      if (statusVal) {
        statusVal.textContent = '點選上方按鈕開啟';
        statusVal.style.color = '#38bdf8';
      }
      this.cameraManager.setLeftDragEnabled(true);
      if (this.ghostCarMesh) {
        this.ghostCarMesh.visible = false;
      }
    }
  }

  private setGhostCarColor(color: number): void {
    if (!this.ghostCarMesh) return;
    this.ghostCarMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.color.setHex(color);
      }
    });
  }

  private handleParkingHover(): void {
    if (!this.parkingManager) return;
    const tiles: RoadTile[] = Array.from(this.roadNetwork.getAllTiles());
    if (tiles.length === 0) {
      if (this.ghostCarMesh) this.ghostCarMesh.visible = false;
      return;
    }

    const meshes = tiles.map((t) => t.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);
    const hoverInfo = this.panelContainer.querySelector('#dev-parking-hover-info') as HTMLElement;

    if (intersects.length > 0) {
      const hit = intersects[0];
      const res = this.parkingManager.getCurbsideSpot(hit.point);

      if (this.ghostCarMesh) {
        this.ghostCarMesh.visible = true;
        if (res.spot) {
          this.ghostCarMesh.position.copy(res.spot.position);
          this.ghostCarMesh.rotation.y = res.spot.rotationY;
        } else {
          this.ghostCarMesh.position.copy(hit.point);
          this.ghostCarMesh.position.y = 0.04;
        }
        this.setGhostCarColor(res.valid ? 0x38bdf8 : 0xef4444);
      }

      if (hoverInfo) {
        hoverInfo.textContent = res.valid ? '✅ 可路邊停車 (點選放置)' : `❌ ${res.reason}`;
        hoverInfo.style.color = res.valid ? '#4ade80' : '#f87171';
      }
    } else {
      if (this.ghostCarMesh) {
        this.ghostCarMesh.visible = false;
      }
      if (hoverInfo) {
        hoverInfo.textContent = '移至路側路緣石旁點選';
        hoverInfo.style.color = '#94a3b8';
      }
    }
  }

  private handleParkingClick(): void {
    if (!this.parkingManager) return;
    const tiles: RoadTile[] = Array.from(this.roadNetwork.getAllTiles());
    if (tiles.length === 0) return;

    const meshes = tiles.map((t) => t.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);
    const hoverInfo = this.panelContainer.querySelector('#dev-parking-hover-info') as HTMLElement;

    if (intersects.length > 0) {
      const hit = intersects[0];
      const result = this.parkingManager.spawnParkedCarAt(hit.point);

      if (result.success) {
        this.updateParkingUI();
        if (hoverInfo) {
          hoverInfo.textContent = '🎉 停車成功！';
          hoverInfo.style.color = '#38bdf8';
        }
      } else {
        if (hoverInfo) {
          hoverInfo.textContent = `❌ ${result.reason}`;
          hoverInfo.style.color = '#f87171';
        }
      }
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
      if (this.isParkingModeActive) {
        this.setParkingModeActive(false);
      }
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
    if (!this.isTestModeActive && !this.isParkingModeActive && !this.isCitizenModeActive) return;

    this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mousePos, this.camera);

    if (this.isTestModeActive) {
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
    } else if (this.isParkingModeActive && this.parkingManager) {
      this.handleParkingHover();
    } else if (this.isCitizenModeActive) {
      this.handleCitizenHover();
    }
  }

  private onPointerDown(e: MouseEvent): void {
    if (e.button !== 0) return;

    if (this.isTestModeActive) {
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
    } else if (this.isParkingModeActive && this.parkingManager) {
      this.handleParkingClick();
    } else if (this.isCitizenModeActive) {
      this.handleCitizenClick();
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
