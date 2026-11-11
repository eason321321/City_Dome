import { WorldTime } from '../types';

export type TimeChangeListener = (time: WorldTime) => void;
export type PauseChangeListener = (isPaused: boolean) => void;
export type TimeScaleChangeListener = (timeScale: number) => void;

/**
 * 虛擬世界時間管理器
 * 負責處理遊戲時間推進、開始/暫停與日期計算
 */
export class TimeManager {
  private time: WorldTime;
  private isPaused: boolean = false;
  private timeScale: number = 0.75; // 遊戲模擬速度倍率 (預設 0.75x，依指示適度放慢基本速度提供更舒適觀察節奏)
  private virtualSecondsAccumulator: number = 0;
  
  // 1 實際秒 = 6 虛擬分鐘 (即 10 實際秒 = 1 虛擬小時)
  private virtualSecondsPerRealSecond: number = 360;

  private timeListeners: Set<TimeChangeListener> = new Set();
  private pauseListeners: Set<PauseChangeListener> = new Set();
  private timeScaleListeners: Set<TimeScaleChangeListener> = new Set();

  constructor(initialYear = 2027, initialMonth = 1, initialDay = 1, initialHour = 6, initialMinute = 0) {
    this.time = {
      totalTicks: 0,
      year: initialYear,
      month: initialMonth,
      day: initialDay,
      hour: initialHour,
      minute: initialMinute,
    };
  }

  public getTime(): Readonly<WorldTime> {
    return { ...this.time };
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public getTimeScale(): number {
    return this.timeScale;
  }

  public setTimeScale(scale: number): void {
    const clamped = Math.max(0, scale);
    if (this.timeScale !== clamped) {
      this.timeScale = clamped;
      for (const listener of this.timeScaleListeners) {
        listener(this.timeScale);
      }
    }
  }

  public onTimeScaleChange(listener: TimeScaleChangeListener): () => void {
    this.timeScaleListeners.add(listener);
    listener(this.timeScale);
    return () => this.timeScaleListeners.delete(listener);
  }

  /**
   * 取得虛擬時間比例換算常數
   * 1 模擬秒 = 360 虛擬秒 = 6 虛擬分鐘 (10 模擬秒 = 1 虛擬小時)
   */
  public getVirtualSecondsPerSimSecond(): number {
    return this.virtualSecondsPerRealSecond;
  }

  /**
   * 將模擬時間秒數轉換為虛擬遊戲分鐘數
   */
  public toVirtualMinutes(simSeconds: number): number {
    return simSeconds * (this.virtualSecondsPerRealSecond / 60);
  }

  /**
   * 將模擬時間秒數轉換為虛擬遊戲小時數
   */
  public toVirtualHours(simSeconds: number): number {
    return simSeconds * (this.virtualSecondsPerRealSecond / 3600);
  }

  /**
   * 計算該幀之模擬時間增量 (Game Simulation Delta)
   * 若遊戲暫停則為 0；若遊戲加速則乘上倍率
   */
  public getSimulationDelta(realDelta: number): number {
    if (this.isPaused || realDelta <= 0) return 0;
    return realDelta * this.timeScale;
  }

  public togglePause(): boolean {
    this.isPaused = !this.isPaused;
    this.notifyPauseListeners();
    return this.isPaused;
  }

  public pause(): void {
    if (!this.isPaused) {
      this.isPaused = true;
      this.notifyPauseListeners();
    }
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.notifyPauseListeners();
    }
  }

  public onTimeChange(listener: TimeChangeListener): () => void {
    this.timeListeners.add(listener);
    // 立即以當前時間通知一次
    listener(this.getTime());
    return () => this.timeListeners.delete(listener);
  }

  public onPauseChange(listener: PauseChangeListener): () => void {
    this.pauseListeners.add(listener);
    listener(this.isPaused);
    return () => this.pauseListeners.delete(listener);
  }

  private notifyTimeListeners(): void {
    const currentTime = this.getTime();
    for (const listener of this.timeListeners) {
      listener(currentTime);
    }
  }

  private notifyPauseListeners(): void {
    for (const listener of this.pauseListeners) {
      listener(this.isPaused);
    }
  }

  /**
   * 計算該月份最大天數（含閏年判斷）
   */
  private getDaysInMonth(year: number, month: number): number {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month - 1] ?? 30;
  }

  /**
   * 每幀更新世界時間
   * @param deltaTime 距上一幀的秒數
   */
  public update(deltaTime: number): void {
    if (this.isPaused || deltaTime <= 0) return;

    const simDelta = deltaTime * this.timeScale;
    this.time.totalTicks++;
    this.virtualSecondsAccumulator += simDelta * this.virtualSecondsPerRealSecond;

    let hasChanged = false;

    while (this.virtualSecondsAccumulator >= 60) {
      this.virtualSecondsAccumulator -= 60;
      this.time.minute++;
      hasChanged = true;

      if (this.time.minute >= 60) {
        this.time.minute = 0;
        this.time.hour++;

        if (this.time.hour >= 24) {
          this.time.hour = 0;
          this.time.day++;

          const daysInCurrentMonth = this.getDaysInMonth(this.time.year, this.time.month);
          if (this.time.day > daysInCurrentMonth) {
            this.time.day = 1;
            this.time.month++;

            if (this.time.month > 12) {
              this.time.month = 1;
              this.time.year++;
            }
          }
        }
      }
    }

    if (hasChanged) {
      this.notifyTimeListeners();
    }
  }
}
