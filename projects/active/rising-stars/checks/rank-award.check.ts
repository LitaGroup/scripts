import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';

/**
 * 新星崛起（risingstars）周榜/月榜奖励发放线上检查。
 *
 * 调度（在 project.cinta.team 平台配置两条 cron）：
 *   - 周榜：每周一 03:15（北京时间）`node rank-award.check.ts --type=week`
 *   - 月榜：每月 1 号 03:15（北京时间）`node rank-award.check.ts --type=month`
 *   结算任务 RisingStarsSettleJobHandler 在 03:00 执行，本检查预留 15 分钟给结算+队列消费。
 *
 * 检查口径（与 active-main 服务端实现一一对应）：
 *   1. period_key 按各大区本地日期取"上一周期"（同 RisingStarsSettleJobHandler.settleAll）：
 *      周 = ISO week-based 年+周（%d%02d，如 202637），月 = yyyyMM。
 *      注意：ar(+3) 在北京时间周一 03:00 仍是周日，会稳定滞后一个周期结算 —— 与服务端行为保持一致，并非脚本 bug。
 *   2. 期望榜单 = active 库 mod_common_rank_record 重建 Top5（SQL 逻辑同 ModCommonRankRecordMapper.getTopN：
 *      每玩家取 total_amount 最大（同分取 create_time 最小）的一行，再按 total 降序、时间升序取前 5）。
 *   3. 实际发放 = funbit.rising_stars_rank_award_record 记录 + basic.gift_award_queue 队列交叉验证：
 *      settleUser 先写 record 后发奖，record 存在 ≠ 实际到账，必须队列有对应行且 award_status='ok'。
 *      （record.status=0 仅表示 LitaTeam 通知未发出，奖励本身已进队列，单独提示。）
 */

const BIZ = 'risingstars';
const ACTIVE_NAME = 'risingstars';
const SETTLE_TOP_N = 5;

// 大区本地时间偏移（小时），同 TimeUtils.getOffsetId；zh 不在本活动上线范围
const LOCALES: { locale: string; offset: number }[] = [
  { locale: 'in', offset: 7 },
  { locale: 'vi', offset: 7 },
  { locale: 'ph', offset: 8 },
  { locale: 'ko', offset: 9 },
  { locale: 'ar', offset: 3 },
];

type RankType = 'week' | 'month';

interface AwardConfig {
  id: number;
  rankStart: number;
  rankEnd: number;
  awardId: number;
  awardType: string;
  awardNum: number;
  expiresSecond: number;
}

interface RankEntry {
  player: string;
  total: number;
  time: number;
  rank: number;
}

interface AwardRecord {
  userId: string;
  rankLevel: number;
  awardDetail: string;
  status: number;
  createTime: number;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}
function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) throw new Error(`invalid numeric value: ${n}`);
  return str;
}

/** 取某大区偏移下的本地日期（用 UTC 字段读偏移后的时间，避免依赖运行机器时区） */
function localDateAt(offsetHours: number): [number, number, number] {
  const t = new Date(Date.now() + offsetHours * 3_600_000);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

/** ISO 8601 周 key：周四所在年为 week-based year、周一为起点，与 WeekFields.ISO 的 "%d%02d" 一致 */
function isoWeekKey(y: number, m: number, d: number): string {
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + (4 - dow)); // 本周周四
  const weekYear = t.getUTCFullYear();
  // 锚点必须是"第 1 周的周四"：1 月 4 日保证在第 1 周内，但它本身不一定是周四，需先归位
  const week1Thursday = new Date(Date.UTC(weekYear, 0, 4));
  week1Thursday.setUTCDate(week1Thursday.getUTCDate() + (4 - (week1Thursday.getUTCDay() || 7)));
  const week = Math.round((t.getTime() - week1Thursday.getTime()) / 604_800_000) + 1;
  return `${weekYear}${String(week).padStart(2, '0')}`;
}

