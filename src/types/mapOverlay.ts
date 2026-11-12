/**
 * 城市地圖檢視模式 (Map Overlay Modes)
 */
export enum MapOverlayMode {
  Normal = 'Normal',                     // 標準全彩渲染模式
  Traffic = 'Traffic',                   // 交通流量/路段擁擠度視圖 (綠 -> 黃 -> 紅)
  Satisfaction = 'Satisfaction',         // 市民滿意度視圖 (紅 -> 綠)
  LandValue = 'LandValue',               // 地價高低熱度圖 (藍 -> 亮金)
  Pollution = 'Pollution',               // 工業與交通污染圖 (灰綠 -> 毒霧棕)
  FireRisk = 'FireRisk',                 // 火災風險與消防覆蓋圖
  Zoning = 'Zoning',                     // 土地規劃分區色塊圖
}
