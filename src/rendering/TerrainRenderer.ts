import * as THREE from 'three';

/**
 * 現代自然海灣大地與微縮沙盤地形渲染器
 * 負責：
 * 1. 3D 立體海島沙盤底盤 (3D Diorama Island Slab: 自然紋理綠地平原 + 金色沙灘 + 斷崖岩層)
 * 2. 智慧漸變點陣網格系統 (Dot Matrix Grid with Smooth Fade-in/Fade-out)
 * 3. 邊界導引光框與座標原點指南針
 */
export class TerrainRenderer {
  public group: THREE.Group;
  public readonly mapSize: number = 240;      // 總地形尺寸 (240x240m)
  public readonly buildableSize: number = 200; // 核心可建設區 (200x200m)

  // 智慧網格透明度控制
  private gridMesh!: THREE.Mesh;
  private gridMaterial!: THREE.MeshBasicMaterial;
  private borderLine!: THREE.LineSegments;
  private borderMaterial!: THREE.LineBasicMaterial;
  private originPivot!: THREE.Group;

  private isGridActive: boolean = false;
  private currentOpacity: number = 0.08;      // 平時極淡隱蔽狀態
  private targetOpacity: number = 0.08;
  private readonly idleOpacity: number = 0.08;
  private readonly activeOpacity: number = 0.85; // 建造模式優雅顯現

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.initTerrainSlab();
    this.initDotMatrixGrid();
    this.initBorderAndPivot();
    scene.add(this.group);
  }

  // =========================================================================
  // 1. 3D 立體海島沙盤底盤 (Diorama Island Slab)
  // =========================================================================

  private initTerrainSlab(): void {
    // A. 綠意盎然的核心平原地塊 (200x200m，頂面精準位於 Y = -0.02，避免與 Y=0.0 的道路及分區貼合衝突)
    const grassTex = this.createGrassTexture();
    const plateauGeo = new THREE.BoxGeometry(this.buildableSize, 0.36, this.buildableSize);
    const plateauMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0xffffff,       // 由程序化自然綠地貼圖主導色調
      roughness: 0.88,
      metalness: 0.04,
    });
    const plateauMesh = new THREE.Mesh(plateauGeo, plateauMat);
    plateauMesh.position.y = -0.20; // 頂面位於 -0.02，底面 -0.38
    plateauMesh.receiveShadow = true;
    this.group.add(plateauMesh);

    // B. 海岸沙灘過渡緩衝帶 (200m -> 232m，由綠地向海面自然階梯降落)
    const sandTex = this.createSandTexture();
    const beachGeo = new THREE.BoxGeometry(232, 0.40, 232);
    const beachMat = new THREE.MeshStandardMaterial({
      map: sandTex,
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.02,
    });
    const beachMesh = new THREE.Mesh(beachGeo, beachMat);
    beachMesh.position.y = -0.35; // 頂面位於 -0.15，底面 -0.55
    beachMesh.receiveShadow = true;
    this.group.add(beachMesh);

    // C. 沙盤立體基底斷崖 (232m -> 240m，厚度 4.6m 下切至海床)
    const cliffGeo = new THREE.BoxGeometry(240, 4.6, 240);
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0x334155,       // 沉穩深青灰頁岩地層切面
      roughness: 0.95,
      metalness: 0.08,
      flatShading: true,
    });
    const cliffMesh = new THREE.Mesh(cliffGeo, cliffMat);
    cliffMesh.position.y = -2.70; // 頂面位於 -0.40，底面 -5.00
    cliffMesh.receiveShadow = true;
    this.group.add(cliffMesh);
  }

  /**
   * 產生具有有機微細色調變化的柔和草地質感貼圖
   */
  private createGrassTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // 柔和低對比森林草地底色
    ctx.fillStyle = '#316a3d';
    ctx.fillRect(0, 0, 256, 256);

    // 撒上柔和深淺不一的草叢斑塊
    const shades = ['#2c6037', '#367443', '#2f653a', '#3a7b47'];
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = shades[i % shades.length];
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 2 + Math.random() * 8;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 產生具有自然沙粒紋理的海岸金色沙灘貼圖
   */
  private createSandTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#dec493';
    ctx.fillRect(0, 0, 256, 256);

    const shades = ['#d4b782', '#e5cd9f', '#cbb07c'];
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = shades[i % shades.length];
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const w = 4 + Math.random() * 14;
      const h = 1.5 + Math.random() * 3;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x, y, w, h);
    }

    ctx.globalAlpha = 1.0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // =========================================================================
  // 2. 智慧漸變點陣網格 (Dot Matrix Grid)
  // =========================================================================

  private initDotMatrixGrid(): void {
    const dotTexture = this.createDotGridTexture();

    const gridGeo = new THREE.PlaneGeometry(this.buildableSize, this.buildableSize);
    gridGeo.rotateX(-Math.PI / 2);

    this.gridMaterial = new THREE.MeshBasicMaterial({
      map: dotTexture,
      transparent: true,
      opacity: this.currentOpacity,
      depthWrite: false,
    });

    this.gridMesh = new THREE.Mesh(gridGeo, this.gridMaterial);
    this.gridMesh.position.y = 0.005; // 微微浮於地面，避免深度衝突
    this.group.add(this.gridMesh);
  }

  /**
   * 程序化繪製高解析度 2m 點陣與 10m 主幹道十字標記畫布材質
   */
  private createDotGridTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // 背景全透
    ctx.clearRect(0, 0, 512, 512);

    // 10m 區塊內劃分為 5 等分 (每等分對應 2m 次要網格)
    const step = 512 / 5;

    // 1. 繪製微弱的 10m 幹道導引虛線框
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)'; // 質感水藍色
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(0, 0, 512, 512);
    ctx.setLineDash([]); // 恢復實線

    // 2. 繪製 2m 點陣與 10m 節點十字
    for (let x = 0; x <= 5; x++) {
      for (let y = 0; y <= 5; y++) {
        const px = Math.min(510, Math.max(2, Math.round(x * step)));
        const py = Math.min(510, Math.max(2, Math.round(y * step)));

        const isMajor = (x === 0 || x === 5) && (y === 0 || y === 5);

        if (isMajor) {
          // 10m 主節點：精緻水藍十字星標記
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(px - 9, py);
          ctx.lineTo(px + 9, py);
          ctx.moveTo(px, py - 9);
          ctx.lineTo(px, py + 9);
          ctx.stroke();

          // 核心微點
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, py, 2.0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 2m 次要節點：柔和暖白微點
          ctx.fillStyle = 'rgba(248, 250, 252, 0.72)';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // 200m / 10m = 20 次重複
    texture.repeat.set(20, 20);
    texture.anisotropy = 8;
    return texture;
  }

  // =========================================================================
  // 3. 邊界線框與世界座標指南針 (Border & Origin Compass)
  // =========================================================================

  private initBorderAndPivot(): void {
    // 可建設區極限邊界線 (200x200m)
    const borderEdges = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(this.buildableSize, 0.3, this.buildableSize)
    );
    this.borderMaterial = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.2,
    });
    this.borderLine = new THREE.LineSegments(borderEdges, this.borderMaterial);
    this.borderLine.position.y = 0.15;
    this.group.add(this.borderLine);

    // 原點 (0,0,0) 指南標記：精緻的低剖面青金雙色圓形羅盤
    this.originPivot = new THREE.Group();

    // 外環
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    this.originPivot.add(new THREE.Mesh(ringGeo, ringMat));

    // 中心微凸點
    const centerGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16);
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // 金琥珀色核心
      roughness: 0.3,
      metalness: 0.8,
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    centerMesh.position.y = 0.04;
    this.originPivot.add(centerMesh);

    this.originPivot.position.set(0, 0.02, 0);
    this.group.add(this.originPivot);
  }

  // =========================================================================
  // 4. 狀態控制與每幀平滑淡入淡出 (Smooth Grid Fade Lerp)
  // =========================================================================

  /**
   * 設定建造模式活躍狀態（當進入道路或分區建造時切為 true）
   */
  public setGridActive(active: boolean): void {
    this.isGridActive = active;
    this.targetOpacity = active ? this.activeOpacity : this.idleOpacity;
  }

  /**
   * 每幀更新：平滑插值網格透明度，呈現優雅呼吸過渡
   */
  public update(delta: number): void {
    if (Math.abs(this.currentOpacity - this.targetOpacity) > 0.001) {
      // 指數阻尼插值
      this.currentOpacity = THREE.MathUtils.lerp(
        this.currentOpacity,
        this.targetOpacity,
        Math.min(1.0, delta * 7.0)
      );

      this.gridMaterial.opacity = this.currentOpacity;

      // 邊界框線隨同聯動呼吸
      const borderTarget = this.isGridActive ? 0.85 : 0.2;
      this.borderMaterial.opacity = THREE.MathUtils.lerp(
        this.borderMaterial.opacity,
        borderTarget,
        Math.min(1.0, delta * 7.0)
      );
    }
  }
}
