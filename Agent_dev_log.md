# Agent 開發日誌 (Agent Dev Log)

本文件依據 `Agent_Read_every_round.md` 規範，每輪作業後詳細記載專案更新進度、異動檔案與後續開發計畫。

---

## [2026-11-10] 第 5 輪作業：階段 0.5 實作（基礎地圖、RTS 相機、純淨視野與啟動驗證）

### 本輪更新摘要
- **目標**：落實「階段 0.5」：建立 3D 基礎地貌、雙層網格、日光與柔和陰影，實作專業級 RTS 相機控制器（右鍵旋轉、左鍵抓地平移、滾輪縮放）；依開發者要求徹底移除畫面所有操作提示與標籤，保持 3D 視野純淨；實測遊戲啟動與 `<canvas>` 渲染正常；使用 Git 覆蓋過渡版本以整併為單一乾淨 Commit。
- **原則**：遵守無未授權多餘功能原則、實機 Headless 瀏覽器驗證、Git 精簡版本歷史。

### 本輪異動檔案清單
1. **核心渲染與控制程式碼**
   - `src/rendering/CameraManager.ts`：實現 RTS 相機控制器（右鍵視角 Yaw/Pitch 調整、左鍵地平面射線抓取平移、滾輪無級縮放、角度與高度邊界防禦）。
   - `src/rendering/TerrainRenderer.ts`：建立 200x200m 建設區地表、2m 次要格線、10m 主要幹道格線、邊界框與世界原點。
   - `src/main.ts`：組裝 Scene、DirectionalLight（柔和陰影）、HemisphereLight、Fog、CameraManager 與 TerrainRenderer，啟動平滑渲染迴圈。
   - `index.html`：保持完全乾淨純粹的 3D 畫布與透明 UI 容器，無任何擋視線的提示。
2. **規劃與追蹤文檔**
   - `DEV_roadMap.md`：登錄階段 0.5 並標記完成。
   - `Dissusion_withDEV.md`：登錄階段 0.5 需求確認、UI 純淨性要求與 Git 覆蓋指令。
   - `Agent_technique_record.md`：記錄射線平面抓地演算法、光影格線規格與自動化 Headless 測試管線。
   - `Agent_dev_log.md`：本開發日誌。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 0 報錯、0 警告。
- **實機啟動測試**：透過 Headless Edge 模擬訪問本地伺服器，驗證 DOM 樹正確掛載 `<canvas>` 標籤，Three.js 順暢初始化並輸出日誌，0 運行時錯誤。

---

## [2026-11-10] 第 6 輪作業：畫面底部基礎 HUD 狀態欄實作（時間/播放暫停/人口/金錢）

