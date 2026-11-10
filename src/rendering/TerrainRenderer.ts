import * as THREE from 'three';

/**
 * 基礎地圖與地形渲染器
 * 負責：
 * 1. 基礎大地平面（Terrain Ground）
 * 2. 雙層格線輔助系統（主要 10m、次要 2m）
 * 3. 邊界與世界中心點標記
 */
export class TerrainRenderer {
  public group: THREE.Group;
  public readonly mapSize: number = 240; // 地圖總尺寸 (240x240m)

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.initTerrain();
    scene.add(this.group);
  }

  private initTerrain(): void {
    // 1. 綠地地表平面
    const groundGeo = new THREE.PlaneGeometry(this.mapSize, this.mapSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,       // 深深藍灰底色（現代科技感底層）
      roughness: 0.85,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    this.group.add(groundMesh);

    // 2. 綠意核心建設區（中心 200x200m 建設區）
    const buildableSize = 200;
    const buildableGeo = new THREE.PlaneGeometry(buildableSize, buildableSize);
    const buildableMat = new THREE.MeshStandardMaterial({
      color: 0x223326,       // 低飽和度森林綠地色調
      roughness: 0.8,
      metalness: 0.05,
    });
    const buildableMesh = new THREE.Mesh(buildableGeo, buildableMat);
    buildableMesh.rotation.x = -Math.PI / 2;
    buildableMesh.position.y = -0.02;
    buildableMesh.receiveShadow = true;
    this.group.add(buildableMesh);

    // 3. 次要細格線（每 2 公尺一格）
    const minorGrid = new THREE.GridHelper(
      buildableSize,
      buildableSize / 2,
      0x334155,
      0x273549
    );
    minorGrid.position.y = 0.01;
    this.group.add(minorGrid);

    // 4. 主要粗格線（每 10 公尺一格）
    const majorGrid = new THREE.GridHelper(
      buildableSize,
      buildableSize / 10,
      0x38bdf8,             // 亮水藍色主軸
      0x475569              // 質感灰藍色 10m 幹道線
    );
    majorGrid.position.y = 0.02;
    this.group.add(majorGrid);

    // 5. 邊界線框（提示玩家可建設區域極限）
    const borderEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(buildableSize, 0.4, buildableSize));
    const borderMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, linewidth: 2 });
    const borderLine = new THREE.LineSegments(borderEdges, borderMat);
    borderLine.position.y = 0.2;
    this.group.add(borderLine);

    // 6. 原點座標標記（(0,0,0) 中心指示點）
    const originPivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    originPivot.position.y = 0.1;
    this.group.add(originPivot);
  }
}
