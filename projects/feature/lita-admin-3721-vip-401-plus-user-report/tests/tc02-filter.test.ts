/**
 * 项目3721 / >=401用户数据报表：筛选与查询
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#4 默认查询；#5 VIP 401-711；#6 仅填一端（2 数据行）；#7 大区筛选（8 数据行）；
 *       #8 最近活跃档位（4 数据行）；#9 组合筛选；#13 空结果
 * 数据隔离：只读存量；不造数、无清理；证据仅本机 evidence 目录（脱敏）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc02-filter.test.ts
 */
import { AdminBase, addDays, shanghaiDate } from './lib/admin-base.ts';

class Tc02Filter extends AdminBase {
  private case8Totals: Record<string, number> = {};
  private case8Rows30: string[][] = [];

  constructor() {
    super('tc02-filter');
    this.total = 49;
  }

  private msgCount(message: string): number | null {
    const match = message.match(/查询完成，共\s*([\d,]+)\s*条/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 登录并进入 >=401用户数据 报表', async () => {
      await this.login();
      await this.navReport();
      await this.shot('filter-page', true);
    });

    // ===== 用例#4 =====
    await this.act('用例#4 保持默认条件点击查询', async () => {
      this.notes.push(`case4=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case4-default-query', true);
    });
    const case4 = JSON.parse(this.notes.find((n) => n.startsWith('case4='))!.slice('case4='.length)) as { message: string; total: number };
    const case4Rows = await this.tableRows();
    const case4Headers = await this.tableHeaders();
    await this.checkShot('用例#4-① 出现「查询完成，共 N 条」且 N>0', async () => ({
      expect: '提示「查询完成，共 N 条」且 N>0',
      real: case4.message,
      pass: this.msgCount(case4.message) !== null && (this.msgCount(case4.message) ?? 0) > 0
    }));
    await this.checkShot('用例#4-② 表头渲染 29 列且当前页 20 行', async () => ({
      expect: '表头 29 列、当前页 20 行',
      real: `表头 ${case4Headers.length} 列、当前页 ${case4Rows.length} 行`,
      pass: case4Headers.length === 29 && case4Rows.length === 20
    }));
    await this.checkShot('用例#4-③ 分页 Total 与提示条数一致', async () => ({
      expect: `Total=${this.msgCount(case4.message)}`,
      real: `Total=${case4.total}`,
      pass: case4.total === this.msgCount(case4.message)
    }));
    await this.checkShot('用例#4-④ 当前页各行 VIP Level 均处于 401-711', async () => {
      const values = case4Rows.map((row) => row[4]);
      const bad = values.filter((v) => { const n = Number(v); return !Number.isInteger(n) || n < 401 || n > 711; });
      return { expect: '全部 ∈ [401,711]', real: bad.length ? `越界值 ${JSON.stringify(bad)}` : `样本 ${JSON.stringify(values.slice(0, 8))} 全部在区间内`, pass: bad.length === 0 };
    });

    // ===== 用例#5 =====
    await this.act('用例#5 设置 VIP 等级 401-711 查询', async () => {
      await this.fillField('VIP等级下限', '401');
      await this.fillField('VIP等级上限', '711');
      this.notes.push(`case5=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case5-vip-range', true);
    });
    const case5 = JSON.parse(this.notes.find((n) => n.startsWith('case5='))!.slice('case5='.length)) as { message: string; total: number };
    const case5Rows = await this.tableRows();
    await this.checkShot('用例#5-① 查询成功且无校验拦截提示', async () => ({
      expect: '「查询完成，共 N 条」，无校验拦截',
      real: case5.message,
      pass: this.msgCount(case5.message) !== null
    }));
    await this.checkShot('用例#5-② 结果各行 VIP Level 均处于 401-711', async () => {
      const bad = case5Rows.map((r) => r[4]).filter((v) => { const n = Number(v); return !Number.isInteger(n) || n < 401 || n > 711; });
      return { expect: '全部 ∈ [401,711]', real: bad.length ? `越界值 ${JSON.stringify(bad.slice(0, 5))}` : `共 ${case5Rows.length} 行全部在区间内`, pass: bad.length === 0 };
    });
    await this.checkShot('用例#5-③ 分页 Total 与提示条数一致', async () => ({
      expect: `Total=${this.msgCount(case5.message)}`,
      real: `Total=${case5.total}`,
      pass: case5.total === this.msgCount(case5.message)
    }));

    // ===== 用例#6（数据行 2 行）=====
    const oneSided: Array<{ no: number; lower: string; upper: string; label: string }> = [
      { no: 1, lower: '', upper: '711', label: '仅填上限 711（下限留空）' },
      { no: 2, lower: '711', upper: '', label: '仅填下限 711（上限留空）' }
    ];
    for (const row of oneSided) {
      await this.act(`用例#6[数据行${row.no}] ${row.label}并查询`, async () => {
        await this.fillField('VIP等级下限', row.lower);
        await this.fillField('VIP等级上限', row.upper);
        this.notes.push(`case6-${row.no}=${JSON.stringify(await this.clickQuery())}`);
        await this.shot(`case6-row${row.no}`, true);
      });
      const result = JSON.parse(this.notes.find((n) => n.startsWith(`case6-${row.no}=`))!.slice(`case6-${row.no}=`.length)) as { message: string; total: number };
      const start = await this.fieldValue('VIP等级下限');
      const end = await this.fieldValue('VIP等级上限');
      const rows = await this.tableRows();
      await this.checkShot(`用例#6-①[数据行${row.no}] 查询后两个输入框均显示 711`, async () => ({
        expect: '下限=711、上限=711',
        real: `下限=${start}、上限=${end}`,
        pass: start === '711' && end === '711'
      }));
      await this.checkShot(`用例#6-②[数据行${row.no}] 结果各行 VIP Level 均为 711`, async () => {
        const bad = rows.filter((r) => r[4] !== '711');
        return { expect: '全部 = 711', real: bad.length ? `异常行 VIP=${JSON.stringify(bad.map((r) => r[4]).slice(0, 5))}` : `${rows.length} 行全部为 711`, pass: rows.length > 0 && bad.length === 0 };
      });
      await this.checkShot(`用例#6-③[数据行${row.no}] 提示共 1 条且 Total 1`, async () => ({
        expect: '「查询完成，共 1 条」、Total 1',
        real: `提示「${result.message}」、Total ${result.total}`,
        pass: this.msgCount(result.message) === 1 && result.total === 1
      }));
    }

    // ===== 用例#7（数据行 8 行）=====
    await this.act('用例#7 记录默认条件 Total 作为收窄基线', async () => {
      const reset = await this.clickReset();
      this.notes.push(`case7-t0=${reset.total}`);
    });
    const t0 = Number(this.notes.find((n) => n.startsWith('case7-t0='))!.slice('case7-t0='.length));
    const regions = ['印尼语区', '越南区', '泰国区', '英语区', '阿拉伯语区', '中文区', '韩国区', '菲律宾区'];
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      await this.act(`用例#7[数据行${i + 1}] 大区=${region} 查询`, async () => {
        await this.pickOption('大区', region);
        this.notes.push(`case7-${i + 1}=${JSON.stringify(await this.clickQuery())}`);
        await this.shot(`case7-row${i + 1}-${region}`, true);
      });
      const result = JSON.parse(this.notes.find((n) => n.startsWith(`case7-${i + 1}=`))!.slice(`case7-${i + 1}=`.length)) as { message: string; total: number };
      const rows = await this.tableRows();
      const headers = await this.tableHeaders();
      await this.checkShot(`用例#7-①[数据行${i + 1}] 大区=${region} 查询成功`, async () => ({
        expect: '提示「查询完成，共 N 条」',
        real: result.message,
        pass: this.msgCount(result.message) !== null
      }));
      await this.checkShot(`用例#7-②[数据行${i + 1}] 大区=${region} 的 Total 小于默认全集 ${t0}`, async () => ({
        expect: `< ${t0}`,
        real: `${result.total}`,
        pass: result.total < t0
      }));
      await this.checkShot(`用例#7-③[数据行${i + 1}] 大区=${region} 仍渲染 29 列表头且当前页不超过 20 行`, async () => ({
        expect: '表头 29 列、行数 ≤20',
        real: `表头 ${headers.length} 列、行数 ${rows.length}`,
        pass: headers.length === 29 && rows.length <= 20
      }));
    }