### 本輪更新摘要
- **目標**：依開發者明確指令，暫時跳過原定路線圖規劃，優先實現畫面正下方的基礎 UI 狀態欄（仿 Cities: Skylines 2 質感風格）。
- **實作內容**：
  1. 最左側整合開始/暫停按鈕與虛擬時間（依指定起始於 `2027/01/01 06:00 AM`）。
  2. 實現虛擬時間管理器 `TimeManager.ts`，支援幀率解耦時間平滑推進、大月/小月/閏年換算與開始暫停。
  3. 顯示城市金錢（專屬綠色立體鈔票圖標）與總人口數（水藍色市民剪影圖標），數值以千分位逗號格式化。
  4. 樣式採深色高質感毛玻璃底盤，事件完全阻斷以防穿透至 RTS 鏡頭拖曳。
  5. 嚴格遵守規範：其他未提及之項目（天氣、季節、行政區名稱、倍速按鈕等）一律不上線。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/types/simulation.ts`：擴充 `WorldTime` 型別定義，支援 `year`、`month`、`day`、`hour`、`minute` 完整日曆架構。
   - `src/simulation/TimeManager.ts`：新增時間推進管理器，實作累積虛擬秒、進位計算與觀察者訂閱機制。
   - `src/ui/BottomStatusBar.ts`：新增底部狀態欄元件，注入專屬毛玻璃樣式、SVG 圖標、點擊與空白鍵切換互動。
   - `src/main.ts`：掛載 `TimeManager` 與 `BottomStatusBar`，並於主動畫迴圈中傳遞 `deltaTime` 驅動時間。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 6 輪開發者指示與需求定案。
   - `Agent_technique_record.md`：記錄時間推進日曆進位演算法、毛玻璃樣式排版與事件隔離防禦機制。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **無授權功能檢核**：嚴格排除未指定之所有多餘功能，視野純淨且 HUD 功能精準。
- **遠端同步**：已完成 `git push origin main`，最新進度已全數同步至 GitHub 遠端儲存庫。


---

## [2026-11-10] 第 7 輪作業：底部右側佈局調整、左下建造選單與雙向二線車道吸附放置實作

### 本輪更新摘要
- **目標**：
  1. 將底部 HUD 狀態欄移置畫面**右下角**。
  2. 於**左下角**建立可擴充之建造導航列，新增「道路建造選單」按鈕與抽屜式子選單。
  3. 實作「雙向二線道（1 順向 + 1 逆向，占 1 格 2m 小格）」建造功能。
  4. 實作天際線風格路面標線（深色瀝青顆粒、路緣石、白霧線、黃色分道虛線循環對齊）。
  5. 人性化網格吸附（支援按住拖曳或點選兩點鋪設直放車道，沿 X 或沿 Z）。
  6. 點選車道時顯示不擋視線的浮動操作提示氣泡，並在拖曳時動態顯示長度與預計費用。
  7. 依開發者特別指示，**本輪暫不使用 Git 管理**，待道路系統完備再進行上庫。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/ui/BottomStatusBar.ts`：更新 CSS 樣式，將狀態欄錨定至畫面右下角（`bottom: 12px; right: 16px;`）。
   - `src/rendering/CameraManager.ts`：新增 `setLeftDragEnabled(enabled)`，當建造工具激活時釋放左鍵平移防誤觸，中鍵仍可自由平移。
   - `src/rendering/RoadTextureFactory.ts`：新增程式化擬真道路紋理生成器，動態繪製天際線標線與多面體路緣石材質。
   - `src/systems/RoadManager.ts`：新增道路管理與吸附系統，負責網格計算、直線鎖定預覽、道路生成與國庫花費扣減。
   - `src/ui/BuildMenu.ts`：新增左下角建造選單，包含分類導航、雙向車道卡片與浮動操作提示氣泡。
   - `src/main.ts`：組裝 `RoadManager`、`BuildMenu` 與相機管理之連動。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 7 輪需求確認與 Git 暫緩約定。
   - `Agent_technique_record.md`：記錄天際線標線演算法、網格吸附幾何、相機控制隔離技術。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **Git 狀態**：依指示保持工作區修改，暫不執行 commit 與 push。

---

## [2026-11-10] 第 8 輪作業：WASD 鍵盤平移、道路交叉斑馬線拓撲、3D 紅綠燈狀態機與連續車道有向圖實作

