import * as THREE from 'three';

/**
 * RTS 視角相機管理器
 * 支援：
 * 1. 右鍵按著拖曳：調整鏡頭水平 Yaw 與俯仰 Pitch 角度
 * 2. 左鍵按著拖曳：依地平面（XZ）抓取平移畫面
 * 3. 滾輪滾動：縮放鏡頭距離 (Zoom)
 */
export class CameraManager {
  public camera: THREE.PerspectiveCamera;
  public domElement: HTMLElement;
  public target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  // 球面座標控制參數
  private distance: number = 60;
  private minDistance: number = 8;
  private maxDistance: number = 180;

  private pitch: number = Math.PI / 4; // 初始俯角 45 度
  private minPitch: number = (10 * Math.PI) / 180; // 避免鑽入地下 (最小 10 度)
  private maxPitch: number = (85 * Math.PI) / 180; // 避免萬向節死鎖 (最大 85 度)

  private yaw: number = (45 * Math.PI) / 180; // 初始偏航角 45 度

  // 平滑插值目標
  private targetDistance: number = 60;
  private targetPitch: number = Math.PI / 4;
  private targetYaw: number = (45 * Math.PI) / 180;
  private targetPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  // 互動狀態追蹤
  private isLeftDragging: boolean = false;
  private isRightDragging: boolean = false;
  private isMiddleDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private pressedKeys: Set<string> = new Set();

  // 控制左鍵是否啟用平移（當建造工具啟用時，左鍵保留給建造使用）
  public isLeftDragEnabled: boolean = true;

