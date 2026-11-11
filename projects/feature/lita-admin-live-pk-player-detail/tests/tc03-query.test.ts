/**
 * 项目3718 / Admin 直播PK场次数据：查询基线、单日、ID/NO 批量（用例 #6、#7、#8）
 * 用例来源：/task/20261111/TK-0209/HANDOFF；技术方案：/task/20261111/TK-0209/TECH_DESIGN（SK3、BD-01）
 * 覆盖：#6 区间 33 行 ×2 数据行（D1 印尼语区 / D2 不选大区，各 8 检查点）；#7 单日 14 行（6）；#8 ID/NO/批量 ×4 数据行（各 4）
 * 数据隔离：仅查询现有 PK 数据；不造数、不写库。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc03-query.test.ts
 */
import { AdminBase } from './lib/admin-base.ts';

const HASH = '/data-stats-manager/live-data/live-pk-player-detail';

class QueryTest extends AdminBase {
  private lastMessage = '';

  constructor() {
    super('live-pk-query');
    this.total = 38;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.openReport(HASH);

    // 用例#6 D1：大区=印尼语区
    await this.case6('D1', true);
    // 用例#6 D2：大区不选
    await this.case6('D2', false);

    // 用例#7：2026-11-10 单日
    await this.act('用例#7 步骤：查询 2026-11-10 单日 + 印尼语区', async () => {
      await this.resetAll();
      await this.setDate('开始日期', '2026-11-10');
      await this.setDate('结束日期', '2026-11-10');
      await this.pickOption('大区', '印尼语区');
      await this.clickQuery();
      this.lastMessage = await this.messageText();
      await this.pageSize(10);
    });
    const msg7 = this.lastMessage;
    const total7 = await this.totalText();
    const page1 = await this.rows();
    await this.gotoPage(2);
    const page2 = await this.rows();
    const rows7 = [...page1, ...page2];
    await this.check('用例#7-① 出现提示「查询完成，共 14 条」', async () => ({ expect: '查询完成，共 14 条', real: msg7, pass: msg7 === '查询完成，共 14 条' }));
    await this.shot('用例#7-①');
    await this.check('用例#7-② 分页显示 Total 14', async () => ({ expect: 'Total 14', real: total7, pass: total7 === 'Total 14' }));
    await this.shot('用例#7-②');
    await this.check('用例#7-③ 第 1 页 10 行、第 2 页 4 行', async () => ({
      expect: '第1页=10|第2页=4',
      real: `第1页=${page1.length}|第2页=${page2.length}`,
      pass: page1.length === 10 && page2.length === 4
    }));
    await this.shot('用例#7-③');
    await this.check('用例#7-④ 14 行 date 列均显示 2026-11-10', async () => {
      const dates = [...new Set(rows7.map((r) => r[0]))];
      return { expect: '2026-11-10', real: dates.join('|'), pass: dates.length === 1 && dates[0] === '2026-11-10' };
    });
    await this.shot('用例#7-④');
    await this.check('用例#7-⑤ 首行 pk id=247、pk rank=1、player_nick=cc⁰⁷⁰⁷', async () => {
      const r = rows7[0] ?? [];
      const real = `pk id=${r[1]}；pk rank=${r[9]}；player_nick=${r[4]}`;
      return { expect: 'pk id=247；pk rank=1；player_nick=cc⁰⁷⁰⁷', real, pass: r[1] === '247' && r[9] === '1' && r[4] === 'cc⁰⁷⁰⁷' };
    });
    await this.shot('用例#7-⑤');
    await this.check('用例#7-⑥ 末行 pk id=256、pk rank=2、player_nick=ᴷᵒˢ Nickolas🎶', async () => {
      const r = rows7[rows7.length - 1] ?? [];
      const real = `pk id=${r[1]}；pk rank=${r[9]}；player_nick=${r[4]}`;
      return { expect: 'pk id=256；pk rank=2；player_nick=ᴷᵒˢ Nickolas🎶', real, pass: r[1] === '256' && r[9] === '2' && r[4] === 'ᴷᵒˢ Nickolas🎶' };
    });
    await this.shot('用例#7-⑥');

    // 用例#8：ID/NO 单值与批量（D1~D4）
    await this.case8('D1', '陪玩师ID', '450400', 3, 2, 'all', '450400');
    await this.case8('D2', '陪玩师NO', '1047392', 3, 3, 'all', '1047392');
    await this.case8('D3', '陪玩师ID', '450400,5665531', 8, 2, 'set', '450400|5665531');
    await this.case8('D4', '陪玩师ID', '450400\n5665531', 8, 2, 'set', '450400|5665531');
  }

