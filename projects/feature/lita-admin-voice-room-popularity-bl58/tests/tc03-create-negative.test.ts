/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - 单条新增校验与取消（用例 #18~#22）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（PM-2 r6~r9、§5 断言映射）
 * 覆盖：#18 重复配置；#19 房间不存在；#20 用户不存在；#21 侧边推荐空提交；#22 新增弹窗取消
 * 数据隔离：本文件仅 #18 使用存量只读记录（印尼/侧边/10100001/23），#19~#22 不产生数据；若产品异常落库则清理本任务自建行。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc03-create-negative.test.ts [--case=18]
 */
import { join } from 'node:path';
import type { Page } from 'playwright';
import { AdminBase } from './lib/admin-base.ts';

class CreateNegativeTest extends AdminBase {
  constructor() {
    super('tc03-create-negative', { 18: 2, 19: 2, 20: 2, 21: 3, 22: 2 });
  }

  private stateFile = '';

  protected async run(): Promise<void> {
    await this.act('登录 Admin 测试环境并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-ai.json');
      await this.ensureLoginState(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, this.stateFile);
    });
    try {
      if (this.wants(18)) await this.case18();
      if (this.wants(19)) await this.case19();
      if (this.wants(20)) await this.case20();
      if (this.wants(21)) await this.case21();
      if (this.wants(22)) await this.case22();
    } finally {
      await this.closeCasePage();
    }
  }

  private async openFilledDialog(page: Page, locale: string, roomId: string, userId: string, weight: string): Promise<ReturnType<Page['locator']>> {
    const dlg = await this.openCreateDialog(page);
    await this.dialogSelect(page, dlg, '请选择区域', locale);
    await this.dialogSelect(page, dlg, '请选择推荐类型', '侧边推荐');
    if (roomId) await this.dialogFill(dlg, 'ROOM ID', roomId);
    if (userId) await this.dialogFill(dlg, 'USER ID', userId);
    if (weight) await this.dialogFill(dlg, '权重', weight);
    return dlg;
  }

  private async submitExpectMessage(page: Page, dlg: ReturnType<Page['locator']>, keyword: string, timeout = 10000): Promise<string> {
    await dlg.locator('button:has-text("确 定")').first().click();
    await this.waitToastContains(keyword, timeout, page);
    return (await this.drainToasts(page)).join(' | ');
  }

  // ---------------- #18 ----------------

  private async case18(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const dlg = await this.openFilledDialog(page, '印尼语区', '10100001', '23', '1');
    let messages = '';
    await this.act('用例#18 提交已存在的组合 印尼/侧边/10100001/23', async () => {
      messages = await this.submitExpectMessage(page, dlg, '已经存在');
    });
    await this.check('用例#18-① 出现提示「已经存在」', async () => {
      await this.shot('case18-duplicate-toast');
      return { expect: '提示包含「已经存在」', real: messages || '(无提示)', pass: messages.includes('已经存在') };
    });
    await this.act('用例#18 取消弹窗并按组合筛选确认无重复', async () => {
      await this.closeDialog(dlg, '取 消');
      await this.selectOption(page, page, '推荐类型', '侧边推荐');
      await this.fillPlaceholder(page, 'ROOM ID', '10100001');
      await this.fillPlaceholder(page, 'USER ID', '23');
      await this.search(page);
    });
    await this.check('用例#18-② 该组合在列表仍只有 1 行（无重复新增）', async () => {
      const rows = await this.readRows(page);
      const exact = rows.filter((r) => r[2] === '10100001' && r[4] === '23' && r[6] === '侧边推荐');
      await this.shotEl('.el-table__body-wrapper', 'case18-no-duplicate');
      return { expect: '该组合恰 1 行', real: `匹配 ${exact.length} 行（筛选结果共 ${rows.length} 行）`, pass: exact.length === 1 };
    });
    await this.closeCasePage();
  }

  // ---------------- #19 ----------------

  private async case19(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const dlg = await this.openFilledDialog(page, '印尼语区', '999999999', '', '1');
    let messages = '';
    await this.act('用例#19 提交不存在的 ROOM ID=999999999', async () => {
      messages = await this.submitExpectMessage(page, dlg, '不存在');
    });
    await this.check('用例#19-① 出现提示「ROOM ID 999999999 不存在」', async () => {
      await this.shot('case19-room-not-exist-toast');
      return { expect: '提示包含「ROOM ID 999999999 不存在」', real: messages || '(无提示)', pass: messages.includes('ROOM ID 999999999 不存在') };
    });
    await this.act('用例#19 取消弹窗并筛选 ROOM ID=999999999 确认未落库', async () => {
      await this.closeDialog(dlg, '取 消');
      await this.fillPlaceholder(page, 'ROOM ID', '999999999');
      await this.search(page);
    });
    await this.check('用例#19-② 列表 ROOM ID=999999999 查询无结果（未落库）', async () => {
      const count = await this.rowCount(page);
      await this.shot('case19-no-row');
      return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
    });
    await this.cleanupByRoom(page, '999999999').catch(() => undefined);
    await this.closeCasePage();
  }

  // ---------------- #20 ----------------

  private async case20(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const dlg = await this.openFilledDialog(page, '印尼语区', '', '999999999', '1');
    let messages = '';
    await this.act('用例#20 提交不存在的 USER ID=999999999', async () => {
      messages = await this.submitExpectMessage(page, dlg, '不存在');
    });
    await this.check('用例#20-① 出现提示「USER ID 999999999 不存在」', async () => {
      await this.shot('case20-user-not-exist-toast');
      return { expect: '提示包含「USER ID 999999999 不存在」', real: messages || '(无提示)', pass: messages.includes('USER ID 999999999 不存在') };
    });
    await this.act('用例#20 取消弹窗并筛选 USER ID=999999999 确认未落库', async () => {
      await this.closeDialog(dlg, '取 消');
      await this.fillPlaceholder(page, 'USER ID', '999999999');
      await this.search(page);
    });
    await this.check('用例#20-② 列表 USER ID=999999999 查询无结果', async () => {
      const count = await this.rowCount(page);
      await this.shot('case20-no-row');
      return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
    });
    await this.cleanupByUser(page, '999999999').catch(() => undefined);
    await this.closeCasePage();
  }

  // ---------------- #21 ----------------

  private async case21(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const totalBefore = await this.totalCount(page);
    const dlg = await this.openCreateDialog(page);
    let messages = '';
    await this.act('用例#21 侧边推荐 ROOM ID 与 USER ID 均留空提交', async () => {
      await this.dialogSelect(page, dlg, '请选择区域', '印尼语区');
      await this.dialogSelect(page, dlg, '请选择推荐类型', '侧边推荐');
      await this.dialogFill(dlg, '权重', '1');
      await dlg.locator('button:has-text("确 定")').first().click();
      await this.waitToastContains('至少', 10000, page);
      messages = (await this.drainToasts(page)).join(' | ');
    });
    await this.check('用例#21-① 出现错误提示，内容包含「侧边推荐」与「至少」', async () => {
      await this.shot('case21-empty-submit-toast');
      return { expect: '提示包含「侧边推荐」与「至少」', real: messages || '(无提示)', pass: messages.includes('侧边推荐') && messages.includes('至少') };
    });
    await this.check('用例#21-② 新增弹窗保持打开（未提交成功）', async () => {
      const visible = await dlg.isVisible().catch(() => false);
      return { expect: '弹窗可见', real: visible ? '仍打开' : '已关闭', pass: visible };
    });
    await this.act('用例#21 取消弹窗并刷新列表', async () => {
      await this.closeDialog(dlg, '取 消');
      await this.search(page);
    });
    await this.check('用例#21-③ 列表分页总数仍为 N（无新增）', async () => {
      const totalAfter = await this.totalCount(page);
      return { expect: `Total=${totalBefore}`, real: `Total=${totalAfter}`, pass: totalAfter === totalBefore };
    });
    await this.closeCasePage();
  }

  // ---------------- #22 ----------------

  private async case22(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const totalBefore = await this.totalCount(page);
    const dlg = await this.openCreateDialog(page);
    await this.act('用例#22 填写菲律宾/侧边/用户 23/权重 66 后点击取消', async () => {
      await this.dialogSelect(page, dlg, '请选择区域', '菲律宾区');
      await this.dialogSelect(page, dlg, '请选择推荐类型', '侧边推荐');
      await this.dialogFill(dlg, 'USER ID', '23');
      await this.dialogFill(dlg, '权重', '66');
      await this.closeDialog(dlg, '取 消');
    });
    await this.check('用例#22-① 新增弹窗关闭', async () => {
      const visible = await dlg.isVisible().catch(() => false);
      await this.shot('case22-dialog-closed');
      return { expect: '弹窗不可见', real: visible ? '仍可见' : '已关闭', pass: !visible };
    });
    await this.check('用例#22-② 列表无新增记录，分页总数仍为 N', async () => {
      await this.search(page);
      const totalAfter = await this.totalCount(page);
      return { expect: `Total=${totalBefore}`, real: `Total=${totalAfter}`, pass: totalAfter === totalBefore };
    });
    await this.closeCasePage();
  }

  // ---------------- 清理辅助 ----------------

  private async cleanupByRoom(page: Page, roomId: string): Promise<void> {
    if (!this.page) return;
    await this.resetFilters(page);
    await this.fillPlaceholder(page, 'ROOM ID', roomId);
    await this.search(page);
    const rows = await this.readRows(page);
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
  }

  private async cleanupByUser(page: Page, userId: string): Promise<void> {
    if (!this.page) return;
    await this.resetFilters(page);
    await this.fillPlaceholder(page, 'USER ID', userId);
    await this.search(page);
    const rows = await this.readRows(page);
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
  }
}

const test = new CreateNegativeTest();
await test.execute();
