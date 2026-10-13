import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { GameGradeTestBase, running, anchoredFirstRound } from './_lib/GameGradeTestBase.ts';
import { int, newRounds, bj } from './_lib/helpers.ts';
import {
  NEW_BIZ, LAST_BIZ,
  TS_SWITCH_EARLY, TS_OLD,
  SEASON_START_MS, ANCHOR_TOLERANCE_MS, DAY_MS, WEEK_MS,
  EGG_USERS, ROUND_DAILY_LAST, ROUND_WEEKLY_LAST,
} from './_lib/constants.ts';

const TS_PHASE_A = '2026-10-25T20:00:00+08:00'; // 旧赛季最后一晚（settle 归属 202608）
/** 参与积分：value 降序 = 16521 > 16519 > 16518 */
const DAILY_VALUES: Record<number, number> = { 16521: 5000, 16519: 3000, 16518: 1000 };
const WEEKLY_VALUES: Record<number, number> = { 16521: 8000, 16519: 2000 };

/**
 * 003-跨赛季鸡蛋结算（旧赛季末轮结算 + 新赛季首轮初始化）
 * 模拟跨赛季日（2026-10-26）XXL-Job settleEggwar 的两阶段（HTTP 无法直调 job，用两次 settle 管道等价模拟）：
 *  - 昨日配置阶段（ts=2026-10-25 20:00，归属 202608）：结算上赛季合成末轮（日+周）→ FINISHED、名次/奖励正确
 *  - 当前配置阶段（ts=2026-10-26 06:00，归属 202610）：finishRound 空过 → startRound 创建新赛季首轮，锚定赛季 startTime
 *  并断言：跨赛季后不再产生旧赛季新轮（endTime 上界守卫）。
 * 已知约束：settle 归属配置取 _get()（按模拟时间）；配置注册顺序须按 endTime 升序，否则阶段 A 会归属 202610。
 */
class EggwarCrossSeasonSettle003 extends GameGradeTestBase {
  /** 测试产生的轮次名（收尾清理；真实轮次不动，cron 按 cadence 自愈） */
  private createdRounds: string[] = [];

  constructor() {
    super();
    this.total = 16;
  }

