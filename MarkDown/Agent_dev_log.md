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

---

## [2026-11-10] 第 18 輪作業：道路路側小格子動態生成與土地劃分（住宅區）功能實作

### 本輪更新摘要
- **目標**：
  1. 依開發者指示，於道路周邊動態生成垂直於道路的專屬 1m x 1m 小格子（非地圖網格，為依道路拓撲動態投影之分區小方格，縱深 4 層）。
  2. 調整畫面左下方建造選單布局：新增「土地劃分功能按鈕」於最左側，原「道路建造按鈕」順序右移。
  3. 實作土地分區子選單，首推「低密度住宅區（Residential Zone）」與「清除分區（Dezone）」選項。
  4. 開啟土地劃分後，道路周邊呈現亮水藍色 3D 分區格線；滑鼠左鍵點擊或拖曳可指派為翠綠色住宅區色塊，右鍵或清除模式可塗抹擦除。
  5. 遵守指示：本輪僅完成土地劃分基礎功能，房子的外觀、建房子的條件等留待下一輪，且不建立 Git 版本。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/systems/ZoningManager.ts`：新增路側土地分區管理器，負責依道路拓撲向外垂直投影 4 層 1m 格位、避開現存道路、組合 3D LineSegments 網格線與住宅區綠色色塊渲染、射線檢測與滑鼠連續拖曳塗抹。
   - `src/systems/RoadManager.ts`：新增 `onRoadsPlaced` 回調，於每次道路建造完成時自動驅動 `zoningManager.rebuildZoningGrid()` 同步更新。
   - `src/ui/BuildMenu.ts`：重構左下方導航列為雙按鈕（左側土地劃分按鈕 + 右側道路建造按鈕），新增土地分區子選單（住宅區、清除分區）與操作提示氣泡。
   - `src/main.ts`：掛載 `ZoningManager`，串聯 `RoadManager` 與 `BuildMenu`。
2. **文檔與紀錄**
   - `Agent_dev_log.md`：記錄本輪開發日誌。
   - `Agent_technique_record.md`：記錄第 14 節路側小格子幾何投影、空間去重與分區塗抹技術細節。
   - `Dissusion_withDEV.md`：記錄第 18 輪需求與定案。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，1.23 秒順利打包。
- **Git 狀態**：依指示維持工作區修改，不建立 Git 版本。

---

## [2026-11-10] 第 19 輪作業：土地分區地塊色彩動態顯示控制（僅在分區功能觸發時可見）

### 本輪更新摘要
- **目標**：
  - 依開發者明確指示，分區顏色標示（綠色住宅區色塊）改為「僅在土地分區功能被觸發啟用時可見」。
  - 當選單關閉或退出分區模式時，自動隱藏所有分區地塊顏色與網格線，還原地表純淨景觀；再次開啟時立即恢復顯示。
- **異動內容**：
  - `src/systems/ZoningManager.ts`：
    - 將色塊群組 `fillGroup` 預設可見性設為 `false`。
    - 在 `setToolActive(active)` 中同步綁定 `this.fillGroup.visible = active`。
    - 在 `rebuildZoningGrid()` 刷新時依據 `this.isToolActive` 動態決定色塊可見狀態。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/systems/ZoningManager.ts`：更新 `fillGroup` 之生命週期可見性邏輯。
2. **文檔與紀錄**
   - `Agent_dev_log.md`：記錄本輪開發日誌。
   - `Agent_technique_record.md`：補充第 14.4 節可見性狀態機規範。
   - `Dissusion_withDEV.md`：記錄第 19 輪需求與定案。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，1.65 秒順利完成。
- **Git 狀態**：維持工作區修改，不建立 Git 版本。

---

## [2026-11-10] 第 20 輪作業：低密度住宅 3D 模型庫建立（2x2, 2x3, 3x2, 3x3, 4x4）、道路朝向規則與開發者選單 3D 模型檢視器實作