    // ===== 用例#8（数据行 4 行）=====
    await this.act('用例#8 恢复默认条件后按档位依次查询（360/180/90/30）', async () => {
      await this.clickReset();
    });
    const tiers = ['360天', '180天', '90天', '30天'];
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      await this.act(`用例#8[数据行${i + 1}] 最近活跃=${tier} 查询`, async () => {
        await this.pickOption('最近活跃', tier);
        const result = await this.clickQuery();
        this.case8Totals[tier] = result.total;
        this.notes.push(`case8-${tier}=${JSON.stringify(result)}`);
        if (tier === '30天') this.case8Rows30 = await this.tableRows();
        await this.shot(`case8-${tier}`, true);
      });
      const result = JSON.parse(this.notes.find((n) => n.startsWith(`case8-${tier}=`))!.slice(`case8-${tier}=`.length)) as { message: string; total: number };
      await this.checkShot(`用例#8-①[数据行${i + 1}] 最近活跃=${tier} 查询成功`, async () => ({
        expect: '提示「查询完成，共 N 条」',
        real: result.message,
        pass: this.msgCount(result.message) !== null
      }));
    }
    await this.checkShot('用例#8-② Total(30天) ≤ Total(90天) ≤ Total(180天) ≤ Total(360天)', async () => {
      const t30 = this.case8Totals['30天'], t90 = this.case8Totals['90天'], t180 = this.case8Totals['180天'], t360 = this.case8Totals['360天'];
      return {
        expect: '30 ≤ 90 ≤ 180 ≤ 360',
        real: `30=${t30}、90=${t90}、180=${t180}、360=${t360}`,
        pass: t30 <= t90 && t90 <= t180 && t180 <= t360
      };
    });
    await this.checkShot('用例#8-③ 30天档结果第 8 列最近登录日期不早于数据日期前 29 天', async () => {
      const dataDate = shanghaiDate(-1);
      const cutoff = addDays(dataDate, -29);
      const dates = this.case8Rows30.map((row) => row[7]);
      const bad = dates.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < cutoff);
      return {
        expect: `全部 ≥ ${cutoff}（数据日期 ${dataDate}）`,
        real: bad.length ? `越界/非法日期 ${JSON.stringify(bad.slice(0, 8))}` : `样本 ${JSON.stringify(dates.slice(0, 8))} 全部在窗口内`,
        pass: dates.length > 0 && bad.length === 0
      };
    });

    // ===== 用例#9 =====
    await this.act('用例#9 分别查询 VIP 610-711、印尼语区、组合条件', async () => {
      await this.clickReset();
      await this.fillField('VIP等级下限', '610');
      await this.fillField('VIP等级上限', '711');
      const vipOnly = await this.clickQuery();
      await this.clickReset();
      await this.pickOption('大区', '印尼语区');
      const regionOnly = await this.clickQuery();
      await this.fillField('VIP等级下限', '610');
      await this.fillField('VIP等级上限', '711');
      const combo = await this.clickQuery();
      this.notes.push(`case9=${JSON.stringify({ vipOnly, regionOnly, combo })}`);
      await this.shot('case9-combo', true);
    });
    const case9 = JSON.parse(this.notes.find((n) => n.startsWith('case9='))!.slice('case9='.length)) as {
      vipOnly: { message: string; total: number }; regionOnly: { total: number }; combo: { message: string; total: number };
    };
    const case9Rows = await this.tableRows();
    await this.checkShot('用例#9-① 组合查询成功并出现查询完成提示', async () => ({
      expect: '提示「查询完成，共 N 条」',
      real: case9.combo.message,
      pass: this.msgCount(case9.combo.message) !== null
    }));
    await this.checkShot('用例#9-② 组合 Total ≤ 仅 VIP 范围 Total 且 ≤ 仅大区 Total', async () => ({
      expect: `组合 ≤ min(${case9.vipOnly.total}, ${case9.regionOnly.total})`,
      real: `组合=${case9.combo.total}；仅VIP=${case9.vipOnly.total}；仅大区=${case9.regionOnly.total}`,
      pass: case9.combo.total <= case9.vipOnly.total && case9.combo.total <= case9.regionOnly.total
    }));
    await this.checkShot('用例#9-③ 组合结果各行 VIP Level 均处于 610-711', async () => {
      const bad = case9Rows.map((r) => r[4]).filter((v) => { const n = Number(v); return !Number.isInteger(n) || n < 610 || n > 711; });
      return { expect: '全部 ∈ [610,711]', real: bad.length ? `越界值 ${JSON.stringify(bad.slice(0, 5))}` : `${case9Rows.length} 行全部在区间内`, pass: bad.length === 0 };
    });

    // ===== 用例#13 =====
    await this.act('用例#13 查询 VIP 等级 1-400（低于圈选下限）', async () => {
      await this.clickReset();
      await this.fillField('VIP等级下限', '1');
      await this.fillField('VIP等级上限', '400');
      this.notes.push(`case13=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case13-empty', true);
    });
    const case13 = JSON.parse(this.notes.find((n) => n.startsWith('case13='))!.slice('case13='.length)) as { message: string; total: number };
    const empty13 = await this.emptyText();
    await this.checkShot('用例#13-① 出现「查询完成，共 0 条」', async () => ({
      expect: '查询完成，共 0 条',
      real: case13.message,
      pass: case13.message === '查询完成，共 0 条'
    }));
    await this.checkShot('用例#13-② 表格显示空态「暂无数据」', async () => ({
      expect: '暂无数据',
      real: empty13,
      pass: empty13 === '暂无数据'
    }));
    await this.checkShot('用例#13-③ 分页总数显示 Total 0', async () => ({
      expect: 'Total 0',
      real: await this.totalText(),
      pass: case13.total === 0
    }));
  }
}

await new Tc02Filter().execute();