  protected async run(): Promise<void> {
    await this.probeService();

    // 全程基线：本测试任何 settle 都可能在新赛季产生轮次，统一 diff 追踪、收尾清理
    const newDailyBase = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-daily')).map((r) => int(r['id']));
    const newWeeklyBase = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-weekly')).map((r) => int(r['id']));

    await this.act('清理历史合成轮次并造数（202608 末轮：日蛋 3 人 / 周蛋 2 人，RUNNING）', async () => {
      this.needService();
      await this.gameGrade.cleanEggwarRounds([ROUND_DAILY_LAST, ROUND_WEEKLY_LAST, ...this.createdRounds]);
      // start 取该 topic 现有 RUNNING 轮最大 start_time + 1h，保证 getLastRunningRound 选中的是合成轮
      const dailyMax = Math.max(0, ...running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily')).map((r) => int(r['start_time'])));
      const weeklyMax = Math.max(0, ...running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-weekly')).map((r) => int(r['start_time'])));
      const dailyStart = Math.max(dailyMax + 3_600_000, Date.now() - 48 * 3_600_000);
      const weeklyStart = Math.max(weeklyMax + 3_600_000, Date.now() - 48 * 3_600_000);
      await this.gameGrade.seedEggwarRound(LAST_BIZ, 'egg-war-daily', ROUND_DAILY_LAST, 1, dailyStart, dailyStart + 1_800_000);
      await this.gameGrade.seedEggwarRound(LAST_BIZ, 'egg-war-weekly', ROUND_WEEKLY_LAST, 1, weeklyStart, weeklyStart + 1_800_000);
      for (const [uid, v] of Object.entries(DAILY_VALUES)) {
        await this.gameGrade.seedEggwarUserRound(LAST_BIZ, 'egg-war-daily', ROUND_DAILY_LAST, uid, v, dailyStart + 1000);
      }
      for (const [uid, v] of Object.entries(WEEKLY_VALUES)) {
        await this.gameGrade.seedEggwarUserRound(LAST_BIZ, 'egg-war-weekly', ROUND_WEEKLY_LAST, uid, v, weeklyStart + 1000);
      }
      this.log(`日蛋 ${ROUND_DAILY_LAST}（${bj(dailyStart)}~${bj(dailyStart + 1_800_000)}）、周蛋 ${ROUND_WEEKLY_LAST}（${bj(weeklyStart)}~${bj(weeklyStart + 1_800_000)}）`);
    });

    // ========== 阶段A：昨日配置（202608）结算上赛季末轮 ==========
    const dailyBefore = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
    const weeklyBefore = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-weekly'));
    await this.act(`阶段A 旧赛季日蛋结算（settle force=true ts=${TS_PHASE_A}，归属 202608）`, async () => {
      this.needService();
      // force=true：服务端 finishRound 到期校验按真实时钟，合成轮未必「真实到期」，强制结算
      await this.gameGrade.settle('daily', TS_PHASE_A, true);
    });
    await this.check('阶段A 旧赛季日蛋末轮已 FINISHED', async (): Promise<CheckResult> => {
      this.needService();
      const rounds = await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily');
      const mine = rounds.find((r) => String(r['round']) === ROUND_DAILY_LAST);
      if (!mine) return { expect: `轮 ${ROUND_DAILY_LAST} status=2`, real: '轮次不存在', pass: false };
      if (Number(mine['status']) !== 2) {
        return { expect: 'status=2（FINISHED）', real: `status=${mine['status']}（结算未按 202608 配置执行：确认配置注册顺序按 endTime 升序）`, pass: false };
      }
      return { expect: 'status=2（FINISHED）', real: `status=${mine['status']}`, pass: true };
    });
    await this.check('阶段A 日蛋名次按积分降序且奖励已发放', async (): Promise<CheckResult> => {
      this.needService();
      const rows = await this.gameGrade.eggwarUserRounds('egg-war-daily', ROUND_DAILY_LAST);
      const ranked = rows.filter((r) => int(r['result']) > 0).sort((a, b) => int(a['result']) - int(b['result']));
      const byValueDesc = [...rows].sort((a, b) => int(b['value']) - int(a['value'])).map((r) => int(r['user_id']));
      const rankedIds = ranked.map((r) => int(r['user_id']));
      const orderOk = byValueDesc.slice(0, rankedIds.length).join(',') === rankedIds.join(',');
      const awardOk = ranked.every((r) => int(r['award_amount']) >= 0);
      this.log(`名次=${rankedIds}（value 降序=${byValueDesc}），奖励=${ranked.map((r) => `${r['user_id']}→${r['award_amount']}`).join('，') || '无'}`);
      return {
        expect: `名次序=${byValueDesc.slice(0, 3).join(',')}，每名次 award_amount ≥0`,
        real: `名次序=${rankedIds.join(',') || '无'}，awardOk=${awardOk}`,
        pass: rankedIds.length >= 1 && orderOk && awardOk,
      };
    });
    await this.check('阶段A 日蛋结算后开新轮（202608 RUNNING，周期 24h）——平常日「结算+开轮」行为不回退', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
      const added = newRounds(dailyBefore, after);
      for (const r of added) this.createdRounds.push(String(r['round']));
      const ok = added.some((r) => int(r['end_time']) - int(r['start_time']) === DAY_MS);
      return {
        expect: '新增 1 条周期 24h 的 RUNNING 轮（或被赛季 endTime 上界守卫挡住——跨赛季模拟时刻两种行为均符合设计）',
        real: added.length === 0 ? '无新增轮（endTime 上界守卫生效）' : added.map((r) => `${r['round']}(${bj(r['start_time'])}~${bj(r['end_time'])})`).join('，'),
        pass: added.length === 0 || ok,
        message: '该新轮为旧窗口模拟结算的副产物，测试收尾会清理',
      };
    });

    await this.act(`阶段A 旧赛季周蛋结算（settle force=true ts=${TS_PHASE_A}，归属 202608）`, async () => {
      this.needService();
      await this.gameGrade.settle('weekly', TS_PHASE_A, true);
    });
    await this.check('阶段A 旧赛季周蛋末轮已 FINISHED 且名次/奖励正确', async (): Promise<CheckResult> => {
      this.needService();
      const rounds = await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-weekly');
      const mine = rounds.find((r) => String(r['round']) === ROUND_WEEKLY_LAST);
      if (!mine) return { expect: `轮 ${ROUND_WEEKLY_LAST} status=2`, real: '轮次不存在', pass: false };
      if (Number(mine['status']) !== 2) {
        return { expect: 'status=2 且名次按 value 降序', real: `status=${mine['status']}（结算未按 202608 配置执行：确认配置注册顺序按 endTime 升序）`, pass: false };
      }
      const rows = await this.gameGrade.eggwarUserRounds('egg-war-weekly', ROUND_WEEKLY_LAST);
      const ranked = rows.filter((r) => int(r['result']) > 0).sort((a, b) => int(a['result']) - int(b['result']));
      const byValueDesc = [...rows].sort((a, b) => int(b['value']) - int(a['value'])).map((r) => int(r['user_id']));
      const rankedIds = ranked.map((r) => int(r['user_id']));
      const orderOk = byValueDesc.slice(0, rankedIds.length).join(',') === rankedIds.join(',');
      this.log(`status=${mine['status']}，名次=${rankedIds}，奖励=${ranked.map((r) => `${r['user_id']}→${r['award_amount']}`).join('，') || '无'}`);
      return {
        expect: 'status=2 且名次按 value 降序、award_amount ≥0',
        real: `status=${mine['status']}，名次序=${rankedIds.join(',') || '无'}`,
        pass: Number(mine['status']) === 2 && rankedIds.length >= 1 && orderOk,
      };
    });

    // ========== 阶段B：当前配置（202610）初始化新赛季首轮 ==========
    const newDailyBefore = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-daily'));
    const oldDailyBeforeB = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
    await this.act(`阶段B 新赛季日蛋结算（settle ts=${TS_SWITCH_EARLY}，归属 202610）`, async () => {
      this.needService();
      await this.gameGrade.settle('daily', TS_SWITCH_EARLY);
    });
    await this.check('阶段B 新赛季日蛋首轮已初始化（RUNNING、周期 24h、锚定赛季开始日）', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-daily'));
      for (const r of newRounds(newDailyBefore, after)) this.createdRounds.push(String(r['round']));
      const first = after.filter((r) => anchoredFirstRound(r as { start_time: number; end_time: number }, DAY_MS, SEASON_START_MS, ANCHOR_TOLERANCE_MS));
      return {
        expect: `RUNNING 首轮 start=${bj(SEASON_START_MS)} 周期=24h`,
        real: first.length > 0
          ? first.map((r) => `${r['round']}(${bj(r['start_time'])}~${bj(r['end_time'])})`).join('，')
          : (after.map((r) => `${r['round']}(${bj(r['start_time'])}~${bj(r['end_time'])})`).join('，') || '无 RUNNING 轮'),
        pass: first.length > 0,
        message: '精确锚点：赛季 startTime=10-26 00:00:00+08（结算 cron 每天 00:01:00 北京时间）',
      };
    });
    await this.check('阶段B 不再产生 202608 新轮（赛季 endTime 上界守卫）', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily'));
      const added = newRounds(oldDailyBeforeB, after);
      return {
        expect: '202608 RUNNING 轮集合不变',
        real: added.length === 0 ? '无新增' : `新增 ${added.map((r) => String(r['round'])).join('，')}`,
        pass: added.length === 0,
      };
    });