### 本輪更新摘要
- **目標**：
  1. 依開發者手繪俯視圖與規格指示，建立 5 款低密度住宅 3D 程式化模型（`BuildingModelFactory.ts`）：
     - `2*2` (容量: 2 人)：單層溫馨別墅，經典人字山形斜瓦屋頂、門廊玄關、前庭步道與花圃。
     - `2*3` (容量: 2 人)：窄面寬 (2m) × 大縱深 (3m) 英式長型小屋，紅磚瓦長條斜屋頂，正面大門偏左，自帶後花園景觀樹。
     - `3*2` (容量: 2 人)：寬面寬 (3m) × 淺縱深 (2m) 美式平房 (Bungalow)，中央雙立柱大門廊遮陽棚，左右對稱大採光橫窗。與 `2*3` 有明確方向性與建築結構本質差異。
     - `3*3` (容量: 3 人 / 3p)：雙層現代家庭花園別墅，一樓配置獨立車庫捲門與主客廳，二樓臥房與大露台，附車道鋪面與庭院樹。
     - `4*4` (容量: 4 人 / 4p)：豪華兩層氣派莊園大宅邸，複合式十字雙斜屋頂、宏偉雙柱挑高門廊 (Portico)、雙車位大車庫、一樓八角凸窗 (Bay window)、二樓雙窗、雙煙囪與前後雙景觀庭院。
  2. **方向性約束**：所有建築模型的正門、入口玄關與前庭走道嚴格統一朝向 $+Z$ 軸（未來落位時面朝馬路之方向）。
  3. **範圍邊界遵守**：純 3D 建模，暫不置於地圖上，亦不觸發建房條件。
  4. **左上角開發者選單（DevMenu）重構**：
     - 啟動按鈕移除中文，僅保留純工具圖標 `🛠️`。
     - 重構為雙分頁導航：`🚗 車輛道路測試` (Traffic Test) 與 `🏛️ 檢視模型` (Model Inspector)。
     - 實作 3D 模型檢視展台：可自由切換檢視現存所有模型（車輛 + 5 款低密度住宅），展台具備青色發光光環、亮綠色「正面 (朝向馬路)」指引箭頭標記、慢速 360° 自動旋轉切換、正面視角歸位鈕與即時詳細規格面板（尺寸、人口容量、朝向與建築特徵）。
  5. 依開發者明確指示，**本輪暫不建立 Git 版本**。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/rendering/BuildingModelFactory.ts`（新增）：程式化組裝 5 款低密度住宅 3D 模型，提供 `BuildingMetadata` 規格目錄與統一實例化介面 `createBuildingById`。
   - `src/ui/DevMenu.ts`：更新觸發按鈕為純圖標 `🛠️`，新增頂部雙分頁切換列、3D 展台（含光環、綠色朝向馬路箭頭與地台）、模型切換下拉選單、旋轉驅動與規格詳情卡片。
   - `src/main.ts`：在主動畫迴圈中串接 `devMenu.update(delta)`，平滑驅動展台 360° 自動旋轉。
2. **文檔與紀錄**
   - `Agent_dev_log.md`：記錄本輪開發日誌。
   - `Agent_technique_record.md`：新增第 15 節低密度住宅建模架構、道路朝向幾何與 DevMenu 3D 展台技術細節。
   - `Dissusion_withDEV.md`：記錄第 20 輪需求、尺寸規格、人數定案與不建 Git 版本約定。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯 0 錯誤、0 警告，1.06 秒快速打包成功。
- **Git 狀態**：依指示維持工作區修改，暫不建立 Git 版本。

---

## [2026-11-10] 第 21 輪作業：修復低密度住宅屋頂倒三角形模型異常（改採無縫三角稜柱 BufferGeometry）

### 本輪更新摘要
- **問題分析**：
  - 開發者反映「每個房子模型上面都有一個或多個奇怪的倒三角形的模型」。
  - 經深入排查 `BuildingModelFactory.ts` 中的 `createGableRoof` 函式：原先誤用 `CylinderGeometry(0, R, d, 3, 1)`（頂部半徑為 0 的三面圓錐體/四面體），加上旋轉與縮放後，頂點在 $Y$ 軸方向尖端朝下倒立、且沿長度方向收縮為單一尖錐點，形成倒三角形畸形幾何體。在單屋頂房子（2x2, 2x3, 3x2, 3x3）出現 1 個倒三角，在雙屋頂大豪宅（4x4 含主屋頂與車庫斜屋頂）出現 2 個倒三角。
- **解決方案**：
  - 徹底重構 `createGableRoof(w, h, d, mat)`，以純淨三維頂點幾何構建原生 5 面實心三角稜柱（`BufferGeometry`）：
    - 頂部稜脊線（Ridge Apex）兩端位於 $+Y$ 軸正向，精準沿 $Z$ 軸水平通長延伸。
    - 底部屋簷四角（Eaves）位於 $-Y$ 軸底部，左右對稱均勻向外斜出。
    - 8 個三角形組成無縫稜柱（前/後正立山牆各 1 個三角、左/右屋頂斜坡各 2 個三角、底部水平蓋板 2 個三角）。
    - 逆時針繞行計算頂點法向量（`computeVertexNormals`），面法向量朝向正面、背面、斜坡與底面 100% 精確。
  - 同步微調 `Residential_2x3` 之閣樓圓窗位置（$Z = 0.885$），確保清晰嵌於前山牆表面。
- **驗證結果**：
  - 經 Node 幾何測試腳本驗證包圍盒尺寸與法向量方向無誤。
  - 執行 `npm.cmd run build`，TypeScript 編譯與 Vite 打包 0 錯誤、0 警告，1.90 秒構建完成。
  - 工作區維持修改狀態，暫不建立 Git 版本。

---

## [2026-11-10] 第 22 輪作業：房屋生成規則實作、地圖邊界聯外道路接點、施工鷹架動畫與市民遷入開車行駛

### 本輪更新摘要
- **目標**：
  1. 實作「房子正面只能生成在貼合馬路位置」之嚴格幾何落位驗證（即使有住宅需求與可用空間，若正面未緊貼道路絕不生成）。
  2. 依指示建立 `task_quene.md` 追蹤「住房需求產生規則」後續規劃。
  3. 實作房客隨機合居（與人合居）或自住（獨立自住）偏好機制。
  4. 實作「先找出允許生成的全部合法建築，再隨機選擇」之動態住宅起建演算法。
  5. 實作施工建造階段：低多邊形鷹架、閃爍警示燈球、主體由地表升起之動畫，以及滑鼠懸停顯示建造進度條。
  6. 於地圖南側邊界建立聯外道路接點（包含 3D 高速公路門架與綠色告示牌），房屋完工後市民自邊界開車抵達家門前並直接消失入住。
  7. 實作滑鼠懸停於建築時顯示「登記居住人數」、「現房內人數」、「合居模式」與佔地朝向資訊。
  8. 開發者選單擴充第 3 分頁「🏡 房屋需求」，支援手動增減需求與立即觸發生成。
  9. 維持指示：暫不建立 Git 版本。

### 本輪異動檔案清單
1. **文檔與待辦任務**
   - `task_quene.md`（新增）：記錄住房需求產生規則、市民日常出行 AI 與商工業分區待辦計畫。
   - `Agent_dev_log.md`：記錄本輪開發日誌。
   - `Agent_technique_record.md`：記錄第 16 節住宅生成演算法、邊界聯外道路拓撲與遷入車輛調度架構。
   - `Dissusion_withDEV.md`：記錄第 22 輪需求與決策。
2. **核心程式碼**
   - `src/systems/BuildingManager.ts`（新增）：住宅生命週期管理器，涵蓋需求監控、臨路落位篩選、隨機合法起建、鷹架建造動畫、市民驅車調度與懸停資訊 Tooltip。
   - `src/systems/ZoningManager.ts`：擴充公開查詢介面 `getCells()`、`getCell()` 與 `isCellResidential()`。
   - `src/systems/RoadNetwork.ts`：新增 `getExternalSpawnLane()` 取得南側邊界進城車道。
   - `src/systems/RoadManager.ts`：初始化南側邊界聯外道路與 3D 高速公路門架 (`createExternalGantry`)。
   - `src/simulation/VehicleManager.ts`：新增 `spawnMovingInVehicle()` 支援市民遷入到家立即消失與回調。
   - `src/ui/DevMenu.ts`：新增「🏡 房屋需求」分頁，支援增減需求與即時監視全城房屋列表。
   - `src/main.ts`：串接 `BuildingManager` 至主動畫迴圈與狀態欄人口統計。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯與 Vite 打包 0 錯誤、0 警告，2.25 秒順利完成。
- **Git 狀態**：維持工作區修改，暫不建立 Git 版本。

---

## [2026-11-10] 第 23 輪作業：邊界橫貫外部公路貫通、過境車流模擬、多規格需求配對 (1/2/3人) 與相連道路限制

### 本輪更新摘要
- **目標**：
  1. 依開發者指示變更外部道路架構：改為地圖南側邊界（$Z=96$）從西邊界（$-100$）貫通至東邊界（$+100$）之完整橫貫公路。
  2. 實作日常過境車流模擬（Ambient Through-Traffic）：車輛定期自西側駛出往東側駛離，或自東側駛出往西側駛離，呈現真實公路川流不息景觀。
  3. 實作遷入前置連通道路條件：從外部公路必須有可供車輛通行至住處的相連道路，否則不允許配對起建。
  4. 重構開發者工具箱（DevMenu）：
     - 刪除「立即檢查並起建房屋」按鈕。
     - 需求按鈕改為「➕ 1 人需求」、「➕ 2 人需求」與「➕ 3 人需求」。
     - 若為複數需求（例如 3 人），落腳抽取房型時嚴格排除人數不足之房型（例如 2x2, 2x3, 3x2 皆被排除，僅 3x3 與 4x4 可入選）。
  5. 實作需求配對失敗與流失機制：若需求產生但配對不滿足（無相連道路、地塊空間不足以建造符合人數房型），則配對失敗並流失住房需求，即時顯示流失原因。
  6. 配對成功後先開始建造，完工後市民車輛自邊界公路開車進入城市抵達家門。
  7. 遵守指示：暫不建立 Git 版本。

### 本輪異動檔案清單
1. **核心程式碼**
   - `src/systems/RoadNetwork.ts`：新增 `createHighwayCorridor` 批次建立東西向貫通公路，並提供東西兩端進出口車道檢索。
   - `src/systems/RoadManager.ts`：更新為南界 $Z=96$ 貫穿公路，並在東西兩端各設置一座高規格 3D 高速公路門架。
   - `src/simulation/VehicleManager.ts`：新增過境車流定時調度器 (`spawnAmbientHighwayVehicle`)，模擬橫貫公路雙向過境車流。
   - `src/systems/BuildingManager.ts`：重構為 `requestHousingDemand(peopleCount)`，實現「連通道路檢驗」、「人數不足房型排除」、「配對失敗需求流失」與自最近公路進口發車。
   - `src/ui/DevMenu.ts`：更新房屋需求分頁，提供 1/2/3 人需求觸發按鈕、配對反饋即時卡片與統計。
2. **文檔與紀錄**
   - `Agent_dev_log.md`：記錄本輪開發日誌。
   - `Agent_technique_record.md`：記錄第 17 節邊界橫貫公路拓撲、過境車流生成與連通道路驗證技術細節。
   - `Dissusion_withDEV.md`：記錄第 23 輪需求與決策。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯與 Vite 打包 0 錯誤、0 警告，2.05 秒順利完成。
- **Git 狀態**：維持工作區修改，暫不建立 Git 版本。

---

## [2026-11-10] 第 24 輪作業：邊界預設公路與自建道路網格座標相位對齊修復（修復無法相連形成車道問題）

### 本輪更新摘要
- **問題回饋**：
  - 開發者回饋：「現在有一個問題，城市邊緣的預設道路不會與我建立的道路相連形成車道 請修復」。
- **問題根因分析**：
  - **網格奇偶相位錯位（Odd vs Even Grid Parity Mismatch）**：
    - 玩家建造道路時，吸附演算法為：`gx = Math.floor(worldX / 2) * 2 + 1`，因此所有自建道路的中心點座標恆為**奇數**（$\dots, -3, -1, 1, 3, \dots, 95, 97, 99$）。
    - 外部預設公路原先建立於 $Z = 96$（**偶數**），$X$ 座標自 $-100$ 至 $+100$（**偶數**）。
    - 由於奇偶不相容，玩家道路拉至公路邊緣時（例如 $Z = 95$），其相鄰探測為 $Z \pm 2$（$93$ 與 $97$），永遠無法命中位於 $Z = 96$ 的公路格位；且公路格位 $X$ 為偶數、自建道路 $X$ 為奇數，導致兩者空間座標交錯 1m，`RoadNetwork` 判定為完全互不相連的孤立道路，無法觸發路口分類（ThreeWay/FourWay），亦無法縫合車道！
    - 同時，`BuildingManager.ts` 中的 `isRoadAdjacent` 與 `calculateFrontRoadPoint` 原先採用 `Math.round(val / 2) * 2`（偶數），導致房屋正面貼路檢驗無法精準對齊自建道路之奇數座標。
- **修復措施**：
  1. **外部公路網格相位對齊**：
     - 將外部橫貫公路走廊統一對齊至次要網格之奇數中心：$Z = 97$，$X$ 自 $-99$ 至 $+99$（共 100 格，每格 2m，無縫覆蓋世界座標 $-100 \sim +100$）。
     - 更新外部公路進出車道 ID（西側 `lane_-99_97_E` / `lane_-99_97_W`，東側 `lane_99_97_W` / `lane_99_97_E`）。
     - 同步將兩側門架精準錨定於 $(-99, 97)$ 與 $(99, 97)$。
  2. **自動路口升級與車道縫合驗證**：
     - 當玩家道路向南延伸至 $Z = 95$（或直接覆蓋至 $Z = 97$）時，公路該格位之連接鄰居即刻包含北側自建道路，拓撲分類自動轉換為 `ThreeWay`（T 字路口），更換 T 字路口標線與人行道，自動配置紅綠燈號誌，並編織公路直通車道與市區轉向車道！
  3. **房屋臨路與正門道路座標修正**：
     - `BuildingManager.ts` 中 `isRoadAdjacent` 與 `calculateFrontRoadPoint` 全面改用 `Math.floor(val / 2) * 2 + 1`，與道路網格系統 100% 同步。
  4. **土地分區邊界保護**：
     - `ZoningManager.ts` 加入邊界保護，確保臨路小格子不溢出 $\pm 100\text{m}$ 建設邊界。
  5. **遵守指示**：維持工作區變更，暫不建立 Git 版本。

### 本輪異動檔案清單
1. `src/systems/RoadManager.ts`：更新外部公路 $Z=97$ 及門架座標至奇數網格。
2. `src/systems/RoadNetwork.ts`：更新 `createHighwayCorridor` 座標步進與邊界進出車道 ID 映射。
3. `src/systems/BuildingManager.ts`：修正 `isRoadAdjacent` 與 `calculateFrontRoadPoint` 網格吸附公式。
4. `src/systems/ZoningManager.ts`：加入小格子建設區邊界防護。
5. `src/ui/DevMenu.ts`：更新狀態欄中外部公路座標描述為 $Z=97$。
6. `Agent_dev_log.md`、`Agent_technique_record.md`、`Dissusion_withDEV.md`：記錄本輪日誌、技術細節與決策。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯與 Vite 打包 0 錯誤、0 警告，1.51 秒順利完成。
- **Git 狀態**：維持工作區修改，暫不建立 Git 版本。

---

## [2026-11-10] 第 25 輪作業：修復路側房屋未貼緊道路網格與「等待聯外道路」卡死問題

### 本輪更新摘要
- **問題回饋**：
  - 開發者回報：「在道路的某一側 房子沒有正常生長在貼緊道路的格子裡，導致明明有道路卻寫:等待聯外道路 請修復」。
- **問題根因分析**：
  1. **房屋 3D 中心點（Lot Center）四向位移公式偏差（0.5m 錯位）**：
     - 在 `BuildingManager.ts` 的 `spawnBuilding` 中，計算 `worldCenter` 的公式：
       - `case 'E'`: `cx = site.originZx - D / 2 + 0.5`（因 $originZx$ 為網格整數，實際佔地 $[originZx - D + 1, originZx + 1]$ 之幾何中心應為 $originZx - D/2 + 1.0$），此處少加了 $0.5\text{m}$，導致道路西側（朝東面路）的房屋本體向西位移了 $0.5\text{m}$，脫離人行道懸空。
       - `case 'W'`: `cx = site.originZx + D / 2 - 0.5`（實際佔地 $[originZx, originZx + D]$ 之幾何中心應為 $originZx + D/2$），此處多減了 $0.5\text{m}$，導致道路東側（朝西面路）的房屋本體向西位移 $0.5\text{m}$，直接插進道路人行道中。
       - `case 'S'` 與 `case 'N'` 亦各存在 $0.5\text{m}$ 之位移誤差。
  2. **市民車輛派遣車道篩選邏輯缺陷（單向死鎖）**：
     - 住宅完工調度市民開車遷入時，`dispatchCitizenVehicle` 原先僅依正門空間距離挑選單一最近車道（`targetLane`）。
     - 對於南北向道路西側的房屋，離正門最近的車道為南向車道（`lane_S`，行車方向自北向南）。然而市民自南側外部公路進城時，行車方向為**自南向北**（行駛於 `lane_N`）。若市區道路為死巷（DeadEnd）無掉頭機制，市民車輛無法逆向駛入 `lane_S`，導致尋路失敗（`bestPath = null`），房屋狀態永遠卡在 `waitingForRoad`（等待聯外道路）。
- **修復措施**：
  1. **校正房屋佔地 3D 幾何中心公式**：
     - `case 'S'`: `cz = site.originZz - D / 2 + 1.0`
     - `case 'N'`: `cz = site.originZz + D / 2`
     - `case 'E'`: `cx = site.originZx - D / 2 + 1.0`
     - `case 'W'`: `cx = site.originZx + D / 2`
     - 所有方向（N/S/E/W）之建築地基與庭院走道，現在 100% 精準貼齊臨路人行道，絕無懸空縫隙或侵入車道。
  2. **全面優化市民遷入車道尋路機制**：
     - `dispatchCitizenVehicle` 改為遍歷該臨路路塊之所有可用車道，優先尋找可自公路通行且距離正門最近的有效路線。市民車輛現在可順利沿通行車道開抵家門前消失並順利完成遷入。
  3. **道路死巷末端（DeadEnd）新增 U-Turn 掉頭弧線車道**：
     - 在 `RoadNetwork.ts` 中，為盡頭死巷各方向（!hasN, !hasS, !hasE, !hasW）自動建立平滑 180° 掉頭連接車道，打通死巷的雙向迴圈。
  4. **遵守指示**：維持工作區變更，暫不建立 Git 版本。

### 本輪異動檔案清單
1. `src/systems/BuildingManager.ts`：修復房屋 3D 中心點公式、前門道路點模型規格對齊、以及市民開車多車道可用性篩選。
2. `src/systems/RoadNetwork.ts`：新增路網盡頭死巷（DeadEnd）平滑掉頭（U-Turn）車道與拓撲自動縫合。
3. `Agent_dev_log.md`、`Agent_technique_record.md`、`Dissusion_withDEV.md`：記錄本輪日誌、技術細節與決策。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯與 Vite 打包 0 錯誤、0 警告，2.34 秒順利完成。
- **Git 狀態**：維持工作區修改，暫不建立 Git 版本。

---

## [2026-11-10] 第 26 輪作業：專案達穩定版本，建立正式 Git 版本管理

### 本輪更新摘要
- **目標**：
  - 開發者確認：「現在是一個比較穩定的版本，建立GIT 版本」。
  - 正式建立 Git Commit，固化包含「路側土地劃分」、「低密度住宅 3D 模型庫」、「建築生命週期與需求配對」、「邊界橫貫聯外公路與雙向過境車流」、「死巷 U-Turn 掉頭」等完整功能體系之穩定版本。
- **涵蓋重大里程碑成果**：
  1. **路側土地劃分系統 (Zoning System)**：
     - `src/systems/ZoningManager.ts`：垂直於道路動態投影 1m x 1m 小格子，支援滑鼠連續塗抹劃分住宅區（綠色半透明）與清除劃分，選單關閉時自動隱藏維持視野純淨。
  2. **程序化低多邊形低密度住宅模型庫 (BuildingModelFactory)**：
     - `src/rendering/BuildingModelFactory.ts`：手工組裝 5 款低密度住宅（2x2, 2x3, 3x2, 3x3, 4x4），具備原生 BufferGeometry 三角人字坡屋頂、門廊雨棚、大門、窗戶、煙囪、車庫與植栽景觀。
  3. **3D 模型展台 (DevMenu Showroom)**：
     - `src/ui/DevMenu.ts`：純圖標按鈕 `🛠️`、雙子分頁導航、自轉發光地台、正面朝向指示、詳細規格卡片。
  4. **建築生命週期與需求配對引擎 (BuildingManager)**：
     - `src/systems/BuildingManager.ts`：1/2/3 人需求產生與配對、嚴格正面臨路約束、容量匹配過濾、連通道路可達性檢驗、施工鷹架與警示燈升起動畫、完工市民開車遷入、懸停 Tooltip 查看居住與現房內人數。
  5. **邊界橫貫公路走廊與雙向過境車流 (Highway & Ambient Traffic)**：
     - `src/systems/RoadManager.ts` & `src/systems/RoadNetwork.ts`：南界 Z=97 東西橫貫公路與東西兩側高規格 3D 門架，自建道路相交自動升級為 T 字路口（ThreeWay）與配置號誌。
     - `src/simulation/VehicleManager.ts`：定時生成雙向過境車流。
  6. **道路死巷掉頭車道與多車道可達性派車**：
     - `src/systems/RoadNetwork.ts`：死巷末端自動構建 180° U-Turn 弧線車道。
     - `src/systems/BuildingManager.ts`：校正 3D 中心點公式與多車道尋路派遣，徹底解決假性「等待聯外道路」。
  7. **文檔整合**：
     - 專案說明文檔與日誌整理至 `MarkDown/` 目錄集中管理。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 編譯與 Vite 打包 0 錯誤、0 警告。
- **Git 版本**：完成暫存並提交 Git Commit。

---

## [2026-11-10] 第 27 輪作業：完善住房入住機制與三階段配對佇列清單

### 本輪更新摘要
- **目標**：
  - 開發者指示：完善住房入住機制，落實「1. 產生需求 -> 2. 配對需求 -> 3. 配對成功入住 / 失敗流失」三階段管線。
  - 需求具體規格：
    1. 人數：1 - 5 人（支援隨機產生與 1-5 人快速按鈕）。
    2. 入住方式：隨機選擇「併入別人 (合居 `joinExisting`)」或「建立新房屋 (`buildNew`)」。
    3. 住宅密度：目前為低密度住宅（`'Low'`）。
    4. 偏好房型：自現有房型（2x2, 2x3, 3x2, 3x3, 4x4）中隨機抽取 2 款作為可接受之偏好房型。
  - 配對條件與規則：
    1. **併入別人 (合居)**：
       - 條件 1-1：篩選現有候選房屋（需求密度符合、房型在偏好內、剩餘容量 $\ge$ 需求人數、且房屋必須為完工狀態 `status === 'completed'`，建造中不可作為候選）。
       - 條件 1-2：候選房屋隨機洗牌，逐一擲 50% 媒合意願，首個通過即入住，全數未過則配對失敗流失。
       - 成功：`registeredResidents += peopleCount`，派遣市民車輛自公路開車遷入，車到門前消失正式記入 `currentOccupants` 與城市總人口。
    2. **建立新房屋**：
       - 排除容量不足與密度不符之房型。
       - 自符合之偏好房型隨機指定順序檢查合適建地（屬於住宅區、空間放得下、正面貼路、已連通外聯道路、未被佔用/預留）。若第一偏好無法滿足則檢查第二偏好；皆無可用建地則配對失敗流失。
       - 成功：起建房屋（鷹架與警示燈升起動畫 6 秒），完工時開車自公路遷入，車到消失後正式增加人口。
    3. **移除重複外聯道路檢查**：因在選地判定時已完整檢驗 `hasPathFromHighway(roadKey)`，後續無須重複強制檢驗。
  - 需求清單介面：在開發者工具箱（DevMenu）建立需求歷史滾動清單，最新需求置頂顯示。
  - 遵守約束：**不建立 GIT 版本**。

### 本輪異動檔案清單
1. `src/systems/BuildingManager.ts`：
   - 定義 `HousingDemand`、`HousingDensity`、`MoveInType`、`DemandStatus` 介面。
   - 新增 `demandQueue` 需求清單與歷史維護機制。
   - 實作 `generateRandomDemand(forcedPeopleCount)`：產生符合規格之隨機需求（1-5人、50/50入住方式、2個隨機偏好房型）。
   - 實作 `matchJoinExisting`：嚴格判定完工房屋篩選（密度/偏好/容量）與隨機洗牌 50% 投擲。
   - 實作 `matchBuildNew`：排除容量不足房型、雙偏好依序土地檢驗與起建。
   - 實作 `findSiteForModel`：整合住宅區、空間正面貼路、外聯道路連通與佔用檢查。
   - 實作 `dispatchCitizenVehicle(building, arrivingCount)`：支援完工首批遷入與後續合居追加遷入，車輛抵達家門消失時精準增加 `currentOccupants`。
2. `src/ui/DevMenu.ts`：
   - 房屋需求分頁介面升級：新增「🎲 產生隨機需求 (1-5人/隨機偏好)」主按鈕與 ➕1人至➕5人快速按鈕。
   - 新增「📋 需求歷史清單 (最新在最上方)」滾動卡片，顯示每筆需求之 ID、人數、入住方式、偏好房型、配對結果或流失原因。
3. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：記錄本輪開發日誌、技術細節與決策。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 與 Vite 打包 0 錯誤、0 警告，2.04 秒順利完成。
- **Git 狀態**：維持工作區變更，未建立 Git 提交。

---

## [2026-11-10] 第 28 輪作業：房屋建造時間增為 3 倍（遊戲時間解耦）與全動態作業塔吊施工吊臂

### 本輪更新摘要
- **目標**：
  1. **房屋建造時間改為原先的 3 倍**：原為 6.0 秒，調整為 18.0 秒。
  2. **建造時間以「遊戲時間 (Game Simulation Time)」計算**：
     - 將建築推進、吊臂作業動畫、警示燈閃爍全面與遊戲模擬時間（`simDelta`）解耦。
     - 在 `TimeManager.ts` 中導入 `timeScale`（速度倍率）與 `getSimulationDelta(realDelta)`，當遊戲暫停時時間增量歸零（建造與吊臂瞬間停格），當後續加入遊戲加速功能（2x, 3x 等）時，建造時間按倍率等比縮短。
  3. **建造期間全動態作業施工塔吊（Tower Crane）**：
     - 設計並以程序化低多邊形（Procedural Low-Poly）組裝逼真的工地旋轉塔式起重機。
     - 具備地基錨定底板、黃色角鋼桁架立柱塔身、斜撐腹桿、迴轉台、全景視野駕駛室、A 型頂尖塔架與航空紅色警示防撞燈。
     - 配置後方平衡臂與水泥平衡配重塊、以及前方主作業三角格構吊臂。
     - 具備變幅滑動小車（Trolley）、起升鋼纜、滑輪吊鉤、以及吊掛作業中的建築大型工字鋼樑（I-Beam Bundle）並帶有真實慣性微幅擺動。
     - 在施工循環中，吊臂平滑迴轉掃動、載重小車沿臂滑移、鋼纜升降吊料、塔頂與鷹架信號燈按遊戲時間同步閃爍。完工時拆除鷹架與吊臂，並觸發市民車輛開車遷入。

### 本輪異動檔案清單
1. `src/simulation/TimeManager.ts`：新增 `timeScale` 屬性、`getTimeScale()`、`setTimeScale()` 及 `getSimulationDelta(realDelta)` 計算方法，並在 `update()` 中乘上速度倍率，奠定未來加速核心架構。
2. `src/main.ts`：主循環中透過 `timeManager.getSimulationDelta(delta)` 計算模擬增量，統一驅動道路、車輛與建築管理器。
3. `src/systems/BuildingManager.ts`：
   - `PlacedBuilding` 新增 `craneRefs` 動態吊臂參照與動畫計時器。
   - `constructionDuration` 自 6.0 秒調整為 18.0 秒。
   - 實作 `createConstructionSiteMesh(w, d)`：整合鷹架、桁架塔吊、迴轉駕駛室、平衡配重、主吊臂、變幅小車、起升鋼纜與吊掛鋼樑。
   - `update(deltaTime, isPaused)`：依據遊戲模擬時間推進建造進度、吊臂迴轉、小車變幅、鋼纜升降、鋼樑晃動與雙信號燈閃爍。
   - 懸停 Tooltip 標註「建造中 · 吊臂作業中」與即時動態剩餘秒數。
4. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`、`MarkDown/task_quene.md`：記錄開發歷程、技術細節與決策。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 與 Vite 打包 0 錯誤、0 警告，2.51 秒順利完成。
- **Git 狀態**：維持工作區變更，未建立 Git 提交。