  private async case6(tag: 'D1' | 'D2', withLocale: boolean): Promise<void> {
    await this.act(`用例#6[${tag}] 步骤：2026-11-01~11-10${withLocale ? ' + 印尼语区' : '（大区不选）'}，查询并切换 10/page`, async () => {
      await this.resetAll();
      await this.setDate('开始日期', '2026-11-01');
      await this.setDate('结束日期', '2026-11-10');
      if (withLocale) await this.pickOption('大区', '印尼语区');
      await this.clickQuery();
      this.lastMessage = await this.messageText();
      await this.pageSize(10);
    });
    const msg = this.lastMessage;
    const total = await this.totalText();
    const pages: string[][][] = [];
    pages.push(await this.rows());
    for (const n of [2, 3, 4]) {
      await this.gotoPage(n);
      pages.push(await this.rows());
    }
    const rows = pages.flat();

    await this.check(`用例#6-①[${tag}] 出现提示「查询完成，共 33 条」`, async () => ({ expect: '查询完成，共 33 条', real: msg, pass: msg === '查询完成，共 33 条' }));
    await this.shot(`用例#6-①[${tag}]`);
    await this.check(`用例#6-②[${tag}] 分页显示 Total 33`, async () => ({ expect: 'Total 33', real: total, pass: total === 'Total 33' }));
    await this.shot(`用例#6-②[${tag}]`);
    await this.check(`用例#6-③[${tag}] 四页合计 33 行数据`, async () => ({
      expect: '33',
      real: `${rows.length}（各页 ${pages.map((p) => p.length).join('/')}）`,
      pass: rows.length === 33
    }));
    await this.shot(`用例#6-③[${tag}]`);
    await this.check(`用例#6-④[${tag}] 日期分布 11-02=12、11-04=2、11-05=5、11-10=14`, async () => {
      const dist: Record<string, number> = {};
      for (const r of rows) dist[r[0]] = (dist[r[0]] ?? 0) + 1;
      const real = ['2026-11-02', '2026-11-04', '2026-11-05', '2026-11-10'].map((d) => `${d}=${dist[d] ?? 0}`).join('|');
      return { expect: '2026-11-02=12|2026-11-04=2|2026-11-05=5|2026-11-10=14', real, pass: real === '2026-11-02=12|2026-11-04=2|2026-11-05=5|2026-11-10=14' };
    });
    await this.shot(`用例#6-④[${tag}]`);
    await this.check(`用例#6-⑤[${tag}] 全部数据按 date、pk id、pk rank 升序排列`, async () => {
      const key = (r: string[]) => [r[0], Number(r[1]), Number(r[9])] as [string, number, number];
      const cmp = (a: [string, number, number], b: [string, number, number]) => a[0] === b[0] ? (a[1] === b[1] ? a[2] - b[2] : a[1] - b[1]) : (a[0] < b[0] ? -1 : 1);
      const keys = rows.map(key);
      const sorted = [...keys].sort(cmp);
      const ok = JSON.stringify(keys) === JSON.stringify(sorted);
      const bad = keys.findIndex((k, i) => JSON.stringify(k) !== JSON.stringify(sorted[i]));
      return { expect: '升序（33 行）', real: ok ? '升序（33 行）' : `第 ${bad + 1} 行起次序不符：${JSON.stringify(keys[bad])}`, pass: ok };
    });
    await this.shot(`用例#6-⑤[${tag}]`);
    await this.check(`用例#6-⑥[${tag}] pk id=227 两行依次为 rank1/Aurynnnnn、rank2/🎡꯴𝜗Ordin 🐉`, async () => {
      const pk = rows.filter((r) => r[1] === '227');
      const real = pk.map((r) => `rank${r[9]}/${r[4]}`).join('；');
      return { expect: 'rank1/Aurynnnnn；rank2/🎡꯴𝜗Ordin 🐉', real, pass: pk.length === 2 && pk[0][9] === '1' && pk[0][4] === 'Aurynnnnn' && pk[1][9] === '2' && pk[1][4] === '🎡꯴𝜗Ordin 🐉' };
    });
    await this.shot(`用例#6-⑥[${tag}]`);
    await this.check(`用例#6-⑦[${tag}] 首行 date=2026-11-02、pk id=227、pk rank=1`, async () => {
      const r = rows[0] ?? [];
      return { expect: '2026-11-02/227/1', real: `${r[0]}/${r[1]}/${r[9]}`, pass: r[0] === '2026-11-02' && r[1] === '227' && r[9] === '1' };
    });
    await this.shot(`用例#6-⑦[${tag}]`);
    await this.check(`用例#6-⑧[${tag}] 末行 date=2026-11-10、pk id=256、pk rank=2`, async () => {
      const r = rows[rows.length - 1] ?? [];
      return { expect: '2026-11-10/256/2', real: `${r[0]}/${r[1]}/${r[9]}`, pass: r[0] === '2026-11-10' && r[1] === '256' && r[9] === '2' };
    });
    await this.shot(`用例#6-⑧[${tag}]`);
  }