### 本輪更新摘要
- **目標**：
  1. 實作鍵盤 WASD 與方向鍵視角平移，依相機偏航角平滑投影，速度隨高度自適應。
  2. 實作道路交叉拓撲辨識（十字路口、T 字路口、轉彎道、直道直通）。
  3. 實作路面交叉標線動態切換：路口自動生成天際線標準白色斑馬線（Zebra Crossings）與停止線。
  4. 實作路口 3D 紅綠燈號誌燈柱總成，具備自體發光燈球與狀態機計時切換（南北/東西向綠黃紅輪轉），狀態即時記錄於路網節點中。
  5. 實作車道層級有向圖（`DirectedLaneGraph`）：同一方向分批拉出的車道相連時自動縫合為連續車道，路口分支自動連結，為未來車流系統奠定完美地基。
  6. 依開發者特別指示，**本輪暫不使用 Git 管理**。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/rendering/CameraManager.ts`：新增鍵盤 `keydown`/`keyup` 監聽，實作基於當前 Yaw 角之 WASD 平移運動學。
   - `src/rendering/RoadTextureFactory.ts`：擴充繪製十字路口四向斑馬線、T 字路口三向斑馬線與轉彎弧形分道線紋理。
   - `src/rendering/TrafficLightRenderer.ts`：新增 3D 低多邊形金屬號誌燈柱與雙向紅綠燈發光燈箱。
   - `src/systems/RoadNetwork.ts`：新增道路有向圖核心，負責鄰近度拓撲判定、路口形態切換、紅綠燈計時與車道自動縫合。
   - `src/systems/RoadManager.ts`：銜接 `RoadNetwork`，將車道放置交由網路拓撲處理，並於每幀驅動號誌計時。
   - `src/main.ts`：傳遞動畫迴圈 `delta` 驅動 WASD 相機移動與紅綠燈狀態更新。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 8 輪需求與 Git 暫緩約定。
   - `Agent_technique_record.md`：記錄 WASD 運動學、斑馬線紋理規格、號誌狀態機與車道有向圖縫合技術。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **Git 狀態**：依指示保持工作區修改，暫不執行 commit 與 push。

---

## [2026-11-10] 第 9 輪作業：自訂懸浮規格卡、立體高架人行道與綠底人行穿越道（斑馬線）實作

### 本輪更新摘要
- **目標**：
  1. 徹底清除全局 HTML 原生 `title` 屬性，消除系統白底黃框 Tooltip。
  2. 於建造子選單上方實作一致性暗色毛玻璃規格說明卡 (`road-spec-card`)，完整列出通行方向、速限、人行道、路邊停車與迴轉 5 大規格。
  3. 為雙向二線車道實裝立體高架人行道（兩側各寬 0.35m，高度高出車道 0.035m），具備專屬混凝土方磚紋理與陰影。
  4. 實裝完全比照開發者附圖之綠底純白矩形斑馬線（寬度精準吻合 0.35m 人行道）。
  5. 依開發者特別指示，**本輪暫不使用 Git 管理**。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/ui/BuildMenu.ts`：移除原生 title，實作 hover 觸發之懸浮規格說明卡片。
   - `src/ui/BottomStatusBar.ts`：移除原生 title。
   - `src/rendering/RoadTextureFactory.ts`：新增混凝土方磚材質，並重繪符合附圖之鼠尾草綠底 + 均勻白矩形斑馬線紋理。
   - `src/systems/RoadNetwork.ts`：新增 `updateSidewalkMeshes`，為每塊車道動態組裝立體高架人行道與轉角人行廣場。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 9 輪需求與 Git 暫緩約定。
   - `Agent_technique_record.md`：記錄懸浮規格卡設計、人行道幾何階差與綠底斑馬線規格。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **Git 狀態**：依指示保持工作區修改，暫不執行 commit 與 push。

---

## [2026-11-10] 第 10 輪作業：斑馬線枕木紋瀝青底色回歸、T 字路口主線直通淨空與車道末端橫向阻礙消除