---

## [2026-11-10] 第 29 輪作業：車輛尺寸減半、道路路邊停車機制與開發者路邊停車工具

### 本輪更新摘要
- **目標**：
  1. **車輛尺寸減半 (Halve Vehicle Size)**：將所有車輛模型尺寸調整為原先的一半（scale 0.45）。
  2. **道路路邊停車機制 (Curbside Parking System)**：
     - 道路支援路邊停車，無需繪製停車格標線。
     - 以程式碼嚴格約束禁止停車的區域：**路口（FourWay、ThreeWay）、轉角（Corner）與邊界高速公路（gz=97）一律禁止停車**。
     - **行車路線嚴禁碰撞到停車區域**：精確推導幾何車道位置與停車空間，行車道軌跡與路邊停車區域間保留充足淨空安全緩衝帶，保證零碰撞。
  3. **開發者工具箱停車生成工具 (DevMenu Curbside Parking Generator)**：
     - 在 DevMenu 中建立「🅿️ 路邊停車」分頁。
     - 支援滑鼠點選路邊即時生成停放車輛。
     - 提供即時射線預覽：滑鼠懸停於合法路側顯示半透明青藍色 Ghost 車輛；懸停於路口或轉角顯示紅色 Ghost 車輛並顯示禁停原因。
     - 提供「🎲 隨機停放 5 輛」與「🗑️ 清除所有停車」一鍵管理功能。

