import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { GameGradeTestBase } from './_lib/GameGradeTestBase.ts';
import { int, pollUntil, randSuffix, bj } from './_lib/helpers.ts';
import {
  NEW_BIZ, LAST_BIZ, LOCALE, CAUSE_BIZ,
  TS_OLD, TS_SWITCH_EARLY,
  USER_CONSUMER, USER_ENTRANCE, USER_FRESH, USER_FRESH2,
  SEED_GRADE_CONSUMER, SEED_GRADE_ENTRANCE,
} from './_lib/constants.ts';

const ALL_BIZ = [LAST_BIZ, NEW_BIZ];
const USERS = [USER_CONSUMER, USER_ENTRANCE, USER_FRESH, USER_FRESH2];
const GAME_AMOUNT = 100_000; // 积分（分），experience = amount/100 = 1000

/** 构造与 Kafka funbit.user_deal_account_log.new-game-user 同构的消息体（字段形态对齐真实数据：biz/room_id/gameName/details/in18_key） */
function buildDealLog(userId: number, transNo: string, amount: number, createTimeMs: number): Record<string, unknown> {
  const businessNo = new Date(createTimeMs).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(/[- :]/g, '').slice(0, 14);
  return {
    id: createTimeMs,
    biz: CAUSE_BIZ,
    type: 'ADD_MONEY',
    direction: 'IN',
    order_no: `${CAUSE_BIZ}_${userId}_${transNo}_diamond_IN`,
    trans_no: transNo,
    refund_trans_no: null,
    user_id: userId,
    total_amount: amount,
    room_id: 17100226,
    remark: 'result',
    create_time: createTimeMs,
    details: {
      attrs: { balance: { diamond: 97375297 }, gameName: ' Lucky 77', businessNo },
      infos: { diamond: { amount } },
      sourceName: 'MST',
    },
    in18_key: 'game_diamond_trans_title_2',
  };
}

/**
 * 002-等级切换·首次触达顺利晋级（懒式衰减切换）
 * 前置：清理用户新旧赛季等级数据 → 补上赛季（202608）等级行 →
 * 触发懒切换（模拟时间=新赛季开始后 6h）→ 断言衰减映射/经验/流水/奖励/幂等。
 * 触发方式（需求指定两种）：
 *  A. consumer 监听消费：POST /handleUserDealAccountLog2（与 Kafka funbit.user_deal_account_log.new-game-user 消息体同构）
 *  B. entrance 接口：POST /entrance（内部走 GET；需带 l-user-locale）
 * 对照：
 *  C1. 时间窗外（ts=旧窗口）不切换；C2. 纯新用户不产生 SEASON_SWITCH 数据、走 None 初始化。
 * 已知注意：transNo 的 season 取自 yaml season 字段（若未配置默认 202506），断言只校验 SEASON_SWITCH_ 前缀。
 */
class SeasonSwitchUpgrade002 extends GameGradeTestBase {
  private aGate = false;
  private bGate = false;

  constructor() {
    super();
    this.total = 25;
  }

