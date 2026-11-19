/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」条件删除（用例#31~#36）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#31 无条件禁用；#32 UID 条件删除；#33 条件删除取消；#34 UID+时间组合删除；
 *       #35 时间条件 0 匹配按钮态；#36 时间条件非空取消（只取消，不实际删除）
 * 数据隔离：仅页面级 add/delete；自建 UID 用后页面删除；存量 1003 条只读；
 *           本文件不含实际条件删除存量数据（#41 单独按裁决执行）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc06-filter-delete.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';

const U1 = '19440456';
const STOCK_DATE = '2026-10-19';

class FilterDeleteCase extends GameEntryBase {
  constructor() { super('tc06-filter-delete'); this.total = 32; }

  private async enterPage(): Promise<void> {
    await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    await this.gotoPageDirect(this.page!);
  }

  private async ensureAbsent(uid: string): Promise<void> {
    await this.queryByUid(uid);
    if ((await this.rowCount()) > 0) await this.deleteFiltered(true);
  }

  private async addUid(uid: string): Promise<void> {
    await this.openAddDialog();
    await this.submitAdd(uid);
    await this.closeAddDialog();
  }

  private async cleanupUid(uid: string): Promise<void> {
    await this.queryByUid(uid);
    if ((await this.rowCount()) > 0) await this.deleteFiltered(true);
  }

  /** 条件删除二次确认弹窗：页面当前文案含删除范围与“只删除符合筛选条件”的语义。 */
  private confirmSemantics(text: string): boolean {
    return text.includes('删除确认') && text.includes('确定删除') && text.includes('只会删除符合该筛选条件的用户');
  }

  protected async run(): Promise<void> {
    // ===== 用例#31 无条件时按钮禁用 =====
    await this.act('用例#31 步骤1~3 进入页面（无筛选条件）并查看删除筛选结果按钮状态', async () => {
      await this.enterPage();
      await this.shot('case31-no-filter', true);
    });
    await this.check('用例#31-① 无筛选条件时「删除筛选结果」按钮为禁用状态', async () => {
      const [s, uid, dates] = [await this.buttonState('删除筛选结果'), await this.uidValue(), await this.dateValues()];
      return { expect: '按钮禁用且无筛选条件', real: `disabled=${s.disabled}; cls=${s.cls}; uid="${uid}"; dates=${dates.join('~')}`, pass: s.disabled && uid === '' && dates[0] === '' && dates[1] === '' };
    });

    // ===== 用例#32 UID 条件删除 =====
    await this.act(`用例#32 前置 确认 ${U1} 不在白名单并页面添加`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUid(U1);
    });
    await this.act(`用例#32 步骤2~3 查询 ${U1}`, async () => {
      await this.queryByUid(U1);
      await this.shot('case32-before-delete', true);
    });
    await this.act('用例#32 步骤4~5 点击删除筛选结果并确认', async () => {
      this.lastConfirmText = await this.deleteFiltered(true);
      await this.shot('case32-after-delete', true);
    });
    await this.check('用例#32-① 点击后弹出二次确认弹窗且提示删除当前筛选条件下全部用户', async () => {
      const caseExpected = '将删除当前筛选条件下全部有效白名单';
      return {
        expect: `二次确认弹窗且提示含「${caseExpected}」（实际页面文案见 real，按需求方“需求文档未提及保留现状”记录偏差 D-10）`,
        real: this.lastConfirmText,
        pass: this.confirmSemantics(this.lastConfirmText)
      };
    });
    await this.check('用例#32-② 确认后该行从列表移除（No Data、Total 0）', async () => {
      const [n, e, t] = [await this.rowCount(), await this.emptyText(), await this.totalText()];
      return { expect: '0 行 / No Data / Total 0', real: `${n} 行 / ${e} / ${t}`, pass: n === 0 && e === 'No Data' && t === 'Total 0' };
    });
    await this.check(`用例#32-③ 再次查询 ${U1} 显示 No Data`, async () => {
      await this.queryByUid(U1);
      const [n, e] = [await this.rowCount(), await this.emptyText()];
      return { expect: '0 行 / No Data', real: `${n} 行 / ${e}`, pass: n === 0 && e === 'No Data' };
    });

