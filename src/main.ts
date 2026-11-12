import * as THREE from 'three';
import { CameraManager } from './rendering/CameraManager';
import { TerrainRenderer } from './rendering/TerrainRenderer';
import { EnvironmentManager } from './rendering/EnvironmentManager';
import { WorldSimulationState, SimulationSpeed, MapOverlayMode } from './types';
import { TimeManager } from './simulation/TimeManager';
import { BottomStatusBar } from './ui/BottomStatusBar';
import { RoadManager } from './systems/RoadManager';
import { ZoningManager } from './systems/ZoningManager';
import { BuildMenu } from './ui/BuildMenu';
import { VehicleManager } from './simulation/VehicleManager';
import { ParkingManager } from './simulation/ParkingManager';
import { PedestrianManager } from './simulation/PedestrianManager';
import { CitizenManager } from './simulation/CitizenManager';
import { DevMenu } from './ui/DevMenu';
import { BuildingManager } from './systems/BuildingManager';
import { BackgroundTimer } from './simulation/BackgroundTimer';
import { Pathfinding } from './systems/Pathfinding';

console.log('🏗️ City Dome 城市建造模擬器初始化中...');

// 初始化世界模擬狀態地基 (依需求設定自 2027/01/01 06:00 AM 開始)
const initialWorldState: WorldSimulationState = {
  time: {
    totalTicks: 0,
    year: 2027,
    month: 1,
    day: 1,
    hour: 6,
    minute: 0,
  },
  speed: SimulationSpeed.Normal,
  stats: {
    population: 0,
    employedCount: 0,
    unemployedRate: 0,
    treasury: 50000,
    cashFlow: 0,
    overallHappiness: 75,
    averageTrafficCongestion: 1.0,
    taxRate: 10,
  },
  activeOverlayMode: MapOverlayMode.Normal,
};

const container = document.getElementById('canvas-container');

