import * as THREE from 'three';
import { CameraManager } from './rendering/CameraManager';
import { TerrainRenderer } from './rendering/TerrainRenderer';
import { WorldSimulationState, SimulationSpeed, MapOverlayMode } from './types';
import { TimeManager } from './simulation/TimeManager';
import { BottomStatusBar } from './ui/BottomStatusBar';

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
  // 保留狀態欄引用以供後續經濟與人口模擬模組即時推播更新
  void bottomStatusBar;

  // 8. 視窗自適應
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 9. 主渲染與模擬循環
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // 更新時間與模擬
    timeManager.update(delta);

    // 更新相機與畫面渲染
    cameraManager.update();
    renderer.render(scene, camera);
  }
  animate();

  console.log('✅ 底部狀態欄 UI 與時間推進系統已就緒！初始狀態：', initialWorldState);
}