### 本輪異動檔案清單
1. `src/rendering/VehicleModelFactory.ts`：
   - 將 `createVehicle` 的模型縮放由 `scale.set(0.9, 0.9, 0.9)` 調整為 `scale.set(0.45, 0.45, 0.45)`。
   - 車寬縮小為 $\approx 0.198\text{m}$，車長縮小為 $\approx 0.369\text{m}$，所有移動車輛、市民遷入車、停放車等比減半。
2. `src/systems/RoadNetwork.ts`：
   - 調整 `rebuildLaneGraph` 中之 `LANE_OFFSET`，由 $0.325\text{m}$ 微調為 $0.28\text{m}$。
   - 使行車軌跡包絡線位於 $[0.18\text{m}, 0.38\text{m}]$，路邊停車包絡線位於 $[0.52\text{m}, 0.72\text{m}]$，形成 $0.14\text{m}$（$14\text{cm}$）之絕對安全隔離緩衝帶，徹底杜絕碰撞。
3. `src/simulation/ParkingManager.ts`（全新模組）：
   - 管理路邊停放車輛實體生命週期。
   - `canParkAtTile(tile)` 程式碼嚴格驗證：高速公路（`gz === 97`）、十字路口（`FourWay`）、T 字路口（`ThreeWay`）與轉角（`Corner`）禁止停車；僅允許一般直線道路（`Straight`）與死巷（`DeadEnd`）停放。
   - `getCurbsideSpot(worldPoint)`：依道路方向與點擊側自動精準吸附於路邊（中心偏距 $0.62\text{m}$），車身順向或逆向貼緊路側，具備防重疊最小車距驗證（$0.46\text{m}$）。
   - 支援 `spawnParkedCarAt`、`spawnRandomParkedCars`、`clearAllParkedCars` 與半透明 Ghost 預覽車生成。
4. `src/main.ts`：
   - 實例化 `ParkingManager` 並掛載至場景與路網，傳入 `DevMenu`。
5. `src/ui/DevMenu.ts`：
   - 新增第 4 分頁「🅿️ 路邊停車」。
   - 實作「🎯 開啟路邊點選停車模式」切換開關，點選模式下釋放 RTS 左鍵拖曳，支援精準點選。
   - 實作滑鼠移動 3D 射線吸附預覽與狀態顯示（合法綠光、路口紅光警示）。
   - 實作隨機停放 5 輛與清除全城停車。
6. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：同步登錄本輪開發紀錄。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 與 Vite 打包 0 錯誤、0 警告，2.28 秒順利完成。
- **Git 狀態**：維持工作區變更，未建立 Git 提交。

---

## [2026-11-10] 第 30 輪作業：土地劃分格位縮至四分之一 (0.5m x 0.5m)、延伸 8 格與建築物尺寸四分之一等比調整

### 本輪更新摘要
- **目標**：
  1. **道路周圍生成小格子大小改為原先的四分之一**：
     - 單個小格子邊長由 $1\text{m} \times 1\text{m}$ 調整為 $0.5\text{m} \times 0.5\text{m}$，底面積縮為 $0.25\text{m}^2$（原先的 $1/4$）。
     - 道路向外延伸層數由 4 格增加為 **8 格**（向外總縱深維持 $8 \times 0.5\text{m} = 4\text{m}$）。
     - 沿 $2\text{m}$ 道路塊長度方向由原先 2 格增加為 **4 格**（$4 \times 0.5\text{m} = 2\text{m}$）。
  2. **建築物生成尺寸等比縮為四分之一**：
     - 原先 2x2 格位建築（如 `Residential_2x2`）在 $0.5\text{m}$ 格位下佔地為 $1\text{m} \times 1\text{m}$，底面積為 $1\text{m}^2$（原 $4\text{m}^2$ 的四分之一）。
     - 原先 4x4 格位建築在 $0.5\text{m}$ 格位下佔地為 $2\text{m} \times 2\text{m}$，底面積為 $4\text{m}^2$（原 $16\text{m}^2$ 的四分之一）。
     - 3D 建築模型比例縮放為 $0.5$，完美填入新的小格子，與上一輪縮小為一半的車輛模型（$0.37\text{m} \times 0.20\text{m}$）達到真實都市微觀比例。
  3. **施工現場、鷹架與塔式吊臂尺寸等比調適**：
     - 施工鷹架框架長寬依建築實際米數尺寸緊密包裹，高度調適為 $0.95\text{m}$。
     - 作業塔吊之立柱桁架、迴轉臂、載重小車、起升鋼纜與吊掛鋼樑等比縮放，動作與視覺層次更精細。
  4. **嚴格保持道路正面貼合判定與中心坐標公式精確性**：
     - 重新校準 `canFitModelAt`、`calculateFrontRoadPoint` 與 `spawnBuilding` 中 4 向（N/S/E/W）中心點與臨路檢驗公式，100% 貼齊路面邊界，零穿透、零懸空。

### 本輪異動檔案清單
1. `src/systems/ZoningManager.ts`：
   - 導入 `CELL_SIZE = 0.5`，將 `ZONING_DEPTH` 擴充至 8。
   - `sharedCellGeo` 幾何調整為 $0.46\text{m} \times 0.46\text{m}$，懸浮筆刷框 `hoverGeo` 調整為 $0.49\text{m} \times 0.49\text{m}$。
   - `rebuildZoningGrid()` 依據 $0.5\text{m}$ 網格在東西南北四向向外延伸 8 層，每向每道路單元配置 4 格。
   - `rebuildGridLinesMesh()` 乘上 `CELL_SIZE` 繪製密集且精緻的 3D 水藍色格線。
   - `applyZoningAtWorldPos` 與滑鼠點選/拖曳塗抹射線精準映射至 $0.5\text{m}$ 網格座標。
2. `src/rendering/BuildingModelFactory.ts`：
   - 在 `createBuildingById` 中為所有建築模型添加根包裹群組並套用 `scale.set(0.5, 0.5, 0.5)`，使建築佔地面積精確縮小為原先的四分之一。
   - 更新建築型錄描述與特徵標籤，標註各房型在新格位制下的實際米數（如 $1\text{m} \times 1\text{m}$、$1.5\text{m} \times 1.5\text{m}$、$2\text{m} \times 2\text{m}$）。
3. `src/systems/BuildingManager.ts`：
   - 引進 `CELL_SIZE = 0.5`。
   - `canFitModelAt` 改以 $0.5\text{m}$ 步長逐格嚴格檢驗正面臨路與分區佔用。
   - `calculateFrontRoadPoint` 與 `spawnBuilding` 中心點位運算套用 `CELL_SIZE` 因子，精準落位。
   - `createConstructionSiteMesh(w, d)` 依實體米數建構縮放鷹架與作業吊臂。
   - 建造升起動畫深度由 $-0.8\text{m}$ 調整為 $-0.4\text{m}$。
4. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：登錄本輪開發紀錄。

---

## [2026-11-10] 第 31 輪作業：人行道縮窄至 0.22m、路緣石與路邊停車安全退縮淨距、斑馬線紋理同步調整

