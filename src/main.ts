import * as THREE from 'three';
import { WorldSimulationState, SimulationSpeed, MapOverlayMode } from './types';

console.log('🏗️ City Dome 城市建造模擬器初始化中...');

// 初始化世界模擬狀態地基
const initialWorldState: WorldSimulationState = {
  time: {
    totalTicks: 0,
    day: 1,
    hour: 8,
    minute: 0,
  },
  speed: SimulationSpeed.Normal,
  stats: {
    population: 0,
    employedCount: 0,
    unemployedRate: 0,
    treasury: 50000, // 初始建城預算 $50,000
    cashFlow: 0,
    overallHappiness: 75,
    averageTrafficCongestion: 1.0,
    taxRate: 10,
  },
  activeOverlayMode: MapOverlayMode.Normal,
};

// 基礎 Three.js 畫布容器綁定驗證
const container = document.getElementById('canvas-container');

if (container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e293b); // 深色藍灰背景

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(30, 40, 50);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // 基礎格線與打光（地基環境）
  const gridHelper = new THREE.GridHelper(100, 50, 0x38bdf8, 0x334155);
  scene.add(gridHelper);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(50, 80, 30);
  scene.add(dirLight);

  // 視窗自適應縮放
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 渲染迴圈驗證
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  console.log('✅ Three.js 基礎渲染地基已就緒，初始狀態：', initialWorldState);
}
