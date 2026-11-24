/**
 * 项目 BL-0005 / TK-0443：房间管理-列表筛选（新增筛选 + 原有筛选回归）
 * 用例来源：TK-0442 HANDOFF 九列用例 #8/#9/#13/#14/#15/#16/#19/#21/#22/#23/#26；技术方案：TECH_DESIGN §5 断言映射
 * 覆盖：#8/#9 Room Tag 筛选；#13 房间名称模糊；#14 Room Category 精确；#15 房间Tagtype 筛选（#406 回归）；
 *       #16 组合筛选；#19 房间类型计数；#21 原有 8 项筛选数据变体；#22 创建日期范围；#23 重置；#26 空态
 * 回归轮次：R2（TK-0548）；#15 按修复后实现回归，逐行读取详情 Tagtype 校验筛选结果
 * 数据隔离：仅读取列表 + 使用 BD-1 已配置标签/分类；结束时恢复 BD-1 原状态由 tc02/清理负责
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc03-room-filters.test.ts
 */
import { VoiceRoomBase, ROOM_COL } from './lib/voice-room-base.ts';
import { UI_BASE } from './lib/admin-base.ts';

class RoomFiltersTest extends VoiceRoomBase {
  constructor() { super('tc03-room-filters'); this.total = 62; }

  private expectAll(rows: string[][], col: number, expected: string): { expect: string; real: string; pass: boolean } {
    const bad = rows.filter((r) => r[col] !== expected);
    return {
      expect: `全部行「${col}」=${expected}`,
      real: bad.length === 0 ? `全部 ${rows.length} 行符合` : `${bad.length} 行不符：${bad.slice(0, 3).map((r) => r[col]).join('、')}`,
      pass: rows.length > 0 && bad.length === 0
    };
  }

