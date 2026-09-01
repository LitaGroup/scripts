/**
 * ticket-v202608（Lita 六周年周年通票）用户数据导出
 *
 * 导出字段：locale、country、uid、no、nick、VIP等级、is player、is host、
 *          通票等级、任务获得经验值（总）、送礼获得经验值、获得种子数量、获得蜡烛数量
 *
 * 口径说明：
 * - 用户范围：mod_level_user_experience 中 biz='ticket-v202608' topic='ticket' 的全部用户
 * - 通票等级 / 总经验：topic='ticket' 的 level / experience
 * - 送礼获得经验值：topic='ticket-consume' 的 experience（送礼 1:1 双写，仅含送礼经验）
 * - 任务获得经验值（总）= 总经验 - 送礼经验
 * - 种子/蜡烛：mod_level_user_award（已达成的等级奖励，含未领取）
 *   JOIN mod_common_award(name='level', award_type='EVENT')，
 *   award_id=2 → anniversary6th_pass_seed（种子），award_id=1 → anniversary6th_pass_candle（蜡烛）
 * - locale / country：funbit.user_config（id 索引）的 locale（大区）/ country_code
 * - VIP等级 / is player：funbit.user_profile.vip_level / is_player
 * - is host：出现在 basic.host_level_user 中即视为主播
 *
 * 运行：node projects/active/crazy-lamb/export/ticket-users.export.ts
 * 产物：同目录 ticket-v202608-users-{yyyyMMdd-HHmm}.csv（UTF-8 带 BOM，Excel 可直接打开）
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CheckBaseClass } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';

const BIZ = 'ticket-v202608';
const CHUNK_SIZE = 1000;
const CHUNK_CONCURRENCY = 4;

const EXPORT_DIR = dirname(fileURLToPath(import.meta.url));

interface ExportRow {
  locale: string;
  country: string;
  uid: string;
  no: string;
  nick: string;
  vipLevel: string;
  isPlayer: string;
  isHost: string;
  ticketLevel: number;
  taskExp: number;
  giftExp: number;
  seeds: number;
  candles: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapChunks<T, R>(chunks: T[][], fn: (c: T[]) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(chunks.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, async () => {
      while (idx < chunks.length) {
        const i = idx++;
        results[i] = await fn(chunks[i]);
      }
    }),
  );
  return results;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

class TicketUsersExport extends CheckBaseClass {
  private totalExp = new Map<string, { experience: number; level: number }>();
  private giftExp = new Map<string, number>();
  private awardItems = new Map<string, { seeds: number; candles: number }>();
  private userConfigs = new Map<string, { locale: string; country: string }>();
  private profiles = new Map<string, { no: string; nick: string; vipLevel: string; isPlayer: boolean }>();
  private hosts = new Set<string>();

  constructor() {
    super();
    this.total = 7;
  }

  protected async run(): Promise<void> {
    await this.act('查询通票经验账户（topic=ticket）', async () => {
      const r = await MySQLProdResource.query(
        'active',
        `SELECT player, experience, level FROM mod_level_user_experience WHERE biz='${BIZ}' AND topic='ticket'`,
      );
      for (const row of r.data) {
        this.totalExp.set(String(row[0]), { experience: num(row[1]), level: num(row[2]) });
      }
      this.log(`经验账户 ${this.totalExp.size} 个`);
      if (this.totalExp.size === 0) throw new Error('经验账户为空');
    });

    await this.act('查询送礼经验账户（topic=ticket-consume）', async () => {
      const r = await MySQLProdResource.query(
        'active',
        `SELECT player, experience FROM mod_level_user_experience WHERE biz='${BIZ}' AND topic='ticket-consume'`,
      );
      for (const row of r.data) {
        this.giftExp.set(String(row[0]), num(row[1]));
      }
      this.log(`送礼经验账户 ${this.giftExp.size} 个`);
    });

    await this.act('汇总种子/蜡烛奖励（等级奖励 × 奖励定义）', async () => {
      const r = await MySQLProdResource.query(
        'active',
        `SELECT a.player,
           SUM(IF(c.award_id=2, c.award_count, 0)) AS seeds,
           SUM(IF(c.award_id=1, c.award_count, 0)) AS candles
         FROM mod_level_user_award a
         JOIN mod_common_award c
           ON c.biz=a.biz AND c.name='level' AND c.player_type='USER' AND c.locale='*'
          AND c.stage=a.level AND c.award_type='EVENT' AND c.award_id IN (1,2)
         WHERE a.biz='${BIZ}' AND a.topic='ticket'
         GROUP BY a.player`,
      );
      for (const row of r.data) {
        this.awardItems.set(String(row[0]), { seeds: num(row[1]), candles: num(row[2]) });
      }
      this.log(`有种子/蜡烛奖励的用户 ${this.awardItems.size} 个`);
    });

    const uids = [...this.totalExp.keys()];
    const chunks = chunk(uids, CHUNK_SIZE);
    this.log(`用户 ${uids.length} 个，分 ${chunks.length} 片查询 funbit`);

    await this.act('查询用户大区/国家（user_config：locale/country_code）', async () => {
      let done = 0;
      await mapChunks(chunks, async (ids) => {
        const r = await MySQLProdResource.query(
          'funbit',
          `SELECT id, locale, country_code FROM user_config WHERE id IN (${ids.join(',')})`,
        );
        for (const row of r.data) {
          this.userConfigs.set(String(row[0]), { locale: String(row[1] ?? ''), country: String(row[2] ?? '') });
        }
        done++;
        if (done % 10 === 0 || done === chunks.length) this.log(`user_config 进度 ${done}/${chunks.length}`);
      });
      this.log(`命中 user_config ${this.userConfigs.size} 个`);
    });

    await this.act('查询用户信息（user_profile：no/nick/VIP/is_player）', async () => {
      let done = 0;
      await mapChunks(chunks, async (ids) => {
        const r = await MySQLProdResource.query(
          'funbit',
          `SELECT id, no, nick, vip_level, is_player FROM user_profile WHERE id IN (${ids.join(',')})`,
        );
        for (const row of r.data) {
          this.profiles.set(String(row[0]), {
            no: String(row[1] ?? ''),
            nick: String(row[2] ?? ''),
            vipLevel: String(row[3] ?? ''),
            isPlayer: row[4] === true || row[4] === 1,
          });
        }
        done++;
        if (done % 10 === 0 || done === chunks.length) this.log(`user_profile 进度 ${done}/${chunks.length}`);
      });
      this.log(`命中 user_profile ${this.profiles.size} 个`);
    });

    await this.act('查询主播名单（host_level_user）', async () => {
      const r = await MySQLProdResource.query('basic', 'SELECT DISTINCT user_id FROM host_level_user');
      for (const row of r.data) this.hosts.add(String(row[0]));
      this.log(`主播名单 ${this.hosts.size} 个`);
    });

    await this.act('写出 CSV', async () => {
      const header = ['locale', 'country', 'uid', 'no', 'nick', 'VIP等级', 'is player', 'is host', '通票等级', '任务获得经验值（总）', '送礼获得经验值', '获得种子数量', '获得蜡烛数量'];
      const rows: ExportRow[] = uids.map((uid) => {
        const t = this.totalExp.get(uid)!;
        const gift = this.giftExp.get(uid) ?? 0;
        const items = this.awardItems.get(uid) ?? { seeds: 0, candles: 0 };
        const p = this.profiles.get(uid);
        const c = this.userConfigs.get(uid);
        return {
          locale: c?.locale ?? '',
          country: c?.country ?? '',
          uid,
          no: p?.no ?? '',
          nick: p?.nick ?? '',
          vipLevel: p?.vipLevel ?? '',
          isPlayer: p ? (p.isPlayer ? 'Y' : 'N') : '',
          isHost: this.hosts.has(uid) ? 'Y' : 'N',
          ticketLevel: t.level,
          taskExp: t.experience - gift,
          giftExp: gift,
          seeds: items.seeds,
          candles: items.candles,
        };
      });
      rows.sort((a, b) => b.taskExp + b.giftExp - (a.taskExp + a.giftExp));
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push([r.locale, r.country, r.uid, r.no, csvCell(r.nick), r.vipLevel, r.isPlayer, r.isHost, r.ticketLevel, r.taskExp, r.giftExp, r.seeds, r.candles].join(','));
      }
      const file = join(EXPORT_DIR, `ticket-v202608-users-${timestamp()}.csv`);
      writeFileSync(file, '\uFEFF' + lines.join('\n') + '\n');
      const localeStat = new Map<string, number>();
      for (const r of rows) localeStat.set(r.locale, (localeStat.get(r.locale) ?? 0) + 1);
      this.log(`locale 分布: ${[...localeStat.entries()].map(([k, v]) => `${k || '(空)'}:${v}`).join(', ')}`);
      this.log(`导出 ${rows.length} 行 → ${file}`);
    });
  }
}

await new TicketUsersExport().execute();
