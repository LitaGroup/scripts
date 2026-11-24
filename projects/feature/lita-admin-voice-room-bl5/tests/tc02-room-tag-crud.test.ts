/**
 * 项目 BL-0005 / TK-0443：房间管理-Room Tag / Room Category / 房间类型 写操作
 * 用例来源：TK-0442 HANDOFF 九列用例 #3/#4/#5/#6/#7/#11/#12/#20；技术方案：TECH_DESIGN §3 BD-1/BD-2、§4.2 元素定位、§5 断言映射
 * 覆盖：#3 新建配置标签与分类；#4 编辑回显；#5 关闭标签清空；#6 空标签回显无；#7 不配置两列显示-；
 *       #11 六个分类枚举数据变体；#12 清空分类；#20 连续修改类型四次
 * 数据隔离：页面构造 QA-BL5-{runId}-room / -notag；结束清理标签、分类并置 close（页面无删除能力，保留并标注测试数据）
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc02-room-tag-crud.test.ts
 */
import { VoiceRoomBase } from './lib/voice-room-base.ts';
import { type Page } from 'playwright';
import { ROOM_COL } from './lib/voice-room-base.ts';

class RoomTagCrudTest extends VoiceRoomBase {
  constructor() { super('tc02-room-tag-crud'); this.total = 38; }

