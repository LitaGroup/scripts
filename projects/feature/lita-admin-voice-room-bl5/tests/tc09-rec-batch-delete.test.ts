/**
 * 项目 BL-0005 / TK-0443：房间推荐管理-批量删除
 * 用例来源：TK-0442 HANDOFF 九列用例 #58/#59/#60；技术方案：TECH_DESIGN §5 断言映射
 * 覆盖：#58 未勾选按钮禁用；#59 勾选多条二次确认删除；#60 取消不删除
 * 数据隔离：3 条自建记录 + 1 条对照记录，均写入 QA 自建房间；执行后按房间批量删除
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc09-rec-batch-delete.test.ts
 */
import { VoiceRoomBase, REC_COL } from './lib/voice-room-base.ts';

class RecBatchDeleteTest extends VoiceRoomBase {
  constructor() { super('tc09-rec-batch-delete'); this.total = 13; }

  protected async run(): Promise<void> {
    await this.act('登录并准备 3 条待删记录 + 1 条对照记录', async () => {
      await this.login();
      this.shared.room1 = await this.ensureRoom1TagCategory();
      this.shared.room2 = await this.ensureRoom({
        name: this.roomName2, platform: 'Lita', roomCategory: null, tagName: null, tagColor: '', tagBg: '', openState: 'open'
      });
      this.shared.room3 = await this.ensureRoom({
        name: this.roomName3, platform: 'Cinta', roomCategory: null, tagName: null, tagColor: '', tagBg: '', openState: 'close'
      });
      const room1 = this.shared.room1 as string;
      const room2 = this.shared.room2 as string;
      const room3 = this.shared.room3 as string;
      await this.recDeleteByRoomIds([room1, room2, room3]);
      await this.recEnsure({ roomId: room1, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.recEnsure({ roomId: room1, keyLabel: this.nogiftKey, type: '永久', weight: 10 });
      await this.recEnsure({ roomId: room2, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.recEnsure({ roomId: room3, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.recSearch({});
      await this.recPageSize(50);
      this.shared.totalBefore = await this.totalCount(this.page!);
    });
    const room1 = this.shared.room1 as string;
    const room2 = this.shared.room2 as string;
    const room3 = this.shared.room3 as string;

    // ---------------- 用例#58 ----------------
    await this.act('用例#58 不勾选任何记录查看批量删除按钮', async () => {
      await this.recSearch({});
      await this.recClearSelection();
      const btn = this.page!.getByRole('button', { name: '批量删除' }).first();
      this.shared.c58disabled = await btn.evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('is-disabled'));
      let clickError = '';
      try {
        await btn.click({ timeout: 3000 });
      } catch (e) {
        clickError = (e as Error).message.split('\n')[0];
      }
      this.shared.c58 = {
        disabled: this.shared.c58disabled,
        clickError,
        dialogs: await this.page!.locator('.el-message-box__wrapper:visible').count(),
        total: await this.totalCount(this.page!)
      };
      await this.shot('case58-disabled');
    });
    await this.check('用例#58-① 未勾选时「批量删除」按钮为禁用状态', async () => {
      const info = this.shared.c58 as { disabled: boolean };
      return { expect: '按钮禁用', real: info.disabled ? 'disabled=true' : 'disabled=false', pass: info.disabled === true };
    });
    await this.check('用例#58-② 点击后不触发任何删除动作与弹窗，列表不变', async () => {
      const info = this.shared.c58 as { dialogs: number; total: number; clickError: string };
      return {
        expect: '无弹窗、无删除、Total 不变',
        real: `弹窗数=${info.dialogs}；Total=${info.total}（操作前=${this.shared.totalBefore}）；点击结果=${info.clickError ? '被禁用拦截' : '未触发'}`,
        pass: info.dialogs === 0 && info.total === Number(this.shared.totalBefore)
      };
    });

    // ---------------- 用例#59 ----------------
    await this.act('用例#59 勾选 3 条自建记录并点击批量删除', async () => {
      await this.recSearch({});
      for (const [roomId, key] of [[room1, this.giftKey], [room1, this.nogiftKey], [room2, this.giftKey]] as Array<[string, string]>) {
        const idx = await this.recRowIndex(roomId, key);
        if (idx < 0) throw new Error(`未找到待勾选记录 roomId=${roomId} key=${key}`);
        await this.recSelectRow(idx);
      }
      this.shared.c59selected = await this.page!.locator('.el-table__body-wrapper tbody tr .el-checkbox__input.is-checked').count();
      await this.page!.getByRole('button', { name: '批量删除' }).first().click();
      const box = this.page!.locator('.el-message-box__wrapper:visible').first();
      this.shared.c59confirm = (await box.count()) ? (await box.innerText()).replace(/\s+/g, ' ').trim() : '';
      await this.shot('case59-confirm');
      if (await box.count()) await this.confirmMessageBox(this.page!, true);
      await this.waitTableSettled(this.page!);
      await this.messageText(this.page!);
      await this.recSearch({});
      this.shared.c59total = await this.totalCount(this.page!);
      await this.recSearch({ roomId: room1 });
      this.shared.c59room1 = await this.recRows();
      await this.recSearch({ roomId: room2 });
      this.shared.c59room2 = await this.recRows();
      await this.recSearch({ roomId: room3 });
      this.shared.c59room3 = await this.recRows();
      await this.shot('case59-after-delete');
    });
    await this.check('用例#59-① 点击批量删除后弹出二次确认弹窗', async () => {
      const text = this.shared.c59confirm as string;
      return { expect: '出现二次确认弹窗', real: text || '（无弹窗）', pass: text !== '' };
    });
    await this.check('用例#59-② 确认后 3 条勾选记录从列表消失', async () => {
      const r1 = this.shared.c59room1 as string[][];
      const r2 = this.shared.c59room2 as string[][];
      const left1 = r1.filter((r) => r[REC_COL.configKey].includes(this.giftKey) || r[REC_COL.configKey].includes(this.nogiftKey));
      const left2 = r2.filter((r) => r[REC_COL.configKey].includes(this.giftKey));
      const detail2 = r2.map((r) => r[REC_COL.configKey]).join('、');
      return {
        expect: '3 条勾选记录均不在列表（房间1 已送礼/未送礼、房间2 已送礼）',
        real: `房间1剩余勾选类=${left1.length} 条；房间2剩余已送礼=${left2.length} 条${detail2 ? `（房间2现存分类：${detail2}）` : ''}`,
        pass: left1.length === 0 && left2.length === 0
      };
    });
    await this.check('用例#59-③ 分页 Total 减少 3', async () => {
      const before = Number(this.shared.totalBefore);
      const after = Number(this.shared.c59total);
      return { expect: `Total=${before - 3}`, real: `Total=${after}`, pass: after === before - 3 };
    });
    await this.check('用例#59-④ 未勾选的其他记录不受影响', async () => {
      const rows = this.shared.c59room3 as string[][];
      const control = rows.find((r) => r[REC_COL.roomId] === room3 && r[REC_COL.configKey].includes(this.giftKey));
      return { expect: '对照记录仍在列表', real: control ? '存在' : '不存在', pass: !!control };
    });

    // ---------------- 用例#60 ----------------
    await this.act('用例#60 重新构造 3 条记录后勾选并点击批量删除再取消', async () => {
      await this.recEnsure({ roomId: room1, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.recEnsure({ roomId: room1, keyLabel: this.nogiftKey, type: '永久', weight: 10 });
      await this.recEnsure({ roomId: room2, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.recSearch({});
      this.shared.c60before = await this.totalCount(this.page!);
      for (const [roomId, key] of [[room1, this.giftKey], [room1, this.nogiftKey], [room2, this.giftKey]] as Array<[string, string]>) {
        const idx = await this.recRowIndex(roomId, key);
        if (idx < 0) throw new Error(`未找到待勾选记录 roomId=${roomId} key=${key}`);
        await this.recSelectRow(idx);
      }
      await this.page!.getByRole('button', { name: '批量删除' }).first().click();
      const box = this.page!.locator('.el-message-box__wrapper:visible').first();
      this.shared.c60confirm = (await box.count()) ? (await box.innerText()).replace(/\s+/g, ' ').trim() : '';
      await this.shot('case60-confirm');
      if (await box.count()) await this.confirmMessageBox(this.page!, false);
      await this.waitTableSettled(this.page!);
      this.shared.c60dialogAfter = await this.page!.locator('.el-message-box__wrapper:visible').count();
      this.shared.c60exists = [];
      for (const [roomId, key] of [[room1, this.giftKey], [room1, this.nogiftKey], [room2, this.giftKey]] as Array<[string, string]>) {
        await this.recSearch({ roomId });
        const rows = await this.recRows();
        (this.shared.c60exists as boolean[]).push(rows.some((r) => r[REC_COL.configKey].includes(key)));
      }
      await this.recSearch({});
      this.shared.c60total = await this.totalCount(this.page!);
      await this.shot('case60-after-cancel');
    });
    await this.check('用例#60-① 点击取消后确认弹窗关闭且不执行删除', async () => {
      const text = this.shared.c60confirm as string;
      const visible = Number(this.shared.c60dialogAfter);
      return { expect: '确认弹窗关闭', real: `弹窗文案=${text || '（无）'}；取消后可见弹窗数=${visible}`, pass: text !== '' && visible === 0 };
    });
    await this.check('用例#60-② 勾选的 3 条记录仍显示在列表中', async () => {
      const exists = this.shared.c60exists as boolean[];
      return { expect: '3 条记录均存在', real: `存在 ${exists.filter(Boolean).length} 条（${exists.join('/')}）`, pass: exists.length === 3 && exists.every(Boolean) };
    });
    await this.check('用例#60-③ 分页 Total 与操作前一致', async () => {
      return { expect: `Total=${this.shared.c60before}`, real: `Total=${this.shared.c60total}`, pass: Number(this.shared.c60total) === Number(this.shared.c60before) };
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1/BD-2/BD-3 自建推荐记录（页面批量删除）', async () => {
      await this.recDeleteByRoomIds([room1, room2, room3]);
    });
  }
}

await new RecBatchDeleteTest().execute();
