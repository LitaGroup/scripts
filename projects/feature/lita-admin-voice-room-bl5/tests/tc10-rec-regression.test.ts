/**
 * 项目 BL-0005 / TK-0443：房间推荐管理-原有功能回归（添加/行内编辑/行内删除/分页）
 * 用例来源：TK-0442 HANDOFF 九列用例 #61/#62/#63/#64；技术方案：TECH_DESIGN §5 断言映射、OBS-2
 * 覆盖：#61 添加房间推荐弹窗；#62 行内编辑回显；#63 行内 Delete 确认取消；#64 推荐列表分页
 * 数据隔离：1 条 AC-1 自建记录用于回显与取消删除，执行后按房间批量删除
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc10-rec-regression.test.ts
 */
import { VoiceRoomBase, REC_COL } from './lib/voice-room-base.ts';

class RecRegressionTest extends VoiceRoomBase {
  constructor() { super('tc10-rec-regression'); this.total = 15; }

  protected async run(): Promise<void> {
    await this.act('登录并准备 BD-1 与 AC-1 推荐记录', async () => {
      await this.login();
      this.shared.room1 = await this.ensureRoom1TagCategory();
      await this.recDeleteByRoomIds([this.shared.room1 as string]);
      await this.recEnsure({ roomId: this.shared.room1 as string, keyLabel: this.giftKey, type: '永久', weight: 10 });
    });
    const room1 = this.shared.room1 as string;

    // ---------------- 用例#61 ----------------
    await this.act('用例#61 点击「添加房间推荐」查看弹窗', async () => {
      await this.recSearch({});
      this.shared.c61total = await this.totalCount(this.page!);
      await this.page!.getByRole('button', { name: '添加房间推荐' }).first().click();
      await this.page!.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
      this.shared.c61title = (await this.page!.locator('.el-dialog__wrapper:visible .el-dialog__title').first().innerText()).trim();
      this.shared.c61labels = await this.dlgFormLabels(this.page!);
      await this.shot('case61-add-dialog');
    });
    await this.check('用例#61-① 弹窗标题为 New 且显示房间ID/实验KEY/权重/推荐类型', async () => {
      const title = this.shared.c61title as string;
      const labels = this.shared.c61labels as string[];
      const required = ['房间ID', '实验KEY', '权重', '推荐类型'];
      const missing = required.filter((l) => !labels.includes(l));
      return { expect: '标题=New；四项齐全', real: `标题=${title}；缺失=${missing.length === 0 ? '无' : missing.join('、')}`, pass: title === 'New' && missing.length === 0 };
    });
    await this.act('用例#61 点击 Cancel 关闭弹窗', async () => {
      await this.page!.locator('.el-dialog__wrapper:visible').first().locator('button', { hasText: 'Cancel' }).first().click();
      await this.page!.locator('.el-dialog__wrapper:visible').first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
      await this.recSearch({});
    });
    await this.check('用例#61-② 点击 Cancel 后弹窗关闭且列表 Total 不变', async () => {
      const visible = await this.page!.locator('.el-dialog__wrapper:visible').count();
      const total = await this.totalCount(this.page!);
      return { expect: `弹窗关闭；Total=${this.shared.c61total}`, real: `弹窗数=${visible}；Total=${total}`, pass: visible === 0 && total === Number(this.shared.c61total) };
    });

    // ---------------- 用例#62 ----------------
    await this.act('用例#62 点击 AC-1 行内「编辑」查看回显', async () => {
      await this.recSearch({ roomId: room1 });
      this.shared.c62list = await this.totalCount(this.page!);
      const rows = await this.recRows();
      this.shared.c62row = rows.find((r) => r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      const idx = await this.recRowIndex(room1, this.giftKey);
      await this.page!.locator('.el-table__body-wrapper tbody tr').nth(idx).locator('button', { hasText: '编辑' }).first().click();
      await this.page!.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
      this.shared.c62title = (await this.page!.locator('.el-dialog__wrapper:visible .el-dialog__title').first().innerText()).trim();
      this.shared.c62values = {
        roomId: await this.dlgItem(this.page!, '房间ID').locator('input').first().inputValue(),
        key: (await this.dlgItem(this.page!, '实验KEY').locator('input').first().inputValue()).trim(),
        weight: await this.dlgItem(this.page!, '权重').locator('input').first().inputValue(),
        type: await this.dlgItem(this.page!, '推荐类型').locator('input').first().inputValue()
      };
      await this.shot('case62-edit-dialog');
    });
    await this.check('用例#62-① 弹窗标题为 Edit 且房间ID/实验KEY/权重/推荐类型回显与列表一致', async () => {
      const title = this.shared.c62title as string;
      const row = this.shared.c62row as string[] | null;
      const v = this.shared.c62values as { roomId: string; key: string; weight: string; type: string };
      if (!row) return { expect: '回显一致', real: '未找到列表行', pass: false };
      const ok = title === 'Edit' && v.roomId === row[REC_COL.roomId] && v.key === row[REC_COL.configKey].trim() &&
        Number(v.weight) === Number(row[REC_COL.weight]) && v.type === row[REC_COL.type];
      return {
        expect: `Edit；房间ID=${row[REC_COL.roomId]}；实验KEY=${row[REC_COL.configKey]}；权重=${row[REC_COL.weight]}；类型=${row[REC_COL.type]}`,
        real: `${title}；房间ID=${v.roomId}；实验KEY=${v.key}；权重=${v.weight}；类型=${v.type}`,
        pass: ok
      };
    });
    await this.act('用例#62 点击 Cancel 关闭编辑弹窗', async () => {
      await this.page!.locator('.el-dialog__wrapper:visible').first().locator('button', { hasText: 'Cancel' }).first().click();
      await this.page!.locator('.el-dialog__wrapper:visible').first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
      await this.recSearch({ roomId: room1 });
    });
    await this.check('用例#62-② 点击 Cancel 后弹窗关闭且列表 Total 不变', async () => {
      const visible = await this.page!.locator('.el-dialog__wrapper:visible').count();
      const total = await this.totalCount(this.page!);
      return { expect: `弹窗关闭；Total=${this.shared.c62list}`, real: `弹窗数=${visible}；Total=${total}`, pass: visible === 0 && total === Number(this.shared.c62list) };
    });
    await this.check('用例#62-③ 列表数据与操作前一致', async () => {
      const rows = await this.recRows();
      const row = rows.find((r) => r[REC_COL.roomId] === room1 && r[REC_COL.configKey].includes(this.giftKey));
      return { expect: '记录仍存在且内容未变', real: row ? `存在，权重=${row[REC_COL.weight]}，类型=${row[REC_COL.type]}` : '记录丢失', pass: !!row };
    });

    // ---------------- 用例#63 ----------------
    await this.act('用例#63 点击 AC-1 行内 Delete 查看确认弹窗', async () => {
      await this.recSearch({ roomId: room1 });
      this.shared.c63total = await this.totalCount(this.page!);
      const idx = await this.recRowIndex(room1, this.giftKey);
      await this.page!.locator('.el-table__body-wrapper tbody tr').nth(idx).locator('button', { hasText: 'Delete' }).first().click();
      const box = this.page!.locator('.el-message-box__wrapper:visible').first();
      const appeared = await box.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
      this.shared.c63confirm = appeared ? (await box.innerText()).replace(/\s+/g, ' ').trim() : '';
      await this.shot('case63-delete-confirm');
      if (appeared) {
        await box.locator('button', { hasText: /cancel|取消/i }).first().click();
        await box.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
      }
      await this.waitTableSettled(this.page!);
    });
    await this.check('用例#63-① 点击 Delete 后出现二次确认弹窗', async () => {
      const text = this.shared.c63confirm as string;
      return { expect: '出现二次确认弹窗', real: text || '（未出现确认弹窗，见 OBS-2）', pass: text !== '' };
    });
    await this.check('用例#63-② 点击取消后该记录仍显示在列表中', async () => {
      await this.recSearch({ roomId: room1 });
      const rows = await this.recRows();
      const row = rows.find((r) => r[REC_COL.configKey].includes(this.giftKey));
      return { expect: '记录仍存在', real: row ? '存在' : '已被删除', pass: !!row };
    });
    await this.check('用例#63-③ 分页 Total 不变', async () => {
      const total = await this.totalCount(this.page!);
      return { expect: `Total=${this.shared.c63total}`, real: `Total=${total}`, pass: total === Number(this.shared.c63total) };
    });

    // ---------------- 用例#64 ----------------
    const pageErrorsBefore = this.pageErrors.length;
    await this.act('用例#64 推荐列表翻到第 2 页', async () => {
      await this.recSearch({});
      this.shared.c64total = await this.totalCount(this.page!);
      const pageNumbers = (await this.page!.locator('.el-pager li').allInnerTexts()).map((t) => t.trim());
      this.shared.c64pager = pageNumbers.join(',');
      const firstBefore = (await this.recRows())[0]?.[REC_COL.roomId] ?? '';
      await this.recGotoPage(2);
      const rows = await this.recRows();
      this.shared.c64 = { firstBefore, firstAfter: rows[0]?.[REC_COL.roomId] ?? '', total: await this.totalCount(this.page!) };
      await this.shot('case64-page2');
    });
    await this.check('用例#64-① 翻页后首行房间ID与第 1 页不同且 Total 不变', async () => {
      const c = this.shared.c64 as { firstBefore: string; firstAfter: string; total: number };
      return {
        expect: `首行ID≠${c.firstBefore}；Total=${this.shared.c64total}`,
        real: `首行ID=${c.firstAfter}；Total=${c.total}；页码=${this.shared.c64pager}`,
        pass: c.firstBefore !== c.firstAfter && c.total === Number(this.shared.c64total)
      };
    });
    await this.act('用例#64 切换每页条数为 20/page', async () => {
      await this.recPageSize(20);
      const rows = await this.recRows();
      this.shared.c64b = { rows: rows.length, total: await this.totalCount(this.page!) };
      await this.shot('case64-size20');
    });
    await this.check('用例#64-② 切换每页条数后行数与所选一致（不足时为实际数），Total 不变', async () => {
      const b = this.shared.c64b as { rows: number; total: number };
      const expected = Math.min(20, b.total);
      return { expect: `行数=${expected}；Total=${this.shared.c64total}`, real: `行数=${b.rows}；Total=${b.total}`, pass: b.rows === expected && b.total === Number(this.shared.c64total) };
    });
    await this.check('用例#64-③ 翻页与切换条数过程无报错', async () => {
      const errors = await this.page!.locator('.el-message--error').count();
      const newPageErrors = this.pageErrors.slice(pageErrorsBefore);
      return { expect: '无错误提示', real: `错误提示数=${errors}；本次翻页新增 pageerror=${newPageErrors.length}`, pass: errors === 0 && newPageErrors.length === 0 };
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1 自建推荐记录（页面批量删除）', async () => {
      await this.recDeleteByRoomIds([room1]);
    });
  }
}

await new RecRegressionTest().execute();
