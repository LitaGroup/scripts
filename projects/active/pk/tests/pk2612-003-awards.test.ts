import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { BIZ, RUN_DEBUG_TS, IN, queryActiveSql } from './_lib/pk2612.ts';

type Row = unknown[];

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

const REFERENCED_AWARD_NAMES = [
  'couple-female', 'couple-female-daily', 'couple-male', 'couple-male-daily',
  'family', 'family_in_100_50', 'family_in_10_1', 'family_in_200_100', 'family_in_20_10',
  'family_in_50_20', 'family_in_n_200',
  'player_100_50', 'player_100_50-contributor', 'player_100_50-daily',
  'player_10_1', 'player_10_1-contributor',
  'player_1v1_24_10', 'player_1v1_50_20',
  'player_24_10', 'player_24_10-contributor',
  'player_50_20', 'player_50_20-contributor',
  'player_in_100_46', 'player_in_100_46-contributor',
  'player_in_1v1_100_46', 'player_in_1v1_50_20',
  'player_in_200_100', 'player_in_200_100-contributor', 'player_in_200_100-daily',
  'player_in_20_1', 'player_in_20_1-contributor',
  'player_in_50_20', 'player_in_50_20-contributor',
  'player_in_n_200', 'player_in_n_200-contributor', 'player_in_n_200-daily',
  'player_n_100', 'player_n_100-contributor', 'player_n_100-daily',
  'room',
  'room_in_100_50', 'room_in_100_50-contributor',
  'room_in_10_1', 'room_in_10_1-contributor',
  'room_in_200_100', 'room_in_200_100-contributor',
  'room_in_20_10', 'room_in_20_10-contributor',
  'room_in_50_20', 'room_in_50_20-contributor',
  'room_in_n_200', 'room_in_n_200-contributor',
  'user', 'user-daily',
] as const;

/**
 * TK-0649 / 2612 年度 PK：奖励配置用例。
 *
 * 数据来源：文档 3459 奖励配置表 + TK-0607 技术方案（473 ADD / 42 VIEW，共 515 行）。
 * 校验方式：测试环境只读 SQL（admin-ai 查询网关，逻辑库 active），不写库。
 */
class Pk2612Awards extends TestBaseClass {
  constructor() {
    super();
    this.total = 22;
  }

  private async query(sql: string): Promise<{ header: string[]; data: Row[] }> {
    const result = await queryActiveSql(sql);
    // queryActiveSql 只返回 data，列顺序按 SQL 投影顺序，测试内自行按索引取值。
    return { header: [], data: result };
  }

  protected async run(): Promise<void> {
    await this.check('奖励配置总行数为 512，ADD 470、VIEW 42（需求方 2026-11-25 确认）', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT COUNT(*) AS total, SUM(\`mod\`='ADD') AS add_cnt, SUM(\`mod\`='VIEW') AS view_cnt FROM mod_common_award WHERE biz='${BIZ}'`,
      );
      const row = data.data[0] ?? [];
      const total = Number(row[0] ?? 0);
      const add = Number(row[1] ?? 0);
      const view = Number(row[2] ?? 0);
      const expect = 'total=512, ADD=470, VIEW=42';
      const real = `total=${total}, ADD=${add}, VIEW=${view}`;
      return { expect, real, pass: total === 512 && add === 470 && view === 42 };
    });