if (container) {
  // 1. 初始化場景
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a); // 質感深邃夜空/底色
  scene.fog = new THREE.FogExp2(0x0f172a, 0.0035); // 遠端景深柔和霧氣

  // 2. 初始化透視相機
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // 3. 初始化渲染器
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 4. 自然山脈、海面、大氣漸層天空與 24 小時晝夜動態光影環境
  const environmentManager = new EnvironmentManager(scene);

  // 5. 3D 海島沙盤地形與智慧點陣網格
  const terrainRenderer = new TerrainRenderer(scene);

  // 6. RTS 專用相機管理器（右鍵旋轉、左鍵平移、滾輪縮放）
  const cameraManager = new CameraManager(camera, renderer.domElement);

  // 7. 模擬時間管理器與底部狀態欄 UI
  const timeManager = new TimeManager(
    initialWorldState.time.year,
    initialWorldState.time.month,
    initialWorldState.time.day,
    initialWorldState.time.hour,
    initialWorldState.time.minute
  );

  const bottomStatusBar = new BottomStatusBar(timeManager, {
    population: initialWorldState.stats.population,
    treasury: initialWorldState.stats.treasury,
  });

  // 8. 道路網格吸附管理器與路側土地分區系統
  const roadManager = new RoadManager(
    scene,
    camera,
    renderer.domElement,
    cameraManager,
    initialWorldState.stats.treasury
  );

  const zoningManager = new ZoningManager(
    scene,
    camera,
    renderer.domElement,
    cameraManager,
    roadManager.getRoadNetwork()
  );

  // 道路鋪設完成時，自動刷新路側土地分區小格子
  roadManager.setOnRoadsPlacedCallback(() => {
    zoningManager.rebuildZoningGrid();
  });

  // 串接道路建造花費與國庫更新
  roadManager.setTreasuryCallbacks((newTreasury) => {
    initialWorldState.stats.treasury = newTreasury;
    bottomStatusBar.updateStats({ treasury: newTreasury });
  });

  const buildMenu = new BuildMenu(roadManager, zoningManager);
  // 建造/分區模式切換時，自動驅動大地網格優雅淡入/淡出
  buildMenu.onBuildModeChange((isActive) => {
    terrainRenderer.setGridActive(isActive);
  });

  // 9. 車輛行駛系統、行人移動系統、路邊停車系統與左上角開發者選單
  const roadNetwork = roadManager.getRoadNetwork();
  const pedestrianManager = new PedestrianManager(scene, roadNetwork);
  const vehicleManager = new VehicleManager(scene, roadNetwork);
  vehicleManager.setPedestrianManager(pedestrianManager);

  const parkingManager = new ParkingManager(scene, roadNetwork);
  const citizenManager = new CitizenManager(
    roadNetwork,
    roadNetwork.getPedestrianNetwork(),
    pedestrianManager,
    vehicleManager
  );
  citizenManager.setParkingManager(parkingManager);

  const devMenu = new DevMenu(
    renderer.domElement,
    camera,
    scene,
    cameraManager,
    roadNetwork,
    vehicleManager
  );
  devMenu.setParkingManager(parkingManager);

  // 10. 建築生成與生命週期管理器 (串接獨立之 PedestrianManager 與 CitizenManager)
  const buildingManager = new BuildingManager(
    scene,
    camera,
    renderer.domElement,
    zoningManager,
    roadNetwork,
    vehicleManager,
    pedestrianManager,
    citizenManager
  );
  buildingManager.setParkingManager(parkingManager);
  devMenu.setBuildingManager(buildingManager);
  devMenu.setTimeManager(timeManager);

  // 11. 視窗自適應
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 12. 主渲染與模擬循環（支援前景 60+ FPS 與背景分頁 30 FPS 持續模擬）
  const clock = new THREE.Clock();

  /**
   * 城市底層模擬步長計算
   * 包含：遊戲世界時間推進、路口號誌倒數、車輛行進、住宅施工與人口動態
   */
  function stepSimulation(delta: number): void {
    // 限制單幀模擬步長（最大 0.1s），防止短暫卡頓導致物理模擬穿透或突躍
    const clampedDelta = Math.min(delta, 0.1);

    // 更新時間與模擬 (支援暫停與倍速，嚴格依遊戲世界時間推進)
    timeManager.update(clampedDelta);
    const simDelta = timeManager.getSimulationDelta(clampedDelta);
    const isPaused = timeManager.getIsPaused();

    // 更新道路網絡（紅綠燈號誌倒數計時與狀態切換）
    roadManager.update(simDelta, isPaused);

    // 更新車輛行駛與號誌停等模擬
    vehicleManager.update(simDelta, isPaused);

    // 更新行人移動、斑馬線穿越與進門模擬
    pedestrianManager.update(simDelta, isPaused);

    // 更新建築系統（房屋建造進度、吊臂作業、完工派車）
    buildingManager.update(simDelta, isPaused);

    // 依累計虛擬分鐘推進全體市民週期狀態檢查與任務列隊（每 10 虛擬分鐘檢查，每 10 次同步找工作）
    if (!isPaused) {
      buildingManager.stepCitizenPeriodicSimulation(timeManager.getTotalVirtualMinutes());
    }

    // 動態更新底部狀態欄人口
    const totalPop = buildingManager.getTotalPopulation();
    if (initialWorldState.stats.population !== totalPop) {
      initialWorldState.stats.population = totalPop;
      bottomStatusBar.updateStats({ population: totalPop });
    }
  }

  /**
   * 前景 3D 畫面繪製與相機互動更新 (僅在分頁可見時執行，背景完全釋放 GPU)
   */
  function renderFrame(delta: number): void {
    // 更新自然環境（動態海浪起伏、低多邊形白雲飄移、24小時晝夜光影與大氣色盤）
    environmentManager.update(delta, timeManager.getTime());

    // 更新地圖點陣網格平滑透明度漸層
    terrainRenderer.update(delta);

    // 更新開發者選單（模型展台旋轉更新、房屋需求監控等）
    devMenu.update(delta);

    // 更新相機與畫面渲染 (支援 WASD 鍵盤平移)
    cameraManager.update(delta);
    renderer.render(scene, camera);
  }

  // 建立背景心跳計時器：分頁切至背景時以 30 FPS 穩定推進城市，不浪費 GPU 算力
  const backgroundTimer = new BackgroundTimer(30, (bgDelta) => {
    stepSimulation(bgDelta);
  });

  let animationFrameId: number | null = null;

  function animate() {
    if (document.hidden) {
      animationFrameId = null;
      return;
    }

    animationFrameId = requestAnimationFrame(animate);

    const delta = clock.getDelta();
    stepSimulation(delta);
    renderFrame(delta);
  }

  // 監聽瀏覽器切換分頁與視窗最小化
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 切換至背景：停止 requestAnimationFrame 繪圖，改由 Web Worker 心跳維持模擬
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      backgroundTimer.start();
    } else {
      // 回到前景：停止背景心跳，重置計時器，恢復流暢 60+ FPS 渲染
      backgroundTimer.stop();
      clock.getDelta(); // 消除背景期間累積的單幀突躍
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(animate);
      }
    }
  });

  // 依當前初始分頁狀態啟動相應循環
  if (document.hidden) {
    backgroundTimer.start();
  } else {
    animate();
  }

  // 暴露全域除錯物件供開發者與測試工具使用
  (window as any).THREE = THREE;
  (window as any).__cityDome = {
    environmentManager,
    terrainRenderer,
    roadManager,
    zoningManager,
    buildingManager,
    pedestrianManager,
    citizenManager,
    vehicleManager,
    parkingManager,
    devMenu,
    buildMenu,
    Pathfinding,
    pedestrianNetwork: roadManager.getRoadNetwork().getPedestrianNetwork(),
  };

  console.log('✅ 底部狀態欄 UI 與時間推進系統已就緒！初始狀態：', initialWorldState);
}