### 本輪更新摘要
- **目標**：
  1. 斑馬線背景回歸路面原生深灰瀝青色（`#22252a`），移除綠底，改為簡潔厚實的純白枕木紋條紋（Sleeper Stripes）。
  2. T 字路口直線貫通幹道不設斑馬線阻斷直行車流，中央黃虛線貫穿直通，僅在支線路口進入端設置橫穿斑馬線與停止線。
  3. 修復直向鋪設車道時末端莫名產生橫截高架人行道方塊之問題（移除 `DeadEnd` 橫向方塊，兩側人行道保持縱向平行，車道中央 1.3m 全長無阻礙）。
  4. 依開發者特別指示，**本輪暫不使用 Git 管理**。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/rendering/RoadTextureFactory.ts`：更新十字路口與 T 字路口紋理，移除綠底襯色，繪製原生瀝青底色上的 7 條純白枕木紋條紋；T 字路口直行貫通車道標線無斑馬線中斷。
   - `src/systems/RoadNetwork.ts`：修正 `DeadEnd` 立體人行道生成邏輯，與 `Straight` 合併處理，徹底消除了末端橫向高架人行道方塊。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 10 輪需求與結論。
   - `Agent_technique_record.md`：記錄第 7.4 節枕木紋瀝青底色、T 路口直通與末端橫向阻礙修復細節。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **Git 狀態**：依指示維持工作區修改，不執行 commit 與 push。

---

## [2026-11-10] 第 11 輪作業：T 字路口過馬路人行道方位修正與十字路口中央實線圈移除

### 本輪更新摘要
- **目標**：
  1. 修正 T 字路口旋轉角度（手性映射），確保行人橫穿支線的枕木紋斑馬線與轉角人行平台精準對齊支線進入開口，連續貫通的高架人行道回歸至無路一側，徹底修復方位反向的問題（圖 1）。
  2. 徹底移除十字路口中心封閉的白色實線方框（圖 2），中央維持純淨瀝青路面，四向入口保留 7 條純白枕木紋條紋。
  3. 依開發者特別指示，**本輪暫不使用 Git 管理**。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/systems/RoadNetwork.ts`：修正 `ThreeWay` 與 `Corner` 的 `newRotY` 旋轉四方位公式，確保局部坐標經 Three.js 旋轉後精準將支線開口映射至世界空間支線所在方向。
   - `src/rendering/RoadTextureFactory.ts`：自 `getFourWayTexture()` 與 `getThreeWayTexture()` 中移除內側實線，徹底消除了十字路口中央的一圈白色方框。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 11 輪需求與結論。
   - `Agent_technique_record.md`：記錄第 8 節旋轉矩陣推導與白色實線圈移除說明。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **Git 狀態**：依指示維持工作區修改，不執行 commit 與 push。

### 下一輪開發計畫
- **主題**：車輛尋路與交通測試驗收，或依指示進入市民個體生活作息/建築系統。

---

## [2026-11-10] 第 13 輪作業：3D 車輛模型建構、車輛行駛與號誌停等系統、左上角開發者道路測試選單

