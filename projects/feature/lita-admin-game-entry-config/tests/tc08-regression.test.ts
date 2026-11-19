/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」现状基线回归（用例#40）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#40 操作列与行内删除按钮存在性（需求文档外功能，仅保护现状）
 * 数据隔离：仅只读观察，无造数。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc08-regression.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';

class RegressionCase extends GameEntryBase {
  constructor() { super('tc08-regression'); this.total = 3; }

  protected async run(): Promise<void> {
    await this.act('用例#40 步骤1~3 进入页面并查看列表最后一列列头与每行操作列按钮', async () => {
      await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
      await this.gotoPageDirect(this.page!);
      await this.shot('case40-list', true);
    });
    await this.check('用例#40-① 列表最后一列为「操作」列', async () => {
      const h = await this.headers();
      const last = h[h.length - 1] ?? '';
      return { expect: '操作', real: last, pass: last === '操作' };
    });
    await this.check('用例#40-② 每行操作列均显示「删除」按钮', async () => {
      const rows = await this.rowCount();
      const buttons = await this.page!.locator('.el-table__body-wrapper tbody tr td:nth-child(9) button', { hasText: '删除' }).count();
      return { expect: `每行 1 个删除按钮（${rows} 行）`, real: `${buttons} 个删除按钮 / ${rows} 行`, pass: rows === 20 && buttons === rows };
    });
  }
}

await new RegressionCase().execute();
