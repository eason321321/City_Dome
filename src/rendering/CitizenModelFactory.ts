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
 * 市民可動關節節點參照結構 (支援人體工學骨架動畫)
 */
export interface CitizenLimbNodes {
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  torsoGroup: THREE.Group;
  baseY: number;
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
 * 市民上衣/洋裝色彩調色盤
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
    0xffffff, // 現代純白厚底球鞋 (White Sneakers)
    0x18181b, // 深黑便鞋/皮鞋
    0x78350f, // 暖棕休閒平底鞋
    0xd97706, // 焦糖色休閒涼鞋
  ],
};

/**
 * 程式化低多邊形市民模型與動畫工廠 (CitizenModelFactory)
 * 遵循專案「物件程式化 Procedural Low-Poly Primitives」定案規範：
 * 1. 區分男性 (Male) 與女性 (Female) 基礎體態與髮型輪廓。
 * 2. 精確依據轎車高度 (0.142m) 推算市民身高比例 (男高 0.178m，女高 0.168m，頭身比約 6.5 頭身)。
 * 3. 寬度約 0.065m，與 0.22m 人行道完美相稱。
 * 4. 具備骨架層級結構 (雙腿、雙臂、軀幹節點獨立)，男女共用通用走路動畫系統 (自然擺腿、反相擺臂、骨盆顛簸)。
 */
export class CitizenModelFactory {
  // 共享材質快取
  private static skinMaterials: Map<number, THREE.MeshStandardMaterial> = new Map();
  private static hairMaterials: Map<number, THREE.MeshStandardMaterial> = new Map();
  private static clothMaterials: Map<number, THREE.MeshStandardMaterial> = new Map();

  // 專屬材質
  private static whiteSneakerMat: THREE.MeshStandardMaterial | null = null;
  private static sunglassesMat: THREE.MeshStandardMaterial | null = null;

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
  // 核心生成方法 (含可動關節階層綁定)
  // ==========================================

  public static createCitizen(options: CitizenAppearanceOptions = {}): THREE.Group {
    const gender: CitizenGender = options.gender ?? (Math.random() < 0.5 ? 'male' : 'female');
    if (gender === 'male') {
      return this.createMaleCitizen(options);
    } else {
      return this.createFemaleCitizen(options);
    }
  }

  /**
   * 建立男性市民模型 (Male Citizen - 支援動畫關節)
   * 身高約 0.178m，倒梯形健美微縮體格、短髮、休閒上衣、短褲或長褲、厚底球鞋
   */
  public static createMaleCitizen(options: CitizenAppearanceOptions = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Citizen_Male';

    const variant = options.variant ?? Math.floor(Math.random() * 3);
    const skinColor = options.skinTone ?? SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const hairColor = options.hairColor ?? HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
    const shirtColor = options.shirtColor ?? CLOTHING_COLORS.maleTops[Math.floor(Math.random() * CLOTHING_COLORS.maleTops.length)];
    const pantsColor = options.pantsColor ?? CLOTHING_COLORS.maleBottoms[Math.floor(Math.random() * CLOTHING_COLORS.maleBottoms.length)];
    const shoeColor = options.shoeColor ?? CLOTHING_COLORS.shoes[0];

    const skinMat = this.getSkinMaterial(skinColor);
    const hairMat = this.getHairMaterial(hairColor);
    const shirtMat = this.getClothMaterial(shirtColor);
    const pantsMat = this.getClothMaterial(pantsColor);
    const shoeMat = shoeColor === 0xffffff ? this.getWhiteSneakerMaterial() : this.getClothMaterial(shoeColor);

    const isWearingShorts = variant !== 2;
    const hasSunglasses = options.hasSunglasses ?? (variant === 1 || Math.random() < 0.25);

    const stanceX = 0.016;
    const hipY = 0.088; // 髖關節旋轉支點高度

    // ------------------------------------
    // 1. 雙腿關節群組 (LeftLeg & RightLeg)
    // ------------------------------------
    const createMaleLeg = (name: string, posX: number): THREE.Group => {
      const legGroup = new THREE.Group();
      legGroup.name = name;
      legGroup.position.set(posX, hipY, 0);

      // 球鞋 (相對於髖關節支點)
      const shoeGeo = new THREE.BoxGeometry(0.014, 0.012, 0.024);
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(0, 0.006 - hipY, 0.003);
      shoe.castShadow = true;
      legGroup.add(shoe);

      // 鞋底邊條膠框
      const soleGeo = new THREE.BoxGeometry(0.015, 0.003, 0.025);
      const soleMat = this.getClothMaterial(0xe2e8f0);
      const sole = new THREE.Mesh(soleGeo, soleMat);
      sole.position.set(0, 0.0015 - hipY, 0.003);
      legGroup.add(sole);

      const legRadius = 0.006;
      if (isWearingShorts) {
        // 小腿 (膚色)
        const lowerLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(legRadius * 0.95, legRadius * 0.85, 0.046, 8),
          skinMat
        );
        lowerLeg.position.set(0, 0.035 - hipY, 0);
        lowerLeg.castShadow = true;
        legGroup.add(lowerLeg);

        // 短褲管 (褲色)
        const shortsLegGeo = new THREE.CylinderGeometry(legRadius * 1.35, legRadius * 1.2, 0.034, 8);
        const shortsLeg = new THREE.Mesh(shortsLegGeo, pantsMat);
        shortsLeg.position.set(0, 0.073 - hipY, 0);
        shortsLeg.castShadow = true;
        legGroup.add(shortsLeg);
      } else {
        // 全長休閒長褲
        const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 0.9, 0.076, 8);
        const fullLeg = new THREE.Mesh(legGeo, pantsMat);
        fullLeg.position.set(0, 0.050 - hipY, 0);
        fullLeg.castShadow = true;
        legGroup.add(fullLeg);
      }

