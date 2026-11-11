import * as THREE from 'three';

/**
 * 道路紋理與材質工廠 (RoadTextureFactory)
 * 負責程式化生成擬真天際線風格的車道路面標線與立體人行道材質：
 * 1. 直線雙向車道（中央黃色分道虛線、兩側白霧線、立體混凝土人行道相接）
 * 2. 十字路口（四向綠底白色斑馬線、停止線、轉角高架人行廣場）
 * 3. T 字路口（三向綠底斑馬線、停止線、貫通側連續人行道）
 * 4. 彎道轉角（平滑同心圓弧分道標線）
 * 5. 專屬混凝土人行道地磚材質
 */
export class RoadTextureFactory {
  private static straightTexture: THREE.CanvasTexture | null = null;
  private static fourWayTexture: THREE.CanvasTexture | null = null;
  private static threeWayTexture: THREE.CanvasTexture | null = null;
  private static cornerTexture: THREE.CanvasTexture | null = null;
  private static sidewalkTexture: THREE.CanvasTexture | null = null;

  private static curbMaterial: THREE.MeshStandardMaterial | null = null;
  private static sidewalkMaterial: THREE.MeshStandardMaterial | null = null;

  private static straightMaterials: THREE.Material[] | null = null;
  private static fourWayMaterials: THREE.Material[] | null = null;
  private static threeWayMaterials: THREE.Material[] | null = null;
  private static cornerMaterials: THREE.Material[] | null = null;

  private static previewValidMaterial: THREE.MeshStandardMaterial | null = null;
  private static previewInvalidMaterial: THREE.MeshStandardMaterial | null = null;

