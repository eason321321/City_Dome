import * as THREE from 'three';
import { RoadNetwork, RoadTile } from './RoadNetwork';
import { CameraManager } from '../rendering/CameraManager';

export type ZoneType = 'None' | 'Residential' | 'Industrial';
export type ZoningToolMode = 'brush' | 'box';

export interface ZoningPreviewInfo {
  isDragging: boolean;
  widthCells: number;
  depthCells: number;
  cellCount: number;
  mode: 'Residential' | 'Industrial' | 'Dezone';
}

export interface ZoningCell {
  key: string;             // "zx,zz" e.g. "24,48"
  zx: number;              // 0.5m 格位整數索引
  zz: number;
  worldX: number;          // 中心世界座標 X ((zx + 0.5) * CELL_SIZE)
  worldZ: number;          // 中心世界座標 Z ((zz + 0.5) * CELL_SIZE)
  zoneType: ZoneType;      // 當前分區型別
  mesh?: THREE.Mesh;       // 視覺填充網格
}

/**
 * 土地劃分與路側分區管理器 (ZoningManager)
 * 負責：
 * 1. 於道路周邊動態生成垂直於道路的 0.5m x 0.5m 小格子（非地圖網格，依道路拓撲動態生成）
 * 2. 呈現 Cities: Skylines 風格之分區網格線與住宅區（綠色）色塊
 * 3. 支援滑鼠點擊與連續拖曳劃分住宅區（Residential Zone）與清除分區
 * 4. 道路建造與更新時自動同步維護臨路分區格位
 */