  protected async run(): Promise<void> {
    await this.act('登录并进入房间管理，准备 BD-1 标签与分类', async () => {
      await this.login();
      this.shared.room1 = await this.ensureRoom1TagCategory();
      this.shared.room2 = await this.ensureRoom({
        name: this.roomName2, platform: 'Lita', roomCategory: null, tagName: null, tagColor: '', tagBg: '', openState: 'open'
      });
      await this.managerSearchByName(this.roomName2);
      await this.managerReset();
      this.shared.allTotal = await this.totalCount(this.page!);
      this.notes.push(`全量 Total=${this.shared.allTotal}`);
    });

    // ---------------- 用例#8 ----------------
    await this.act('用例#8 是否有Room Tag 筛选「有」', async () => {
      await this.managerReset();
      await this.managerPick('是否有Room Tag', '有');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.taggedRows = await this.managerRows();
      this.shared.taggedTotal = await this.totalCount(this.page!);
      await this.shot('case8-tag-yes');
    });
    await this.check('用例#8-① 列表仅显示配置了 Room Tag 的房间（各行标签非「-」）', async () => {
      const rows = this.shared.taggedRows as string[][];
      const bad = rows.filter((r) => r[ROOM_COL.roomTag] === '-' || r[ROOM_COL.roomTag] === '');
      return {
        expect: '各行 Room Tag 均非「-」',
        real: bad.length === 0 ? `全部 ${rows.length} 行均为标签值` : `${bad.length} 行为空/「-」`,
        pass: rows.length > 0 && bad.length === 0
      };
    });
    await this.check('用例#8-② 分页 Total 等于有标签房间数量且包含 QA 测试房间', async () => {
      const rows = this.shared.taggedRows as string[][];
      const total = Number(this.shared.taggedTotal);
      const hasQa = rows.some((r) => r[ROOM_COL.roomName] === this.roomName1);
      return {
        expect: 'Total≥1 且包含 QA-BL5 测试房间',
        real: `Total=${total}；当前页行数=${rows.length}；含 QA 测试房间=${hasQa}`,
        pass: total >= 1 && total >= rows.length && hasQa
      };
    });

    // ---------------- 用例#9 ----------------
    await this.act('用例#9 是否有Room Tag 筛选「无」', async () => {
      await this.managerReset();
      await this.managerPick('是否有Room Tag', '无');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.noTagRows = await this.managerRows();
      this.shared.noTagTotal = await this.totalCount(this.page!);
      await this.shot('case9-tag-no');
    });
    await this.check('用例#9-① 列表各行「Room Tag」列均显示「-」', async () => {
      const rows = this.shared.noTagRows as string[][];
      const bad = rows.filter((r) => r[ROOM_COL.roomTag] !== '-');
      return {
        expect: '各行 Room Tag 均为「-」',
        real: bad.length === 0 ? `全部 ${rows.length} 行均为「-」` : `${bad.length} 行非「-」`,
        pass: rows.length > 0 && bad.length === 0
      };
    });
    await this.check('用例#9-② Total 大于 0 且等于全量总数减去有标签房间数', async () => {
      const all = Number(this.shared.allTotal);
      const tagged = Number(this.shared.taggedTotal);
      const noTag = Number(this.shared.noTagTotal);
      return {
        expect: `Total=${all - tagged}（全量 ${all} - 有标签 ${tagged}）`,
        real: `Total=${noTag}`,
        pass: noTag > 0 && noTag === all - tagged
      };
    });

    // ---------------- 用例#13 ----------------
    const runId = process.env.BL5_RUN_ID ?? 'R1';
    const keywordRows = [
      { row: 1, keyword: `QA-BL5-${runId}` },
      { row: 2, keyword: `${runId}-room` },
      { row: 3, keyword: `-room` }
    ];
    for (const item of keywordRows) {
      await this.act(`用例#13[数据行${item.row}] 房间名称筛选「${item.keyword}」`, async () => {
        await this.managerReset();
        await this.fillPlaceholder(this.page!, '房间名称', item.keyword);
        await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
        this.shared[`case13rows${item.row}`] = await this.managerRows();
        this.shared[`case13total${item.row}`] = await this.totalCount(this.page!);
      });
      await this.check(`用例#13-①[数据行${item.row}] 列表包含 QA 测试房间且各行名称包含关键字`, async () => {
        const rows = this.shared[`case13rows${item.row}`] as string[][];
        const hasQa = rows.some((r) => r[ROOM_COL.roomName] === this.roomName1);
        const bad = rows.filter((r) => !r[ROOM_COL.roomName].includes(item.keyword));
        return {
          expect: `包含 ${this.roomName1}；各行名称含「${item.keyword}」`,
          real: `含QA房间=${hasQa}；不符行数=${bad.length}`,
          pass: hasQa && bad.length === 0
        };
      });
      await this.check(`用例#13-②[数据行${item.row}] 分页 Total 大于 0`, async () => {
        const total = Number(this.shared[`case13total${item.row}`]);
        return { expect: 'Total>0', real: `Total=${total}`, pass: total > 0 };
      });
    }
    await this.act('用例#13[数据行4] 房间名称筛选不存在的名称', async () => {
      await this.managerReset();
      await this.fillPlaceholder(this.page!, '房间名称', `QA-BL5-${runId}-nope`);
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
    });
    await this.check('用例#13-③[数据行4] 列表显示空态「No Data」且 Total=0', async () => {
      const empty = await this.emptyText(this.page!);
      const total = await this.totalCount(this.page!);
      await this.shot('case13-no-result');
      return {
        expect: '空态=No Data；Total=0',
        real: `空态=${empty}；Total=${total}`,
        pass: empty.includes('No Data') && total === 0
      };
    });

    // ---------------- 用例#14 ----------------
    await this.act('用例#14 Room Category 筛选 Official Room - New User', async () => {
      await this.managerReset();
      await this.managerPick('Room Category', 'Official Room - New User');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.c14rows = await this.managerRows();
      this.shared.c14total = await this.totalCount(this.page!);
      await this.shot('case14-category');
    });
    await this.check('用例#14-① 列表各行 Room Category 均为 Official Room - New User 且包含 QA 测试房间', async () => {
      const rows = this.shared.c14rows as string[][];
      const r = this.expectAll(rows, ROOM_COL.roomCategory, 'Official Room - New User');
      const hasQa = rows.some((x) => x[ROOM_COL.roomName] === this.roomName1);
      return { ...r, expect: `${r.expect} 且包含 QA 测试房间`, real: `${r.real}；含QA房间=${hasQa}`, pass: r.pass && hasQa };
    });
    await this.check('用例#14-② 分页 Total 等于该分类房间数', async () => {
      const rows = this.shared.c14rows as string[][];
      const total = Number(this.shared.c14total);
      return { expect: 'Total≥当前页行数且>0', real: `Total=${total}；行数=${rows.length}`, pass: total > 0 && total >= rows.length };
    });
    await this.act('用例#14 切换 Room Category 为 Official Room - Revenue', async () => {
      await this.managerPick('Room Category', 'Official Room - Revenue');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.c14rows2 = await this.managerRows();
    });
    await this.check('用例#14-③ 切换后各行均为 Official Room - Revenue 且 QA 测试房间不在结果中', async () => {
      const rows = this.shared.c14rows2 as string[][];
      const bad = rows.filter((x) => x[ROOM_COL.roomCategory] !== 'Official Room - Revenue');
      const hasQa = rows.some((x) => x[ROOM_COL.roomName] === this.roomName1);
      return {
        expect: '各行 Room Category=Official Room - Revenue（无结果时为空列表）且不含 QA 测试房间',
        real: `结果行数=${rows.length}；不符行数=${bad.length}；含QA房间=${hasQa}`,
        pass: bad.length === 0 && !hasQa
      };
    });

    // ---------------- 用例#15（#406 回归：房间Tagtype 筛选项） ----------------
    await this.act('用例#15 准备已知 Tagtype 样本（BD-1=chat、BD-2=fun）', async () => {
      await this.editRoom(this.shared.room1 as string, async (page) => {
        await this.dlgPick(page, '房间Tagtype', 'chat');
      });
      await this.editRoom(this.shared.room2 as string, async (page) => {
        await this.dlgPick(page, '房间Tagtype', 'fun');
      });
      this.notes.push('#15 样本：BD-1(chat) / BD-2(fun)，用于筛选结果包含/排除比对');
    });
    await this.act('用例#15 查看筛选区并选择「房间Tagtype=chat」后搜索', async () => {
      await this.openManager();
      await this.managerReset();
      const select = this.page!.locator('.app-main .el-select:has(input[placeholder="房间Tagtype"])').first();
      const visible = await select.isVisible().catch(() => false);
      const options = visible ? await this.managerSelectOptions('房间Tagtype') : [];
      this.shared.c15visible = visible;
      this.shared.c15options = options;
      if (!visible) return;
      await this.managerPick('房间Tagtype', 'chat');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.c15total = await this.totalCount(this.page!);
      await this.managerPageSize(50).catch(() => this.notes.push('#15 分页条数控件不可用，保持默认 10/page'));
      this.shared.c15rows = await this.managerRows();
      await this.shot('case15-tagtype-chat', true);
    });
    await this.act('用例#15 逐行打开结果房间详情读取「房间Tagtype」值', async () => {
      const rows = (this.shared.c15rows as string[][]) ?? [];
      const types: string[] = [];
      const errors: string[] = [];
      for (const row of rows) {
        const id = row[ROOM_COL.roomId];
        const popup = await this.context!.newPage();
        try {
          await popup.goto(`${UI_BASE}/#/voice-room/voice-room-detail?roomId=${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await popup.locator('.app-main').waitFor({ state: 'visible', timeout: 60000 });
          await popup.waitForFunction(() => (document.querySelector('.app-main')?.textContent ?? '').includes('房主NO'), undefined, { timeout: 30000 });
          await popup.locator('button', { hasText: 'Edit' }).first().click();
          await popup.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
          // 以「房间名称」回填值非空作为详情数据已加载完成的就绪条件，避免读取到空表单。
          await popup.waitForFunction(() => {
            const dlg = [...document.querySelectorAll('.el-dialog__wrapper')].find((w) => (w as HTMLElement).style.display !== 'none');
            const items = [...(dlg?.querySelectorAll('.el-form-item') ?? [])];
            const hit = items.find((x) => (x.querySelector('.el-form-item__label')?.textContent ?? '').includes('房间名称'));
            const i = hit?.querySelector('input') as HTMLInputElement | undefined;
            return !!i && i.value.trim() !== '';
          }, undefined, { timeout: 15000 });
          const item = popup.locator('.el-dialog__wrapper:visible .el-form-item').filter({ hasText: '房间Tagtype' }).first();
          types.push((await item.locator('input').first().inputValue()).trim());
        } catch (e) {
          errors.push(`${id}:${(e as Error).message.split('\n')[0].slice(0, 120)}`);
        } finally {
          await popup.close().catch(() => undefined);
        }
      }
      this.shared.c15types = types;
      this.shared.c15readErrors = errors;
      this.notes.push(`#15 逐行读取 Tagtype：成功 ${types.length}/${rows.length}，失败 ${errors.length}`);
    });
    await this.check('用例#15-① 筛选区显示「房间Tagtype」筛选项', async () => {
      const visible = this.shared.c15visible as boolean;
      const options = (this.shared.c15options as string[]) ?? [];
      const expected = ['game', 'fun', 'sing', 'chat'];
      const same = options.length === expected.length && expected.every((o) => options.includes(o));
      return {
        expect: '筛选区存在可见的「房间Tagtype」筛选控件，选项为 game/fun/sing/chat',
        real: `控件可见=${visible}；选项=${options.join('/') || '（无）'}`,
        pass: visible && same
      };
    });
    await this.check('用例#15-② 选择 Tagtype 值后列表仅显示对应记录', async () => {
      const rows = (this.shared.c15rows as string[][]) ?? [];
      const types = (this.shared.c15types as string[]) ?? [];
      const errors = (this.shared.c15readErrors as string[]) ?? [];
      const bad = types.filter((t) => t !== 'chat');
      const hasBd2 = rows.some((r) => r[ROOM_COL.roomId] === this.shared.room2);
      return {
        expect: '选择 chat 后结果行房间Tagtype 均为 chat，且不含 fun 样本房间（BD-2）',
        real: `结果行=${rows.length}；详情读取成功=${types.length}；非 chat 行=${bad.length}${bad.length ? `（${bad.slice(0, 3).join('/')}）` : ''}；读取失败=${errors.length}${errors.length ? `（${errors.slice(0, 2).join('；')}）` : ''}；含 BD-2(fun)=${hasBd2}`,
        pass: rows.length > 0 && types.length === rows.length && bad.length === 0 && !hasBd2
      };
    });
    await this.check('用例#15-③ 分页 Total 与筛选结果一致', async () => {
      const rows = (this.shared.c15rows as string[][]) ?? [];
      const total = Number(this.shared.c15total);
      return {
        expect: '分页 Total = 当前筛选结果行数',
        real: `Total=${total}；结果行数=${rows.length}`,
        pass: total > 0 && total === rows.length
      };
    });

    // ---------------- 用例#16 ----------------
    await this.act('用例#16 组合筛选：房间名称 + Room Category + 是否有 Room Tag', async () => {
      await this.managerReset();
      await this.fillPlaceholder(this.page!, '房间名称', this.roomName1);
      await this.managerPick('Room Category', 'Official Room - New User');
      await this.managerPick('是否有Room Tag', '有');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.c16rows = await this.managerRows();
      this.shared.c16total = await this.totalCount(this.page!);
      await this.shot('case16-combo');
    });
    await this.check('用例#16-① 三条件组合后列表显示 QA 测试房间行', async () => {
      const rows = this.shared.c16rows as string[][];
      const hit = rows.find((r) => r[ROOM_COL.roomName] === this.roomName1);
      return {
        expect: `包含 ${this.roomName1}`,
        real: hit ? `存在，Room Tag=${hit[ROOM_COL.roomTag]}，Category=${hit[ROOM_COL.roomCategory]}` : `未找到，当前 ${rows.length} 行`,
        pass: !!hit && hit[ROOM_COL.roomTag] !== '-' && hit[ROOM_COL.roomCategory] === 'Official Room - New User'
      };
    });
    await this.check('用例#16-② 分页 Total 为同时满足三条件的房间数', async () => {
      const rows = this.shared.c16rows as string[][];
      const total = Number(this.shared.c16total);
      return { expect: 'Total≥1 且与结果行一致', real: `Total=${total}；行数=${rows.length}`, pass: total >= 1 && total >= rows.length };
    });
    await this.act('用例#16 将 Room Category 改为 Official Room - Revenue', async () => {
      await this.managerPick('Room Category', 'Official Room - Revenue');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
    });
    await this.check('用例#16-③ 改分类后列表为空态「No Data」且 Total=0', async () => {
      const empty = await this.emptyText(this.page!);
      const total = await this.totalCount(this.page!);
      await this.shot('case16-empty');
      return {
        expect: '空态=No Data；Total=0',
        real: `空态=${empty}；Total=${total}`,
        pass: empty.includes('No Data') && total === 0
      };
    });

    // ---------------- 用例#19 ----------------
    const typeOptions = ['派单(orders)', '娱乐(fun)', '娱乐1(fun1)', '个人房'];
    const typeValues = ['orders', 'fun', 'fun1', 'person'];
    await this.act('用例#19 房间类型筛选：读取选项并依次统计各类型 Total', async () => {
      await this.managerReset();
      this.shared.c19options = await this.managerSelectOptions('请选择房间类型');
      const totals: Record<string, number> = {};
      const bad: Record<string, string[]> = {};
      for (const opt of typeOptions) {
        await this.managerReset();
        await this.managerPick('请选择房间类型', opt);
        await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
        const rows = await this.managerRows();
        totals[opt] = await this.totalCount(this.page!);
        bad[opt] = rows.filter((r) => !typeValues[typeOptions.indexOf(opt)] || r[ROOM_COL.roomType] !== typeValues[typeOptions.indexOf(opt)]).map((r) => r[ROOM_COL.roomType]);
      }
      this.shared.c19 = { totals, bad };
      await this.shot('case19-type-filter');
    });
    await this.check('用例#19-① 房间类型筛选下拉选项为四种（无 couple）', async () => {
      const options = this.shared.c19options as string[];
      return {
        expect: typeOptions.join('|'),
        real: options.join('|'),
        pass: options.length === 4 && typeOptions.every((o) => options.includes(o)) && !options.some((o) => /couple/i.test(o))
      };
    });
    await this.check('用例#19-② 各类型筛选结果中房间类型列均显示所选类型值', async () => {
      const { bad } = this.shared.c19 as { bad: Record<string, string[]> };
      const badKeys = Object.entries(bad).filter(([, v]) => v.length > 0).map(([k, v]) => `${k}:${v.slice(0, 2).join('/')}`);
      return { expect: '全部行类型与筛选值一致', real: badKeys.length === 0 ? '全部一致' : badKeys.join('；'), pass: badKeys.length === 0 };
    });
    await this.check('用例#19-③ 四个类型 Total 之和等于全量 Total', async () => {
      const { totals } = this.shared.c19 as { totals: Record<string, number> };
      const sum = Object.values(totals).reduce((a, b) => a + b, 0);
      const all = Number(this.shared.allTotal);
      return {
        expect: `四类型之和=${all}`,
        real: `之和=${sum}（${typeOptions.map((t) => `${t}=${totals[t]}`).join('，')}）`,
        pass: sum === all
      };
    });

    // ---------------- 用例#21 ----------------
    await this.act('用例#21 准备原有筛选数据行（读取首行字段）', async () => {
      await this.managerReset();
      const rows = await this.managerRows();
      if (rows.length === 0) throw new Error('房间列表为空，无法准备筛选数据行');
      const first = rows[0];
      this.shared.c21first = {
        roomId: first[ROOM_COL.roomId], roomNo: first[ROOM_COL.roomNo],
        roomName: first[ROOM_COL.roomName], total: await this.totalCount(this.page!)
      };
    });
    const c21 = this.shared.c21first as { roomId: string; roomNo: string } | undefined;
    const rows21: Array<{ row: number; label: string; apply: () => Promise<void>; col: number; expected: string; exactOne: boolean }> = [
      { row: 1, label: `房间id=${''}`, apply: async () => { await this.fillPlaceholder(this.page!, '房间id', c21!.roomId); }, col: ROOM_COL.roomId, expected: c21?.roomId ?? '', exactOne: true },
      { row: 2, label: '', apply: async () => { await this.fillPlaceholder(this.page!, '房间NO', c21!.roomNo); }, col: ROOM_COL.roomNo, expected: c21?.roomNo ?? '', exactOne: true },
      { row: 3, label: '房间类型=娱乐(fun)', apply: async () => { await this.managerPick('请选择房间类型', '娱乐(fun)'); }, col: ROOM_COL.roomType, expected: 'fun', exactOne: false },
      { row: 4, label: '大区=印尼语区', apply: async () => { await this.managerPick('请选择大区', '印尼语区'); }, col: ROOM_COL.locale, expected: '印尼(in)', exactOne: false },
      { row: 5, label: '国家=印尼', apply: async () => { await this.managerPick('请选择国家', '印尼'); }, col: ROOM_COL.country, expected: 'ID', exactOne: false },
      { row: 6, label: '是否公会房间=false', apply: async () => { await this.managerPick('是否公会房间', 'false'); }, col: ROOM_COL.isGuild, expected: 'false', exactOne: false },
      { row: 7, label: '语音房状态=open', apply: async () => { await this.managerPick('语音房状态', 'open'); }, col: ROOM_COL.status, expected: 'open', exactOne: false },
      { row: 8, label: 'Platform=Lita', apply: async () => { await this.managerPick('Platform', 'Lita'); }, col: ROOM_COL.platform, expected: 'Lita', exactOne: false }
    ];
    for (const item of rows21) {
      const title = item.row === 1 ? `用例#21[数据行1] 房间id=${c21?.roomId ?? '（未取到）'}` : item.row === 2 ? `用例#21[数据行2] 房间NO=${c21?.roomNo ?? '（未取到）'}` : `用例#21[数据行${item.row}] ${item.label}`;
      await this.act(title, async () => {
        await this.managerReset();
        await item.apply();
        await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
        this.shared[`c21rows${item.row}`] = await this.managerRows();
        this.shared[`c21total${item.row}`] = await this.totalCount(this.page!);
      });
      await this.check(`用例#21-①[数据行${item.row}] 列表各行对应列值与筛选值一致`, async () => {
        const rows = this.shared[`c21rows${item.row}`] as string[][];
        const r = this.expectAll(rows, item.col, item.expected);
        return r;
      });
      await this.check(`用例#21-②[数据行${item.row}] 分页 Total 与筛选结果一致`, async () => {
        const rows = this.shared[`c21rows${item.row}`] as string[][];
        const total = Number(this.shared[`c21total${item.row}`]);
        const ok = item.exactOne ? total === 1 && rows.length === 1 : total > 0 && total >= rows.length;
        return { expect: item.exactOne ? 'Total=1' : 'Total≥结果行数且>0', real: `Total=${total}；行数=${rows.length}`, pass: ok };
      });
      await this.check(`用例#21-③[数据行${item.row}] 重置筛选项后恢复全量结果`, async () => {
        await this.managerReset();
        const total = await this.totalCount(this.page!);
        return { expect: `Total=${this.shared.allTotal}`, real: `Total=${total}`, pass: total === Number(this.shared.allTotal) };
      });
    }

    // ---------------- 用例#22 ----------------
    await this.act('用例#22 按首行创建时间设置日期范围', async () => {
      await this.managerReset();
      const rows = await this.managerRows();
      const first = rows[0];
      const createTime = first[ROOM_COL.createTime];
      const date = createTime.slice(0, 10);
      this.shared.c22 = { date, roomId: first[ROOM_COL.roomId], roomName: first[ROOM_COL.roomName] };
      await this.managerSetDateRange(date, date);
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.c22rows = await this.managerRows();
    });
    await this.check('用例#22-① 结果行创建时间均在所选范围内且包含第一行房间', async () => {
      const info = this.shared.c22 as { date: string; roomId: string };
      const rows = this.shared.c22rows as string[][];
      const bad = rows.filter((r) => !r[ROOM_COL.createTime].startsWith(info.date));
      const hasFirst = rows.some((r) => r[ROOM_COL.roomId] === info.roomId);
      await this.shot('case22-date-range');
      return {
        expect: `全部行创建时间包含 ${info.date} 且含首行房间`,
        real: `不符行数=${bad.length}；含首行房间=${hasFirst}；结果行数=${rows.length}`,
        pass: rows.length > 0 && bad.length === 0 && hasFirst
      };
    });
    await this.act('用例#22 设置远未来日期范围 2030-01-01~2030-01-02', async () => {
      await this.managerSetDateRange('2030-01-01', '2030-01-02');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
    });
    await this.check('用例#22-② 远未来区间搜索后显示空态「No Data」且 Total=0', async () => {
      const empty = await this.emptyText(this.page!);
      const total = await this.totalCount(this.page!);
      await this.shot('case22-future-empty');
      return { expect: '空态=No Data；Total=0', real: `空态=${empty}；Total=${total}`, pass: empty.includes('No Data') && total === 0 };
    });

    // ---------------- 用例#23 ----------------
    await this.act('用例#23 设置房间名称与 Room Tag 条件后点击重置', async () => {
      await this.managerReset();
      await this.fillPlaceholder(this.page!, '房间名称', `QA-BL5-${runId}`);
      await this.managerPick('是否有Room Tag', '有');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      this.shared.c23before = await this.totalCount(this.page!);
      await this.managerReset();
      await this.waitTableSettled();
    });
    await this.check('用例#23-① 重置后房间名称清空、是否有Room Tag 恢复未选择', async () => {
      const name = await this.page!.locator('input[placeholder="房间名称"]').first().inputValue();
      const tag = await this.page!.locator('.app-main .el-select:has(input[placeholder="是否有Room Tag"]) input').first().inputValue();
      await this.shot('case23-reset');
      return {
        expect: '房间名称=空；是否有Room Tag=空',
        real: `房间名称=${name || '空'}；是否有Room Tag=${tag || '空'}`,
        pass: name === '' && tag === ''
      };
    });
    await this.check('用例#23-② 列表刷新为默认全量结果（Total 与全量一致）', async () => {
      const total = await this.totalCount(this.page!);
      return { expect: `Total=${this.shared.allTotal}`, real: `Total=${total}`, pass: total === Number(this.shared.allTotal) };
    });

    // ---------------- 用例#26 ----------------
    await this.act('用例#26 房间id 筛选不存在的房间 999999999999', async () => {
      await this.managerReset();
      await this.fillPlaceholder(this.page!, '房间id', '999999999999');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
    });
    await this.check('用例#26-① 列表区域显示空态提示「No Data」', async () => {
      const empty = await this.emptyText(this.page!);
      await this.shot('case26-empty');
      return { expect: 'No Data', real: empty, pass: empty.includes('No Data') };
    });
    await this.check('用例#26-② 分页 Total 显示 0', async () => {
      const total = await this.totalCount(this.page!);
      return { expect: '0', real: String(total), pass: total === 0 };
    });
    await this.check('用例#26-③ 页面无报错、无白屏', async () => {
      const appText = (await this.page!.locator('.app-main').innerText()).trim();
      const errors = await this.page!.locator('.el-message--error').count();
      return {
        expect: '页面正常渲染且无错误提示',
        real: `app-main 文本长度=${appText.length}；错误提示数=${errors}`,
        pass: appText.length > 0 && errors === 0
      };
    });
  }
}

await new RoomFiltersTest().execute();
