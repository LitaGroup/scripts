/**
 * 项目 BL-0005 / TK-0443：房间推荐管理-批量添加
 * 用例来源：TK-0442 HANDOFF 九列用例 #49~#57；技术方案：TECH_DESIGN §5 断言映射
 * 覆盖：#49 永久多房间；#50 短时起止时间；#51 分隔符数据变体；#52 短时缺时间拦截；#53 房间ID不存在整体失败；
 *       #54 已存在覆盖更新；#55 实验KEY未选择；#56 权重非数字；#57 房间ID为空
 * 数据隔离：写入 QA 自建房间真实实验KEY，执行后按房间批量删除
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc08-rec-batch-add.test.ts
 */
import { VoiceRoomBase, REC_COL } from './lib/voice-room-base.ts';
import { fmtTime } from './lib/admin-base.ts';
import { type Page } from 'playwright';

function parseTime(s: string): number {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime() : 0;
}

interface BatchResult {
  confirmText: string;
  message: string;
  formErrors: string;
  dialogClosed: boolean;
}

class RecBatchAddTest extends VoiceRoomBase {
  constructor() { super('tc08-rec-batch-add'); this.total = 33; }

  private async submitBatch(page: Page): Promise<BatchResult> {
    const dlg = page.locator('.el-dialog__wrapper:visible').first();
    await dlg.locator('button', { hasText: /^确\s*定$/ }).first().click();
    // 等待三选一的可观测反馈：二次确认弹窗 / 页面消息 / 表单校验错误 / 弹窗关闭
    await page.waitForFunction(() => {
      const box = [...document.querySelectorAll('.el-message-box__wrapper')].some((b) => (b as HTMLElement).style.display !== 'none');
      const msgs = [...document.querySelectorAll('.el-message')].some((m) => (m as HTMLElement).getBoundingClientRect().height > 0);
      const errs = [...document.querySelectorAll('.el-form-item__error')].some((e) => (e as HTMLElement).getBoundingClientRect().height > 0);
      const dlgOpen = [...document.querySelectorAll('.el-dialog__wrapper')].some((d) => (d as HTMLElement).style.display !== 'none');
      return box || msgs || errs || !dlgOpen;
    }, undefined, { timeout: 20000 });
    let confirmText = '';
    const box = page.locator('.el-message-box__wrapper:visible').first();
    if (await box.count()) {
      confirmText = await this.confirmMessageBox(page, true);
      // 确认后等待接口反馈（消息出现或弹窗关闭），再读取提示
      await page.waitForFunction(() => {
        const msgs = [...document.querySelectorAll('.el-message')].some((m) => (m as HTMLElement).getBoundingClientRect().height > 0);
        const dlgOpen = [...document.querySelectorAll('.el-dialog__wrapper')].some((d) => (d as HTMLElement).style.display !== 'none');
        return msgs || !dlgOpen;
      }, undefined, { timeout: 20000 }).catch(() => undefined);
    }
    const message = await this.messageText(page);
    // 表单校验错误需在关闭弹窗之前读取
    const formErrors = (await page.locator('.el-form-item__error').allInnerTexts()).map((s) => s.trim()).filter(Boolean).join('；');
    const dialogClosed = (await page.locator('.el-dialog__wrapper:visible').count()) === 0;
    if (!dialogClosed) {
      await page.locator('.el-dialog__wrapper:visible').first().locator('button', { hasText: /^取\s*消$/ }).first().click().catch(() => undefined);
    }
    return { confirmText, message, formErrors, dialogClosed };
  }

  private async fillBatch(roomIds: string, opts: { key?: string; type?: '永久' | '短时'; weight?: string; start?: Date; end?: Date }): Promise<void> {
    const page = this.page!;
    if (opts.key) await this.dlgPick(page, '实验KEY', opts.key);
    if (opts.type) await this.dlgPick(page, '推荐类型', opts.type);
    if (opts.type === '短时' && opts.start && opts.end) {
      await this.setDateTime(page, '短时推荐开始时间', fmtTime(opts.start));
      await this.setDateTime(page, '短时推荐结束时间', fmtTime(opts.end));
    }
    if (opts.weight !== undefined) await this.dlgFill(page, '权重', opts.weight);
    if (roomIds !== '') await this.dlgFill(page, '房间ID', roomIds);
  }

