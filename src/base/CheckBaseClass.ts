export interface CheckResult {
  expect: string;
  real: string;
  pass?: boolean;
  message?: string;
}

class SkipSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkipSignal';
  }
}

export abstract class CheckBaseClass {
  protected total = 0;

  private startMs = 0;
  private started = false;
  private no = 0;
  private successCount = 0;
  private failCount = 0;
  private skipCount = 0;
  private failures: string[] = [];

  protected abstract run(): Promise<void>;

  async execute(): Promise<void> {
    this.emitStart();
    let runError: Error | null = null;
    try {
      await this.run();
    } catch (e) {
      runError = e as Error;
      this.log(`run() 异常: ${(e as Error).message}`);
    }
    this.emitDone(runError);
  }

  protected skip(message = 'skipped'): never {
    throw new SkipSignal(message);
  }

  protected log(message: string): void {
    this.emit('log', message);
  }

  protected async act(title: string, fn: () => unknown | Promise<unknown>): Promise<void> {
    this.ensureStarted();
    this.no++;
    let status: 'success' | 'fail' | 'skip' = 'success';
    let message = '';
    try {
      await fn();
      this.successCount++;
    } catch (e) {
      if (e instanceof SkipSignal) {
        status = 'skip';
        message = e.message;
        this.skipCount++;
      } else {
        status = 'fail';
        message = (e as Error).message;
        this.failCount++;
        this.failures.push(`${title}: ${message}`);
      }
    }
    this.emit('act', { no: this.no, title, status, message, time: this.elapsed() });
  }

  /**
   * 与 act 相同的步骤输出/计时，但返回 fn 的结果，便于后续步骤复用查询结果。
   * 步骤失败（或 skip）时抛出异常，避免用 undefined 继续拼装结果。
   */
  protected async step<T>(title: string, fn: () => T | Promise<T>): Promise<T> {
    const failBefore = this.failCount;
    const skipBefore = this.skipCount;
    let result: T | undefined;
    await this.act(title, async () => {
      result = await fn();
    });
    if (this.skipCount > skipBefore) {
      throw new SkipSignal(title);
    }
    if (this.failCount > failBefore) {
      throw new Error(`步骤失败: ${title}`);
    }
    return result as T;
  }

  protected async check(title: string, fn: () => CheckResult | Promise<CheckResult>): Promise<void> {
    this.ensureStarted();
    this.no++;
    let status: 'success' | 'fail' | 'skip' = 'success';
    let expect = '';
    let real = '';
    let message = '';
    try {
      const r = await fn();
      expect = r?.expect ?? '';
      real = r?.real ?? '';
      const pass = r?.pass ?? (expect === real);
      if (pass) {
        status = 'success';
        this.successCount++;
      } else {
        status = 'fail';
        message = r?.message ?? `期望 ${expect}，实际 ${real}`;
        this.failCount++;
        this.failures.push(`${title}: ${message}`);
      }
    } catch (e) {
      if (e instanceof SkipSignal) {
        status = 'skip';
        message = e.message;
        this.skipCount++;
      } else {
        status = 'fail';
        message = (e as Error).message;
        this.failCount++;
        this.failures.push(`${title}: ${message}`);
      }
    }
    this.emit('check', { no: this.no, title, expect, real, status, message, time: this.elapsed() });
  }

  private ensureStarted(): void {
    if (!this.started) {
      this.emitStart();
    }
  }

  protected emitStart(): void {
    this.startMs = Date.now();
    this.started = true;
    this.emit('start', { total: this.total, time: 0, startTime: new Date(this.startMs).toISOString() });
  }

  protected emitDone(runError: Error | null): void {
    const time = this.elapsed();
    const status = this.failCount > 0 || runError !== null ? 'fail' : 'success';
    const message = runError
      ? runError.message
      : this.failures.length > 0
        ? this.failures.slice(0, 5).join('；') + (this.failures.length > 5 ? ` 等${this.failures.length}条` : '')
        : '';
    this.emit('done', {
      status,
      total: this.no,
      success: this.successCount,
      fail: this.failCount,
      skip: this.skipCount,
      message,
      time,
      cost: time,
    });
  }

  protected elapsed(): number {
    return Date.now() - this.startMs;
  }

  protected emit(type: string, data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    process.stdout.write(`[${type}] ${payload}\n`);
  }
}
