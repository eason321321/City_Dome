import * as THREE from 'three';

export interface BuildingMetadata {
  id: string;
  name: string;
  category: 'Residential_Low';
  frontageWidth: number;   // 面寬 (沿馬路方向 X 軸，米)
  lotDepth: number;        // 縱深 (垂直馬路方向 Z 軸，米)
  capacity: number;        // 居住人口上限 (人數)
  description: string;
  features: string[];
}

/**
 * 低密度住宅與建築模型工廠 (BuildingModelFactory)
 * 遵循專案「物件程式化低多邊形 (Procedural Low-Poly Primitives)」規範，
 * 動態組裝具備庭院地基、主建築本體、斜屋頂、門廊玄關、窗戶與植栽之 3D 模型。
 *
 * 【正面朝向規範】：
 * 所有建築正面（大門、玄關走道、前庭）一律朝向 +Z 軸（即未來落位時面朝馬路之方向）。
 * X 軸對應「面寬 (Frontage)」，Z 軸對應「縱深 (Depth)」。
 */
export class BuildingModelFactory {
  // 共享材質快取
  private static lawnMat = new THREE.MeshStandardMaterial({
    color: 0x4d7c0f, // 庭院草皮綠
    roughness: 0.85,
    metalness: 0.05,
  });

  private static pathMat = new THREE.MeshStandardMaterial({
    color: 0xcfd8dc, // 門前走道石板淺灰
    roughness: 0.7,
    metalness: 0.1,
  });

