import * as THREE from 'three';
import { CameraManager } from '../rendering/CameraManager';
import { RoadTextureFactory } from '../rendering/RoadTextureFactory';
import { RoadNetwork } from './RoadNetwork';

export interface PlacedRoadTile {
  gx: number;
  gz: number;
  orientation: 'X' | 'Z';
}

export type TreasuryUpdater = (newTreasury: number) => void;

/**
 * 道路建造與網格吸附管理器 (RoadManager)
 * 負責：
 * 1. 網格吸附檢測 (Snap to 2m Minor Grid)
 * 2. 直線拖曳吸附預覽（水藍色半透明 / 費用計算）
 * 3. 銜接 RoadNetwork 管理路口斑馬線相交與紅綠燈狀態機
 * 4. 人性化互動流程（支援拖曳放置、點擊連續放置、右鍵/ESC取消）
 */
export class RoadManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private cameraManager: CameraManager;

  // 道路有向圖與拓撲管理器
  private roadNetwork: RoadNetwork;

  // 網格設定 (對應 TerrainRenderer 中的 2m 次要網格，建設區 -100 ~ 100)
  public readonly cellSize: number = 2;
  public readonly costPerCell: number = 10;
  private minBound: number = -100;
  private maxBound: number = 100;

  // 狀態管理
  private isToolActive: boolean = false;
  private isDragging: boolean = false;
  private startPoint: { gx: number; gz: number } | null = null;
  private currentHoverPoint: { gx: number; gz: number } | null = null;

  // 共享幾何體
  private roadGeometry: THREE.BoxGeometry;

  // 預覽網格群組
  private previewGroup: THREE.Group;

  // 外部資料鉤子 (國庫金錢扣減)
  private currentTreasury: number = 50000;
  private onTreasuryChange?: TreasuryUpdater;
  private onPreviewInfoChange?: (info: { cellCount: number; cost: number; isValid: boolean } | null) => void;
  private onRoadsPlaced?: () => void;

  // 射線器
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    cameraManager: CameraManager,
    initialTreasury: number = 50000
  ) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.cameraManager = cameraManager;
    this.currentTreasury = initialTreasury;

    // 初始化道路有向網路
    this.roadNetwork = new RoadNetwork(this.scene);

    // 寬 2m、厚度 0.05m、深 2m 的標準小格路塊
    this.roadGeometry = new THREE.BoxGeometry(this.cellSize, 0.05, this.cellSize);

    // 預覽容器
    this.previewGroup = new THREE.Group();
    this.scene.add(this.previewGroup);

    this.bindEvents();

    // 建立地圖南側邊界連接外部城市之初始車道與聯外門架
    this.initExternalConnection();
  }

  /**
   * 建立地圖南側邊界 (Z=97) 從西邊界 (-99) 貫通至東邊界 (+99) 的橫貫外部公路
   */
  private initExternalConnection(): void {
    const HIGHWAY_Z = 97;
    this.roadNetwork.createHighwayCorridor(HIGHWAY_Z, -99, 99);

    // 於西側與東側邊界各建立一座高規格高速公路門架
    this.createHighwayGantry(-99, HIGHWAY_Z, '西側邊界聯外公路 (West Highway Portal)');
    this.createHighwayGantry(99, HIGHWAY_Z, '東側邊界聯外公路 (East Highway Portal)');
  }

  private createHighwayGantry(gx: number, gz: number, title: string): void {
    const gantry = new THREE.Group();
    gantry.name = `HighwayGantry_${gx}`;

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // 鋼鐵灰
      roughness: 0.4,
      metalness: 0.7,
    });

    // 跨越東西向道路之南北雙側立柱 (Z 軸向跨立)
    const colGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8);
    const northCol = new THREE.Mesh(colGeo, steelMat);
    northCol.position.set(gx, 1.7, gz - 1.6);
    gantry.add(northCol);

    const southCol = new THREE.Mesh(colGeo, steelMat);
    southCol.position.set(gx, 1.7, gz + 1.6);
    gantry.add(southCol);

    // 頂部跨樑 (沿 Z 軸橫越車道)
    const beamGeo = new THREE.BoxGeometry(0.25, 0.16, 3.6);
    const beam = new THREE.Mesh(beamGeo, steelMat);
    beam.position.set(gx, 3.3, gz);
    gantry.add(beam);

    // 綠色高速公路聯外告示牌
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const ctx = signCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#15803d'; // 高速公路綠
      ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 500, 116);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🌐 ${title}`, 256, 44);
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.fillText('⚡ 邊境過境公路 ↔ 聯外交通幹線', 256, 88);
    }
    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const signGeo = new THREE.PlaneGeometry(2.4, 0.6);

    // 正面告示牌 (面向地圖內部)
    const signMeshIn = new THREE.Mesh(signGeo, signMat);
    signMeshIn.rotation.y = gx < 0 ? Math.PI / 2 : -Math.PI / 2;
    signMeshIn.position.set(gx + (gx < 0 ? 0.13 : -0.13), 2.65, gz);
    gantry.add(signMeshIn);

    // 反面告示牌 (面向地圖外部)
    const signMeshOut = new THREE.Mesh(signGeo, signMat);
    signMeshOut.rotation.y = gx < 0 ? -Math.PI / 2 : Math.PI / 2;
    signMeshOut.position.set(gx + (gx < 0 ? -0.13 : 0.13), 2.65, gz);
    gantry.add(signMeshOut);

    // 頂部黃色閃爍警示燈
    const lightGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const leftLight = new THREE.Mesh(lightGeo, lightMat);
    leftLight.position.set(gx, 3.45, gz - 1.2);
    gantry.add(leftLight);
    const rightLight = new THREE.Mesh(lightGeo, lightMat);
    rightLight.position.set(gx, 3.45, gz + 1.2);
    gantry.add(rightLight);

    this.scene.add(gantry);
  }

  public getRoadNetwork(): RoadNetwork {
    return this.roadNetwork;
  }

  /**
   * 每幀更新紅綠燈號誌倒數（由主渲染迴圈呼叫）
   */
  public update(deltaTime: number, isPaused: boolean = false): void {
    if (!isPaused) {
      this.roadNetwork.updateSignals(deltaTime);
    }
  }

  public setTreasuryCallbacks(
    updater: TreasuryUpdater,
    infoChange?: (info: { cellCount: number; cost: number; isValid: boolean } | null) => void
  ): void {
    this.onTreasuryChange = updater;
    this.onPreviewInfoChange = infoChange;
  }

  public setOnRoadsPlacedCallback(cb: () => void): void {
    this.onRoadsPlaced = cb;
  }

  public setTreasury(amount: number): void {
    this.currentTreasury = amount;
  }

  public getPlacedRoadCount(): number {
    let count = 0;
    for (const _ of this.roadNetwork.getAllTiles()) {
      count++;
    }
    return count;
  }

  /**
   * 啟用/關閉道路建造工具
   */
  public setToolActive(active: boolean): void {
    this.isToolActive = active;
    this.cameraManager.setLeftDragEnabled(!active);

    if (!active) {
      this.cancelPlacement();
    }
  }

  public getIsToolActive(): boolean {
    return this.isToolActive;
  }

  /**
   * 座標吸附至 2m 網格中心
   */
  public snapToGrid(worldX: number, worldZ: number): { gx: number; gz: number } | null {
    if (
      worldX < this.minBound ||
      worldX > this.maxBound ||
      worldZ < this.minBound ||
      worldZ > this.maxBound
    ) {
      return null;
    }

    const gx = Math.floor(worldX / this.cellSize) * this.cellSize + this.cellSize / 2;
    const gz = Math.floor(worldZ / this.cellSize) * this.cellSize + this.cellSize / 2;

    return { gx, gz };
  }

  /**
   * 取得滑鼠在地面上的交點
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

  /**
   * 計算從起始點到終點的直線車道清單（依需求強制直放，沿 X 或沿 Z）
   */
  private calculateStraightCells(
    start: { gx: number; gz: number },
    end: { gx: number; gz: number }
  ): { cells: Array<{ gx: number; gz: number }>; orientation: 'X' | 'Z' } {
    const dx = end.gx - start.gx;
    const dz = end.gz - start.gz;

    const cells: Array<{ gx: number; gz: number }> = [];

    if (Math.abs(dx) >= Math.abs(dz)) {
      // 沿 X 軸水平直放
      const orientation: 'X' = 'X';
      const step = dx >= 0 ? this.cellSize : -this.cellSize;
      const count = Math.round(Math.abs(dx) / this.cellSize);
      for (let i = 0; i <= count; i++) {
        cells.push({ gx: start.gx + i * step, gz: start.gz });
      }
      return { cells, orientation };
    } else {
      // 沿 Z 軸垂直直放
      const orientation: 'Z' = 'Z';
      const step = dz >= 0 ? this.cellSize : -this.cellSize;
      const count = Math.round(Math.abs(dz) / this.cellSize);
      for (let i = 0; i <= count; i++) {
        cells.push({ gx: start.gx, gz: start.gz + i * step });
      }
      return { cells, orientation };
    }
  }

  /**
   * 更新預覽投影
   */
  private updatePreview(): void {
    // 清除舊預覽網格
    while (this.previewGroup.children.length > 0) {
      const child = this.previewGroup.children.pop();
      if (child) this.previewGroup.remove(child);
    }

    if (!this.isToolActive || !this.currentHoverPoint) {
      if (this.onPreviewInfoChange) this.onPreviewInfoChange(null);
      return;
    }

    let targetCells: Array<{ gx: number; gz: number }> = [];
    let orientation: 'X' | 'Z' = 'Z';

    if (this.startPoint) {
      const result = this.calculateStraightCells(this.startPoint, this.currentHoverPoint);
      targetCells = result.cells;
      orientation = result.orientation;
    } else {
      targetCells = [this.currentHoverPoint];
      orientation = 'Z';
    }

    // 計算花費與是否合法
    const totalCost = targetCells.length * this.costPerCell;
    const hasEnoughMoney = this.currentTreasury >= totalCost;
    const previewMat = hasEnoughMoney
      ? RoadTextureFactory.getPreviewValidMaterial()
      : RoadTextureFactory.getPreviewInvalidMaterial();

    for (const cell of targetCells) {
      const mesh = new THREE.Mesh(this.roadGeometry, previewMat);
      mesh.position.set(cell.gx, 0.035, cell.gz);
      mesh.rotation.y = orientation === 'X' ? Math.PI / 2 : 0;
      this.previewGroup.add(mesh);
    }

    if (this.onPreviewInfoChange) {
      this.onPreviewInfoChange({
        cellCount: targetCells.length,
        cost: totalCost,
        isValid: hasEnoughMoney,
      });
    }
  }

  /**
   * 確認建造當前預覽的車道
   */
  private commitPlacement(): void {
    if (!this.startPoint || !this.currentHoverPoint) return;

    const { cells, orientation } = this.calculateStraightCells(this.startPoint, this.currentHoverPoint);
    const totalCost = cells.length * this.costPerCell;

    if (this.currentTreasury < totalCost) {
      console.warn('⚠️ 市政國庫存款不足，無法完成車道建設！');
      this.cancelPlacement();
      return;
    }

    for (const cell of cells) {
      // 透過 RoadNetwork 自動拓撲更新（自動判定直線相連、十字路口斑馬線、T字路口與紅綠燈）
      this.roadNetwork.addOrUpdateTile(cell.gx, cell.gz, orientation);
    }

    // 扣除國庫費用
    this.currentTreasury -= totalCost;
    if (this.onTreasuryChange) {
      this.onTreasuryChange(this.currentTreasury);
    }

    console.log(`🛣️ 成功鋪設 ${cells.length} 格雙向二線車道！扣除 $${totalCost}，剩餘: $${this.currentTreasury}`);

    // 通知外部路網更新（如土地劃分小格子同步更新）
    if (this.onRoadsPlaced) {
      this.onRoadsPlaced();
    }

    // 重設起點，支援連續建造
    this.startPoint = null;
    this.isDragging = false;
    this.updatePreview();
  }

  /**
   * 取消當前吸附/拖曳
   */
  public cancelPlacement(): void {
    this.startPoint = null;
    this.isDragging = false;
    this.updatePreview();
  }

  /**
   * 綁定滑鼠與鍵盤互動事件
   */
  private bindEvents(): void {
    // 滑鼠移動：即時吸附預覽
    this.domElement.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isToolActive) return;

      const hit = this.getMouseGroundIntersection(e);
      if (hit) {
        const snapped = this.snapToGrid(hit.x, hit.z);
        if (
          snapped &&
          (!this.currentHoverPoint ||
            this.currentHoverPoint.gx !== snapped.gx ||
            this.currentHoverPoint.gz !== snapped.gz)
        ) {
          this.currentHoverPoint = snapped;
          this.updatePreview();
        }
      } else {
        if (this.currentHoverPoint) {
          this.currentHoverPoint = null;
          this.updatePreview();
        }
      }
    });

    // 滑鼠按下：開始點擊/拖曳
    this.domElement.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.isToolActive) return;

      if (e.button === 0) {
        // 左鍵：設定起始點
        const hit = this.getMouseGroundIntersection(e);
        if (hit) {
          const snapped = this.snapToGrid(hit.x, hit.z);
          if (snapped) {
            if (!this.startPoint) {
              this.startPoint = snapped;
              this.isDragging = true;
              this.updatePreview();
            } else {
              // 連續點擊建造（Click-to-Click 模式）
              this.commitPlacement();
            }
          }
        }
      } else if (e.button === 2) {
        // 右鍵：取消拖曳或退出工具
        if (this.startPoint) {
          this.cancelPlacement();
        } else {
          this.setToolActive(false);
        }
      }
    });

    // 滑鼠放開：若處於按著拖曳模式則提交建造（Drag-and-Release 模式）
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (!this.isToolActive || e.button !== 0) return;

      if (this.isDragging && this.startPoint && this.currentHoverPoint) {
        // 如果起終點不同（即進行了實質拖曳），則在放開時立即建造
        const isMoved =
          this.startPoint.gx !== this.currentHoverPoint.gx ||
          this.startPoint.gz !== this.currentHoverPoint.gz;

        if (isMoved) {
          this.commitPlacement();
        }
      }
    });

    // 鍵盤 ESC 退出/取消
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isToolActive) {
        if (this.startPoint) {
          this.cancelPlacement();
        } else {
          this.setToolActive(false);
        }
      }
    });
  }
}
