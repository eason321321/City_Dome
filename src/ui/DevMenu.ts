import * as THREE from 'three';
import { CameraManager } from '../rendering/CameraManager';
import { RoadNetwork, DirectedLane, RoadTile } from '../systems/RoadNetwork';
import { Pathfinding, PathResult } from '../systems/Pathfinding';
import { VehicleManager } from '../simulation/VehicleManager';

/**
 * 開發者選單與車輛道路測試系統 (DevMenu)
 * 位於畫面左上角，支援：
 * 1. 抽屜式暗色毛玻璃選單面板開關
 * 2. 車輛道路測試工具：在車道上自選起點與終點
 * 3. 3D 即時光標吸附預覽、起訖點地標旗標與導航光路繪製
 * 4. A* 最短路徑出車行駛實測與紅綠燈號誌遵守檢驗
 */
export class DevMenu {
  private domElement: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private cameraManager: CameraManager;
  private roadNetwork: RoadNetwork;
  private vehicleManager: VehicleManager;

  // UI 元素
  private toggleButton!: HTMLButtonElement;
  private panelContainer!: HTMLDivElement;

  // 測試模式狀態
  private isTestModeActive: boolean = false;
  private currentStep: 'selectStart' | 'selectEnd' | 'ready' = 'selectStart';
  private selectedStartLane: DirectedLane | null = null;
  private selectedEndLane: DirectedLane | null = null;
  private currentRoute: PathResult | null = null;

  // 3D 視覺輔助容器
  private testVisualGroup: THREE.Group;
  private hoverMarker: THREE.Mesh;
  private startBeacon: THREE.Group | null = null;
  private endBeacon: THREE.Group | null = null;
  private pathLineMesh: THREE.Line | null = null;

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

    // 建立 3D 視覺輔助群組
    this.testVisualGroup = new THREE.Group();
    this.scene.add(this.testVisualGroup);

    // 懸浮車道高亮網格
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