  private static wallWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc, // 純淨米白外牆
    roughness: 0.6,
    metalness: 0.1,
  });

  private static wallWoodMat = new THREE.MeshStandardMaterial({
    color: 0xd97706, // 暖木質感飾板
    roughness: 0.7,
    metalness: 0.15,
  });

  private static wallStuccoMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0, // 現代灰白泥牆
    roughness: 0.65,
    metalness: 0.08,
  });

  private static roofDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // 深石板板岩瓦
    roughness: 0.45,
    metalness: 0.2,
  });

  private static roofTerracottaMat = new THREE.MeshStandardMaterial({
    color: 0xc2410c, // 經典紅磚瓦
    roughness: 0.5,
    metalness: 0.1,
  });

  private static roofNavyMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, // 深海軍藍金屬斜屋頂
    roughness: 0.4,
    metalness: 0.3,
  });

  private static doorMat = new THREE.MeshStandardMaterial({
    color: 0x78350f, // 深胡桃木大門
    roughness: 0.5,
    metalness: 0.2,
  });

  private static windowMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // 採光反光車窗/窗戶
    roughness: 0.1,
    metalness: 0.85,
    emissive: 0x0369a1,
    emissiveIntensity: 0.25,
  });

  private static windowFrameMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
  });

  private static foliageMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e, // 灌木綠
    roughness: 0.9,
    metalness: 0.0,
  });

  private static trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5c4033, // 樹幹棕
    roughness: 0.9,
  });

  private static chimneyMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c, // 紅磚煙囪
    roughness: 0.7,
  });

  // --- 輔助建構方法 ---

  /** 建立地基與前庭引道 */
  private static createBaseLot(w: number, d: number): THREE.Group {
    const lotGroup = new THREE.Group();
    // 庭院地表 (高 0.03m，略高於地平面)
    const lawnGeo = new THREE.BoxGeometry(w - 0.04, 0.03, d - 0.04);
    const lawn = new THREE.Mesh(lawnGeo, this.lawnMat);
    lawn.position.y = 0.015;
    lawn.receiveShadow = true;
    lotGroup.add(lawn);

    // 大門通往馬路 (+Z 側) 的前庭走道石板
    const pathW = Math.min(0.6, w * 0.35);
    const pathD = d * 0.45;
    const pathGeo = new THREE.BoxGeometry(pathW, 0.035, pathD);
    const path = new THREE.Mesh(pathGeo, this.pathMat);
    path.position.set(0, 0.018, d / 2 - pathD / 2);
    path.receiveShadow = true;
    lotGroup.add(path);

    return lotGroup;
  }

  /** 建立帶門框與手把的大門 (正面朝 +Z) */
  private static createFrontDoor(w = 0.32, h = 0.65, d = 0.04): THREE.Group {
    const doorGroup = new THREE.Group();
    // 門片
    const doorGeo = new THREE.BoxGeometry(w, h, d);
    const door = new THREE.Mesh(doorGeo, this.doorMat);
    door.position.y = h / 2;
    doorGroup.add(door);

    // 金屬手把
    const handleGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(w * 0.32, h * 0.5, d / 2 + 0.01);
    doorGroup.add(handle);

    return doorGroup;
  }

  /** 建立窗戶 */
  private static createWindow(w = 0.35, h = 0.4): THREE.Group {
    const winGroup = new THREE.Group();
    const frameGeo = new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.02);
    const frame = new THREE.Mesh(frameGeo, this.windowFrameMat);
    winGroup.add(frame);

    const glassGeo = new THREE.BoxGeometry(w, h, 0.025);
    const glass = new THREE.Mesh(glassGeo, this.windowMat);
    winGroup.add(glass);

    return winGroup;
  }

  /**
   * 建立經典三角人字雙斜屋頂 (Gable Roof)
   * 依據面寬 (w)、脊高 (h)、縱深 (d) 構造五面實心稜柱，
   * 脊線 (Apex) 沿縱深軸頂部延伸，左右雙斜坡順勢下垂至屋簷，
   * 前後山牆為正立三角形，底面平整覆蓋牆身。
   */
  private static createGableRoof(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;

    // 幾何頂點（以屋頂幾何中心為原點）：
    // 屋脊兩端 (Ridge Apex) 位於上方 +Y (y = +hh)
    // 屋簷四角 (Eaves) 位於下方 -Y (y = -hh)
    const rf = [0, hh, hd];      // 屋脊前端 (+Z)
    const rb = [0, hh, -hd];     // 屋脊後端 (-Z)
    const blf = [-hw, -hh, hd];  // 屋簷前左角 (-X, +Z)
    const brf = [hw, -hh, hd];   // 屋簷前右角 (+X, +Z)
    const blb = [-hw, -hh, -hd]; // 屋簷後左角 (-X, -Z)
    const brb = [hw, -hh, -hd];  // 屋簷後右角 (+X, -Z)

    // 8 個三角形組成無縫五面稜柱 (Triangular Prism)
    // 逆時針繞行使得面法向量精準朝外
    const positions: number[] = [
      // 1. 正面山牆三角 (Facing +Z)
      ...blf, ...brf, ...rf,

      // 2. 背面山牆三角 (Facing -Z)
      ...brb, ...blb, ...rb,

      // 3. 右側斜坡 (Facing +X, +Y) - 2 個三角形
      ...rf, ...brf, ...brb,
      ...rf, ...brb, ...rb,

      // 4. 左側斜坡 (Facing -X, +Y) - 2 個三角形
      ...rb, ...blb, ...blf,
      ...rb, ...blf, ...rf,

      // 5. 底面平蓋 (Facing -Y) - 2 個三角形
      ...blf, ...blb, ...brb,
      ...blf, ...brb, ...brf,
    ];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    const roof = new THREE.Mesh(geo, mat);
    roof.castShadow = true;
    roof.receiveShadow = true;
    return roof;
  }

  /** 建立矮灌木裝飾 */
  private static createBush(r = 0.15): THREE.Mesh {
    const bushGeo = new THREE.DodecahedronGeometry(r, 0);
    const bush = new THREE.Mesh(bushGeo, this.foliageMat);
    bush.position.y = r * 0.9;
    bush.castShadow = true;
    return bush;
  }

  /** 建立景觀庭院小樹 */
  private static createGardenTree(): THREE.Group {
    const tree = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.4, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.trunkMat);
    trunk.position.y = 0.2;
    tree.add(trunk);

    const crownGeo = new THREE.DodecahedronGeometry(0.28, 1);
    const crown = new THREE.Mesh(crownGeo, this.foliageMat);
    crown.position.y = 0.55;
    crown.castShadow = true;
    tree.add(crown);

    return tree;
  }

  // ==========================================
  // 5 款低密度住宅專屬 3D 模型實作
  // ==========================================

  /**
   * 1. 低密度住宅 2x2 (2 人 / Two People)
   * 面寬: 2m, 縱深: 2m
   * 溫馨小巧單層獨棟別墅，正面設有門廊與三角山形瓦頂
   */
  public static createResidential_2x2(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_2x2';

    // 庭院地基 (2x2)
    house.add(this.createBaseLot(2.0, 2.0));

    // 主建築本體 (寬 1.4m, 高 1.1m, 深 1.3m, 稍偏後 -Z)
    const bodyGeo = new THREE.BoxGeometry(1.4, 1.1, 1.3);
    const body = new THREE.Mesh(bodyGeo, this.wallWhiteMat);
    body.position.set(0, 0.58, -0.15);
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // 屋頂：經典深石板灰人字雙斜屋頂 (覆蓋寬 1.55m, 深 1.45m)
    const roof = this.createGableRoof(1.55, 0.55, 1.45, this.roofDarkMat);
    roof.position.set(0, 1.4, -0.15);
    house.add(roof);

    // 正面大門 (+Z 側，朝向馬路)
    const door = this.createFrontDoor(0.28, 0.6, 0.03);
    door.position.set(0, 0.03, 0.51);
    house.add(door);

    // 門廊遮雨棚
    const canopyGeo = new THREE.BoxGeometry(0.48, 0.04, 0.2);
    const canopy = new THREE.Mesh(canopyGeo, this.wallWoodMat);
    canopy.position.set(0, 0.68, 0.58);
    house.add(canopy);

    // 正面窗戶 (+Z 側右方)
    const winRight = this.createWindow(0.3, 0.35);
    winRight.position.set(0.42, 0.6, 0.51);
    house.add(winRight);

    // 側窗 (-X 側)
    const winSide = this.createWindow(0.3, 0.3);
    winSide.rotation.y = Math.PI / 2;
    winSide.position.set(-0.71, 0.65, -0.15);
    house.add(winSide);

    // 煙囪 (偏後方)
    const chimGeo = new THREE.BoxGeometry(0.16, 0.45, 0.16);
    const chim = new THREE.Mesh(chimGeo, this.chimneyMat);
    chim.position.set(-0.35, 1.6, -0.3);
    house.add(chim);

    // 庭院植栽
    const bush1 = this.createBush(0.14);
    bush1.position.set(-0.6, 0.02, 0.6);
    house.add(bush1);

    const bush2 = this.createBush(0.12);
    bush2.position.set(0.68, 0.02, 0.6);
    house.add(bush2);

    return house;
  }

  /**
   * 2. 低密度住宅 2x3 (2 人 / Two People)
   * 面寬: 2m, 縱深: 3m
   * 窄面寬、大縱深英式長型排屋/小屋，後方具備悠閒後花園
   */
  public static createResidential_2x3(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_2x3';

    // 庭院地基 (2x3)
    house.add(this.createBaseLot(2.0, 3.0));

    // 主建築本體 (寬 1.35m, 高 1.25m, 深 2.0m，縱深長，位置在 Z=-0.2)
    const bodyGeo = new THREE.BoxGeometry(1.35, 1.25, 2.0);
    const body = new THREE.Mesh(bodyGeo, this.wallStuccoMat);
    body.position.set(0, 0.65, -0.2);
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // 縱向延伸之紅磚斜屋頂 (寬 1.5m, 高 0.6m, 深 2.15m)
    const roof = this.createGableRoof(1.5, 0.6, 2.15, this.roofTerracottaMat);
    roof.position.set(0, 1.55, -0.2);
    house.add(roof);

    // 正面大門 (+Z 側，偏左)
    const door = this.createFrontDoor(0.28, 0.62, 0.03);
    door.position.set(-0.3, 0.03, 0.81);
    house.add(door);

    // 正面窗戶 (+Z 側，偏右)
    const winFront = this.createWindow(0.35, 0.42);
    winFront.position.set(0.3, 0.68, 0.81);
    house.add(winFront);

    // 閣樓前老虎窗小圓孔
    const atticWinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12);
    atticWinGeo.rotateX(Math.PI / 2);
    const atticWin = new THREE.Mesh(atticWinGeo, this.windowMat);
    atticWin.position.set(0, 1.45, 0.885);
    house.add(atticWin);

    // 兩側長向側窗
    const winSide1 = this.createWindow(0.35, 0.35);
    winSide1.rotation.y = Math.PI / 2;
    winSide1.position.set(0.68, 0.68, -0.3);
    house.add(winSide1);

    const winSide2 = this.createWindow(0.35, 0.35);
    winSide2.rotation.y = Math.PI / 2;
    winSide2.position.set(-0.68, 0.68, -0.5);
    house.add(winSide2);

    // 後花園庭院景觀樹 (-Z 側)
    const tree = this.createGardenTree();
    tree.position.set(0.35, 0.02, -1.1);
    house.add(tree);

    // 前庭右側小灌木
    const bush = this.createBush(0.13);
    bush.position.set(0.65, 0.02, 1.15);
    house.add(bush);

    return house;
  }

  /**
   * 3. 低密度住宅 3x2 (2 人 / Two People)
   * 面寬: 3m, 縱深: 2m
   * 寬面橫向美式平房 (Ranch Bungalow)，寬闊大屋簷與前門左右對稱雙窗
   */
  public static createResidential_3x2(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_3x2';

    // 庭院地基 (3x2)
    house.add(this.createBaseLot(3.0, 2.0));

    // 主建築本體 (寬 2.3m, 高 1.15m, 深 1.3m，面寬寬敞)
    const bodyGeo = new THREE.BoxGeometry(2.3, 1.15, 1.3);
    const body = new THREE.Mesh(bodyGeo, this.wallWoodMat);
    body.position.set(0, 0.6, -0.15);
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    // 橫向大斜屋頂 (覆蓋面寬 2.45m，深 1.45m)
    // 橫向屋頂旋轉 90 度呈橫向人字脊
    const roof = this.createGableRoof(1.45, 0.58, 2.45, this.roofNavyMat);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(0, 1.45, -0.15);
    house.add(roof);

    // 正面中央前門廊立柱與遮陽頂
    const porchRoofGeo = new THREE.BoxGeometry(0.7, 0.04, 0.35);
    const porchRoof = new THREE.Mesh(porchRoofGeo, this.wallWhiteMat);
    porchRoof.position.set(0, 0.85, 0.62);
    house.add(porchRoof);

    // 雙廊柱
    const pillarGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8);
    const leftPillar = new THREE.Mesh(pillarGeo, this.wallWhiteMat);
    leftPillar.position.set(-0.3, 0.42, 0.72);
    house.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, this.wallWhiteMat);
    rightPillar.position.set(0.3, 0.42, 0.72);
    house.add(rightPillar);

    // 中央正門
    const door = this.createFrontDoor(0.3, 0.65, 0.03);
    door.position.set(0, 0.03, 0.51);
    house.add(door);

    // 左右兩扇大採光橫窗
    const winLeft = this.createWindow(0.42, 0.38);
    winLeft.position.set(-0.75, 0.62, 0.51);
    house.add(winLeft);

    const winRight = this.createWindow(0.42, 0.38);
    winRight.position.set(0.75, 0.62, 0.51);
    house.add(winRight);

    // 煙囪 (右側)
    const chimGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
    const chim = new THREE.Mesh(chimGeo, this.chimneyMat);
    chim.position.set(0.8, 1.6, -0.3);
    house.add(chim);

    // 前院綠化花圃
    const b1 = this.createBush(0.13);
    b1.position.set(-1.15, 0.02, 0.65);
    house.add(b1);

    const b2 = this.createBush(0.13);
    b2.position.set(1.15, 0.02, 0.65);
    house.add(b2);

    return house;
  }

  /**
   * 4. 低密度住宅 3x3 (3 人 / 3 People)
   * 面寬: 3m, 縱深: 3m
   * 雙層現代花園別墅，含單車位車庫、二樓臥房大露台與典雅閣樓窗
   */
  public static createResidential_3x3(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_3x3';

    // 庭院地基 (3x3)
    house.add(this.createBaseLot(3.0, 3.0));

    // 一樓主樓 (寬 2.3m, 高 1.1m, 深 2.1m)
    const floor1Geo = new THREE.BoxGeometry(2.3, 1.1, 2.1);
    const floor1 = new THREE.Mesh(floor1Geo, this.wallWhiteMat);
    floor1.position.set(0, 0.58, -0.15);
    floor1.castShadow = true;
    floor1.receiveShadow = true;
    house.add(floor1);

    // 一樓左側獨立車庫捲門
    const garageGeo = new THREE.BoxGeometry(0.85, 0.75, 0.03);
    const garageMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.4 });
    const garage = new THREE.Mesh(garageGeo, garageMat);
    garage.position.set(-0.62, 0.4, 0.91);
    house.add(garage);

    // 一樓右側主門
    const door = this.createFrontDoor(0.3, 0.68, 0.03);
    door.position.set(0.45, 0.03, 0.91);
    house.add(door);

    // 二樓樓層 (寬 1.7m, 高 0.95m, 深 1.8m，稍往後縮形成前凸層次)
    const floor2Geo = new THREE.BoxGeometry(1.7, 0.95, 1.8);
    const floor2 = new THREE.Mesh(floor2Geo, this.wallWoodMat);
    floor2.position.set(0.15, 1.58, -0.2);
    floor2.castShadow = true;
    floor2.receiveShadow = true;
    house.add(floor2);

    // 二樓主屋頂 (深石板瓦)
    const roof = this.createGableRoof(1.85, 0.65, 1.95, this.roofDarkMat);
    roof.position.set(0.15, 2.35, -0.2);
    house.add(roof);

    // 二樓正面主臥窗
    const win2F = this.createWindow(0.45, 0.45);
    win2F.position.set(0.15, 1.65, 0.71);
    house.add(win2F);

    // 一樓客廳正面窗
    const winLiving = this.createWindow(0.35, 0.45);
    winLiving.position.set(0.88, 0.62, 0.91);
    house.add(winLiving);

    // 煙囪
    const chimGeo = new THREE.BoxGeometry(0.2, 0.55, 0.2);
    const chim = new THREE.Mesh(chimGeo, this.chimneyMat);
    chim.position.set(-0.55, 2.5, -0.4);
    house.add(chim);

    // 前庭景觀樹 (右前方)
    const tree = this.createGardenTree();
    tree.position.set(1.05, 0.02, 1.05);
    house.add(tree);

    // 車庫前車道鋪磚
    const drivewayGeo = new THREE.BoxGeometry(0.9, 0.032, 0.65);
    const driveway = new THREE.Mesh(drivewayGeo, this.pathMat);
    driveway.position.set(-0.62, 0.017, 1.15);
    house.add(driveway);

    return house;
  }

  /**
   * 5. 低密度住宅 4x4 (4 人 / 4 People)
   * 面寬: 4m, 縱深: 4m
   * 豪華兩層氣派美式大宅邸，複合式十字雙斜屋頂、雙車庫、二樓景觀露台與私家庭院花園
   */
  public static createResidential_4x4(): THREE.Group {
    const house = new THREE.Group();
    house.name = 'Residential_4x4';

    // 庭院地基 (4x4)
    house.add(this.createBaseLot(4.0, 4.0));

    // 一樓主樓 (寬 3.2m, 高 1.25m, 深 2.8m)
    const floor1Geo = new THREE.BoxGeometry(3.2, 1.25, 2.8);
    const floor1 = new THREE.Mesh(floor1Geo, this.wallWhiteMat);
    floor1.position.set(0, 0.65, -0.2);
    floor1.castShadow = true;
    floor1.receiveShadow = true;
    house.add(floor1);

    // 一樓左側雙車位大車庫
    const garageGeo = new THREE.BoxGeometry(1.3, 0.85, 0.03);
    const garageMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.35 });
    const garage = new THREE.Mesh(garageGeo, garageMat);
    garage.position.set(-0.85, 0.45, 1.21);
    house.add(garage);

    // 中央宏偉挑高門廊 (Portico)
    const porchColGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 10);
    const colLeft = new THREE.Mesh(porchColGeo, this.wallWhiteMat);
    colLeft.position.set(0.15, 0.62, 1.45);
    house.add(colLeft);

    const colRight = new THREE.Mesh(porchColGeo, this.wallWhiteMat);
    colRight.position.set(0.85, 0.62, 1.45);
    house.add(colRight);

    // 門廊頂蓋山形三角簷
    const pedimentGeo = new THREE.BoxGeometry(0.9, 0.06, 0.4);
    const pediment = new THREE.Mesh(pedimentGeo, this.wallWoodMat);
    pediment.position.set(0.5, 1.25, 1.35);
    house.add(pediment);

    // 正面雙開大門
    const door = this.createFrontDoor(0.42, 0.75, 0.04);
    door.position.set(0.5, 0.03, 1.21);
    house.add(door);

    // 一樓右翼大八角凸窗 (Bay Window)
    const bayWinGeo = new THREE.BoxGeometry(0.65, 0.55, 0.15);
    const bayWin = new THREE.Mesh(bayWinGeo, this.windowMat);
    bayWin.position.set(1.15, 0.65, 1.25);
    house.add(bayWin);

    // 二樓中央主建築 (寬 2.4m, 高 1.1m, 深 2.2m)
    const floor2Geo = new THREE.BoxGeometry(2.4, 1.1, 2.2);
    const floor2 = new THREE.Mesh(floor2Geo, this.wallStuccoMat);
    floor2.position.set(0.2, 1.8, -0.2);
    floor2.castShadow = true;
    floor2.receiveShadow = true;
    house.add(floor2);

    // 複合屋頂 (主縱向屋頂 + 橫向側翼屋頂)
    const mainRoof = this.createGableRoof(2.6, 0.75, 2.4, this.roofTerracottaMat);
    mainRoof.position.set(0.2, 2.7, -0.2);
    house.add(mainRoof);

    // 左側車庫專屬斜屋頂
    const garageRoof = this.createGableRoof(1.45, 0.45, 1.5, this.roofDarkMat);
    garageRoof.position.set(-0.85, 1.45, 0.45);
    house.add(garageRoof);

    // 二樓正面雙窗
    const win2F_L = this.createWindow(0.38, 0.42);
    win2F_L.position.set(-0.35, 1.85, 0.91);
    house.add(win2F_L);

    const win2F_R = this.createWindow(0.38, 0.42);
    win2F_R.position.set(0.75, 1.85, 0.91);
    house.add(win2F_R);

    // 雙煙囪
    const chim1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), this.chimneyMat);
    chim1.position.set(1.2, 2.7, -0.6);
    house.add(chim1);

    // 前庭與車道造景
    const drivewayGeo = new THREE.BoxGeometry(1.4, 0.035, 0.85);
    const driveway = new THREE.Mesh(drivewayGeo, this.pathMat);
    driveway.position.set(-0.85, 0.018, 1.55);
    house.add(driveway);

    // 花園大景觀樹 (右前方)
    const tree1 = this.createGardenTree();
    tree1.position.set(1.5, 0.02, 1.45);
    house.add(tree1);

    // 後院小樹
    const tree2 = this.createGardenTree();
    tree2.position.set(-1.45, 0.02, -1.35);
    house.add(tree2);

    // 矮灌木綠籬
    const b1 = this.createBush(0.16);
    b1.position.set(1.5, 0.02, 0.8);
    house.add(b1);

    const b2 = this.createBush(0.14);
    b2.position.set(0, 0.02, 1.55);
    house.add(b2);

    return house;
  }

  // ==========================================
  // 元資料目錄與統一實例化介面
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
        description: '小巧溫馨的單層獨棟別墅，正面設有門廊與前庭步道。',
        features: ['2 人居住容量 (2 People)', '面寬 2 格 · 縱深 2 格 (1m × 1m)', '經典人字斜屋頂', '精巧前庭花圃'],
      },
      {
        id: 'Residential_2x3',
        name: '低密度住宅 2x3',
        category: 'Residential_Low',
        frontageWidth: 2,
        lotDepth: 3,
        capacity: 2,
        description: '窄面寬、大縱深的長型英式小屋，正面朝馬路，後方自帶景觀後庭花園。',
        features: ['2 人居住容量 (2 People)', '窄面寬 2 格 · 縱深 3 格 (1m × 1.5m)', '紅磚瓦長條斜屋頂', '自帶後花園景觀樹'],
      },
      {
        id: 'Residential_3x2',
        name: '低密度住宅 3x2',
        category: 'Residential_Low',
        frontageWidth: 3,
        lotDepth: 2,
        capacity: 2,
        description: '面寬寬敞、淺縱深之美式平房，正面設有寬大門廊立柱與左右雙採光橫窗。',
        features: ['2 人居住容量 (2 People)', '寬面寬 3 格 · 淺縱深 2 格 (1.5m × 1m)', '雙立柱玄關門廊', '大橫向採光窗'],
      },
      {
        id: 'Residential_3x3',
        name: '低密度住宅 3x3',
        category: 'Residential_Low',
        frontageWidth: 3,
        lotDepth: 3,
        capacity: 3,
        description: '雙層雅致現代家庭別墅，一樓配置獨立車庫與客廳，二樓為臥室。',
        features: ['3 人居住容量 (3 People / 3p)', '面寬 3 格 · 縱深 3 格 (1.5m × 1.5m)', '附設單車位車庫', '雙層樓次層次設計'],
      },
      {
        id: 'Residential_4x4',
        name: '低密度住宅 4x4',
        category: 'Residential_Low',
        frontageWidth: 4,
        lotDepth: 4,
        capacity: 4,
        description: '豪華氣派大型莊園別墅，複合式斜屋頂、雙車位車庫、八角凸窗與前後雙景觀庭院。',
        features: ['4 人居住容量 (4 People / 4p)', '面寬 4 格 · 縱深 4 格 (2m × 2m)', '宏偉挑高門廊柱', '複合斜屋頂與私家庭院'],
      },
    ];
  }

  /**
   * 根據 ID 建立房屋實體模型
   * 因土地格位改為 0.5m x 0.5m (面積變為四分之一)，模型等比縮小 0.5 (底面積四分之一)
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
      // 縮小為四分之一 (X, Y, Z 各 0.5，底面積與各格位完全貼合)
      building.scale.set(0.5, 0.5, 0.5);
      const rootWrapper = new THREE.Group();
      rootWrapper.name = `${id}_RootWrapper`;
      rootWrapper.add(building);
      return rootWrapper;
    }
    return null;
  }
}
