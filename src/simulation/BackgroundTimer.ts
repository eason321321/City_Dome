/**
 * 背景心跳定時器 (Background Timer)
 * 
 * 解決現代瀏覽器在分頁切換至後台或最小化時，requestAnimationFrame 與主執行緒計時器被凍結的問題。
 * 透過 Web Worker（不受瀏覽器標籤頁凍結限制）在背景定時發送 tick 訊號，
 * 確保城市世界的模擬（時間流逝、車輛行駛、路網號誌、建築施工與市民活動）持續推進。
 */
export class BackgroundTimer {
  private worker: Worker | null = null;
  private intervalId: number | null = null;
  private isRunning: boolean = false;
  private lastTickTime: number = 0;
  private readonly intervalMs: number;
  private readonly onTick: (delta: number) => void;

  /**
   * @param targetFps 目標心跳頻率 (預設 30 FPS，兼顧流暢度與超低 CPU 佔用)
   * @param onTick 每次心跳回呼，提供真實經過之步長秒數 (delta)
   */
  constructor(targetFps: number = 30, onTick: (delta: number) => void) {
    const fps = Math.max(1, targetFps);
    this.intervalMs = Math.round(1000 / fps);
    this.onTick = onTick;
    this.initWorker();
  }

  /**
   * 初始化內聯 Web Worker (透過 Blob URL，無需額外建置設定，各環境皆通用)
   */
  private initWorker(): void {
    try {
      const workerScript = `
        var timerId = null;
        self.onmessage = function(e) {
          if (e.data && e.data.action === 'start') {
            if (timerId !== null) clearInterval(timerId);
            timerId = setInterval(function() {
              self.postMessage('tick');
            }, e.data.interval || 33);
          } else if (e.data && e.data.action === 'stop') {
            if (timerId !== null) {
              clearInterval(timerId);
              timerId = null;
            }
          }
        };
      `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e: MessageEvent) => {
        if (e.data === 'tick' && this.isRunning) {
          this.handleTick();
        }
      };

      this.worker.onerror = (err) => {
        console.warn('⚠️ Web Worker 內部錯誤，切換為 window.setInterval 備援:', err);
        this.fallbackToInterval();
      };
    } catch (err) {
      console.warn('⚠️ Web Worker 建立失敗，降級為 window.setInterval 備援:', err);
      this.fallbackToInterval();
    }
  }

  private fallbackToInterval(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
  }

  /**
   * 處理單次心跳並計算真實時間增量
   */
  private handleTick(): void {
    const now = performance.now();
    if (this.lastTickTime === 0) {
      this.lastTickTime = now;
      return;
    }

    const rawDelta = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    // 限制單步步長最大 0.1s，防止極端狀態下的突躍
    const clampedDelta = Math.min(Math.max(rawDelta, 0), 0.1);
    this.onTick(clampedDelta);
  }

  /**
   * 啟動背景心跳
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTickTime = performance.now();

    if (this.worker) {
      this.worker.postMessage({ action: 'start', interval: this.intervalMs });
    } else {
      if (this.intervalId !== null) clearInterval(this.intervalId);
      this.intervalId = window.setInterval(() => {
        if (this.isRunning) {
          this.handleTick();
        }
      }, this.intervalMs);
    }
  }

  /**
   * 停止背景心跳
   */
  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.lastTickTime = 0;

    if (this.worker) {
      this.worker.postMessage({ action: 'stop' });
    }
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 釋放資源
   */
  public destroy(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
