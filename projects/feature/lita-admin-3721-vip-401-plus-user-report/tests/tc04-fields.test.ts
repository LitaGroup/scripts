/**
 * 项目3721 / >=401用户数据报表：列表字段、数据时效与重置
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#14 重置；#15 29 列表头；#16 空值「-」；#17 Is Player；#18 Become Bigr Date；
 *       #19 贵族 CN/EN；#20 数据更新时间
 * 数据隔离：只读存量；不造数、无清理；证据仅本机 evidence 目录（脱敏）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc04-fields.test.ts
 */
import { AdminBase } from './lib/admin-base.ts';

const EXPECTED_HEADERS = [
  'User ID', 'User No', 'Nickname', 'Is Player', 'VIP Level', 'Registration Date', 'Become Bigr Date',
  'Last Login Date', 'Billionaire Rank (Previous Month)', 'Billionaire Rank (Current Month)',
  'Most Active Voice Room ID (Last 7 Days)', 'Most Active Voice Room Name (Last 7 Days)',
  'Top Spending Voice Room ID (Last 7 Days)', 'Top Spending Voice Room Name (Last 7 Days)',
  'SVIP Level', 'Last SVIP Renewal Date', 'SVIP Expiration Date',
  'Noble level(CN)', 'Noble level(EN)', 'Noble level Type', 'Noble level Expiration Date',
  'Family ID', 'Family NO', 'Family Name', 'Family Creation Date', 'Family Grade', 'Family Level',
  'Family Join Date', 'Family Leave Date'
];

const NOBLE_EN: Record<string, string> = {
  '剑士': 'Swordsman',
  '骑士': 'Knight',
  '子爵': 'Viscount',
  '伯爵': 'Earl',
  '侯爵': 'Marquis',
  '公爵': 'Duke'
};