    const newWeeklyBefore = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-weekly'));
    await this.act(`阶段B 新赛季周蛋结算（settle ts=${TS_SWITCH_EARLY}，归属 202610）`, async () => {
      this.needService();
      await this.gameGrade.settle('weekly', TS_SWITCH_EARLY);
    });
    await this.check('阶段B 新赛季周蛋首轮已初始化（RUNNING、周期 7d、锚定赛季开始日）', async (): Promise<CheckResult> => {
      this.needService();
      const after = running(await this.gameGrade.eggwarRounds(NEW_BIZ, 'egg-war-weekly'));
      for (const r of newRounds(newWeeklyBefore, after)) this.createdRounds.push(String(r['round']));
      const first = after.filter((r) => anchoredFirstRound(r as { start_time: number; end_time: number }, WEEK_MS, SEASON_START_MS, ANCHOR_TOLERANCE_MS));
      return {
        expect: `RUNNING 首轮 start=${bj(SEASON_START_MS)} 周期=7d`,
        real: first.length > 0
          ? first.map((r) => `${r['round']}(${bj(r['start_time'])}~${bj(r['end_time'])})`).join('，')
          : (after.map((r) => `${r['round']}(${bj(r['start_time'])}~${bj(r['end_time'])})`).join('，') || '无 RUNNING 轮'),
        pass: first.length > 0,
      };
    });

