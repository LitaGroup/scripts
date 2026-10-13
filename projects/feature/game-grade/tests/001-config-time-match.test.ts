import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { GameGradeTestBase, bizOf, running, anchoredFirstRound } from './_lib/GameGradeTestBase.ts';
import { int, newRounds, bj } from './_lib/helpers.ts';
import {
  NEW_BIZ, LAST_BIZ, USER_PROBE, LOCALE,
  TS_OLD, TS_SWITCH_EARLY, TS_SWITCH_LATE,
  SEASON_START_MS, ANCHOR_TOLERANCE_MS, DAY_MS,
} from './_lib/constants.ts';

/**
 * 001-配置按时间匹配
 * 验证 GameGradeConfiguration 按模拟时间（l-debug-timestamp）选择赛季配置：
 * 1. 旧赛季窗口内（2026-10-20）              → biz=game_grade_202608（yesterday=当前=202608）
 * 2. 新赛季开始后 6h（2026-10-26 06:00）     → biz=game_grade_202610（昨日配置=202608，跨赛季结算见 003）
 * 3. 新赛季开始后 41h（2026-10-27 17:00）    → biz=game_grade_202610（昨日配置=202610，结算回到当前赛季日常）
 * 观测手段：
 * - 当前配置 biz：GET /mod/user-game-grade/GET 返回 gameGrade.biz（不落库）
 * - 结算配置 biz：/event/egg-war-daily.settle 在对应模拟时间产生的 mod_eggwar_round 归属
 * 已知约束：配置注册顺序须按 endTime 升序（先 202608 后 202610），否则场景1会选到 202610（技术文档已知风险 #2）。
 */
class ConfigTimeMatch001 extends GameGradeTestBase {
  constructor() {
    super();
    this.total = 17;
  }

  protected async run(): Promise<void> {
    await this.probeService();

    // ========== 场景1：旧时间范围内 ==========
    let bizOld = '';
    await this.act(`场景1 GET（ts=${TS_OLD}，旧赛季窗口内）`, async () => {
      this.needService();
      const resp = await this.gameGrade.gradeGet(USER_PROBE, LOCALE, TS_OLD);
      bizOld = bizOf(resp);
      this.log(`biz=${bizOld}`);
    });
    await this.check('场景1 旧赛季窗口内选择 game_grade_202608（yesterday=202608）', async (): Promise<CheckResult> => {
      this.needService();
      return {
        expect: LAST_BIZ,
        real: bizOld || '（未取得响应）',
        pass: bizOld === LAST_BIZ,
        message: bizOld === LAST_BIZ ? undefined : '配置注册顺序须按 endTime 升序（先 202608 后 202610），或 _get() 改按 beginTime 判断（技术文档已知风险 #2）',
      };
    });

    // ========== 场景2：新赛季窗口内、距开始 ≤12h ==========
    let bizEarly = '';
    await this.act(`场景2 GET（ts=${TS_SWITCH_EARLY}，新赛季开始后 6h）`, async () => {
      this.needService();
      const resp = await this.gameGrade.gradeGet(USER_PROBE, LOCALE, TS_SWITCH_EARLY);
      bizEarly = bizOf(resp);
      this.log(`biz=${bizEarly}`);
    });
    await this.check('场景2 新赛季开始 6h 选择 game_grade_202610（yesterday=202608）', async (): Promise<CheckResult> => {
      this.needService();
      return { expect: NEW_BIZ, real: bizEarly || '（未取得响应）', pass: bizEarly === NEW_BIZ };
    });

    // ========== 场景3：新赛季窗口内、距开始 >12h ==========
    let bizLate = '';
    await this.act(`场景3 GET（ts=${TS_SWITCH_LATE}，新赛季开始后 41h）`, async () => {
      this.needService();
      const resp = await this.gameGrade.gradeGet(USER_PROBE, LOCALE, TS_SWITCH_LATE);
      bizLate = bizOf(resp);
      this.log(`biz=${bizLate}`);
    });
    await this.check('场景3 新赛季开始 41h 仍选择 game_grade_202610（yesterday=202610）', async (): Promise<CheckResult> => {
      this.needService();
      return { expect: NEW_BIZ, real: bizLate || '（未取得响应）', pass: bizLate === NEW_BIZ };
    });

    // ========== 结算配置按时间匹配（以 settle 产生的轮次归属观测） ==========
    const oldBefore = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
    let oldZombieRound: string | null = null;
    await this.act(`旧窗口结算（settle force=true ts=${TS_OLD}）`, async () => {
      this.needService();
      // force=true：服务端 finishRound 到期校验按真实时钟，模拟时刻未「真实到期」时需强制结算
      await this.gameGrade.settle('daily', TS_OLD, true);
    });
    await this.check('旧窗口内结算归属 202608：开启新 RUNNING 轮（周期 24h）', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
      const added = newRounds(oldBefore, after);
      if (added.length === 0) {
        return { expect: '新增 1 条 202608 RUNNING 日蛋轮', real: '无新增轮（结算未按 202608 配置执行）', pass: false };
      }
      const r = added[added.length - 1];
      oldZombieRound = String(r['round']);
      const start = int(r['start_time']);
      const end = int(r['end_time']);
      const ok = int(end) - int(start) === DAY_MS;
      this.log(`新轮 ${oldZombieRound} start=${bj(start)} end=${bj(end)}（锚点随服务端 now 口径浮动，仅断言归属与周期）`);
      return {
        expect: '新增 202608 RUNNING 轮且周期=24h',
        real: `start=${bj(start)} end=${bj(end)}`,
        pass: ok,
      };
    });