class Tc04Fields extends AdminBase {
  constructor() {
    super('tc04-fields');
    this.total = 19;
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 登录并进入 >=401用户数据 报表', async () => {
      await this.login();
      await this.navReport();
    });

    // ===== 用例#15（先于任何查询，验证表头仅查询后渲染）=====
    const headersBefore = await this.tableHeaders();
    await this.act('用例#15 保持默认条件点击查询并读取表头', async () => {
      this.notes.push(`case15-query=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case15-headers', true);
    });
    const headersAfter = await this.tableHeaders();
    const case15 = JSON.parse(this.notes.find((n) => n.startsWith('case15-query='))!.slice('case15-query='.length)) as { message: string; total: number };
    await this.checkShot('用例#15-① 表头共 29 列且无缺失/多余/错位', async () => {
      const normalized = headersAfter.map((h) => h.toLowerCase());
      const expectedLower = EXPECTED_HEADERS.map((h) => h.toLowerCase());
      const sameOrder = normalized.length === expectedLower.length && normalized.every((h, i) => h === expectedLower[i]);
      return { expect: '29 列且列名与需求清单逐列对应（不计大小写）', real: `${headersAfter.length} 列：${JSON.stringify(headersAfter)}`, pass: sameOrder };
    });
    await this.checkShot('用例#15-② 各列英文名称与需求文档一致（含大小写）', async () => {
      const mismatches = headersAfter.map((h, i) => ({ index: i + 1, actual: h, expected: EXPECTED_HEADERS[i] })).filter((x) => x.actual !== x.expected);
      return {
        expect: '29 列英文名称与需求文档逐列完全一致',
        real: mismatches.length ? `${mismatches.length} 列不一致，示例 ${JSON.stringify(mismatches.slice(0, 5))}` : '全部一致',
        pass: mismatches.length === 0
      };
    });
    await this.checkShot('用例#15-③ 表头仅在查询后渲染（未查询时无表头）', async () => ({
      expect: '查询前 0 列、查询后 29 列',
      real: `查询前 ${headersBefore.length} 列、查询后 ${headersAfter.length} 列`,
      pass: headersBefore.length === 0 && headersAfter.length === 29
    }));

    // ===== 用例#16 =====
    const rows16 = await this.tableRows();
    await this.checkShot('用例#16-① 第 9-14/18-21 列存在至少 5 个「-」单元格', async () => {
      const indexes = [8, 9, 10, 11, 12, 13, 17, 18, 19, 20];
      let count = 0;
      for (const row of rows16) for (const idx of indexes) if (row[idx] === '-') count++;
      await this.shot('case16-empty-cells');
      return { expect: '≥5 个「-」', real: `${count} 个`, pass: count >= 5 };
    });
    await this.checkShot('用例#16-② 当前页所有数据单元格为具体值或「-」，无空白/null', async () => {
      const bad = rows16.flatMap((row, r) => row.map((cell, c) => ({ r: r + 1, c: c + 1, cell })).filter((x) => x.cell === '' || /^(null|undefined)$/i.test(x.cell)));
      return { expect: '无空白单元格、无 null/undefined 字样', real: bad.length ? `异常示例 ${JSON.stringify(bad.slice(0, 5))}` : `${rows16.length} 行全部为具体值或「-」`, pass: bad.length === 0 };
    });

    // ===== 用例#17 =====
    await this.checkShot('用例#17-① 第 4 列 Is Player 各行取值仅为「是」或「否」', async () => {
      const values = rows16.map((row) => row[3]);
      const bad = values.filter((v) => v !== '是' && v !== '否');
      return { expect: '仅「是」/「否」', real: bad.length ? `异常值 ${JSON.stringify([...new Set(bad)])}` : `${values.length} 行均为是/否`, pass: bad.length === 0 };
    });
    await this.checkShot('用例#17-② 当前页同时存在「是」与「否」的用户', async () => {
      const values = new Set(rows16.map((row) => row[3]));
      return { expect: '同时存在「是」与「否」', real: `出现取值 ${JSON.stringify([...values])}`, pass: values.has('是') && values.has('否') };
    });

    // ===== 用例#18 =====
    await this.act('用例#18 查询 VIP 401-500 并读取 Become Bigr Date 列', async () => {
      await this.clickReset();
      await this.fillField('VIP等级下限', '401');
      await this.fillField('VIP等级上限', '500');
      this.notes.push(`case18-query=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case18-vip401-500', true);
    });
    const case18 = JSON.parse(this.notes.find((n) => n.startsWith('case18-query='))!.slice('case18-query='.length)) as { total: number };
    const rows18 = await this.tableRows();
    await this.checkShot('用例#18-① VIP 401-500 结果各行 Become Bigr Date 均显示「-」', async () => {
      const values = rows18.map((row) => row[6]);
      return { expect: '全部为「-」', real: values.length ? `出现值 ${JSON.stringify([...new Set(values)])}` : '无数据行', pass: rows18.length > 0 && values.every((v) => v === '-') };
    });
    await this.checkShot('用例#18-② 结果各行 VIP Level 均处于 401-500', async () => {
      const bad = rows18.map((r) => r[4]).filter((v) => { const n = Number(v); return !Number.isInteger(n) || n < 401 || n > 500; });
      return { expect: '全部 ∈ [401,500]', real: bad.length ? `越界值 ${JSON.stringify([...new Set(bad)])}` : `${rows18.length} 行全部在区间内（Total ${case18.total}）`, pass: rows18.length > 0 && bad.length === 0 };
    });

    // ===== 用例#19 =====
    await this.act('用例#19 默认查询后查找存在贵族等级数据的行', async () => {
      await this.clickReset();
      this.notes.push(`case19-query=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case19-noble-scan', true);
    });
    const rows19 = await this.tableRows();
    const nobleRow = rows19.find((row) => row[17] !== '-');
    await this.checkShot('用例#19-① 第 18 列 Noble level(CN) 取自「剑士/骑士/子爵/伯爵/侯爵/公爵」', async () => {
      if (!nobleRow) return { expect: '存在非「-」贵族中文档位', real: '当前页未找到非「-」行', pass: false };
      return { expect: '属于 6 档中文名称之一', real: `「${nobleRow[17]}」`, pass: Object.prototype.hasOwnProperty.call(NOBLE_EN, nobleRow[17]) };
    });
    await this.checkShot('用例#19-② 第 19 列 Noble level(EN) 与中文档位一一对应', async () => {
      if (!nobleRow) return { expect: '英文档位与中文对应', real: '当前页未找到非「-」行', pass: false };
      const expected = NOBLE_EN[nobleRow[17]];
      return { expect: `「${nobleRow[17]}」对应「${expected}」`, real: `「${nobleRow[18]}」`, pass: !!expected && nobleRow[18] === expected };
    });
    await this.checkShot('用例#19-③ 该行 VIP Level 仍显示 401-711 数值而非贵族档位', async () => {
      if (!nobleRow) return { expect: 'VIP Level 为 401-711 数值', real: '当前页未找到非「-」行', pass: false };
      const n = Number(nobleRow[4]);
      return { expect: '数值 ∈ [401,711]', real: `「${nobleRow[4]}」`, pass: Number.isInteger(n) && n >= 401 && n <= 711 };
    });

    // ===== 用例#20 =====
    const body20 = await this.bodyText();
    const dataTimeSegment = body20.slice(body20.indexOf('Data Time:'), body20.indexOf('Metric Definitions:'));
    await this.checkShot('用例#20-① Data Time 区域展示具体的数据更新时间值', async () => ({
      expect: '「数据截至昨日」之外展示具体日期或日期时间',
      real: dataTimeSegment,
      pass: /\d{4}-\d{2}-\d{2}|\d{4}\/\d{2}\/\d{2}|\d{1,2}:\d{2}/.test(dataTimeSegment)
    }));
    await this.checkShot('用例#20-② 「数据截至昨日」提示保留', async () => ({
      expect: '含「数据截至昨日」',
      real: dataTimeSegment,
      pass: dataTimeSegment.includes('数据截至昨日')
    }));

    // ===== 用例#14 =====
    await this.act('用例#14 记录默认 Total 后设置多条件查询，再点击重置', async () => {
      const base = await this.clickReset();
      this.notes.push(`case14-t0=${base.total}`);
      await this.fillField('VIP等级下限', '500');
      await this.fillField('VIP等级上限', '711');
      await this.pickOption('最近活跃', '90天');
      await this.pickOption('大区', '印尼语区');
      const filtered = await this.clickQuery();
      this.notes.push(`case14-t1=${filtered.total}`);
      await this.shot('case14-filtered', true);
      const reset = await this.clickReset();
      this.notes.push(`case14-reset=${JSON.stringify(reset)}`);
      await this.shot('case14-reset', true);
    });
    const t0 = Number(this.notes.find((n) => n.startsWith('case14-t0='))!.slice('case14-t0='.length));
    const t1 = Number(this.notes.find((n) => n.startsWith('case14-t1='))!.slice('case14-t1='.length));
    const reset14 = JSON.parse(this.notes.find((n) => n.startsWith('case14-reset='))!.slice('case14-reset='.length)) as { message: string; total: number; newRequests: number };
    const start14 = await this.fieldValue('VIP等级下限');
    const end14 = await this.fieldValue('VIP等级上限');
    const activity14 = await this.fieldValue('最近活跃');
    const region14 = await this.fieldValue('大区');
    const tip14 = await this.conditionTip();
    await this.checkShot('用例#14-① 重置后 VIP等级下限/上限输入框清空为空', async () => ({
      expect: '下限="", 上限=""',
      real: `下限="${start14}", 上限="${end14}"`,
      pass: start14 === '' && end14 === ''
    }));
    await this.checkShot('用例#14-② 重置后最近活跃恢复为「360天」', async () => ({
      expect: '360天',
      real: activity14,
      pass: activity14 === '360天'
    }));
    await this.checkShot('用例#14-③ 重置后大区恢复为空（不限）', async () => ({
      expect: '大区为空',
      real: `"${region14}"`,
      pass: region14 === ''
    }));
    await this.checkShot('用例#14-④ 条件计数提示恢复「当前已设置查询条件：1 项」', async () => ({
      expect: '当前已设置查询条件：1 项',
      real: tip14,
      pass: /当前已设置查询条件[：:]\s*1\s*项/.test(tip14)
    }));
    await this.checkShot('用例#14-⑤ 重置后按默认条件自动刷新列表（提示与 Total 由 T1 恢复 T0）', async () => ({
      expect: `新查询提示「查询完成，共 ${t0} 条」、Total 由 ${t1} 恢复 ${t0}`,
      real: `提示「${reset14.message}」、Total=${reset14.total}、新查询=${reset14.newRequests}`,
      pass: reset14.newRequests > 0 && reset14.total === t0 && reset14.message.includes(`查询完成，共 ${t0} 条`) && t1 < t0
    }));
  }
}

await new Tc04Fields().execute();
