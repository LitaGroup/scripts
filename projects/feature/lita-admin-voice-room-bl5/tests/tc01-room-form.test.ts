/**
 * 项目 BL-0005 / TK-0443：房间管理-新建/编辑弹窗结构（Room Tag、Room Category、房间类型、入口回归）
 * 用例来源：TK-0442 HANDOFF 九列用例 #1/#2/#10/#17/#27；技术方案：/task/20261124/TK-0442/TECH_DESIGN（§4 元素定位、§5 断言映射）
 * 覆盖：#1 房间标签默认态与房间TagName隐藏；#2 开关切换显隐；#10 Room Category 位置/占位/枚举；#17 房间类型下拉无 couple；
 *       #27 新建语音房入口与取消回归
 * 数据隔离：本文件不产生数据变更（仅打开弹窗后取消）；账号 qa-ai
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-bl5/tests/tc01-room-form.test.ts
 */
import { VoiceRoomBase } from './lib/voice-room-base.ts';

class RoomFormTest extends VoiceRoomBase {
  constructor() { super('tc01-room-form'); this.total = 13; }

  protected async run(): Promise<void> {
    await this.act('登录 Admin 测试环境并进入房间管理', async () => {
      await this.login();
      await this.openManager();
      this.shared.beforeTotal = await this.totalCount(this.page!);
    });

    // ---------------- 用例#1 ----------------
    await this.act('用例#1 打开新建语音房弹窗并查看房间标签默认态', async () => {
      await this.openCreateRoomDialog();
    });
    await this.check('用例#1-① 房间标签开关默认选中「无」', async () => {
      const options = await this.dlgItem(this.page!, '房间标签').locator('.el-radio-button').allInnerTexts();
      const active = await this.dlgActiveRadio(this.page!, '房间标签');
      await this.shot('case1-default-tag-off');
      return {
        expect: `选项=${['无', '有'].join('/')}，默认选中=无`,
        real: `选项=${options.map((o) => o.trim()).join('/')}，默认选中=${active}`
      };
    });
    await this.check('用例#1-② 标签名称/标签文字颜色/标签背景色三个配置项均不显示', async () => {
      const visible: string[] = [];
      for (const label of ['标签名称', '标签文字颜色', '标签背景色']) {
        if (await this.dlgItemVisible(this.page!, label)) visible.push(label);
      }
      return visible.length === 0
        ? { expect: '均不显示', real: '均不显示' }
        : { expect: '均不显示', real: `可见：${visible.join('、')}`, pass: false };
    });
    await this.check('用例#1-③ 弹窗中不显示「房间TagName」配置字段', async () => {
      const labels = await this.dlgFormLabels(this.page!);
      const hit = labels.filter((l) => l.includes('房间TagName'));
      return hit.length === 0
        ? { expect: '不存在', real: '不存在' }
        : { expect: '不存在', real: `存在：${hit.join('、')}`, pass: false };
    });

    // ---------------- 用例#2 ----------------
    await this.act('用例#2 房间标签开关选择「有」', async () => {
      await this.dlgRadio(this.page!, '房间标签', '有');
      await this.dlgItem(this.page!, '标签名称').waitFor({ state: 'visible', timeout: 5000 });
    });
    await this.check('用例#2-① 选择「有」后显示标签名称/标签文字颜色/标签背景色三项，标签名称占位提示正确', async () => {
      const visible: string[] = [];
      for (const label of ['标签名称', '标签文字颜色', '标签背景色']) {
        if (await this.dlgItemVisible(this.page!, label)) visible.push(label);
      }
      const placeholder = await this.dlgItem(this.page!, '标签名称').locator('input').first().getAttribute('placeholder');
      await this.shot('case2-tag-on');
      const ok = visible.length === 3 && placeholder === '展示在客户端的标签文字';
      return {
        expect: '三项均可见；标签名称 placeholder=展示在客户端的标签文字',
        real: `可见=${visible.join('、')}；placeholder=${placeholder ?? ''}`,
        pass: ok
      };
    });
    await this.act('用例#2 房间标签开关切回「无」', async () => {
      await this.dlgRadio(this.page!, '房间标签', '无');
    });
    await this.check('用例#2-② 切回「无」后三项配置隐藏', async () => {
      const visible: string[] = [];
      for (const label of ['标签名称', '标签文字颜色', '标签背景色']) {
        if (await this.dlgItemVisible(this.page!, label)) visible.push(label);
      }
      return visible.length === 0
        ? { expect: '均隐藏', real: '均隐藏' }
        : { expect: '均隐藏', real: `仍可见：${visible.join('、')}`, pass: false };
    });

    // ---------------- 用例#10 ----------------
    await this.act('用例#10 查看 Room Category 表单项位置、占位与下拉选项', async () => {
      const labels = await this.dlgFormLabels(this.page!);
      const officialIdx = labels.indexOf('官方房间');
      const categoryIdx = labels.indexOf('RoomCategory');
      const placeholder = await this.dlgItem(this.page!, 'Room Category').locator('input').first().getAttribute('placeholder');
      const options = await this.dlgOptions(this.page!, 'Room Category');
      this.notes.push(`#10 位置：官方房间 idx=${officialIdx}，Room Category idx=${categoryIdx}`);
      this.notes.push(`#10 选项：${options.join('|')}`);
      await this.shot('case10-room-category');
      this.shared.case10 = { officialIdx, categoryIdx, placeholder, options };
    });
    await this.check('用例#10-① Room Category 位于官方房间表单项下方', async () => {
      const { officialIdx, categoryIdx } = this.shared.case10 as { officialIdx: number; categoryIdx: number };
      return {
        expect: 'Room Category 表单项索引 > 官方房间索引',
        real: `官方房间=${officialIdx}，RoomCategory=${categoryIdx}`,
        pass: officialIdx >= 0 && categoryIdx > officialIdx
      };
    });
    await this.check('用例#10-② Room Category 输入占位提示为「可不配置」', async () => {
      const { placeholder } = this.shared.case10 as { placeholder: string | null };
      return { expect: '可不配置', real: placeholder ?? '' };
    });
    await this.check('用例#10-③ Room Category 下拉选项为 6 个枚举', async () => {
      const { options } = this.shared.case10 as { options: string[] };
      const expected = ['Official Room', 'Official Room - New User', 'Official Room - Revenue', 'Official Room - Game Room', 'Self - Operated Room', 'Self - Operated Room - Partnership'];
      return { expect: expected.join('|'), real: options.join('|') };
    });

    // ---------------- 用例#17 ----------------
    await this.act('用例#17 打开房间类型下拉查看选项', async () => {
      this.shared.roomTypeOptions = await this.dlgOptions(this.page!, '房间类型');
    });
    await this.check('用例#17-① 新建房间类型下拉选项为派单(orders)/娱乐(fun)/娱乐1(fun1)/个人房', async () => {
      const options = this.shared.roomTypeOptions as string[];
      return { expect: '派单(orders)|娱乐(fun)|娱乐1(fun1)|个人房', real: options.join('|') };
    });
    await this.check('用例#17-② 房间类型下拉中不存在 couple 选项', async () => {
      const options = this.shared.roomTypeOptions as string[];
      const hit = options.filter((o) => /couple/i.test(o));
      return { expect: '无 couple 选项', real: hit.length === 0 ? '无' : `存在：${hit.join('、')}`, pass: hit.length === 0 };
    });

    // ---------------- 用例#27 ----------------
    await this.act('用例#27 查看新建语音房弹窗标题与表单项', async () => {
      const title = (await this.dialogRoot().locator('.el-dialog__title').innerText()).trim();
      const labels = await this.dlgFormLabels(this.page!);
      this.shared.case27 = { title, labels };
      await this.shot('case27-create-dialog');
    });
    await this.check('用例#27-① 弹窗标题为「新建语音房」且关键表单项正常显示', async () => {
      const { title, labels } = this.shared.case27 as { title: string; labels: string[] };
      const required = ['Locale', 'Country', '房主No', '公会ID', '房间名称', '房间类型', 'platform', '房间Tagtype', '官方房间', 'RoomCategory', '房间标签', '房间背景'];
      const missing = required.filter((r) => !labels.includes(r));
      return {
        expect: '标题=新建语音房；关键表单项齐全',
        real: `标题=${title}；缺失=${missing.length === 0 ? '无' : missing.join('、')}`,
        pass: title === '新建语音房' && missing.length === 0
      };
    });
    await this.act('用例#27 点击「取 消」关闭新建弹窗', async () => {
      await this.cancelRoomDialog(this.page!);
    });
    await this.check('用例#27-② 点击「取 消」后弹窗关闭', async () => {
      const visible = await this.page!.locator('.el-dialog__wrapper:visible').count();
      return visible === 0
        ? { expect: '已关闭', real: '已关闭' }
        : { expect: '已关闭', real: `仍有 ${visible} 个弹窗可见`, pass: false };
    });
    await this.check('用例#27-③ 列表数据与打开前一致（Total 不变）', async () => {
      const total = await this.totalCount(this.page!);
      const before = Number(this.shared.beforeTotal);
      return { expect: `Total=${before}`, real: `Total=${total}`, pass: total === before };
    });
  }
}

await new RoomFormTest().execute();
