/**
 * 项目3721 / >=401用户数据报表：输入校验与拦截
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#10 下限>上限；#11 下限非法值（5 数据行）；#12 上限非法值（5 数据行）
 * 数据隔离：只读存量；不造数、无清理；证据仅本机 evidence 目录（脱敏）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc03-validation.test.ts
 */
import { AdminBase } from './lib/admin-base.ts';

class Tc03Validation extends AdminBase {
  constructor() {
    super('tc03-validation');
    this.total = 22;
  }

  private async baselineAndInvalid(field: 'VIP等级下限' | 'VIP等级上限', value: string): Promise<{
    message: string; newRequests: number; rowsBefore: string[][]; rowsAfter: string[][]; totalBefore: number; totalAfter: number;
  }> {
    await this.clickReset();
    const rowsBefore = await this.tableRows();
    const totalBefore = await this.totalValue();
    await this.fillField(field, value);
    if (field === 'VIP等级下限') await this.fillField('VIP等级上限', '');
    else await this.fillField('VIP等级下限', '');
    const result = await this.clickQuery();
    const rowsAfter = await this.tableRows();
    const totalAfter = await this.totalValue();
    return { message: result.message, newRequests: result.newRequests, rowsBefore, rowsAfter, totalBefore, totalAfter };
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 登录并进入 >=401用户数据 报表', async () => {
      await this.login();
      await this.navReport();
    });

    // ===== 用例#10 =====
    await this.act('用例#10 建立默认查询基线后输入下限 500、上限 400 并查询', async () => {
      await this.clickReset();
      this.notes.push(`case10-base=${JSON.stringify({ rows: await this.tableRows(), total: await this.totalValue() })}`);
      await this.fillField('VIP等级下限', '500');
      await this.fillField('VIP等级上限', '400');
      this.notes.push(`case10-invalid=${JSON.stringify(await this.clickQuery())}`);
      this.notes.push(`case10-after=${JSON.stringify({ rows: await this.tableRows(), total: await this.totalValue() })}`);
      await this.shot('case10-range-invalid', true);
    });
    const base10 = JSON.parse(this.notes.find((n) => n.startsWith('case10-base='))!.slice('case10-base='.length)) as { rows: string[][]; total: number };
    const invalid10 = JSON.parse(this.notes.find((n) => n.startsWith('case10-invalid='))!.slice('case10-invalid='.length)) as { message: string; newRequests: number };
    const after10 = JSON.parse(this.notes.find((n) => n.startsWith('case10-after='))!.slice('case10-after='.length)) as { rows: string[][]; total: number };
    await this.checkShot('用例#10-① 页面提示「起始等级不能大于结束等级」', async () => ({
      expect: '起始等级不能大于结束等级',
      real: invalid10.message,
      pass: invalid10.message === '起始等级不能大于结束等级'
    }));
    await this.checkShot('用例#10-② 查询被拦截：表格数据行与 Total 保持基线不变且未发起新查询', async () => ({
      expect: '行数据与 Total 与基线一致、无新查询请求',
      real: `新查询=${invalid10.newRequests}；Total ${base10.total}→${after10.total}；行数 ${base10.rows.length}→${after10.rows.length}；数据一致=${JSON.stringify(base10.rows) === JSON.stringify(after10.rows)}`,
      pass: invalid10.newRequests === 0 && base10.total === after10.total && JSON.stringify(base10.rows) === JSON.stringify(after10.rows)
    }));

    // ===== 用例#11（下限非法值 5 数据行）=====
    const invalidValues = ['abc', '-5', '401.5', '0', '712'];
    for (let i = 0; i < invalidValues.length; i++) {
      const value = invalidValues[i];
      let result: Awaited<ReturnType<Tc03Validation['baselineAndInvalid']>>;
      await this.act(`用例#11[数据行${i + 1}] 下限输入 ${value} 并查询`, async () => {
        result = await this.baselineAndInvalid('VIP等级下限', value);
        this.notes.push(`case11-${i + 1}=${JSON.stringify(result)}`);
        await this.shot(`case11-row${i + 1}-${value}`, true);
      });
      const r = JSON.parse(this.notes.find((n) => n.startsWith(`case11-${i + 1}=`))!.slice(`case11-${i + 1}=`.length)) as typeof result;
      await this.checkShot(`用例#11-①[数据行${i + 1}] 输入 ${value} 提示「VIP等级下限需为 1-711 的整数」`, async () => ({
        expect: 'VIP等级下限需为 1-711 的整数',
        real: r.message,
        pass: r.message === 'VIP等级下限需为 1-711 的整数'
      }));
      await this.checkShot(`用例#11-②[数据行${i + 1}] 输入 ${value} 查询被拦截且表格/Total 保持基线`, async () => ({
        expect: '无新查询、行数据与 Total 不变',
        real: `新查询=${r.newRequests}；Total ${r.totalBefore}→${r.totalAfter}；数据一致=${JSON.stringify(r.rowsBefore) === JSON.stringify(r.rowsAfter)}`,
        pass: r.newRequests === 0 && r.totalBefore === r.totalAfter && JSON.stringify(r.rowsBefore) === JSON.stringify(r.rowsAfter)
      }));
    }

    // ===== 用例#12（上限非法值 5 数据行）=====
    for (let i = 0; i < invalidValues.length; i++) {
      const value = invalidValues[i];
      let result: Awaited<ReturnType<Tc03Validation['baselineAndInvalid']>>;
      await this.act(`用例#12[数据行${i + 1}] 上限输入 ${value} 并查询`, async () => {
        result = await this.baselineAndInvalid('VIP等级上限', value);
        this.notes.push(`case12-${i + 1}=${JSON.stringify(result)}`);
        await this.shot(`case12-row${i + 1}-${value}`, true);
      });
      const r = JSON.parse(this.notes.find((n) => n.startsWith(`case12-${i + 1}=`))!.slice(`case12-${i + 1}=`.length)) as typeof result;
      await this.checkShot(`用例#12-①[数据行${i + 1}] 输入 ${value} 提示「VIP等级上限需为 1-711 的整数」`, async () => ({
        expect: 'VIP等级上限需为 1-711 的整数',
        real: r.message,
        pass: r.message === 'VIP等级上限需为 1-711 的整数'
      }));
      await this.checkShot(`用例#12-②[数据行${i + 1}] 输入 ${value} 查询被拦截且表格/Total 保持基线`, async () => ({
        expect: '无新查询、行数据与 Total 不变',
        real: `新查询=${r.newRequests}；Total ${r.totalBefore}→${r.totalAfter}；数据一致=${JSON.stringify(r.rowsBefore) === JSON.stringify(r.rowsAfter)}`,
        pass: r.newRequests === 0 && r.totalBefore === r.totalAfter && JSON.stringify(r.rowsBefore) === JSON.stringify(r.rowsAfter)
      }));
    }
  }
}

await new Tc03Validation().execute();
