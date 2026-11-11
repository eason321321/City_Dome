import * as THREE from 'three';

export interface BuildingMetadata {
  id: string;
  name: string;
  category: 'Residential_Low' | 'Industrial_Low';
  frontageWidth: number;   // 面寬格數 (每格 0.5m)
  lotDepth: number;        // 縱深格數 (每格 0.5m)
  capacity: number;        // 居住人口上限 / 工作人數上限
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
  // 工業區專屬材質 (Industrial Materials)
  // ==========================================
  private static concreteIndYardMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // 硬質混擬土廠區地坪
    roughness: 0.82,
    metalness: 0.08,
  });

  private static concreteIndOilStainMat = new THREE.MeshStandardMaterial({
    color: 0x475569, // 地面油漬/輪胎磨痕
    roughness: 0.9,
    metalness: 0.05,
  });

  private static asphaltIndYardMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // 瀝青轉運廣場地坪
    roughness: 0.88,
    metalness: 0.1,
  });

  private static curbIndDarkMat = new THREE.MeshStandardMaterial({
    color: 0x64748b, // 廠區邊界基台與路緣
    roughness: 0.8,
    metalness: 0.1,
  });

  private static stripeHazardYellowMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // 亮黃色警示線/車位劃線
    roughness: 0.35,
    metalness: 0.1,
  });

  private static stripeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9, // 純白地面劃線
    roughness: 0.35,
  });

  private static wallIndOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xea580c, // 小型工廠活力橘 (Orange Factory Wall)
    roughness: 0.65,
    metalness: 0.08,
  });

  private static wallIndYellowMat = new THREE.MeshStandardMaterial({
    color: 0xca8a04, // 維修廠暖調工業黃 (Industrial Yellow Stucco)
    roughness: 0.68,
    metalness: 0.06,
  });

  private static wallIndPlinthDarkRedMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d, // 維修廠暗紅防撞基座水線
    roughness: 0.75,
    metalness: 0.1,
  });

  private static wallIndWarehouseRedMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c, // 物流倉庫現代紅磚/陶土外牆
    roughness: 0.72,
    metalness: 0.05,
  });

  private static wallIndPylonYellowMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // 物流倉庫亮黃色主立面門廊塔
    roughness: 0.5,
    metalness: 0.12,
  });

  private static wallIndFactoryRedMat = new THREE.MeshStandardMaterial({
    color: 0x9f1239, // 中型工廠重工業深玫瑰暗紅外牆
    roughness: 0.65,
    metalness: 0.1,
  });

  private static wallIndBlueTowerMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // 藍灰工業技術控制塔樓
    roughness: 0.55,
    metalness: 0.25,
  });

  private static roofIndSlateDarkMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // 經典浪板石板鐵皮斜屋頂
    roughness: 0.42,
    metalness: 0.28,
  });

  private static roofIndSkylightGlassMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, // 採光天窗玻璃 (亮水藍半透光反光)
    roughness: 0.1,
    metalness: 0.8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.75,
  });

  private static roofIndHvacGreyMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // 屋頂排氣機組與空調冷卻器
    roughness: 0.5,
    metalness: 0.45,
  });

  private static steelBlueMat = new THREE.MeshStandardMaterial({
    color: 0x2563eb, // 汽車舉升機立柱/鋼構藍
    roughness: 0.35,
    metalness: 0.5,
  });

  private static steelDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // 工業深黑鋼架與護欄
    roughness: 0.4,
    metalness: 0.6,
  });

  private static machineGreenMat = new THREE.MeshStandardMaterial({
    color: 0x15803d, // 車床機台機械深綠
    roughness: 0.55,
    metalness: 0.2,
  });

  private static barrelBlueMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // 55加侖標準藍色機油桶
    roughness: 0.4,
    metalness: 0.3,
  });

  private static barrelRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626, // 紅色燃油桶/滅火器
    roughness: 0.4,
    metalness: 0.25,
  });

  private static barrelYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24, // 黃色化學防護桶
    roughness: 0.4,
    metalness: 0.2,
  });

  private static toolBoxRedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444, // 紅色工具箱/千斤頂
    roughness: 0.35,
    metalness: 0.3,
  });

  private static pipeYellowMat = new THREE.MeshStandardMaterial({
    color: 0xeab308, // 亮黃色製程管線
    roughness: 0.4,
    metalness: 0.35,
  });

  private static pipeBlueMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9, // 高空藍色排氣風管
    roughness: 0.4,
    metalness: 0.25,
  });

  private static pipeSilverMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db, // 銀色金屬穿線管
    roughness: 0.25,
    metalness: 0.85,
  });

  private static rollUpDoorMat = new THREE.MeshStandardMaterial({
    color: 0x64748b, // 鐵捲門橫紋金屬波浪門片
    roughness: 0.45,
    metalness: 0.4,
  });

  private static cardboardMat = new THREE.MeshStandardMaterial({
    color: 0xd97706, // 牛皮紙物流紙箱
    roughness: 0.85,
    metalness: 0.02,
  });

  private static woodPalletMat = new THREE.MeshStandardMaterial({
    color: 0xb45309, // 實木物流托盤
    roughness: 0.8,
    metalness: 0.05,
  });

  private static trafficConeMat = new THREE.MeshStandardMaterial({
    color: 0xf97316, // 亮橘色交通錐
    roughness: 0.4,
  });

  private static concreteSmokestackMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db, // 混凝土大型排煙煙囪
    roughness: 0.85,
    metalness: 0.08,
  });

  private static fenceIndustrialMat = new THREE.MeshStandardMaterial({
    color: 0x64748b, // 廠區金屬護欄與菱形網
    roughness: 0.5,
    metalness: 0.5,
  });

  private static truckWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc, // 貨車白色車身/貨箱
    roughness: 0.35,
    metalness: 0.15,
  });

  private static truckYellowMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // 堆高機與貨車亮黃色外殼
    roughness: 0.4,
    metalness: 0.15,
  });

  private static tireRubberMat = new THREE.MeshStandardMaterial({
    color: 0x18181b, // 黑色橡膠輪胎
    roughness: 0.9,
    metalness: 0.05,
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
  // 工業區專屬模組與道具生成函式 (Industrial Props & Modules)
  // ==========================================

  /**
   * 建立硬質混擬土廠區地坪
   */
  private static createBaseIndustrialYard(w: number, d: number): THREE.Group {
    const yard = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(w - 0.015, 0.025, d - 0.015);
    const slab = new THREE.Mesh(baseGeo, this.concreteIndYardMat);
    slab.position.y = 0.0125;
    slab.receiveShadow = true;
    yard.add(slab);

    const curbGeo = new THREE.BoxGeometry(w, 0.008, d);
    const curb = new THREE.Mesh(curbGeo, this.curbIndDarkMat);
    curb.position.y = 0.004;
    curb.receiveShadow = true;
    yard.add(curb);
    return yard;
  }

  /**
   * 建立 55 加侖金屬油桶 (帶雙道環箍與注油孔)
   */
  private static createOilDrum(colorMat: THREE.Material = this.barrelBlueMat, r = 0.035, h = 0.09): THREE.Group {
    const drum = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(r, r, h, 14);
    const body = new THREE.Mesh(bodyGeo, colorMat);
    body.position.y = h / 2 + 0.025;
    body.castShadow = true;
    drum.add(body);

    const ringGeo = new THREE.TorusGeometry(r + 0.002, 0.0025, 6, 14);
    const r1 = new THREE.Mesh(ringGeo, this.steelDarkMat);
    r1.rotation.x = Math.PI / 2;
    r1.position.y = h * 0.35 + 0.025;
    drum.add(r1);

    const r2 = new THREE.Mesh(ringGeo, this.steelDarkMat);
    r2.rotation.x = Math.PI / 2;
    r2.position.y = h * 0.65 + 0.025;
    drum.add(r2);
    return drum;
  }

  /**
   * 建立紙箱 (帶白色條碼標籤貼紙)
   */
  private static createCardboardBox(w = 0.08, h = 0.07, d = 0.08): THREE.Group {
    const boxGroup = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const box = new THREE.Mesh(boxGeo, this.cardboardMat);
    box.position.y = h / 2;
    box.castShadow = true;
    boxGroup.add(box);

    const labelGeo = new THREE.PlaneGeometry(w * 0.45, h * 0.35);
    const label = new THREE.Mesh(labelGeo, this.stripeWhiteMat);
    label.position.set(0, h * 0.5, d / 2 + 0.001);
    boxGroup.add(label);
    return boxGroup;
  }

  /**
   * 建立實木棧板 (標準托盤)
   */
  private static createWoodPallet(w = 0.16, d = 0.16, h = 0.022): THREE.Group {
    const pallet = new THREE.Group();
    const plankCount = 4;
    const plankW = (w - 0.01) / plankCount;
    for (let i = 0; i < plankCount; i++) {
      const pGeo = new THREE.BoxGeometry(plankW - 0.004, 0.005, d);
      const p = new THREE.Mesh(pGeo, this.woodPalletMat);
      p.position.set(-w / 2 + plankW * (i + 0.5), h - 0.0025, 0);
      p.castShadow = true;
      pallet.add(p);
    }
    for (let i = 0; i < 3; i++) {
      const bGeo = new THREE.BoxGeometry(w, h - 0.005, 0.016);
      const b = new THREE.Mesh(bGeo, this.woodPalletMat);
      b.position.set(0, (h - 0.005) / 2, -d / 2 + (d / 2) * i);
      b.castShadow = true;
      pallet.add(b);
    }
    return pallet;
  }

  /**
   * 建立反光交通安全錐
   */
  private static createTrafficCone(r = 0.022, h = 0.065): THREE.Group {
    const cone = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(r * 2.3, 0.006, r * 2.3);
    const base = new THREE.Mesh(baseGeo, this.trafficConeMat);
    base.position.y = 0.003 + 0.025;
    cone.add(base);

    const bodyGeo = new THREE.ConeGeometry(r, h, 10);
    const body = new THREE.Mesh(bodyGeo, this.trafficConeMat);
    body.position.y = h / 2 + 0.006 + 0.025;
    body.castShadow = true;
    cone.add(body);

    const bandGeo = new THREE.CylinderGeometry(r * 0.55, r * 0.7, h * 0.22, 10);
    const band = new THREE.Mesh(bandGeo, this.stripeWhiteMat);
    band.position.y = h * 0.45 + 0.006 + 0.025;
    cone.add(band);
    return cone;
  }

  /**
   * 建立金屬工業護欄
   */
  private static createIndustrialFence(length: number, height = 0.16): THREE.Group {
    const fence = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.016, height, 0.016);
    const railGeo = new THREE.BoxGeometry(length, 0.008, 0.008);

    const postCount = Math.max(2, Math.round(length / 0.35) + 1);
    for (let i = 0; i < postCount; i++) {
      const post = new THREE.Mesh(postGeo, this.fenceIndustrialMat);
      post.position.set(-length / 2 + (length / (postCount - 1)) * i, height / 2 + 0.025, 0);
      post.castShadow = true;
      fence.add(post);
    }
    const topRail = new THREE.Mesh(railGeo, this.fenceIndustrialMat);
    topRail.position.set(0, height - 0.01 + 0.025, 0);
    fence.add(topRail);

    const midRail = new THREE.Mesh(railGeo, this.fenceIndustrialMat);
    midRail.position.set(0, height * 0.5 + 0.025, 0);
    fence.add(midRail);
    return fence;
  }

  /**
   * 建立工業變電器單元 (Transformer Unit)
   */
  private static createTransformerUnit(w = 0.16, h = 0.15, d = 0.14): THREE.Group {
    const unit = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const body = new THREE.Mesh(bodyGeo, this.roofIndHvacGreyMat);
    body.position.y = h / 2 + 0.025;
    body.castShadow = true;
    unit.add(body);

    for (let dir of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const finGeo = new THREE.BoxGeometry(0.004, h * 0.75, d * 0.15);
        const fin = new THREE.Mesh(finGeo, this.curbIndDarkMat);
        fin.position.set((w / 2 + 0.003) * dir, h * 0.5 + 0.025, -d * 0.3 + i * (d * 0.2));
        unit.add(fin);
      }
    }
    for (let i = -1; i <= 1; i++) {
      const insGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.035, 6);
      const ins = new THREE.Mesh(insGeo, this.pipeYellowMat);
      ins.position.set(i * (w * 0.25), h + 0.018 + 0.025, 0);
      unit.add(ins);
    }
    return unit;
  }

  /**
   * 建立精緻小貨車 (Mini Delivery Cargo Truck)
   */
  private static createMiniTruck(cabColor = 0xef4444, boxColor = 0xf8fafc): THREE.Group {
    const truck = new THREE.Group();
    const cabMat = new THREE.MeshStandardMaterial({ color: cabColor, roughness: 0.35 });
    const boxMat = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.4 });

    const chassisGeo = new THREE.BoxGeometry(0.18, 0.03, 0.40);
    const chassis = new THREE.Mesh(chassisGeo, this.steelDarkMat);
    chassis.position.y = 0.045 + 0.025;
    truck.add(chassis);

    const tireGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.024, 10);
    const wheelPositions = [
      [-0.09, 0.03 + 0.025, 0.12],
      [0.09, 0.03 + 0.025, 0.12],
      [-0.09, 0.03 + 0.025, -0.12],
      [0.09, 0.03 + 0.025, -0.12],
    ];
    wheelPositions.forEach(([x, y, z]) => {
      const tire = new THREE.Mesh(tireGeo, this.tireRubberMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, y, z);
      truck.add(tire);
    });

    const cabGeo = new THREE.BoxGeometry(0.18, 0.11, 0.12);
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 0.115 + 0.025, 0.12);
    cab.castShadow = true;
    truck.add(cab);

    const glassGeo = new THREE.BoxGeometry(0.16, 0.055, 0.005);
    const glass = new THREE.Mesh(glassGeo, this.glassMat);
    glass.position.set(0, 0.135 + 0.025, 0.182);
    truck.add(glass);

    const cargoGeo = new THREE.BoxGeometry(0.19, 0.15, 0.26);
    const cargo = new THREE.Mesh(cargoGeo, boxMat);
    cargo.position.set(0, 0.135 + 0.025, -0.07);
    cargo.castShadow = true;
    truck.add(cargo);
    return truck;
  }

  /**
   * 建立物流堆高機 (Industrial Forklift)
   */
  private static createForklift(colorMat: THREE.Material = this.truckYellowMat): THREE.Group {
    const fl = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.13, 0.07, 0.16);
    const body = new THREE.Mesh(bodyGeo, colorMat);
    body.position.set(0, 0.055 + 0.025, -0.02);
    body.castShadow = true;
    fl.add(body);

    const cageGeo = new THREE.BoxGeometry(0.11, 0.10, 0.10);
    const cage = new THREE.Mesh(cageGeo, this.steelDarkMat);
    cage.position.set(0, 0.13 + 0.025, -0.02);
    cage.castShadow = true;
    fl.add(cage);

    const wheelGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.02, 8);
    [[-0.07, 0.024 + 0.025, 0.04], [0.07, 0.024 + 0.025, 0.04], [-0.07, 0.024 + 0.025, -0.06], [0.07, 0.024 + 0.025, -0.06]].forEach(([x, y, z]) => {
      const w = new THREE.Mesh(wheelGeo, this.tireRubberMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      fl.add(w);
    });

    const mastGeo = new THREE.BoxGeometry(0.10, 0.18, 0.015);
    const mast = new THREE.Mesh(mastGeo, this.steelDarkMat);
    mast.position.set(0, 0.10 + 0.025, 0.07);
    fl.add(mast);

    for (let dir of [-0.03, 0.03]) {
      const forkGeo = new THREE.BoxGeometry(0.015, 0.005, 0.09);
      const fork = new THREE.Mesh(forkGeo, this.steelDarkMat);
      fork.position.set(dir, 0.015 + 0.025, 0.115);
      fl.add(fork);
    }
    return fl;
  }

  /**
   * 建立工業廠區路燈 (Industrial Yard Streetlight)
   */
  private static createIndustrialStreetlight(h = 0.38): THREE.Group {
    const light = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.007, 0.009, h, 6);
    const pole = new THREE.Mesh(poleGeo, this.curbIndDarkMat);
    pole.position.y = h / 2 + 0.025;
    pole.castShadow = true;
    light.add(pole);

    const armGeo = new THREE.BoxGeometry(0.006, 0.006, 0.06);
    const arm = new THREE.Mesh(armGeo, this.curbIndDarkMat);
    arm.position.set(0, h + 0.02, 0.025);
    light.add(arm);

    const headGeo = new THREE.BoxGeometry(0.022, 0.008, 0.03);
    const head = new THREE.Mesh(headGeo, this.roofIndHvacGreyMat);
    head.position.set(0, h + 0.016, 0.05);
    light.add(head);

    const bulbGeo = new THREE.PlaneGeometry(0.018, 0.024);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(0, h + 0.011, 0.05);
    light.add(bulb);
    return light;
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
  // 4. 4 款低密度工業區建築實例 (4x4, 5x5, 5x6, 6x6)
  // ==========================================

  /**
   * 1. 4x4 小型工廠 (容納 3 人 / Small Factory)
   * 佔地: 面寬 2.0m (4格) × 縱深 2.0m (4格)
   * 參考附圖 1：開放式汽車維修與金屬加工工坊
   * 核心特徵：
   * - 橘色工廠主棟 (單坡斜鐵皮屋頂、黃框採光天窗、紅白條紋排煙煙囪、側樓木階梯)
   * - 室外維修前庭 (地面油漬、雙柱藍色液壓汽車舉升機、拆卸輪胎、紅色千斤頂)
   * - 金屬加工區 (機械綠車床工作台、深鋼色多層貨架擺放機油桶與五金零件箱、藍色55加侖油桶)
   * - 廠區周邊灰色防護圍欄與前向敞開車道
   * - 正面朝向：敞開維修庭院與舉升機入口面朝 +Z 軸 (道路方向)
   */
  public static createIndustrial_4x4(): THREE.Group {
    const factory = new THREE.Group();
    factory.name = 'Industrial_4x4';

    // 1. 混擬土廠區地坪 (2.0m x 2.0m)
    factory.add(this.createBaseIndustrialYard(2.0, 2.0));

    // 地坪油漬污斑 (增加真實工坊氛圍)
    const stains = [
      { x: 0.25, z: 0.35, r: 0.12 },
      { x: -0.15, z: 0.25, r: 0.08 },
      { x: -0.35, z: -0.15, r: 0.09 },
    ];
    stains.forEach((s) => {
      const geo = new THREE.CircleGeometry(s.r, 8);
      const mesh = new THREE.Mesh(geo, this.concreteIndOilStainMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(s.x, 0.026, s.z);
      factory.add(mesh);
    });

    // 2. 橘色工坊主體建築 (位於後側偏右：X=0.28, Z=-0.50, W=1.15, D=0.82, H=0.62)
    const bldW = 1.15;
    const bldD = 0.82;
    const bldH = 0.62;
    const bldX = 0.28;
    const bldZ = -0.50;

    const bldGeo = new THREE.BoxGeometry(bldW, bldH, bldD);
    const bld = new THREE.Mesh(bldGeo, this.wallIndOrangeMat);
    bld.position.set(bldX, bldH / 2 + 0.025, bldZ);
    bld.castShadow = true;
    bld.receiveShadow = true;
    factory.add(bld);

    // 建築基座深色水線台度
    const plinthGeo = new THREE.BoxGeometry(bldW + 0.02, 0.035, bldD + 0.02);
    const plinth = new THREE.Mesh(plinthGeo, this.curbIndDarkMat);
    plinth.position.set(bldX, 0.0175 + 0.025, bldZ);
    factory.add(plinth);

    // 單坡斜浪板屋頂 (從後往前往下微傾，帶突出金屬屋簷)
    const roofW = bldW + 0.10;
    const roofD = bldD + 0.12;
    const roofH = 0.04;
    const roofGeo = new THREE.BoxGeometry(roofW, roofH, roofD);
    const roof = new THREE.Mesh(roofGeo, this.roofIndSlateDarkMat);
    roof.position.set(bldX, bldH + 0.025 + 0.04, bldZ);
    roof.rotation.x = -0.06;
    roof.castShadow = true;
    factory.add(roof);

    // 屋頂突出的金屬波浪脊線
    for (let i = -4; i <= 4; i++) {
      const ribGeo = new THREE.BoxGeometry(0.014, 0.016, roofD - 0.02);
      const rib = new THREE.Mesh(ribGeo, this.steelDarkMat);
      rib.position.set(bldX + i * (roofW / 10), bldH + 0.025 + 0.065, bldZ);
      rib.rotation.x = -0.06;
      factory.add(rib);
    }

    // 磚造/彩條排煙煙囪 (後右側角頂部：紅白黃警示環節)
    const chimH = 0.45;
    const chimW = 0.11;
    const chimGeo = new THREE.BoxGeometry(chimW, chimH, chimW);
    const chim = new THREE.Mesh(chimGeo, this.wallWoodCedarMat);
    chim.position.set(bldX + bldW / 2 - 0.08, bldH + chimH / 2 + 0.025, bldZ - bldD / 2 + 0.08);
    chim.castShadow = true;
    factory.add(chim);

    for (let c = 0; c < 3; c++) {
      const stripeGeo = new THREE.BoxGeometry(chimW + 0.004, 0.04, chimW + 0.004);
      const stripeMat = c % 2 === 0 ? this.stripeHazardYellowMat : this.wallWoodDarkMat;
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(bldX + bldW / 2 - 0.08, bldH + 0.12 + c * 0.09 + 0.025, bldZ - bldD / 2 + 0.08);
      factory.add(stripe);
    }

    // 3. 工坊正面門窗與外牆設備 (Z = bldZ + bldD/2 = -0.09)
    const frontWallZ = bldZ + bldD / 2 + 0.002;

    const win1 = this.createWindow(0.32, 0.16, { style: 'dark', panesX: 2, panesY: 1, sill: true });
    win1.position.set(bldX - 0.22, 0.42 + 0.025, frontWallZ);
    factory.add(win1);

    const win2 = this.createWindow(0.32, 0.16, { style: 'dark', panesX: 2, panesY: 1, sill: true });
    win2.position.set(bldX + 0.22, 0.42 + 0.025, frontWallZ);
    factory.add(win2);

    const shopDoor = this.createFrontDoor(0.12, 0.22, { doorMat: this.doorDarkMat, frameMat: this.frameDarkMat });
    shopDoor.position.set(bldX + 0.22, 0.025, frontWallZ);
    factory.add(shopDoor);

    const sideDoor = this.createFrontDoor(0.11, 0.20, { doorMat: this.doorWoodMat, frameMat: this.frameWhiteMat });
    sideDoor.rotation.y = Math.PI / 2;
    sideDoor.position.set(bldX + bldW / 2 + 0.002, 0.10 + 0.025, bldZ + 0.15);
    factory.add(sideDoor);

    for (let st = 0; st < 3; st++) {
      const stepGeo = new THREE.BoxGeometry(0.12, 0.035, 0.14 - st * 0.03);
      const step = new THREE.Mesh(stepGeo, this.wallWoodCedarMat);
      step.position.set(bldX + bldW / 2 + 0.06 + st * 0.04, 0.035 * (3 - st) + 0.005, bldZ + 0.15);
      factory.add(step);
    }

    const extGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 8);
    const ext = new THREE.Mesh(extGeo, this.barrelRedMat);
    ext.position.set(bldX + 0.38, 0.24 + 0.025, frontWallZ + 0.015);
    factory.add(ext);

    const tableGeo = new THREE.BoxGeometry(0.34, 0.12, 0.16);
    const table = new THREE.Mesh(tableGeo, this.wallIndOrangeMat);
    table.position.set(bldX - 0.22, 0.06 + 0.025, frontWallZ + 0.10);
    table.castShadow = true;
    factory.add(table);

    const toolboxGeo = new THREE.BoxGeometry(0.10, 0.05, 0.06);
    const toolbox = new THREE.Mesh(toolboxGeo, this.toolBoxRedMat);
    toolbox.position.set(bldX - 0.20, 0.145 + 0.025, frontWallZ + 0.10);
    factory.add(toolbox);

    // 4. 左側戶外金屬加工機具區
    const latheGroup = new THREE.Group();
    latheGroup.position.set(-0.62, 0.025, -0.45);

    const latheBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.18), this.machineGreenMat);
    latheBase.position.y = 0.11;
    latheBase.castShadow = true;
    latheGroup.add(latheBase);

    const latheTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.14), this.machineGreenMat);
    latheTop.position.set(0, 0.27, -0.02);
    latheGroup.add(latheTop);

    const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), this.pipeSilverMat);
    chuck.rotation.z = Math.PI / 2;
    chuck.position.set(-0.12, 0.28, 0.03);
    latheGroup.add(chuck);

    factory.add(latheGroup);

    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-0.16, 0.025, -0.55);
    const shelfH = 0.44;
    const shelfW = 0.32;
    const shelfD = 0.14;

    for (let sx of [-shelfW / 2, shelfW / 2]) {
      for (let sz of [-shelfD / 2, shelfD / 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.012, shelfH, 0.012), this.steelDarkMat);
        post.position.set(sx, shelfH / 2, sz);
        shelfGroup.add(post);
      }
    }
    for (let l = 1; l <= 3; l++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(shelfW, 0.01, shelfD), this.steelDarkMat);
      plank.position.y = (shelfH / 3) * l;
      shelfGroup.add(plank);

      if (l === 2) {
        const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), this.stripeHazardYellowMat);
        box1.position.set(-0.06, (shelfH / 3) * l + 0.03, 0);
        shelfGroup.add(box1);

        const box2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), this.steelBlueMat);
        box2.position.set(0.06, (shelfH / 3) * l + 0.025, 0);
        shelfGroup.add(box2);
      } else if (l === 1) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 10), this.tireRubberMat);
        t.rotation.z = Math.PI / 2;
        t.position.set(0, (shelfH / 3) * l + 0.035, 0);
        shelfGroup.add(t);
      }
    }
    factory.add(shelfGroup);

    const drum1 = this.createOilDrum(this.barrelBlueMat);
    drum1.position.set(-0.35, 0, -0.42);
    factory.add(drum1);

    // 5. 前方雙柱汽車舉升機 (Hydraulic Two-Post Car Lift)
    const liftGroup = new THREE.Group();
    liftGroup.position.set(0.30, 0.025, 0.42);

    const postH = 0.48;
    const postDist = 0.52;
    for (let px of [-postDist / 2, postDist / 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, postH, 0.035), this.steelBlueMat);
      p.position.set(px, postH / 2, 0);
      p.castShadow = true;
      liftGroup.add(p);

      const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.07), this.steelDarkMat);
      pBase.position.set(px, 0.006, 0);
      liftGroup.add(pBase);
    }

    for (let px of [-0.14, 0.14]) {
      const railGeo = new THREE.BoxGeometry(0.08, 0.02, 0.52);
      const rail = new THREE.Mesh(railGeo, this.steelDarkMat);
      rail.position.set(px, 0.07, 0);
      liftGroup.add(rail);

      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.015, 0.10), this.steelBlueMat);
      pad.position.set(px, 0.085, 0);
      liftGroup.add(pad);

      const rampGeo = new THREE.BoxGeometry(0.08, 0.015, 0.12);
      const ramp = new THREE.Mesh(rampGeo, this.steelDarkMat);
      ramp.position.set(px, 0.035, 0.30);
      ramp.rotation.x = 0.35;
      liftGroup.add(ramp);
    }

    const liftTire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.028, 12), this.tireRubberMat);
    liftTire.position.set(-0.14, 0.095, -0.05);
    liftGroup.add(liftTire);

    factory.add(liftGroup);

    const jackGroup = new THREE.Group();
    jackGroup.position.set(-0.15, 0.025, 0.52);
    const jackBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.12), this.toolBoxRedMat);
    jackBody.position.y = 0.015;
    jackGroup.add(jackBody);
    const jackHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.10, 6), this.steelDarkMat);
    jackHandle.rotation.x = -0.55;
    jackHandle.position.set(0, 0.06, -0.04);
    jackGroup.add(jackHandle);
    factory.add(jackGroup);

    const drumRed = this.createOilDrum(this.barrelRedMat);
    drumRed.position.set(0.78, 0, 0.28);
    factory.add(drumRed);

    const drumYellow = this.createOilDrum(this.barrelYellowMat);
    drumYellow.position.set(0.78, 0, 0.44);
    factory.add(drumYellow);

    // 6. 圍籬保護 (後方與左側邊界)
    const rearFence = this.createIndustrialFence(1.85, 0.18);
    rearFence.position.set(0, 0, -0.96);
    factory.add(rearFence);

    const leftFence = this.createIndustrialFence(1.85, 0.18);
    leftFence.rotation.y = Math.PI / 2;
    leftFence.position.set(-0.96, 0, 0);
    factory.add(leftFence);

    const rightFence = this.createIndustrialFence(0.70, 0.18);
    rightFence.rotation.y = Math.PI / 2;
    rightFence.position.set(0.96, 0, 0.55);
    factory.add(rightFence);

    return factory;
  }

  /**
   * 2. 5x5 維修廠 (容納 4 人 / Repair Shop)
   * 佔地: 面寬 2.5m (5格) × 縱深 2.5m (5格)
   * 參考附圖 2：現代工業黃色重型維修保養中心
   * 核心特徵：
   * - 暖調工業黃色主建築棟、暗紅基座線腳與黑色天台防墜金屬圍欄
   * - 大型金屬鐵捲門 (Roll-up door) 與旁邊高架輸送帶斜坡開口 (Elevated conveyor ramp bay)
   * - 屋頂標誌性斜切玻璃採光溫室天窗 (Angled glass skylight) 與屋頂空調機組
   * - 藍色巨型排氣抽風管由屋頂彎入側邊機電單元、外牆配電盤與指示燈
   * - 右側多層方形控制瞭望塔樓 (Control tower)
   * - 正面前庭堆放深灰色工業貨箱棧群與橘色交通安全警示錐
   * - 正面朝向：鐵捲門、輸送坡道與貨箱前庭朝向 +Z 軸 (道路方向)
   */
  public static createIndustrial_5x5(): THREE.Group {
    const shop = new THREE.Group();
    shop.name = 'Industrial_5x5';

    // 1. 混擬土廠區地坪 (2.5m x 2.5m)
    shop.add(this.createBaseIndustrialYard(2.5, 2.5));

    // 2. 主維修車間廠房 (W=1.30, D=1.30, H=0.68)
    const hallW = 1.30;
    const hallD = 1.30;
    const hallH = 0.68;
    const hallX = 0.0;
    const hallZ = -0.40;

    const hallGeo = new THREE.BoxGeometry(hallW, hallH, hallD);
    const hall = new THREE.Mesh(hallGeo, this.wallIndYellowMat);
    hall.position.set(hallX, hallH / 2 + 0.025, hallZ);
    hall.castShadow = true;
    hall.receiveShadow = true;
    shop.add(hall);

    // 暗紅色基座防撞水線
    const plinthGeo = new THREE.BoxGeometry(hallW + 0.02, 0.045, hallD + 0.02);
    const plinth = new THREE.Mesh(plinthGeo, this.wallIndPlinthDarkRedMat);
    plinth.position.set(hallX, 0.0225 + 0.025, hallZ);
    shop.add(plinth);

    // 屋頂黑色金屬護欄
    const railX1 = this.createIndustrialFence(hallW - 0.04, 0.08);
    railX1.position.set(hallX, hallH, hallZ + hallD / 2 - 0.02);
    shop.add(railX1);

    const railX2 = this.createIndustrialFence(hallW - 0.04, 0.08);
    railX2.position.set(hallX, hallH, hallZ - hallD / 2 + 0.02);
    shop.add(railX2);

    const railZ1 = this.createIndustrialFence(hallD - 0.04, 0.08);
    railZ1.rotation.y = Math.PI / 2;
    railZ1.position.set(hallX - hallW / 2 + 0.02, hallH, hallZ);
    shop.add(railZ1);

    // 3. 標誌性斜切採光天窗 (Angled Glass Skylight Greenhouse Roof)
    const skyGroup = new THREE.Group();
    skyGroup.position.set(-0.15, hallH + 0.025, hallZ);

    const skyW = 0.52;
    const skyD = 0.85;
    const skyH = 0.42;

    const skyShape = new THREE.Shape();
    skyShape.moveTo(-skyD / 2, 0);
    skyShape.lineTo(skyD / 2, 0);
    skyShape.lineTo(-skyD / 2, skyH);
    skyShape.closePath();

    const extrudeSettings = { depth: skyW, bevelEnabled: false };
    const skyGeo = new THREE.ExtrudeGeometry(skyShape, extrudeSettings);
    skyGeo.center();
    const skyMesh = new THREE.Mesh(skyGeo, this.roofIndSkylightGlassMat);
    skyMesh.rotation.y = -Math.PI / 2;
    skyMesh.position.y = skyH / 2;
    skyMesh.castShadow = true;
    skyGroup.add(skyMesh);

    for (let g = 0; g <= 5; g++) {
      const ribGeo = new THREE.BoxGeometry(skyW + 0.01, 0.01, 0.01);
      const rib = new THREE.Mesh(ribGeo, this.steelDarkMat);
      const tz = -skyD / 2 + (skyD / 5) * g;
      const ty = (1 - g / 5) * skyH;
      rib.position.set(0, ty, tz);
      skyGroup.add(rib);
    }
    shop.add(skyGroup);

    // 4. 正立面設施 (Z = hallZ + hallD/2 = 0.25)
    const frontZ = hallZ + hallD / 2 + 0.002;

    // (A) 大型金屬捲門
    const doorGroup = new THREE.Group();
    doorGroup.position.set(0.35, 0.025, frontZ);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.50, 0.015), this.rollUpDoorMat);
    doorMesh.position.y = 0.25;
    doorGroup.add(doorMesh);

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.52, 0.02), this.steelDarkMat);
    doorFrame.position.y = 0.26;
    doorGroup.add(doorFrame);
    shop.add(doorGroup);

    // (B) 左側輸送斜坡穿牆通道
    const bayGroup = new THREE.Group();
    bayGroup.position.set(-0.34, 0.025, frontZ);

    const holeGeo = new THREE.BoxGeometry(0.46, 0.40, 0.02);
    const hole = new THREE.Mesh(holeGeo, this.steelDarkMat);
    hole.position.y = 0.20;
    bayGroup.add(hole);

    const rampW = 0.44;
    const rampL = 0.60;
    const rampH = 0.12;
    const rampGeo = new THREE.BoxGeometry(rampW, rampH, rampL);
    const ramp = new THREE.Mesh(rampGeo, this.curbIndDarkMat);
    ramp.position.set(0, rampH / 2, rampL / 2);
    bayGroup.add(ramp);

    const beltGeo = new THREE.BoxGeometry(rampW * 0.75, 0.01, rampL);
    const belt = new THREE.Mesh(beltGeo, this.steelDarkMat);
    belt.position.set(0, rampH + 0.005, rampL / 2);
    bayGroup.add(belt);

    for (let lx of [-rampW / 2 - 0.04, rampW / 2 + 0.04]) {
      const lampGeo = new THREE.BoxGeometry(0.025, 0.045, 0.02);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(lx, 0.22, 0.01);
      bayGroup.add(lamp);
    }
    shop.add(bayGroup);

    // (C) 中間立面電氣控制箱與信號燈
    const panelBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.03), this.roofIndHvacGreyMat);
    panelBox.position.set(0.02, 0.38 + 0.025, frontZ + 0.015);
    shop.add(panelBox);

    const greenLed = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    greenLed.position.set(0.04, 0.35 + 0.025, frontZ + 0.032);
    shop.add(greenLed);

    const redLed = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    redLed.position.set(0.04, 0.41 + 0.025, frontZ + 0.032);
    shop.add(redLed);

    const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.01, 0.01), this.pipeSilverMat);
    conduit.position.set(-0.10, 0.44 + 0.025, frontZ + 0.015);
    shop.add(conduit);

    // 5. 左側機電通風機房與藍色巨型彎管 (HVAC Extraction Duct)
    const mechW = 0.35;
    const mechD = 0.65;
    const mechH = 0.55;
    const mechGeo = new THREE.BoxGeometry(mechW, mechH, mechD);
    const mechBox = new THREE.Mesh(mechGeo, this.roofIndHvacGreyMat);
    mechBox.position.set(-hallW / 2 - mechW / 2 + 0.02, mechH / 2 + 0.025, hallZ - 0.15);
    mechBox.castShadow = true;
    shop.add(mechBox);

    const ductR = 0.04;
    const ductGroup = new THREE.Group();
    ductGroup.position.set(-hallW / 2 - 0.04, hallH + 0.025, hallZ - 0.15);

    const vDuct = new THREE.Mesh(new THREE.CylinderGeometry(ductR, ductR, 0.22, 12), this.pipeBlueMat);
    vDuct.position.set(0, 0.11, 0);
    ductGroup.add(vDuct);

    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.08, ductR, 8, 12, Math.PI / 2), this.pipeBlueMat);
    elbow.rotation.y = Math.PI / 2;
    elbow.position.set(-0.08, 0.22, 0);
    ductGroup.add(elbow);

    const hDuct = new THREE.Mesh(new THREE.CylinderGeometry(ductR, ductR, 0.14, 12), this.pipeBlueMat);
    hDuct.rotation.z = Math.PI / 2;
    hDuct.position.set(-0.08, 0.30, 0);
    ductGroup.add(hDuct);
    shop.add(ductGroup);

    // 6. 右側方形瞭望控制塔樓 (Observation / Control Tower)
    const towerW = 0.48;
    const towerD = 0.48;
    const towerH = 1.10;
    const towerX = hallX + hallW / 2 + towerW / 2 - 0.04;
    const towerZ = hallZ - 0.15;

    const towerGeo = new THREE.BoxGeometry(towerW, towerH, towerD);
    const tower = new THREE.Mesh(towerGeo, this.wallIndYellowMat);
    tower.position.set(towerX, towerH / 2 + 0.025, towerZ);
    tower.castShadow = true;
    shop.add(tower);

    const towerPlinth = new THREE.Mesh(new THREE.BoxGeometry(towerW + 0.02, 0.045, towerD + 0.02), this.wallIndPlinthDarkRedMat);
    towerPlinth.position.set(towerX, 0.0225 + 0.025, towerZ);
    shop.add(towerPlinth);

    const towerRoof = this.createFlatParapetRoof(towerW + 0.04, towerD + 0.04, this.wallIndYellowMat, this.steelDarkMat);
    towerRoof.position.set(towerX, towerH + 0.025, towerZ);
    shop.add(towerRoof);

    const towerWin = this.createWindow(0.18, 0.22, { style: 'dark', panesX: 1, panesY: 2 });
    towerWin.position.set(towerX, towerH * 0.72 + 0.025, towerZ + towerD / 2 + 0.002);
    shop.add(towerWin);

    const towerDoor = this.createFrontDoor(0.11, 0.20, { doorMat: this.doorDarkMat, frameMat: this.frameDarkMat });
    towerDoor.position.set(towerX, 0.025, towerZ + towerD / 2 + 0.002);
    shop.add(towerDoor);

    // 7. 前庭工業深灰貨箱棧與交通錐
    const crateGroup = new THREE.Group();
    crateGroup.position.set(0.0, 0.025, 0.65);

    const crateSizes = [
      { x: -0.12, y: 0.06, z: 0.0, w: 0.16, h: 0.12, d: 0.16 },
      { x: 0.06, y: 0.06, z: 0.0, w: 0.16, h: 0.12, d: 0.16 },
      { x: -0.12, y: 0.17, z: 0.0, w: 0.15, h: 0.10, d: 0.15 },
      { x: 0.22, y: 0.05, z: 0.08, w: 0.14, h: 0.10, d: 0.14 },
      { x: -0.28, y: 0.05, z: 0.12, w: 0.14, h: 0.10, d: 0.14 },
      { x: -0.05, y: 0.05, z: 0.22, w: 0.15, h: 0.10, d: 0.15 },
      { x: 0.12, y: 0.05, z: 0.24, w: 0.14, h: 0.10, d: 0.14 },
    ];
    crateSizes.forEach((c) => {
      const crGeo = new THREE.BoxGeometry(c.w, c.h, c.d);
      const cr = new THREE.Mesh(crGeo, this.steelDarkMat);
      cr.position.set(c.x, c.y, c.z);
      cr.castShadow = true;
      crateGroup.add(cr);
    });

    const cone1 = this.createTrafficCone();
    cone1.position.set(-0.35, 0, 0.25);
    crateGroup.add(cone1);

    const cone2 = this.createTrafficCone();
    cone2.position.set(0.30, 0, 0.28);
    crateGroup.add(cone2);

    shop.add(crateGroup);

    return shop;
  }

  /**
   * 3. 5x6 物流倉庫 (容納 4 人 / Logistics Warehouse)
   * 佔地: 面寬 2.5m (5格，貼合馬路邊) × 縱深 3.0m (6格)
   * 參考附圖 3：三泊位現代物流配送倉儲轉運中心
   * 核心特徵：
   * - 現代紅磚/陶土外牆、左立面鮮黃門廊飾牆與頂部 "WAREHOUSE" 亮黃立體招牌
   * - 3 座貨櫃裝卸泊位 (Dock 1, 2, 3)：
   *   * 1 號碼頭泊位：全包覆氣密防撞罩，停靠對接白色大型長途貨櫃聯結車
   *   * 2 號碼頭泊位：黃色防撞升降板與斜向斑馬警示線
   *   * 3 號碼頭泊位：開放式裝卸踏台與側向貨運捲門
   * - 轉運貨場停靠黃色中型配送廂型貨車、黃色工業堆高機正在裝卸木棧板紙箱
   * - 入口處設有白色守衛室警衛亭 (Security Booth) 與紅白相間升降道閘桿
   * - 屋頂配備整齊排列之工業空調通風風機陣列
   * - 正面朝向：面寬 2.5m (5格) 貼合馬路，大門與貨運泊位前庭朝向 +Z 軸
   */
  public static createIndustrial_5x6(): THREE.Group {
    const warehouse = new THREE.Group();
    warehouse.name = 'Industrial_5x6';

    // 1. 瀝青與混擬土大型物流地坪 (面寬 2.5m x 縱深 3.0m)
    warehouse.add(this.createBaseIndustrialYard(2.5, 3.0));

    // 2. 主倉儲建築 (W=2.20, D=1.30, H=0.92)
    const whW = 2.20;
    const whD = 1.30;
    const whH = 0.92;
    const whX = 0.05;
    const whZ = -0.80;

    const whGeo = new THREE.BoxGeometry(whW, whH, whD);
    const whMesh = new THREE.Mesh(whGeo, this.wallIndWarehouseRedMat);
    whMesh.position.set(whX, whH / 2 + 0.025, whZ);
    whMesh.castShadow = true;
    whMesh.receiveShadow = true;
    warehouse.add(whMesh);

    const plinthGeo = new THREE.BoxGeometry(whW + 0.02, 0.045, whD + 0.02);
    const plinth = new THREE.Mesh(plinthGeo, this.curbIndDarkMat);
    plinth.position.set(whX, 0.0225 + 0.025, whZ);
    warehouse.add(plinth);

    // 左立面鮮黃色標誌性門廊飾牆 (Yellow Accent Pylon)
    const pylonW = 0.24;
    const pylonH = 1.12;
    const pylonD = whD + 0.06;
    const pylonX = whX - whW / 2 + pylonW / 2;
    const pylonGeo = new THREE.BoxGeometry(pylonW, pylonH, pylonD);
    const pylon = new THREE.Mesh(pylonGeo, this.wallIndPylonYellowMat);
    pylon.position.set(pylonX, pylonH / 2 + 0.025, whZ);
    pylon.castShadow = true;
    warehouse.add(pylon);

    const parapet = this.createFlatParapetRoof(whW, whD, this.wallIndWarehouseRedMat, this.steelDarkMat);
    parapet.position.set(whX, whH + 0.025, whZ);
    warehouse.add(parapet);

    // 屋頂整齊排列之空調排風機冷卻塔 (AHU Matrix)
    for (let rx = -2; rx <= 2; rx++) {
      for (let rz = -1; rz <= 1; rz++) {
        const ahuGeo = new THREE.BoxGeometry(0.12, 0.06, 0.10);
        const ahu = new THREE.Mesh(ahuGeo, this.roofIndHvacGreyMat);
        ahu.position.set(whX + 0.15 + rx * 0.28, whH + 0.055 + 0.025, whZ + rz * 0.32);
        ahu.castShadow = true;
        warehouse.add(ahu);
      }
    }

    // 3. 正面屋頂 "WAREHOUSE" 亮黃色立體大招牌 (Signboard)
    const signGroup = new THREE.Group();
    signGroup.position.set(whX + 0.20, whH + 0.10 + 0.025, whZ + whD / 2 + 0.02);

    const signBoardGeo = new THREE.BoxGeometry(0.85, 0.18, 0.03);
    const signBoard = new THREE.Mesh(signBoardGeo, this.wallIndPylonYellowMat);
    signGroup.add(signBoard);

    const signTextGeo = new THREE.BoxGeometry(0.75, 0.10, 0.015);
    const signText = new THREE.Mesh(signTextGeo, this.steelDarkMat);
    signText.position.z = 0.02;
    signGroup.add(signText);

    for (let lx of [-0.35, 0, 0.35]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.03), this.curbIndDarkMat);
      lamp.position.set(lx, 0.12, 0.03);
      signGroup.add(lamp);
    }
    warehouse.add(signGroup);

    // 4. 三座裝卸碼頭泊位 (Dock Bays 1, 2, 3 Facing +Z)
    const dockZ = whZ + whD / 2 + 0.002;

    // (A) 1 號碼頭泊位：對接白色大型長途貨櫃車
    const dock1Group = new THREE.Group();
    dock1Group.position.set(-0.35, 0.025, dockZ);

    const shelterMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.08), this.steelDarkMat);
    shelterMesh.position.set(0, 0.22, 0.04);
    dock1Group.add(shelterMesh);

    const d1Door = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.01), this.rollUpDoorMat);
    d1Door.position.set(0, 0.20, 0.01);
    dock1Group.add(d1Door);

    const num1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.01), this.wallIndPylonYellowMat);
    num1.position.set(0, 0.46, 0.08);
    dock1Group.add(num1);

    const semiTruck = this.createMiniTruck(0xef4444, 0xf8fafc);
    semiTruck.scale.set(1.15, 1.15, 1.35);
    semiTruck.position.set(0, 0, 0.55);
    dock1Group.add(semiTruck);

    warehouse.add(dock1Group);

    // (B) 2 號碼頭泊位：配備黃色升降板與安全斑馬線
    const dock2Group = new THREE.Group();
    dock2Group.position.set(0.25, 0.025, dockZ);

    const d2Door = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.40, 0.015), this.rollUpDoorMat);
    d2Door.position.set(0, 0.20, 0.01);
    dock2Group.add(d2Door);

    const d2Frame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.04), this.steelDarkMat);
    d2Frame.position.set(0, 0.22, 0.02);
    dock2Group.add(d2Frame);

    const leveller = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.16), this.stripeHazardYellowMat);
    leveller.position.set(0, 0.015, 0.08);
    dock2Group.add(leveller);

    const num2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.01), this.wallIndPylonYellowMat);
    num2.position.set(0, 0.46, 0.04);
    dock2Group.add(num2);

    warehouse.add(dock2Group);

    // (C) 3 號碼頭泊位：半開捲門與水泥階梯
    const dock3Group = new THREE.Group();
    dock3Group.position.set(0.80, 0.025, dockZ);

    const d3Door = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.25, 0.015), this.rollUpDoorMat);
    d3Door.position.set(0, 0.27, 0.01);
    dock3Group.add(d3Door);

    const d3Frame = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.04), this.steelDarkMat);
    d3Frame.position.set(0, 0.22, 0.02);
    dock3Group.add(d3Frame);

    const stepPlat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.18), this.concreteIndYardMat);
    stepPlat.position.set(0, 0.04, 0.09);
    dock3Group.add(stepPlat);

    const num3 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.01), this.wallIndPylonYellowMat);
    num3.position.set(0, 0.46, 0.04);
    dock3Group.add(num3);

    warehouse.add(dock3Group);

    // 5. 倉儲前庭物流設施 (Z in [0.20, 1.45])
    const forklift = this.createForklift();
    forklift.position.set(-0.75, 0, 0.35);
    forklift.rotation.y = 0.35;
    warehouse.add(forklift);

    const flPallet = this.createWoodPallet();
    flPallet.position.set(-0.70, 0.025, 0.52);
    warehouse.add(flPallet);

    const flBox = this.createCardboardBox(0.10, 0.08, 0.10);
    flBox.position.set(-0.70, 0.047 + 0.025, 0.52);
    warehouse.add(flBox);

    const yellowVan = this.createMiniTruck(0xf59e0b, 0xf1f5f9);
    yellowVan.position.set(0.20, 0, 0.85);
    yellowVan.rotation.y = -0.15;
    warehouse.add(yellowVan);

    for (let px of [0.65, 0.85]) {
      const pallet = this.createWoodPallet();
      pallet.position.set(px, 0.025, 0.55);
      warehouse.add(pallet);

      const box = this.createCardboardBox(0.12, 0.09, 0.12);
      box.position.set(px, 0.047 + 0.025, 0.55);
      warehouse.add(box);
    }

    const drumR = this.createOilDrum(this.barrelRedMat);
    drumR.position.set(0.68, 0, 0.78);
    warehouse.add(drumR);

    const drumY = this.createOilDrum(this.barrelYellowMat);
    drumY.position.set(0.82, 0, 0.78);
    warehouse.add(drumY);

    // 警衛亭與自動升降道閘
    const guardGroup = new THREE.Group();
    guardGroup.position.set(-0.95, 0.025, 1.15);

    const boothW = 0.26;
    const boothD = 0.26;
    const boothH = 0.38;
    const boothGeo = new THREE.BoxGeometry(boothW, boothH, boothD);
    const booth = new THREE.Mesh(boothGeo, this.truckWhiteMat);
    booth.position.y = boothH / 2;
    booth.castShadow = true;
    guardGroup.add(booth);

    const bRoof = new THREE.Mesh(new THREE.BoxGeometry(boothW + 0.06, 0.03, boothD + 0.06), this.curbIndDarkMat);
    bRoof.position.y = boothH + 0.015;
    guardGroup.add(bRoof);

    const bWin = new THREE.Mesh(new THREE.BoxGeometry(boothW * 0.75, 0.12, 0.01), this.glassMat);
    bWin.position.set(0, boothH * 0.65, boothD / 2 + 0.002);
    guardGroup.add(bWin);

    const gatePost = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), this.wallIndOrangeMat);
    gatePost.position.set(0.20, 0.08, 0.0);
    guardGroup.add(gatePost);

    const boomArm = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.02), this.stripeWhiteMat);
    boomArm.position.set(0.44, 0.14, 0.0);
    guardGroup.add(boomArm);

    for (let s = 0; s < 3; s++) {
      const redBand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.022), this.barrelRedMat);
      redBand.position.set(0.30 + s * 0.12, 0.14, 0.0);
      guardGroup.add(redBand);
    }
    warehouse.add(guardGroup);

    // 6. 園區四周防護圍籬與修剪方塊綠籬
    const fenceR = this.createIndustrialFence(2.8, 0.20);
    fenceR.rotation.y = Math.PI / 2;
    fenceR.position.set(1.22, 0, 0);
    warehouse.add(fenceR);

    const fenceRear = this.createIndustrialFence(2.4, 0.20);
    fenceRear.position.set(0, 0, -1.46);
    warehouse.add(fenceRear);

    const fenceL = this.createIndustrialFence(1.8, 0.20);
    fenceL.rotation.y = Math.PI / 2;
    fenceL.position.set(-1.22, 0, -0.50);
    warehouse.add(fenceL);

    for (let bz of [-1.2, -0.6, 0.0, 0.6]) {
      const bush = this.createHedge(0.12, 0.18, 0.12);
      bush.position.set(1.15, 0.09 + 0.025, bz);
      warehouse.add(bush);
    }

    return warehouse;
  }

  /**
   * 4. 6x6 中型工廠 (容納 7 人 / Medium Heavy Industrial Factory)
   * 佔地: 面寬 3.0m (6格) × 縱深 3.0m (6格)
   * 參考附圖 4：雙煙囪重型製造工廠園區
   * 核心特徵：
   * - 階梯式重工業深暗紅/玫瑰紅廠房主棟 (壁柱線條、頂部兩列雙排八座排風散熱機組)
   * - 雙座標誌性高聳混凝土工業排煙煙囪 (高達 1.70m，帶結構環箍與紅白警示冠圈)
   * - 整合式藍色多層製程/技術控制塔 (Steel Blue Technical Tower)
   * - 亮黃色高壓製程管線 (Yellow Process Pipelines) 沿外壁垂直與橫向連通
   * - 左側院落高壓變電所 (Substation) 與散熱鰭片變壓器群
   * - 內部環形瀝青車道、白線劃設斜列員工停車場、紅色送貨卡車
   * - 園區高壓照明立燈柱、圍牆與綠化球型矮樹
   * - 正面朝向：正門車輛出入口、斑馬線與停車場朝向 +Z 軸 (道路方向)
   */
  public static createIndustrial_6x6(): THREE.Group {
    const factory = new THREE.Group();
    factory.name = 'Industrial_6x6';

    // 1. 混擬土廠區地基 (3.0m x 3.0m)
    factory.add(this.createBaseIndustrialYard(3.0, 3.0));

    // 2. 重型主廠房建築體
    const fW = 1.30;
    const fD = 1.25;
    const fH = 0.88;
    const fX = -0.30;
    const fZ = -0.42;

    const mainHallGeo = new THREE.BoxGeometry(fW, fH, fD);
    const mainHall = new THREE.Mesh(mainHallGeo, this.wallIndFactoryRedMat);
    mainHall.position.set(fX, fH / 2 + 0.025, fZ);
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;
    factory.add(mainHall);

    const plinthGeo = new THREE.BoxGeometry(fW + 0.03, 0.045, fD + 0.03);
    const plinth = new THREE.Mesh(plinthGeo, this.curbIndDarkMat);
    plinth.position.set(fX, 0.0225 + 0.025, fZ);
    factory.add(plinth);

    const parapet = this.createFlatParapetRoof(fW, fD, this.wallIndFactoryRedMat, this.steelDarkMat);
    parapet.position.set(fX, fH + 0.025, fZ);
    factory.add(parapet);

    // 頂部散熱排風冷卻塔矩陣 (8 座)
    for (let row = -1; row <= 1; row += 2) {
      for (let col = -1.5; col <= 1.5; col += 1.0) {
        const fanGeo = new THREE.BoxGeometry(0.16, 0.065, 0.12);
        const fan = new THREE.Mesh(fanGeo, this.roofIndHvacGreyMat);
        fan.position.set(fX + col * 0.24, fH + 0.06 + 0.025, fZ + row * 0.28);
        fan.castShadow = true;
        factory.add(fan);
      }
    }

    // 正面兩組大型階梯式鼓風進氣過濾塔箱
    for (let bx of [fX - 0.32, fX + 0.32]) {
      const blowerGeo = new THREE.BoxGeometry(0.32, 0.34, 0.18);
      const blower = new THREE.Mesh(blowerGeo, this.roofIndHvacGreyMat);
      blower.position.set(bx, 0.17 + 0.025, fZ + fD / 2 + 0.09);
      blower.castShadow = true;
      factory.add(blower);

      for (let l = 0; l < 4; l++) {
        const louver = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.005), this.steelDarkMat);
        louver.position.set(bx, 0.08 + l * 0.06 + 0.025, fZ + fD / 2 + 0.182);
        factory.add(louver);
      }
    }

    // 3. 雙座標誌性高聳混凝土工業排煙煙囪 (Twin Iconic Industrial Smokestacks)
    const stackH = 1.70;
    const stackR1 = 0.085;
    const stackR2 = 0.070;

    for (let sx of [-0.05, 0.28]) {
      const stackGroup = new THREE.Group();
      stackGroup.position.set(sx, 0.025, -1.15);

      const stackGeo = new THREE.CylinderGeometry(stackR2, stackR1, stackH, 16);
      const stackMesh = new THREE.Mesh(stackGeo, this.concreteSmokestackMat);
      stackMesh.position.y = stackH / 2;
      stackMesh.castShadow = true;
      stackGroup.add(stackMesh);

      for (let r = 0.35; r <= 0.85; r += 0.25) {
        const ringGeo = new THREE.TorusGeometry(stackR1 * (1 - (r * 0.15)) + 0.005, 0.007, 6, 16);
        const ring = new THREE.Mesh(ringGeo, this.steelDarkMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = stackH * r;
        stackGroup.add(ring);
      }

      const topGeo = new THREE.CylinderGeometry(stackR2 + 0.012, stackR2 + 0.012, 0.12, 16);
      const topBand = new THREE.Mesh(topGeo, this.barrelRedMat);
      topBand.position.y = stackH - 0.06;
      stackGroup.add(topBand);

      const topRim = new THREE.Mesh(new THREE.CylinderGeometry(stackR2 + 0.018, stackR2 + 0.018, 0.02, 16), this.stripeHazardYellowMat);
      topRim.position.y = stackH - 0.01;
      stackGroup.add(topRim);

      factory.add(stackGroup);
    }

    // 4. 右側藍色多層技術控制塔 (Steel Blue Technical Tower)
    const towerW = 0.46;
    const towerD = 0.95;
    const towerH = 1.15;
    const towerX = 0.65;
    const towerZ = -0.35;

    const towerGeo = new THREE.BoxGeometry(towerW, towerH, towerD);
    const tower = new THREE.Mesh(towerGeo, this.wallIndBlueTowerMat);
    tower.position.set(towerX, towerH / 2 + 0.025, towerZ);
    tower.castShadow = true;
    factory.add(tower);

    const tParapet = this.createFlatParapetRoof(towerW, towerD, this.wallIndBlueTowerMat, this.steelDarkMat);
    tParapet.position.set(towerX, towerH + 0.025, towerZ);
    factory.add(tParapet);

    for (let floor = 1; floor <= 3; floor++) {
      const win = this.createWindow(0.16, 0.14, { style: 'dark', panesX: 1, panesY: 2 });
      win.position.set(towerX, 0.25 * floor + 0.12 + 0.025, towerZ + towerD / 2 + 0.002);
      factory.add(win);
    }

    // 5. 亮黃色製程壓力管道 (Yellow Process Pipelines)
    const pipeGroup = new THREE.Group();
    pipeGroup.position.set(towerX + towerW / 2 + 0.02, 0.025, towerZ);

    for (let pIdx of [-0.15, 0.15]) {
      const vPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 10), this.pipeYellowMat);
      vPipe.position.set(0, 0.425, pIdx);
      pipeGroup.add(vPipe);

      const hPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), this.pipeYellowMat);
      hPipe.rotation.z = Math.PI / 2;
      hPipe.position.set(-0.06, 0.82, pIdx);
      pipeGroup.add(hPipe);
    }
    factory.add(pipeGroup);

    const frontPipe = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.028, 0.028), this.pipeYellowMat);
    frontPipe.position.set(fX, 0.58 + 0.025, fZ + fD / 2 + 0.015);
    factory.add(frontPipe);

    // 6. 左側庭院高壓變電所 (Electrical Substation)
    const subGroup = new THREE.Group();
    subGroup.position.set(-1.12, 0, 0);

    for (let i = 0; i < 3; i++) {
      const trans = this.createTransformerUnit(0.18, 0.16, 0.16);
      trans.position.set(0, 0, -0.60 + i * 0.40);
      subGroup.add(trans);
    }
    factory.add(subGroup);

    // 7. 前方車道與員工停車位
    const innerRoadGeo = new THREE.BoxGeometry(2.85, 0.005, 1.05);
    const innerRoad = new THREE.Mesh(innerRoadGeo, this.asphaltIndYardMat);
    innerRoad.position.set(0, 0.026, 0.90);
    factory.add(innerRoad);

    for (let s = 0; s < 4; s++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.003, 0.02), this.stripeWhiteMat);
      line.rotation.y = 0.45;
      line.position.set(0.85 + s * 0.16, 0.029, 0.80 - s * 0.10);
      factory.add(line);
    }

    const redTruck = this.createMiniTruck(0xdc2626, 0x475569);
    redTruck.position.set(0.95, 0, 0.72);
    redTruck.rotation.y = -Math.PI / 2 + 0.45;
    factory.add(redTruck);

    const streetLight1 = this.createIndustrialStreetlight(0.42);
    streetLight1.position.set(-0.65, 0, 0.65);
    factory.add(streetLight1);

    const streetLight2 = this.createIndustrialStreetlight(0.42);
    streetLight2.position.set(0.45, 0, 0.65);
    factory.add(streetLight2);

    // 8. 園區外圍混凝土安全防護圍牆與綠化造景
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(2.90, 0.22, 0.04), this.concreteSmokestackMat);
    wallBack.position.set(0, 0.11 + 0.025, -1.46);
    factory.add(wallBack);

    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 2.90), this.concreteSmokestackMat);
    wallLeft.position.set(-1.46, 0.11 + 0.025, 0);
    factory.add(wallLeft);

    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 2.90), this.concreteSmokestackMat);
    wallRight.position.set(1.46, 0.11 + 0.025, 0);
    factory.add(wallRight);

    const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.22, 0.04), this.concreteSmokestackMat);
    wallFrontL.position.set(-0.95, 0.11 + 0.025, 1.46);
    factory.add(wallFrontL);

    const wallFrontR = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.22, 0.04), this.concreteSmokestackMat);
    wallFrontR.position.set(0.95, 0.11 + 0.025, 1.46);
    factory.add(wallFrontR);

    for (let zx = -0.35; zx <= 0.35; zx += 0.14) {
      const cw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.14), this.stripeWhiteMat);
      cw.position.set(zx, 0.029, 1.42);
      factory.add(cw);
    }

    const tree1 = this.createDeciduousTree(0.85);
    tree1.position.set(-1.32, 0, 0.75);
    factory.add(tree1);

    const tree2 = this.createDeciduousTree(0.85);
    tree2.position.set(-1.32, 0, -0.15);
    factory.add(tree2);

    const tree3 = this.createDeciduousTree(0.85);
    tree3.position.set(1.32, 0, -0.85);
    factory.add(tree3);

    return factory;
  }

  // ==========================================
  // 5. 元資料目錄與統一實例化介面
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
      {
        id: 'Industrial_4x4',
        name: '小型工廠 4x4',
        category: 'Industrial_Low',
        frontageWidth: 4,
        lotDepth: 4,
        capacity: 3,
        description: '開放式修車與金屬工坊，配備雙柱液壓汽車舉升機、車床工作台、單坡斜頂與條紋排煙煙囪。',
        features: [
          '3 人工作人數上限 (3 Workers)',
          '面寬 4 格 · 縱深 4 格 (2.0m × 2.0m)',
          '雙柱汽車舉升機 (附備用輪胎與液壓千斤頂)',
          '綠色工具車床機台、零件貨架與油桶組',
          '單坡斜頂橘色工廠主棟與紅白警示煙囪',
        ],
      },
      {
        id: 'Industrial_5x5',
        name: '維修廠 5x5',
        category: 'Industrial_Low',
        frontageWidth: 5,
        lotDepth: 5,
        capacity: 4,
        description: '現代多功能重型維修廠，配備大型鐵捲門車庫、斜頂採光天窗溫室、高架輸送帶斜坡與排氣風管。',
        features: [
          '4 人工作人數上限 (4 Workers)',
          '面寬 5 格 · 縱深 5 格 (2.5m × 2.5m)',
          '金屬捲門維修大廳與高架輸送斜坡進出洞口',
          '斜向天窗採光玻璃溫室屋頂與黑色防墜護欄',
          '屋頂高聳控制塔樓、藍色高空排氣管道與棧板貨箱群',
        ],
      },
      {
        id: 'Industrial_5x6',
        name: '物流倉庫 5x6',
        category: 'Industrial_Low',
        frontageWidth: 5,
        lotDepth: 6,
        capacity: 4,
        description: '大型現代紅磚物流轉運倉儲中心，正面臨路5格、縱深6格，配備3座貨運裝卸碼頭、大貨車、堆高機與警衛亭。',
        features: [
          '4 人工作人數上限 (4 Workers)',
          '正面臨路 5 格 · 縱深 6 格 (2.5m × 3.0m)',
          '立體 "WAREHOUSE" 大型招牌與黃色門廊飾牆',
          '3 座貨櫃裝卸泊位 (1, 2, 3 號碼頭) 與對接廂型貨車',
          '物流堆高機、多層棧板貨物、黃色送貨廂型車與門口警衛道閘',
        ],
      },
      {
        id: 'Industrial_6x6',
        name: '中型工廠 6x6',
        category: 'Industrial_Low',
        frontageWidth: 6,
        lotDepth: 6,
        capacity: 7,
        description: '重工業製造園區工廠，配備雙座高聳混凝土警示煙囪、藍色技術塔樓、黃色製程管線、變電所與內部環形車道。',
        features: [
          '7 人工作人數上限 (7 Workers)',
          '面寬 6 格 · 縱深 6 格 (3.0m × 3.0m)',
          '雙座標誌性超高混凝土排煙煙囪 (高達 1.70m)',
          '階梯式酒紅廠房、頂部散熱風機矩陣與藍色技術塔',
          '黃色製程壓力管道、高壓變電所機組與員工停車場',
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
      case 'Industrial_4x4':
        building = this.createIndustrial_4x4();
        break;
      case 'Industrial_5x5':
        building = this.createIndustrial_5x5();
        break;
      case 'Industrial_5x6':
        building = this.createIndustrial_5x6();
        break;
      case 'Industrial_6x6':
        building = this.createIndustrial_6x6();
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
