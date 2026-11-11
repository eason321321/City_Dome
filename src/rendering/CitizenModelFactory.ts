import * as THREE from 'three';
import { VehicleModelFactory } from './VehicleModelFactory';

export type CitizenGender = 'male' | 'female';

export interface CitizenAppearanceOptions {
  gender?: CitizenGender;
  variant?: number;
  skinTone?: number;
  hairColor?: number;
  shirtColor?: number;
  pantsColor?: number;
  shoeColor?: number;
  scale?: number;
  hasSunglasses?: boolean;
  hasBag?: boolean;
}

/**
 * 預設膚色調色盤 (自然暖調、健康小麥、淺膚色)
 */
export const SKIN_TONES = [
  0xf6d5b8, // 白皙粉膚 (Fair Peach)
  0xf1c27d, // 暖陽小麥 (Warm Tan)
  0xe0ac69, // 健康古銅 (Sun Bronze)
  0xc68642, // 深邃小麥 (Deep Tan)
  0x8d5524, // 陽光深棕 (Warm Brown)
];

/**
 * 預設髮色調色盤
 */
export const HAIR_COLORS = [
  0x2a1d17, // 深咖啡棕 (Espresso Brown)
  0x18181b, // 曜石純黑 (Jet Black)
  0x78350f, // 栗子暖棕 (Chestnut Brown)
  0xd97706, // 琥珀金褐 (Golden Blonde)
  0x64748b, // 雅痞銀灰 (Ash Gray)
];

/**
 * 市民上衣/洋裝色彩調色盤 (參考樣照中鮮明純粹的當代服裝色系)
 */
export const CLOTHING_COLORS = {
  maleTops: [
    0x60a5fa, // 蔚藍圓領 (Sky Blue #104)
    0x06b6d4, // 沁涼海青 Polo (#105)
    0x94a3b8, // 淺灰衛衣 (Heather Gray)
    0xef4444, // 亮紅休閒 (Bright Red)
    0x10b981, // 翡翠運動 (Emerald Green)
    0x334155, // 鐵灰襯衫 (Slate)
  ],
  maleBottoms: [
    0x1e293b, // 深黑運動短褲 (#104)
    0xef4444, // 亮紅休閒短褲 (#105)
    0x1e3a8a, // 經典深藍牛仔長褲
    0x475569, // 灰石休閒休閒長褲
    0xd4b996, // 卡其休閒褲 (Khaki)
  ],
  femaleTops: [
    0xf8fafc, // 純淨珍珠白洋裝 (#110)
    0xc084fc, // 夢幻薰衣草紫 (#107)
    0x10b981, // 翠綠背心 (#102)
    0x0284c7, // 寶藍運動連帽 (#106)
    0x1e293b, // 經典高雅黑洋裝 (#117)
    0xf43f5e, // 莓果珊瑚粉
  ],
  femaleBottoms: [
    0xf8fafc, // 純白百搭長褲/裙襬
    0xc084fc, // 薰衣草紫緊身褲 (#107)
    0x1d4ed8, // 皇家藍運動短褲 (#102)
    0xf472b6, // 櫻花粉運動休閒褲 (#106)
    0x1e293b, // 典雅黑窄裙/短裙 (#117)
  ],
  shoes: [
    0xffffff, // 現代純白厚底球鞋 (White Sneakers - 樣照中最經典百搭款)
    0x18181b, // 深黑便鞋/皮鞋
    0x78350f, // 暖棕休閒平底鞋
    0xd97706, // 焦糖色休閒涼鞋
  ],
};