      return legGroup;
    };

    const leftLegGroup = createMaleLeg('LeftLeg', -stanceX);
    const rightLegGroup = createMaleLeg('RightLeg', stanceX);
    group.add(leftLegGroup);
    group.add(rightLegGroup);

    // ------------------------------------
    // 2. 軀幹、骨盆與頭部主群組 (TorsoGroup)
    // ------------------------------------
    const torsoGroup = new THREE.Group();
    torsoGroup.name = 'TorsoGroup';
    torsoGroup.position.set(0, 0, 0);

    // 骨盆褲頭
    const pelvisGeo = new THREE.BoxGeometry(0.040, 0.016, 0.024);
    const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
    pelvis.position.set(0, 0.090, 0);
    pelvis.castShadow = true;
    torsoGroup.add(pelvis);

    // 倒梯形上身
    const torsoGeo = new THREE.BoxGeometry(0.048, 0.048, 0.026);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.set(0, 0.122, 0);
    torso.castShadow = true;
    torsoGroup.add(torso);

    if (variant === 1) {
      // Polo 領口飾邊
      const collarGeo = new THREE.BoxGeometry(0.024, 0.005, 0.028);
      const collar = new THREE.Mesh(collarGeo, this.getClothMaterial(0xffffff));
      collar.position.set(0, 0.146, 0);
      torsoGroup.add(collar);
    }

    // 頸部
    const neckGeo = new THREE.CylinderGeometry(0.006, 0.007, 0.010, 8);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, 0.148, 0);
    torsoGroup.add(neck);

    // 頭部
    const headGeo = new THREE.SphereGeometry(0.014, 16, 16);
    headGeo.scale(1.0, 1.15, 1.05);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.164, 0);
    head.castShadow = true;
    torsoGroup.add(head);

    // 俐落短髮造形
    const hairGeo = new THREE.SphereGeometry(0.0152, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
    hairGeo.scale(1.03, 1.12, 1.05);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 0.165, -0.001);
    hair.castShadow = true;
    torsoGroup.add(hair);

    const fringeGeo = new THREE.BoxGeometry(0.018, 0.006, 0.008);
    const fringe = new THREE.Mesh(fringeGeo, hairMat);
    fringe.position.set(0.002, 0.174, 0.011);
    torsoGroup.add(fringe);

    // 墨鏡配件
    if (hasSunglasses) {
      const glassesGroup = new THREE.Group();
      const glassMat = this.getSunglassesMaterial();

      const lensGeo = new THREE.BoxGeometry(0.008, 0.0045, 0.003);
      const leftLens = new THREE.Mesh(lensGeo, glassMat);
      leftLens.position.set(-0.0055, 0, 0);
      const rightLens = new THREE.Mesh(lensGeo, glassMat);
      rightLens.position.set(0.0055, 0, 0);
      glassesGroup.add(leftLens, rightLens);

      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0015, 0.002), glassMat);
      bridge.position.set(0, 0.001, 0);
      glassesGroup.add(bridge);

      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0015, 0.014), glassMat);
      legL.position.set(-0.010, 0, -0.006);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0015, 0.014), glassMat);
      legR.position.set(0.010, 0, -0.006);
      glassesGroup.add(legL, legR);

      glassesGroup.position.set(0, 0.166, 0.014);
      torsoGroup.add(glassesGroup);
    }

    // ------------------------------------
    // 3. 雙手臂關節群組 (LeftArm & RightArm)
    // ------------------------------------
    const armX = 0.029;
    const shoulderY = 0.138; // 肩關節旋轉支點高度

    const createMaleArm = (name: string, posX: number): THREE.Group => {
      const armGroup = new THREE.Group();
      armGroup.name = name;
      armGroup.position.set(posX, shoulderY, 0);

      // 上臂/短袖袖口
      const sleeveGeo = new THREE.CylinderGeometry(0.006, 0.0055, 0.022, 8);
      const sleeve = new THREE.Mesh(sleeveGeo, shirtMat);
      sleeve.position.set(0, 0.134 - shoulderY, 0);
      sleeve.castShadow = true;
      armGroup.add(sleeve);

      // 前臂 (膚色)
      const foreArmGeo = new THREE.CylinderGeometry(0.005, 0.0045, 0.026, 8);
      const foreArm = new THREE.Mesh(foreArmGeo, skinMat);
      foreArm.position.set(0, 0.112 - shoulderY, 0.002);
      foreArm.castShadow = true;
      armGroup.add(foreArm);

      // 手掌小球
      const handGeo = new THREE.SphereGeometry(0.005, 8, 8);
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(0, 0.096 - shoulderY, 0.003);
      armGroup.add(hand);

      return armGroup;
    };

    const leftArmGroup = createMaleArm('LeftArm', -armX);
    const rightArmGroup = createMaleArm('RightArm', armX);
    torsoGroup.add(leftArmGroup);
    torsoGroup.add(rightArmGroup);

    group.add(torsoGroup);

    // 綁定關節節點參照
    const limbs: CitizenLimbNodes = {
      leftLeg: leftLegGroup,
      rightLeg: rightLegGroup,
      leftArm: leftArmGroup,
      rightArm: rightArmGroup,
      torsoGroup,
      baseY: 0,
    };
    group.userData = {
      isCitizen: true,
      gender: 'male',
      limbs,
    };

    return group;
  }

  /**
   * 建立女性市民模型 (Female Citizen - 支援動畫關節)
   * 身高約 0.168m，纖細體態、丸子頭/鮑伯頭、洋裝/短裙或合身長褲、白球鞋
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

    const isDress = variant === 0 || variant === 3;
    const dressColor = variant === 0 ? 0xf8fafc : (variant === 3 ? 0x1e293b : topColor);
    const actualTopMat = isDress ? this.getClothMaterial(dressColor) : topMat;
    const actualBottomMat = isDress ? actualTopMat : bottomMat;

    const stanceX = 0.013;
    const hipY = 0.082; // 女性髖關節旋轉支點

    // ------------------------------------
    // 1. 雙腿關節群組 (LeftLeg & RightLeg)
    // ------------------------------------
    const legRadius = 0.0048;

    const createFemaleLeg = (name: string, posX: number): THREE.Group => {
      const legGroup = new THREE.Group();
      legGroup.name = name;
      legGroup.position.set(posX, hipY, 0);

      // 小白鞋
      const shoeGeo = new THREE.BoxGeometry(0.012, 0.010, 0.021);
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(0, 0.005 - hipY, 0.002);
      shoe.castShadow = true;
      legGroup.add(shoe);

      if (isDress) {
        // 洋裝纖細膚色雙腿
        const bareLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(legRadius, legRadius * 0.85, 0.060, 8),
          skinMat
        );
        bareLeg.position.set(0, 0.040 - hipY, 0);
        bareLeg.castShadow = true;
        legGroup.add(bareLeg);
      } else if (variant === 2) {
        // 運動短裙膚色小腿
        const lowerLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(legRadius * 0.9, legRadius * 0.8, 0.046, 8),
          skinMat
        );
        lowerLeg.position.set(0, 0.033 - hipY, 0);
        lowerLeg.castShadow = true;
        legGroup.add(lowerLeg);
      } else {
        // 合身九分修身長褲
        const pantLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(legRadius * 1.05, legRadius * 0.9, 0.072, 8),
          actualBottomMat
        );
        pantLeg.position.set(0, 0.046 - hipY, 0);
        pantLeg.castShadow = true;
        legGroup.add(pantLeg);
      }

      return legGroup;
    };

    const leftLegGroup = createFemaleLeg('LeftLeg', -stanceX);
    const rightLegGroup = createFemaleLeg('RightLeg', stanceX);
    group.add(leftLegGroup);
    group.add(rightLegGroup);

    // ------------------------------------
    // 2. 軀幹、裙襬與頭部主群組 (TorsoGroup)
    // ------------------------------------
    const torsoGroup = new THREE.Group();
    torsoGroup.name = 'TorsoGroup';
    torsoGroup.position.set(0, 0, 0);

    // 裙襬或褲頭骨盆 (隨軀幹律動)
    if (isDress) {
      const skirtGeo = new THREE.CylinderGeometry(0.018, 0.028, 0.032, 16);
      const skirt = new THREE.Mesh(skirtGeo, actualBottomMat);
      skirt.position.set(0, 0.072, 0);
      skirt.castShadow = true;
      torsoGroup.add(skirt);
    } else if (variant === 2) {
      const miniSkirtGeo = new THREE.CylinderGeometry(0.017, 0.024, 0.024, 16);
      const miniSkirt = new THREE.Mesh(miniSkirtGeo, actualBottomMat);
      miniSkirt.position.set(0, 0.074, 0);
      miniSkirt.castShadow = true;
      torsoGroup.add(miniSkirt);
    } else {
      const pelvisGeo = new THREE.BoxGeometry(0.034, 0.014, 0.022);
      const pelvis = new THREE.Mesh(pelvisGeo, actualBottomMat);
      pelvis.position.set(0, 0.084, 0);
      torsoGroup.add(pelvis);
    }

    // 柔美沙漏腰身上衣
    const torsoGeo = new THREE.BoxGeometry(0.038, 0.045, 0.022);
    const torso = new THREE.Mesh(torsoGeo, actualTopMat);
    torso.position.set(0, 0.114, 0);
    torso.castShadow = true;
    torsoGroup.add(torso);

    // 洋裝腰帶
    if (isDress) {
      const beltColor = variant === 0 ? 0xdc2626 : 0xfbbf24;
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.039, 0.005, 0.023), this.getClothMaterial(beltColor));
      belt.position.set(0, 0.092, 0);
      torsoGroup.add(belt);
    }

    // 頸部
    const neckGeo = new THREE.CylinderGeometry(0.0048, 0.0055, 0.010, 8);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, 0.140, 0);
    torsoGroup.add(neck);

    // 精巧鵝蛋臉
    const headGeo = new THREE.SphereGeometry(0.013, 16, 16);
    headGeo.scale(0.96, 1.12, 1.0);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 0.155, 0);
    head.castShadow = true;
    torsoGroup.add(head);

    // 髮型 (丸子頭 / 鮑伯短髮)
    const hairCapGeo = new THREE.SphereGeometry(0.0142, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65);
    hairCapGeo.scale(1.0, 1.12, 1.05);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.156, -0.001);
    hairCap.castShadow = true;
    torsoGroup.add(hairCap);

    if (variant === 1 || variant === 2) {
      const bunGeo = new THREE.SphereGeometry(0.0075, 12, 12);
      bunGeo.scale(1.1, 0.95, 1.0);
      const bun = new THREE.Mesh(bunGeo, hairMat);
      bun.position.set(0, 0.173, -0.003);
      bun.castShadow = true;
      torsoGroup.add(bun);
    } else {
      const bobLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.018, 8), hairMat);
      bobLeft.position.set(-0.011, 0.150, -0.002);
      const bobRight = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.018, 8), hairMat);
      bobRight.position.set(0.011, 0.150, -0.002);
      torsoGroup.add(bobLeft, bobRight);
    }

    // ------------------------------------
    // 3. 雙手臂關節群組 (LeftArm & RightArm)
    // ------------------------------------
    const armX = 0.023;
    const shoulderY = 0.130; // 女性肩關節支點高度

    const createFemaleArm = (name: string, posX: number, isRight: boolean): THREE.Group => {
      const armGroup = new THREE.Group();
      armGroup.name = name;
      armGroup.position.set(posX, shoulderY, 0);

      // 纖細手臂 (無袖/削肩設計)
      const armGeo = new THREE.CylinderGeometry(0.0042, 0.0036, 0.046, 8);
      const arm = new THREE.Mesh(armGeo, skinMat);
      arm.position.set(0, 0.114 - shoulderY, 0);
      arm.castShadow = true;
      armGroup.add(arm);

      // 手掌
      const handGeo = new THREE.SphereGeometry(0.0042, 8, 8);
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(0, 0.088 - shoulderY, 0.002);
      armGroup.add(hand);

      // 右手提拿手提包 (隨右手擺動同步律動)
      if (isRight && (variant === 1 || options.hasBag)) {
        const bagGeo = new THREE.BoxGeometry(0.014, 0.016, 0.008);
        const bagMat = this.getClothMaterial(0xec4899);
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.set(0.004, 0.076 - shoulderY, 0.002);
        bag.castShadow = true;
        armGroup.add(bag);

        const handleGeo = new THREE.TorusGeometry(0.005, 0.0012, 6, 12, Math.PI);
        const handle = new THREE.Mesh(handleGeo, bagMat);
        handle.rotation.z = Math.PI;
        handle.position.set(0.004, 0.086 - shoulderY, 0.002);
        armGroup.add(handle);
      }

      return armGroup;
    };

    const leftArmGroup = createFemaleArm('LeftArm', -armX, false);
    const rightArmGroup = createFemaleArm('RightArm', armX, true);
    torsoGroup.add(leftArmGroup);
    torsoGroup.add(rightArmGroup);

    group.add(torsoGroup);

    const limbs: CitizenLimbNodes = {
      leftLeg: leftLegGroup,
      rightLeg: rightLegGroup,
      leftArm: leftArmGroup,
      rightArm: rightArmGroup,
      torsoGroup,
      baseY: 0,
    };
    group.userData = {
      isCitizen: true,
      gender: 'female',
      limbs,
    };

    return group;
  }

  // ==========================================
  // 走路動畫核心演算法 (男女通用)
  // ==========================================

  /**
   * 驅動市民自然人體工學走路動畫
   * 依據人體生物力學：雙腿交替擺動、雙臂反相擺動、雙倍頻骨盆垂直顛簸、以及自然的軀幹重心轉移微搖。
   *
   * @param citizen 市民 3D 模型實體
   * @param time 累積時間 (秒)
   * @param speed 步行頻率 (預設 7.5 rad/s，約 1.2 個完整雙步循環/秒)
   * @param stride 步幅係數 (預設 1.0)
   */
  public static animateCitizenWalk(
    citizen: THREE.Group,
    time: number,
    speed: number = 7.5,
    stride: number = 1.0
  ): void {
    const limbs = citizen.userData?.limbs as CitizenLimbNodes | undefined;
    if (!limbs) return;

    const phase = time * speed;
    const maxLegAngle = 0.42 * stride;  // 腿部最大前後擺角約 24 度
    const maxArmAngle = 0.36 * stride;  // 手臂最大前後擺角約 20 度
    const bobAmp = 0.0035 * stride;     // 骨盆垂直起伏幅度約 3.5mm

    // 1. 雙腿前後交替對稱擺動
    limbs.leftLeg.rotation.x = Math.sin(phase) * maxLegAngle;
    limbs.rightLeg.rotation.x = -Math.sin(phase) * maxLegAngle;

    // 2. 雙手臂反相前後擺動 (人體工學平衡機制)
    limbs.leftArm.rotation.x = -Math.sin(phase) * maxArmAngle;
    limbs.rightArm.rotation.x = Math.sin(phase) * maxArmAngle;

    // 手臂自然微向外/向內微傾斜，防擺動時擦碰大腿
    limbs.leftArm.rotation.z = 0.035;
    limbs.rightArm.rotation.z = -0.035;

    // 3. 軀幹垂直顛簸起伏 (每跨一步起伏一次，頻率為雙倍步頻)
    limbs.torsoGroup.position.y = limbs.baseY + Math.abs(Math.sin(phase)) * bobAmp;

    // 4. 重心轉移引起的微幅肩胸側偏與微幅自轉 (Yaw & Roll)
    limbs.torsoGroup.rotation.y = Math.sin(phase) * 0.035 * stride;
    limbs.torsoGroup.rotation.z = -Math.sin(phase) * 0.015 * stride;
  }

  /**
   * 重設市民站姿為靜止預設體態 (歸零所有關節旋轉與位移)
   */
  public static resetCitizenPose(citizen: THREE.Group): void {
    const limbs = citizen.userData?.limbs as CitizenLimbNodes | undefined;
    if (!limbs) return;

    limbs.leftLeg.rotation.set(0, 0, 0);
    limbs.rightLeg.rotation.set(0, 0, 0);
    limbs.leftArm.rotation.set(0, 0, 0);
    limbs.rightArm.rotation.set(0, 0, 0);
    limbs.torsoGroup.position.y = limbs.baseY;
    limbs.torsoGroup.rotation.set(0, 0, 0);
  }

  /**
   * 批次驅動任一群組物件樹內部所有市民之走路動畫
   */
  public static animateAllCitizens(
    root: THREE.Object3D,
    time: number,
    speed: number = 7.5,
    stride: number = 1.0
  ): void {
    root.traverse((obj) => {
      if (obj.userData?.limbs) {
        this.animateCitizenWalk(obj as THREE.Group, time, speed, stride);
      }
    });
  }

  /**
   * 批次重設任一群組物件樹內部所有市民為靜止站姿
   */
  public static resetAllCitizens(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (obj.userData?.limbs) {
        this.resetCitizenPose(obj as THREE.Group);
      }
    });
  }

  // ==========================================
  // 展示台與車輛比例對照組
  // ==========================================

  /**
   * 建立市民走路步態雙人展示台 (Walking Animation Showcase)
   * 包含石板步道基座、男女市民並肩齊步走姿態
   */
  public static createWalkShowcase(): THREE.Group {
    const showcase = new THREE.Group();
    showcase.name = 'Citizen_WalkShowcase';

    // 1. 人行道景觀石板基座
    const baseGeo = new THREE.BoxGeometry(0.36, 0.018, 0.44);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xd6cec2, roughness: 0.8, metalness: 0.08 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.009;
    base.receiveShadow = true;
    showcase.add(base);

    // 路緣石條
    const curbGeo = new THREE.BoxGeometry(0.38, 0.024, 0.018);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
    const curbFront = new THREE.Mesh(curbGeo, curbMat);
    curbFront.position.set(0, 0.012, 0.22);
    showcase.add(curbFront);

    // 2. 男性市民 (位於左側 X = -0.07m，面向 +Z)
    const male = this.createMaleCitizen({ variant: 0, shirtColor: 0x60a5fa, pantsColor: 0x1e293b });
    male.position.set(-0.07, 0.018, 0);
    showcase.add(male);

    // 3. 女性市民 (位於右側 X = +0.07m，面向 +Z)
    const female = this.createFemaleCitizen({ variant: 0, shirtColor: 0xf8fafc });
    female.position.set(0.07, 0.018, 0);
    showcase.add(female);

    return showcase;
  }

  /**
   * 建立市民與車輛 1:1 比例對照排陣展台
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