  protected async run(): Promise<void> {
    await this.probeService();

    await this.act('清理测试用户新旧赛季等级数据', async () => {
      this.needService();
      for (const u of USERS) await this.gameGrade.cleanUserGradeData(u, ALL_BIZ);
    });

    // ========== 场景A：consumer 监听消费触发 ==========
    let mapConsumer = '';
    await this.act(`场景A 补上赛季数据（user=${USER_CONSUMER}，grade=${SEED_GRADE_CONSUMER}）`, async () => {
      this.needService();
      await this.gameGrade.seedUserGrade(LAST_BIZ, USER_CONSUMER, SEED_GRADE_CONSUMER, 250_000);
      const def = await this.gameGrade.gradeDefOf(SEED_GRADE_CONSUMER);
      mapConsumer = def?.nextSeasonGrade ?? '';
      this.log(`${SEED_GRADE_CONSUMER}.next_season_grade=${mapConsumer || '（映射缺失→None）'}`);
    });

    let transNoA = '';
    let consumerError = '';
    await this.act('场景A consumer 消息模拟（handleUserDealAccountLog2，ts=新赛季+6h）', async () => {
      this.needService();
      transNoA = `gg002a-${randSuffix()}`;
      try {
        await this.gameGrade.handleUserDealAccountLog(buildDealLog(USER_CONSUMER, transNoA, GAME_AMOUNT, Date.parse(TS_SWITCH_EARLY)), TS_SWITCH_EARLY);
        consumerError = '';
      } catch (e) {
        consumerError = (e as Error).message;
      }
      this.log(`trans_no=${transNoA} amount=${GAME_AMOUNT} biz=${CAUSE_BIZ}`);
      this.log(`请求 curl: ${this.gameGrade.api.lastCurl}`);
    });

    await this.check('场景A 懒切换已触发：存在 SEASON_SWITCH 经验流水（经验=新等级 experienceLimit）', async (): Promise<CheckResult> => {
      this.needService();
      const target = await this.gameGrade.gradeDefOf(mapConsumer || 'None');
      const limit = target ? target.experienceLimit : 0;
      const rows = await pollUntil(
        () => this.gameGrade.userGradeExperiences(USER_CONSUMER, NEW_BIZ),
        (rs) => rs.some((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_')),
      );
      const sw = rows.find((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_'));
      this.aGate = Boolean(sw);
      if (!sw) {
        return {
          expect: 'SEASON_SWITCH_* 经验流水 1 条',
          real: consumerError
            ? `无（接口返回错误：${consumerError}）——消息已通过 biz 白名单进入处理链路，管道内模块抛错中断，user-game-grade 未执行`
            : rows.length > 0
              ? `无（experience 流水 ${rows.length} 条：游戏经验已入账但未记录 SEASON_SWITCH）——该用户已存在服务端赛季切换状态（直连清库不失效），重复运行同一用户不再触发切换`
              : `无（experience 流水 0 条，接口无报错）——消息未进入处理链路，或消息事件时间（create_time）不在赛季窗口`,
          pass: false,
        };
      }
      return {
        expect: `transNo=SEASON_SWITCH_* 且 experience=${limit} amount=${limit * 100}`,
        real: `transNo=${sw['trans_no']} experience=${int(sw['experience'])} amount=${int(sw['amount'])}`,
        pass: int(sw['experience']) === limit && int(sw['amount']) === limit * 100,
      };
    });
    await this.check('场景A 游戏流水已入账（transNo 原样透传，delta=amount）', async (): Promise<CheckResult> => {
      if (!this.aGate) this.skip('场景A 懒切换未触发（见上一条失败原因）');
      const rows = await this.gameGrade.userGradeExperiences(USER_CONSUMER, NEW_BIZ);
      const g = rows.find((r) => String(r['trans_no']) === transNoA);
      return {
        expect: `trans_no=${transNoA} delta_amount=${GAME_AMOUNT}`,
        real: g ? `delta_amount=${int(g['delta_amount'])}` : '无该流水',
        pass: Boolean(g) && int(g!['delta_amount']) === GAME_AMOUNT,
      };
    });
    await this.check('场景A 等级=衰减映射等级，经验=映射等级 limit + 游戏经验', async (): Promise<CheckResult> => {
      if (!this.aGate) this.skip('场景A 懒切换未触发（见失败原因）');
      const row = await this.gameGrade.userGradeRow(USER_CONSUMER, NEW_BIZ);
      const target = await this.gameGrade.gradeDefOf(mapConsumer || 'None');
      const expectExp = (target?.experienceLimit ?? 0) + GAME_AMOUNT / 100;
      return {
        expect: `grade=${mapConsumer} experience=${expectExp}`,
        real: row ? `grade=${row['grade']} experience=${int(row['experience'])}` : '无 202610 等级行',
        pass: Boolean(row) && String(row!['grade']) === mapConsumer && int(row!['experience']) === expectExp,
      };
    });
    await this.check('场景A 等级流水：恰 1 条 SEASON_SWITCH（from→to 与映射一致）+ 1 条游戏流水', async (): Promise<CheckResult> => {
      if (!this.aGate) this.skip('场景A 懒切换未触发（见失败原因）');
      const logs = await this.gameGrade.userGradeLogs(USER_CONSUMER, NEW_BIZ);
      const sw = logs.filter((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_'));
      const game = logs.filter((r) => String(r['trans_no']) === transNoA);
      return {
        expect: `SEASON_SWITCH 1 条（${SEED_GRADE_CONSUMER}→${mapConsumer}）+ 游戏 1 条`,
        real: `SEASON_SWITCH=${sw.length}（${sw.map((r) => `${r['from_grade']}→${r['to_grade']}`).join('，') || '-'}），游戏=${game.length}`,
        pass: sw.length === 1 && String(sw[0]['from_grade']) === SEED_GRADE_CONSUMER && String(sw[0]['to_grade']) === mapConsumer && game.length === 1,
      };
    });
    await this.check('场景A 切换发奖：user_game_grade_award 存在新赛季奖励', async (): Promise<CheckResult> => {
      if (!this.aGate) this.skip('场景A 懒切换未触发（见失败原因）');
      const awards = await this.gameGrade.userGradeAwards(USER_CONSUMER, NEW_BIZ);
      this.log(`awards=${awards.length}：${awards.map((r) => `${r['award_type']}#${r['award_id']}(can_revert=${r['can_revert']})`).join('，') || '无'}`);
      return { expect: '≥1 条', real: `${awards.length} 条`, pass: awards.length >= 1 };
    });

    await this.act('场景A 幂等：同 transNo 重发 consumer 消息', async () => {
      if (!this.aGate) this.skip('场景A 懒切换未触发（见失败原因）');
      await this.gameGrade.handleUserDealAccountLog(buildDealLog(USER_CONSUMER, transNoA, GAME_AMOUNT, Date.parse(TS_SWITCH_EARLY)), TS_SWITCH_EARLY);
    });
    await this.check('场景A 幂等：同 transNo 重发后经验只加一次、SEASON_SWITCH 仍 1 条', async (): Promise<CheckResult> => {
      if (!this.aGate) this.skip('场景A 懒切换未触发（见失败原因）');
      const rows = await this.gameGrade.userGradeExperiences(USER_CONSUMER, NEW_BIZ);
      const swCount = rows.filter((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_')).length;
      const g = rows.filter((r) => String(r['trans_no']) === transNoA);
      const row = await this.gameGrade.userGradeRow(USER_CONSUMER, NEW_BIZ);
      const target = await this.gameGrade.gradeDefOf(mapConsumer || 'None');
      const expectExp = (target?.experienceLimit ?? 0) + GAME_AMOUNT / 100;
      return {
        expect: `experience=${expectExp}（重发只入账一次），SEASON_SWITCH=1`,
        real: `experience=${row ? int(row['experience']) : '无'}，transNo 流水=${g.length}，SEASON_SWITCH=${swCount}`,
        pass: swCount === 1 && g.length === 1 && int(g[0]['delta_amount']) === GAME_AMOUNT && row !== null && int(row['experience']) === expectExp,
      };
    });

    // ========== 场景B：entrance 接口触发 ==========
    let mapEntrance = '';
    await this.act(`场景B 补上赛季数据（user=${USER_ENTRANCE}，grade=${SEED_GRADE_ENTRANCE}）`, async () => {
      this.needService();
      await this.gameGrade.seedUserGrade(LAST_BIZ, USER_ENTRANCE, SEED_GRADE_ENTRANCE, 500_000);
      const def = await this.gameGrade.gradeDefOf(SEED_GRADE_ENTRANCE);
      mapEntrance = def?.nextSeasonGrade ?? '';
      this.log(`${SEED_GRADE_ENTRANCE}.next_season_grade=${mapEntrance || '（映射缺失→None）'}`);
    });

    let entranceResp: Record<string, unknown> = {};
    await this.act('场景B 调用 entrance（ts=新赛季+6h，带 locale）', async () => {
      this.needService();
      entranceResp = await this.gameGrade.entrance(USER_ENTRANCE, LOCALE, TS_SWITCH_EARLY);
      this.log(`entrance 返回 icon=${entranceResp['icon'] ? '有' : '无'} action=${entranceResp['action'] ? '有' : '无'} progress=${int(entranceResp['progress'])}`);
    });
    await this.check('场景B entrance 非空响应（活动已开启）', async (): Promise<CheckResult> => {
      this.needService();
      const nonEmpty = Boolean(entranceResp['icon']) || Boolean(entranceResp['action']);
      return { expect: 'icon/action 任一非空', real: JSON.stringify(entranceResp).slice(0, 200), pass: nonEmpty };
    });
    await this.check('场景B 懒切换已触发：等级=衰减映射等级，经验=新等级 experienceLimit', async (): Promise<CheckResult> => {
      this.needService();
      const row = await pollUntil(
        () => this.gameGrade.userGradeRow(USER_ENTRANCE, NEW_BIZ),
        (r) => r !== null && String(r['grade']) === mapEntrance,
      );
      this.bGate = Boolean(row);
      const target = await this.gameGrade.gradeDefOf(mapEntrance || 'None');
      if (!row) {
        return {
          expect: `202610 行 grade=${mapEntrance} experience=${target?.experienceLimit ?? 0}`,
          real: '无 202610 等级行或等级不符——懒切换未触发：确认 yaml 已配置 user-game-grade.lastSeasonBiz 且 feat 分支已部署',
          pass: false,
        };
      }
      return {
        expect: `grade=${mapEntrance} experience=${target?.experienceLimit ?? 0}`,
        real: `grade=${row['grade']} experience=${int(row['experience'])}`,
        pass: int(row['experience']) === (target?.experienceLimit ?? 0),
      };
    });
    await this.check('场景B 等级流水恰 1 条 SEASON_SWITCH + 切换发奖非空', async (): Promise<CheckResult> => {
      if (!this.bGate) this.skip('场景B 懒切换未触发（见上一条失败原因）');
      const logs = await this.gameGrade.userGradeLogs(USER_ENTRANCE, NEW_BIZ);
      const sw = logs.filter((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_'));
      const awards = await this.gameGrade.userGradeAwards(USER_ENTRANCE, NEW_BIZ);
      this.log(`awards=${awards.length} 条`);
      return {
        expect: `SEASON_SWITCH 1 条（${SEED_GRADE_ENTRANCE}→${mapEntrance}）且 awards ≥1`,
        real: `SEASON_SWITCH=${sw.length}（${sw.map((r) => `${r['from_grade']}→${r['to_grade']}`).join('，') || '-'}），awards=${awards.length}`,
        pass: sw.length === 1 && String(sw[0]['from_grade']) === SEED_GRADE_ENTRANCE && String(sw[0]['to_grade']) === mapEntrance && awards.length >= 1,
      };
    });

    await this.act('场景B 幂等：重复调用 entrance', async () => {
      if (!this.bGate) this.skip('场景B 懒切换未触发（见失败原因）');
      await this.gameGrade.entrance(USER_ENTRANCE, LOCALE, TS_SWITCH_EARLY);
      await this.gameGrade.gradeGet(USER_ENTRANCE, LOCALE, TS_SWITCH_EARLY);
    });
    await this.check('场景B 幂等：重复触达后 SEASON_SWITCH 仍恰 1 条', async (): Promise<CheckResult> => {
      if (!this.bGate) this.skip('场景B 懒切换未触发（见失败原因）');
      const logs = await this.gameGrade.userGradeLogs(USER_ENTRANCE, NEW_BIZ);
      const sw = logs.filter((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_'));
      return { expect: '1 条', real: `${sw.length} 条`, pass: sw.length === 1 };
    });

    // ========== 场景C：对照（纯新用户 / 时间窗外） ==========
    let c1Ok = false;
    await this.act(`场景C1 时间窗外 GET（user=${USER_FRESH} 纯新用户，ts=${TS_OLD} 旧窗口）`, async () => {
      this.needService();
      await this.gameGrade.gradeGet(USER_FRESH, LOCALE, TS_OLD);
      c1Ok = true;
    });
    await this.check('场景C1 时间窗外不切换：无 202610 等级行、无 SEASON_SWITCH 流水', async (): Promise<CheckResult> => {
      this.needService();
      if (!c1Ok) this.skip('上一步未执行');
      const row = await this.gameGrade.userGradeRow(USER_FRESH, NEW_BIZ);
      const logs = await this.gameGrade.userGradeLogs(USER_FRESH, NEW_BIZ);
      return {
        expect: '无等级行、无流水',
        real: `行=${row ? '有' : '无'}，流水=${logs.length}`,
        pass: !row && logs.length === 0,
      };
    });

    let freshResp: Record<string, unknown> = {};
    await this.act(`场景C2 纯新用户窗口内 GET（user=${USER_FRESH2}，ts=${TS_SWITCH_EARLY}）`, async () => {
      this.needService();
      freshResp = await this.gameGrade.gradeGet(USER_FRESH2, LOCALE, TS_SWITCH_EARLY);
      this.log(`返回 biz=${(freshResp['gameGrade'] as Record<string, unknown> | undefined)?.['biz']} grade=${(freshResp['gameGrade'] as Record<string, unknown> | undefined)?.['grade']}`);
    });
    await this.check('场景C2 纯新用户窗口内初始化为 None（experience=0），且无 SEASON_SWITCH', async (): Promise<CheckResult> => {
      this.needService();
      const row = await pollUntil(
        () => this.gameGrade.userGradeRow(USER_FRESH2, NEW_BIZ),
        (r) => r !== null,
      );
      const logs = await this.gameGrade.userGradeLogs(USER_FRESH2, NEW_BIZ);
      const swCount = logs.filter((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_')).length;
      const inited = row !== null && String(row['grade']) === 'None' && int(row['experience']) === 0;
      return {
        expect: '存在 grade=None experience=0 的 202610 行、SEASON_SWITCH=0',
        real: row ? `grade=${row['grade']} experience=${int(row['experience'])}，SEASON_SWITCH=${swCount}` : '无等级行',
        pass: inited && swCount === 0,
      };
    });

    await this.act('场景C3 纯新用户经验变更（UPDATE，ts=窗口内）走 None 初始化', async () => {
      this.needService();
      await this.gameGrade.gradeUpdate(USER_FRESH2, { causeBiz: CAUSE_BIZ, transNo: `gg002c-${randSuffix()}`, amount: 1000 }, TS_SWITCH_EARLY);
    });
    await this.check('场景C3 初始化为 None 且无 SEASON_SWITCH 流水（衰减不适用）', async (): Promise<CheckResult> => {
      this.needService();
      const row = await pollUntil(
        () => this.gameGrade.userGradeRow(USER_FRESH2, NEW_BIZ),
        (r) => r !== null,
      );
      const logs = await this.gameGrade.userGradeLogs(USER_FRESH2, NEW_BIZ);
      const swCount = logs.filter((r) => String(r['trans_no']).startsWith('SEASON_SWITCH_')).length;
      const gradeOk = row !== null && String(row['grade']) === 'None' && int(row['experience']) === 10;
      return {
        expect: 'grade=None experience=10 且 SEASON_SWITCH=0',
        real: row ? `grade=${row['grade']} experience=${int(row['experience'])}，SEASON_SWITCH=${swCount}` : '无等级行',
        pass: gradeOk && swCount === 0,
        message: `update_time=${row ? bj(row['update_time']) : '-'}（应为模拟时间，证明窗口校验跟随 l-debug-timestamp）`,
      };
    });

    // ========== 收尾 ==========
    await this.act('清理测试用户数据', async () => {
      this.needService();
      for (const u of USERS) await this.gameGrade.cleanUserGradeData(u, ALL_BIZ);
    });
  }
}

await new SeasonSwitchUpgrade002().execute();