    await this.check('YAML 引用的 54 个 awardName 均有奖励配置（无缺失结算奖励）', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT DISTINCT name FROM mod_common_award WHERE biz='${BIZ}' ORDER BY name`,
      );
      const actual = new Set(data.data.map((r) => str(r[0])));
      const missing = REFERENCED_AWARD_NAMES.filter((n) => !actual.has(n));
      return {
        expect: `54 个引用 awardName 全部存在`,
        real: missing.length === 0 ? `54 个全部存在` : `缺少 ${missing.length} 个：${missing.join(',')}`,
        pass: missing.length === 0,
      };
    });

    await this.check('奖励配置不存在未被 YAML 引用的孤儿 awardName', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT DISTINCT name FROM mod_common_award WHERE biz='${BIZ}' ORDER BY name`,
      );
      const referenced = new Set<string>(REFERENCED_AWARD_NAMES);
      const orphans = data.data.map((r) => str(r[0])).filter((n) => !referenced.has(n));
      return {
        expect: '孤儿 awardName 0 个',
        real: orphans.length === 0 ? '0 个' : `${orphans.length} 个：${orphans.join(',')}`,
        pass: orphans.length === 0,
      };
    });

    await this.check('需求未列出的 room-contributor 不应存在奖励配置', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT COUNT(*) AS c FROM mod_common_award WHERE biz='${BIZ}' AND name='room-contributor'`,
      );
      const count = Number(data.data[0]?.[0] ?? 0);
      return { expect: 'room-contributor 配置 0 行', real: `${count} 行`, pass: count === 0 };
    });

    await this.check('保留 7 条六周年通票 EVENT=14 奖励（需求方确认 470 ADD 含 EVENT）', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT COUNT(*) AS c FROM mod_common_award WHERE biz='${BIZ}' AND award_type='EVENT'`,
      );
      const count = Number(data.data[0]?.[0] ?? 0);
      return { expect: 'EVENT 行数 7', real: `${count} 行`, pass: count === 7 };
    });

    await this.check('房间榜 N进200 第1名：A级房间铭牌 163，7天', async (): Promise<CheckResult> => {
      return this.expectAwards('room_in_n_200', 1, [['DRESS_NAMEPLATE', 163, 1, 'P7D', 'ROOM', '*']]);
    });

    await this.check('房间榜 N进200 贡献TOP1：A级气泡 1093，7天', async (): Promise<CheckResult> => {
      return this.expectAwards('room_in_n_200-contributor', 1, [['BUBBLE', 1093, 1, 'P7D', 'USER', '*']]);
    });

    await this.check('家族榜 N进200 第1名：A级铭牌 10391，5天', async (): Promise<CheckResult> => {
      return this.expectAwards('family_in_n_200', 1, [['NAMEPLATE', 10391, 1, 'P5D', 'USER', '*']]);
    });

    await this.check('陪玩榜 N进200 第1名：麦位框 14939 + 铭牌 10373，7天', async (): Promise<CheckResult> => {
      return this.expectAwards('player_in_n_200', 1, [
        ['MICBOX', 14939, 1, 'P7D', 'USER', '*'],
        ['NAMEPLATE', 10373, 1, 'P7D', 'USER', '*'],
      ]);
    });

    await this.check('陪玩榜 N进200 第4名：麦位框 14939 + 铭牌 10374，5天', async (): Promise<CheckResult> => {
      return this.expectAwards('player_in_n_200', 4, [
        ['MICBOX', 14939, 1, 'P5D', 'USER', '*'],
        ['NAMEPLATE', 10374, 1, 'P5D', 'USER', '*'],
      ]);
    });

    await this.check('陪玩榜 N进200 贡献TOP1：麦位框 14940，5天', async (): Promise<CheckResult> => {
      return this.expectAwards('player_in_n_200-contributor', 1, [['MICBOX', 14940, 1, 'P5D', 'USER', '*']]);
    });

    await this.check('陪玩榜 决赛 第1名 ADD 奖励与 3459 一致', async (): Promise<CheckResult> => {
      return this.expectAwards('player_10_1', 1, [
        ['NAMEPLATE', 10385, 1, 'P125D', 'USER', '*'],
        ['BUBBLE', 1096, 1, 'P125D', 'USER', '*'],
        ['MICBOX', 14945, 1, 'P125D', 'USER', '*'],
        ['HEADBOX', 4721, 1, 'P125D', 'USER', '*'],
        ['INFOCARD', 72, 1, 'P125D', 'USER', '*'],
        ['HOMEANIMATION', 166, 1, 'P125D', 'USER', '*'],
      ]);
    });

    await this.check('陪玩榜 1V1 100进46 获胜奖励：麦位框 14942 + 飘屏 147，5天', async (): Promise<CheckResult> => {
      return this.expectAwards('player_in_1v1_100_46', 1, [
        ['MICBOX', 14942, 1, 'P5D', 'USER', '*'],
        ['FLOATING', 147, 1, 'P5D', 'USER', '*'],
      ]);
    });

    await this.check('陪玩榜 1V1 50进20 获胜奖励：飘屏 148 + 声波 145，7天', async (): Promise<CheckResult> => {
      return this.expectAwards('player_in_1v1_50_20', 1, [
        ['FLOATING', 148, 1, 'P7D', 'USER', '*'],
        ['SOUNDWAVE', 145, 1, 'P7D', 'USER', '*'],
      ]);
    });

    await this.check('用户榜 日榜第1名：麦位框 14946 + 气泡 1098 + EVENT 通票，5天', async (): Promise<CheckResult> => {
      return this.expectAwards('user-daily', 1, [
        ['MICBOX', 14946, 1, 'P5D', 'USER', '*'],
        ['BUBBLE', 1098, 1, 'P5D', 'USER', '*'],
        ['EVENT', 14, 1, '', 'USER', '*'],
      ]);
    });

    await this.check('用户榜 总榜第1名 ADD：铭牌/主页特效/麦位框/头像框/声波/座驾，125天', async (): Promise<CheckResult> => {
      return this.expectAwards('user', 1, [
        ['NAMEPLATE', 10388, 1, 'P125D', 'USER', '*'],
        ['HOMEANIMATION', 167, 1, 'P125D', 'USER', '*'],
        ['MICBOX', 14947, 1, 'P125D', 'USER', '*'],
        ['HEADBOX', 4724, 1, 'P125D', 'USER', '*'],
        ['SOUNDWAVE', 146, 1, 'P125D', 'USER', '*'],
        ['CAR', 1117, 1, 'P125D', 'USER', '*'],
      ]);
    });

    await this.check('CP 榜 总榜第1名（女）：头像框/麦位框/飘屏/座驾，125天', async (): Promise<CheckResult> => {
      return this.expectAwards('couple-female', 1, [
        ['HEADBOX', 4728, 1, 'P125D', 'USER', '*'],
        ['MICBOX', 14951, 1, 'P125D', 'USER', '*'],
        ['FLOATING', 150, 1, 'P125D', 'USER', '*'],
        ['CAR', 1120, 1, 'P125D', 'USER', '*'],
      ]);
    });

    await this.check('CP 榜 总榜第1名（男）：头像框/麦位框/飘屏/座驾，125天', async (): Promise<CheckResult> => {
      return this.expectAwards('couple-male', 1, [
        ['HEADBOX', 4727, 1, 'P125D', 'USER', '*'],
        ['MICBOX', 14950, 1, 'P125D', 'USER', '*'],
        ['FLOATING', 149, 1, 'P125D', 'USER', '*'],
        ['CAR', 1119, 1, 'P125D', 'USER', '*'],
      ]);
    });

    await this.check('42 项 VIEW 特殊奖励均为非自动发放类型（mod=VIEW）', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT award_type, COUNT(*) AS c FROM mod_common_award WHERE biz='${BIZ}' AND \`mod\`='VIEW' GROUP BY award_type ORDER BY award_type`,
      );
      const detail = data.data.map((r) => `${str(r[0])}=${Number(r[1])}`).join(',');
      const total = data.data.reduce((s, r) => s + Number(r[1]), 0);
      const autoTypes = new Set([
        'NAMEPLATE', 'MICBOX', 'BUBBLE', 'HEADBOX', 'CAR', 'FLOATING', 'SOUNDWAVE', 'INFOCARD',
        'HOMEANIMATION', 'FAMILY_BACKGROUND', 'FAMILY_TAG', 'FAMILY_HEADBOX', 'DRESS_NAMEPLATE',
        'DRESS_FRAME', 'ROOM_THEME',
      ]);
      const autoInView = data.data.filter((r) => autoTypes.has(str(r[0]))).map((r) => str(r[0]));
      return {
        expect: 'VIEW 合计 42，且不含普通自动发奖道具类型',
        real: `合计=${total}; ${detail}; 异常类型=${autoInView.join(',') || '无'}`,
        pass: total === 42 && autoInView.length === 0,
      };
    });

    await this.check('贡献者奖励 player_type 均为 USER（房间贡献者不应发房间）', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT name, player_type, COUNT(*) AS c FROM mod_common_award` +
        ` WHERE biz='${BIZ}' AND name LIKE '%-contributor' AND player_type <> 'USER' GROUP BY name, player_type ORDER BY name`,
      );
      const bad = data.data.map((r) => `${str(r[0])}:${str(r[1])}×${Number(r[2])}`);
      return {
        expect: '所有 -contributor 奖励 player_type=USER',
        real: bad.length === 0 ? '全部为 USER' : `异常 ${bad.join(',')}`,
        pass: bad.length === 0,
      };
    });

    await this.check('家族成员铭牌奖励 player_type 均为 USER（家族内所有用户）', async (): Promise<CheckResult> => {
      const data = await this.query(
        `SELECT name, player_type, COUNT(*) AS c FROM mod_common_award` +
        ` WHERE biz='${BIZ}' AND name LIKE 'family%' AND award_type='NAMEPLATE' AND player_type <> 'USER'` +
        ` GROUP BY name, player_type ORDER BY name`,
      );
      const bad = data.data.map((r) => `${str(r[0])}:${str(r[1])}×${Number(r[2])}`);
      return {
        expect: 'family_in_* 的 NAMEPLATE 奖励 player_type=USER',
        real: bad.length === 0 ? '全部为 USER' : `异常 ${bad.join(',')}`,
        pass: bad.length === 0,
      };
    });

    await this.check('奖励详情接口 award-details 在活动期可访问且返回模块奖励', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${BIZ}/award-details`, {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      })) as Record<string, unknown>;
      const modules = Object.keys(data ?? {});
      const withAwards = modules.filter((m) => {
        const d = data[m] as Record<string, unknown>;
        return Array.isArray(d?.mainAwards) && d.mainAwards.length > 0;
      });
      return {
        expect: '返回模块数 >= 20 且有奖励模块 >= 10',
        real: `模块数=${modules.length}, 有奖励模块=${withAwards.length}`,
        pass: modules.length >= 20 && withAwards.length >= 10,
      };
    });
  }

  private async expectAwards(
    name: string,
    stage: number,
    expected: Array<[string, number, number, string, string, string]>,
    limit?: number,
    mod = 'ADD',
  ): Promise<CheckResult> {
    const sql =
      `SELECT award_type, award_id, award_count, expire_express, player_type, locale` +
      ` FROM mod_common_award WHERE biz='${BIZ}' AND name='${name}' AND stage=${stage} AND \`mod\`='${mod}'` +
      ` ORDER BY \`sequence\`${limit ? ` LIMIT ${limit}` : ''}`;
    const data = await this.query(sql);
    const real = data.data.map((r) => r.map((v) => str(v)));
    const sortedReal = [...real].map((r) => r.join('|')).sort();
    const sortedExpect = expected.map((r) => r.map((v) => String(v)).join('|')).sort();
    return {
      expect: sortedExpect.join(' ; '),
      real: sortedReal.length ? sortedReal.join(' ; ') : '无数据',
      pass: JSON.stringify(sortedExpect) === JSON.stringify(sortedReal),
    };
  }
}

await new Pk2612Awards().execute();