/**
 * 程式化低多邊形市民模型工廠 (CitizenModelFactory)
 * 遵循專案「物件程式化 Procedural Low-Poly Primitives」定案規範，
 * 嚴格參考樣照中現代 3D 黏土模型/迷你微縮公仔風格：
 * 1. 區分男性 (Male) 與女性 (Female) 基礎體態與髮型輪廓。
 * 2. 精確依據轎車高度 (0.142m) 推算市民身高比例 (男高約 0.178m，女高約 0.168m，頭身比約 6.5 頭身)。
 * 3. 寬度約 0.065m，與 0.22m 人行道完美相稱，留有充足舒適會車淨寬。
 * 4. 細緻組裝頭部、髮型、五官墨鏡、軀幹、袖口短袖、短褲/裙襬/長褲與白球鞋。
 */
export class CitizenModelFactory {
  // 共享材質快取
  private static skinMaterials: Map<number, THREE.MeshStandardMaterial> = new Map();
  private static hairMaterials: Map<number, THREE.MeshStandardMaterial> = new Map();
  private static clothMaterials: Map<number, THREE.MeshStandardMaterial> = new Map();

  // 專屬材質
  private static whiteSneakerMat: THREE.MeshStandardMaterial | null = null;
  private static sunglassesMat: THREE.MeshStandardMaterial | null = null;

