/**
 * 项目3721 / >=401用户数据报表：【回归】现状基线
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#32 未查询初始态；#33 查询完成提示与 Total 一致；#34 条件计数随筛选项变化
 * 数据隔离：只读存量；不造数、无清理；证据仅本机 evidence 目录（脱敏）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc07-regression.test.ts
 */
import { AdminBase } from './lib/admin-base.ts';

class Tc07Regression extends AdminBase {
  constructor() {
    super('tc07-regression');
    this.total = 7;
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 登录并进入 >=401用户数据 报表（不点击查询）', async () => {
      await this.login();
      await this.navReport();
      await this.shot('case32-initial', true);
    });

    // ===== 用例#32 =====
    const empty32 = await this.emptyText();
    const total32 = await this.totalValue();
    const headers32 = await this.tableHeaders();
    await this.checkShot('用例#32-① 表格区显示「请输入查询条件后查看数据」', async () => ({
      expect: '请输入查询条件后查看数据',
      real: empty32,
      pass: empty32 === '请输入查询条件后查看数据'
    }));
    await this.checkShot('用例#32-② 分页总数显示「Total 0」', async () => ({
      expect: 'Total 0',
      real: await this.totalText(),
      pass: total32 === 0
    }));
    await this.checkShot('用例#32-③ 表头未渲染', async () => ({
      expect: '表头 0 列',
      real: `表头 ${headers32.length} 列`,
      pass: headers32.length === 0
    }));

    // ===== 用例#33 =====
    await this.act('用例#33 保持默认条件点击查询', async () => {
      this.notes.push(`case33=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case33-query-done', true);
    });
    const case33 = JSON.parse(this.notes.find((n) => n.startsWith('case33='))!.slice('case33='.length)) as { message: string; total: number };
    const msgCount33 = case33.message.match(/查询完成，共\s*([\d,]+)\s*条/)?.[1];
    await this.checkShot('用例#33-① 页面顶部出现「查询完成，共 N 条」', async () => ({
      expect: '含「查询完成，共 N 条」',
      real: case33.message,
      pass: case33.message.startsWith('查询完成，共') && msgCount33 !== undefined
    }));
    await this.checkShot('用例#33-② 提示中的 N 与分页 Total 一致', async () => ({
      expect: `${Number((msgCount33 ?? '0').replace(/,/g, ''))}`,
      real: `${case33.total}`,
      pass: Number((msgCount33 ?? '0').replace(/,/g, '')) === case33.total
    }));

    // ===== 用例#34 =====
    const tipBefore = await this.conditionTip();
    await this.act('用例#34 设置 VIP 500-711 与大区印尼语区后读取条件计数', async () => {
      await this.fillField('VIP等级下限', '500');
      await this.fillField('VIP等级上限', '711');
      await this.pickOption('大区', '印尼语区');
      await this.shot('case34-conditions', true);
    });
    const tipAfter = await this.conditionTip();
    await this.checkShot('用例#34-① 初始显示「当前已设置查询条件：1 项」', async () => ({
      expect: '当前已设置查询条件：1 项',
      real: tipBefore,
      pass: /当前已设置查询条件[：:]\s*1\s*项/.test(tipBefore)
    }));
    await this.checkShot('用例#34-② 设置 VIP 范围与大区后显示「当前已设置查询条件：4 项」', async () => ({
      expect: '当前已设置查询条件：4 项',
      real: tipAfter,
      pass: /当前已设置查询条件[：:]\s*4\s*项/.test(tipAfter)
    }));
  }
}

await new Tc07Regression().execute();