  /**
   * 繪製通用瀝青碎石底盤
   */
  private static createAsphaltCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 16;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    return { canvas, ctx };
  }

  /**
   * 取得高架人行道專屬混凝土方磚紋理 (256x256)
   */
  public static getSidewalkTexture(): THREE.CanvasTexture {
    if (this.sidewalkTexture) return this.sidewalkTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // 淺灰人行道基底
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 256, 256);

    // 磚縫網格線 (8x8 方磚)
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    const tileSize = 32;
    for (let x = 0; x <= 256; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y <= 256; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    // 微粒雜訊
    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 12;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    this.sidewalkTexture = texture;
    return texture;
  }

  /**
   * 取得人行道立體專用材質
   */
  public static getSidewalkMaterial(): THREE.MeshStandardMaterial {
    if (!this.sidewalkMaterial) {
      this.sidewalkMaterial = new THREE.MeshStandardMaterial({
        map: this.getSidewalkTexture(),
        roughness: 0.75,
        metalness: 0.05,
      });
    }
    return this.sidewalkMaterial;
  }

  /**
   * 1. 標準直線雙向車道紋理 (含中央分道虛線與兩側白霧線)
   */
  public static getStraightTexture(): THREE.CanvasTexture {
    if (this.straightTexture) return this.straightTexture;

    const { canvas, ctx } = this.createAsphaltCanvas();

    // 兩側人行道交界白霧線（寬度 8px，與 56px (0.22m) 縮窄後人行道路緣石精確貼合）
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(58, 0, 8, 512);
    ctx.fillRect(512 - 58 - 8, 0, 8, 512);

    // 中央黃色虛線
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.setLineDash([40, 24]);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;

    this.straightTexture = texture;
    return texture;
  }

  /**
   * 2. 十字路口（Four-Way Intersection）紋理
   * 依指示：純白枕木紋直接繪製於深色瀝青路面上（背景色與路面完全一致，不添加綠底）
   * 配合縮窄至 0.22m (56px) 人行道與四角平台，斑馬線寬度調整為 56px，兩端無縫咬合
   */
  public static getFourWayTexture(): THREE.CanvasTexture {
    if (this.fourWayTexture) return this.fourWayTexture;

    const { canvas, ctx } = this.createAsphaltCanvas();

    // 配合縮窄至 0.22m 人行道，斑馬線寬度與路緣為 56px
    const swPx = 56;
    const roadInnerW = 512 - swPx * 2; // 車道內寬 (400px)

    // 繪製純白枕木紋（Sleeper Stripes，無任何綠色襯底，底色即為標準瀝青路面）
    const drawSleeperZebra = (
      boxX: number,
      boxY: number,
      boxW: number,
      boxH: number,
      isVerticalFlow: boolean
    ) => {
      ctx.fillStyle = '#ffffff';
      const stripeCount = 9;
      if (isVerticalFlow) {
        const barW = 22;
        const gap = (boxW - barW * stripeCount) / (stripeCount + 1);
        for (let i = 0; i < stripeCount; i++) {
          const x = boxX + gap + i * (barW + gap);
          ctx.fillRect(x, boxY + 4, barW, boxH - 8);
        }
      } else {
        const barH = 22;
        const gap = (boxH - barH * stripeCount) / (stripeCount + 1);
        for (let i = 0; i < stripeCount; i++) {
          const y = boxY + gap + i * (barH + gap);
          ctx.fillRect(boxX + 4, y, boxW - 8, barH);
        }
      }
    };

    // 北側斑馬線 (y: 0~56px)
    drawSleeperZebra(swPx, 0, roadInnerW, swPx, true);

    // 南側斑馬線 (y: 456~512px)
    drawSleeperZebra(swPx, 512 - swPx, roadInnerW, swPx, true);

    // 西側斑馬線 (x: 0~56px)
    drawSleeperZebra(0, swPx, swPx, roadInnerW, false);

    // 東側斑馬線 (x: 456~512px)
    drawSleeperZebra(512 - swPx, swPx, swPx, roadInnerW, false);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    this.fourWayTexture = texture;
    return texture;
  }

  /**
   * 3. T 字路口（Three-Way Junction）紋理
   * 依指示：直線貫通部分為車流高速直通區，不設斑馬線；僅在支線進入處設置行人橫穿斑馬線
   * 配合 56px (0.22m) 縮窄後人行道與白霧線調整
   */
  public static getThreeWayTexture(): THREE.CanvasTexture {
    if (this.threeWayTexture) return this.threeWayTexture;

    const { canvas, ctx } = this.createAsphaltCanvas();

    const swPx = 56;
    const roadInnerW = 512 - swPx * 2;

    // 1. 直線貫通車道（南北向直通）：中央分道黃色虛線直通到底，無斑馬線橫跨
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.setLineDash([40, 24]);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    // 西側連續貫通白實線霧線 (貼齊 56px 人行道路緣)
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(swPx + 2, 0, 8, 512);

    // 東側直道白霧線（路口開口前後兩段）
    ctx.fillRect(512 - swPx - 10, 0, 8, swPx);
    ctx.fillRect(512 - swPx - 10, 512 - swPx, 8, swPx);

    // 2. 僅在支線路口（東側）繪製行人橫穿之枕木紋斑馬線（背景色為路面瀝青色）
    const stripeCount = 9;
    const barH = 22;
    const gap = (roadInnerW - barH * stripeCount) / (stripeCount + 1);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < stripeCount; i++) {
      const y = swPx + gap + i * (barH + gap);
      ctx.fillRect(512 - swPx + 4, y, swPx - 8, barH);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    this.threeWayTexture = texture;
    return texture;
  }

  /**
   * 4. 彎道轉角（Corner Turn）紋理
   * 同心圓弧標線（以內角 (512, 512) 為同心圓心）：
   * - 外側白霧線：半徑 450px (與直道 58px 白線精準對齊: 512 - 58 - 4 = 450)
   * - 中央黃色分道虛線：半徑 256px (1.0m)
   * - 內側白霧線：半徑 62px (與直道 58px 白線精準對齊: 58 + 4 = 62)
   * - 車道瀝青區域：半徑 56px ~ 456px
   * - 外側角 (半徑 > 456px) 與內側角 (半徑 < 56px)：淺灰人行道混凝土底色 (#94a3b8)
   */
  public static getCornerTexture(): THREE.CanvasTexture {
    if (this.cornerTexture) return this.cornerTexture;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // 1. 全畫布預設為人行道淺灰混凝土色 (#94a3b8)，確保車道外圍絕無突兀瀝青空缺
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 512, 512);

    // 人行道微粒雜訊
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 12;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // 2. 繪製弧形瀝青車道路面 (半徑 56px 至 456px，圓心在 (512, 512))
    ctx.fillStyle = '#22252a';
    ctx.beginPath();
    ctx.arc(512, 512, 456, Math.PI, 1.5 * Math.PI, false);
    ctx.lineTo(512, 512 - 56);
    ctx.arc(512, 512, 56, 1.5 * Math.PI, Math.PI, true);
    ctx.closePath();
    ctx.fill();

    // 3. 同心圓弧標線繪製：
    // 外側白霧線 (半徑 450，與直道 58px 白線 100% 精準對齊)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(512, 512, 450, Math.PI, 1.5 * Math.PI);
    ctx.stroke();

    // 內側白霧線 (半徑 62，與直道 58px 白線 100% 精準對齊)
    ctx.beginPath();
    ctx.arc(512, 512, 62, Math.PI, 1.5 * Math.PI);
    ctx.stroke();

    // 中央黃色分道虛線弧線 (半徑 256，與直道 256px 中央黃線完美閉合)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.setLineDash([32, 20]);
    ctx.beginPath();
    ctx.arc(512, 512, 256, Math.PI, 1.5 * Math.PI);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    this.cornerTexture = texture;
    return texture;
  }

  private static getCurbMaterial(): THREE.MeshStandardMaterial {
    if (!this.curbMaterial) {
      this.curbMaterial = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.9,
        metalness: 0.1,
      });
    }
    return this.curbMaterial;
  }

  public static getStraightMaterials(): THREE.Material[] {
    if (!this.straightMaterials) {
      const roadMat = new THREE.MeshStandardMaterial({
        map: this.getStraightTexture(),
        roughness: 0.82,
        metalness: 0.08,
      });
      const curb = this.getCurbMaterial();
      this.straightMaterials = [curb, curb, roadMat, curb, curb, curb];
    }
    return this.straightMaterials;
  }

  public static getFourWayMaterials(): THREE.Material[] {
    if (!this.fourWayMaterials) {
      const roadMat = new THREE.MeshStandardMaterial({
        map: this.getFourWayTexture(),
        roughness: 0.82,
        metalness: 0.08,
      });
      const curb = this.getCurbMaterial();
      this.fourWayMaterials = [curb, curb, roadMat, curb, curb, curb];
    }
    return this.fourWayMaterials;
  }

  public static getThreeWayMaterials(): THREE.Material[] {
    if (!this.threeWayMaterials) {
      const roadMat = new THREE.MeshStandardMaterial({
        map: this.getThreeWayTexture(),
        roughness: 0.82,
        metalness: 0.08,
      });
      const curb = this.getCurbMaterial();
      this.threeWayMaterials = [curb, curb, roadMat, curb, curb, curb];
    }
    return this.threeWayMaterials;
  }

  public static getCornerMaterials(): THREE.Material[] {
    if (!this.cornerMaterials) {
      const roadMat = new THREE.MeshStandardMaterial({
        map: this.getCornerTexture(),
        roughness: 0.82,
        metalness: 0.08,
      });
      const curb = this.getCurbMaterial();
      this.cornerMaterials = [curb, curb, roadMat, curb, curb, curb];
    }
    return this.cornerMaterials;
  }

  public static getPreviewValidMaterial(): THREE.MeshStandardMaterial {
    if (!this.previewValidMaterial) {
      this.previewValidMaterial = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.65,
        roughness: 0.3,
        emissive: 0x0284c7,
        emissiveIntensity: 0.4,
      });
    }
    return this.previewValidMaterial;
  }

  public static getPreviewInvalidMaterial(): THREE.MeshStandardMaterial {
    if (!this.previewInvalidMaterial) {
      this.previewInvalidMaterial = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.65,
        roughness: 0.3,
        emissive: 0xdc2626,
        emissiveIntensity: 0.4,
      });
    }
    return this.previewInvalidMaterial;
  }
}
