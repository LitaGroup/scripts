/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - 删除与操作人（用例 #32~#35）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（BD-3、§5 断言映射）
 * 覆盖：#32 单条删除（行消失/总数-1）；#33 未勾选批量删除按钮置灰；#34 多选批量删除；
 *       #35 页面新增配置操作人=当前登录账号 qa-ai
 * 数据隔离：每条用例自建独立记录并在用例内删除；#34 使用独立 2 条记录（泰国区），结束后按地区清理兜底。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc07-delete.test.ts [--case=32]
 */
import { join } from 'node:path';
import type { Page } from 'playwright';
import { AdminBase } from './lib/admin-base.ts';

class DeleteTest extends AdminBase {
  constructor() {
    super('tc07-delete', { 32: 2, 33: 1, 34: 2, 35: 2 });
  }

  private stateFile = '';

  protected async run(): Promise<void> {
    await this.act('登录 Admin 测试环境并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-ai.json');
      await this.ensureLoginState(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, this.stateFile);
    });
    try {
      if (this.wants(32)) await this.case32();
      if (this.wants(33)) await this.case33();
      if (this.wants(34)) await this.case34();
      if (this.wants(35)) await this.case35();
    } finally {
      await this.closeCasePage();
    }
  }

  private async batchButtonDisabled(page: Page): Promise<boolean> {
    return page.getByRole('button', { name: '批量删除' }).first().evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('is-disabled'));
  }

  private async filterLocaleUser(page: Page, locale: string, userId: string): Promise<void> {
    await this.resetFilters(page);
    await this.selectOption(page, page, '地区', locale);
    await this.fillPlaceholder(page, 'USER ID', userId);
    await this.search(page);
  }

  private async cleanupLocale(page: Page, locale: string): Promise<void> {
    await this.resetFilters(page);
    await this.selectOption(page, page, '地区', locale);
    await this.search(page);
    const rows = await this.readRows(page);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
    }
  }

  // ---------------- #32 ----------------

  private async case32(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    let totalWithRow = -1;
    let created = false;
    try {
      await this.act('用例#32 新增 菲律宾区/侧边推荐/仅用户 23/权重 99', async () => {
        await this.createRecommendation(page, { locale: '菲律宾区', type: '侧边推荐', userId: '23', weight: '99' });
        created = true;
      });
      await this.act('用例#32 记录含目标行时的默认分页总数 N', async () => {
        await this.resetFilters(page);
        totalWithRow = await this.totalCount(page);
        this.notes.push(`#32 含目标行默认 Total=${totalWithRow}`);
      });
      await this.act('用例#32 筛选 菲律宾区+USER ID=23 定位目标行', async () => {
        await this.filterLocaleUser(page, '菲律宾区', '23');
      });
      if (await this.rowCount(page) !== 1) throw new Error(`#32 就绪失败：筛选结果行数=${await this.rowCount(page)}，期望 1`);
      await this.act('用例#32 点击目标行删除并确认', async () => {
        await this.deleteRow(page, 0);
        await this.search(page);
      });
      await this.check('用例#32-① 目标行从列表消失', async () => {
        const count = await this.rowCount(page);
        await this.shot('case32-row-deleted');
        return { expect: '筛选结果行数=0', real: `行数=${count}`, pass: count === 0 };
      });
      await this.act('用例#32 重置筛选查看默认列表总数', async () => { await this.resetFilters(page); });
      await this.check('用例#32-② 分页总数减少 1（N-1）', async () => {
        const totalAfter = await this.totalCount(page);
        return { expect: `Total=${totalWithRow - 1}`, real: `Total=${totalAfter}（删除前 N=${totalWithRow}）`, pass: totalAfter === totalWithRow - 1 };
      });
    } finally {
      if (created) await this.cleanupLocale(page, '菲律宾区').catch(() => undefined);
      await this.closeCasePage();
    }
  }

  // ---------------- #33 ----------------

  private async case33(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#33 进入页面并确认未勾选任何记录', async () => {
      const checked = await page.locator('.el-table__body-wrapper tbody tr .el-checkbox.is-checked').count();
      if (checked !== 0) throw new Error(`#33 就绪失败：存在已勾选行 ${checked}`);
    });
    await this.check('用例#33-① 批量删除按钮为禁用状态（置灰不可点击）', async () => {
      const disabled = await this.batchButtonDisabled(page);
      await this.shot('case33-batch-disabled');
      return { expect: '批量删除按钮 disabled', real: disabled ? 'disabled' : 'enabled', pass: disabled };
    });
    await this.closeCasePage();
  }

  // ---------------- #34 ----------------

  private async case34(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    // 就绪确认：泰国区当前无记录；有则按用例降级越南区/阿拉伯语区
    let locale = '泰国区';
    await this.act('用例#34 就绪确认目标大区无存量记录', async () => {
      await this.resetFilters(page);
      await this.selectOption(page, page, '地区', '泰国区');
      await this.search(page);
      if (await this.rowCount(page) > 0) {
        locale = '越南区';
        await this.resetFilters(page);
        await this.selectOption(page, page, '地区', '越南区');
        await this.search(page);
        if (await this.rowCount(page) > 0) locale = '阿拉伯语区';
      }
      this.notes.push(`#34 使用大区：${locale}`);
      await this.resetFilters(page);
    });
    this.addCleanup(`#34 兜底清理 ${locale} 自建行`, async () => {
      if (!this.browser) return;
      await this.newCasePage(this.stateFile);
      await this.cleanupLocale(this.page!, locale);
      await this.closeCasePage();
    });
    let created = false;
    try {
      await this.act(`用例#34 新增 2 条 ${locale}/侧边推荐 自建记录（仅用户 23/401、仅房间 10100001/402）`, async () => {
        await this.createRecommendation(page, { locale, type: '侧边推荐', userId: '23', weight: '401' });
        await this.createRecommendation(page, { locale, type: '侧边推荐', roomId: '10100001', weight: '402' });
        created = true;
      });
      await this.act(`用例#34 筛选 ${locale} 显示 2 条自建记录`, async () => {
        await this.resetFilters(page);
        await this.selectOption(page, page, '地区', locale);
        await this.search(page);
      });
      const rowsBefore = await this.readRows(page);
      if (rowsBefore.length !== 2) throw new Error(`#34 就绪失败：${locale} 行数=${rowsBefore.length}，期望 2`);
      let disabledAfterSelect = true;
      await this.act('用例#34 依次勾选 2 条记录并查看批量删除按钮状态', async () => {
        for (let i = 0; i < 2; i++) await page.locator('.el-table__body-wrapper tbody tr').nth(i).locator('.el-checkbox').first().click();
        disabledAfterSelect = await this.batchButtonDisabled(page);
        await this.shot('case34-batch-enabled');
      });
      await this.check('用例#34-① 勾选后批量删除按钮由禁用变为可用', async () => {
        return { expect: '批量删除按钮 enabled', real: disabledAfterSelect ? '仍为 disabled' : 'enabled', pass: !disabledAfterSelect };
      });
      await this.act('用例#34 点击批量删除并确认', async () => {
        await page.getByRole('button', { name: '批量删除' }).first().click();
        const box = page.locator('.el-message-box__wrapper:visible').first();
        if (await box.count() > 0) {
          await box.locator('.el-message-box__btns button.el-button--primary').first().click();
          await box.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
        }
        await page.waitForFunction(() => {
          const texts = Array.from(document.querySelectorAll('.el-message')).map((el) => (el.textContent ?? '').trim());
          return texts.some((t) => t.includes('操作成功'));
        }, undefined, { timeout: 15000, polling: 100 }).catch(() => undefined);
        await this.search(page);
      });
      await this.check('用例#34-② 删除完成后 2 条记录均从列表消失', async () => {
        const count = await this.rowCount(page);
        await this.shot('case34-both-deleted');
        return { expect: `${locale} 行数=0`, real: `行数=${count}`, pass: count === 0 };
      });
    } finally {
      if (created) await this.cleanupLocale(page, locale).catch(() => undefined);
      await this.closeCasePage();
    }
  }

  // ---------------- #35 ----------------

  private async case35(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    let created = false;
    try {
      await this.act('用例#35 新增 菲律宾区/侧边推荐/仅用户 23/权重 77', async () => {
        await this.createRecommendation(page, { locale: '菲律宾区', type: '侧边推荐', userId: '23', weight: '77' });
        created = true;
      });
      await this.act('用例#35 筛选 菲律宾区+USER ID=23 查看操作人', async () => {
        await this.filterLocaleUser(page, '菲律宾区', '23');
      });
      const rows = await this.readRows(page);
      await this.check('用例#35-① 新行操作人列显示 qa-ai（当前登录管理员账号名）', async () => {
        const r = rows[0] ?? [];
        await this.shotEl('.el-table__body-wrapper', 'case35-operator');
        return { expect: '操作人=qa-ai', real: `行数=${rows.length}，操作人=${r[9] ?? '(无行)'}`, pass: rows.length === 1 && r[9] === 'qa-ai' };
      });
      await this.act('用例#35 删除新行清理', async () => {
        if (await this.rowCount(page) > 0) await this.deleteRow(page, 0);
        await this.search(page);
      });
      await this.check('用例#35-② 清理后该行消失', async () => {
        const count = await this.rowCount(page);
        await this.shot('case35-cleaned');
        return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
      });
    } finally {
      if (created) await this.cleanupLocale(page, '菲律宾区').catch(() => undefined);
      await this.closeCasePage();
    }
  }
}

const test = new DeleteTest();
await test.execute();