export class ZoningManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private cameraManager: CameraManager;
  private roadNetwork: RoadNetwork;

  // 分區資料 (格位大小改為原先 1/4，即 0.5m x 0.5m，延伸 8 格 = 縱深 4m)
  public readonly CELL_SIZE: number = 0.5;
  private cells: Map<string, ZoningCell> = new Map();
  private readonly ZONING_DEPTH: number = 8; // 道路兩側縱深 8 格 (4m)

  // 3D 視覺物件群組
  private zoningContainer: THREE.Group;
  private gridLinesMesh: THREE.LineSegments | null = null;
  private fillGroup: THREE.Group;
  private hoverBrushMesh: THREE.Mesh;

  // 互動狀態
  private isToolActive: boolean = false;
  private currentMode: 'Residential' | 'Industrial' | 'Dezone' = 'Residential';
  private toolMode: ZoningToolMode = 'brush';
  private isMouseDown: boolean = false;
  private currentMouseButton: number = 0; // 0: 左鍵, 2: 右鍵

  // 框選專用狀態
  private isBoxDragging: boolean = false;
  private boxStartZx: number = 0;
  private boxStartZz: number = 0;
  private boxStartHit: THREE.Vector3 = new THREE.Vector3();
  private boxCurrentZx: number = 0;
  private boxCurrentZz: number = 0;
  private boxCurrentHit: THREE.Vector3 = new THREE.Vector3();

  // 框選專用 3D 視覺物件
  private boxFillMesh: THREE.Mesh;
  private boxOutlineLine: THREE.LineLoop;
  private boxFillMatResidential: THREE.MeshBasicMaterial;
  private boxFillMatIndustrial: THREE.MeshBasicMaterial;
  private boxFillMatDezone: THREE.MeshBasicMaterial;
  private boxBorderMatResidential: THREE.LineBasicMaterial;
  private boxBorderMatIndustrial: THREE.LineBasicMaterial;
  private boxBorderMatDezone: THREE.LineBasicMaterial;

  // 射線與碰撞平面
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // 共享材質與幾何體 (配合 0.5m 小格子)
  private sharedCellGeo: THREE.PlaneGeometry = new THREE.PlaneGeometry(0.46, 0.46);
  private residentialMat: THREE.MeshStandardMaterial;
  private industrialMat: THREE.MeshStandardMaterial;
  private hoverMatResidential: THREE.MeshBasicMaterial;
  private hoverMatIndustrial: THREE.MeshBasicMaterial;
  private hoverMatDezone: THREE.MeshBasicMaterial;

  // 外部狀態回調
  private onToolClosed?: () => void;
  private previewCallback?: ((info: ZoningPreviewInfo | null) => void) | null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    cameraManager: CameraManager,
    roadNetwork: RoadNetwork
  ) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.cameraManager = cameraManager;
    this.roadNetwork = roadNetwork;

    this.zoningContainer = new THREE.Group();
    this.zoningContainer.name = 'ZoningSystem';
    this.scene.add(this.zoningContainer);

    this.fillGroup = new THREE.Group();
    this.fillGroup.name = 'ZoningFills';
    this.fillGroup.visible = false;
    this.zoningContainer.add(this.fillGroup);

    // 1. 住宅區綠色色塊材質
    this.residentialMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e, // 翠綠色
      emissive: 0x15803d,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // 1.1 工業區琥珀黃色塊材質
    this.industrialMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // 琥珀黃
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // 2. 懸浮筆刷指示框材質
    this.hoverMatResidential = new THREE.MeshBasicMaterial({
      color: 0x4ade80, // 明亮螢光綠
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });

    this.hoverMatIndustrial = new THREE.MeshBasicMaterial({
      color: 0xfbbf24, // 明亮琥珀黃
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });

    this.hoverMatDezone = new THREE.MeshBasicMaterial({
      color: 0xf87171, // 刪除警示紅
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });

    // 懸浮筆刷框幾何體 (稍大於 0.5m 小格子)
    const hoverGeo = new THREE.PlaneGeometry(0.49, 0.49);
    this.hoverBrushMesh = new THREE.Mesh(hoverGeo, this.hoverMatResidential);
    this.hoverBrushMesh.rotation.x = -Math.PI / 2;
    this.hoverBrushMesh.position.y = 0.032;
    this.hoverBrushMesh.visible = false;
    this.zoningContainer.add(this.hoverBrushMesh);

    // 3. 框選大面積劃分專用材質與視覺物件
    this.boxFillMatResidential = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.boxFillMatIndustrial = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.boxFillMatDezone = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.boxBorderMatResidential = new THREE.LineBasicMaterial({
      color: 0x86efac, // 明亮淺螢光綠
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    this.boxBorderMatIndustrial = new THREE.LineBasicMaterial({
      color: 0xfde68a, // 明亮淺琥珀黃
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    this.boxBorderMatDezone = new THREE.LineBasicMaterial({
      color: 0xfca5a5, // 明亮淺警示紅
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    // 框選 1x1 基礎平面，動態縮放以配合任何框選矩形
    const boxBaseGeo = new THREE.PlaneGeometry(1, 1);
    this.boxFillMesh = new THREE.Mesh(boxBaseGeo, this.boxFillMatResidential);
    this.boxFillMesh.rotation.x = -Math.PI / 2;
    this.boxFillMesh.position.y = 0.034;
    this.boxFillMesh.renderOrder = 10;
    this.boxFillMesh.visible = false;

    // 框選四邊輪廓線 (LineLoop)
    const borderPoints = [
      new THREE.Vector3(-0.5, -0.5, 0.002),
      new THREE.Vector3(0.5, -0.5, 0.002),
      new THREE.Vector3(0.5, 0.5, 0.002),
      new THREE.Vector3(-0.5, 0.5, 0.002),
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    this.boxOutlineLine = new THREE.LineLoop(borderGeo, this.boxBorderMatResidential);
    this.boxOutlineLine.renderOrder = 11;
    this.boxFillMesh.add(this.boxOutlineLine);

    this.zoningContainer.add(this.boxFillMesh);

    // 初始化事件與初始路網掃描
    this.bindEvents();
    this.rebuildZoningGrid();
  }

  public setToolClosedCallback(cb: () => void): void {
    this.onToolClosed = cb;
  }

  public setPreviewCallback(cb: (info: ZoningPreviewInfo | null) => void): void {
    this.previewCallback = cb;
  }

  public getIsToolActive(): boolean {
    return this.isToolActive;
  }

  public getCurrentMode(): 'Residential' | 'Industrial' | 'Dezone' {
    return this.currentMode;
  }

  public getToolMode(): ZoningToolMode {
    return this.toolMode;
  }

  public setToolMode(mode: ZoningToolMode): void {
    if (this.toolMode === mode) return;
    this.cancelBoxDrag();
    this.toolMode = mode;
    this.updateHoverBrushMaterial();
  }

  public getCells(): Map<string, ZoningCell> {
    return this.cells;
  }

  public getCell(key: string): ZoningCell | undefined {
    return this.cells.get(key);
  }

  public isCellResidential(zx: number, zz: number): boolean {
    const cell = this.cells.get(`${zx},${zz}`);
    return cell !== undefined && cell.zoneType === 'Residential';
  }

  public isCellIndustrial(zx: number, zz: number): boolean {
    const cell = this.cells.get(`${zx},${zz}`);
    return cell !== undefined && cell.zoneType === 'Industrial';
  }

  /**
   * 開啟或關閉土地劃分工具
   */
  public setToolActive(
    active: boolean,
    mode: 'Residential' | 'Industrial' | 'Dezone' = 'Residential'
  ): void {
    this.isToolActive = active;
    this.currentMode = mode;
    this.isMouseDown = false;
    this.cancelBoxDrag();

    // 開啟時停用 RTS 相機左鍵拖曳，使滑鼠左鍵可用於塗抹劃分
    this.cameraManager.setLeftDragEnabled(!active);

    // 網格線與分區地塊顏色僅在劃分工具開啟時呈現，選單關閉時完全隱藏保持視野純淨
    if (this.gridLinesMesh) {
      this.gridLinesMesh.visible = active;
    }
    this.fillGroup.visible = active;
    this.hoverBrushMesh.visible = false;
    if (this.boxFillMesh) {
      this.boxFillMesh.visible = false;
    }

    this.updateHoverBrushMaterial();
    this.updateBoxMaterials();
  }

  /**
   * 切換劃分模式（住宅區 vs 工業區 vs 清除劃分）
   */
  public setZoneMode(mode: 'Residential' | 'Industrial' | 'Dezone'): void {
    this.currentMode = mode;
    this.updateHoverBrushMaterial();
    this.updateBoxMaterials();
  }

  private updateHoverBrushMaterial(): void {
    if (this.currentMode === 'Residential') {
      this.hoverBrushMesh.material = this.hoverMatResidential;
    } else if (this.currentMode === 'Industrial') {
      this.hoverBrushMesh.material = this.hoverMatIndustrial;
    } else {
      this.hoverBrushMesh.material = this.hoverMatDezone;
    }
  }

  private updateBoxMaterials(): void {
    if (!this.boxFillMesh || !this.boxOutlineLine) return;
    if (this.currentMode === 'Residential') {
      this.boxFillMesh.material = this.boxFillMatResidential;
      this.boxOutlineLine.material = this.boxBorderMatResidential;
    } else if (this.currentMode === 'Industrial') {
      this.boxFillMesh.material = this.boxFillMatIndustrial;
      this.boxOutlineLine.material = this.boxBorderMatIndustrial;
    } else {
      this.boxFillMesh.material = this.boxFillMatDezone;
      this.boxOutlineLine.material = this.boxBorderMatDezone;
    }
  }

  /**
   * 取消當前框選作業並隱藏視覺效果
   */
  public cancelBoxDrag(): void {
    this.isBoxDragging = false;
    if (this.boxFillMesh) {
      this.boxFillMesh.visible = false;
    }
    if (this.previewCallback) {
      this.previewCallback(null);
    }
  }

  /**
   * 根據起點與當前點計算框選空間尺寸並更新 3D 視覺變換
   */
  private updateBoxTransform(): void {
    const minZx = Math.min(this.boxStartZx, this.boxCurrentZx);
    const maxZx = Math.max(this.boxStartZx, this.boxCurrentZx);
    const minZz = Math.min(this.boxStartZz, this.boxCurrentZz);
    const maxZz = Math.max(this.boxStartZz, this.boxCurrentZz);

    const minX = minZx * this.CELL_SIZE;
    const maxX = (maxZx + 1) * this.CELL_SIZE;
    const minZ = minZz * this.CELL_SIZE;
    const maxZ = (maxZz + 1) * this.CELL_SIZE;

    const width = Math.max(0.01, maxX - minX);
    const depth = Math.max(0.01, maxZ - minZ);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    this.boxFillMesh.position.set(centerX, 0.034, centerZ);
    this.boxFillMesh.scale.set(width, depth, 1);
  }

  /**
   * 送出框選結果：對框選範圍內所有路側有效分區格位統一賦予用途或清除
   */
  private commitBoxSelection(): void {
    if (!this.isBoxDragging) return;

    const minZx = Math.min(this.boxStartZx, this.boxCurrentZx);
    const maxZx = Math.max(this.boxStartZx, this.boxCurrentZx);
    const minZz = Math.min(this.boxStartZz, this.boxCurrentZz);
    const maxZz = Math.max(this.boxStartZz, this.boxCurrentZz);

    const targetType: ZoneType =
      this.currentMode === 'Residential'
        ? 'Residential'
        : this.currentMode === 'Industrial'
        ? 'Industrial'
        : 'None';

    for (let zx = minZx; zx <= maxZx; zx++) {
      for (let zz = minZz; zz <= maxZz; zz++) {
        const key = `${zx},${zz}`;
        const cell = this.cells.get(key);
        if (cell && cell.zoneType !== targetType) {
          cell.zoneType = targetType;
          this.createOrUpdateCellMesh(cell);
        }
      }
    }

    this.cancelBoxDrag();
  }

  /**
   * 根據全地圖道路拓撲，動態重新計算並生成道路兩側的垂直 1m 小格子
   */
  public rebuildZoningGrid(): void {
    // 1. 保留玩家已劃分的分區狀態
    const prevZoneState = new Map<string, ZoneType>();
    for (const [key, cell] of this.cells) {
      if (cell.zoneType !== 'None') {
        prevZoneState.set(key, cell.zoneType);
      }
    }

    // 2. 清理現存填滿網格
    while (this.fillGroup.children.length > 0) {
      const child = this.fillGroup.children.pop();
      if (child) this.fillGroup.remove(child);
    }
    this.cells.clear();

    const roadTiles = Array.from(this.roadNetwork.getAllTiles());
    if (roadTiles.length === 0) {
      this.rebuildGridLinesMesh([]);
      return;
    }

    const candidateCells = new Map<string, { zx: number; zz: number }>();

    // 3. 遍歷每個道路單元，向開口外側垂直投影 8 層 0.5m 格位 (向外延伸 4m，每格 0.5m)
    for (const tile of roadTiles) {
      const { gx, gz } = tile;

      // 檢查四向是否已有相連道路
      const hasN = this.roadNetwork.hasTile(`${gx},${gz - 2}`);
      const hasS = this.roadNetwork.hasTile(`${gx},${gz + 2}`);
      const hasE = this.roadNetwork.hasTile(`${gx + 2},${gz}`);
      const hasW = this.roadNetwork.hasTile(`${gx - 2},${gz}`);

      // 西側 (-X 側垂直發散)
      if (!hasW) {
        const zxEdge = Math.round((gx - 1.0) / this.CELL_SIZE);
        const zzStart = Math.round((gz - 1.0) / this.CELL_SIZE);
        for (let d = 0; d < this.ZONING_DEPTH; d++) {
          const zx = zxEdge - 1 - d;
          for (let k = 0; k < 4; k++) {
            const zz = zzStart + k;
            candidateCells.set(`${zx},${zz}`, { zx, zz });
          }
        }
      }

      // 東側 (+X 側垂直發散)
      if (!hasE) {
        const zxEdge = Math.round((gx + 1.0) / this.CELL_SIZE);
        const zzStart = Math.round((gz - 1.0) / this.CELL_SIZE);
        for (let d = 0; d < this.ZONING_DEPTH; d++) {
          const zx = zxEdge + d;
          for (let k = 0; k < 4; k++) {
            const zz = zzStart + k;
            candidateCells.set(`${zx},${zz}`, { zx, zz });
          }
        }
      }

      // 北側 (-Z 側垂直發散)
      if (!hasN) {
        const zzEdge = Math.round((gz - 1.0) / this.CELL_SIZE);
        const zxStart = Math.round((gx - 1.0) / this.CELL_SIZE);
        for (let d = 0; d < this.ZONING_DEPTH; d++) {
          const zz = zzEdge - 1 - d;
          for (let k = 0; k < 4; k++) {
            const zx = zxStart + k;
            candidateCells.set(`${zx},${zz}`, { zx, zz });
          }
        }
      }

      // 南側 (+Z 側垂直發散)
      if (!hasS) {
        const zzEdge = Math.round((gz + 1.0) / this.CELL_SIZE);
        const zxStart = Math.round((gx - 1.0) / this.CELL_SIZE);
        for (let d = 0; d < this.ZONING_DEPTH; d++) {
          const zz = zzEdge + d;
          for (let k = 0; k < 4; k++) {
            const zx = zxStart + k;
            candidateCells.set(`${zx},${zz}`, { zx, zz });
          }
        }
      }
    }

    // 4. 篩選：格位絕不可與任何現存車道路塊（2m x 2m）重疊
    const validCells: ZoningCell[] = [];

    for (const [key, pos] of candidateCells) {
      const worldX = (pos.zx + 0.5) * this.CELL_SIZE;
      const worldZ = (pos.zz + 0.5) * this.CELL_SIZE;

      // 確保小格子不超出建設區邊界 (-100 ~ 100)
      if (worldX < -100 || worldX > 100 || worldZ < -100 || worldZ > 100) {
        continue;
      }

      if (!this.isOverlappingRoad(worldX, worldZ, roadTiles)) {
        const zoneType = prevZoneState.get(key) ?? 'None';
        const cell: ZoningCell = {
          key,
          zx: pos.zx,
          zz: pos.zz,
          worldX,
          worldZ,
          zoneType,
        };
        this.cells.set(key, cell);
        validCells.push(cell);

        // 若原先為住宅區或工業區，恢復色塊渲染
        if (zoneType === 'Residential' || zoneType === 'Industrial') {
          this.createOrUpdateCellMesh(cell);
        }
      }
    }

    // 5. 重新生成 3D 格線段與設定可見性
    this.rebuildGridLinesMesh(validCells);
    this.fillGroup.visible = this.isToolActive;
  }

  /**
   * 檢查 0.5m x 0.5m 小格位中心點是否落在任何 2m 道路內部
   */
  private isOverlappingRoad(cx: number, cz: number, roadTiles: RoadTile[]): boolean {
    for (let i = 0; i < roadTiles.length; i++) {
      const t = roadTiles[i];
      // 道路以 (gx, gz) 為中心，寬深各 2m (邊界 ±1.0m)
      if (Math.abs(cx - t.gx) < 0.98 && Math.abs(cz - t.gz) < 0.98) {
        return true;
      }
    }
    return false;
  }

  /**
   * 依據有效小格子集合，動態組合出無重複邊線的 3D LineSegments 網格線
   */
  private rebuildGridLinesMesh(validCells: ZoningCell[]): void {
    if (this.gridLinesMesh) {
      this.zoningContainer.remove(this.gridLinesMesh);
      this.gridLinesMesh.geometry.dispose();
      this.gridLinesMesh = null;
    }

    if (validCells.length === 0) return;

    // 收集所有小格子的四條邊線，並透過 Set 去除共用邊線
    const edgeSet = new Set<string>();

    for (const cell of validCells) {
      const x0 = cell.zx;
      const x1 = cell.zx + 1;
      const z0 = cell.zz;
      const z1 = cell.zz + 1;

      // 四邊線標準化字串 (x小在先，z小在先)
      const eBottom = `${x0},${z0}_${x1},${z0}`;
      const eTop = `${x0},${z1}_${x1},${z1}`;
      const eLeft = `${x0},${z0}_${x0},${z1}`;
      const eRight = `${x1},${z0}_${x1},${z1}`;

      edgeSet.add(eBottom);
      edgeSet.add(eTop);
      edgeSet.add(eLeft);
      edgeSet.add(eRight);
    }

    const positions: number[] = [];
    const lineY = 0.024; // 貼近地面且高於草地

    for (const edge of edgeSet) {
      const [p1, p2] = edge.split('_');
      const [x1, z1] = p1.split(',').map(Number);
      const [x2, z2] = p2.split(',').map(Number);

      positions.push(x1 * this.CELL_SIZE, lineY, z1 * this.CELL_SIZE);
      positions.push(x2 * this.CELL_SIZE, lineY, z2 * this.CELL_SIZE);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8, // 質感亮水藍細線
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    this.gridLinesMesh = new THREE.LineSegments(geo, lineMat);
    this.gridLinesMesh.visible = this.isToolActive;
    this.zoningContainer.add(this.gridLinesMesh);
  }

  /**
   * 為指定小格子建立或更新分區色塊 (住宅區綠色 / 工業區琥珀黃)
   */
  private createOrUpdateCellMesh(cell: ZoningCell): void {
    if (cell.zoneType === 'Residential' || cell.zoneType === 'Industrial') {
      const mat = cell.zoneType === 'Residential' ? this.residentialMat : this.industrialMat;
      if (!cell.mesh) {
        const mesh = new THREE.Mesh(this.sharedCellGeo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cell.worldX, 0.022, cell.worldZ);
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        this.fillGroup.add(mesh);
        cell.mesh = mesh;
      } else {
        cell.mesh.material = mat;
      }
    } else {
      if (cell.mesh) {
        this.fillGroup.remove(cell.mesh);
        cell.mesh = undefined;
      }
    }
  }

  /**
   * 對座標進行塗抹操作（指派住宅區、工業區或清除）
   */
  private applyZoningAtWorldPos(worldX: number, worldZ: number, overrideType?: ZoneType): void {
    const zx = Math.floor(worldX / this.CELL_SIZE);
    const zz = Math.floor(worldZ / this.CELL_SIZE);
    const key = `${zx},${zz}`;

    const cell = this.cells.get(key);
    if (!cell) return;

    const targetType: ZoneType =
      overrideType !== undefined
        ? overrideType
        : this.currentMode === 'Residential'
        ? 'Residential'
        : this.currentMode === 'Industrial'
        ? 'Industrial'
        : 'None';

    if (cell.zoneType !== targetType) {
      cell.zoneType = targetType;
      this.createOrUpdateCellMesh(cell);
    }
  }

  /**
   * 取得滑鼠在地面 Y=0 的射線交點
   */
  private getMouseGroundIntersection(e: MouseEvent): THREE.Vector3 | null {
    const rect = this.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);
    return hit ? hitPoint : null;
  }

  private bindEvents(): void {
    // 1. 滑鼠移動：塗抹模式連續指派 / 框選模式動態拉伸矩形與統計
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isToolActive) return;

      const hit = this.getMouseGroundIntersection(e);
      if (!hit) {
        if (!this.isBoxDragging) {
          this.hoverBrushMesh.visible = false;
        }
        return;
      }

      if (this.toolMode === 'box') {
        if (this.isBoxDragging) {
          this.hoverBrushMesh.visible = false;
          this.boxCurrentZx = Math.floor(hit.x / this.CELL_SIZE);
          this.boxCurrentZz = Math.floor(hit.z / this.CELL_SIZE);
          this.boxCurrentHit.copy(hit);
          this.updateBoxTransform();

          const minZx = Math.min(this.boxStartZx, this.boxCurrentZx);
          const maxZx = Math.max(this.boxStartZx, this.boxCurrentZx);
          const minZz = Math.min(this.boxStartZz, this.boxCurrentZz);
          const maxZz = Math.max(this.boxStartZz, this.boxCurrentZz);
          const widthCells = maxZx - minZx + 1;
          const depthCells = maxZz - minZz + 1;

          let cellCount = 0;
          for (let zx = minZx; zx <= maxZx; zx++) {
            for (let zz = minZz; zz <= maxZz; zz++) {
              if (this.cells.has(`${zx},${zz}`)) {
                cellCount++;
              }
            }
          }

          if (this.previewCallback) {
            this.previewCallback({
              isDragging: true,
              widthCells,
              depthCells,
              cellCount,
              mode: this.currentMode,
            });
          }
        } else {
          // 未拖曳狀態：指示游標所在之 0.5m 分區小格
          const zx = Math.floor(hit.x / this.CELL_SIZE);
          const zz = Math.floor(hit.z / this.CELL_SIZE);
          const cell = this.cells.get(`${zx},${zz}`);
          if (cell) {
            this.hoverBrushMesh.visible = true;
            this.hoverBrushMesh.position.set(cell.worldX, 0.032, cell.worldZ);
          } else {
            this.hoverBrushMesh.visible = false;
          }
        }
      } else {
        // 塗抹模式 (Brush)
        const zx = Math.floor(hit.x / this.CELL_SIZE);
        const zz = Math.floor(hit.z / this.CELL_SIZE);
        const cell = this.cells.get(`${zx},${zz}`);

        if (cell) {
          this.hoverBrushMesh.visible = true;
          this.hoverBrushMesh.position.set(cell.worldX, 0.032, cell.worldZ);

          // 若滑鼠按下中，執行連續拖曳塗抹
          if (this.isMouseDown) {
            if (this.currentMouseButton === 2) {
              // 右鍵拖曳：清除分區
              this.applyZoningAtWorldPos(hit.x, hit.z, 'None');
            } else {
              // 左鍵拖曳：依當前模式塗抹
              this.applyZoningAtWorldPos(hit.x, hit.z);
            }
          }
        } else {
          this.hoverBrushMesh.visible = false;
        }
      }
    });

    // 2. 滑鼠按下：塗抹模式立即塗抹 / 框選模式確立起始角點
    this.domElement.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.isToolActive) return;

      if (this.toolMode === 'box') {
        if (e.button === 0) {
          // 左鍵：開始框選
          const hit = this.getMouseGroundIntersection(e);
          if (hit) {
            this.isBoxDragging = true;
            this.boxStartZx = Math.floor(hit.x / this.CELL_SIZE);
            this.boxStartZz = Math.floor(hit.z / this.CELL_SIZE);
            this.boxStartHit.copy(hit);
            this.boxCurrentZx = this.boxStartZx;
            this.boxCurrentZz = this.boxStartZz;
            this.boxCurrentHit.copy(hit);

            this.hoverBrushMesh.visible = false;
            this.updateBoxMaterials();
            this.updateBoxTransform();
            this.boxFillMesh.visible = true;

            const initialCount = this.cells.has(`${this.boxStartZx},${this.boxStartZz}`) ? 1 : 0;
            if (this.previewCallback) {
              this.previewCallback({
                isDragging: true,
                widthCells: 1,
                depthCells: 1,
                cellCount: initialCount,
                mode: this.currentMode,
              });
            }
          }
        } else if (e.button === 2) {
          // 右鍵：若正在框選中則立即取消；否則單擊清除游標下分區
          if (this.isBoxDragging) {
            e.preventDefault();
            e.stopPropagation();
            this.cancelBoxDrag();
          } else {
            const hit = this.getMouseGroundIntersection(e);
            if (hit) {
              this.applyZoningAtWorldPos(hit.x, hit.z, 'None');
            }
          }
        }
      } else {
        // 塗抹模式 (Brush)
        if (e.button === 0 || e.button === 2) {
          this.isMouseDown = true;
          this.currentMouseButton = e.button;

          const hit = this.getMouseGroundIntersection(e);
          if (hit) {
            if (e.button === 2) {
              this.applyZoningAtWorldPos(hit.x, hit.z, 'None');
            } else {
              this.applyZoningAtWorldPos(hit.x, hit.z);
            }
          }
        }
      }
    });

    // 3. 滑鼠放開：框選模式批次送出用途 / 塗抹模式停止塗抹
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (!this.isToolActive) return;

      if (this.toolMode === 'box') {
        if (this.isBoxDragging && e.button === 0) {
          this.commitBoxSelection();
        }
      } else {
        if (this.isMouseDown) {
          this.isMouseDown = false;
        }
      }
    });

    // 4. 視窗失焦防禦
    window.addEventListener('blur', () => {
      if (this.isBoxDragging) {
        this.cancelBoxDrag();
      }
      this.isMouseDown = false;
    });

    // 5. 禁用劃分狀態下的右鍵選單
    this.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
      if (this.isToolActive) {
        e.preventDefault();
      }
    });

    // 6. 鍵盤 ESC 退出框選或退出工具
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isToolActive) {
        if (this.isBoxDragging) {
          this.cancelBoxDrag();
          return;
        }
        this.setToolActive(false);
        if (this.onToolClosed) {
          this.onToolClosed();
        }
      }
    });
  }

  /**
   * 取得所有分區小格子統計資訊
   */
  public getZoningStats(): { totalCells: number; residentialCount: number; industrialCount: number } {
    let residentialCount = 0;
    let industrialCount = 0;
    for (const cell of this.cells.values()) {
      if (cell.zoneType === 'Residential') {
        residentialCount++;
      } else if (cell.zoneType === 'Industrial') {
        industrialCount++;
      }
    }
    return {
      totalCells: this.cells.size,
      residentialCount,
      industrialCount,
    };
  }

  public getAllCells(): IterableIterator<ZoningCell> {
    return this.cells.values();
  }
}