  /**
   * 取得指定顏色之平滑柔和啞光皮膚材質
   */
  public static getSkinMaterial(colorHex: number): THREE.MeshStandardMaterial {
    let mat = this.skinMaterials.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.65,
        metalness: 0.05,
      });
      this.skinMaterials.set(colorHex, mat);
    }
    return mat;
  }

  /**
   * 取得指定顏色之髮絲/髮冠材質
   */
  public static getHairMaterial(colorHex: number): THREE.MeshStandardMaterial {
    let mat = this.hairMaterials.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.55,
        metalness: 0.1,
      });
      this.hairMaterials.set(colorHex, mat);
    }
    return mat;
  }

  /**
   * 取得衣著布料材質
   */
  public static getClothMaterial(colorHex: number): THREE.MeshStandardMaterial {
    let mat = this.clothMaterials.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.7,
        metalness: 0.05,
      });
      this.clothMaterials.set(colorHex, mat);
    }
    return mat;
  }

  /**
   * 取得白球鞋材質
   */
  public static getWhiteSneakerMaterial(): THREE.MeshStandardMaterial {
    if (!this.whiteSneakerMat) {
      this.whiteSneakerMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.1,
      });
    }
    return this.whiteSneakerMat;
  }

  /**
   * 取得墨鏡黑色反光鏡片材質
   */
  public static getSunglassesMaterial(): THREE.MeshStandardMaterial {
    if (!this.sunglassesMat) {
      this.sunglassesMat = new THREE.MeshStandardMaterial({
        color: 0x09090b,
        roughness: 0.15,
        metalness: 0.85,
      });
    }
    return this.sunglassesMat;
  }

  // ==========================================
  // 核心生成方法
  // ==========================================

  /**
   * 統一建立市民實體模型
   */
  public static createCitizen(options: CitizenAppearanceOptions = {}): THREE.Group {
    const gender: CitizenGender = options.gender ?? (Math.random() < 0.5 ? 'male' : 'female');
    if (gender === 'male') {
      return this.createMaleCitizen(options);
    } else {
      return this.createFemaleCitizen(options);
    }
  }

  /**
   * 建立男性市民模型 (Male Citizen)
   * 身高約 0.178m，倒梯形健美微縮體格、俐落短髮/旁分短髮、休閒上衣、短褲或長褲、厚底球鞋
   */
  public static createMaleCitizen(options: CitizenAppearanceOptions = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Citizen_Male';

    const variant = options.variant ?? Math.floor(Math.random() * 3);
    const skinColor = options.skinTone ?? SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const hairColor = options.hairColor ?? HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
    const shirtColor = options.shirtColor ?? CLOTHING_COLORS.maleTops[Math.floor(Math.random() * CLOTHING_COLORS.maleTops.length)];
    const pantsColor = options.pantsColor ?? CLOTHING_COLORS.maleBottoms[Math.floor(Math.random() * CLOTHING_COLORS.maleBottoms.length)];
    const shoeColor = options.shoeColor ?? CLOTHING_COLORS.shoes[0]; // 預設白球鞋

    const skinMat = this.getSkinMaterial(skinColor);
    const hairMat = this.getHairMaterial(hairColor);
    const shirtMat = this.getClothMaterial(shirtColor);
    const pantsMat = this.getClothMaterial(pantsColor);
    const shoeMat = shoeColor === 0xffffff ? this.getWhiteSneakerMaterial() : this.getClothMaterial(shoeColor);

    // 依款式微調裝扮：
    // variant 0: 運動休閒短褲 + 圓領衛衣 (參考 #104)
    // variant 1: 活力 Polo衫 + 短褲 + 潮流墨鏡 (參考 #105)
    // variant 2: 都會修身休閒長褲 + 雙層夾克 (參考 #112)
    const isWearingShorts = variant !== 2;
    const hasSunglasses = options.hasSunglasses ?? (variant === 1 || Math.random() < 0.25);

    // ------------------------------------
    // 1. 雙腳與球鞋 (Y: 0 ~ 0.014m)
    // ------------------------------------
    const stanceX = 0.016; // 雙腳微開站姿
    const footPositions = [-stanceX, stanceX];

    footPositions.forEach((fx) => {
      // 球鞋主體 (前微翹橢圓倒角感)
      const shoeGeo = new THREE.BoxGeometry(0.014, 0.012, 0.024);
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(fx, 0.006, 0.003); // 鞋頭稍微朝 +Z
      shoe.castShadow = true;
      group.add(shoe);

      // 鞋底邊條膠框 (提升微縮模型精緻細節)
      const soleGeo = new THREE.BoxGeometry(0.015, 0.003, 0.025);
      const soleMat = this.getClothMaterial(0xe2e8f0);
      const sole = new THREE.Mesh(soleGeo, soleMat);
      sole.position.set(fx, 0.0015, 0.003);
      group.add(sole);
    });

    // ------------------------------------
    // 2. 雙腿與褲子 (Y: 0.012m ~ 0.090m)
    // ------------------------------------
    const legRadius = 0.006;
    const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 0.9, 0.076, 8);

    if (isWearingShorts) {
      // 上半截短褲 (Y: 0.056 ~ 0.090m)
      const shortsLegGeo = new THREE.CylinderGeometry(legRadius * 1.35, legRadius * 1.2, 0.034, 8);
      footPositions.forEach((fx) => {
        // 小腿 (膚色)
        const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 0.95, legRadius * 0.85, 0.046, 8), skinMat);
        lowerLeg.position.set(fx, 0.012 + 0.023, 0);
        lowerLeg.castShadow = true;
        group.add(lowerLeg);

        // 短褲管 (褲色)
        const shortsLeg = new THREE.Mesh(shortsLegGeo, pantsMat);
        shortsLeg.position.set(fx, 0.056 + 0.017, 0);
        shortsLeg.castShadow = true;
        group.add(shortsLeg);
      });
    } else {
      // 全長休閒褲 (長褲色)
      footPositions.forEach((fx) => {
        const fullLeg = new THREE.Mesh(legGeo, pantsMat);
        fullLeg.position.set(fx, 0.012 + 0.038, 0);
        fullLeg.castShadow = true;
        group.add(fullLeg);
      });
    }

    // 骨盆/臀部褲頭 (連接雙腿)
    const pelvisGeo = new THREE.BoxGeometry(0.040, 0.016, 0.024);
    const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvis.position.set(0, 0.090, 0);
    pelvis.castShadow = true;
    group.add(pelvis);

    // ------------------------------------
    // 3. 軀幹與上衣 (Y: 0.098m ~ 0.148m)
    // ------------------------------------
    // 倒梯形上身 (胸寬 0.048m，腰寬 0.040m，高 0.048m，厚 0.026m)
    const torsoGeo = new THREE.BoxGeometry(0.048, 0.048, 0.026);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.set(0, 0.122, 0);
    torso.castShadow = true;
    group.add(torso);

    if (variant === 1) {
      // Polo 衫領口白飾邊
      const collarGeo = new THREE.BoxGeometry(0.024, 0.005, 0.028);
      const collarMat = this.getClothMaterial(0xffffff);
      const collar = new THREE.Mesh(collarGeo, collarMat);
      collar.position.set(0, 0.146, 0);
      group.add(collar);
    }

    // ------------------------------------
    // 4. 雙手臂與手部 (手插腰或自然下垂站姿)
    // ------------------------------------
    const armX = 0.029;
    const armPositions = [-armX, armX];

    armPositions.forEach((ax) => {
      // 上臂/短袖
      const sleeveGeo = new THREE.CylinderGeometry(0.006, 0.0055, 0.022, 8);
      const sleeve = new THREE.Mesh(sleeveGeo, shirtMat);
      sleeve.position.set(ax, 0.134, 0);
      sleeve.castShadow = true;
      group.add(sleeve);

      // 前臂與手 (膚色，自然垂放微前擺)
      const foreArmGeo = new THREE.CylinderGeometry(0.005, 0.0045, 0.026, 8);
      const foreArm = new THREE.Mesh(foreArmGeo, skinMat);
      foreArm.position.set(ax, 0.112, 0.002);
      foreArm.castShadow = true;
      group.add(foreArm);

      // 手掌小球
      const handGeo = new THREE.SphereGeometry(0.005, 8, 8);
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(ax, 0.096, 0.003);
      group.add(hand);
    });

    // ------------------------------------
    // 5. 頸部與頭部 (Y: 0.146m ~ 0.180m)
    // ------------------------------------
    // 頸部
    const neckGeo = new THREE.CylinderGeometry(0.006, 0.007, 0.010, 8);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, 0.148, 0);
    group.add(neck);

    // 頭部 (圓潤微橢圓體)
    const headGeo = new THREE.SphereGeometry(0.014, 16, 16);
    headGeo.scale(1.0, 1.15, 1.05); // 稍微修長自然比例
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.164, 0);
    head.castShadow = true;
    group.add(head);

    // ------------------------------------
    // 6. 俐落短髮造形 (側分/短髮蓋)
    // ------------------------------------
    const hairGeo = new THREE.SphereGeometry(0.0152, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
    hairGeo.scale(1.03, 1.12, 1.05);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 0.165, -0.001);
    hair.castShadow = true;
    group.add(hair);

    // 前額小劉海/旁分小飾塊
    const fringeGeo = new THREE.BoxGeometry(0.018, 0.006, 0.008);
    const fringe = new THREE.Mesh(fringeGeo, hairMat);
    fringe.position.set(0.002, 0.174, 0.011);
    group.add(fringe);

    // ------------------------------------
    // 7. 特色配件：時尚墨鏡 (Sunglasses)
    // ------------------------------------
    if (hasSunglasses) {
      const glassesGroup = new THREE.Group();
      const glassMat = this.getSunglassesMaterial();

      // 雙鏡片
      const lensGeo = new THREE.BoxGeometry(0.008, 0.0045, 0.003);
      const leftLens = new THREE.Mesh(lensGeo, glassMat);
      leftLens.position.set(-0.0055, 0, 0);
      const rightLens = new THREE.Mesh(lensGeo, glassMat);
      rightLens.position.set(0.0055, 0, 0);
      glassesGroup.add(leftLens, rightLens);

      // 鼻樑連桿
      const bridgeGeo = new THREE.BoxGeometry(0.004, 0.0015, 0.002);
      const bridge = new THREE.Mesh(bridgeGeo, glassMat);
      bridge.position.set(0, 0.001, 0);
      glassesGroup.add(bridge);

      // 鏡腳
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0015, 0.014), glassMat);
      legL.position.set(-0.010, 0, -0.006);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0015, 0.014), glassMat);
      legR.position.set(0.010, 0, -0.006);
      glassesGroup.add(legL, legR);

      glassesGroup.position.set(0, 0.166, 0.014);
      group.add(glassesGroup);
    }

    return group;
  }

  /**
   * 建立女性市民模型 (Female Citizen)
   * 身高約 0.168m，纖細優雅體態、俏麗丸子頭/波浪短髮/高馬尾、經典洋裝/短裙或合身長褲、白球鞋或高跟便鞋
   */
  public static createFemaleCitizen(options: CitizenAppearanceOptions = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Citizen_Female';

    const variant = options.variant ?? Math.floor(Math.random() * 4);
    const skinColor = options.skinTone ?? SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const hairColor = options.hairColor ?? HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
    const topColor = options.shirtColor ?? CLOTHING_COLORS.femaleTops[Math.floor(Math.random() * CLOTHING_COLORS.femaleTops.length)];
    const bottomColor = options.pantsColor ?? CLOTHING_COLORS.femaleBottoms[Math.floor(Math.random() * CLOTHING_COLORS.femaleBottoms.length)];
    const shoeColor = options.shoeColor ?? (variant === 0 ? 0xffffff : CLOTHING_COLORS.shoes[0]);

    const skinMat = this.getSkinMaterial(skinColor);
    const hairMat = this.getHairMaterial(hairColor);
    const topMat = this.getClothMaterial(topColor);
    const bottomMat = this.getClothMaterial(bottomColor);
    const shoeMat = shoeColor === 0xffffff ? this.getWhiteSneakerMaterial() : this.getClothMaterial(shoeColor);

    // 款式定義：
    // variant 0: 優雅純白洋裝 + 紅色細皮帶 (參考 #110 經典姿態)
    // variant 1: 薰衣草紫背心 + 粉嫩九分褲 + 手提小包 + 丸子頭 (參考 #107)
    // variant 2: 活力翠綠上衣 + 短裙 + 白球鞋 (參考 #102)
    // variant 3: 摩登黑色洋裝 + 金色腰帶 (參考 #117)
    const isDress = variant === 0 || variant === 3;
    const dressColor = variant === 0 ? 0xf8fafc : (variant === 3 ? 0x1e293b : topColor);
    const actualTopMat = isDress ? this.getClothMaterial(dressColor) : topMat;
    const actualBottomMat = isDress ? actualTopMat : bottomMat;

    // ------------------------------------
    // 1. 雙腳與鞋子 (Y: 0 ~ 0.012m)
    // ------------------------------------
    const stanceX = 0.013; // 女生自然優雅併腿站姿
    const footPositions = [-stanceX, stanceX];

    footPositions.forEach((fx) => {
      // 秀氣便鞋/厚底小白鞋
      const shoeGeo = new THREE.BoxGeometry(0.012, 0.010, 0.021);
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(fx, 0.005, 0.002);
      shoe.castShadow = true;
      group.add(shoe);
    });

    // ------------------------------------
    // 2. 雙腿與裙襬/長褲 (Y: 0.010m ~ 0.086m)
    // ------------------------------------
    const legRadius = 0.0048;

    if (isDress) {
      // 洋裝造型：雙腿為纖細膚色
      footPositions.forEach((fx) => {
        const bareLeg = new THREE.Mesh(new THREE.CylinderGeometry(legRadius, legRadius * 0.85, 0.060, 8), skinMat);
        bareLeg.position.set(fx, 0.010 + 0.030, 0);
        bareLeg.castShadow = true;
        group.add(bareLeg);
      });

      // A 字型傘狀裙襬 (A-line Flare Skirt, Y: 0.058m ~ 0.088m)
      const skirtGeo = new THREE.CylinderGeometry(0.018, 0.028, 0.032, 16);
      const skirt = new THREE.Mesh(skirtGeo, actualBottomMat);
      skirt.position.set(0, 0.072, 0);
      skirt.castShadow = true;
      group.add(skirt);
    } else if (variant === 2) {
      // 運動短裙/短褲 (膚色小腿 + 短裙)
      footPositions.forEach((fx) => {
        const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 0.9, legRadius * 0.8, 0.046, 8), skinMat);
        lowerLeg.position.set(fx, 0.010 + 0.023, 0);
        lowerLeg.castShadow = true;
        group.add(lowerLeg);
      });

      // 俏麗短裙
      const miniSkirtGeo = new THREE.CylinderGeometry(0.017, 0.024, 0.024, 16);
      const miniSkirt = new THREE.Mesh(miniSkirtGeo, actualBottomMat);
      miniSkirt.position.set(0, 0.074, 0);
      miniSkirt.castShadow = true;
      group.add(miniSkirt);
    } else {
      // 緊身九分褲 (粉嫩修身色，如 #107 薰衣草紫)
      footPositions.forEach((fx) => {
        const pantLeg = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 1.05, legRadius * 0.9, 0.072, 8), actualBottomMat);
        pantLeg.position.set(fx, 0.010 + 0.036, 0);
        pantLeg.castShadow = true;
        group.add(pantLeg);
      });

      const pelvisGeo = new THREE.BoxGeometry(0.034, 0.014, 0.022);
      const pelvis = new THREE.Mesh(pelvisGeo, actualBottomMat);
      pelvis.position.set(0, 0.084, 0);
      group.add(pelvis);
    }

    // ------------------------------------
    // 3. 纖細腰身與上衣 (Y: 0.088m ~ 0.138m)
    // ------------------------------------
    // 柔美沙漏腰身 (胸寬 0.038m，腰寬 0.032m，高 0.045m，厚 0.022m)
    const torsoGeo = new THREE.BoxGeometry(0.038, 0.045, 0.022);
    const torso = new THREE.Mesh(torsoGeo, actualTopMat);
    torso.position.set(0, 0.114, 0);
    torso.castShadow = true;
    group.add(torso);

    // 腰帶配件 (如 #110 紅色腰帶、#117 金色腰帶)
    if (isDress) {
      const beltColor = variant === 0 ? 0xdc2626 : 0xfbbf24; // 紅腰帶 vs 金腰帶
      const beltGeo = new THREE.BoxGeometry(0.039, 0.005, 0.023);
      const beltMat = this.getClothMaterial(beltColor);
      const belt = new THREE.Mesh(beltGeo, beltMat);
      belt.position.set(0, 0.092, 0);
      group.add(belt);
    }

    // ------------------------------------
    // 4. 手臂與優雅姿態 (微曲擺放在身側)
    // ------------------------------------
    const armX = 0.023;
    const armPositions = [-armX, armX];

    armPositions.forEach((ax, idx) => {
      // 纖細手臂 (女性無袖/削肩設計，展現陽光優雅感)
      const armGeo = new THREE.CylinderGeometry(0.0042, 0.0036, 0.046, 8);
      const arm = new THREE.Mesh(armGeo, skinMat);
      arm.position.set(ax, 0.114, 0);
      arm.castShadow = true;
      group.add(arm);

      // 手掌
      const handGeo = new THREE.SphereGeometry(0.0042, 8, 8);
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(ax, 0.088, 0.002);
      group.add(hand);

      // 手提小包 (如 #107 淑女粉紫手提包，拎在右手)
      if (idx === 1 && (variant === 1 || options.hasBag)) {
        const bagGeo = new THREE.BoxGeometry(0.014, 0.016, 0.008);
        const bagMat = this.getClothMaterial(0xec4899); // 亮麗洋紅皮包
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.set(ax + 0.004, 0.076, 0.002);
        bag.castShadow = true;
        group.add(bag);

        // 提把
        const handleGeo = new THREE.TorusGeometry(0.005, 0.0012, 6, 12, Math.PI);
        const handle = new THREE.Mesh(handleGeo, bagMat);
        handle.rotation.z = Math.PI;
        handle.position.set(ax + 0.004, 0.086, 0.002);
        group.add(handle);
      }
    });

    // ------------------------------------
    // 5. 頸部與頭部 (Y: 0.136m ~ 0.170m)
    // ------------------------------------
    const neckGeo = new THREE.CylinderGeometry(0.0048, 0.0055, 0.010, 8);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, 0.140, 0);
    group.add(neck);

    // 精巧鵝蛋臉
    const headGeo = new THREE.SphereGeometry(0.013, 16, 16);
    headGeo.scale(0.96, 1.12, 1.0);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.155, 0);
    head.castShadow = true;
    group.add(head);

    // ------------------------------------
    // 6. 女性經典髮型 (高丸子頭 / 鮑伯短髮 / 高馬尾)
    // ------------------------------------
    const hairCapGeo = new THREE.SphereGeometry(0.0142, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65);
    hairCapGeo.scale(1.0, 1.12, 1.05);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.156, -0.001);
    hairCap.castShadow = true;
    group.add(hairCap);

    if (variant === 1 || variant === 2) {
      // 俏麗高丸子頭 (Top Bun, 參考 #101 / #107)
      const bunGeo = new THREE.SphereGeometry(0.0075, 12, 12);
      bunGeo.scale(1.1, 0.95, 1.0);
      const bun = new THREE.Mesh(bunGeo, hairMat);
      bun.position.set(0, 0.173, -0.003);
      bun.castShadow = true;
      group.add(bun);
    } else {
      // 氣質微彎齊肩鮑伯波浪髮 (Bob Cut, 參考 #110 / #115)
      const bobLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.018, 8), hairMat);
      bobLeft.position.set(-0.011, 0.150, -0.002);
      const bobRight = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.018, 8), hairMat);
      bobRight.position.set(0.011, 0.150, -0.002);
      group.add(bobLeft, bobRight);
    }

    return group;
  }

  // ==========================================
  // 展示台與車輛比例對照組
  // ==========================================

  /**
   * 建立市民與車輛身高尺寸比例對照組 (Lineup Showcase)
   * 包含：
   * - 現代自用轎車 (高度 0.142m，寬度 0.20m，長度 0.37m)
   * - 男性市民基礎款 (高度約 0.178m，頭頂略高於車頂，完美還原真實成人與轎車比例)
   * - 女性市民基礎款 (高度約 0.168m，優雅傘狀洋裝與厚底小白鞋)
   * - 標尺指示與底座
   */
  public static createLineupShowcase(): THREE.Group {
    const showcase = new THREE.Group();
    showcase.name = 'CitizenCar_LineupShowcase';

    // 1. 車輛 (放置在中心偏左，X = -0.25)
    const car = VehicleModelFactory.createVehicle(0x0284c7);
    car.position.set(-0.25, 0.0, 0);
    showcase.add(car);

    // 2. 男性市民 (站立在車輛身旁，X = 0.08)
    const male = this.createMaleCitizen({ variant: 0, shirtColor: 0x60a5fa, pantsColor: 0x1e293b });
    male.position.set(0.08, 0, 0);
    showcase.add(male);

    // 3. 女性市民 (站立在男性身旁，X = 0.18)
    const female = this.createFemaleCitizen({ variant: 0, shirtColor: 0xf8fafc });
    female.position.set(0.18, 0, 0);
    showcase.add(female);

    // 4. 時尚墨鏡男 (X = 0.28)
    const trendyMale = this.createMaleCitizen({ variant: 1, shirtColor: 0x06b6d4, pantsColor: 0xef4444, hasSunglasses: true });
    trendyMale.position.set(0.28, 0, 0);
    showcase.add(trendyMale);

    // 5. 淑女包包女 (X = 0.38)
    const bagFemale = this.createFemaleCitizen({ variant: 1, shirtColor: 0xc084fc, pantsColor: 0xc084fc, hasBag: true });
    bagFemale.position.set(0.38, 0, 0);
    showcase.add(bagFemale);

    return showcase;
  }
}
