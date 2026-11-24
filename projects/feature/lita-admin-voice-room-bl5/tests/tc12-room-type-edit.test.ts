/**
 * 项目 BL-0005 / TK-0443：房间管理-编辑弹窗房间类型回归
 * 用例来源：TK-0442 HANDOFF 九列用例 #18；技术方案：TECH_DESIGN §5 断言映射
 * 覆盖：#18 编辑房间_房间类型下拉无 couple 选项
 * 数据隔离：仅打开 Edit 弹窗后取消，不产生数据变更
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc12-room-type-edit.test.ts
 */
import { VoiceRoomBase } from './lib/voice-room-base.ts';
import { type Page } from 'playwright';

class RoomTypeEditTest extends VoiceRoomBase {
  constructor() { super('tc12-room-type-edit'); this.total = 4; }

  protected async run(): Promise<void> {
    await this.act('登录并准备可编辑房间（房间类型非个人房）', async () => {
      await this.login();
      const room2 = await this.ensureRoom({
        name: this.roomName2, platform: 'Lita', roomCategory: null, tagName: null, tagColor: '', tagBg: '', openState: 'open'
      });
      await this.managerSearchByName(this.roomName2);
      let row = await this.managerRowByName(this.roomName2);
      if (!row || row[9] === 'person') {
        await this.managerReset();
        const rows = await this.managerRows();
        row = rows.find((r) => r[9] !== 'person' && r[9] !== '') ?? null;
      }
      if (!row) throw new Error('未找到可用于编辑弹窗的房间');
      this.shared.roomId = row[2];
      this.notes.push(`#18 使用房间 ${row[2]}（类型=${row[9]}）`);
    });
    await this.act('用例#18 打开房间 Edit 弹窗并展开房间类型下拉', async () => {
      const page = await this.openDetail(this.shared.roomId as string);
      this.shared.editPage = page;
      await page.locator('button', { hasText: 'Edit' }).first().click();
      await page.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
      this.shared.options = await this.dlgOptions(page, '房间类型');
      await this.shotOn(this.shared.editPage as Page, 'case18-edit-type-options');
    });
    await this.check('用例#18-① 编辑房间类型下拉选项为派单(orders)/娱乐(fun)/娱乐1(fun1)/个人房', async () => {
      const options = this.shared.options as string[];
      return { expect: '派单(orders)|娱乐(fun)|娱乐1(fun1)|个人房', real: options.join('|'), pass: options.join('|') === '派单(orders)|娱乐(fun)|娱乐1(fun1)|个人房' };
    });
    await this.check('用例#18-② 房间类型下拉中不存在 couple 选项', async () => {
      const options = this.shared.options as string[];
      const hit = options.filter((o) => /couple/i.test(o));
      return { expect: '无 couple 选项', real: hit.length === 0 ? '无' : `存在：${hit.join('、')}`, pass: hit.length === 0 };
    });
    await this.act('用例#18 取消 Edit 弹窗并关闭详情页', async () => {
      const page = this.shared.editPage as Page;
      await this.cancelRoomDialog(page);
      await this.closeSession(page);
    });
  }
}

await new RoomTypeEditTest().execute();
