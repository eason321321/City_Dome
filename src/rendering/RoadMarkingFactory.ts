import * as THREE from 'three';

export type ArrowType =
  | 'straight'
  | 'left'
  | 'right'
  | 'straight_left'
  | 'straight_right'
  | 'left_right'
  | 'all';

/**
 * 道路路面標線與路口轉彎引導線工廠 (RoadMarkingFactory)
 * 負責：
 * 1. 程序化繪製高解析度、抗鋸齒之車道導向箭頭標線紋理（直行、左轉、右轉、直行兼左轉、直行兼右轉、左右轉、三向通行）
 * 2. 依據路口允許通行方向，精準生成並吸附於路面之 3D 導向箭頭標線（Plane Mesh）
 * 3. 繪製路口內部轉彎軌跡之純白圓弧引導虛線（Turning Guide Lines）
 */
export class RoadMarkingFactory {
  private static arrowTextures: Map<ArrowType, THREE.CanvasTexture> = new Map();
  private static arrowMaterials: Map<ArrowType, THREE.MeshBasicMaterial> = new Map();
  private static arrowGeometry: THREE.PlaneGeometry | null = null;
  private static dashMaterial: THREE.MeshBasicMaterial | null = null;
  private static dashGeometry: THREE.PlaneGeometry | null = null;

  // 箭頭平面尺寸 (長 0.468m，寬 0.286m，依指示等比放大 1.3 倍，高空俯瞰更加清晰醒目)
  public static readonly ARROW_WIDTH = 0.286;
  public static readonly ARROW_LENGTH = 0.468;
  // 道路頂面位於 0.055m (BoxGeometry 高度 0.05m，中心在 0.03m: 0.03 + 0.025 = 0.055m)
  // 標線位於 0.0565m (高出路面 1.5mm)，搭配深度補償與無深度寫入，絕無 Z-fighting 且絕不被路面遮擋！
  public static readonly MARKING_HEIGHT = 0.0565;

  /**
   * 判定允許通行方向對應之箭頭類型
   */
  public static getArrowType(canStraight: boolean, canLeft: boolean, canRight: boolean): ArrowType {
    if (canStraight && canLeft && canRight) return 'all';
    if (canStraight && canLeft && !canRight) return 'straight_left';
    if (canStraight && !canLeft && canRight) return 'straight_right';
    if (!canStraight && canLeft && canRight) return 'left_right';
    if (canStraight && !canLeft && !canRight) return 'straight';
    if (!canStraight && canLeft && !canRight) return 'left';
    if (!canStraight && !canLeft && canRight) return 'right';
    return 'straight';
  }

  /**
   * 取得指定箭頭類型之超高解析 Canvas 紋理 (512x512，抗鋸齒清晰銳利)
   */
  public static getArrowTexture(type: ArrowType): THREE.CanvasTexture {
    let texture = this.arrowTextures.get(type);
    if (texture) return texture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // 清透透明底色
    ctx.clearRect(0, 0, 512, 512);

    // 2x 縮放以 256 座標系繪製高解析超採樣向量圖案
    ctx.save();
    ctx.scale(2, 2);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';

    switch (type) {
      case 'straight':
        this.renderStraightArrow(ctx);
        break;
      case 'left':
        this.renderLeftTurnArrow(ctx);
        break;
      case 'right':
        this.renderRightTurnArrow(ctx);
        break;
      case 'straight_left':
        this.renderStraightLeftArrow(ctx);
        break;
      case 'straight_right':
        this.renderStraightRightArrow(ctx);
        break;
      case 'left_right':
        this.renderLeftRightArrow(ctx);
        break;
      case 'all':
        this.renderAllArrow(ctx);
        break;
    }

    ctx.restore();

    texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.arrowTextures.set(type, texture);
    return texture;
  }