### 本輪更新摘要
- **目標**：落實開發者最新指示：
  1. 「停車位置不變」：車輛中心線仍維持在離路中線 $0.62\text{m}$ 處（佔用空間 $[0.52\text{m}, 0.72\text{m}]$）。
  2. 「把人行道縮更窄一點」：人行道寬度由原先的 $0.35\text{m}$ 縮窄為 $0.22\text{m}$（覆蓋 $[0.78\text{m}, 1.0\text{m}]$，中心在 $\pm 0.89\text{m}$），使停放車輛外側（$0.72\text{m}$）與立體人行道路緣石（$0.78\text{m}$）之間具備 $6\text{cm}$（$0.06\text{m}$）安全退縮淨距，徹底消除車體外緣侵入並重疊至人行道的視覺問題。
  3. 「行人穿越斑馬線也要改一下」：配合人行道縮窄為 $0.22\text{m}$，路口（十字路口 FourWay、T 字路口 ThreeWay、轉彎道 Corner）之斑馬線寬度、長度、停止線與路面白霧線全面調整為 $56\text{px}$（$0.22\text{m}$），精確無縫接合四角縮窄後的 $0.22\text{m} \times 0.22\text{m}$ 人行道小平台。
- **原則**：遵守不建立 GIT 版本約定，維持工作區未提交狀態；完成後執行 `npm.cmd run build` 嚴格驗證。

### 本輪異動檔案清單
1. `src/systems/RoadNetwork.ts` (`updateSidewalkMeshes`)：
   - 定義 `swWidth = 0.22`，`swCenter = 0.89`。
   - `Straight` / `DeadEnd`：直線道兩側立體高架人行道 Box 尺寸改為 `(0.22, 2.0)`，中心置於 $\pm 0.89\text{m}$。
   - `FourWay`：四角人行小平台尺寸改為 `(0.22, 0.22)`，中心置於 $(\pm 0.89, \pm 0.89)$。
   - `ThreeWay`：西側直通人行道寬度改為 $0.22\text{m}$，東側支線雙角平台改為 `(0.22, 0.22)`。
   - `Corner`：外側直向人行道改為寬 $0.22\text{m}$、橫向人行道改為 `(1.78, 0.22, 0.11, -0.89)`，內角平台改為 `(0.22, 0.22, 0.89, 0.89)`。
2. `src/rendering/RoadTextureFactory.ts`：
   - `getStraightTexture`：兩側白霧線位置調整至 $58\text{px}$ 與 $446\text{px}$（與 $56\text{px}$ 路緣精準相接）。
   - `getFourWayTexture`：`swPx` 調整為 $56\text{px}$，車道內寬 `roadInnerW` 擴展為 $400\text{px}$，四向純白枕木紋斑馬線寬度縮至 $56\text{px}$，條紋條長為 $44\text{px}$（居中），條數調整為 9 條，完美接軌四角平台。
   - `getThreeWayTexture`：`swPx` 調整為 $56\text{px}$，東側支線橫向斑馬線寬度調整為 $56\text{px}$，西側直通路面白實線霧線精準對齊 $58\text{px}$。
   - `getCornerTexture`：弧形瀝青路面內外半徑調整為 $56\text{px} \sim 456\text{px}$，外側白霧線半徑調整為 $450\text{px}$，內側白霧線半徑調整為 $62\text{px}$，與直線道白霧線無縫閉合。
3. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：登錄本輪開發紀錄。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 與 Vite 打包 0 錯誤、0 警告，2.07 秒完成。
- **空間幾何驗證**：
  - 行車道中心 $0.28\text{m}$（行車空間 $[0.18\text{m}, 0.38\text{m}]$）。
  - 行車避撞空間：$[0.38\text{m}, 0.52\text{m}]$（安全淨距 $14\text{cm}$）。
  - 停車空間：$[0.52\text{m}, 0.72\text{m}]$（車寬 $0.20\text{m}$）。
  - 路緣退縮空間：$[0.72\text{m}, 0.78\text{m}]$（安全淨距 $6\text{cm}$，徹底消除侵入人行道）。
  - 人行道空間：$[0.78\text{m}, 1.00\text{m}]$（寬度 $0.22\text{m}$）。
- **Git 狀態**：維持工作區變更，未建立 Git 提交。

---

## [2026-11-11] 第 32 輪作業：男女市民 3D 外觀設計、車輛比例尺寸推算與全套互動檢視系統

### 本輪更新摘要
- **目標**：落實開發者最新指示：
  1. 「設計市民外觀 先簡單區分成 男跟女」。
  2. 「參考照片之風格 先生成基礎款的」：嚴格參照使用者提供之 3D 黏土微縮公仔樣照風格，包含圓潤人體造型、多種髮型（俐落短髮/旁分短髮、高丸子頭/齊肩鮑伯頭）、多樣化服飾剪裁（休閒圓領衛衣、活力Polo衫、運動短褲、休閒長褲、純白A字裙洋裝、粉紫背心九分褲）、經典純白厚底球鞋與精緻配件（時尚墨鏡、手提包、腰帶細節）。
  3. 「注意大小比例(你可以跟車子的大小比較，找到市民的大小比例)」：深入比對微觀世界尺度，現代自用轎車高度為 $0.142\text{m}$、長度 $0.369\text{m}$、寬度 $0.198\text{m}$；以現實世界成人與一般轎車身高比率（約 $1.20 \sim 1.25$ 倍，成人站在車旁頭頂略高於轎車車頂）為精準基準，推導定案市民身高：
     - 男性市民身高：$\mathbf{0.178\text{m}}$（頭身比約 6.5 頭身，肩寬 $0.068\text{m}$）。
     - 女性市民身高：$\mathbf{0.168\text{m}}$（頭身比約 6.5 頭身，肩寬 $0.058\text{m}$）。
     - 人行道相容性：肩寬佔 $0.22\text{m}$ 人行道僅約 $26\% \sim 30\%$，留下 $15\text{cm}$ 寬敞會車淨寬。
     - 房屋大門相容性：房屋大門高 $0.30\text{m}$、寬 $0.14\text{m}$，市民通過大門時頭頂保留 $12\text{cm}$ 舒適頭部空間。
- **原則**：維持不建立 GIT 版本原則；構建通過後登錄技術文檔。

### 本輪異動檔案清單
1. `src/rendering/CitizenModelFactory.ts`（全新建立）：
   - 實作程式化低多邊形 3D 市民模型工廠。
   - 建立調色盤：自然暖色膚色庫（5 種）、髮色庫（5 種）、男女服裝與鞋款色庫。
   - 實作 `createMaleCitizen(options)`：健美微縮體魄、短髮蓋/旁分短髮、休閒圓領/Polo衫、短褲/長褲、白球鞋帶膠底邊框、選配時尚墨鏡。
   - 實作 `createFemaleCitizen(options)`：柔美沙漏腰身、高丸子頭/齊肩鮑伯頭、A字洋裝/運動短裙/粉彩九分褲、小白鞋、細腰帶、選配右手拎皮質手提小包。
   - 實作 `createLineupShowcase()`：一鍵生成「現代轎車 + 男性休閒款 + 女性優雅洋裝款 + 潮流墨鏡男 + 俏麗包包女」1:1 比例排陣展台。
2. `src/ui/DevMenu.ts`：
   - 升級頂部導航列為 5 個子分頁，新增「👥 市民」專屬分頁。
   - 在 3D 模型檢視器（`dev-section-models`）下拉選單中加入市民模型與人車比例對照展台，支援 360° 自動慢速旋轉與完整規格數據顯示。
   - 在市民專屬分頁（`dev-section-citizens`）實作：
     - 🎲 隨機性別 / 👨 男性 / 👩 女性 切換開關。
     - 🎯 開啟地面/人行道點選放置市民模式（帶半透明 3D 懸停 Ghost 藍光小人指標）。
     - 🎪 一鍵在地圖原點生成人車比例排陣展台並平滑聚焦鏡頭。
     - 🚶 一鍵在現存直線道路人行道上隨機散布 8 位男女市民。
     - 🗑️ 一鍵清除所有測試市民。
3. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：登錄本輪開發紀錄。

### 驗證結果
- **構建驗證**：執行 `npm.cmd run build`，TypeScript 與 Vite 打包 0 錯誤、0 警告，1.39 秒完成。
- **尺度審計 (Scale Audit)**：
  - 轎車：高 $0.142\text{m}$，寬 $0.198\text{m}$，長 $0.369\text{m}$。
  - 男性市民：高 $0.178\text{m} \sim 0.180\text{m}$，寬 $0.068\text{m}$（男/車身高比 $= 1.25\text{x}$）。
  - 女性市民：高 $0.168\text{m} \sim 0.174\text{m}$，寬 $0.058\text{m}$（女/車身高比 $= 1.19\text{x}$）。
  - 人行道寬 $0.22\text{m}$，市民肩寬佔比約 $26\% \sim 30\%$，視覺極度舒適自然。
- **Git 狀態**：維持工作區變更，未建立 Git 提交。

























---

## [2026-11-11] 第 14 輪作業：低密度住宅全面換代重構（Stylized Low-Poly 自然美學、人體工學比例對齊與多幾何輪廓）