    this.createUI();
    this.bindEvents();
  }

  private createUI(): void {
    // 注入專屬 CSS 樣式
    const style = document.createElement('style');
    style.textContent = `
      .dev-menu-btn {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 100;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        color: #f8fafc;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 500;
        padding: 8px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
      }
      .dev-menu-btn:hover {
        background: rgba(30, 41, 59, 0.95);
        border-color: rgba(56, 189, 248, 0.4);
        transform: translateY(-1px);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
      }
      .dev-menu-btn .dev-badge {
        background: #0284c7;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }

      .dev-menu-panel {
        position: fixed;
        top: 62px;
        left: 16px;
        width: 330px;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
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
        padding: 12px 16px;
        background: rgba(30, 41, 59, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .dev-panel-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .dev-panel-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        line-height: 1;
        transition: all 0.15s;
      }
      .dev-panel-close:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.1);
      }

      .dev-panel-body {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .dev-tool-card {
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .dev-tool-title {
        font-size: 13px;
        font-weight: 600;
        color: #38bdf8;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dev-tool-desc {
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.4;
      }

      .dev-status-box {
        background: rgba(15, 23, 42, 0.7);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 11px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1px solid rgba(255, 255, 255, 0.04);
      }
      .dev-status-row {
        display: flex;
        justify-content: space-between;
      }
      .dev-status-label {
        color: #64748b;
      }
      .dev-status-val {
        font-family: monospace;
        font-weight: 500;
        color: #e2e8f0;
      }
      .dev-status-val.success { color: #4ade80; }
      .dev-status-val.warning { color: #facc15; }

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
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
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
    `;
    document.head.appendChild(style);

    // 建立頂部左側按鈕
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'dev-menu-btn';
    this.toggleButton.innerHTML = `
      <span>🛠️ 開發者選單</span>
      <span class="dev-badge">DEV</span>
    `;
    document.body.appendChild(this.toggleButton);

    // 建立浮動面板
    this.panelContainer = document.createElement('div');
    this.panelContainer.className = 'dev-menu-panel';
    this.panelContainer.innerHTML = `
      <div class="dev-panel-header">
        <h3>🛠️ 開發者工具箱</h3>
        <button class="dev-panel-close" id="dev-close-btn">✕</button>
      </div>
      <div class="dev-panel-body">
        <div class="dev-tool-card">
          <div class="dev-tool-title">
            <span>🚗 車輛道路測試</span>
            <span id="dev-test-badge" style="font-size: 10px; color: #94a3b8;">待命中</span>
          </div>
          <div class="dev-tool-desc">
            在車道上點選起點與終點，車輛將以 A* 最短路徑出發行駛，並遵守路口號誌。
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
    `;
    document.body.appendChild(this.panelContainer);

    // 事件阻斷，防止穿透至 RTS 鏡頭
    this.panelContainer.addEventListener('mousedown', (e) => e.stopPropagation());
    this.toggleButton.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  private bindEvents(): void {
    // 開關面板
    this.toggleButton.addEventListener('click', () => {
      const isOpen = this.panelContainer.style.display === 'flex';
      this.panelContainer.style.display = isOpen ? 'none' : 'flex';
    });

    const closeBtn = this.panelContainer.querySelector('#dev-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.panelContainer.style.display = 'none';
      });
    }

    // 切換道路選點測試模式
    const toggleTestBtn = this.panelContainer.querySelector('#dev-toggle-test-btn') as HTMLButtonElement;
    toggleTestBtn.addEventListener('click', () => {
      this.setTestModeActive(!this.isTestModeActive);
    });

    // 發車實測按鈕
    const spawnBtn = this.panelContainer.querySelector('#dev-spawn-car-btn') as HTMLButtonElement;
    spawnBtn.addEventListener('click', () => {
      if (this.currentRoute) {
        this.vehicleManager.spawnTestVehicle(this.currentRoute);
      }
    });

    // 重設起訖
    const resetBtn = this.panelContainer.querySelector('#dev-reset-btn') as HTMLButtonElement;
    resetBtn.addEventListener('click', () => {
      this.resetPoints();
    });

    // 清除車輛
    const clearBtn = this.panelContainer.querySelector('#dev-clear-cars-btn') as HTMLButtonElement;
    clearBtn.addEventListener('click', () => {
      this.vehicleManager.clearAllVehicles();
    });

    // 滑鼠移動光標與拾取
    this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
  }

  private setTestModeActive(active: boolean): void {
    this.isTestModeActive = active;
    const toggleTestBtn = this.panelContainer.querySelector('#dev-toggle-test-btn') as HTMLButtonElement;
    const badge = this.panelContainer.querySelector('#dev-test-badge') as HTMLElement;

    if (active) {
      toggleTestBtn.classList.add('active');
      toggleTestBtn.textContent = '⏹ 退出選點測試';
      badge.textContent = '選取中';
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

      // 旋轉對齊車道方向
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
      // 1. 設定起點
      this.selectedStartLane = clickedLane;
      this.createBeacon('start', clickedLane.entryPoint);
      this.currentStep = 'selectEnd';
      this.updateUIStatus();
    } else if (this.currentStep === 'selectEnd') {
      // 2. 設定終點
      this.selectedEndLane = clickedLane;
      this.createBeacon('end', clickedLane.exitPoint);
      this.currentStep = 'ready';
      this.calculateRouteAndSpawn();
    } else if (this.currentStep === 'ready') {
      // 已選好時再次點擊，重設為新的起點
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

      // 找到命中的 RoadTile
      const tile = tiles.find((t) => t.mesh === hit.object);
      if (tile && tile.lanes.length > 0) {
        // 在該格位內挑選離點擊座標最近的車道
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
      // 繪製高亮 3D 光路軌跡
      this.drawRoutePath(route.waypoints);
      // 自動發出一輛測試車實測
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

    // 地面發光圓環
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

    // 立柱標記
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.8,
      roughness: 0.2,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 0.45;
    group.add(pole);

    // 頂部發光球
    const sphereGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2.5,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 0.9;
    group.add(sphere);

    return group;
  }

  private drawRoutePath(waypoints: THREE.Vector3[]): void {
    this.clearRoutePath();

    const points = waypoints.map((p) => new THREE.Vector3(p.x, p.y + 0.02, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
    });

    this.pathLineMesh = new THREE.Line(geo, mat);
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
    const hint = this.panelContainer.querySelector('#dev-step-hint') as HTMLElement;
    const startVal = this.panelContainer.querySelector('#dev-start-lane') as HTMLElement;
    const endVal = this.panelContainer.querySelector('#dev-end-lane') as HTMLElement;
    const routeVal = this.panelContainer.querySelector('#dev-route-status') as HTMLElement;
    const spawnBtn = this.panelContainer.querySelector('#dev-spawn-car-btn') as HTMLButtonElement;

    if (!this.isTestModeActive) {
      hint.textContent = '待命中 (點選開啟)';
      hint.style.color = '#94a3b8';
      spawnBtn.disabled = true;
      return;
    }

    if (this.currentStep === 'selectStart') {
      hint.textContent = '1. 請在畫面上點選出發起點車道 🏁';
      hint.style.color = '#38bdf8';
    } else if (this.currentStep === 'selectEnd') {
      hint.textContent = '2. 請點選抵達目的地車道 🎯';
      hint.style.color = '#facc15';
    } else {
      hint.textContent = '3. 路徑已生成！車輛出發測試中';
      hint.style.color = '#4ade80';
    }

    startVal.textContent = this.selectedStartLane
      ? `(${this.selectedStartLane.entryPoint.x.toFixed(1)}, ${this.selectedStartLane.entryPoint.z.toFixed(1)}) ${this.selectedStartLane.direction}向`
      : '未設定';

    endVal.textContent = this.selectedEndLane
      ? `(${this.selectedEndLane.exitPoint.x.toFixed(1)}, ${this.selectedEndLane.exitPoint.z.toFixed(1)}) ${this.selectedEndLane.direction}向`
      : '未設定';

    if (this.currentRoute) {
      routeVal.textContent = `✅ 連通 (長 ${this.currentRoute.totalDistance.toFixed(1)}m, ${this.currentRoute.laneIds.length} 節點)`;
      routeVal.className = 'dev-status-val success';
      spawnBtn.disabled = false;
    } else if (this.selectedStartLane && this.selectedEndLane) {
      routeVal.textContent = '❌ 無可通達之路徑';
      routeVal.className = 'dev-status-val warning';
      spawnBtn.disabled = true;
    } else {
      routeVal.textContent = '未規劃';
      routeVal.className = 'dev-status-val';
      spawnBtn.disabled = true;
    }
  }
}
