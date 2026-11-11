import * as THREE from 'three';

export interface BuildingMetadata {
  id: string;
  name: string;
  category: 'Residential_Low';
  frontageWidth: number;   // 面寬格數 (每格 0.5m)
  lotDepth: number;        // 縱深格數 (每格 0.5m)
  capacity: number;        // 居住人口上限 (人數)
  description: string;
  features: string[];
}

/**
 * 程式化低密度住宅 3D 模型工廠 (BuildingModelFactory)
 *
 * 遵循「Stylized Low-Poly 3D 建築風格」規範，深度參考現代微縮模型、Townscaper
 * 與 SimCity 暖調自然色系與精緻體態：
 * 1. 嚴格對照市民真實身高 (0.178m) 與車輛尺寸 (長 0.37m, 寬 0.20m, 高 0.142m) 制定精確 1:1 建築比例。
 * 2. 徹底摒棄單調長方體結構，每棟住宅皆具備獨特建築幾何剪影 (L型翼樓、階梯式雙層、懸挑陽台、單坡斜頂、西班牙拱廊等)。
 * 3. 具備清晰建築層次：地基水線台度、門窗線腳、深進玄關雨棚、挑高簷口與凸出屋簷 (Overhangs)。
 * 4. 豐富精緻的庭院環境：溫暖草皮、石板步道、車道鋪面、白色木柵欄、修剪綠籬、低多邊形蓬鬆綠樹與花叢。
 * 5. 正面朝向規範：所有建築正面（大門、玄關走道、前庭車道）一律朝向 +Z 軸（面朝馬路）。
 */
export class BuildingModelFactory {
  // ==========================================
  // 1. 共享自然材質調色盤 (Natural Harmonious Palette)
  // ==========================================

  // 地表與硬質景觀
  private static lawnMat = new THREE.MeshStandardMaterial({
    color: 0x5e853a, // 溫暖自然草皮綠
    roughness: 0.88,
    metalness: 0.04,
  });

  private static pathMat = new THREE.MeshStandardMaterial({
    color: 0xd6cec2, // 淺暖灰石板步道
    roughness: 0.78,
    metalness: 0.08,
  });

  private static drivewayMat = new THREE.MeshStandardMaterial({
    color: 0xb5afa4, // 瀝青/混擬土車道鋪磚
    roughness: 0.82,
    metalness: 0.12,
  });

  private static plinthMat = new THREE.MeshStandardMaterial({
    color: 0xbcb5a8, // 地基防潮石材基座水線
    roughness: 0.85,
    metalness: 0.1,
  });

  // 建築外牆 (Stucco, Wood Siding & Accents)
  private static wallIvoryMat = new THREE.MeshStandardMaterial({
    color: 0xf5f0e6, // 柔和象牙白灰泥 (Ivory Stucco)
    roughness: 0.75,
    metalness: 0.05,
  });

  private static wallSandMat = new THREE.MeshStandardMaterial({
    color: 0xe8ddcb, // 暖沙地中海灰泥 (Sand Stucco)
    roughness: 0.8,
    metalness: 0.06,
  });

  private static wallWoodCedarMat = new THREE.MeshStandardMaterial({
    color: 0xba7c44, // 暖色雪松垂直木飾板 (Warm Cedar Wood)
    roughness: 0.65,
    metalness: 0.08,
  });

  private static wallWoodDarkMat = new THREE.MeshStandardMaterial({
    color: 0x6e4326, // 深胡桃木樑柱 (Dark Timber)
    roughness: 0.7,
    metalness: 0.05,
  });

  private static wallCharcoalMat = new THREE.MeshStandardMaterial({
    color: 0x33373e, // 當代黑炭色對比飾牆 (Anthracite Accent)
    roughness: 0.6,
    metalness: 0.18,
  });

  // 屋頂材質 (Roofs)
  private static roofSlateDarkMat = new THREE.MeshStandardMaterial({
    color: 0x363d47, // 經典深石板青灰瓦 (Dark Slate Gray)
    roughness: 0.48,
    metalness: 0.15,
  });

  private static roofSlateBlueMat = new THREE.MeshStandardMaterial({
    color: 0x2d3748, // 冷色石板瓦 (Cool Slate Navy)
    roughness: 0.45,
    metalness: 0.2,
  });

  private static roofTerracottaMat = new THREE.MeshStandardMaterial({
    color: 0xbc5735, // 西班牙陶土紅磚瓦 (Terracotta Clay)
    roughness: 0.58,
    metalness: 0.08,
  });

