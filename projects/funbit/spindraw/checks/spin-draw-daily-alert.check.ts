import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  SpinDrawStatsService,
  beijingYesterday,
  assertDate,
  ratioPct,
  rtpPct,
  type LocaleMetric,
  type TopUser,
} from '../../../../src/services/SpinDrawStatsService.ts';
import { FeishuWebhookService } from '../../../../src/services/FeishuWebhookService.ts';

/**
 * 水果机经营日报 · 飞书群推送（线上检查 / 定时任务）。
 *
 * 需求：WO-0007《飞书预警 + Admin 后台增加水果机数据》（/api/documents/148）
 * 口径：/task/20261106/TK-0088/CALIBER（口径确认单 v1）
 * 方案：/task/20261106/TK-0089/TECH_DESIGN §6
 *
 * 调度建议：每天 08:00（Asia/Shanghai）`node spin-draw-daily-alert.check.ts`
 * 数据日：默认北京时间 T-1；可用 `--dt=YYYY-MM-DD` 指定。
 *
 * 参数：
 *   --dt=YYYY-MM-DD  指定数据日（默认北京时间昨日）
 *   --dry-run        只查询并输出卡片 JSON，不推送
 *   --force          允许对显式指定的历史数据日重复推送（v1 无去重存储，作为人工确认开关）
 *
 * 环境变量：
 *   SPIN_DRAW_ALERT_WEBHOOK            水果机专属群 webhook（推送必填，dry-run 不需要）
 *   SPIN_DRAW_ALERT_FALLBACK_WEBHOOK   推送失败时的纯文本兜底群（可选）
 *   SPIN_DRAW_LOCALES                  固定展示大区，默认 in,vi,ko,ph,ar
 *   SPIN_DRAW_SHOW_EMPTY_LOCALES       无数据大区是否展示，默认 true
 *
 * 口径要点：金额单位钻石，千分位整数；比率两位小数，分母 <= 0 显示 “-”；排除 uid=0 与假用户。
 */

const DEFAULT_LOCALES = ['in', 'vi', 'ko', 'ph', 'ar'];