  // 地面射線檢測（實現直覺的抓地拖曳感）
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private dragStartGroundPoint: THREE.Vector3 = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.bindEvents();
    this.updateCameraImmediate();
  }

  private bindEvents(): void {
    // 阻止右鍵快顯功能表
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // 滑鼠按鍵按下
    this.domElement.addEventListener('mousedown', (e: MouseEvent) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (e.button === 0 && this.isLeftDragEnabled) {
        // 左鍵：開始平移地圖（未啟用建造工具時）
        this.isLeftDragging = true;
        this.domElement.style.cursor = 'grab';
        const hit = this.getGroundIntersection(e.clientX, e.clientY);
        if (hit) {
          this.dragStartGroundPoint.copy(hit);
        }
      } else if (e.button === 1) {
        // 中鍵：隨時支援平移地圖（即便建造模式中也能平移）
        this.isMiddleDragging = true;
        this.domElement.style.cursor = 'grab';
        const hit = this.getGroundIntersection(e.clientX, e.clientY);
        if (hit) {
          this.dragStartGroundPoint.copy(hit);
        }
      } else if (e.button === 2) {
        // 右鍵：開始旋轉視角
        this.isRightDragging = true;
        this.domElement.style.cursor = 'crosshair';
      }
    });

    // 滑鼠移動
    window.addEventListener('mousemove', (e: MouseEvent) => {
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.isRightDragging) {
        // 右鍵拖曳：旋轉視角 (Yaw & Pitch)
        const rotateSpeed = 0.005;
        this.targetYaw -= deltaX * rotateSpeed;
        this.targetPitch = Math.max(
          this.minPitch,
          Math.min(this.maxPitch, this.targetPitch + deltaY * rotateSpeed)
        );
      } else if (this.isLeftDragging || this.isMiddleDragging) {
        // 左鍵或中鍵拖曳：平移地圖
        const currentHit = this.getGroundIntersection(e.clientX, e.clientY);
        if (currentHit && this.dragStartGroundPoint) {
          // 抓地移動量：起始抓點 - 當前照射點
          const deltaGround = new THREE.Vector3()
            .subVectors(this.dragStartGroundPoint, currentHit);
          
          this.targetPosition.add(deltaGround);
          this.target.add(deltaGround);

          // 重新更新抓取錨點
          const newHit = this.getGroundIntersection(e.clientX, e.clientY);
          if (newHit) {
            this.dragStartGroundPoint.copy(newHit);
          }
        } else {
          // 射線未射中地平面時的備援方案（依相機航向直接位移）
          const panSpeed = this.distance * 0.0015;
          const forward = new THREE.Vector3(
            -Math.sin(this.targetYaw),
            0,
            -Math.cos(this.targetYaw)
          ).normalize();
          const right = new THREE.Vector3(
            Math.cos(this.targetYaw),
            0,
            -Math.sin(this.targetYaw)
          ).normalize();

          const move = right
            .clone()
            .multiplyScalar(-deltaX * panSpeed)
            .add(forward.clone().multiplyScalar(deltaY * panSpeed));

          this.targetPosition.add(move);
          this.target.add(move);
        }
      }
    });

    // 滑鼠按鍵放開
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) {
        this.isLeftDragging = false;
        if (!this.isRightDragging && !this.isMiddleDragging) {
          this.domElement.style.cursor = 'default';
        }
      } else if (e.button === 1) {
        this.isMiddleDragging = false;
        if (!this.isRightDragging && !this.isLeftDragging) {
          this.domElement.style.cursor = 'default';
        }
      } else if (e.button === 2) {
        this.isRightDragging = false;
        if (!this.isLeftDragging && !this.isMiddleDragging) {
          this.domElement.style.cursor = 'default';
        }
      }
    });

    // 滾輪縮放
    this.domElement.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.0012;
      const zoomFactor = Math.exp(e.deltaY * zoomSensitivity);
      
      this.targetDistance = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, this.targetDistance * zoomFactor)
      );
    }, { passive: false });

    // 鍵盤 WASD / 方向鍵平移視角
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.pressedKeys.add(e.code);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.code);
    });
  }

  /**
   * 切換左鍵地圖平移功能的啟用狀態（提供給建造工具模式切換）
   */
  public setLeftDragEnabled(enabled: boolean): void {
    this.isLeftDragEnabled = enabled;
    if (!enabled) {
      this.isLeftDragging = false;
      this.domElement.style.cursor = 'default';
    }
  }

  /**
   * 取得螢幕座標對應到地面 (Y=0) 的交點
   */
  private getGroundIntersection(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);
    const hitPoint = new THREE.Vector3();
    const intersects = this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);
    return intersects ? hitPoint : null;
  }

  /**
   * 立即更新相機位置與朝向
   */
  private updateCameraImmediate(): void {
    const x = this.target.x + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw);
    const y = this.target.y + this.distance * Math.sin(this.pitch);
    const z = this.target.z + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  /**
   * 每幀更新呼叫（實現絲滑平滑阻尼與鍵盤 WASD 移動）
   * @param deltaTime 距上一幀的秒數 (預設 0.016s)
   */
  public update(deltaTime: number = 0.016): void {
    // 1. 處理 WASD / 上左下右方向鍵視角平移
    if (this.pressedKeys.size > 0) {
      const forward = new THREE.Vector3(
        -Math.sin(this.targetYaw),
        0,
        -Math.cos(this.targetYaw)
      ).normalize();

      const right = new THREE.Vector3(
        Math.cos(this.targetYaw),
        0,
        -Math.sin(this.targetYaw)
      ).normalize();

      const moveDir = new THREE.Vector3();
      if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) moveDir.add(forward);
      if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) moveDir.sub(forward);
      if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) moveDir.sub(right);
      if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) moveDir.add(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        // 移動速度依當前鏡頭距離自適應（拉遠移動快，拉近更細緻）
        const panSpeed = Math.max(25, this.targetDistance * 0.95);
        const moveDelta = moveDir.multiplyScalar(panSpeed * deltaTime);

        this.targetPosition.add(moveDelta);
        this.target.add(moveDelta);
      }
    }

    const lerpDamp = 0.12;

    this.distance += (this.targetDistance - this.distance) * lerpDamp;
    this.pitch += (this.targetPitch - this.pitch) * lerpDamp;
    this.yaw += (this.targetYaw - this.yaw) * lerpDamp;

    const x = this.target.x + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw);
    const y = this.target.y + this.distance * Math.sin(this.pitch);
    const z = this.target.z + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}