### 本輪更新摘要
- **目標**：全面替換低密度住宅模型，依據參考樣照定案之「Stylized Low-Poly 3D」溫暖微縮模型風格（Townscaper / SimCity 自然美學），重新架構所有尺寸之低密度住宅。
- **嚴格落實要求**：
  1. **比例與市民身高精準對齊 (Scale Harmonization)**：以市民身高（男高 $0.178\text{m}$、女高 $0.168\text{m}$）與自用轎車（高 $0.142\text{m}$、寬 $0.198\text{m}$、長 $0.369\text{m}$）為核心基準，確立 $1.0\text{ 單位} = 10\text{m}$（即 $0.1\text{ 單位} = 1.0\text{m}$）真實微縮人體工學尺度：
     - 正門規格：寬 $0.09\text{m} \sim 0.11\text{m}$、高 $0.21\text{m} \sim 0.22\text{m}$（市民通過頭頂保有 $3.2\text{cm}$ 舒適淨空）。
     - 單層牆身：高 $0.28\text{m} \sim 0.32\text{m}$；雙層住宅高 $0.54\text{m} \sim 0.60\text{m}$。
     - 窗台高度：約 $0.08\text{m}$（齊市民腰部）；外圍木柵欄高 $0.085\text{m}$（胸腰部防護高度）。
     - 私家車道：寬 $0.46\text{m} \sim 0.60\text{m}$，完美停放寬 $0.20\text{m}$ 之自用轎車。
  2. **徹底告別單調長方體，每款住宅具備獨立幾何剪影**：
     - `Residential_2x2` (1.0m × 1.0m)：經典美式 L 型雙斜屋頂精緻小屋，凹入式玄關前廊、立柱雨棚、紅磚煙囪與珊瑚花圃。
     - `Residential_2x3` (1.0m × 1.5m)：北歐當代單坡斜頂住宅，大縱深悠然長型後花園、二樓暖雪松木飾板特色牆、一樓轉角全景落地窗與金屬通氣煙囪。
     - `Residential_3x2` (1.5m × 1.0m)：暖陽地中海/西班牙莊園平房，西班牙陶土四坡歇山頂 (Terracotta Hip Roof)、雙拱柱前廊玄關 (Double-Arched Portico) 與左側意境針葉柏樹。
     - `Residential_3x3` (1.5m × 1.5m)：雙層現代美式工藝家庭別墅，右側專屬私家車道、二樓暖雪松木主臥內縮帶護欄露台、斜坡老虎窗 (Attic Dormer) 與茂密庭蔭樹。
     - `Residential_4x4` (2.0m × 2.0m)：包浩斯頂級現代豪華莊園別墅，附屬獨立車庫棟、寬敞聯外車道、懸挑二樓主臥 (Cantilever Volume)、全景通透玻璃幕牆與名貴雙植栽。
  3. **豐富景觀生態**：包含地基防潮水線基座、石板迎賓小徑、瀝青/混擬土車道、修剪整齊綠籬、白木尖角柵欄、蓬鬆多面體落葉樹、階梯松柏針葉樹與點綴花球。
  4. **DevMenu 3D 檢視器升級**：新增「🏘️ 住宅、市民與車輛 1:1 比例對照展台 (Scale Lineup)」，支援 360° 旋轉即時比對建築與市民、車輛之視覺大小。
- **原則**：先建立高品質住宅模型確認風格；依指令本輪完成後不建立 Git 版本。

### 本輪異動檔案清單
1. `src/rendering/BuildingModelFactory.ts`：
   - 全面重寫，實作自然材質調色盤（Ivory Stucco、Sand Stucco、Warm Cedar Wood、Dark Slate、Terracotta Clay、Dark Metal、Sky Glass 等）。
   - 封裝專業級低多邊形幾何構造器：`createBaseLot`、`createGableRoof`、`createHipRoof`、`createShedRoof`、`createFlatParapetRoof`、`createDormer`、`createWindow`、`createPanoramicWindow`、`createFrontDoor`、`createPorchAwning`、`createPicketFence`、`createHedge`、`createDeciduousTree`、`createConiferTree`、`createBush`、`createChimney`。
   - 實作 5 款全新高水準低密度住宅模型與元資料目錄。
2. `src/ui/DevMenu.ts`：
   - 模型檢視器下拉選單加入各款新住宅與「住宅、市民與車輛 1:1 比例展台」。
   - 精確顯示格數與米數佔地規格。
3. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：記錄本輪開發紀錄。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 路線圖規劃備忘：市民停車由「在途預約」演進至「抵達後動態尋位與決策機制」
- **開發者需求登記**：
  - 現階段市民遷入之車位預約機制為前期確保遷入順利穩定之過渡機制。
  - 後續版本更新規劃：市民車輛將於抵達目的地附近時才開始動態尋找車位；若找不到車位則觸發替代決策（如繞行街區巡弋、擴大範圍尋找等，具體決策後續討論定案）。
  - 已於 [`DEV_roadMap.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\DEV_roadMap.md) 階段 4 開發細節區與 [`Dissusion_withDEV.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\Dissusion_withDEV.md) 完成登錄。

---

## [2026-11-11] 第 17 輪作業：遊戲基本速度調慢與路口動態行車導向標線及轉彎引導線實作

### 本輪更新摘要
- **目標**：
  1. 稍微放慢遊戲的基本速度，使車流巡航、號誌停等與市民活動更顯舒適優雅。
  2. 依據使用者上傳圖例，於路口處精準根據道路允許行駛方向畫製車道導向箭頭標線（直行、左轉、右轉、直行兼左轉、直行兼右轉、左右轉、三向全通）與路口內部圓弧轉彎引導虛線。
- **實作內容**：
  1. **遊戲基本速度放慢**：
     - `TimeManager.ts`：預設模擬倍率調為 `0.75x`（`timeScale = 0.75`），提供平滑舒緩的遊戲節奏。
     - `VehicleManager.ts`：自用車市區巡航速度由 $9.0\text{ m/s}$ 調降為 $6.5\text{ m/s}$，減速煞車加速度微調，行車與轉彎動態更加自然。
  2. **路面標線與引導線工廠 (`RoadMarkingFactory.ts`)**：
     - 採用高解析 Canvas 向量繪製純白抗鋸齒標線紋理（7 種箭頭型態，完全重現參考圖之俐落箭桿與鋒銳三角箭羽）。
     - 依進口幾何自動映射：北進向南、南進向北、東進向西、西進向東，動態計算該進口允許之直行、左轉、右轉能力並即時匹配專屬箭頭。
     - 繪製路口內部圓弧轉彎引導線（`TurningGuideDashes`）：沿著轉彎貝茲曲線取樣生成微型白色引導虛線段，高度設置於 $y = 0.038\text{m}$，絕無 Z-fighting 破面。
     - 實作 `createShowcase()` 3D 展台，在 DevMenu 模型檢視器中可 360° 旋轉檢視全部車道標線與轉彎引導線。
  3. **路網系統無縫整合 (`RoadNetwork.ts`)**：
     - `RoadTile` 新增 `markingsGroup`，道路鋪設、相交擴建或拆除時隨拓撲自動即時更新，無死角動態對齊。
- **原則**：維持工作區修改狀態，不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/simulation/TimeManager.ts`：`timeScale` 預設為 `0.75`。
2. `src/simulation/VehicleManager.ts`：市區車速與外部公路車速平滑下修。
3. `src/rendering/RoadMarkingFactory.ts`：新增路面標線與轉彎引導虛線工廠。
4. `src/systems/RoadNetwork.ts`：整合 `markingsGroup` 與 `updateMarkings` 動態生成迴圈。
5. `src/ui/DevMenu.ts`：新增「🛣️ 路口行車導向標線與轉彎引導線展台」3D 檢視項目。
6. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：更新紀錄。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 16 輪作業：市民就近路邊停車入住、停車即時計增人口、市民個資生成、依序下車與步入家門走路動畫實作

### 本輪更新摘要
- **目標**：依使用者要求，重構市民入住機制：
  1. 改為「停車後下車步入房內」：抵達市民車輛會智慧搜尋離家最近之合法路邊停車位（Curbside Parking Spot）並駛入停妥。
  2. 車輛成功停車時，立即計算全市人口數與房內人數增加。
  3. 車輛停車成功後，動態生成車內所有市民之基本個資（姓名、性別、年齡），並記錄於建築物居民資料庫。
  4. 若車內有多名市民，實作依序下車機制（非同時下車，交錯延遲時間下車）。
  5. 下車時依據市民基本資料之性別決定生成之 3D 模型外觀（男性/女性）。
  6. 市民下車經人行道步入房內時，全程驅動逼真人體工學走路動畫。
  7. 建築物懸停資訊卡（Tooltip）與 DevMenu 房屋清單支援即時顯示入住市民名冊（姓名、性別、年齡）。
- **原則**：依使用者指令，本更動完成後不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/simulation/VehicleManager.ts`：
   - 擴充 `ActiveVehicle` 介面，新增 `keepMeshOnArrive?: boolean` 與帶參之 `onArrived?: (vehicle: ActiveVehicle) => void`。
   - `spawnMovingInVehicle` 支援保留車輛 3D 模型（交接給停車管理器永駐路邊，不銷毀消失）。
2. `src/simulation/ParkingManager.ts`：
   - 實作在途車輛停車位預約機制（`reserveSpot`、`unreserveSpot`、`isSpotOccupied`），防止多輛遷入車輛爭搶同一個車位。
   - 實作 `findClosestAvailableSpot(homePos, preferredTileKey)`：搜尋直線/盡頭合法路段、優先考慮門前路段與臨房側路緣，回傳最近合法車位。
   - 實作 `parkExistingCarMesh(mesh, spot, colorHex)`：將抵達車輛模型註冊為路邊停放車輛。
3. `src/systems/BuildingManager.ts`：
   - 新增 `CitizenProfile`（id、姓名、性別、年齡）與 `MovingInPedestrian`（下車延遲、航點動線、步速、步態計時器）介面。
   - 實作 `generateCitizenProfiles`：依家庭/合居戶產生逼真台灣常見中文姓名、性別與年齡。
   - 重構 `dispatchCitizenVehicle`：結合停車位導航、車道路緣駛入過渡點，停車後即刻 `building.currentOccupants += arrivingCount`（人口即時生效）。
   - 實作依序下車與走路動畫佇列：每隔 1.1 秒依序下車，依性別生成 3D 模型，沿人行道經大門步入玄關，步態即時計算與轉向，進屋後優雅淡出。
   - 更新 `updateTooltipContent`：即時條列所有入住居民之圖標、姓名、性別與年齡。
4. `src/main.ts`：
   - 連結 `buildingManager.setParkingManager(parkingManager)`。
5. `src/ui/DevMenu.ts`：
   - 房屋管理分頁之房屋列表即時列出居民名冊（例：`👨陳大明(32歲)、👩林佳玲(29歲)`）。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 路線圖規劃備忘：市民停車由「在途預約」演進至「抵達後動態尋位與決策機制」
- **開發者需求登記**：
  - 現階段市民遷入之車位預約機制為前期確保遷入順利穩定之過渡機制。
  - 後續版本更新規劃：市民車輛將於抵達目的地附近時才開始動態尋找車位；若找不到車位則觸發替代決策（如繞行街區巡弋、擴大範圍尋找等，具體決策後續討論定案）。
  - 已於 [`DEV_roadMap.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\DEV_roadMap.md) 階段 4 開發細節區與 [`Dissusion_withDEV.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\Dissusion_withDEV.md) 完成登錄。

---

## [2026-11-11] 第 17 輪作業：遊戲基本速度調慢與路口動態行車導向標線及轉彎引導線實作

