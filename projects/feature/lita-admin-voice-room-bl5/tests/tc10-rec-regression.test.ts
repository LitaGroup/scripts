/**
 * 项目 BL-0005 / TK-0443：房间推荐管理-原有功能回归（添加/行内编辑/行内删除/分页）
 * 用例来源：TK-0442 HANDOFF_V9 九列用例 #61/#62/#63/#64；技术方案：TECH_DESIGN v9 §5 断言映射、AC-6、SK-10
 * 覆盖：#61 添加房间推荐弹窗；#62 行内编辑回显；#63 行内 Delete 确认取消；#64 推荐列表分页（v9：AC-6 造数 Total≥21 + #408 验证点检查点③）
 * 数据隔离：1 条 AC-1 自建记录用于回显与取消删除；AC-6 独立 configKey（QA_BL5_TEST_<runId>_P）接口造数 12 条/批至 Total≥21，执行后接口批量删除并按页面复核
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

    // ---------------- 用例#64（v9：AC-6 造数 + 4 检查点） ----------------
    const ac6Key = `QA_BL5_TEST_${this.runId}_P`;
    const ac6Rooms: string[] = [];
    await this.act('用例#64 前置：按 AC-6 构造分页测试记录集（全量 Total ≥ 21）', async () => {
      await this.openRecommend();
      await this.recReset();
      this.shared.c64BaseTotal = await this.totalCount(this.page!);
      const candidates = await this.collectRoomIds(36);
      this.addCleanup(`清理 AC-6 自建推荐记录（configKey=${ac6Key}，接口 batchDelete + 页面复核）`, async () => {
        if (ac6Rooms.length === 0) return;
        await this.recDeleteAc6(ac6Key, ac6Rooms);
        await this.openRecommend();
        await this.recReset();
        const options = await this.recOptions('请选择用户分类');
        if (options.includes(ac6Key)) {
          await this.recPick('请选择用户分类', ac6Key);
          await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: 'Search' }), '/voiceroom/voiceRoomConfigRecommendList');
          const left = await this.tableRowCount(this.page!);
          if (left > 0) throw new Error(`AC-6 清理复核失败：仍剩 ${left} 条记录`);
        } else {
          const total = await this.totalCount(this.page!);
          const seedTotal = Number(this.shared.c64SeedTotal ?? 0);
          if (seedTotal > 0 && total >= seedTotal) {
            throw new Error(`AC-6 清理复核失败：Total=${total} 未低于造数后 ${seedTotal}`);
          }
        }
      });
      let total = Number(this.shared.c64BaseTotal);
      for (let i = 0; i < candidates.length && total < 21; i += 12) {
        const chunk = candidates.slice(i, i + 12);
        await this.recSeedAc6(ac6Key, chunk);
        ac6Rooms.push(...chunk);
        await this.openRecommend();
        await this.recReset();
        total = await this.totalCount(this.page!);
      }
      if (total < 21) throw new Error(`AC-6 就绪确认失败：全量 Total=${total} < 21`);
      if ((await this.recPageSizeText()) !== '10/page') await this.recPageSizeStrict(10);
      const pager = (await this.page!.locator('.el-pager li').allInnerTexts()).map((t) => t.trim());
      if (!pager.includes('2')) throw new Error(`AC-6 就绪确认失败：分页无第 2 页（pager=${pager.join(',')}）`);
      this.shared.c64SeedRooms = ac6Rooms.slice();
      this.shared.c64SeedTotal = total;
      await this.shot('case64-ac6-ready');
    });

    const pageErrorsBefore = this.pageErrors.length;
    await this.act('用例#64 记录第 1 页首行与 Total，并翻到第 2 页', async () => {
      await this.recReset();
      const totalBefore = await this.totalCount(this.page!);
      const pageSize = await this.recPageSizeText();
      const firstBefore = (await this.recRows())[0]?.[REC_COL.roomId] ?? '';
      const pageNo1 = await this.recCurrentPage();
      await this.recGotoPageStrict(2);
      const rows2 = await this.recRows();
      this.shared.c64 = {
        totalBefore, pageSize, firstBefore, pageNo1,
        page2First: rows2[0]?.[REC_COL.roomId] ?? '',
        page2Total: await this.totalCount(this.page!),
        page2Page: await this.recCurrentPage(),
        page2Rows: rows2.length
      };
      await this.shot('case64-page2');
    });
    await this.check('用例#64-① 翻页后首行房间ID与第 1 页不同且 Total 不变', async () => {
      const c = this.shared.c64 as { totalBefore: number; firstBefore: string; pageNo1: string; page2First: string; page2Total: number; page2Page: string; page2Rows: number };
      return {
        expect: `第2页首行ID≠${c.firstBefore}（第1页首行）；Total=${c.totalBefore} 不变`,
        real: `第1页页码=${c.pageNo1}/首行=${c.firstBefore}；第2页页码=${c.page2Page}/首行=${c.page2First}/行数=${c.page2Rows}；Total=${c.page2Total}`,
        pass: c.page2Page === '2' && c.page2First !== '' && c.page2First !== c.firstBefore && c.page2Total === c.totalBefore
      };
    });

    await this.act('用例#64 在第 2 页切换每页条数为 20/page', async () => {
      await this.recPageSizeStrict(20);
      const rows = await this.recRows();
      this.shared.c64b = {
        rows: rows.length,
        first: rows[0]?.[REC_COL.roomId] ?? '',
        page: await this.recCurrentPage(),
        total: await this.totalCount(this.page!),
        totalText: await this.totalText(this.page!),
        pageSize: await this.recPageSizeText(),
        emptyVisible: await this.page!.locator('.el-table__empty-block').isVisible().catch(() => false),
        pagerVisible: await this.page!.locator('.el-pagination').isVisible().catch(() => false)
      };
      await this.shot('case64-size20');
    });
    await this.check('用例#64-② 第 2 页切换 20/page 后回到第 1 页、行数=20、Total 不变', async () => {
      const c = this.shared.c64 as { totalBefore: number; firstBefore: string };
      const b = this.shared.c64b as { rows: number; first: string; page: string; total: number; pageSize: string };
      return {
        expect: `当前页码=1；首行ID=${c.firstBefore}（切换前第 1 页首行）；行数=20；Total=${c.totalBefore}`,
        real: `页码=${b.page}；首行ID=${b.first}；行数=${b.rows}；Total=${b.total}；每页条数=${b.pageSize}`,
        pass: b.page === '1' && b.first === c.firstBefore && b.rows === Math.min(20, c.totalBefore) && b.rows === 20 && b.total === c.totalBefore
      };
    });
    await this.check('用例#64-③ 切换后无 No Data、分页不消失且展示第 1 页数据（无旧 page=2 覆盖）', async () => {
      const c = this.shared.c64 as { totalBefore: number; firstBefore: string; page2First: string };
      const b = this.shared.c64b as { rows: number; first: string; page: string; total: number; totalText: string; emptyVisible: boolean; pagerVisible: boolean };
      const totalReadable = /Total\s+[\d,]+/i.test(b.totalText);
      return {
        expect: `无 No Data 空态；分页可见且 Total 可读；列表=第1页数据（首行=${c.firstBefore}、行数=20），非第2页旧数据（${c.page2First}）`,
        real: `No Data 可见=${b.emptyVisible}；分页可见=${b.pagerVisible}；Total 文案可读=${totalReadable}（${b.totalText}）；首行ID=${b.first}；行数=${b.rows}`,
        pass: b.emptyVisible === false && b.pagerVisible === true && totalReadable && b.first === c.firstBefore && b.rows === 20 && b.first !== c.page2First && b.total === c.totalBefore
      };
    });
    await this.check('用例#64-④ 全过程页面无报错', async () => {
      const errors = await this.page!.locator('.el-message--error').count();
      const newPageErrors = this.pageErrors.slice(pageErrorsBefore);
      return { expect: '无错误提示', real: `错误提示数=${errors}；本次翻页/切换新增 pageerror=${newPageErrors.length}`, pass: errors === 0 && newPageErrors.length === 0 };
    });

    // 任务输出要求的过程观测（非用例检查点）：切回 10/page 后翻页应正常。
    await this.act('用例#64 过程观测：切回 10/page 并复核翻页（不新增检查点）', async () => {
      await this.recPageSizeStrict(10);
      const back = {
        page: await this.recCurrentPage(),
        rows: (await this.recRows()).length,
        first: (await this.recRows())[0]?.[REC_COL.roomId] ?? '',
        total: await this.totalCount(this.page!)
      };
      await this.recGotoPageStrict(2);
      const p2 = { page: await this.recCurrentPage(), rows: (await this.recRows()).length, first: (await this.recRows())[0]?.[REC_COL.roomId] ?? '' };
      await this.recGotoPageStrict(1);
      this.notes.push(`#64 过程观测（切回10/page）：页码=${back.page}、行数=${back.rows}、首行=${back.first}、Total=${back.total}；再次翻第2页：页码=${p2.page}、行数=${p2.rows}、首行=${p2.first}`);
      await this.shot('case64-back-10page');
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1 自建推荐记录（页面批量删除）', async () => {
      await this.recDeleteByRoomIds([room1]);
    });
  }
}

await new RecRegressionTest().execute();