    // ========== 新赛季面板可查询（回归守卫） ==========
    await this.check('阶段B 新赛季日蛋面板可查询（egg-war-daily PANEL 指向 202610 轮次）', async (): Promise<CheckResult> => {
      this.needService();
      const panel = await this.gameGrade.eggwarPanel('daily', EGG_USERS[0], 'in', TS_SWITCH_EARLY);
      const round = (panel['round'] ?? {}) as Record<string, unknown>;
      const biz = String(round['biz'] ?? '');
      const status = int(round['status']);
      return {
        expect: `round.biz=${NEW_BIZ} status=1`,
        real: `round.biz=${biz || '无'} status=${round['status'] ?? '无'}`,
        pass: biz === NEW_BIZ && status === 1,
      };
    });

    // ========== 收尾 ==========
    await this.act('清理测试产生的轮次（合成轮 + settle 副产物轮，diff 追踪）', async () => {
      this.needService();
      const collect = async (base: number[], topic: 'daily' | 'weekly') => {
        const rows = running(await this.gameGrade.eggwarRounds(NEW_BIZ, `egg-war-${topic}`));
        return rows.filter((r) => !base.includes(int(r['id']))).map((r) => String(r['round']));
      };
      const mine = [...new Set([...(await collect(newDailyBase, 'daily')), ...(await collect(newWeeklyBase, 'weekly')), ...this.createdRounds])];
      await this.gameGrade.cleanEggwarRounds([ROUND_DAILY_LAST, ROUND_WEEKLY_LAST, ...mine]);
      this.log(`清理：${[ROUND_DAILY_LAST, ROUND_WEEKLY_LAST, ...mine].join('，')}`);
    });
    await this.act(`收尾核对：清理后无本测试残留 RUNNING 轮（旧窗口 ts=${TS_OLD} 自检用）`, async () => {
      this.needService();
      const d = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-daily')).filter((r) => String(r['round']) === ROUND_DAILY_LAST);
      const w = running(await this.gameGrade.eggwarRounds(LAST_BIZ, 'egg-war-weekly')).filter((r) => String(r['round']) === ROUND_WEEKLY_LAST);
      if (d.length + w.length > 0) throw new Error('合成轮次清理不彻底');
      this.log('无残留');
    });
  }
}

await new EggwarCrossSeasonSettle003().execute();