  protected async run(): Promise<void> {
    await this.act('登录并进入房间管理', async () => {
      await this.login();
      await this.openManager();
      this.shared.allTotal = await this.totalCount(this.page!);
    });

    // ---------------- 用例#3：新建（即 BD-1 构造） ----------------
    await this.act('用例#3 按 BD-1 参数新建测试房间（Room Tag + Room Category）', async () => {
      await this.openManager();
      const before = await this.managerRows();
      if (before.some((r) => r[ROOM_COL.roomName] === this.roomName1)) {
        throw new Error(`本轮 runId 已存在同名房间 ${this.roomName1}，请使用新的 BL5_RUN_ID 重跑以保证用例#3 的新建步骤真实执行`);
      }
      await this.createRoom({
        name: this.roomName1, platform: 'Lita', roomCategory: 'Official Room - New User',
        tagName: this.roomTagName, tagColor: '#FFFFFF', tagBg: '#FF5722', openState: 'open'
      });
      await this.managerSearchByName(this.roomName1);
      this.shared.room1 = await this.managerRoomId(this.roomName1);
    });
    await this.check('用例#3-① 点击「确 定」后弹窗关闭且无错误提示', async () => {
      const visible = await this.page!.locator('.el-dialog__wrapper:visible').count();
      const errors = await this.page!.locator('.el-message--error').count();
      await this.shot('case3-created');
      return { expect: '弹窗关闭；无错误提示', real: `弹窗可见数=${visible}；错误提示数=${errors}`, pass: visible === 0 && errors === 0 };
    });
    await this.check('用例#3-② 「Room Tag」列显示标签名称', async () => {
      await this.managerSearchByName(this.roomName1);
      const row = await this.managerRowByName(this.roomName1);
      return { expect: this.roomTagName, real: row?.[ROOM_COL.roomTag] ?? '（未找到行）', pass: row?.[ROOM_COL.roomTag] === this.roomTagName };
    });
    await this.check('用例#3-③ 标签文字颜色与背景色与配置一致（computed style）', async () => {
      const style = await this.roomTagStyle(this.roomName1);
      const color = this.rgbToHex(style.color);
      const bg = this.rgbToHex(style.background);
      await this.shot('case3-tag-style');
      return {
        expect: 'color=#FFFFFF；background=#FF5722',
        real: `color=${color}；background=${bg}`,
        pass: color === '#FFFFFF' && bg === '#FF5722'
      };
    });
    await this.check('用例#3-④ 「Room Category」列显示所选分类', async () => {
      const row = await this.managerRowByName(this.roomName1);
      return {
        expect: 'Official Room - New User',
        real: row?.[ROOM_COL.roomCategory] ?? '（未找到行）',
        pass: row?.[ROOM_COL.roomCategory] === 'Official Room - New User'
      };
    });

    // ---------------- 用例#4：编辑回显 ----------------
    await this.act('用例#4 打开房间 Edit 弹窗查看标签回显', async () => {
      const page = await this.openEditDialogByName(this.roomName1);
      this.shared.editPage4 = page;
      await this.shotOn(page, 'case4-edit-dialog');
    });
    await this.check('用例#4-① 房间标签开关选中「有」', async () => {
      const page = this.shared.editPage4 as Page;
      const active = await this.dlgActiveRadio(page, '房间标签');
      return { expect: '有', real: active, pass: active === '有' };
    });
    await this.check('用例#4-② 标签名称回显配置值', async () => {
      const page = this.shared.editPage4 as Page;
      const value = await this.dlgItem(page, '标签名称').locator('input').first().inputValue();
      return { expect: this.roomTagName, real: value, pass: value === this.roomTagName };
    });
    await this.check('用例#4-③ 标签文字颜色回显 #FFFFFF', async () => {
      const page = this.shared.editPage4 as Page;
      const hex = await this.dlgColorHex(page, '标签文字颜色');
      return { expect: '#FFFFFF', real: hex, pass: hex === '#FFFFFF' };
    });
    await this.check('用例#4-④ 标签背景色回显 #FF5722', async () => {
      const page = this.shared.editPage4 as Page;
      const hex = await this.dlgColorHex(page, '标签背景色');
      return { expect: '#FF5722', real: hex, pass: hex === '#FF5722' };
    });
    await this.act('用例#4 关闭 Edit 弹窗', async () => {
      const page = this.shared.editPage4 as Page;
      await this.cancelRoomDialog(page);
      await this.closeSession(page);
    });

    // ---------------- 用例#5：关闭标签保存清空 ----------------
    await this.act('用例#5 编辑房间将房间标签切为「无」并保存', async () => {
      const roomId = this.shared.room1 as string;
      await this.editRoom(roomId, async (page) => {
        await this.dlgRadio(page, '房间标签', '无');
      });
      await this.managerSearchByName(this.roomName1);
    });
    await this.check('用例#5-① 保存成功且无错误提示', async () => {
      const errors = await this.page!.locator('.el-message--error').count();
      return { expect: '无错误提示', real: `错误提示数=${errors}`, pass: errors === 0 };
    });
    await this.check('用例#5-② 列表「Room Tag」列显示「-」', async () => {
      const row = await this.managerRowByName(this.roomName1);
      await this.shot('case5-tag-cleared');
      return { expect: '-', real: row?.[ROOM_COL.roomTag] ?? '（未找到行）', pass: row?.[ROOM_COL.roomTag] === '-' };
    });
    await this.act('用例#5 重新打开 Edit 弹窗', async () => {
      this.shared.editPage5 = await this.openEditDialogByName(this.roomName1);
    });
    await this.check('用例#5-③ 重新打开后开关为「无」且三项配置不显示', async () => {
      const page = this.shared.editPage5 as Page;
      const active = await this.dlgActiveRadio(page, '房间标签');
      const visible: string[] = [];
      for (const label of ['标签名称', '标签文字颜色', '标签背景色']) {
        if (await this.dlgItemVisible(page, label)) visible.push(label);
      }
      await this.shotOn(page, 'case5-edit-after-clear');
      return {
        expect: '开关=无；三项配置不显示',
        real: `开关=${active}；可见=${visible.length === 0 ? '无' : visible.join('、')}`,
        pass: active === '无' && visible.length === 0
      };
    });
    await this.act('用例#5 关闭 Edit 弹窗', async () => {
      const page = this.shared.editPage5 as Page;
      await this.cancelRoomDialog(page);
      await this.closeSession(page);
    });

    // ---------------- 用例#6：标签为空回显无（BD-1 关闭标签后作为无标签房间，TECH_DESIGN BD-2 降级路径） ----------------
    await this.act('用例#6 打开无标签房间 Edit 弹窗', async () => {
      this.shared.editPage6 = await this.openEditDialogByName(this.roomName1);
    });
    await this.check('用例#6-① 无标签房间 Edit 弹窗开关选中「无」', async () => {
      const page = this.shared.editPage6 as Page;
      const active = await this.dlgActiveRadio(page, '房间标签');
      return { expect: '无', real: active, pass: active === '无' };
    });
    await this.check('用例#6-② 标签名称/标签文字颜色/标签背景色三项均不显示', async () => {
      const page = this.shared.editPage6 as Page;
      const visible: string[] = [];
      for (const label of ['标签名称', '标签文字颜色', '标签背景色']) {
        if (await this.dlgItemVisible(page, label)) visible.push(label);
      }
      await this.shotOn(page, 'case6-edit-no-tag');
      return {
        expect: '三项均不显示',
        real: visible.length === 0 ? '均不显示' : `可见：${visible.join('、')}`,
        pass: visible.length === 0
      };
    });
    await this.act('用例#6 关闭 Edit 弹窗', async () => {
      const page = this.shared.editPage6 as Page;
      await this.cancelRoomDialog(page);
      await this.closeSession(page);
    });

    // ---------------- 用例#7：新建不配置（BD-2 构造） ----------------
    await this.act('用例#7 按 BD-2 参数新建无标签无分类测试房间', async () => {
      await this.openManager();
      const before = await this.managerRows();
      if (before.some((r) => r[ROOM_COL.roomName] === this.roomName2)) {
        throw new Error(`本轮 runId 已存在同名房间 ${this.roomName2}`);
      }
      await this.createRoom({
        name: this.roomName2, platform: 'Lita', roomCategory: null,
        tagName: null, tagColor: '', tagBg: '', openState: 'open'
      });
      this.shared.room2 = await this.managerRoomId(this.roomName2);
    });
    await this.check('用例#7-① 保存成功且无错误提示', async () => {
      const errors = await this.page!.locator('.el-message--error').count();
      return { expect: '无错误提示', real: `错误提示数=${errors}`, pass: errors === 0 };
    });
    await this.check('用例#7-② 列表「Room Tag」列显示「-」', async () => {
      const row = await this.managerRowByName(this.roomName2);
      return { expect: '-', real: row?.[ROOM_COL.roomTag] ?? '（未找到行）', pass: row?.[ROOM_COL.roomTag] === '-' };
    });
    await this.check('用例#7-③ 列表「Room Category」列显示「-」', async () => {
      const row = await this.managerRowByName(this.roomName2);
      await this.shot('case7-notag-row');
      return { expect: '-', real: row?.[ROOM_COL.roomCategory] ?? '（未找到行）', pass: row?.[ROOM_COL.roomCategory] === '-' };
    });

    // ---------------- 用例#11：六个分类枚举数据变体 ----------------
    const categories = ['Official Room', 'Official Room - New User', 'Official Room - Revenue', 'Official Room - Game Room', 'Self - Operated Room', 'Self - Operated Room - Partnership'];
    for (let i = 0; i < categories.length; i++) {
      const target = categories[i];
      const rowNo = i + 1;
      await this.act(`用例#11[数据行${rowNo}] 编辑房间修改 Room Category 为 ${target}`, async () => {
        await this.managerSearchByName(this.roomName1);
        const row = await this.managerRowByName(this.roomName1);
        if (!row) throw new Error('未找到 QA 测试房间');
        this.shared[`case11before${rowNo}`] = { roomType: row[ROOM_COL.roomType], status: row[ROOM_COL.status] };
        await this.editRoom(this.shared.room1 as string, async (page) => {
          await this.dlgPick(page, 'Room Category', target);
        });
        await this.managerSearchByName(this.roomName1);
      });
      await this.check(`用例#11-①[数据行${rowNo}] 保存成功且无错误提示`, async () => {
        const errors = await this.page!.locator('.el-message--error').count();
        return { expect: '无错误提示', real: `错误提示数=${errors}`, pass: errors === 0 };
      });
      await this.check(`用例#11-②[数据行${rowNo}] 列表 Room Category 列显示 ${target}`, async () => {
        const row = await this.managerRowByName(this.roomName1);
        if (rowNo === 1) await this.shot('case11-category');
        return { expect: target, real: row?.[ROOM_COL.roomCategory] ?? '（未找到行）', pass: row?.[ROOM_COL.roomCategory] === target };
      });
      await this.check(`用例#11-③[数据行${rowNo}] 房间类型与语音房状态与修改前一致（无业务联动）`, async () => {
        const before = this.shared[`case11before${rowNo}`] as { roomType: string; status: string };
        const row = await this.managerRowByName(this.roomName1);
        return {
          expect: `房间类型=${before.roomType}；语音房状态=${before.status}`,
          real: `房间类型=${row?.[ROOM_COL.roomType] ?? ''}；语音房状态=${row?.[ROOM_COL.status] ?? ''}`,
          pass: row?.[ROOM_COL.roomType] === before.roomType && row?.[ROOM_COL.status] === before.status
        };
      });
    }

    // ---------------- 用例#12：清空 Room Category ----------------
    await this.act('用例#12 打开 Edit 弹窗尝试清空 Room Category 并保存', async () => {
      await this.managerSearchByName(this.roomName1);
      const page = await this.openEditDialogByName(this.roomName1);
      try {
        const item = this.dlgItem(page, 'Room Category');
        await item.locator('.el-select').first().hover();
        const clear = item.locator('.el-select .el-icon-circle-close');
        const hasClear = (await clear.count()) > 0 && (await clear.first().isVisible().catch(() => false));
        let method = 'none';
        if (hasClear) {
          await clear.first().click();
          method = 'clear-icon';
        } else {
          const input = item.locator('input').first();
          await input.click();
          await page.keyboard.press('Backspace');
          await page.keyboard.press('Delete');
          method = 'keyboard';
        }
        const valueAfter = await item.locator('input').first().inputValue();
        this.shared.case12 = { hasClear, method, valueAfter, selectHtml: (await item.innerHTML()).slice(0, 600) };
        await this.shotOn(page, 'case12-clear-attempt');
        await this.saveRoomDialog(page);
      } finally {
        await this.closeSession(page);
      }
      await this.managerSearchByName(this.roomName1);
    });
    await this.check('用例#12-① 保存成功且无错误提示', async () => {
      const errors = await this.page!.locator('.el-message--error').count();
      return { expect: '无错误提示', real: `错误提示数=${errors}`, pass: errors === 0 };
    });
    await this.check('用例#12-② 列表「Room Category」列显示「-」', async () => {
      const row = await this.managerRowByName(this.roomName1);
      const info = this.shared.case12 as { hasClear: boolean; method: string; valueAfter: string };
      await this.shot('case12-category-after-clear');
      return {
        expect: '-',
        real: `${row?.[ROOM_COL.roomCategory] ?? '（未找到行）'}（清空尝试：${info.method}，清空前输入框值=${info.valueAfter}，清除图标=${info.hasClear ? '存在' : '不存在'}）`,
        pass: row?.[ROOM_COL.roomCategory] === '-'
      };
    });

    // ---------------- 用例#20：连续修改房间类型四次 ----------------
    // v8/TK-0456 修订：娱乐(fun)→娱乐1(fun1)→派单(orders)→娱乐1(fun1)→娱乐(fun)，避开「个人房」禁用态。
    const typeSeq = ['娱乐1(fun1)', '派单(orders)', '娱乐1(fun1)', '娱乐(fun)'];
    const typeValue = ['fun1', 'orders', 'fun1', 'fun'];
    const stepResults: string[] = [];
    await this.act('用例#20 连续四次修改房间类型', async () => {
      for (let i = 0; i < typeSeq.length; i++) {
        let disabled = false;
        await this.editRoom(this.shared.room1 as string, async (page) => {
          const item = this.dlgItem(page, '房间类型');
          disabled = await item.locator('input').first().isDisabled();
          if (disabled) {
            await this.shotOn(page, `case20-step${i + 1}-type-disabled`);
            return;
          }
          await this.dlgPick(page, '房间类型', typeSeq[i]);
        });
        if (disabled) {
          const current = await this.managerRowByName(this.roomName1).then((r) => r?.[ROOM_COL.roomType] ?? '');
          stepResults.push(`第${i + 1}次(${typeSeq[i]})未执行：房间类型下拉禁用（当前类型=${current}）`);
          this.notes.push(`#20 阻断：第 ${i + 1} 次修改时房间类型下拉 disabled=true，当前类型=${current}`);
          break;
        }
        stepResults.push(`第${i + 1}次 ${typeSeq[i]} 保存成功`);
        this.notes.push(`#20 第 ${i + 1} 次修改为 ${typeSeq[i]}`);
        await this.managerSearchByName(this.roomName1);
      }
      await this.managerSearchByName(this.roomName1);
    });
    await this.check('用例#20-① 四次保存均成功且全程无次数限制提示', async () => {
      const messages = await this.page!.locator('.el-message').allInnerTexts();
      const limit = messages.filter((m) => m.includes('次数'));
      const ok = stepResults.length === 4 && stepResults.every((r) => r.includes('保存成功')) && limit.length === 0;
      return {
        expect: '4 次均保存成功且无「次数」相关提示',
        real: `${stepResults.join('；')}${limit.length ? `；次数提示=${limit.join('、')}` : '；无次数提示'}`,
        pass: ok
      };
    });
    await this.check('用例#20-② 最终列表「房间类型」列显示 fun', async () => {
      const row = await this.managerRowByName(this.roomName1);
      await this.shot('case20-final-type');
      return {
        expect: typeValue[typeValue.length - 1],
        real: row?.[ROOM_COL.roomType] ?? '（未找到行）',
        pass: row?.[ROOM_COL.roomType] === 'fun'
      };
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1/BD-2：清空标签与分类并置 close（保留测试房间）', async () => {
      for (const roomId of [this.shared.room1, this.shared.room2]) {
        if (!roomId) continue;
        await this.editRoom(roomId as string, async (page) => {
          const active = await this.dlgActiveRadio(page, '房间标签').catch(() => '');
          if (active === '有') await this.dlgRadio(page, '房间标签', '无');
          await this.dlgRadio(page, 'openState', 'close');
        });
      }
    });
  }
}

await new RoomTagCrudTest().execute();