  private static roofDarkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x22262d, // 當代金屬斜屋頂/壓頂 (Dark Metal Zinc)
    roughness: 0.38,
    metalness: 0.45,
  });

  // 門窗與五金
  private static frameWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xfafafa, // 純淨白窗框與木護欄
    roughness: 0.45,
    metalness: 0.1,
  });

  private static frameDarkMat = new THREE.MeshStandardMaterial({
    color: 0x25272c, // 當代深黑鋁合金窗框
    roughness: 0.4,
    metalness: 0.35,
  });

  private static glassMat = new THREE.MeshStandardMaterial({
    color: 0x4f778d, // 天空倒影微反光車窗/窗戶玻璃
    roughness: 0.12,
    metalness: 0.82,
    emissive: 0x162c3b,
    emissiveIntensity: 0.3,
  });

  private static doorWoodMat = new THREE.MeshStandardMaterial({
    color: 0x7a3a1b, // 暖棕實木大門
    roughness: 0.55,
    metalness: 0.1,
  });

  private static doorDarkMat = new THREE.MeshStandardMaterial({
    color: 0x23262d, // 現代簡約深黑正門
    roughness: 0.5,
    metalness: 0.2,
  });

  private static doorNavyMat = new THREE.MeshStandardMaterial({
    color: 0x1e3650, // 典雅海軍藍大門
    roughness: 0.5,
    metalness: 0.15,
  });

  private static brassHandleMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // 黃銅金屬門把
    roughness: 0.2,
    metalness: 0.9,
  });

  // 煙囪與紅磚
  private static brickMat = new THREE.MeshStandardMaterial({
    color: 0xaa4832, // 溫暖紅磚
    roughness: 0.85,
    metalness: 0.05,
  });

  // 植栽、圍籬與花園造景
  private static fenceWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf6f7f9, // 美式純白木柵欄
    roughness: 0.55,
  });

  private static hedgeMat = new THREE.MeshStandardMaterial({
    color: 0x416527, // 俐落修剪灌木綠籬
    roughness: 0.86,
    metalness: 0.02,
  });

  private static foliageDeciduousMat1 = new THREE.MeshStandardMaterial({
    color: 0x5a8335, // 蓬鬆落葉樹冠 (主綠)
    roughness: 0.85,
  });

  private static foliageDeciduousMat2 = new THREE.MeshStandardMaterial({
    color: 0x6e9643, // 蓬鬆落葉樹冠 (亮綠光層)
    roughness: 0.85,
  });

  private static foliageConiferMat = new THREE.MeshStandardMaterial({
    color: 0x2e5022, // 針葉松柏深綠
    roughness: 0.88,
  });

  private static trunkMat = new THREE.MeshStandardMaterial({
    color: 0x543b28, // 樹幹棕
    roughness: 0.9,
  });

  private static flowerCoralMat = new THREE.MeshStandardMaterial({
    color: 0xde4f5e, // 珊瑚粉紅花瓣
    roughness: 0.7,
  });

  private static flowerYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfab005, // 明亮暖黃花瓣
    roughness: 0.7,
  });

  // ==========================================
  // 2. 幾何原語與建築模組生成函式
  // ==========================================

  /**
   * 建立地基綠草地與邊界微凸護圍
   * @param w 面寬 (X 軸米數)
   * @param d 縱深 (Z 軸米數)
   */
  private static createBaseLot(w: number, d: number): THREE.Group {
    const lotGroup = new THREE.Group();

    // 綠茵草皮底座 (高 0.025m，頂面位於 y = 0.025m)
    const lawnGeo = new THREE.BoxGeometry(w - 0.015, 0.025, d - 0.015);
    const lawn = new THREE.Mesh(lawnGeo, this.lawnMat);
    lawn.position.y = 0.0125;
    lawn.receiveShadow = true;
    lotGroup.add(lawn);

    // 微凸底座邊緣飾邊 (保持立體模型玩具基座質感)
    const curbGeo = new THREE.BoxGeometry(w, 0.008, d);
    const curb = new THREE.Mesh(curbGeo, this.plinthMat);
    curb.position.y = 0.004;
    curb.receiveShadow = true;
    lotGroup.add(curb);

    return lotGroup;
  }

  /**
   * 建立雙斜人字屋頂 (Gable Roof)
   * 支援四向延伸屋簷 (Overhang)、立體山牆三角面與封底，法向量平整銳利。
   */
  private static createGableRoof(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    overhangX = 0.035,
    overhangZ = 0.035
  ): THREE.Group {
    const roofGroup = new THREE.Group();

    const rw = w + overhangX * 2;
    const rd = d + overhangZ * 2;
    const hw = rw / 2;
    const hh = h / 2;
    const hd = rd / 2;

    const rf = [0, hh, hd];       // 屋脊前端 (+Z)
    const rb = [0, hh, -hd];      // 屋脊後端 (-Z)
    const blf = [-hw, -hh, hd];   // 屋簷前左角 (-X, +Z)
    const brf = [hw, -hh, hd];    // 屋簷前右角 (+X, +Z)
    const blb = [-hw, -hh, -hd];  // 屋簷後左角 (-X, -Z)
    const brb = [hw, -hh, -hd];   // 屋簷後右角 (+X, -Z)

    const positions: number[] = [
      // 1. 正面山牆三角 (+Z)
      ...blf, ...brf, ...rf,
      // 2. 背面山牆三角 (-Z)
      ...brb, ...blb, ...rb,
      // 3. 右側斜坡 (+X, +Y)
      ...rf, ...brf, ...brb,
      ...rf, ...brb, ...rb,
      // 4. 左側斜坡 (-X, +Y)
      ...rb, ...blb, ...blf,
      ...rb, ...blf, ...rf,
      // 5. 底面封蓋 (-Y)
      ...blf, ...blb, ...brb,
      ...blf, ...brb, ...brf,
    ];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    const roofMesh = new THREE.Mesh(geo, mat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    roofGroup.add(roofMesh);

    // 屋脊脊樑封條飾板 (Ridge Cap)
    const ridgeGeo = new THREE.BoxGeometry(0.02, 0.018, rd + 0.01);
    const ridgeMesh = new THREE.Mesh(ridgeGeo, this.roofDarkMetalMat);
    ridgeMesh.position.y = hh + 0.005;
    ridgeMesh.castShadow = true;
    roofGroup.add(ridgeMesh);

    return roofGroup;
  }

  /**
   * 建立四坡四角攢尖/歇山屋頂 (Hip Roof - 地中海/美式殖民風經典)
   * 前後左右四面皆呈斜坡順下，附有脊線頂樑。
   */
  private static createHipRoof(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    overhang = 0.035
  ): THREE.Group {
    const roofGroup = new THREE.Group();

    const rw = w + overhang * 2;
    const rd = d + overhang * 2;
    const hw = rw / 2;
    const hh = h / 2;
    const hd = rd / 2;

    const positions: number[] = [];

    if (rw >= rd) {
      // 橫向面寬大於縱深，脊線沿 X 軸延伸
      const ridgeLen = Math.max(0.08, rw - rd * 0.75);
      const hr = ridgeLen / 2;

      const rLeft = [-hr, hh, 0];
      const rRight = [hr, hh, 0];
      const blf = [-hw, -hh, hd];
      const brf = [hw, -hh, hd];
      const blb = [-hw, -hh, -hd];
      const brb = [hw, -hh, -hd];

      // 前斜坡 (+Z, 梯形)
      positions.push(...blf, ...brf, ...rRight, ...blf, ...rRight, ...rLeft);
      // 後斜坡 (-Z, 梯形)
      positions.push(...brb, ...blb, ...rLeft, ...brb, ...rLeft, ...rRight);
      // 左側坡 (-X, 三角)
      positions.push(...blb, ...blf, ...rLeft);
      // 右側坡 (+X, 三角)
      positions.push(...brf, ...brb, ...rRight);
      // 底面平蓋 (-Y)
      positions.push(...blf, ...blb, ...brb, ...blf, ...brb, ...brf);
    } else {
      // 縱向脊線沿 Z 軸延伸
      const ridgeLen = Math.max(0.08, rd - rw * 0.75);
      const hr = ridgeLen / 2;

      const rFront = [0, hh, hr];
      const rBack = [0, hh, -hr];
      const blf = [-hw, -hh, hd];
      const brf = [hw, -hh, hd];
      const blb = [-hw, -hh, -hd];
      const brb = [hw, -hh, -hd];

      // 左斜坡 (-X)
      positions.push(...blb, ...blf, ...rFront, ...blb, ...rFront, ...rBack);
      // 右斜坡 (+X)
      positions.push(...brf, ...brb, ...rBack, ...brf, ...rBack, ...rFront);
      // 前側坡 (+Z)
      positions.push(...blf, ...brf, ...rFront);
      // 後側坡 (-Z)
      positions.push(...brb, ...blb, ...rBack);
      // 底面平蓋
      positions.push(...blf, ...blb, ...brb, ...blf, ...brb, ...brf);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    roofGroup.add(mesh);

    return roofGroup;
  }

  /**
   * 建立當代單坡斜屋頂 (Shed / Mono-pitch Roof)
   * 沿指定軸向前傾或側傾，創造強烈的北歐/西海岸現代建築輪廓。
   */
  private static createShedRoof(
    w: number,
    h: number,
    d: number,
    axis: 'Z' | 'X',
    slopeDir: 1 | -1,
    mat: THREE.Material,
    overhang = 0.035
  ): THREE.Group {
    const roofGroup = new THREE.Group();

    const rw = w + overhang * 2;
    const rd = d + overhang * 2;
    const hw = rw / 2;
    const hh = h / 2;
    const hd = rd / 2;

    const positions: number[] = [];

    if (axis === 'Z') {
      // 沿 Z 軸傾斜 (slopeDir = 1 表示前高後低，-1 表示後高前低)
      const yFront = slopeDir === 1 ? hh : -hh;
      const yBack = slopeDir === 1 ? -hh : hh;

      const tlf = [-hw, yFront, hd];
      const trf = [hw, yFront, hd];
      const tlb = [-hw, yBack, -hd];
      const trb = [hw, yBack, -hd];

      const blf = [-hw, -hh - 0.02, hd];
      const brf = [hw, -hh - 0.02, hd];
      const blb = [-hw, -hh - 0.02, -hd];
      const brb = [hw, -hh - 0.02, -hd];

      // 頂部斜面
      if (slopeDir === 1) {
        positions.push(...tlf, ...trf, ...trb, ...tlf, ...trb, ...tlb);
      } else {
        positions.push(...tlb, ...trb, ...trf, ...tlb, ...trf, ...tlf);
      }
      // 前後左右底封閉
      positions.push(...blf, ...brf, ...trf, ...blf, ...trf, ...tlf);
      positions.push(...trb, ...brb, ...blb, ...tlb, ...trb, ...blb);
      positions.push(...blb, ...blf, ...tlf, ...blb, ...tlf, ...tlb);
      positions.push(...brf, ...brb, ...trb, ...brf, ...trb, ...trf);
      positions.push(...blf, ...blb, ...brb, ...blf, ...brb, ...brf);
    } else {
      // 沿 X 軸傾斜
      const yLeft = slopeDir === 1 ? hh : -hh;
      const yRight = slopeDir === 1 ? -hh : hh;

      const tlf = [-hw, yLeft, hd];
      const trf = [hw, yRight, hd];
      const tlb = [-hw, yLeft, -hd];
      const trb = [hw, yRight, -hd];

      const blf = [-hw, -hh - 0.02, hd];
      const brf = [hw, -hh - 0.02, hd];
      const blb = [-hw, -hh - 0.02, -hd];
      const brb = [hw, -hh - 0.02, -hd];

      if (slopeDir === 1) {
        positions.push(...tlf, ...trf, ...trb, ...tlf, ...trb, ...tlb);
      } else {
        positions.push(...tlb, ...trb, ...trf, ...tlb, ...trf, ...tlf);
      }
      positions.push(...blf, ...brf, ...trf, ...blf, ...trf, ...tlf);
      positions.push(...trb, ...brb, ...blb, ...tlb, ...trb, ...blb);
      positions.push(...blb, ...blf, ...tlf, ...blb, ...tlf, ...tlb);
      positions.push(...brf, ...brb, ...trb, ...brf, ...trb, ...trf);
      positions.push(...blf, ...blb, ...brb, ...blf, ...brb, ...brf);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    roofGroup.add(mesh);

    return roofGroup;
  }

  /**
   * 建立極簡現代平屋頂 (Flat Roof with Parapet Coping)
   */
  private static createFlatParapetRoof(
    w: number,
    d: number,
    wallMat: THREE.Material = this.wallIvoryMat,
    capMat: THREE.Material = this.roofDarkMetalMat
  ): THREE.Group {
    const roofGroup = new THREE.Group();
    const parapetHeight = 0.04;
    const thickness = 0.02;

    // 女兒牆周邊
    const addWall = (bx: number, by: number, bz: number, px: number, py: number, pz: number) => {
      const g = new THREE.BoxGeometry(bx, by, bz);
      const m = new THREE.Mesh(g, wallMat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      roofGroup.add(m);

      // 牆頂金屬壓頂條
      const cg = new THREE.BoxGeometry(bx + 0.005, 0.008, bz + 0.005);
      const cm = new THREE.Mesh(cg, capMat);
      cm.position.set(px, py + by / 2 + 0.004, pz);
      roofGroup.add(cm);
    };

    const hw = w / 2;
    const hd = d / 2;
    // 北牆 (-Z)
    addWall(w, parapetHeight, thickness, 0, parapetHeight / 2, -hd + thickness / 2);
    // 南牆 (+Z)
    addWall(w, parapetHeight, thickness, 0, parapetHeight / 2, hd - thickness / 2);
    // 西牆 (-X)
    addWall(thickness, parapetHeight, d - thickness * 2, -hw + thickness / 2, parapetHeight / 2, 0);
    // 東牆 (+X)
    addWall(thickness, parapetHeight, d - thickness * 2, hw - thickness / 2, parapetHeight / 2, 0);

    // 內縮屋頂露台鋪面
    const floorGeo = new THREE.BoxGeometry(w - thickness * 2, 0.015, d - thickness * 2);
    const floor = new THREE.Mesh(floorGeo, this.plinthMat);
    floor.position.y = 0.008;
    roofGroup.add(floor);

    return roofGroup;
  }

  /**
   * 建立閣樓老虎窗 (Roof Dormer)
   */
  private static createDormer(
    w = 0.14,
    h = 0.12,
    d = 0.16,
    roofMat: THREE.Material = this.roofSlateDarkMat,
    wallMat: THREE.Material = this.wallIvoryMat
  ): THREE.Group {
    const dormer = new THREE.Group();

    // 窗體小方塊
    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.position.set(0, h / 2, 0);
    body.castShadow = true;
    dormer.add(body);

    // 專屬小斜頂
    const dormerRoof = this.createGableRoof(w, h * 0.7, d, roofMat, 0.02, 0.02);
    dormerRoof.position.set(0, h + h * 0.35, 0);
    dormer.add(dormerRoof);

    // 正面格子小窗
    const win = this.createWindow(w * 0.65, h * 0.6, { style: 'white', panesX: 2, panesY: 2, sill: true });
    win.position.set(0, h * 0.55, d / 2 + 0.005);
    dormer.add(win);

    return dormer;
  }

  /**
   * 建立符合市民身高 (0.178m) 比例之建築門窗
   */
  private static createWindow(
    w = 0.11,
    h = 0.12,
    opts: {
      style?: 'white' | 'dark';
      panesX?: number;
      panesY?: number;
      sill?: boolean;
    } = {}
  ): THREE.Group {
    const winGroup = new THREE.Group();
    const style = opts.style || 'white';
    const frameMat = style === 'white' ? this.frameWhiteMat : this.frameDarkMat;
    const panesX = opts.panesX || 2;
    const panesY = opts.panesY || 2;
    const hasSill = opts.sill !== false;

    // 外窗框 (凸出牆面 0.008m)
    const frameGeo = new THREE.BoxGeometry(w, h, 0.016);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    winGroup.add(frame);

    // 內嵌反光玻璃
    const glassGeo = new THREE.BoxGeometry(w - 0.02, h - 0.02, 0.018);
    const glass = new THREE.Mesh(glassGeo, this.glassMat);
    winGroup.add(glass);

    // 窗欞 (Mullions)
    if (panesX > 1) {
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.006, h - 0.02, 0.019), frameMat);
      winGroup.add(vBar);
    }
    if (panesY > 1) {
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.006, 0.019), frameMat);
      winGroup.add(hBar);
    }

    // 窗台基座下緣飾條 (Window Sill)
    if (hasSill) {
      const sillGeo = new THREE.BoxGeometry(w + 0.025, 0.012, 0.028);
      const sill = new THREE.Mesh(sillGeo, frameMat);
      sill.position.set(0, -h / 2 - 0.004, 0.005);
      winGroup.add(sill);
    }

    return winGroup;
  }

  /**
   * 建立落地全景玻璃窗 (Panoramic Modern Window)
   */
  private static createPanoramicWindow(
    w: number,
    h: number,
    verticalDivisions = 2
  ): THREE.Group {
    const winGroup = new THREE.Group();
    const frameMat = this.frameDarkMat;

    // 外邊框
    const frameGeo = new THREE.BoxGeometry(w, h, 0.014);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    winGroup.add(frame);

    // 大面積反射玻璃
    const glassGeo = new THREE.BoxGeometry(w - 0.016, h - 0.016, 0.016);
    const glass = new THREE.Mesh(glassGeo, this.glassMat);
    winGroup.add(glass);

    // 垂直細分割
    if (verticalDivisions > 1) {
      const step = (w - 0.02) / verticalDivisions;
      for (let i = 1; i < verticalDivisions; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.006, h - 0.02, 0.017), frameMat);
        bar.position.x = -w / 2 + 0.01 + i * step;
        winGroup.add(bar);
      }
    }

    return winGroup;
  }

  /**
   * 建立玄關大門 (高 0.21m，市民高 0.178m，比例合度舒適)
   */
  private static createFrontDoor(
    w = 0.10,
    h = 0.21,
    opts: {
      doorMat?: THREE.Material;
      frameMat?: THREE.Material;
      hasKnob?: boolean;
      hasLantern?: boolean;
    } = {}
  ): THREE.Group {
    const doorGroup = new THREE.Group();
    const dMat = opts.doorMat || this.doorWoodMat;
    const fMat = opts.frameMat || this.frameWhiteMat;

    // 門框
    const frameGeo = new THREE.BoxGeometry(w + 0.018, h + 0.01, 0.018);
    const frame = new THREE.Mesh(frameGeo, fMat);
    frame.position.y = h / 2;
    doorGroup.add(frame);

    // 門板 (微後退)
    const doorGeo = new THREE.BoxGeometry(w, h, 0.012);
    const door = new THREE.Mesh(doorGeo, dMat);
    door.position.set(0, h / 2, 0.003);
    doorGroup.add(door);

    // 黃銅門把 (離地約 0.10m，市民腰間位置)
    if (opts.hasKnob !== false) {
      const knobGeo = new THREE.SphereGeometry(0.006, 8, 8);
      const knob = new THREE.Mesh(knobGeo, this.brassHandleMat);
      knob.position.set(w * 0.32, h * 0.48, 0.013);
      doorGroup.add(knob);
    }

    // 壁燈 / 門廊玄關燈 (自體微光)
    if (opts.hasLantern) {
      const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffedd5 });
      const lanternGeo = new THREE.BoxGeometry(0.014, 0.022, 0.014);
      const lantern = new THREE.Mesh(lanternGeo, lanternMat);
      lantern.position.set(-w * 0.5 - 0.02, h * 0.72, 0.015);
      doorGroup.add(lantern);

      const lampMount = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.004), this.frameDarkMat);
      lampMount.position.set(-w * 0.5 - 0.02, h * 0.72, 0.005);
      doorGroup.add(lampMount);
    }

    return doorGroup;
  }

  /**
   * 建立前廊雨棚 (Porch Awning) 與支柱
   */
  private static createPorchAwning(
    w: number,
    d: number,
    h = 0.24,
    roofMat: THREE.Material = this.roofSlateDarkMat
  ): THREE.Group {
    const porch = new THREE.Group();

    // 柱子 (兩側胡桃深木柱)
    const postGeo = new THREE.BoxGeometry(0.016, h, 0.016);
    const pLeft = new THREE.Mesh(postGeo, this.wallWoodDarkMat);
    pLeft.position.set(-w / 2 + 0.018, h / 2, d / 2 - 0.015);
    pLeft.castShadow = true;
    porch.add(pLeft);

    const pRight = new THREE.Mesh(postGeo, this.wallWoodDarkMat);
    pRight.position.set(w / 2 - 0.018, h / 2, d / 2 - 0.015);
    pRight.castShadow = true;
    porch.add(pRight);

    // 頂蓋橫樑
    const beamGeo = new THREE.BoxGeometry(w, 0.014, 0.02);
    const beam = new THREE.Mesh(beamGeo, this.frameWhiteMat);
    beam.position.set(0, h - 0.007, d / 2 - 0.015);
    porch.add(beam);

    // 雨棚微傾斜板面
    const awningGeo = new THREE.BoxGeometry(w + 0.02, 0.014, d + 0.02);
    const awning = new THREE.Mesh(awningGeo, roofMat);
    awning.position.set(0, h + 0.008, d / 2 - 0.01);
    awning.rotation.x = 0.08;
    awning.castShadow = true;
    porch.add(awning);

    // 踏階石台 (Step Platform, 高 0.015m)
    const stepGeo = new THREE.BoxGeometry(w + 0.04, 0.015, d + 0.04);
    const step = new THREE.Mesh(stepGeo, this.pathMat);
    step.position.set(0, 0.0075, d / 2 - 0.01);
    step.receiveShadow = true;
    porch.add(step);

    return porch;
  }

  /**
   * 建立修剪整齊的方形矮樹籬 (Box Hedge)
   */
  private static createHedge(w: number, h: number, d: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, this.hedgeMat);
    mesh.position.y = h / 2 + 0.025; // 位於草皮上方
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * 建立經典美式白木柵欄 (Picket Fence)
   * 垂直板條帶斜切尖角與橫向固定龍骨
   */
  private static createPicketFence(
    length: number,
    axis: 'X' | 'Z' = 'X',
    height = 0.09
  ): THREE.Group {
    const fence = new THREE.Group();
    const spacing = 0.032;
    const count = Math.max(2, Math.floor(length / spacing));
    const actualStep = length / (count - 1);

    // 橫向背樑
    const railGeo = axis === 'X'
      ? new THREE.BoxGeometry(length, 0.006, 0.004)
      : new THREE.BoxGeometry(0.004, 0.006, length);

    const railLow = new THREE.Mesh(railGeo, this.fenceWhiteMat);
    railLow.position.y = height * 0.35 + 0.025;
    fence.add(railLow);

    const railHigh = new THREE.Mesh(railGeo, this.fenceWhiteMat);
    railHigh.position.y = height * 0.75 + 0.025;
    fence.add(railHigh);

    // 豎直尖角柵欄片
    const slatW = 0.012;
    const slatT = 0.004;
    const slatGeo = axis === 'X'
      ? new THREE.BoxGeometry(slatW, height, slatT)
      : new THREE.BoxGeometry(slatT, height, slatW);

    for (let i = 0; i < count; i++) {
      const pos = -length / 2 + i * actualStep;
      const slat = new THREE.Mesh(slatGeo, this.fenceWhiteMat);
      if (axis === 'X') {
        slat.position.set(pos, height / 2 + 0.025, 0);
      } else {
        slat.position.set(0, height / 2 + 0.025, pos);
      }
      slat.castShadow = true;
      fence.add(slat);
    }

    return fence;
  }

  /**
   * 建立蓬鬆多球落葉樹 (Stylized Deciduous Tree)
   */
  private static createDeciduousTree(scale = 1.0): THREE.Group {
    const tree = new THREE.Group();

    // 樹幹 (下粗上細六邊柱)
    const trunkH = 0.22 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.014 * scale, 0.022 * scale, trunkH, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.trunkMat);
    trunk.position.y = trunkH / 2 + 0.025;
    trunk.castShadow = true;
    tree.add(trunk);

    // 複數多面體團塊組成的蓬鬆樹冠 (極富立體光影層次)
    const crownGroup = new THREE.Group();
    crownGroup.position.y = trunkH + 0.025;

    const mainGeo = new THREE.DodecahedronGeometry(0.14 * scale, 1);
    const mainCrown = new THREE.Mesh(mainGeo, this.foliageDeciduousMat1);
    mainCrown.position.set(0, 0.06 * scale, 0);
    mainCrown.castShadow = true;
    crownGroup.add(mainCrown);

    const sub1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.10 * scale, 1), this.foliageDeciduousMat2);
    sub1.position.set(0.06 * scale, 0.12 * scale, 0.04 * scale);
    sub1.castShadow = true;
    crownGroup.add(sub1);

    const sub2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 * scale, 1), this.foliageDeciduousMat1);
    sub2.position.set(-0.05 * scale, 0.09 * scale, -0.05 * scale);
    sub2.castShadow = true;
    crownGroup.add(sub2);

    tree.add(crownGroup);
    return tree;
  }

  /**
   * 建立階梯層次松柏針葉樹 (Stylized Conifer Tree)
   */
  private static createConiferTree(scale = 1.0): THREE.Group {
    const tree = new THREE.Group();

    // 樹幹
    const trunkH = 0.16 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.012 * scale, 0.018 * scale, trunkH, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.trunkMat);
    trunk.position.y = trunkH / 2 + 0.025;
    trunk.castShadow = true;
    tree.add(trunk);

    // 三層圓錐樹冠
    const layers = [
      { r: 0.14 * scale, h: 0.15 * scale, y: trunkH + 0.025 },
      { r: 0.11 * scale, h: 0.14 * scale, y: trunkH + 0.09 * scale + 0.025 },
      { r: 0.07 * scale, h: 0.13 * scale, y: trunkH + 0.18 * scale + 0.025 },
    ];

    layers.forEach((l) => {
      const coneGeo = new THREE.ConeGeometry(l.r, l.h, 7);
      const cone = new THREE.Mesh(coneGeo, this.foliageConiferMat);
      cone.position.y = l.y;
      cone.castShadow = true;
      tree.add(cone);
    });

    return tree;
  }

  /**
   * 建立低多邊形花圃灌木小球
   */
  private static createBush(r = 0.05, hasFlowers: 'coral' | 'yellow' | 'none' = 'none'): THREE.Group {
    const bushGroup = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(r, 0);
    const mesh = new THREE.Mesh(geo, this.hedgeMat);
    mesh.position.y = r * 0.85 + 0.025;
    mesh.castShadow = true;
    bushGroup.add(mesh);

    if (hasFlowers !== 'none') {
      const fMat = hasFlowers === 'coral' ? this.flowerCoralMat : this.flowerYellowMat;
      const flowerGeo = new THREE.DodecahedronGeometry(r * 0.3, 0);
      const f1 = new THREE.Mesh(flowerGeo, fMat);
      f1.position.set(r * 0.45, r * 1.1 + 0.025, r * 0.3);
      bushGroup.add(f1);

      const f2 = new THREE.Mesh(flowerGeo, fMat);
      f2.position.set(-r * 0.4, r * 1.0 + 0.025, -r * 0.2);
      bushGroup.add(f2);
    }

    return bushGroup;
  }

  /**
   * 建立紅磚煙囪 (帶水泥頂蓋與陶土排煙管口)
   */
  private static createChimney(h = 0.32, w = 0.065, d = 0.065): THREE.Group {
    const chim = new THREE.Group();

    // 磚造主體
    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const body = new THREE.Mesh(bodyGeo, this.brickMat);
    body.position.y = h / 2;
    body.castShadow = true;
    chim.add(body);

    // 水泥冠頂蓋
    const capGeo = new THREE.BoxGeometry(w + 0.016, 0.014, d + 0.016);
    const cap = new THREE.Mesh(capGeo, this.plinthMat);
    cap.position.y = h + 0.007;
    chim.add(cap);

    // 陶土圓排煙管
    const potGeo = new THREE.CylinderGeometry(0.015, 0.016, 0.03, 8);
    const pot = new THREE.Mesh(potGeo, this.roofTerracottaMat);
    pot.position.y = h + 0.028;
    chim.add(pot);

    return chim;
  }

  // ==========================================
  // 3. 5 款高品質純手工低密度住宅實例
  // ==========================================

  /**
   * 1. 低密度住宅 2x2 (2 人 / Two People)
   * 佔地: 面寬 1.0m (2格) × 縱深 1.0m (2格)
   * 風格: 經典溫馨美式 L 型雙斜屋頂小屋 (American Craftsman Gable Cottage)
   * 幾何特徵:
   * - 凹入式前廊與左側凸出山形側翼 (L-shape volume)
   * - 深石板青灰人字雙斜屋頂、超寬立體屋簷與木質飾條
   * - 庇護式玄關玄台、立柱、黃銅把手大門與戶外壁燈
   * - 前庭石板踏步步道、修剪角綠籬、珊瑚粉花球灌木與側界白木柵欄
   */
  public static createResidential_2x2(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_2x2';

    // 1. 庭院地基 (1.0m x 1.0m)
    house.add(this.createBaseLot(1.0, 1.0));

    // 2. 建築本體：L 型複合雙區塊
    // (A) 左側向前凸出的山牆側翼 (Projecting Gable Wing: X=-0.16, Z=+0.04)
    const wingW = 0.34;
    const wingD = 0.52;
    const wingH = 0.29;
    const wingGeo = new THREE.BoxGeometry(wingW, wingH, wingD);
    const wing = new THREE.Mesh(wingGeo, this.wallIvoryMat);
    wing.position.set(-0.16, wingH / 2 + 0.025, 0.04);
    wing.castShadow = true;
    wing.receiveShadow = true;
    house.add(wing);

    // 側翼防潮石基座 (Plinth)
    const wingPlinth = new THREE.Mesh(new THREE.BoxGeometry(wingW + 0.01, 0.024, wingD + 0.01), this.plinthMat);
    wingPlinth.position.set(-0.16, 0.012 + 0.025, 0.04);
    house.add(wingPlinth);

    // 側翼前向人字屋頂 (Front-facing Gable Roof)
    const wingRoof = this.createGableRoof(wingW, 0.16, wingD, this.roofSlateDarkMat, 0.035, 0.04);
    wingRoof.position.set(-0.16, wingH + 0.08 + 0.025, 0.04);
    house.add(wingRoof);

    // (B) 右側後退之客廳主樓 (Recessed Main Body: X=+0.16, Z=-0.08)
    const mainW = 0.38;
    const mainD = 0.44;
    const mainH = 0.26;
    const mainGeo = new THREE.BoxGeometry(mainW, mainH, mainD);
    const mainBody = new THREE.Mesh(mainGeo, this.wallIvoryMat);
    mainBody.position.set(0.16, mainH / 2 + 0.025, -0.08);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    house.add(mainBody);

    const mainPlinth = new THREE.Mesh(new THREE.BoxGeometry(mainW + 0.01, 0.024, mainD + 0.01), this.plinthMat);
    mainPlinth.position.set(0.16, 0.012 + 0.025, -0.08);
    house.add(mainPlinth);

    // 主樓橫向屋頂 (旋轉 90 度呈橫樑人字脊)
    const mainRoof = this.createGableRoof(mainD, 0.15, mainW, this.roofSlateDarkMat, 0.035, 0.035);
    mainRoof.rotation.y = Math.PI / 2;
    mainRoof.position.set(0.16, mainH + 0.075 + 0.025, -0.08);
    house.add(mainRoof);

    // 3. 內縮角落遮雨前廊 (Recessed Porch)
    // 坐落於側翼與主樓夾角 (X=+0.15, Z=+0.16)
    const porch = this.createPorchAwning(0.24, 0.14, 0.23, this.roofSlateDarkMat);
    porch.position.set(0.15, 0.025, 0.14);
    house.add(porch);

    // 正面大門 (+Z 側，位於前廊內牆)
    const door = this.createFrontDoor(0.09, 0.20, { doorMat: this.doorWoodMat, hasLantern: true });
    door.position.set(0.11, 0.04, 0.14);
    house.add(door);

    // 4. 窗戶與立面細節
    // 左翼正面經典雙格對開窗
    const winFront = this.createWindow(0.14, 0.12, { style: 'white', panesX: 2, panesY: 2, sill: true });
    winFront.position.set(-0.16, 0.17 + 0.025, 0.302);
    house.add(winFront);

    // 左翼側窗 (-X 側)
    const winLeft = this.createWindow(0.12, 0.11, { style: 'white', panesX: 2, panesY: 2, sill: true });
    winLeft.rotation.y = -Math.PI / 2;
    winLeft.position.set(-0.332, 0.17 + 0.025, 0.04);
    house.add(winLeft);

    // 主樓前採光窗 (+Z 側)
    const winRight = this.createWindow(0.11, 0.11, { style: 'white', panesX: 2, panesY: 2, sill: true });
    winRight.position.set(0.25, 0.16 + 0.025, 0.142);
    house.add(winRight);

    // 紅磚煙囪 (位於後側山坡屋頂上)
    const chim = this.createChimney(0.38, 0.065, 0.065);
    chim.position.set(-0.24, 0.14 + 0.025, -0.15);
    house.add(chim);

    // 5. 庭院硬景與植栽
    // 前庭走道石板 (從大門門廊延伸通往馬路 +Z 側邊緣)
    const pathGeo = new THREE.BoxGeometry(0.18, 0.008, 0.30);
    const path = new THREE.Mesh(pathGeo, this.pathMat);
    path.position.set(0.15, 0.029, 0.35);
    path.receiveShadow = true;
    house.add(path);

    // 前方街角修剪綠籬 (-X, +Z 前角)
    const hedge1 = this.createHedge(0.36, 0.075, 0.07);
    hedge1.position.set(-0.28, 0.038 + 0.025, 0.43);
    house.add(hedge1);

    const hedge2 = this.createHedge(0.07, 0.075, 0.28);
    hedge2.position.set(-0.43, 0.038 + 0.025, 0.28);
    house.add(hedge2);

    // 前院珊瑚粉花叢
    const bush1 = this.createBush(0.055, 'coral');
    bush1.position.set(0.35, 0, 0.34);
    house.add(bush1);

    const bush2 = this.createBush(0.045, 'yellow');
    bush2.position.set(-0.02, 0, 0.32);
    house.add(bush2);

    // 後院側向白柵欄
    const fence = this.createPicketFence(0.35, 'X', 0.085);
    fence.position.set(-0.28, 0, -0.42);
    house.add(fence);

    return house;
  }

  /**
   * 2. 低密度住宅 2x3 (2 人 / Two People)
   * 佔地: 面寬 1.0m (2格) × 縱深 1.5m (3格)
   * 風格: 北歐當代單坡斜頂住宅與景觀深庭 (Contemporary Nordic Mono-pitch Studio)
   * 幾何特徵:
   * - 窄面寬、大縱深之立體雙量體 (前高後低傾斜單坡屋頂)
   * - 溫暖垂直雪松木飾板 (Cedar Siding) 結合現代白灰泥外牆
   * - 一樓轉角大面採光全景落地窗與頂部高窗 (Clerestory Window)
   * - 懸臂金屬薄雨棚、現代深色正門與金屬煙囪鋼管
   * - 寬廣休閒後庭花園，配有景觀落葉大綠樹與後院橫向木圍籬
   */
  public static createResidential_2x3(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_2x3';

    // 1. 庭院地基 (1.0m x 1.5m，縱深大)
    house.add(this.createBaseLot(1.0, 1.5));

    // 2. 主建築量體 (前棟挑高單坡屋頂建築: Z=+0.12)
    const mainW = 0.58;
    const mainD = 0.62;
    const mainH = 0.36; // 挑高層次
    const mainBodyGeo = new THREE.BoxGeometry(mainW, mainH, mainD);
    const mainBody = new THREE.Mesh(mainBodyGeo, this.wallIvoryMat);
    mainBody.position.set(-0.04, mainH / 2 + 0.025, 0.12);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    house.add(mainBody);

    // 二樓上半部暖雪松木飾板特色牆 (立面異材質層次)
    const woodAccentGeo = new THREE.BoxGeometry(mainW + 0.008, 0.14, mainD * 0.55);
    const woodAccent = new THREE.Mesh(woodAccentGeo, this.wallWoodCedarMat);
    woodAccent.position.set(-0.04, mainH - 0.07 + 0.025, 0.24);
    woodAccent.castShadow = true;
    house.add(woodAccent);

    // 主屋頂：前高後低之金屬單坡斜頂 (Shed Roof)
    const shedRoof = this.createShedRoof(mainW, 0.12, mainD, 'Z', 1, this.roofDarkMetalMat, 0.04);
    shedRoof.position.set(-0.04, mainH + 0.06 + 0.025, 0.12);
    house.add(shedRoof);

    // 3. 後方次量體 (後庭平屋頂工作室: Z=-0.36)
    const rearW = 0.48;
    const rearD = 0.42;
    const rearH = 0.25;
    const rearBody = new THREE.Mesh(new THREE.BoxGeometry(rearW, rearH, rearD), this.wallSandMat);
    rearBody.position.set(0.04, rearH / 2 + 0.025, -0.36);
    rearBody.castShadow = true;
    rearBody.receiveShadow = true;
    house.add(rearBody);

    const rearRoof = this.createFlatParapetRoof(rearW, rearD, this.wallSandMat, this.roofDarkMetalMat);
    rearRoof.position.set(0.04, rearH + 0.025, -0.36);
    house.add(rearRoof);

    // 4. 門窗與精緻細節
    // 現代黑鋼懸挑式扁平遮雨棚 (Cantilevered Canopy)
    const canopyGeo = new THREE.BoxGeometry(0.22, 0.012, 0.12);
    const canopy = new THREE.Mesh(canopyGeo, this.roofDarkMetalMat);
    canopy.position.set(0.16, 0.24 + 0.025, 0.44);
    canopy.castShadow = true;
    house.add(canopy);

    // 簡約黑鋼大門
    const door = this.createFrontDoor(0.09, 0.20, { doorMat: this.doorDarkMat, frameMat: this.frameDarkMat, hasLantern: true });
    door.position.set(0.16, 0.025, 0.43);
    house.add(door);

    // 一樓客廳大面黑框落地採光窗 (+Z, X=-0.16)
    const winLiving = this.createPanoramicWindow(0.24, 0.19, 2);
    winLiving.position.set(-0.17, 0.10 + 0.025, 0.432);
    house.add(winLiving);

    // 側向高窗 (High Clerestory Window on -X wall)
    const winSide = this.createWindow(0.22, 0.08, { style: 'dark', panesX: 2, panesY: 1, sill: false });
    winSide.rotation.y = -Math.PI / 2;
    winSide.position.set(-0.332, 0.28 + 0.025, 0.18);
    house.add(winSide);

    // 當代細圓柱金屬排煙管 (Modern Metal Flue)
    const flueGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8);
    const flue = new THREE.Mesh(flueGeo, this.roofDarkMetalMat);
    flue.position.set(-0.20, mainH + 0.16 + 0.025, 0.02);
    flue.castShadow = true;
    house.add(flue);

    const flueCowl = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.018, 8), this.roofDarkMetalMat);
    flueCowl.position.set(-0.20, mainH + 0.32 + 0.025, 0.02);
    house.add(flueCowl);

    // 5. 前庭與後庭景觀
    // 前庭長條石板走道
    const pathGeo = new THREE.BoxGeometry(0.20, 0.008, 0.32);
    const path = new THREE.Mesh(pathGeo, this.pathMat);
    path.position.set(0.16, 0.029, 0.58);
    path.receiveShadow = true;
    house.add(path);

    // 前院右側幾何綠籬
    const frontHedge = this.createHedge(0.08, 0.07, 0.32);
    frontHedge.position.set(0.40, 0.035 + 0.025, 0.56);
    house.add(frontHedge);

    // 後花園中心落葉景觀樹 (位於後庭 Z=-0.58)
    const gardenTree = this.createDeciduousTree(1.15);
    gardenTree.position.set(-0.16, 0, -0.58);
    house.add(gardenTree);

    // 後花園步道踏石
    const stoneGeo = new THREE.BoxGeometry(0.12, 0.006, 0.12);
    const s1 = new THREE.Mesh(stoneGeo, this.pathMat);
    s1.position.set(0.18, 0.028, -0.48);
    house.add(s1);
    const s2 = new THREE.Mesh(stoneGeo, this.pathMat);
    s2.position.set(0.16, 0.028, -0.62);
    house.add(s2);

    // 後院木質隱私格柵籬笆 (-Z 側邊界)
    const rearFenceGeo = new THREE.BoxGeometry(0.88, 0.11, 0.012);
    const rearFence = new THREE.Mesh(rearFenceGeo, this.wallWoodCedarMat);
    rearFence.position.set(0, 0.055 + 0.025, -0.71);
    rearFence.castShadow = true;
    house.add(rearFence);

    return house;
  }

  /**
   * 3. 低密度住宅 3x2 (2 人 / Two People)
   * 佔地: 面寬 1.5m (3格) × 縱深 1.0m (2格)
   * 風格: 暖陽地中海/西班牙莊園平房 (Mediterranean Arched Villa / Tuscan Bungalow)
   * 幾何特徵:
   * - 寬面寬、淺縱深之悠然莊園平房比例
   * - 經典西班牙陶土紅磚四坡歇山頂 (Terracotta Hip Roof)
   * - 正面雙拱柱前廊玄關 (Double-Arched Portico Loggia)，挑高足供市民穿行
   * - 暖沙灰泥外壁、拱形窗套、陶土煙囪與左翼側景松柏針葉樹
   * - 氣派寬石階露台與兩側對稱矮灌木花圃
   */
  public static createResidential_3x2(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_3x2';

    // 1. 庭院地基 (1.5m x 1.0m，寬面寬)
    house.add(this.createBaseLot(1.5, 1.0));

    // 2. 主建築量體 (寬 1.08m, 高 0.28m, 深 0.52m，稍偏後 Z=-0.06)
    const bodyW = 1.08;
    const bodyD = 0.52;
    const bodyH = 0.28;
    const bodyGeo = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
    const body = new THREE.Mesh(bodyGeo, this.wallSandMat);
    body.position.set(0.04, bodyH / 2 + 0.025, -0.06);
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // 經典西班牙四坡屋頂 (Terracotta Hip Roof)
    const hipRoof = this.createHipRoof(bodyW, 0.17, bodyD, this.roofTerracottaMat, 0.04);
    hipRoof.position.set(0.04, bodyH + 0.085 + 0.025, -0.06);
    house.add(hipRoof);

    // 3. 正面雙拱玄關走廊 (Spanish Arched Loggia: X=+0.10, Z=+0.22)
    const archGroup = new THREE.Group();
    archGroup.position.set(0.12, 0.025, 0.20);

    const loggiaW = 0.52;
    const loggiaD = 0.15;
    const loggiaH = 0.24;

    // 前柱三根 (左、中、右)
    const colGeo = new THREE.BoxGeometry(0.028, loggiaH, 0.028);
    const col1 = new THREE.Mesh(colGeo, this.wallSandMat);
    col1.position.set(-loggiaW / 2 + 0.02, loggiaH / 2, loggiaD / 2);
    archGroup.add(col1);

    const col2 = new THREE.Mesh(colGeo, this.wallSandMat);
    col2.position.set(0, loggiaH / 2, loggiaD / 2);
    archGroup.add(col2);

    const col3 = new THREE.Mesh(colGeo, this.wallSandMat);
    col3.position.set(loggiaW / 2 - 0.02, loggiaH / 2, loggiaD / 2);
    archGroup.add(col3);

    // 頂部拱門橫樑
    const lintelGeo = new THREE.BoxGeometry(loggiaW + 0.02, 0.028, loggiaD + 0.02);
    const lintel = new THREE.Mesh(lintelGeo, this.wallSandMat);
    lintel.position.set(0, loggiaH - 0.014, loggiaD / 2);
    archGroup.add(lintel);

    // 雙拱形斜角修飾 (Low-poly Spanish Arch Brackets)
    const bracketGeo = new THREE.BoxGeometry(0.03, 0.03, 0.026);
    [-0.19, -0.07, 0.07, 0.19].forEach((bx) => {
      const br = new THREE.Mesh(bracketGeo, this.wallSandMat);
      br.position.set(bx, loggiaH - 0.035, loggiaD / 2);
      br.rotation.z = Math.PI / 4;
      archGroup.add(br);
    });

    // 拱廊紅瓦小遮簷
    const loggiaRoof = this.createHipRoof(loggiaW, 0.07, loggiaD, this.roofTerracottaMat, 0.02);
    loggiaRoof.position.set(0, loggiaH + 0.035, loggiaD / 2);
    archGroup.add(loggiaRoof);

    // 拱廊基座寬石階
    const terraceGeo = new THREE.BoxGeometry(loggiaW + 0.06, 0.016, loggiaD + 0.08);
    const terrace = new THREE.Mesh(terraceGeo, this.pathMat);
    terrace.position.set(0, 0.008, loggiaD / 2);
    archGroup.add(terrace);

    house.add(archGroup);

    // 拱廊內大門
    const door = this.createFrontDoor(0.09, 0.20, { doorMat: this.doorWoodMat, hasLantern: true });
    door.position.set(0.12, 0.04, 0.19);
    house.add(door);

    // 4. 立面窗戶與煙囪
    // 左翼主窗 (+Z 側，黑黑古典窗框)
    const winLeft = this.createWindow(0.15, 0.12, { style: 'dark', panesX: 2, panesY: 2, sill: true });
    winLeft.position.set(-0.32, 0.16 + 0.025, 0.202);
    house.add(winLeft);

    // 右翼窗 (+Z 側)
    const winRight = this.createWindow(0.13, 0.12, { style: 'dark', panesX: 2, panesY: 2, sill: true });
    winRight.position.set(0.44, 0.16 + 0.025, 0.202);
    house.add(winRight);

    // 地中海灰泥方型煙囪
    const chim = this.createChimney(0.36, 0.07, 0.07);
    chim.position.set(0.38, 0.14 + 0.025, -0.16);
    house.add(chim);

    // 5. 莊園庭院造景
    // 門前寬敞石板迎賓大道
    const pathGeo = new THREE.BoxGeometry(0.32, 0.008, 0.26);
    const path = new THREE.Mesh(pathGeo, this.pathMat);
    path.position.set(0.12, 0.029, 0.37);
    path.receiveShadow = true;
    house.add(path);

    // 左側典雅針葉柏樹 (Tuscan Cypress)
    const cypress = this.createConiferTree(1.2);
    cypress.position.set(-0.56, 0, 0.18);
    house.add(cypress);

    // 迎賓矮綠籬
    const h1 = this.createHedge(0.24, 0.07, 0.06);
    h1.position.set(-0.16, 0.035 + 0.025, 0.42);
    house.add(h1);

    const h2 = this.createHedge(0.24, 0.07, 0.06);
    h2.position.set(0.40, 0.035 + 0.025, 0.42);
    house.add(h2);

    // 門前盆栽小花叢
    const potBush = this.createBush(0.045, 'coral');
    potBush.position.set(-0.06, 0, 0.32);
    house.add(potBush);

    return house;
  }

  /**
   * 4. 低密度住宅 3x3 (3 人 / 3 People)
   * 佔地: 面寬 1.5m (3格) × 縱深 1.5m (3格)
   * 風格: 雙層現代美式工藝家庭別墅 (Two-Story Craftsman Family Villa with Balcony & Driveway)
   * 幾何特徵:
   * - 階梯式真雙層建築 (一樓大客廳、二樓主臥內縮帶景觀大露台)
   * - 專屬側邊私家車道 (Driveway: 寬 0.46m × 深 0.90m，完美停放長 0.37m 自用轎車)
   * - 複合雙斜屋頂 + 前側斜坡閣樓老虎窗 (Roof Dormer Window)
   * - 二樓全景玻璃落地窗與白木防護欄杆 (Balcony Railing)
   * - 前庭完整白木柵欄圍護、入戶迎賓草坪與蓬鬆落葉庭蔭樹
   */
  public static createResidential_3x3(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_3x3';

    // 1. 庭院地基 (1.5m x 1.5m)
    house.add(this.createBaseLot(1.5, 1.5));

    // 2. 側邊私家車道 (位於右側 X=+0.46，直通馬路 +Z 側)
    const drivewayGeo = new THREE.BoxGeometry(0.46, 0.008, 0.95);
    const driveway = new THREE.Mesh(drivewayGeo, this.drivewayMat);
    driveway.position.set(0.46, 0.029, 0.24);
    driveway.receiveShadow = true;
    house.add(driveway);

    // 車道邊緣草坪分隔緣石
    const curbGeo = new THREE.BoxGeometry(0.02, 0.012, 0.95);
    const curb = new THREE.Mesh(curbGeo, this.plinthMat);
    curb.position.set(0.22, 0.031, 0.24);
    house.add(curb);

    // 3. 一樓主建築 (寬 0.82m, 高 0.28m, 深 0.84m，位於中心偏左 X=-0.22)
    const f1W = 0.82;
    const f1D = 0.84;
    const f1H = 0.28;
    const f1Geo = new THREE.BoxGeometry(f1W, f1H, f1D);
    const floor1 = new THREE.Mesh(f1Geo, this.wallIvoryMat);
    floor1.position.set(-0.22, f1H / 2 + 0.025, -0.04);
    floor1.castShadow = true;
    floor1.receiveShadow = true;
    house.add(floor1);

    // 一樓防潮石材基座
    const f1Plinth = new THREE.Mesh(new THREE.BoxGeometry(f1W + 0.01, 0.024, f1D + 0.01), this.plinthMat);
    f1Plinth.position.set(-0.22, 0.012 + 0.025, -0.04);
    house.add(f1Plinth);

    // 4. 二樓主樓 (寬 0.70m, 高 0.26m, 深 0.72m，前退 0.08m 形成前陽台)
    const f2W = 0.70;
    const f2D = 0.72;
    const f2H = 0.26;
    const f2Geo = new THREE.BoxGeometry(f2W, f2H, f2D);
    const floor2 = new THREE.Mesh(f2Geo, this.wallWoodCedarMat); // 二樓採用精緻暖雪松木板
    floor2.position.set(-0.22, f1H + f2H / 2 + 0.025, -0.10);
    floor2.castShadow = true;
    floor2.receiveShadow = true;
    house.add(floor2);

    // 二樓主屋頂 (陡峭海軍冷石板青灰雙斜瓦頂)
    const mainRoof = this.createGableRoof(f2W, 0.22, f2D, this.roofSlateBlueMat, 0.045, 0.045);
    mainRoof.position.set(-0.22, f1H + f2H + 0.11 + 0.025, -0.10);
    house.add(mainRoof);

    // 屋頂正面斜坡上的精緻老虎窗 (Attic Dormer)
    const dormer = this.createDormer(0.15, 0.12, 0.16, this.roofSlateBlueMat, this.wallIvoryMat);
    dormer.position.set(-0.22, f1H + f2H + 0.10 + 0.025, 0.16);
    house.add(dormer);

    // 5. 二樓前向景觀陽台 (Balcony on +Z)
    const balconyW = 0.40;
    const balconyD = 0.14;
    const balconyFloor = new THREE.Mesh(new THREE.BoxGeometry(balconyW, 0.015, balconyD), this.pathMat);
    balconyFloor.position.set(-0.22, f1H + 0.025, 0.32);
    house.add(balconyFloor);

    // 陽台白木護欄 (高 0.085m)
    const bRailFront = this.createPicketFence(balconyW, 'X', 0.08);
    bRailFront.position.set(-0.22, f1H + 0.01, 0.38);
    house.add(bRailFront);

    const bRailLeft = this.createPicketFence(balconyD, 'Z', 0.08);
    bRailLeft.position.set(-0.22 - balconyW / 2, f1H + 0.01, 0.32);
    house.add(bRailLeft);

    const bRailRight = this.createPicketFence(balconyD, 'Z', 0.08);
    bRailRight.position.set(-0.22 + balconyW / 2, f1H + 0.01, 0.32);
    house.add(bRailRight);

    // 陽台落地雙開玻璃門
    const balconyDoor = this.createPanoramicWindow(0.18, 0.18, 2);
    balconyDoor.position.set(-0.22, f1H + 0.10 + 0.025, 0.258);
    house.add(balconyDoor);

    // 6. 一樓大門與門廊
    const porch = this.createPorchAwning(0.24, 0.14, 0.22, this.roofSlateDarkMat);
    porch.position.set(-0.12, 0.025, 0.42);
    house.add(porch);

    const frontDoor = this.createFrontDoor(0.09, 0.20, { doorMat: this.doorNavyMat, hasLantern: true });
    frontDoor.position.set(-0.12, 0.04, 0.37);
    house.add(frontDoor);

    // 一樓客廳正面凸窗
    const winLiving = this.createWindow(0.18, 0.13, { style: 'white', panesX: 3, panesY: 2, sill: true });
    winLiving.position.set(-0.44, 0.16 + 0.025, 0.382);
    house.add(winLiving);

    // 側翼大煙囪
    const chim = this.createChimney(0.58, 0.08, 0.08);
    chim.position.set(-0.58, 0.24 + 0.025, -0.16);
    house.add(chim);

    // 7. 前庭院硬景與植栽
    // 前門步道石板
    const pathGeo = new THREE.BoxGeometry(0.18, 0.008, 0.24);
    const path = new THREE.Mesh(pathGeo, this.pathMat);
    path.position.set(-0.12, 0.029, 0.58);
    path.receiveShadow = true;
    house.add(path);

    // 前院白木柵欄 (保留大門步道缺口與車道入口)
    const fence1 = this.createPicketFence(0.40, 'X', 0.085);
    fence1.position.set(-0.44, 0, 0.68);
    house.add(fence1);

    // 前院左角繁盛遮陽落葉樹
    const shadeTree = this.createDeciduousTree(1.25);
    shadeTree.position.set(-0.52, 0, 0.42);
    house.add(shadeTree);

    // 花園灌木叢
    const b1 = this.createBush(0.055, 'coral');
    b1.position.set(-0.26, 0, 0.55);
    house.add(b1);

    const b2 = this.createBush(0.045, 'yellow');
    b2.position.set(0.12, 0, 0.58);
    house.add(b2);

    return house;
  }

  /**
   * 5. 低密度住宅 4x4 (4 人 / 4 People)
   * 佔地: 面寬 2.0m (4格) × 縱深 2.0m (4格)
   * 風格: 頂級當代包浩斯豪華莊園別墅 (Luxury Modern Bauhaus Manor with Garage & Poolside Terrace)
   * 幾何特徵:
   * - 氣派複合多量體交疊：附屬單車位車庫、中央挑高懸挑主臥、全景通透落地玻璃幕牆
   * - 懸臂二樓 (Cantilevered Upper Volume)、深邃頂級內凹玄關、戶外露台與護欄
   * - 雙車位寬敞混擬土車道、對稱現代幾何修剪綠籬、名貴落葉景觀樹與高聳松柏雙植栽
   * - 當代金屬折板天溝壓頂、深黑隱藏式鋁合金窄邊框窗
   */
  public static createResidential_4x4(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_4x4';

    // 1. 庭院地基 (2.0m x 2.0m，氣派大莊園)
    house.add(this.createBaseLot(2.0, 2.0));

    // 2. 左側附屬單車位專屬車庫棟 (Garage Wing: X=-0.54, Z=+0.08)
    const gW = 0.64;
    const gD = 0.86;
    const gH = 0.28;
    const garageBody = new THREE.Mesh(new THREE.BoxGeometry(gW, gH, gD), this.wallCharcoalMat);
    garageBody.position.set(-0.54, gH / 2 + 0.025, 0.08);
    garageBody.castShadow = true;
    garageBody.receiveShadow = true;
    house.add(garageBody);

    // 車庫平屋頂壓頂
    const garageRoof = this.createFlatParapetRoof(gW, gD, this.wallCharcoalMat, this.roofDarkMetalMat);
    garageRoof.position.set(-0.54, gH + 0.025, 0.08);
    house.add(garageRoof);

    // 現代水平深黑金屬車庫捲門 (+Z 側，寬 0.44m, 高 0.21m)
    const gDoorGeo = new THREE.BoxGeometry(0.44, 0.21, 0.014);
    const garageDoor = new THREE.Mesh(gDoorGeo, this.doorDarkMat);
    garageDoor.position.set(-0.54, 0.105 + 0.025, 0.512);
    house.add(garageDoor);

    // 車庫專屬直通馬路之寬大車道 (Driveway: 寬 0.60m, 深 0.72m)
    const gDrivewayGeo = new THREE.BoxGeometry(0.60, 0.008, 0.72);
    const gDriveway = new THREE.Mesh(gDrivewayGeo, this.drivewayMat);
    gDriveway.position.set(-0.54, 0.029, 0.64);
    gDriveway.receiveShadow = true;
    house.add(gDriveway);

    // 3. 一樓主住宅本體 (中央與右翼: X=+0.20, Z=-0.04)
    const m1W = 1.05;
    const m1D = 1.05;
    const m1H = 0.32;
    const m1Geo = new THREE.BoxGeometry(m1W, m1H, m1D);
    const main1F = new THREE.Mesh(m1Geo, this.wallIvoryMat);
    main1F.position.set(0.20, m1H / 2 + 0.025, -0.04);
    main1F.castShadow = true;
    main1F.receiveShadow = true;
    house.add(main1F);

    // 4. 二樓懸挑主臥棟 (Cantilevered 2F Volume: X=+0.24, Z=+0.08，向前懸空突出)
    const m2W = 1.10;
    const m2D = 0.94;
    const m2H = 0.28;
    const main2F = new THREE.Mesh(new THREE.BoxGeometry(m2W, m2H, m2D), this.wallSandMat);
    main2F.position.set(0.24, m1H + m2H / 2 + 0.025, 0.08);
    main2F.castShadow = true;
    main2F.receiveShadow = true;
    house.add(main2F);

    // 二樓側邊垂直木格柵屏風飾面 (Architectural Timber Louver)
    const louverGeo = new THREE.BoxGeometry(0.26, m2H + 0.01, m2D * 0.45);
    const louver = new THREE.Mesh(louverGeo, this.wallWoodCedarMat);
    louver.position.set(0.66, m1H + m2H / 2 + 0.025, 0.20);
    louver.castShadow = true;
    house.add(louver);

    // 二樓平屋頂與深色防水壓頂
    const m2Roof = this.createFlatParapetRoof(m2W, m2D, this.wallSandMat, this.roofDarkMetalMat);
    m2Roof.position.set(0.24, m1H + m2H + 0.025, 0.08);
    house.add(m2Roof);

    // 5. 二樓全景陽台與透明無框玻璃護欄
    const balconyGeo = new THREE.BoxGeometry(0.48, 0.015, 0.16);
    const balcony = new THREE.Mesh(balconyGeo, this.pathMat);
    balcony.position.set(0.15, m1H + 0.025, 0.58);
    house.add(balcony);

    const bRailGeo = new THREE.BoxGeometry(0.48, 0.08, 0.01);
    const bRail = new THREE.Mesh(bRailGeo, this.glassMat);
    bRail.position.set(0.15, m1H + 0.04 + 0.025, 0.66);
    house.add(bRail);

    const bRailCap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.008, 0.016), this.frameDarkMat);
    bRailCap.position.set(0.15, m1H + 0.084 + 0.025, 0.66);
    house.add(bRailCap);

    // 二樓大面陽台落地推拉門
    const f2GlassDoor = this.createPanoramicWindow(0.36, 0.20, 2);
    f2GlassDoor.position.set(0.15, m1H + 0.11 + 0.025, 0.548);
    house.add(f2GlassDoor);

    // 6. 一樓大門、內凹玄關門廊與大落地景觀窗
    // 懸挑二樓下方的庇護內凹前廊 (Recessed Portico)
    const frontDoor = this.createFrontDoor(0.11, 0.22, { doorMat: this.doorDarkMat, frameMat: this.frameDarkMat, hasLantern: true });
    frontDoor.position.set(-0.06, 0.025, 0.48);
    house.add(frontDoor);

    // 一樓客廳宏偉通透落地玻璃幕牆 (Glass Curtain Wall)
    const f1GlassWall = this.createPanoramicWindow(0.42, 0.22, 3);
    f1GlassWall.position.set(0.36, 0.11 + 0.025, 0.482);
    house.add(f1GlassWall);

    // 7. 莊園庭園景觀硬景與名貴樹木
    // 入口氣派天然石板踏面
    const walkwayGeo = new THREE.BoxGeometry(0.28, 0.008, 0.45);
    const walkway = new THREE.Mesh(walkwayGeo, this.pathMat);
    walkway.position.set(-0.06, 0.029, 0.74);
    walkway.receiveShadow = true;
    house.add(walkway);

    // 雙植栽陣列：
    // (A) 右前方繁盛大落葉名樹
    const manorTree1 = this.createDeciduousTree(1.35);
    manorTree1.position.set(0.72, 0, 0.58);
    house.add(manorTree1);

    // (B) 後花園常青高聳針葉樹
    const manorTree2 = this.createConiferTree(1.4);
    manorTree2.position.set(-0.72, 0, -0.62);
    house.add(manorTree2);

    // 莊園前庭現代幾何修剪方塊綠籬
    const boxHedge1 = this.createHedge(0.35, 0.08, 0.08);
    boxHedge1.position.set(0.42, 0.04 + 0.025, 0.78);
    house.add(boxHedge1);

    const boxHedge2 = this.createHedge(0.08, 0.08, 0.28);
    boxHedge2.position.set(0.85, 0.04 + 0.025, 0.25);
    house.add(boxHedge2);

    // 點綴花卉矮灌木
    const gardenBush1 = this.createBush(0.06, 'coral');
    gardenBush1.position.set(0.18, 0, 0.78);
    house.add(gardenBush1);

    const gardenBush2 = this.createBush(0.05, 'yellow');
    gardenBush2.position.set(-0.16, 0, 0.52);
    house.add(gardenBush2);

    return house;
  }

  // ==========================================
  // 4. 元資料目錄與統一實例化介面
  // ==========================================

  public static getModelsCatalog(): BuildingMetadata[] {
    return [
      {
        id: 'Residential_2x2',
        name: '低密度住宅 2x2',
        category: 'Residential_Low',
        frontageWidth: 2,
        lotDepth: 2,
        capacity: 2,
        description: '經典美式 L 型雙斜屋頂精緻小屋，凹入式前廊、立柱雨棚與珊瑚花圃。',
        features: [
          '2 人居住容量 (2 People)',
          '面寬 2 格 · 縱深 2 格 (1.0m × 1.0m)',
          '非對稱 L 型立體翼樓與深石板人字瓦頂',
          '符合市民身高 (0.178m) 門窗比例 (門高 0.21m)',
          '修剪綠籬、石板小徑與白木柵欄',
        ],
      },
      {
        id: 'Residential_2x3',
        name: '低密度住宅 2x3',
        category: 'Residential_Low',
        frontageWidth: 2,
        lotDepth: 3,
        capacity: 2,
        description: '北歐當代單坡斜頂住宅，大縱深悠然長型後花園、高窗與景觀落葉樹。',
        features: [
          '2 人居住容量 (2 People)',
          '窄面寬 2 格 · 大縱深 3 格 (1.0m × 1.5m)',
          '當代單坡斜屋頂 (Shed Roof) 與暖雪松木飾板',
          '一樓轉角大採光落地窗與金屬通氣煙囪',
          '大面積景觀後庭花園與後院木格柵籬笆',
        ],
      },
      {
        id: 'Residential_3x2',
        name: '低密度住宅 3x2',
        category: 'Residential_Low',
        frontageWidth: 3,
        lotDepth: 2,
        capacity: 2,
        description: '暖陽地中海/西班牙莊園平房，西班牙陶土紅磚歇山四坡頂與雙拱柱走廊。',
        features: [
          '2 人居住容量 (2 People)',
          '寬面寬 3 格 · 淺縱深 2 格 (1.5m × 1.0m)',
          '西班牙陶土四坡歇山頂 (Terracotta Hip Roof)',
          '正面雙拱柱前廊玄關 (Double-Arched Portico)',
          '左側意境針葉柏樹 (Tuscan Cypress) 與花壇',
        ],
      },
      {
        id: 'Residential_3x3',
        name: '低密度住宅 3x3',
        category: 'Residential_Low',
        frontageWidth: 3,
        lotDepth: 3,
        capacity: 3,
        description: '雙層現代美式工藝家庭別墅，附設單車位專屬車道、二樓景觀大露台與老虎窗。',
        features: [
          '3 人居住容量 (3 People / 3p)',
          '面寬 3 格 · 縱深 3 格 (1.5m × 1.5m)',
          '階梯式雙層立體量體 (雪松二樓內縮帶護欄露台)',
          '右側專屬私家車道 (寬 0.46m × 深 0.95m，完美容納轎車)',
          '斜坡屋頂老虎窗 (Dormer) 與茂密庭蔭樹',
        ],
      },
      {
        id: 'Residential_4x4',
        name: '低密度住宅 4x4',
        category: 'Residential_Low',
        frontageWidth: 4,
        lotDepth: 4,
        capacity: 4,
        description: '包浩斯頂級現代豪華莊園別墅，附屬獨立車庫、懸挑二樓、無框玻璃陽台與雙名木庭園。',
        features: [
          '4 人居住容量 (4 People / 4p)',
          '大面寬 4 格 · 大縱深 4 格 (2.0m × 2.0m)',
          '附屬獨立車庫棟 (附專屬寬敞雙車位聯外車道)',
          '懸挑二樓主臥 (Cantilever Volume) 與無框玻璃陽台',
          '全景落地玻璃幕牆與名貴雙植栽 (常青松柏 + 大落葉樹)',
        ],
      },
    ];
  }

  /**
   * 根據 ID 建立房屋實體模型
   * 模型直接以真實世界 1:1 單位建模 (1 格 = 0.5m，面寬/縱深精準貼合分區網格)
   */
  public static createBuildingById(id: string): THREE.Group | null {
    let building: THREE.Group | null = null;
    switch (id) {
      case 'Residential_2x2':
        building = this.createResidential_2x2();
        break;
      case 'Residential_2x3':
        building = this.createResidential_2x3();
        break;
      case 'Residential_3x2':
        building = this.createResidential_3x2();
        break;
      case 'Residential_3x3':
        building = this.createResidential_3x3();
        break;
      case 'Residential_4x4':
        building = this.createResidential_4x4();
        break;
      default:
        return null;
    }

    if (building) {
      // 保持 1:1 真實比例 (1 單位 = 10m，0.1 單位 = 1m，精確契合市民與車道)
      building.scale.set(1.0, 1.0, 1.0);
      const rootWrapper = new THREE.Group();
      rootWrapper.name = `${id}_RootWrapper`;
      rootWrapper.add(building);
      return rootWrapper;
    }
    return null;
  }
}
