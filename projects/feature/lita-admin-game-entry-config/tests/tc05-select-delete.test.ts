/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」勾选删除（用例#25~#30）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#25 勾选联动；#26 单行删除；#27 删除取消；#28 多行批量删除；#29 表头全选（回归）；#30 双会话过期删除
 * 数据隔离：仅页面级 add/delete；自建 UID 用后页面删除；存量 1003 条只读，不执行批量/条件删除。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc05-select-delete.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';
import type { Page } from 'playwright';

const U1 = '19440456';
const U2 = '13365989';
const U3 = '8268067';

class SelectDeleteCase extends GameEntryBase {
  constructor() { super('tc05-select-delete'); this.total = 37; }

  private async enterPage(): Promise<Page> {
    const page = await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    await this.gotoPageDirect(page);
    return page;
  }

  private async ensureAbsent(uid: string, pg: Page | null = null): Promise<void> {
    await this.queryByUid(uid, pg);
    if ((await this.rowCount(pg)) > 0) await this.deleteFiltered(true, pg);
  }

  private async addUids(text: string, pg: Page | null = null): Promise<void> {
    await this.openAddDialog(pg);
    await this.submitAdd(text, pg);
    await this.closeAddDialog(pg);
  }

  private async cleanupUids(uids: string[], pg: Page | null = null): Promise<void> {
    for (const uid of uids) {
      await this.queryByUid(uid, pg);
      if ((await this.rowCount(pg)) > 0) await this.deleteFiltered(true, pg);
    }
  }

  protected async run(): Promise<void> {
    // ===== 用例#25 勾选联动（回归） =====
    await this.act('用例#25 步骤1~2 进入页面并在无勾选时查看删除选中按钮状态', async () => {
      await this.enterPage();
      await this.shot('case25-initial', true);
    });
    await this.check('用例#25-① 无勾选时「删除选中」按钮为禁用状态', async () => {
      const s = await this.buttonState('删除选中');
      const checked = await this.checkedRowCount();
      return { expect: '按钮禁用且勾选行数=0', real: `disabled=${s.disabled}; cls=${s.cls}; checked=${checked}`, pass: s.disabled && checked === 0 };
    });
    await this.act('用例#25 步骤3 勾选列表第一行复选框', async () => {
      await this.rowCheckbox(0);
    });
    await this.check('用例#25-② 勾选 1 行后「删除选中」按钮变为可用状态', async () => {
      const s = await this.buttonState('删除选中');
      const checked = await this.checkedRowCount();
      return { expect: '按钮可用且勾选行数=1', real: `disabled=${s.disabled}; cls=${s.cls}; checked=${checked}`, pass: !s.disabled && checked === 1 };
    });
    await this.act('用例#25 步骤5 再次点击该行复选框取消勾选', async () => {
      await this.rowCheckbox(0);
    });
    await this.check('用例#25-③ 取消勾选后「删除选中」按钮恢复禁用状态', async () => {
      const s = await this.buttonState('删除选中');
      const checked = await this.checkedRowCount();
      return { expect: '按钮禁用且勾选行数=0', real: `disabled=${s.disabled}; cls=${s.cls}; checked=${checked}`, pass: s.disabled && checked === 0 };
    });

    // ===== 用例#26 勾选单行确认删除 =====
    await this.act(`用例#26 前置 确认 ${U1} 不在白名单并页面添加`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUids(U1);
    });
    await this.act(`用例#26 步骤2~4 查询 ${U1} 并勾选该行`, async () => {
      await this.queryByUid(U1);
      await this.rowCheckbox(0);
    });
    await this.act('用例#26 步骤5~6 点击删除选中并在确认弹窗确认', async () => {
      const text = await this.deleteSelected(true);
      this.lastConfirmText = text;
      await this.shot('case26-after-delete', true);
    });
    await this.check('用例#26-① 点击删除选中后弹出二次确认弹窗', async () => {
      return { expect: '弹出二次确认弹窗', real: `弹窗文案「${this.lastConfirmText}」`, pass: !!this.lastConfirmText };
    });
    await this.check('用例#26-② 确认后该行从列表移除，列表 No Data 且 Total 0', async () => {
      const [n, e, t] = [await this.rowCount(), await this.emptyText(), await this.totalText()];
      return { expect: '0 行 / No Data / Total 0', real: `${n} 行 / ${e} / ${t}`, pass: n === 0 && e === 'No Data' && t === 'Total 0' };
    });
    await this.check(`用例#26-③ 再次查询 ${U1} 显示 No Data（软删除后不再显示）`, async () => {
      await this.queryByUid(U1);
      const [n, e] = [await this.rowCount(), await this.emptyText()];
      return { expect: '0 行 / No Data', real: `${n} 行 / ${e}`, pass: n === 0 && e === 'No Data' };
    });