function prevWeekKey(y: number, m: number, d: number): string {
  const t = new Date(Date.UTC(y, m - 1, d - 7));
  return isoWeekKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function prevMonthKey(y: number, m: number): string {
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}${String(pm).padStart(2, '0')}`;
}

/** 名次命中的全部配置行，同 RisingStarsSettleService.matchAwards（一名次可命中多行） */
function matchAwards(configs: AwardConfig[], rank: number): AwardConfig[] {
  return configs.filter((c) => rank >= c.rankStart && rank <= c.rankEnd);
}

/** 多重集字符串，用于"奖励明细 vs 配置"/"队列 vs 明细"的无序比对 */
function multiset(items: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) map.set(it, (map.get(it) ?? 0) + 1);
  return map;
}

function multisetDiff(expect: Map<string, number>, real: Map<string, number>): string[] {
  const diff: string[] = [];
  const keys = new Set([...expect.keys(), ...real.keys()]);
  for (const k of keys) {
    const e = expect.get(k) ?? 0;
    const r = real.get(k) ?? 0;
    if (e !== r) diff.push(`${k}(期望${e}/实际${r})`);
  }
  return diff;
}

/** 参数解析失败时按输出协议直接 fail（不进 run()），与 ExportBaseClass 的参数处理风格一致 */
function failEarly(msg: string): never {
  const startTime = new Date().toISOString();
  process.stdout.write(`[start] ${JSON.stringify({ total: 1, time: 0, startTime })}\n`);
  process.stdout.write(`[act] ${JSON.stringify({ no: 1, title: '参数校验', status: 'fail', message: msg, time: 0 })}\n`);
  process.stdout.write(
    `[done] ${JSON.stringify({ status: 'fail', total: 1, success: 0, fail: 1, skip: 0, message: msg, time: 0, cost: 0 })}\n`,
  );
  process.exit(0);
}

function parseArgs(): { type: RankType; keyOverride: string | null } {
  let type: string | null = null;
  let keyOverride: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--type=')) type = arg.slice('--type='.length);
    else if (arg.startsWith('--key=')) keyOverride = arg.slice('--key='.length);
  }
  if (type !== 'week' && type !== 'month') {
    failEarly(`缺少或非法参数 --type=week|month（实际: ${type ?? '(未传)'}）`);
  }
  if (keyOverride !== null && !/^\d{6}$/.test(keyOverride)) {
    failEarly(`--key 格式非法（实际: ${keyOverride}），周榜如 202637、月榜如 202608`);
  }
  return { type: type as RankType, keyOverride };
}

class RankAwardCheck extends CheckBaseClass {
  private readonly type: RankType;
  private readonly keyOverride: string | null;
  private configByLocale = new Map<string, AwardConfig[]>();

  constructor(type: RankType, keyOverride: string | null) {
    super();
    this.type = type;
    this.keyOverride = keyOverride;
    // 1 步读配置 + 每个大区 6 步（重建榜单、读记录、4 项核对）
    this.total = 1 + LOCALES.length * 6;
  }

  private periodKey(offset: number): string {
    if (this.keyOverride) return this.keyOverride;
    const [y, m, d] = localDateAt(offset);
    return this.type === 'week' ? prevWeekKey(y, m, d) : prevMonthKey(y, m);
  }

  protected async run(): Promise<void> {
    await this.act('读取奖励配置 rising_stars_rank_award', async () => {
      const r = await MySQLProdResource.query(
        'funbit',
        `select id, locale, rank_start, rank_end, award_id, award_type, award_num, expires_second
         from rising_stars_rank_award where rank_type=${quoteStr(this.type)}`,
      );
      for (const row of r.data) {
        const locale = String(row[1]);
        const cfg: AwardConfig = {
          id: Number(row[0]),
          rankStart: Number(row[2]),
          rankEnd: Number(row[3]),
          awardId: Number(row[4]),
          awardType: String(row[5]),
          awardNum: Number(row[6]),
          expiresSecond: Number(row[7]),
        };
        const list = this.configByLocale.get(locale) ?? [];
        list.push(cfg);
        this.configByLocale.set(locale, list);
      }
      const summary = LOCALES.map((l) => `${l.locale}:${this.configByLocale.get(l.locale)?.length ?? 0}`).join(', ');
      this.log(`配置行数（按大区）— ${summary}`);
      if (this.configByLocale.size === 0) throw new Error(`奖励配置为空（rank_type=${this.type}），结算不会发奖`);
    });

    for (const { locale, offset } of LOCALES) {
      await this.checkLocale(locale, this.periodKey(offset));
    }
  }

  private async checkLocale(locale: string, periodKey: string): Promise<void> {
    const title = `${this.type}/${locale}/${periodKey}`;
    const configs = this.configByLocale.get(locale) ?? [];
    let rankList: RankEntry[] | null = null;
    let records: AwardRecord[] | null = null;

    await this.act(`[${title}] 重建榜单 Top${SETTLE_TOP_N}`, async () => {
      // 与 ModCommonRankRecordMapper.getTopN 同逻辑：Redis 榜单不可直连（独立实例），用入榜流水重建
      const r = await MySQLProdResource.query(
        'active',
        `select t.player, t.total_amount, t.create_time from (
           select r.player, r.total_amount, r.create_time,
             row_number() over (partition by r.player order by r.total_amount desc, r.create_time asc) as rn
           from mod_common_rank_record r
           where r.biz=${quoteStr(BIZ)} and r.topic=${quoteStr(this.type)}
             and r.${'`key`'}=${quoteStr(periodKey)} and r.locale=${quoteStr(locale)}
         ) t where t.rn = 1 order by t.total_amount desc, t.create_time asc limit ${SETTLE_TOP_N}`,
      );
      rankList = r.data.map((row, i) => ({
        player: String(row[0]),
        total: Number(row[1]),
        time: Number(row[2]),
        rank: i + 1,
      }));
      if (rankList.length === 0) {
        this.log('本期榜单为空（无入榜流水）');
      } else {
        this.log(`上榜 ${rankList.length} 人：${rankList.map((e) => `#${e.rank}=${e.player}(${e.total})`).join(', ')}`);
      }
    });

    await this.act(`[${title}] 读取发放记录`, async () => {
      const r = await MySQLProdResource.query(
        'funbit',
        `select user_id, rank_level, award_detail, status, create_time
         from rising_stars_rank_award_record
         where rank_type=${quoteStr(this.type)} and period_key=${quoteStr(periodKey)} and locale=${quoteStr(locale)}`,
      );
      records = r.data.map((row) => ({
        userId: String(row[0]),
        rankLevel: Number(row[1]),
        awardDetail: String(row[2]),
        status: Number(row[3]),
        createTime: Number(row[4]),
      }));
      this.log(`发放记录 ${records.length} 条`);
    });

    await this.check(`[${title}] 发放记录与榜单一致`, async (): Promise<CheckResult> => {
      if (rankList === null || records === null) this.skip('前置数据未获取');
      // 服务端对无奖励配置的名次直接跳过（settleUser 中 awards 为空即 return），故期望人选需过一道配置
      const expected = rankList!
        .filter((e) => matchAwards(configs, e.rank).length > 0)
        .map((e) => `${e.player}#${e.rank}`)
        .sort();
      const real = records!.map((r) => `${r.userId}#${r.rankLevel}`).sort();
      if (expected.length === 0 && real.length === 0) {
        return { expect: '无人上榜或无奖励配置时应无发放记录', real: '无发放记录', pass: true };
      }
      const pass = expected.join(',') === real.join(',');
      return {
        expect: `应发放 ${expected.length} 人${expected.length ? ': ' + expected.join(', ') : ''}`,
        real: `实际 ${real.length} 人${real.length ? ': ' + real.join(', ') : ''}`,
        pass,
      };
    });

    await this.check(`[${title}] 奖励明细与配置一致`, async (): Promise<CheckResult> => {
      if (records === null) this.skip('发放记录未获取');
      if (records!.length === 0) this.skip('无发放记录');
      const problems: string[] = [];
      for (const rec of records!) {
        let detail: Record<string, unknown>[];
        try {
          // award_detail = Json.mustEncode(匹配到的配置行列表)，Jackson 默认 camelCase
          detail = JSON.parse(rec.awardDetail) as Record<string, unknown>[];
          if (!Array.isArray(detail)) throw new Error('不是数组');
        } catch (e) {
          problems.push(`${rec.userId}#${rec.rankLevel} award_detail 解析失败: ${(e as Error).message}`);
          continue;
        }
        // 只比对发奖核心字段（id/类型/数量/有效期），名称图片等展示字段结算后可能被运营调整
        const exp = multiset(
          matchAwards(configs, rec.rankLevel).map((c) => `${c.awardId}|${c.awardType}|${c.awardNum}|${c.expiresSecond}`),
        );
        const got = multiset(
          detail.map((d) => `${Number(d.awardId)}|${String(d.awardType)}|${Number(d.awardNum)}|${Number(d.expiresSecond)}`),
        );
        const diff = multisetDiff(exp, got);
        if (diff.length > 0) problems.push(`${rec.userId}#${rec.rankLevel}: ${diff.join('; ')}`);
      }
      const pass = problems.length === 0;
      return {
        expect: `每条记录的 award_detail 与该名次命中配置一致（共 ${records!.length} 条）`,
        real: pass ? '全部一致' : `${problems.length} 条不一致: ${problems.slice(0, 3).join('；')}`,
        pass,
      };
    });

    await this.check(`[${title}] 奖励实际到账（gift_award_queue）`, async (): Promise<CheckResult> => {
      if (records === null) this.skip('发放记录未获取');
      if (records!.length === 0) this.skip('无发放记录');
      const problems: string[] = [];
      for (const rec of records!) {
        let detail: Record<string, unknown>[];
        try {
          detail = JSON.parse(rec.awardDetail) as Record<string, unknown>[];
        } catch {
          continue; // 明细异常已在上一步报告
        }
        // 队列行与 record 在同一 settleUser 调用内先后写入，按 record.create_time 取 ±120s 时间窗关联
        // （order_no/active_name 均不含周期信息，只能靠用户+时间窗+奖励项对碰）
        const t0 = rec.createTime - 120_000;
        const t1 = rec.createTime + 120_000;
        const r = await MySQLProdResource.query(
          'basic',
          `select award_type, award_id, award_count, award_status from gift_award_queue
           where active_name=${quoteStr(ACTIVE_NAME)} and user_id=${quoteNum(rec.userId)}
             and create_time between ${quoteNum(t0)} and ${quoteNum(t1)}`,
        );
        const exp = multiset(detail.map((d) => `${Number(d.awardId)}|${String(d.awardType)}|${Number(d.awardNum)}`));
        const got = multiset(r.data.map((row) => `${Number(row[1])}|${String(row[0])}|${Number(row[2])}`));
        const diff = multisetDiff(exp, got);
        if (diff.length > 0) {
          problems.push(`${rec.userId}#${rec.rankLevel} 队列缺失: ${diff.join('; ')}`);
          continue;
        }
        // funbit 侧扫表消费后 award_status 才变 ok；create=未消费，fail=发放失败
        const notOk = r.data.filter((row) => String(row[3]) !== 'ok');
        if (notOk.length > 0) {
          const statusSummary = multiset(notOk.map((row) => String(row[3])));
          problems.push(
            `${rec.userId}#${rec.rankLevel} 队列未全部 ok: ${[...statusSummary.entries()].map(([s, n]) => `${s}×${n}`).join(', ')}`,
          );
        }
      }
      const pass = problems.length === 0;
      return {
        expect: `${records!.length} 条记录全部有队列行且 award_status=ok`,
        real: pass ? '全部到账' : `${problems.length} 条异常: ${problems.slice(0, 3).join('；')}`,
        pass,
      };
    });

    // status=0 仅表示 LitaTeam 通知未发出（sendAsync 未提交成功），奖励本身已进队列；作为提示而非失败项
    await this.check(`[${title}] 通知状态 status=1`, async (): Promise<CheckResult> => {
      if (records === null) this.skip('发放记录未获取');
      if (records!.length === 0) this.skip('无发放记录');
      const notNotified = records!.filter((r) => r.status !== 1);
      const pass = notNotified.length === 0;
      return {
        expect: '全部已通知（status=1）',
        real: pass ? '全部已通知' : `${notNotified.length} 条未通知: ${notNotified.slice(0, 3).map((r) => `${r.userId}#${r.rankLevel}`).join(', ')}`,
        pass,
      };
    });
  }
}

const { type, keyOverride } = parseArgs();
await new RankAwardCheck(type, keyOverride).execute();
