import * as THREE from 'three';
import { RoadNetwork, RoadTile } from './RoadNetwork';
import { CameraManager } from '../rendering/CameraManager';

export type ZoneType = 'None' | 'Residential';

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
  private currentMode: 'Residential' | 'Dezone' = 'Residential';
  private isMouseDown: boolean = false;
  private currentMouseButton: number = 0; // 0: 左鍵, 2: 右鍵

  // 射線與碰撞平面
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // 共享材質與幾何體 (配合 0.5m 小格子)
  private sharedCellGeo: THREE.PlaneGeometry = new THREE.PlaneGeometry(0.46, 0.46);
  private residentialMat: THREE.MeshStandardMaterial;
  private hoverMatResidential: THREE.MeshBasicMaterial;
  private hoverMatDezone: THREE.MeshBasicMaterial;

  // 外部狀態回調
  private onToolClosed?: () => void;

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

    // 2. 懸浮筆刷指示框材質
    this.hoverMatResidential = new THREE.MeshBasicMaterial({
      color: 0x4ade80, // 明亮螢光綠
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

    // 初始化事件與初始路網掃描
    this.bindEvents();
    this.rebuildZoningGrid();
  }

  public setToolClosedCallback(cb: () => void): void {
    this.onToolClosed = cb;
  }

  public getIsToolActive(): boolean {
    return this.isToolActive;
  }

  public getCurrentMode(): 'Residential' | 'Dezone' {
    return this.currentMode;
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

  /**
   * 開啟或關閉土地劃分工具
   */
  public setToolActive(active: boolean, mode: 'Residential' | 'Dezone' = 'Residential'): void {
    this.isToolActive = active;
    this.currentMode = mode;
    this.isMouseDown = false;

    // 開啟時停用 RTS 相機左鍵拖曳，使滑鼠左鍵可用於塗抹劃分
    this.cameraManager.setLeftDragEnabled(!active);

    // 網格線與分區地塊顏色僅在劃分工具開啟時呈現，選單關閉時完全隱藏保持視野純淨
    if (this.gridLinesMesh) {
      this.gridLinesMesh.visible = active;
    }
    this.fillGroup.visible = active;
    this.hoverBrushMesh.visible = false;

    this.updateHoverBrushMaterial();
  }

  /**
   * 切換劃分模式（住宅區 vs 清除劃分）
   */
  public setZoneMode(mode: 'Residential' | 'Dezone'): void {
    this.currentMode = mode;
    this.updateHoverBrushMaterial();
  }

  private updateHoverBrushMaterial(): void {
    this.hoverBrushMesh.material =
      this.currentMode === 'Residential' ? this.hoverMatResidential : this.hoverMatDezone;
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

        // 若原先為住宅區，恢復綠色色塊渲染
        if (zoneType === 'Residential') {
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
   * 為指定小格子建立或更新綠色住宅區色塊
   */
  private createOrUpdateCellMesh(cell: ZoningCell): void {
    if (cell.zoneType === 'Residential') {
      if (!cell.mesh) {
        const mesh = new THREE.Mesh(this.sharedCellGeo, this.residentialMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cell.worldX, 0.022, cell.worldZ);
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        this.fillGroup.add(mesh);
        cell.mesh = mesh;
      }
    } else {
      if (cell.mesh) {
        this.fillGroup.remove(cell.mesh);
        cell.mesh = undefined;
      }
    }
  }

  /**
   * 對座標進行塗抹操作（指派住宅區或清除）
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
    // 1. 滑鼠移動：懸浮吸附高亮與拖曳塗抹
    this.domElement.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isToolActive) return;

      const hit = this.getMouseGroundIntersection(e);
      if (!hit) {
        this.hoverBrushMesh.visible = false;
        return;
      }

      const zx = Math.floor(hit.x / this.CELL_SIZE);
      const zz = Math.floor(hit.z / this.CELL_SIZE);
      const key = `${zx},${zz}`;

      const cell = this.cells.get(key);
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
    });

    // 2. 滑鼠按下：立即塗抹
    this.domElement.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.isToolActive) return;

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
    });

    // 3. 滑鼠放開
    window.addEventListener('mouseup', () => {
      if (this.isMouseDown) {
        this.isMouseDown = false;
      }
    });

    // 4. 禁用劃分狀態下的右鍵選單
    this.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
      if (this.isToolActive) {
        e.preventDefault();
      }
    });

    // 5. 鍵盤 ESC 退出工具
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isToolActive) {
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
  public getZoningStats(): { totalCells: number; residentialCount: number } {
    let residentialCount = 0;
    for (const cell of this.cells.values()) {
      if (cell.zoneType === 'Residential') {
        residentialCount++;
      }
    }
    return {
      totalCells: this.cells.size,
      residentialCount,
    };
  }

  public getAllCells(): IterableIterator<ZoningCell> {
    return this.cells.values();
  }
}