  private async case8(tag: 'D1' | 'D2' | 'D3' | 'D4', field: string, value: string, expected: number, col: number, mode: 'all' | 'set', values: string): Promise<void> {
    await this.act(`用例#8[${tag}] 步骤：${field}=${value.replace(/\n/g, '\\n')}，查询`, async () => {
      await this.resetAll();
      await this.setDate('开始日期', '2026-11-01');
      await this.setDate('结束日期', '2026-11-10');
      await this.pickOption('大区', '印尼语区');
      await this.fillField(field, value);
      await this.clickQuery();
    });
    const msg = await this.messageText();
    const total = await this.totalText();
    const rows = await this.rows();
    await this.check(`用例#8-①[${tag}] 出现提示「查询完成，共 ${expected} 条」`, async () => ({ expect: `查询完成，共 ${expected} 条`, real: msg, pass: msg === `查询完成，共 ${expected} 条` }));
    await this.shot(`用例#8-①[${tag}]`);
    await this.check(`用例#8-②[${tag}] 分页显示 Total ${expected}`, async () => ({ expect: `Total ${expected}`, real: total, pass: total === `Total ${expected}` }));
    await this.shot(`用例#8-②[${tag}]`);
    await this.check(`用例#8-③[${tag}] 列表显示 ${expected} 行数据`, async () => ({ expect: String(expected), real: String(rows.length), pass: rows.length === expected }));
    await this.shot(`用例#8-③[${tag}]`);
    await this.check(`用例#8-④[${tag}] 所有数据行第 ${col + 1} 列满足数据行列值约定`, async () => {
      const actual = rows.map((r) => r[col]);
      if (mode === 'all') {
        const ok = actual.every((v) => v === values);
        return { expect: `全部=${values}`, real: `值集=${[...new Set(actual)].join('|')}`, pass: ok };
      }
      const expectSet = new Set(values.split('|'));
      const actualSet = new Set(actual);
      const onlyExpected = actual.every((v) => expectSet.has(v));
      const bothPresent = [...expectSet].every((v) => actualSet.has(v));
      return { expect: `集合=${values}（两值均出现）`, real: `值集=${[...actualSet].join('|')}`, pass: onlyExpected && bothPresent };
    });
    await this.shot(`用例#8-④[${tag}]`);
  }

  private async resetAll(): Promise<void> {
    await this.clickReset();
    await this.page!.locator('.el-table__empty-text').waitFor({ state: 'visible', timeout: 10000 });
  }
}

new QueryTest().execute();