  /**
   * 取得專屬無深度衝突材質 (含 polygonOffset 與 depthTest 保證始終浮於路面之上)
   */
  public static getArrowMaterial(type: ArrowType): THREE.MeshBasicMaterial {
    let mat = this.arrowMaterials.get(type);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        map: this.getArrowTexture(type),
        transparent: true,
        opacity: 0.96,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.DoubleSide,
      });
      this.arrowMaterials.set(type, mat);
    }
    return mat;
  }

  /**
   * 建立單一車道導向箭頭 3D Mesh 群組 (以 Y 軸航向角精準轉向)
   */
  public static createArrowMesh(type: ArrowType, headingAngle: number = 0): THREE.Group {
    if (!this.arrowGeometry) {
      this.arrowGeometry = new THREE.PlaneGeometry(this.ARROW_WIDTH, this.ARROW_LENGTH);
    }
    const group = new THREE.Group();
    group.name = `Arrow_${type}`;

    const mesh = new THREE.Mesh(this.arrowGeometry, this.getArrowMaterial(type));
    // PlaneGeometry 預設垂直於 Z 軸，平放至 XZ 地面 (箭頭頂尖預設朝向 -Z 北方)
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 5;
    group.add(mesh);

    group.rotation.y = headingAngle;
    return group;
  }

  /**
   * 建立路口轉彎導向弧線虛線群組 (Turning Guide Dashes)
   * 沿車道平滑曲線取樣生成微型白虛線段，高度緊貼路面
   */
  public static createTurningGuideDashes(waypoints: THREE.Vector3[]): THREE.Group {
    const group = new THREE.Group();
    group.name = 'TurningGuideDashes';
    if (!waypoints || waypoints.length < 3) return group;

    if (!this.dashGeometry) {
      // 每個虛線段長 0.12m，寬 0.03m
      this.dashGeometry = new THREE.PlaneGeometry(0.03, 0.12);
    }
    if (!this.dashMaterial) {
      this.dashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.90,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.DoubleSide,
      });
    }

    // 沿著航點序列在路口中間區段取樣（避開兩端斑馬線）
    const totalPts = waypoints.length;
    // 取中間點生成虛線段
    const startIdx = 1;
    const endIdx = totalPts - 2;

    for (let i = startIdx; i <= endIdx; i++) {
      const pt = waypoints[i];
      const prev = waypoints[i - 1];
      const next = waypoints[i + 1];

      // 計算切線前進方向
      const dir = new THREE.Vector3().subVectors(next, prev).normalize();
      const yaw = Math.atan2(dir.x, dir.z);

      const dash = new THREE.Mesh(this.dashGeometry, this.dashMaterial);
      dash.position.set(pt.x, this.MARKING_HEIGHT, pt.z);
      dash.rotation.x = -Math.PI / 2;
      dash.rotation.z = -yaw;
      dash.renderOrder = 5;
      group.add(dash);
    }

    return group;
  }

  /**
   * 建立路口行車導向標線與轉彎引導線專屬 3D 展台 (完美重現使用者參考圖與全標線清單)
   */
  public static createShowcase(): THREE.Group {
    const showcase = new THREE.Group();
    showcase.name = 'RoadMarkings_Showcase';

    // 1. 瀝青碎石三線道展示路面底盤 (寬 1.4m x 長 1.4m x 高 0.04m)
    const roadGeo = new THREE.BoxGeometry(1.4, 0.04, 1.4);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x22252a,
      roughness: 0.85,
      metalness: 0.08,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.y = 0.02;
    road.receiveShadow = true;
    showcase.add(road);

    // 兩側路緣石
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 });
    [-0.71, 0.71].forEach((cx) => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 1.4), curbMat);
      curb.position.set(cx, 0.027, 0);
      showcase.add(curb);
    });

    // 車道分隔白虛線 (將路面劃分為三車道，每車道寬約 0.44m)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.22, 0.22].forEach((lx) => {
      for (let z = -0.55; z <= 0.55; z += 0.22) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.12), lineMat);
        dash.position.set(lx, 0.041, z);
        dash.rotation.x = -Math.PI / 2;
        showcase.add(dash);
      }
    });

    // 前方純白停止線 (Stop Line)
    const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.04), lineMat);
    stopLine.position.set(0, 0.041, -0.58);
    stopLine.rotation.x = -Math.PI / 2;
    showcase.add(stopLine);

    // 2. 放置三車道標線箭頭 (完全依照使用者附圖)：
    // 左車道 (X = -0.44)：左轉專用標線箭頭 (Left Turn Only)
    const arrowL = this.createArrowMesh('left', 0);
    arrowL.position.set(-0.44, 0.042, 0.05);
    showcase.add(arrowL);

    // 中車道 (X = 0)：直行兼左轉標線箭頭 (Straight + Left Turn)
    const arrowML = this.createArrowMesh('straight_left', 0);
    arrowML.position.set(0, 0.042, 0.05);
    showcase.add(arrowML);

    // 右車道 (X = +0.44)：直行專用標線箭頭 (Straight Only)
    const arrowS = this.createArrowMesh('straight', 0);
    arrowS.position.set(0.44, 0.042, 0.05);
    showcase.add(arrowS);

    // 3. 後排展示其他進階標線：直行兼右轉、左右轉、三向通行
    const arrowSR = this.createArrowMesh('straight_right', 0);
    arrowSR.position.set(0.44, 0.042, 0.56);
    showcase.add(arrowSR);

    const arrowLR = this.createArrowMesh('left_right', 0);
    arrowLR.position.set(-0.44, 0.042, 0.56);
    showcase.add(arrowLR);

    const arrowAll = this.createArrowMesh('all', 0);
    arrowAll.position.set(0, 0.042, 0.56);
    showcase.add(arrowAll);

    return showcase;
  }

  // ==========================================
  // Canvas 向量標線箭頭繪製演算法 (精確依據圖例)
  // ==========================================

  /**
   * 1. 直行標線箭頭 (Straight Only) - 鋒銳大氣超音速幾何
   */
  private static renderStraightArrow(ctx: CanvasRenderingContext2D): void {
    const cx = 128;
    ctx.beginPath();
    ctx.moveTo(cx, 26);             // 箭頭頂尖
    ctx.lineTo(cx + 38, 106);       // 右箭羽外角
    ctx.lineTo(cx + 14, 98);        // 右箭羽內凹
    ctx.lineTo(cx + 14, 230);       // 箭桿右下底
    ctx.lineTo(cx - 14, 230);       // 箭桿左下底
    ctx.lineTo(cx - 14, 98);        // 左箭羽內凹
    ctx.lineTo(cx - 38, 106);       // 左箭羽外角
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 2. 左轉彎標線箭頭 (Left Turn Only) - 圓滑流暢轉向
   */
  private static renderLeftTurnArrow(ctx: CanvasRenderingContext2D): void {
    const cx = 142;
    ctx.beginPath();
    ctx.moveTo(cx - 14, 230);       // 桿底左
    ctx.lineTo(cx + 14, 230);       // 桿底右
    ctx.lineTo(cx + 14, 150);       // 外輪廓上升
    // 圓滑向左外弧
    ctx.bezierCurveTo(cx + 14, 82, cx - 10, 58, 82, 58);
    ctx.lineTo(82, 30);             // 箭頭上羽
    ctx.lineTo(24, 76);             // 箭頭頂尖 (朝西)
    ctx.lineTo(82, 122);            // 箭頭下羽
    ctx.lineTo(82, 94);             // 箭頭下內凹
    // 內側向左弧線回接箭桿
    ctx.bezierCurveTo(cx - 24, 94, cx - 14, 114, cx - 14, 150);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 3. 右轉彎標線箭頭 (Right Turn Only)
   */
  private static renderRightTurnArrow(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(256, 0);
    ctx.scale(-1, 1);
    this.renderLeftTurnArrow(ctx);
    ctx.restore();
  }

  /**
   * 4. 直行兼左轉複合箭頭 (Straight + Left Turn - 完美重現使用者樣照中間款)
   */
  private static renderStraightLeftArrow(ctx: CanvasRenderingContext2D): void {
    const cx = 146;
    ctx.beginPath();
    // 直行箭頭頂尖
    ctx.moveTo(cx, 26);
    ctx.lineTo(cx + 38, 106);       // 直行右箭羽
    ctx.lineTo(cx + 14, 98);        // 直行右內凹
    ctx.lineTo(cx + 14, 230);       // 箭桿右底
    ctx.lineTo(cx - 14, 230);       // 箭桿左底
    ctx.lineTo(cx - 14, 146);       // 左側分叉點起點
    // 左轉分叉外弧
    ctx.bezierCurveTo(cx - 14, 105, 106, 78, 78, 78);
    ctx.lineTo(78, 104);            // 左箭頭下羽
    ctx.lineTo(24, 76);             // 左箭頭尖端
    ctx.lineTo(78, 48);             // 左箭頭上羽
    ctx.lineTo(78, 66);             // 左箭頭上內凹
    // 左轉分叉內弧匯回直行箭桿
    ctx.bezierCurveTo(110, 66, cx - 14, 86, cx - 14, 118);
    ctx.lineTo(cx - 14, 98);        // 直行左內凹
    ctx.lineTo(cx - 38, 106);       // 直行左箭羽
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 5. 直行兼右轉複合箭頭 (Straight + Right Turn)
   */
  private static renderStraightRightArrow(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(256, 0);
    ctx.scale(-1, 1);
    this.renderStraightLeftArrow(ctx);
    ctx.restore();
  }

  /**
   * 6. 左右轉雙向複合箭頭 (Left & Right Turn - T字路口支線標線)
   */
  private static renderLeftRightArrow(ctx: CanvasRenderingContext2D): void {
    const cx = 128;
    ctx.beginPath();
    // 穩固的中央直桿底座
    ctx.moveTo(cx - 14, 230);
    ctx.lineTo(cx + 14, 230);
    ctx.lineTo(cx + 14, 146);       // 右側分叉起點
    // 右分叉外弧
    ctx.bezierCurveTo(cx + 14, 95, 150, 76, 178, 76);
    ctx.lineTo(178, 50);            // 右箭羽上
    ctx.lineTo(232, 78);            // 右箭頭尖端 (朝東)
    ctx.lineTo(178, 106);           // 右箭羽下
    ctx.lineTo(178, 88);            // 右內凹
    // 中央馬鞍凹弧
    ctx.bezierCurveTo(154, 88, 138, 114, cx, 126);
    ctx.bezierCurveTo(118, 114, 102, 88, 78, 88);
    ctx.lineTo(78, 106);            // 左箭羽下
    ctx.lineTo(24, 78);             // 左箭頭尖端 (朝西)
    ctx.lineTo(78, 50);             // 左箭羽上
    ctx.lineTo(78, 76);             // 左內凹
    // 左分叉外弧回接主箭桿
    ctx.bezierCurveTo(106, 76, cx - 14, 95, cx - 14, 146);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 7. 直行兼左右轉三向箭頭 (Straight + Left + Right - 十字路口全向)
   */
  private static renderAllArrow(ctx: CanvasRenderingContext2D): void {
    const cx = 128;
    ctx.beginPath();
    // 直行頂尖
    ctx.moveTo(cx, 26);
    ctx.lineTo(cx + 36, 100);
    ctx.lineTo(cx + 14, 92);
    ctx.lineTo(cx + 14, 116);
    // 右分叉外弧
    ctx.bezierCurveTo(cx + 14, 88, 150, 72, 178, 72);
    ctx.lineTo(178, 48);
    ctx.lineTo(232, 76);
    ctx.lineTo(178, 104);
    ctx.lineTo(178, 86);
    // 右分叉內弧回接
    ctx.bezierCurveTo(154, 86, cx + 14, 108, cx + 14, 146);
    ctx.lineTo(cx + 14, 230);       // 箭桿底右
    ctx.lineTo(cx - 14, 230);       // 箭桿底左
    ctx.lineTo(cx - 14, 146);       // 左分叉起點
    // 左分叉內弧
    ctx.bezierCurveTo(cx - 14, 108, 102, 86, 78, 86);
    ctx.lineTo(78, 104);
    ctx.lineTo(24, 76);
    ctx.lineTo(78, 48);
    ctx.lineTo(78, 72);
    // 左分叉外弧
    ctx.bezierCurveTo(106, 72, cx - 14, 88, cx - 14, 116);
    ctx.lineTo(cx - 14, 92);
    ctx.lineTo(cx - 36, 100);
    ctx.closePath();
    ctx.fill();
  }
}