  private async dialogHasItem(label: string): Promise<boolean> {
    return this.dlgItemVisible(this.page!, label);
  }

  private async totalNow(): Promise<number> {
    await this.recSearch({});
    return this.totalCount(this.page!);
  }

  protected async run(): Promise<void> {
    const now = new Date();
    await this.act('登录并准备 BD-1/BD-2，清理既有自建推荐记录', async () => {
      await this.login();
      this.shared.room1 = await this.ensureRoom1TagCategory();
      this.shared.room2 = await this.ensureRoom({
        name: this.roomName2, platform: 'Lita', roomCategory: null, tagName: null, tagColor: '', tagBg: '', openState: 'open'
      });
      await this.recDeleteByRoomIds([this.shared.room1 as string, this.shared.room2 as string]);
    });
    const room1 = this.shared.room1 as string;
    const room2 = this.shared.room2 as string;

    // ---------------- 用例#49 ----------------
    await this.act('用例#49 批量添加：已送礼用户 + 永久 + 权重10 + 两个房间ID', async () => {
      await this.recSearch({});
      this.shared.c49before = await this.totalCount(this.page!);
      await this.openRecommend();
      await this.openBatchAdd();
      await this.fillBatch(`${room1},${room2}`, { key: this.giftKey, type: '永久', weight: '10' });
      this.shared.c49submit = await this.submitBatch(this.page!);
      await this.shot('case49-added');
    });
    await this.check('用例#49-① 点击确定后添加成功且无错误提示', async () => {
      const r = this.shared.c49submit as BatchResult;
      return { expect: '添加成功；无错误提示', real: `提示=${r.message || '无'}；表单错误=${r.formErrors || '无'}`, pass: /成功/.test(r.message) && r.formErrors === '' };
    });
    await this.act('用例#49 按房间ID筛选查看两条记录', async () => {
      await this.recSearch({ roomId: room1 });
      this.shared.c49row1 = (await this.recRows()).find((r) => r[REC_COL.roomId] === room1 && r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      await this.recSearch({ roomId: room2 });
      this.shared.c49row2 = (await this.recRows()).find((r) => r[REC_COL.roomId] === room2 && r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      await this.shot('case49-rows');
    });
    await this.check('用例#49-② 房间1记录：用户分类/推荐类型/生效状态/权重正确', async () => {
      const row = this.shared.c49row1 as string[] | null;
      if (!row) return { expect: '记录存在且字段正确', real: '未找到记录', pass: false };
      const ok = row[REC_COL.configKey] === '已送礼用户' && row[REC_COL.type] === '永久' && row[REC_COL.effective] === '生效中' && Number(row[REC_COL.weight]) === 10;
      return {
        expect: '已送礼用户 / 永久 / 生效中 / 权重=10',
        real: `${row[REC_COL.configKey]} / ${row[REC_COL.type]} / ${row[REC_COL.effective]} / 权重=${row[REC_COL.weight]}`,
        pass: ok
      };
    });
    await this.check('用例#49-③ 该记录操作人为 qa-ai、操作时间非「-」', async () => {
      const row = this.shared.c49row1 as string[] | null;
      return {
        expect: '操作人=qa-ai；操作时间非「-」',
        real: `操作人=${row?.[REC_COL.operateName] ?? ''}；操作时间=${row?.[REC_COL.operateTime] ?? ''}`,
        pass: row?.[REC_COL.operateName] === 'qa-ai' && !!row?.[REC_COL.operateTime] && row[REC_COL.operateTime] !== '-'
      };
    });
    await this.check('用例#49-④ 房间2同样存在一条新推荐记录', async () => {
      const row = this.shared.c49row2 as string[] | null;
      return { expect: '存在该房间推荐记录', real: row ? `存在，类型=${row[REC_COL.type]}` : '不存在', pass: !!row };
    });

    // ---------------- 用例#50 ----------------
    await this.act('用例#50 批量添加：短时 + 配置起止时间', async () => {
      await this.openRecommend();
      await this.openBatchAdd();
      await this.dlgPick(this.page!, '实验KEY', this.giftKey);
      await this.dlgPick(this.page!, '推荐类型', '短时');
      this.shared.c50hasStart = await this.dialogHasItem('短时推荐开始时间');
      this.shared.c50hasEnd = await this.dialogHasItem('短时推荐结束时间');
      await this.shot('case50-temp-fields');
      await this.setDateTime(this.page!, '短时推荐开始时间', fmtTime(new Date()));
      await this.setDateTime(this.page!, '短时推荐结束时间', fmtTime(new Date(Date.now() + 86400000)));
      await this.dlgFill(this.page!, '权重', '5');
      await this.dlgFill(this.page!, '房间ID', room1);
      this.shared.c50submit = await this.submitBatch(this.page!);
      await this.recSearch({ roomId: room1 });
      this.shared.c50row = (await this.recRows()).find((r) => r[REC_COL.roomId] === room1 && r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      await this.shot('case50-row');
    });
    await this.check('用例#50-① 选择「短时」后出现短时推荐开始/结束时间两个配置项', async () => {
      return {
        expect: '两个时间配置项均出现',
        real: `开始时间项=${this.shared.c50hasStart}；结束时间项=${this.shared.c50hasEnd}`,
        pass: this.shared.c50hasStart === true && this.shared.c50hasEnd === true
      };
    });
    await this.check('用例#50-② 点击确定后添加成功', async () => {
      const r = this.shared.c50submit as BatchResult;
      return { expect: '添加成功', real: `提示=${r.message || '无'}；表单错误=${r.formErrors || '无'}`, pass: /成功/.test(r.message) };
    });
    await this.check('用例#50-③ 记录推荐类型=短时、推荐时间=起~止、生效状态=生效中', async () => {
      const row = this.shared.c50row as string[] | null;
      if (!row) return { expect: '记录字段正确', real: '未找到记录', pass: false };
      const timeOk = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ~ \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row[REC_COL.time]);
      return {
        expect: '短时 / 时间起~止 / 生效中',
        real: `${row[REC_COL.type]} / ${row[REC_COL.time]} / ${row[REC_COL.effective]}`,
        pass: row[REC_COL.type] === '短时' && timeOk && row[REC_COL.effective] === '生效中'
      };
    });

    // ---------------- 用例#51 ----------------
    const sepRows = [
      { row: 1, label: '英文逗号', value: `${room1},${room2}` },
      { row: 2, label: '空格', value: `${room1} ${room2}` },
      { row: 3, label: '换行', value: `${room1}\n${room2}` }
    ];
    for (const item of sepRows) {
      await this.act(`用例#51[数据行${item.row}] 未送礼用户+永久，分隔符=${item.label}`, async () => {
        await this.openRecommend();
        await this.openBatchAdd();
        await this.fillBatch(item.value, { key: this.nogiftKey, type: '永久' });
        this.shared[`c51submit${item.row}`] = await this.submitBatch(this.page!);
        await this.recSearch({ roomId: room1 });
        this.shared[`c51r1_${item.row}`] = (await this.recRows()).some((r) => r[REC_COL.roomId] === room1 && r[REC_COL.configKey].includes(this.nogiftKey));
        await this.recSearch({ roomId: room2 });
        this.shared[`c51r2_${item.row}`] = (await this.recRows()).some((r) => r[REC_COL.roomId] === room2 && r[REC_COL.configKey].includes(this.nogiftKey));
        await this.shot(`case51-row${item.row}`);
      });
      await this.check(`用例#51-①[数据行${item.row}] 点击确定后添加成功无错误提示`, async () => {
        const r = this.shared[`c51submit${item.row}`] as BatchResult;
        return { expect: '添加成功', real: `提示=${r.message || '无'}；表单错误=${r.formErrors || '无'}`, pass: /成功/.test(r.message) };
      });
      await this.check(`用例#51-②[数据行${item.row}] 两个房间ID 均能查到「未送礼用户」记录`, async () => {
        return {
          expect: '两房间均有未送礼用户记录',
          real: `房间1=${this.shared[`c51r1_${item.row}`]}；房间2=${this.shared[`c51r2_${item.row}`]}`,
          pass: this.shared[`c51r1_${item.row}`] === true && this.shared[`c51r2_${item.row}`] === true
        };
      });
    }

    // ---------------- 用例#52 ----------------
    await this.act('用例#52 批量添加：短时不配置起止时间', async () => {
      await this.recSearch({});
      this.shared.c52before = await this.totalCount(this.page!);
      await this.openRecommend();
      await this.openBatchAdd();
      await this.fillBatch(room1, { key: this.giftKey, type: '短时' });
      this.shared.c52submit = await this.submitBatch(this.page!);
      this.shared.c52after = await this.totalNow();
      await this.shot('case52-temp-no-time');
    });
    await this.check('用例#52-① 页面提示包含「推荐开始时间和结束时间」', async () => {
      const r = this.shared.c52submit as BatchResult;
      const text = `${r.message}；${r.formErrors}`;
      return { expect: '提示包含「推荐开始时间和结束时间」', real: text || '（无提示）', pass: text.includes('推荐开始时间和结束时间') };
    });
    await this.check('用例#52-② 列表 Total 与操作前一致（未新增）', async () => {
      return { expect: `Total=${this.shared.c52before}`, real: `Total=${this.shared.c52after}`, pass: Number(this.shared.c52after) === Number(this.shared.c52before) };
    });

    // ---------------- 用例#53 ----------------
    await this.act('用例#53 批量添加：房间ID 含不存在的 999999999999', async () => {
      await this.recSearch({});
      this.shared.c53before = await this.totalCount(this.page!);
      await this.openRecommend();
      await this.openBatchAdd();
      await this.fillBatch(`${room1},999999999999`, { key: this.giftKey, type: '永久' });
      this.shared.c53submit = await this.submitBatch(this.page!);
      this.shared.c53after = await this.totalNow();
      await this.shot('case53-invalid-id');
    });
    await this.check('用例#53-① 添加失败且提示包含不存在的房间ID 999999999999', async () => {
      const r = this.shared.c53submit as BatchResult;
      const text = `${r.message}；${r.formErrors}`;
      return { expect: '提示包含 999999999999', real: text || '（无提示）', pass: text.includes('999999999999') };
    });
    await this.check('用例#53-② 列表 Total 与操作前一致（整体失败，存在的房间也未新增）', async () => {
      return { expect: `Total=${this.shared.c53before}`, real: `Total=${this.shared.c53after}`, pass: Number(this.shared.c53after) === Number(this.shared.c53before) };
    });

    // ---------------- 用例#54 ----------------
    await this.act('用例#54 批量添加：已存在记录覆盖更新', async () => {
      await this.recEnsure({ roomId: room1, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.recSearch({ roomId: room1 });
      const before = (await this.recRows()).find((r) => r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      this.shared.c54beforeTime = before?.[REC_COL.operateTime] ?? '';
      await this.openRecommend();
      await this.openBatchAdd();
      await this.fillBatch(room1, { key: this.giftKey, type: '短时', weight: '99', start: new Date(), end: new Date(Date.now() + 172800000) });
      this.shared.c54submit = await this.submitBatch(this.page!);
      await this.recSearch({ roomId: room1 });
      const rows = await this.recRows();
      this.shared.c54rows = rows.filter((r) => r[REC_COL.configKey].includes(this.giftKey));
      this.shared.c54row = this.shared.c54rows[0] ?? null;
      await this.shot('case54-overwrite');
    });
    await this.check('用例#54-① 添加成功且无「已存在」报错', async () => {
      const r = this.shared.c54submit as BatchResult;
      return { expect: '添加成功', real: `提示=${r.message || '无'}；表单错误=${r.formErrors || '无'}`, pass: /成功/.test(r.message) };
    });
    await this.check('用例#54-② 已送礼用户下该房间记录仍只有 1 行（覆盖而非新增）', async () => {
      const rows = this.shared.c54rows as string[][];
      return { expect: '记录数=1', real: `记录数=${rows.length}`, pass: rows.length === 1 };
    });
    await this.check('用例#54-③ 该记录推荐类型=短时、权重=99、推荐时间为本次起止', async () => {
      const row = this.shared.c54row as string[] | null;
      if (!row) return { expect: '字段正确', real: '未找到记录', pass: false };
      return {
        expect: '短时 / 权重=99 / 推荐时间为起~止',
        real: `${row[REC_COL.type]} / 权重=${row[REC_COL.weight]} / ${row[REC_COL.time]}`,
        pass: row[REC_COL.type] === '短时' && Number(row[REC_COL.weight]) === 99 && row[REC_COL.time].includes(' ~ ')
      };
    });
    await this.check('用例#54-④ 操作时间更新为本次操作时间（晚于操作前）', async () => {
      const row = this.shared.c54row as string[] | null;
      const before = parseTime(this.shared.c54beforeTime as string);
      const after = parseTime(row?.[REC_COL.operateTime] ?? '');
      return {
        expect: `操作时间晚于 ${this.shared.c54beforeTime}`,
        real: `${row?.[REC_COL.operateTime] ?? '（空）'}`,
        pass: after > 0 && before > 0 && after > before
      };
    });

    // ---------------- 用例#55 ----------------
    await this.act('用例#55 批量添加：不选择实验KEY', async () => {
      await this.recSearch({});
      this.shared.c55before = await this.totalCount(this.page!);
      await this.openRecommend();
      await this.openBatchAdd();
      await this.fillBatch(room1, { type: '永久' });
      this.shared.c55submit = await this.submitBatch(this.page!);
      this.shared.c55after = await this.totalNow();
      await this.shot('case55-no-key');
    });
    await this.check('用例#55-① 页面出现必填校验提示或错误提示', async () => {
      const r = this.shared.c55submit as BatchResult;
      const text = `${r.message}；${r.formErrors}`;
      return { expect: '存在校验/错误提示', real: text || '（无提示）', pass: text.trim() !== '' && text !== '；' };
    });
    await this.check('用例#55-② 列表 Total 与操作前一致（未新增）', async () => {
      return { expect: `Total=${this.shared.c55before}`, real: `Total=${this.shared.c55after}`, pass: Number(this.shared.c55after) === Number(this.shared.c55before) };
    });

    // ---------------- 用例#56 ----------------
    await this.act('用例#56 批量添加：权重输入 abc', async () => {
      await this.recSearch({});
      this.shared.c56before = await this.totalCount(this.page!);
      await this.openRecommend();
      await this.openBatchAdd();
      await this.fillBatch(room1, { key: this.giftKey, type: '永久', weight: 'abc' });
      this.shared.c56submit = await this.submitBatch(this.page!);
      this.shared.c56after = await this.totalNow();
      await this.shot('case56-weight-abc');
    });
    await this.check('用例#56-① 页面出现权重格式校验/错误提示', async () => {
      const r = this.shared.c56submit as BatchResult;
      const text = `${r.message}；${r.formErrors}`;
      return { expect: '存在校验/错误提示', real: text || '（无提示）', pass: text.trim() !== '' && text !== '；' };
    });
    await this.check('用例#56-② 列表 Total 与操作前一致（未新增）', async () => {
      return { expect: `Total=${this.shared.c56before}`, real: `Total=${this.shared.c56after}`, pass: Number(this.shared.c56after) === Number(this.shared.c56before) };
    });

    // ---------------- 用例#57 ----------------
    await this.act('用例#57 批量添加：房间ID 留空', async () => {
      await this.recSearch({});
      this.shared.c57before = await this.totalCount(this.page!);
      await this.openRecommend();
      await this.openBatchAdd();
      await this.fillBatch('', { key: this.giftKey, type: '永久' });
      this.shared.c57submit = await this.submitBatch(this.page!);
      this.shared.c57after = await this.totalNow();
      await this.shot('case57-no-roomid');
    });
    await this.check('用例#57-① 页面出现必填校验提示或错误提示', async () => {
      const r = this.shared.c57submit as BatchResult;
      const text = `${r.message}；${r.formErrors}`;
      return { expect: '存在必填校验/错误提示', real: text || '（无提示）', pass: text.trim() !== '' && text !== '；' };
    });
    await this.check('用例#57-② 列表 Total 与操作前一致（未新增）', async () => {
      return { expect: `Total=${this.shared.c57before}`, real: `Total=${this.shared.c57after}`, pass: Number(this.shared.c57after) === Number(this.shared.c57before) };
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1/BD-2 自建推荐记录（页面批量删除）', async () => {
      await this.recDeleteByRoomIds([room1, room2]);
    });
  }
}

await new RecBatchAddTest().execute();
