import { WorldTime } from '../types';

export type TimeChangeListener = (time: WorldTime) => void;
export type PauseChangeListener = (isPaused: boolean) => void;

/**
 * 虛擬世界時間管理器
 * 負責處理遊戲時間推進、開始/暫停與日期計算
 */
export class TimeManager {
  private time: WorldTime;
  private isPaused: boolean = false;
  private virtualSecondsAccumulator: number = 0;
  
  // 1 實際秒 = 6 虛擬分鐘 (即 10 實際秒 = 1 虛擬小時)
  private virtualSecondsPerRealSecond: number = 360;

  private timeListeners: Set<TimeChangeListener> = new Set();
  private pauseListeners: Set<PauseChangeListener> = new Set();

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

    this.time.totalTicks++;
    this.virtualSecondsAccumulator += deltaTime * this.virtualSecondsPerRealSecond;

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