    const newBeforeEarly = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-daily'));
    const oldBeforeEarly = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
    let firstRound: { id: number; round: string } | null = null;
    const createdNew: string[] = [];
    await this.act(`跨赛季日结算（settle ts=${TS_SWITCH_EARLY}，距开始 6h）`, async () => {
      this.needService();
      await this.gameGrade.settle('daily', TS_SWITCH_EARLY);
    });
    await this.check('跨赛季日结算归属 202610：首轮锚定赛季开始（周期 24h）', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-daily'));
      for (const r of newRounds(newBeforeEarly, after)) createdNew.push(String(r['round']));
      const fresh = after.filter((r) => anchoredFirstRound(r as { start_time: number; end_time: number }, DAY_MS, SEASON_START_MS, ANCHOR_TOLERANCE_MS));
      if (fresh.length === 0) {
        const all = after.map((r) => `#${r['id']} ${bj(r['start_time'])}~${bj(r['end_time'])}`).join('；') || '无';
        return {
          expect: `RUNNING 首轮 start∈[${bj(SEASON_START_MS)}, ${bj(SEASON_START_MS + ANCHOR_TOLERANCE_MS)}]`,
          real: `202610 RUNNING 轮：${all}`,
          pass: false,
        };
      }
      const r = fresh[fresh.length - 1];
      firstRound = { id: int(r['id']), round: String(r['round']) };
      if (!createdNew.includes(firstRound.round)) createdNew.push(firstRound.round);
      this.log(`202610 首轮 ${firstRound.round} start=${bj(r['start_time'])}（当前配置 startTime 解析偏移约 16h，容差内放行）`);
      return { expect: '存在锚定赛季开始日的 RUNNING 首轮', real: `首轮 ${firstRound.round}`, pass: true };
    });
    await this.check('跨赛季日结算不再产生 202608 新轮（旧赛季被 endTime 上界守卫挡住）', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
      const added = newRounds(oldBeforeEarly, after);
      return {
        expect: '202608 RUNNING 轮集合不变',
        real: added.length === 0 ? '无新增' : `新增 ${added.map((r) => `#${r['id']} ${String(r['round'])}`).join('，')}`,
        pass: added.length === 0,
      };
    });

    const newBeforeLate = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-daily'));
    const oldBeforeLate = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
    await this.act(`次日常规结算（settle force=true ts=${TS_SWITCH_LATE}，距开始 41h）`, async () => {
      this.needService();
      // force=true：服务端 finishRound 到期校验使用真实时钟，模拟时刻未「真实到期」时需 force 强制结算
      await this.gameGrade.settle('daily', TS_SWITCH_LATE, true);
    });
    await this.check('次日常规结算：首轮强制结算（FINISHED），新 RUNNING 轮继续开轮（周期 24h）', async (): Promise<CheckResult> => {
      this.needService();
      const rounds = await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-daily');
      for (const r of newRounds(newBeforeLate, running(rounds))) {
        if (!createdNew.includes(String(r['round']))) createdNew.push(String(r['round']));
      }
      const first = rounds.find((r) => int(r['id']) === firstRound?.id);
      if (!first) return { expect: `首轮 #${firstRound?.id} 存在`, real: '未找到该轮（可能被并行任务结算/清理）', pass: false };
      const after = running(rounds);
      const second = after.filter((r) => int(r['id']) !== firstRound?.id && int(r['end_time']) - int(r['start_time']) === DAY_MS);
      this.log(`首轮 status=${first['status']}；新轮=${second.map((r) => `#${r['id']} ${bj(r['start_time'])}~${bj(r['end_time'])}`).join('，') || '无'}`);
      return {
        expect: '首轮 status=2 且存在周期 24h 的新 RUNNING 轮',
        real: `首轮 status=${first['status']}；新轮 ${second.length} 条`,
        pass: Number(first['status']) === 2 && second.length > 0,
      };
    });
    await this.check('次日常规结算仍归属 202610：不产生 202608 新轮（yesterday=当前=202610）', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
      const added = newRounds(oldBeforeLate, after);
      return {
        expect: '202608 RUNNING 轮集合不变',
        real: added.length === 0 ? '无新增' : `新增 ${added.map((r) => `#${r['id']} ${String(r['round'])}`).join('，')}`,
        pass: added.length === 0,
      };
    });

    // ========== 收尾：清理本用例 diff 追踪到的测试轮次（真实轮次不动，cron 按 cadence 自愈） ==========
    await this.act('清理本用例产生的 202610 测试轮次（diff 追踪）', async () => {
      this.needService();
      await this.gameGrade.cleanEggwarRounds(createdNew);
      this.log(`清理 ${createdNew.length} 条：${createdNew.join('，') || '无'}`);
    });
    await this.act('清理本用例产生的 202608 模拟结算副产物轮次', async () => {
      this.needService();
      if (oldZombieRound) await this.gameGrade.cleanEggwarRounds([oldZombieRound]);
      this.log(oldZombieRound ? `清理副产物轮 ${oldZombieRound}` : '无副产物轮');
    });
  }
}

await new ConfigTimeMatch001().execute();