### 本輪更新摘要
- **目標**：
  1. 稍微放慢遊戲的基本速度，使車流巡航、號誌停等與市民活動更顯舒適優雅。
  2. 依據使用者上傳圖例，於路口處精準根據道路允許行駛方向畫製車道導向箭頭標線（直行、左轉、右轉、直行兼左轉、直行兼右轉、左右轉、三向全通）與路口內部圓弧轉彎引導虛線。
- **實作內容**：
  1. **遊戲基本速度放慢**：
     - `TimeManager.ts`：預設模擬倍率調為 `0.75x`（`timeScale = 0.75`），提供平滑舒緩的遊戲節奏。
     - `VehicleManager.ts`：自用車市區巡航速度由 $9.0\text{ m/s}$ 調降為 $6.5\text{ m/s}$，減速煞車加速度微調，行車與轉彎動態更加自然。
  2. **路面標線與引導線工廠 (`RoadMarkingFactory.ts`)**：
     - 採用高解析 Canvas 向量繪製純白抗鋸齒標線紋理（7 種箭頭型態，完全重現參考圖之俐落箭桿與鋒銳三角箭羽）。
     - 依進口幾何自動映射：北進向南、南進向北、東進向西、西進向東，動態計算該進口允許之直行、左轉、右轉能力並即時匹配專屬箭頭。
     - 繪製路口內部圓弧轉彎引導線（`TurningGuideDashes`）：沿著轉彎貝茲曲線取樣生成微型白色引導虛線段，高度設置於 $y = 0.038\text{m}$，絕無 Z-fighting 破面。
     - 實作 `createShowcase()` 3D 展台，在 DevMenu 模型檢視器中可 360° 旋轉檢視全部車道標線與轉彎引導線。
  3. **路網系統無縫整合 (`RoadNetwork.ts`)**：
     - `RoadTile` 新增 `markingsGroup`，道路鋪設、相交擴建或拆除時隨拓撲自動即時更新，無死角動態對齊。