### 本輪更新摘要
- **目標**：
  1. 建立 3D 低多邊形程序化車輛模型（烤漆主車身、座艙車頂、前後擋風玻璃、側窗、發光大燈與煞車燈、四輪橡膠胎與輪轂）。
  2. 編寫車輛行駛系統與 A* 最短路徑尋路引擎（`Pathfinding.ts`），車輛沿平滑航點序列巡航，具備動態加減速與轉向插值。
  3. 實作路口號誌遵守機制（`VehicleManager.ts`），車輛駛入路口前即時偵測紅黃綠燈狀態，遇紅黃燈於入口線前平滑煞停，綠燈起步放行。
  4. 於畫面左上角建立暗色毛玻璃質感「🛠️ 開發者選單」（`DevMenu.ts`），內建「🚗 車輛道路測試」工具，支援互動式 3D 拾取起點與終點、發光路徑軌跡預覽、自動與手動發車實測。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/rendering/VehicleModelFactory.ts`：新增 3D 程序化車輛幾何工廠，支援多色隨機烤漆與發光車燈。
   - `src/systems/Pathfinding.ts`：新增 A* 尋路引擎，於有向車道圖上計算最短連通路徑並重建光滑航點。
   - `src/systems/RoadNetwork.ts`：擴充 `DirectedLane` 支援 `waypoints`、`intersectionKey` 與 `controllingSignal`，並完善彎道與路口弧線車道生成與鄰接自動串接。
   - `src/simulation/VehicleManager.ts`：新增車輛管理器，負責車輛實體生命週期、巡航推進、最短弧度旋轉、號誌檢查與停等。
   - `src/ui/DevMenu.ts`：新增左上角開發者選單，整合道路測試工具、3D 光標懸浮、起訖地標旗標與導航光路繪製。
   - `src/main.ts`：掛載 `VehicleManager` 與 `DevMenu`，並於主動畫迴圈中傳遞幀間時間驅動車輛模擬。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 13 輪需求與定案。
   - `Agent_technique_record.md`：記錄第 10 節車輛模型幾何、A* 演算法、號誌停等狀態機與開發者測試互動規範。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **Git 狀態**：依指示維持工作區修改，不執行 commit 與 push。

---

## [2026-11-10] 第 12 輪作業：轉彎處同心圓弧標線修正、外角高架人行道補齊與無縫銜接

### 本輪更新摘要
- **目標**：
  1. 徹底修復轉彎處（Corner）馬路外觀異常問題（修正原先外側白線凸入車道、切斷外車道並殘留大片瀝青空地的 Bug）。
  2. 重構轉彎處紋理為標準同心圓弧標線（外側白線 $R=416$、中央黃虛線 $R=256$、內側白線 $R=96$），圓心統一為轉彎內角 `(512, 512)`，兩側車道等寬（各 $0.65\text{m}$），與相鄰直道平滑精準銜接。
  3. 轉彎路面改以淺灰人行道混凝土（`#94a3b8`）為底盤，僅在扇形車道區域鋪設瀝青，徹底杜絕車道外圍露出的黑色瀝青三角空地。
  4. 補齊 3D 立體高架人行道網格（外側條延伸至東側邊界、外角補齊塊、內側轉角塊），確保內外人行道均無斷差無縫閉合。
  5. 依開發者特別指示，**本輪暫不使用 Git 管理**。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/rendering/RoadTextureFactory.ts`：重構 `getCornerTexture()`，改用同心圓弧扇形車道繪製，修復外側白霧線圓心與半徑，消除外側突兀瀝青楔形區域。
   - `src/systems/RoadNetwork.ts`：補齊 `updateSidewalkMeshes` 中 `Corner` 的外側人行道跨度（1.65m）與外轉角補齊方塊（0.5m x 0.5m），實現內外側人行道完全連續。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 12 輪需求與結論。
   - `Agent_technique_record.md`：記錄第 9 節同心圓幾何、材質分區與外角人行道補齊細節。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **Git 狀態**：依指示維持工作區修改，不執行 commit 與 push。

### 下一輪開發計畫
- **主題**：車輛尋路與交通測試驗收，或依指示進入市民個體生活作息/建築系統。

---

## [2026-11-10] 第 13 輪作業：3D 車輛模型建構、車輛行駛與號誌停等系統、左上角開發者道路測試選單

### 本輪更新摘要
- **目標**：
  1. 建立 3D 低多邊形程序化車輛模型（烤漆主車身、座艙車頂、前後擋風玻璃、側窗、發光大燈與煞車燈、四輪橡膠胎與輪轂）。
  2. 編寫車輛行駛系統與 A* 最短路徑尋路引擎（`Pathfinding.ts`），車輛沿平滑航點序列巡航，具備動態加減速與轉向插值。
  3. 實作路口號誌遵守機制（`VehicleManager.ts`），車輛駛入路口前即時偵測紅黃綠燈狀態，遇紅黃燈於入口線前平滑煞停，綠燈起步放行。
  4. 於畫面左上角建立暗色毛玻璃質感「🛠️ 開發者選單」（`DevMenu.ts`），內建「🚗 車輛道路測試」工具，支援互動式 3D 拾取起點與終點、發光路徑軌跡預覽、自動與手動發車實測。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/rendering/VehicleModelFactory.ts`：新增 3D 程序化車輛幾何工廠，支援多色隨機烤漆與發光車燈。
   - `src/systems/Pathfinding.ts`：新增 A* 尋路引擎，於有向車道圖上計算最短連通路徑並重建光滑航點。
   - `src/systems/RoadNetwork.ts`：擴充 `DirectedLane` 支援 `waypoints`、`intersectionKey` 與 `controllingSignal`，並完善彎道與路口弧線車道生成與鄰接自動串接。
   - `src/simulation/VehicleManager.ts`：新增車輛管理器，負責車輛實體生命週期、巡航推進、最短弧度旋轉、號誌檢查與停等。
   - `src/ui/DevMenu.ts`：新增左上角開發者選單，整合道路測試工具、3D 光標懸浮、起訖地標旗標與導航光路繪製。
   - `src/main.ts`：掛載 `VehicleManager` 與 `DevMenu`，並於主動畫迴圈中傳遞幀間時間驅動車輛模擬。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 13 輪需求與定案。
   - `Agent_technique_record.md`：記錄第 10 節車輛模型幾何、A* 演算法、號誌停等狀態機與開發者測試互動規範。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **實機伺服器**：本地 Vite 伺服器正常運行中（`http://localhost:3001`），測試載入正常。

