import * as THREE from 'three';
import { CameraManager } from './rendering/CameraManager';
import { TerrainRenderer } from './rendering/TerrainRenderer';
import { WorldSimulationState, SimulationSpeed, MapOverlayMode } from './types';
import { TimeManager } from './simulation/TimeManager';
import { BottomStatusBar } from './ui/BottomStatusBar';
import { RoadManager } from './systems/RoadManager';
import { ZoningManager } from './systems/ZoningManager';
import { BuildMenu } from './ui/BuildMenu';
import { VehicleManager } from './simulation/VehicleManager';
import { DevMenu } from './ui/DevMenu';
import { BuildingManager } from './systems/BuildingManager';

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

  // 4. 環境與陽光照明
  const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.7);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
  sunLight.position.set(80, 120, 60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 300;
  sunLight.shadow.camera.left = -120;
  sunLight.shadow.camera.right = 120;
  sunLight.shadow.camera.top = 120;
  sunLight.shadow.camera.bottom = -120;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  // 5. 基礎地圖地形與網格
  new TerrainRenderer(scene);

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
  void buildMenu;

  // 9. 車輛行駛系統與左上角開發者選單
  const vehicleManager = new VehicleManager(scene, roadManager.getRoadNetwork());
  const devMenu = new DevMenu(
    renderer.domElement,
    camera,
    scene,
    cameraManager,
    roadManager.getRoadNetwork(),
    vehicleManager
  );

  // 10. 住宅建築生成與市民生命週期管理器
  const buildingManager = new BuildingManager(
    scene,
    camera,
    renderer.domElement,
    zoningManager,
    roadManager.getRoadNetwork(),
    vehicleManager
  );
  devMenu.setBuildingManager(buildingManager);

  // 11. 視窗自適應
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 12. 主渲染與模擬循環
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // 更新時間與模擬
    timeManager.update(delta);

    // 更新道路網絡（紅綠燈號誌倒數計時與狀態切換）
    roadManager.update(delta, timeManager.getIsPaused());

    // 更新車輛行駛與號誌停等模擬
    vehicleManager.update(delta, timeManager.getIsPaused());

    // 更新建築系統（房屋建造動畫、市民開車遷入）
    buildingManager.update(delta, timeManager.getIsPaused());

    // 動態更新底部狀態欄人口
    const totalPop = buildingManager.getTotalPopulation();
    if (initialWorldState.stats.population !== totalPop) {
      initialWorldState.stats.population = totalPop;
      bottomStatusBar.updateStats({ population: totalPop });
    }

    // 更新開發者選單（模型展台旋轉更新、房屋需求監控等）
    devMenu.update(delta);

    // 更新相機與畫面渲染 (支援 WASD 鍵盤平移)
    cameraManager.update(delta);
    renderer.render(scene, camera);
  }
  animate();

  console.log('✅ 底部狀態欄 UI 與時間推進系統已就緒！初始狀態：', initialWorldState);
}