    // ===== 用例#27 确认弹窗点击取消 =====
    await this.act(`用例#27 前置 确认 ${U1} 不在白名单并页面添加`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUids(U1);
    });
    await this.act(`用例#27 步骤2~5 查询 ${U1}、勾选并点击删除选中`, async () => {
      await this.queryByUid(U1);
      await this.rowCheckbox(0);
      const text = await this.deleteSelected(false);
      this.lastConfirmText = text;
    });
    await this.check('用例#27-① 弹出二次确认弹窗', async () => {
      return { expect: '弹出二次确认弹窗', real: `弹窗文案「${this.lastConfirmText}」`, pass: !!this.lastConfirmText };
    });
    await this.check('用例#27-② 点击取消后弹窗关闭', async () => {
      const visible = await this.messageBox().isVisible().catch(() => false);
      return { expect: '弹窗已关闭', real: `visible=${visible}`, pass: !visible };
    });
    await this.check('用例#27-③ 列表仍显示该行且行数与 Total 不变', async () => {
      const rows = await this.rows();
      const t = await this.totalText();
      return { expect: `1 行 / Total 1`, real: `${rows.length} 行 / ${t} / UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === U1 && t === 'Total 1' };
    });
    await this.act(`用例#27 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUids([U1]); });

    // ===== 用例#28 勾选多行批量删除 =====
    await this.act(`用例#28 前置 确认 ${U2}/${U3} 不在白名单并页面添加两枚`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U2);
      await this.ensureAbsent(U3);
      await this.addUids(`${U2}\n${U3}`);
    });
    await this.act('用例#28 步骤2~3 按当天日期范围查询', async () => {
      await this.clickReset();
      await this.pickDateRange(this.today, this.today);
      await this.clickQuery();
      await this.shot('case28-before-delete', true);
    });
    await this.act(`用例#28 步骤4~6 勾选 ${U2}/${U3} 两行并确认删除`, async () => {
      const rows = await this.rows();
      this.beforeDeleteUids = rows.map((r) => r[1]);
      for (const uid of [U2, U3]) {
        const idx = rows.findIndex((r) => r[1] === uid);
        if (idx < 0) throw new Error(`查询结果未找到待勾选 UID ${uid}`);
        await this.rowCheckbox(idx);
      }
      await this.deleteSelected(true);
      await this.shot('case28-after-delete', true);
    });
    await this.act('用例#28 步骤7 再次按当天日期范围查询', async () => {
      await this.clickQuery();
      await this.shot('case28-requery', true);
    });
    await this.check(`用例#28-① 确认后列表中 ${U2}、${U3} 两行消失`, async () => {
      const uids = (await this.rows()).map((r) => r[1]);
      return { expect: `不含 ${U2}/${U3}`, real: uids.join(','), pass: !uids.includes(U2) && !uids.includes(U3) };
    });
    await this.check('用例#28-② 未勾选的其他行仍显示（行数=删除前-2）', async () => {
      const uids = (await this.rows()).map((r) => r[1]);
      const remain = this.beforeDeleteUids.filter((u) => u !== U2 && u !== U3);
      const ok = uids.length === this.beforeDeleteUids.length - 2 && remain.every((u) => uids.includes(u));
      return { expect: `删除前 ${this.beforeDeleteUids.length} 行 → 保留 ${remain.length} 行`, real: `${uids.length} 行: ${uids.join(',')}`, pass: ok };
    });
    await this.check(`用例#28-③ 分别查询两枚 UID 均显示 No Data`, async () => {
      await this.queryByUid(U2);
      const a = { n: await this.rowCount(), e: await this.emptyText() };
      await this.queryByUid(U3);
      const b = { n: await this.rowCount(), e: await this.emptyText() };
      return { expect: '两枚均 No Data', real: `${U2}=${a.n}行/${a.e}; ${U3}=${b.n}行/${b.e}`, pass: a.n === 0 && a.e === 'No Data' && b.n === 0 && b.e === 'No Data' };
    });

    // ===== 用例#29 表头全选（回归） =====
    await this.act('用例#29 步骤1 进入第 1 页（20 行）', async () => {
      await this.enterPage();
    });
    await this.act('用例#29 步骤2~3 点击表头勾选框并查看行勾选与按钮状态', async () => {
      await this.headerCheckbox();
      await this.shot('case29-select-all', true);
    });
    await this.check('用例#29-① 全选后当前页 20 行均勾选且「删除选中」可用', async () => {
      const [checked, s] = [await this.checkedRowCount(), await this.buttonState('删除选中')];
      return { expect: 'checked=20 且按钮可用', real: `checked=${checked}; disabled=${s.disabled}`, pass: checked === 20 && !s.disabled };
    });
    await this.act('用例#29 步骤4 再次点击表头勾选框取消全选', async () => {
      await this.headerCheckbox();
      await this.shot('case29-unselect-all', true);
    });
    await this.check('用例#29-② 再次点击后当前页全部取消勾选且「删除选中」恢复禁用', async () => {
      const [checked, s] = [await this.checkedRowCount(), await this.buttonState('删除选中')];
      return { expect: 'checked=0 且按钮禁用', real: `checked=${checked}; disabled=${s.disabled}`, pass: checked === 0 && s.disabled };
    });

    // ===== 用例#30 双会话过期删除 =====
    await this.act(`用例#30 前置 会话A 添加 ${U1}，会话B 登录并查询到该行（过期状态就绪）`, async () => {
      const a = await this.enterPage();
      await this.ensureAbsent(U1, a);
      await this.addUids(U1, a);
      const b = await this.addExtraSessionFromState();
      await this.gotoPageDirect(b);
      await this.queryByUid(U1, b);
      if ((await this.rowCount(b)) !== 1) throw new Error('会话B未查询到待删除行，前置不成立');
      this.sessionB = b;
    });
    await this.act(`用例#30 前置 会话A 勾选并确认删除 ${U1}（构造会话B列表过期）`, async () => {
      await this.queryByUid(U1);
      await this.rowCheckbox(0);
      await this.deleteSelected(true);
    });
    await this.act('用例#30 步骤1~3 会话B 勾选过期行并提交删除', async () => {
      const b = this.sessionB!;
      // 会话B未刷新，行仍显示（过期状态）
      if ((await this.rowCount(b)) !== 1) throw new Error('会话B列表已刷新，无法构造过期删除场景');
      await this.rowCheckbox(0, b);
      await this.deleteSelected(true, b);
      await this.shot('case30-sessionB-result', true, b);
    });
    await this.act(`用例#30 步骤4~5 会话B 查询 ${U1}`, async () => {
      await this.queryByUid(U1, this.sessionB!);
    });
    await this.check('用例#30-① 会话B 提交后页面显示删除失败结果或提示（语义「白名单里不存在」）', async () => {
      const fb = this.lastDeleteFeedback;
      const body = await this.bodyText(this.sessionB!);
      const hit = /白名单里不存在/.test(fb) || /白名单里不存在/.test(body);
      return { expect: '失败提示含「白名单里不存在」', real: `反馈「${fb}」; bodyHas=${hit}`, pass: hit };
    });
    await this.check('用例#30-② 页面无系统错误（无报错弹窗/白屏）', async () => {
      const body = await this.bodyText(this.sessionB!);
      const hasPage = await this.sessionB!.getByRole('button', { name: '查询' }).count() > 0;
      const err = /系统异常|页面不存在|Internal Server Error|500/.test(body);
      return { expect: '页面可交互且无系统错误提示', real: `查询按钮=${hasPage}; systemError=${err}`, pass: hasPage && !err };
    });
    await this.check(`用例#30-③ 会话B 查询 ${U1} 显示 No Data`, async () => {
      const [n, e] = [await this.rowCount(this.sessionB!), await this.emptyText(this.sessionB!)];
      return { expect: '0 行 / No Data', real: `${n} 行 / ${e}`, pass: n === 0 && e === 'No Data' };
    });
  }

  private lastConfirmText = '';
  private beforeDeleteUids: string[] = [];
  private sessionB: Page | null = null;
}

await new SelectDeleteCase().execute();