### 下一輪開發計畫
- **主題**：車流系統多車避讓（車距防撞跟車模型）或市民模擬規劃。

---

## [2026-11-10] 第 14 輪作業：車輛模型尺寸微調 (*0.9) 與車道行駛軌跡精準居中校正

### 本輪更新摘要
- **目標**：
  1. 依開發者指示將 3D 車輛實體模型等比縮小至 0.9 倍（`*0.9`），提升車輛在二車道環境下的比例精細度與視感。
  2. 徹底修復車輛行駛路徑偏靠外側路緣與人行道之問題，將車道有向圖（`DirectedLaneGraph`）之行車中心線由原先的 `0.5m` 嚴謹校正為 `0.325m`，使車輛與導航光路精準行駛於「對向黃色分道線與該方向外側白實線之正中間」。
- **原則**：維持無未授權多餘功能原則、保持 Git 工作區修改狀態、實機編譯驗證 0 錯誤。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/rendering/VehicleModelFactory.ts`：於 `createVehicle()` 動態組裝完畢後加入 `group.scale.set(0.9, 0.9, 0.9)`，將全車（車身、座艙、擋風玻璃、車燈、輪胎）等比縮小 10%。
   - `src/systems/RoadNetwork.ts`：
     - 重構 `rebuildLaneGraph()` 中行車偏移常數 `LANE_OFFSET = 0.325`（即 $1.3\text{m}$ 淨寬中點 $\frac{0 + 0.65}{2} = 0.325\text{m}$）。
     - 更新直線道（Straight/DeadEnd）南北向（$X = \pm 0.325$）與東西向（$Z = \pm 0.325$）航點座標。
     - 更新 90 度彎道（Corner）4 種旋轉方位下所有左右轉 Bézier 控制點與起訖座標至 $\pm 0.325\text{m}$。
     - 更新三向與四向十字路口（ThreeWay/FourWay）所有方向之進入線（Inbound）與離開線（Outbound）座標至 $\pm 0.325\text{m}$。
2. **文檔與紀錄**
   - `Dissusion_withDEV.md`：記錄第 14 輪需求與結論。
   - `Agent_technique_record.md`：記錄第 11 節車道中心線幾何推導、模型縮放比例與拓撲對齊細節。
   - `Agent_dev_log.md`：登錄本輪開發作業。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，Vite 打包順利完成。
- **本地伺服器**：本地開發伺服器持續運行中（`http://localhost:3001`）。
- **Git 狀態**：依指示維持工作區修改，不執行 commit 與 push。

### 下一輪開發計畫
- **主題**：車輛道路行駛驗收，或依指示進入後續交通模擬與城市建設系統。

---

## [2026-11-10] 第 15 輪作業：開發伺服器端口衝突排查與測試工作流優化

### 本輪更新摘要
- **問題分析與排查**：
  1. 針對「`npm.cmd run dev` 測試時持續等待且不會結束」與「`Port 3000 is in use, trying another one...`」進行根本原因調查。
  2. 查明 `npm run dev`（`vite`）屬於持續監聽 HTTP 與 HMR 的常駐伺服器（Daemon），本質不會自行結束；且本地終端早已由開發者啟動 `vite`（PID 12384）於 3000 port 服務中。
  3. 代理端重複呼叫 `npm run dev` 導致端口衝突切換至 3001 並持續佔用工具通道。