    // ===== 用例#33 条件删除取消 =====
    await this.act(`用例#33 前置 确认 ${U1} 不在白名单并页面添加`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUid(U1);
    });
    await this.act(`用例#33 步骤2~4 查询 ${U1} 并点击删除筛选结果`, async () => {
      await this.queryByUid(U1);
      this.lastConfirmText = await this.deleteFiltered(false);
    });
    await this.check('用例#33-① 弹出二次确认弹窗且提示删除范围', async () => {
      return { expect: '二次确认弹窗且提示含删除范围（用例原文「将删除当前筛选条件下全部有效白名单」，实际文案记录偏差 D-10）', real: this.lastConfirmText, pass: this.confirmSemantics(this.lastConfirmText) };
    });
    await this.check('用例#33-② 点击取消后弹窗关闭', async () => {
      const visible = await this.messageBox().isVisible().catch(() => false);
      return { expect: '弹窗已关闭', real: `visible=${visible}`, pass: !visible };
    });
    await this.check('用例#33-③ 列表仍显示该行且 Total 不变（未执行删除）', async () => {
      const rows = await this.rows();
      const t = await this.totalText();
      return { expect: '1 行 / Total 1', real: `${rows.length} 行 / ${t} / UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === U1 && t === 'Total 1' };
    });
    await this.act(`用例#33 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUid(U1); });

    // ===== 用例#34 UID+时间组合条件删除 =====
    await this.act(`用例#34 前置 确认 ${U1} 不在白名单并页面添加`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUid(U1);
    });
    await this.act(`用例#34 步骤2~4 输入 ${U1} 与当天日期组合查询`, async () => {
      await this.clickReset();
      await this.fillUid(U1);
      await this.pickDateRange(this.today, this.today);
      await this.clickQuery();
      await this.shot('case34-combo-before', true);
    });
    await this.act('用例#34 步骤5~6 点击删除筛选结果并确认', async () => {
      this.lastConfirmText = await this.deleteFiltered(true);
    });
    await this.act('用例#34 步骤7 保持组合条件再次查询', async () => {
      await this.clickQuery();
      await this.shot('case34-combo-after', true);
    });
    await this.check('用例#34-① 确认后再次组合查询显示 No Data', async () => {
      const [n, e] = [await this.rowCount(), await this.emptyText()];
      return { expect: '0 行 / No Data', real: `${n} 行 / ${e}`, pass: n === 0 && e === 'No Data' };
    });
    await this.act('用例#34 步骤7 清空 UID 并按当天日期范围查询', async () => {
      await this.fillUid('');
      await this.clickQuery();
      await this.shot('case34-date-only', true);
    });
    await this.check('用例#34-② 按当天日期重新查询，未在交集内的存量行仍显示', async () => {
      const uids = (await this.rows()).map((r) => r[1]);
      const ok = uids.length === 3 && ['22518445', '12811470', '5519'].every((u) => uids.includes(u)) && !uids.includes(U1);
      return { expect: '当天存量 3 行仍在，且不含被删自建 UID', real: `${uids.length} 行: ${uids.join(',')}`, pass: ok };
    });
    await this.check(`用例#34-③ 查询 ${U1} 显示 No Data`, async () => {
      await this.queryByUid(U1);
      const [n, e] = [await this.rowCount(), await this.emptyText()];
      return { expect: '0 行 / No Data', real: `${n} 行 / ${e}`, pass: n === 0 && e === 'No Data' };
    });

    // ===== 用例#35 时间条件 0 匹配按钮禁用 =====
    await this.act('用例#35 步骤1 进入游戏入口配置页面', async () => {
      await this.enterPage();
      await this.clickReset();
    });
    await this.act('用例#35 步骤2~4 选择未来日期 2030-01-01~02 并查询', async () => {
      await this.pickDateRange('2030-01-01', '2030-01-02');
      await this.clickQuery();
      await this.shot('case35-future-empty', true);
    });
    await this.check('用例#35-① 查询后列表 No Data 且 Total 0', async () => {
      const [n, e, t] = [await this.rowCount(), await this.emptyText(), await this.totalText()];
      return { expect: '0 行 / No Data / Total 0', real: `${n} 行 / ${e} / ${t}`, pass: n === 0 && e === 'No Data' && t === 'Total 0' };
    });
    await this.check('用例#35-② 查询结果为空时「删除筛选结果」按钮为禁用状态', async () => {
      const s = await this.buttonState('删除筛选结果');
      return { expect: '按钮禁用', real: `disabled=${s.disabled}; cls=${s.cls}`, pass: s.disabled };
    });

    // ===== 用例#36 时间条件非空：确认弹窗取消（存量零变更） =====
    await this.act('用例#36 步骤1 进入页面并重置筛选条件', async () => {
      await this.enterPage();
      await this.clickReset();
    });
    await this.act(`用例#36 步骤2~3 选择 ${STOCK_DATE} 为起止日期并查询`, async () => {
      await this.pickDateRange(STOCK_DATE, STOCK_DATE);
      await this.clickQuery();
      await this.shot('case36-stock-date', true);
    });
    await this.act('用例#36 步骤4~5 点击删除筛选结果并在弹窗点击取消', async () => {
      this.beforeRows = await this.rowCount();
      this.beforeTotal = await this.totalText();
      this.lastConfirmText = await this.deleteFiltered(false);
      await this.shot('case36-after-cancel', true);
    });
    await this.check('用例#36-① 查询后列表显示该日期范围数据（Total>0）', async () => {
      const t = await this.totalNumber();
      return { expect: 'Total > 0', real: `Total ${t}; 当前页 ${this.beforeRows} 行`, pass: t > 0 && this.beforeRows > 0 };
    });
    await this.check('用例#36-② 点击后弹出二次确认弹窗且提示删除范围', async () => {
      return { expect: '二次确认弹窗且提示含删除范围（用例原文「将删除当前筛选条件下全部有效白名单」，实际文案记录偏差 D-10）', real: this.lastConfirmText, pass: this.confirmSemantics(this.lastConfirmText) };
    });
    await this.check('用例#36-③ 点击取消后列表行数与 Total 无任何变化（存量零变更）', async () => {
      const [n, t] = [await this.rowCount(), await this.totalText()];
      return { expect: `${this.beforeRows} 行 / ${this.beforeTotal}`, real: `${n} 行 / ${t}`, pass: n === this.beforeRows && t === this.beforeTotal };
    });
  }

  private lastConfirmText = '';
  private beforeRows = 0;
  private beforeTotal = '';
}

await new FilterDeleteCase().execute();