function fmtAmount(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(Math.trunc(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtSignedAmount(value: number): string {
  return value > 0 ? `+${fmtAmount(value)}` : fmtAmount(value);
}

function fmtPct(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(2)}%`;
}

function parseArgs(argv: string[]): { dt?: string; dryRun: boolean; force: boolean } {
  let dt: string | undefined;
  let dryRun = false;
  let force = false;
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--dt=')) {
      dt = assertDate(arg.slice('--dt='.length));
    } else if (arg.startsWith('--')) {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return { dt, dryRun, force };
}

function localesFromEnv(): string[] {
  const raw = process.env.SPIN_DRAW_LOCALES;
  if (!raw) return DEFAULT_LOCALES;
  const list = raw.split(',').map((s) => s.trim()).filter((s) => s !== '');
  return list.length > 0 ? list : DEFAULT_LOCALES;
}

function showEmptyLocales(): boolean {
  return String(process.env.SPIN_DRAW_SHOW_EMPTY_LOCALES ?? 'true').toLowerCase() !== 'false';
}

function localeSection(metric: LocaleMetric): string {
  return [
    `**${metric.locale}**`,
    `总盈亏：${fmtAmount(metric.pnl)} ｜ 总返奖率：${fmtPct(rtpPct(metric.pnl, metric.lotteryCost))}`,
    `抽奖：投入 ${fmtAmount(metric.lotteryCost)} ｜ 产出 ${fmtAmount(metric.lotteryReward)} ｜ 盈亏 ${fmtAmount(
      metric.lotteryProfit,
    )} ｜ 返奖率 ${fmtPct(ratioPct(metric.lotteryReward, metric.lotteryCost))}`,
    `翻倍：投入 ${fmtAmount(metric.doubleCost)} ｜ 中奖 ${fmtAmount(metric.doubleWin)} ｜ 盈亏 ${fmtAmount(
      metric.doubleProfit,
    )} ｜ 返奖率 ${fmtPct(ratioPct(metric.doubleWin, metric.doubleCost - metric.doubleFailureAdd))}`,
    `神灯：${fmtAmount(metric.lampReward)}`,
    `分解：${fmtAmount(metric.dismantleAmount)} ｜ 占抽奖投入 ${fmtPct(
      ratioPct(metric.dismantleAmount, metric.lotteryCost),
    )}`,
  ].join('\n');
}

function emptyLocaleMetric(locale: string): LocaleMetric {
  return {
    locale,
    lotteryCost: 0,
    lotteryReward: 0,
    lotteryProfit: 0,
    doubleCost: 0,
    doubleWin: 0,
    doubleFailureAdd: 0,
    doubleProfit: 0,
    lampReward: 0,
    dismantleAmount: 0,
    pnl: 0,
  };
}

function userLine(user: TopUser): string {
  return `${user.rank}. UID ${user.uid}（${user.locale}）｜昨日 ${fmtSignedAmount(user.pnl1d)} / ${fmtPct(
    user.rtp1d,
  )}｜7日 ${fmtSignedAmount(user.pnl7d)} / ${fmtPct(user.rtp7d)}｜30日 ${fmtSignedAmount(user.pnl30d)} / ${fmtPct(
    user.rtp30d,
  )}`;
}

export interface AlertCardInput {
  dt: string;
  locales: LocaleMetric[];
  profit: TopUser[];
  loss: TopUser[];
  coverage7d: boolean;
  coverage30d: boolean;
  generatedAt?: Date;
}

/** 生成飞书 interactive 卡片（版式见 TECH_DESIGN §6.3） */
export function buildSpinDrawAlertCard(input: AlertCardInput): object {
  const configured = localesFromEnv();
  const byLocale = new Map(input.locales.map((m) => [m.locale, m]));
  const withData: LocaleMetric[] = [];
  const empty: LocaleMetric[] = [];
  for (const locale of configured) {
    if (byLocale.has(locale)) {
      withData.push(byLocale.get(locale) as LocaleMetric);
      byLocale.delete(locale);
    } else if (showEmptyLocales()) {
      empty.push(emptyLocaleMetric(locale));
    }
  }
  // 配置之外的新大区照常展示，避免数据被隐藏
  for (const metric of byLocale.values()) withData.push(metric);

  // 有数据的大区按抽奖投入降序；无数据的配置大区补在末尾
  withData.sort((a, b) => b.lotteryCost - a.lotteryCost);
  const display = [...withData, ...empty];

  const localeBlocks = display.map((m) => localeSection(m)).join('\n\n');
  const profitText = input.profit.length > 0 ? input.profit.map(userLine).join('\n') : '暂无数据';
  const lossText = input.loss.length > 0 ? input.loss.map(userLine).join('\n') : '暂无数据';
  const generatedAt = input.generatedAt ?? new Date();
  const generatedText = new Date(generatedAt.getTime() + 8 * 3_600_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  const coverageText = input.coverage7d && input.coverage30d ? '已完成' : '未完成';

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: { tag: 'plain_text', content: `水果机经营日报 · ${input.dt}` },
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: '**分大区整体指标**' } },
        { tag: 'div', text: { tag: 'lark_md', content: localeBlocks } },
        { tag: 'hr' },
        { tag: 'div', text: { tag: 'lark_md', content: `**昨日盈利 TOP10**\n${profitText}` } },
        { tag: 'div', text: { tag: 'lark_md', content: `**昨日亏损 TOP10**\n${lossText}` } },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `数据截至 ${input.dt} ｜ 生成时间 ${generatedText} ｜ 7日/30日回溯：${coverageText}`,
            },
          ],
        },
      ],
    },
  };
}

class SpinDrawDailyAlertCheck extends CheckBaseClass {
  protected total = 8;

  private args = parseArgs(process.argv.slice(2));

  protected async run(): Promise<void> {
    const dt = this.args.dt ?? beijingYesterday();
    const explicitDt = this.args.dt !== undefined;
    if (explicitDt && !this.args.force && !this.args.dryRun) {
      throw new Error(`显式指定数据日 ${dt} 重跑会重复推送，请加 --force 确认（或使用 --dry-run 只预览）`);
    }

    const stats = new SpinDrawStatsService('prod');

    await this.check('数据日不晚于北京时间昨日', async (): Promise<CheckResult> => {
      const yesterday = beijingYesterday();
      return {
        expect: `<=${yesterday}`,
        real: dt,
        pass: dt <= yesterday,
        message: dt > yesterday ? `数据日 ${dt} 晚于可用的 T-1（${yesterday}）` : '',
      };
    });

    const ready = await this.step('校验 T-1 分区', () => stats.assertPartitionReady(dt));
    if (!ready.ready) {
      throw new Error(`分区未就绪或当日无数据: ${dt}（rowCount=0），按口径不发送 0 值日报`);
    }
    this.log(`分区就绪：dt=${dt} rowCount=${ready.rowCount}`);

    const identity = await this.step('校验指标恒等式', () => stats.verifyIdentities(dt));
    await this.check('总盈亏 = 抽奖盈亏 + 翻倍盈亏 + 神灯奖励', async () => ({
      expect: '0',
      real: String(identity.totalProfitDiff),
    }));
    await this.check('抽奖盈亏 = 抽奖产出 - 抽奖投入', async () => ({
      expect: '0',
      real: String(identity.lotteryDiff),
    }));
    await this.check('翻倍盈亏 = 中奖 - (投入 - 失败返还)', async () => ({
      expect: '0',
      real: String(identity.doubleDiff),
    }));

    const locales = await this.step('查询分大区指标', () => stats.fetchLocaleMetrics(dt));
    await this.check('分大区指标有数据', async () => ({ expect: '>0', real: String(locales.length), pass: locales.length > 0 }));

    const profit = await this.step('查询盈利 TOP10', () => stats.fetchTopUsers(dt, 'profit', 10));
    const loss = await this.step('查询亏损 TOP10', () => stats.fetchTopUsers(dt, 'loss', 10));

    const coverage7d = await this.step('校验 7 日覆盖', () => stats.checkCoverage(dt, 7));
    const coverage30d = await this.step('校验 30 日覆盖', () => stats.checkCoverage(dt, 30));
    this.log(`窗口覆盖：7日=${coverage7d ? '完整' : '不完整'} 30日=${coverage30d ? '完整' : '不完整'}`);

    const card = await this.step('组装飞书卡片', async () =>
      buildSpinDrawAlertCard({ dt, locales, profit, loss, coverage7d, coverage30d }),
    );

    if (this.args.dryRun) {
      this.log(`DRY-RUN 卡片 JSON:\n${JSON.stringify(card, null, 2)}`);
      return;
    }

    const webhook = process.env.SPIN_DRAW_ALERT_WEBHOOK;
    if (!webhook) {
      throw new Error('未配置 SPIN_DRAW_ALERT_WEBHOOK，无法推送（可用 --dry-run 预览卡片）');
    }
    await this.step('推送飞书卡片', async () => {
      try {
        await new FeishuWebhookService(webhook).sendCard(card);
      } catch (e) {
        const fallback = process.env.SPIN_DRAW_ALERT_FALLBACK_WEBHOOK;
        if (fallback) {
          await new FeishuWebhookService(fallback).sendText(
            `水果机日报推送失败（${dt}）：${(e as Error).message}`,
          );
        }
        throw e;
      }
    });
  }
}

await new SpinDrawDailyAlertCheck().execute();