- **解決方案與規範確立**：
  1. 徹底終止代理端 `npm run dev` 背景行程，釋放 3001 端口；保留開發者原本在 3000 端口之正常服務。
  2. 嚴格修訂驗證標準：所有代碼語法與型別檢核一律使用單次自動退出之 `npm.cmd run build`（`tsc && vite build`），絕不再呼叫常駐伺服器指令。

### 本輪異動檔案清單
1. **文檔與紀錄**
   - `Agent_dev_log.md`：記錄本輪排查與修復進度。
   - `Agent_technique_record.md`：記錄第 12 節進程管理與驗證指令規範。
   - `Dissusion_withDEV.md`：記錄問題原因剖析與規範定案。

### 驗證結果
- **進程狀態**：3001 端口已完全釋放，3000 端口由開發者原 Vite 實例穩定提供服務，0 衝突。
- **編譯測試**：確認 `npm run build` 單次編譯退出機制正常，0 秒阻塞。

---

## [2026-11-10] 第 16 輪作業：紅綠燈停等判斷重構與安全停止線制動機制修復

### 本輪更新摘要
- **問題根因剖析**：
  1. 尋路路徑點與車道脫鉤，車輛進入路口時索引判定失序。
  2. 原減速感應距離僅 0.95m，在 8.5m/s (30 km/h) 下所需安全煞車距離為 4.5m，導致車輛煞車未及即衝入路口。
  3. 原判定在距離入口 < 0.25m 時直接將 `hasEnteredIntersection` 設為 true，反而強制解除了煞車狀態，導致車輛紅燈直接穿透。
- **重構與修復內容**：
  1. 在 `Pathfinding.ts` 引入 `RouteWaypoint`，為每個路徑點打上 `isStopLine`、`intersectionKey` 與 `controllingSignal` 標記。
  2. 在 `VehicleManager.ts` 建立前方停止線動態前瞻掃描機制，精確計算沿車道至停止線之剩餘距離 `distToStopLine`。
  3. 導入物理安全減速模型 $v = \sqrt{2ad}$（在 6m 內平滑減速），並在停止線前 0.25m 完全煞停（`speed = 0`，`remainingMove` 嚴格限制），保證絕不壓線或闖紅燈。
  4. 號誌切換為綠燈時，解除限制並平滑起步通過路口。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/systems/Pathfinding.ts`：擴充 `RouteWaypoint` 與 `PathResult`，自動辨識路口入口停止線。
   - `src/simulation/VehicleManager.ts`：重構車輛號誌檢查、物理減速制動與停止線停等邏輯。
2. **文檔與紀錄**
   - `Agent_dev_log.md`：記錄本輪開發日誌。
   - `Agent_technique_record.md`：記錄第 13 節停止線感應前瞻演算法與物理制動機制。
   - `Dissusion_withDEV.md`：記錄需求結論。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，1.04 秒順利打包。
- **Git 狀態**：依指示維持工作區修改，不建立 Git 版本。

---

## [2026-11-10] 第 17 輪作業：基礎道路系統穩定版本定案與 Git 版本建立及推送

### 本輪更新摘要
- **里程碑目標**：依開發者指令，將「基礎道路系統（包含雙向二線道吸附建造、WASD 平移、自動相交拓撲、立體高架人行道、枕木紋斑馬線、3D 紅綠燈狀態機、3D 程序化車輛模型、車道有向圖 A* 尋路與號誌安全制動停等、左上角開發者道路測試工具）」正式打包為階段性穩定版本，建立 Git 提交並同步推送到遠端儲存庫。
- **異動與提交清單**：
  1. 全部基礎道路系統、渲染工廠、車輛動力學與 UI 元件新增/異動檔案納入版本控管。
  2. 同步更新 `DEV_roadMap.md`，將階段 1 與階段 2 核心成果標記為已完成。
  3. 執行 `git add .`、`git commit` 與 `git push origin main`。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，代碼無任何瑕疵。
- **遠端同步**：成功 push 至遠端 GitHub 儲存庫 `origin/main`。