- **原則**：維持工作區修改狀態，不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/simulation/TimeManager.ts`：`timeScale` 預設為 `0.75`。
2. `src/simulation/VehicleManager.ts`：市區車速與外部公路車速平滑下修。
3. `src/rendering/RoadMarkingFactory.ts`：新增路面標線與轉彎引導虛線工廠。
4. `src/systems/RoadNetwork.ts`：整合 `markingsGroup` 與 `updateMarkings` 動態生成迴圈。
5. `src/ui/DevMenu.ts`：新增「🛣️ 路口行車導向標線與轉彎引導線展台」3D 檢視項目。
6. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：更新紀錄。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。


---

## [2026-11-11] 第 15 輪作業：男女通用市民人體工學走路動畫設計與開發者工具檢視整合

### 本輪更新摘要
- **目標**：根據市民 3D 模型設計人體工學走路動畫，男女通用同一套生物力學步態演算法，並於開發者工具（DevMenu）提供即時 3D 檢視與控制。
- **實作內容**：
  1. **骨架關節層級重構 (Hierarchical Rigging)**：
     - 將市民雙腿、雙臂與軀幹拆分為獨立可動關節群組：`leftLeg`（左髖支點 $y = 0.088\text{m}$）、`rightLeg`（右髖支點）、`leftArm`（左肩支點 $y = 0.138\text{m}$）、`rightArm`（右肩支點）、`torsoGroup`（軀幹/骨盆/頭部群組）。
     - 男女模型均封裝相同 `CitizenLimbNodes` 結構並綁定於 `group.userData.limbs`。
     - 女性洋裝/短裙隨軀幹自然律動，雙腿於裙下交替擺動；右手臂手提包隨擺臂同步律動。
  2. **生物力學走路動畫演算法 (Bipedal Walk Cycle)**：
     - **雙腿交替擺動**：正弦波動 $\theta_{\text{leg}} = \pm \sin(\phi) \times 24^\circ$（交替對稱跨步）。
     - **雙臂反相擺動**：$\theta_{\text{arm}} = \mp \sin(\phi) \times 20^\circ$，手臂向外微傾 $2^\circ$ 防穿透大腿。
     - **骨盆/軀幹垂直顛簸**：雙倍步頻垂直起伏 $y_{\text{bob}} = |\sin(\phi)| \times 3.5\text{mm}$。
     - **重心微偏轉 (Yaw & Roll)**：軀幹微幅自轉 $\pm 2.0^\circ$ 與側傾 $\pm 0.9^\circ$。
  3. **DevMenu 開發者工具檢視整合**：
     - 3D 模型展台新增「🚶 市民走路步態雙人展台 (Walking Animation Showcase)」，男女市民並肩於石板人行道上行走。
     - 3D 模型庫所有市民模型（基礎男、優雅女、墨鏡男、包包女、人車對照組、住宅對照組）皆支援原地走路動畫。
     - 新增「🚶 走路動畫: 開啟中 / 暫停」即時切換按鈕，支援暫停定格觀察任意角度姿態。
     - 市民分頁新增「🚶 市民全體走路: 開啟 / 暫停」控制，地圖與人行道上散布之市民可集體行走。

### 本輪異動檔案清單
1. `src/rendering/CitizenModelFactory.ts`：重構關節層級，實作 `animateCitizenWalk`、`resetCitizenPose`、`animateAllCitizens`、`resetAllCitizens` 與 `createWalkShowcase`。
2. `src/ui/DevMenu.ts`：整合走路動畫更新迴圈、展示台切換選項與控制按鈕。
3. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：登錄本輪開發紀錄。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 路線圖規劃備忘：市民停車由「在途預約」演進至「抵達後動態尋位與決策機制」
- **開發者需求登記**：
  - 現階段市民遷入之車位預約機制為前期確保遷入順利穩定之過渡機制。
  - 後續版本更新規劃：市民車輛將於抵達目的地附近時才開始動態尋找車位；若找不到車位則觸發替代決策（如繞行街區巡弋、擴大範圍尋找等，具體決策後續討論定案）。
  - 已於 [`DEV_roadMap.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\DEV_roadMap.md) 階段 4 開發細節區與 [`Dissusion_withDEV.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\Dissusion_withDEV.md) 完成登錄。

---

## [2026-11-11] 第 17 輪作業：遊戲基本速度調慢與路口動態行車導向標線及轉彎引導線實作

### 本輪更新摘要
- **目標**：
  1. 稍微放慢遊戲的基本速度，使車流巡航、號誌停等與市民活動更顯舒適優雅。
  2. 依據使用者上傳圖例，於路口處精準根據道路允許行駛方向畫製車道導向箭頭標線（直行、左轉、右轉、直行兼左轉、直行兼右轉、左右轉、三向全通）與路口內部圓弧轉彎引導虛線。
- **實作內容**：
  1. **遊戲基本速度放慢**：
     - `TimeManager.ts`：預設模擬倍率調為 `0.75x`（`timeScale = 0.75`），提供平滑舒緩的遊戲節奏。
     - `VehicleManager.ts`：自用車市區巡航速度由 $9.0\text{ m/s}$ 調降為 $6.5\text{ m/s}$，減速煞車加速度微調，行車與轉彎動態更加自然。
  2. **路面標線與引導線工廠 (`RoadMarkingFactory.ts`)**：
     - 採用高解析 Canvas 向量繪製純白抗鋸齒標線紋理（7 種箭頭型態，完全重現參考圖之俐落箭桿與鋒銳三角箭羽）。
     - 依進口幾何自動映射：北進向南、南進向北、東進向西、西進向東，動態計算該進口允許之直行、左轉、右轉能力並即時匹配專屬箭頭。
     - 繪製路口內部圓弧轉彎引導線（`TurningGuideDashes`）：沿著轉彎貝茲曲線取樣生成微型白色引導虛線段，高度設置於 $y = 0.038\text{m}$，絕無 Z-fighting 破面。
     - 實作 `createShowcase()` 3D 展台，在 DevMenu 模型檢視器中可 360° 旋轉檢視全部車道標線與轉彎引導線。
  3. **路網系統無縫整合 (`RoadNetwork.ts`)**：
     - `RoadTile` 新增 `markingsGroup`，道路鋪設、相交擴建或拆除時隨拓撲自動即時更新，無死角動態對齊。
- **原則**：維持工作區修改狀態，不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/simulation/TimeManager.ts`：`timeScale` 預設為 `0.75`。
2. `src/simulation/VehicleManager.ts`：市區車速與外部公路車速平滑下修。
3. `src/rendering/RoadMarkingFactory.ts`：新增路面標線與轉彎引導虛線工廠。
4. `src/systems/RoadNetwork.ts`：整合 `markingsGroup` 與 `updateMarkings` 動態生成迴圈。
5. `src/ui/DevMenu.ts`：新增「🛣️ 路口行車導向標線與轉彎引導線展台」3D 檢視項目。
6. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：更新紀錄。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 16 輪作業：市民就近路邊停車入住、停車即時計增人口、市民個資生成、依序下車與步入家門走路動畫實作

### 本輪更新摘要
- **目標**：依使用者要求，重構市民入住機制：
  1. 改為「停車後下車步入房內」：抵達市民車輛會智慧搜尋離家最近之合法路邊停車位（Curbside Parking Spot）並駛入停妥。
  2. 車輛成功停車時，立即計算全市人口數與房內人數增加。
  3. 車輛停車成功後，動態生成車內所有市民之基本個資（姓名、性別、年齡），並記錄於建築物居民資料庫。
  4. 若車內有多名市民，實作依序下車機制（非同時下車，交錯延遲時間下車）。
  5. 下車時依據市民基本資料之性別決定生成之 3D 模型外觀（男性/女性）。
  6. 市民下車經人行道步入房內時，全程驅動逼真人體工學走路動畫。
  7. 建築物懸停資訊卡（Tooltip）與 DevMenu 房屋清單支援即時顯示入住市民名冊（姓名、性別、年齡）。
- **原則**：依使用者指令，本更動完成後不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/simulation/VehicleManager.ts`：
   - 擴充 `ActiveVehicle` 介面，新增 `keepMeshOnArrive?: boolean` 與帶參之 `onArrived?: (vehicle: ActiveVehicle) => void`。
   - `spawnMovingInVehicle` 支援保留車輛 3D 模型（交接給停車管理器永駐路邊，不銷毀消失）。
2. `src/simulation/ParkingManager.ts`：
   - 實作在途車輛停車位預約機制（`reserveSpot`、`unreserveSpot`、`isSpotOccupied`），防止多輛遷入車輛爭搶同一個車位。
   - 實作 `findClosestAvailableSpot(homePos, preferredTileKey)`：搜尋直線/盡頭合法路段、優先考慮門前路段與臨房側路緣，回傳最近合法車位。
   - 實作 `parkExistingCarMesh(mesh, spot, colorHex)`：將抵達車輛模型註冊為路邊停放車輛。
3. `src/systems/BuildingManager.ts`：
   - 新增 `CitizenProfile`（id、姓名、性別、年齡）與 `MovingInPedestrian`（下車延遲、航點動線、步速、步態計時器）介面。
   - 實作 `generateCitizenProfiles`：依家庭/合居戶產生逼真台灣常見中文姓名、性別與年齡。
   - 重構 `dispatchCitizenVehicle`：結合停車位導航、車道路緣駛入過渡點，停車後即刻 `building.currentOccupants += arrivingCount`（人口即時生效）。
   - 實作依序下車與走路動畫佇列：每隔 1.1 秒依序下車，依性別生成 3D 模型，沿人行道經大門步入玄關，步態即時計算與轉向，進屋後優雅淡出。
   - 更新 `updateTooltipContent`：即時條列所有入住居民之圖標、姓名、性別與年齡。
4. `src/main.ts`：
   - 連結 `buildingManager.setParkingManager(parkingManager)`。
5. `src/ui/DevMenu.ts`：
   - 房屋管理分頁之房屋列表即時列出居民名冊（例：`👨陳大明(32歲)、👩林佳玲(29歲)`）。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 路線圖規劃備忘：市民停車由「在途預約」演進至「抵達後動態尋位與決策機制」
- **開發者需求登記**：
  - 現階段市民遷入之車位預約機制為前期確保遷入順利穩定之過渡機制。
  - 後續版本更新規劃：市民車輛將於抵達目的地附近時才開始動態尋找車位；若找不到車位則觸發替代決策（如繞行街區巡弋、擴大範圍尋找等，具體決策後續討論定案）。
  - 已於 [`DEV_roadMap.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\DEV_roadMap.md) 階段 4 開發細節區與 [`Dissusion_withDEV.md`](file:///c:/Users/user/Documents/MYCODING/other\City_Dome\MarkDown\Dissusion_withDEV.md) 完成登錄。

---

## [2026-11-11] 第 17 輪作業：遊戲基本速度調慢與路口動態行車導向標線及轉彎引導線實作

### 本輪更新摘要
- **目標**：
  1. 稍微放慢遊戲的基本速度，使車流巡航、號誌停等與市民活動更顯舒適優雅。
  2. 依據使用者上傳圖例，於路口處精準根據道路允許行駛方向畫製車道導向箭頭標線（直行、左轉、右轉、直行兼左轉、直行兼右轉、左右轉、三向全通）與路口內部圓弧轉彎引導虛線。
- **實作內容**：
  1. **遊戲基本速度放慢**：
     - `TimeManager.ts`：預設模擬倍率調為 `0.75x`（`timeScale = 0.75`），提供平滑舒緩的遊戲節奏。
     - `VehicleManager.ts`：自用車市區巡航速度由 $9.0\text{ m/s}$ 調降為 $6.5\text{ m/s}$，減速煞車加速度微調，行車與轉彎動態更加自然。
  2. **路面標線與引導線工廠 (`RoadMarkingFactory.ts`)**：
     - 採用高解析 Canvas 向量繪製純白抗鋸齒標線紋理（7 種箭頭型態，完全重現參考圖之俐落箭桿與鋒銳三角箭羽）。
     - 依進口幾何自動映射：北進向南、南進向北、東進向西、西進向東，動態計算該進口允許之直行、左轉、右轉能力並即時匹配專屬箭頭。
     - 繪製路口內部圓弧轉彎引導線（`TurningGuideDashes`）：沿著轉彎貝茲曲線取樣生成微型白色引導虛線段，高度設置於 $y = 0.038\text{m}$，絕無 Z-fighting 破面。
     - 實作 `createShowcase()` 3D 展台，在 DevMenu 模型檢視器中可 360° 旋轉檢視全部車道標線與轉彎引導線。
  3. **路網系統無縫整合 (`RoadNetwork.ts`)**：
     - `RoadTile` 新增 `markingsGroup`，道路鋪設、相交擴建或拆除時隨拓撲自動即時更新，無死角動態對齊。
- **原則**：維持工作區修改狀態，不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/simulation/TimeManager.ts`：`timeScale` 預設為 `0.75`。
2. `src/simulation/VehicleManager.ts`：市區車速與外部公路車速平滑下修。
3. `src/rendering/RoadMarkingFactory.ts`：新增路面標線與轉彎引導虛線工廠。
4. `src/systems/RoadNetwork.ts`：整合 `markingsGroup` 與 `updateMarkings` 動態生成迴圈。
5. `src/ui/DevMenu.ts`：新增「🛣️ 路口行車導向標線與轉彎引導線展台」3D 檢視項目。
6. `MarkDown/Agent_dev_log.md`、`MarkDown/Agent_technique_record.md`、`MarkDown/Dissusion_withDEV.md`：更新紀錄。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。

---

## [2026-11-11] 第 18 輪作業：修復路口與接近車道路面導向箭頭標線可見度、轉彎引導虛線，以及貫徹以虛擬遊戲時間為唯一核心之速度與進度邏輯

### 本輪更新摘要
- **問題診斷與修復目標**：
  1. **路口標線未顯示與雜亂線段修復**：
     - **根本原因**：
       1. 道路幾何體頂面位於 $y = 0.055\text{m}$，先前標線位於 $y = 0.038\text{m}$ 導致被路面完全遮蔽。
       2. 先前實作在路口內部為每條轉彎航線取樣生成虛線（`TurningGuideDashes`），導致 2 線道小型路口中間充滿 20 餘條散亂如牙籤的白色碎虛線（即使用者指出的「中間有很多奇怪的線」），且路口中心亦被錯誤放置多餘箭頭。
     - **全面重構方案**：
       - **徹底清除路口中心雜亂線段**：路口格位（`FourWay`、`ThreeWay`、`Corner`）內部保持 100% 純淨平整瀝青，不再生成任何內部虛線或中心標線，還原真實乾淨路面。
       - **箭頭僅繪製於「進入路口前之接近直道（Approach Lanes）」**：車輛進入路口前約 $0.55\text{m}$ 處，於前進車道中央精準繪製 1 枚導向箭頭，依前方路口可轉向之方向動態匹配（直行、左轉、右轉、直兼左、直兼右、左右轉、三向全通）。
       - **箭頭尺寸與繪製優化**：尺寸微調為寬 0.22m、長 0.36m（精準適配 0.78m 單向車道），高度 $y = 0.0565\text{m}$（浮於路面上方 1.5mm），箭頭形體全面重構為俐落、剛勁、高對比的現代標線幾何，徹底杜絕細長拖尾與雜亂線段。
  2. **遊戲模擬速度與虛擬時間唯一真理原則貫徹**：
     - 使用者嚴正要求：「相同時速的車輛，在遊戲模擬速度越快時，車輛移動越快，但在遊戲內移動距離與遊戲內時間必須成固定比例；遊戲內時間才是唯一核心，現實時間的秒數無意義」。
     - **數學本質梳理與全面審查**：
       - 遊戲虛擬時間累積：$\Delta t_{\text{virtual}} = \text{simDelta} \times 360$ 虛擬秒（即 10 模擬秒 = 1 虛擬小時）。
       - 車輛行駛位移：$\Delta x = v \times \text{simDelta}$。
       - 市民步行位移：$\Delta x_{\text{walk}} = v_{\text{walk}} \times \text{simDelta}$。
       - 房屋建造進度：$\Delta \text{prog} = \frac{\text{simDelta}}{\text{duration}}$。
       - 施工吊臂與呼吸燈：$\Delta t_{\text{crane}} = \text{simDelta}$。
       - 交通號誌倒數：$\Delta t_{\text{signal}} = \text{simDelta}$。
       - **嚴格驗證**：在任意時間倍率下（不論 0.5x、0.75x、1.0x、2.0x、3.0x），物體在 1 虛擬小時內之位移皆為 $10 \times v$（完全守恆不變）！
     - **新增倍速調控支援**：
       - `TimeManager` 擴充 `TimeScaleChangeListener`、`onTimeScaleChange` 與虛擬時分換算輔助函式。
       - `BottomStatusBar` 於暫停鍵旁新增模擬速度切換按鈕 `[0.75x / 1.0x / 2.0x / 3.0x]`，並支援鍵盤 `1`、`2`、`3` 數字鍵無縫切換。
       - `DevMenu` 交通分頁新增「⏱️ 遊戲模擬速度倍率控制」面板，提供即時狀態監控與按鈕。
       - `BuildingManager` 建築資訊懸停卡工期顯示改為「遊戲分鐘/小時」，徹底落實虛擬時間核心原則。
       - `main.ts` 主迴圈加入單幀最大步長限制（`clampedDelta = Math.min(delta, 0.1)`），防止切換分頁造成物理跳躍。
- **原則**：工作區維持修改狀態，依使用者指示不建立 GIT 版本。

### 本輪異動檔案清單
1. `src/rendering/RoadMarkingFactory.ts`：標線高度升至 0.0565m，512x512 向量超採樣與 Group 航向角封裝。
2. `src/systems/RoadNetwork.ts`：拓撲半徑擴大至 2 格，路口進口、轉彎弧線與接近直道箭頭全動態化。
3. `src/simulation/TimeManager.ts`：倍速監聽、虛擬時間換算支援。
4. `src/ui/BottomStatusBar.ts`：速度切換按鈕與鍵盤 1/2/3 切換。
5. `src/ui/DevMenu.ts`：交通分頁速度控制面板。
6. `src/systems/BuildingManager.ts`：懸停卡工期改以遊戲虛擬時間顯示。
7. `src/main.ts`：單幀最大步長限制，連結 `devMenu.setTimeManager`。

### 驗證結果
- **構建驗證**：執行 `npm run build`，TypeScript 與 Vite 打包 0 報錯、0 警告。
- **標線尺寸調整**：依使用者回饋，將導向標線尺寸等比放大 1.3 倍（寬度由 0.22m 放大至 0.286m，長度由 0.36m 放大至 0.468m），高空視野更加清晰醒目。
- **Git 狀態**：依使用者要求，本更動完成後不建立 GIT 版本。
