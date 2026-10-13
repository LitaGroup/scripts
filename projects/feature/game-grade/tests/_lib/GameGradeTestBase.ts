import { TestBaseClass } from '../../../../../src/base/TestBaseClass.ts';

/**
 * game-grade 用例基类。
 * 首个 act 探测 /v1/gameGrade/doc 可访问性（feature 分支部署 + 网关路由 active-main）。
 * 注意：懒切换/结算的时间窗校验跟随 l-debug-timestamp；配置选择 _get() 按 endTime>now 取第一个。
 */
export abstract class GameGradeTestBase extends TestBaseClass {
  private serviceReady: boolean | null = null;

  /** 第一步：探测服务可访问 */
  protected async probeService(): Promise<void> {
    await this.act('探测 gameGrade 服务可访问（GET /v1/gameGrade/doc）', async () => {
      try {
        const doc = await this.gameGrade.doc();
        const pipelines = Array.isArray(doc['pipelines']) ? (doc['pipelines'] as unknown[]) : [];
        if (pipelines.length === 0) throw new Error('doc 返回 pipelines 为空');
        this.serviceReady = true;
        this.log(`pipelines=${pipelines.length}`);
      } catch (e) {
        this.serviceReady = false;
        throw new Error(`gameGrade 服务不可访问：${(e as Error).message}（确认测试环境已部署 feat-game-grade-v3 且网关前缀 active-main 可用）`);
      }
    });
  }

  /** 后续步骤前置：服务不可访问时 skip */
  protected needService(): void {
    if (this.serviceReady === false) this.skip('gameGrade 服务不可访问（见首个 act 失败原因）');
  }
}

/** 断言当前 biz（GET user-game-grade 返回的 gameGrade.biz 即配置选择的 biz） */
export function bizOf(getResp: Record<string, unknown>): string {
  const gg = (getResp['gameGrade'] ?? {}) as Record<string, unknown>;
  return String(gg['biz'] ?? '');
}

/** 从轮次集合中筛 RUNNING（status=1） */
export function running(rounds: { status: number }[]): { status: number }[] {
  return rounds.filter((r) => Number(r.status) === 1);
}

/** 新赛季首轮锚定校验：start 落在 [赛季开始, 开始+容差]，且周期长度正确 */
export function anchoredFirstRound(r: { start_time: number; end_time: number }, durationMs: number, seasonStartMs: number, toleranceMs: number): boolean {
  const start = Number(r.start_time);
  const end = Number(r.end_time);
  return end - start === durationMs && start >= seasonStartMs && start <= seasonStartMs + toleranceMs;
}
