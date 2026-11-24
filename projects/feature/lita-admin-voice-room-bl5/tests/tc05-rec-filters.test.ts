/**
 * 项目 BL-0005 / TK-0443：房间推荐管理-筛选（新增 + 原有筛选回归）
 * 用例来源：TK-0442 HANDOFF 九列用例 #31~#39；技术方案：TECH_DESIGN §3 AC-1~AC-5（页面构造降级路径）、§5 断言映射
 * 覆盖：#31 大区；#32/#33 状态；#34/#35 推荐类型；#36 房间ID；#37 用户分类；#38 组合；#39 Reset Filters
 * 数据隔离：AC-1~AC-5 均写入 QA 自建房间（BD-1/BD-2/BD-3）的真实实验KEY，执行后按房间批量删除
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc05-rec-filters.test.ts
 */
import { VoiceRoomBase, REC_COL } from './lib/voice-room-base.ts';

class RecFiltersTest extends VoiceRoomBase {
  constructor() { super('tc05-rec-filters'); this.total = 33; }

  private rowOf(rows: string[][], roomId: string, key: string): string[] | null {
    return rows.find((r) => r[REC_COL.roomId] === roomId && r[REC_COL.configKey].includes(key)) ?? null;
  }

  private assertAll(rows: string[][], col: number, expected: string) {
    const bad = rows.filter((r) => r[col] !== expected);
    return {
      expect: `各行「${col}」=${expected}`,
      real: bad.length === 0 ? `全部 ${rows.length} 行符合` : `${bad.length} 行不符（示例：${bad.slice(0, 2).map((r) => r[col]).join('、')}）`,
      pass: rows.length > 0 && bad.length === 0
    };
  }

  protected async run(): Promise<void> {
    const now = Date.now();
    await this.act('登录并准备 BD-1/BD-2/BD-3 与 AC-1~AC-5 推荐记录（页面构造）', async () => {
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
      await this.recEnsure({ roomId: room1, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.recEnsure({ roomId: room1, keyLabel: this.nogiftKey, type: '短时', weight: 10, start: new Date(now - 3600000), end: new Date(now + 86400000) });
      await this.recEnsure({ roomId: room2, keyLabel: this.nogiftKey, type: '短时', weight: 10, start: new Date(now - 172800000), end: new Date(now - 86400000) });
      await this.recEnsure({ roomId: room3, keyLabel: this.nogiftKey, type: '短时', weight: 10, start: new Date(now + 86400000), end: new Date(now - 3600000) });
      await this.recEnsure({ roomId: room3, keyLabel: this.giftKey, type: '永久', weight: 10 });
      await this.openRecommend();
      await this.recSearch({});
      this.shared.fullTotal = await this.totalCount(this.page!);
      this.notes.push(`推荐列表全量 Total=${this.shared.fullTotal}`);
    });

    const room1 = this.shared.room1 as string;
    const room2 = this.shared.room2 as string;
    const room3 = this.shared.room3 as string;

    // ---------------- 用例#31 ----------------
    await this.act('用例#31 推荐列表按大区筛选「印尼语区」', async () => {
      await this.recSearch({ locale: '印尼语区' });
      this.shared.c31rows = await this.recRows();
      this.shared.c31total = await this.totalCount(this.page!);
      await this.shot('case31-locale-in');
    });
    await this.check('用例#31-① 结果行大区列均为印尼(in) 且包含 AC-1 记录', async () => {
      const rows = this.shared.c31rows as string[][];
      const r = this.assertAll(rows, REC_COL.locale, '印尼(in)');
      const hasAc1 = !!this.rowOf(rows, room1, this.giftKey);
      return { ...r, expect: `${r.expect} 且含 AC-1`, real: `${r.real}；含AC-1=${hasAc1}`, pass: r.pass && hasAc1 };
    });
    await this.check('用例#31-② 分页 Total 与该大区记录数一致', async () => {
      const rows = this.shared.c31rows as string[][];
      const total = Number(this.shared.c31total);
      return { expect: 'Total 与该大区记录数一致（≥当前页行数且>0）', real: `Total=${total}；行数=${rows.length}`, pass: total > 0 && total >= rows.length };
    });
    await this.act('用例#31 切换大区为「中文区」', async () => {
      await this.recSearch({ locale: '中文区' });
      this.shared.c31rows2 = await this.recRows();
      await this.shot('case31-locale-zh');
    });
    await this.check('用例#31-③ 切换中文区后各行大区为中文区(zh) 且 AC-1 不在结果中', async () => {
      const rows = this.shared.c31rows2 as string[][];
      const bad = rows.filter((r) => r[REC_COL.locale] !== '中文区(zh)');
      const hasAc1 = !!this.rowOf(rows, room1, this.giftKey);
      return {
        expect: '各行大区=中文区(zh) 且不含 AC-1',
        real: `行数=${rows.length}；不符行数=${bad.length}；含AC-1=${hasAc1}`,
        pass: bad.length === 0 && !hasAc1
      };
    });

    // ---------------- 用例#32 ----------------
    await this.act('用例#32 推荐列表按状态筛选「生效中」', async () => {
      await this.recSearch({ status: '生效中' });
      this.shared.c32rows = await this.recRows();
      this.shared.c32total = await this.totalCount(this.page!);
      await this.shot('case32-effective');
    });
    await this.check('用例#32-① 各行生效状态均为「生效中」且包含 AC-1', async () => {
      const rows = this.shared.c32rows as string[][];
      const r = this.assertAll(rows, REC_COL.effective, '生效中');
      const hasAc1 = !!this.rowOf(rows, room1, this.giftKey);
      return { ...r, expect: `${r.expect} 且含 AC-1`, real: `${r.real}；含AC-1=${hasAc1}`, pass: r.pass && hasAc1 };
    });
    await this.check('用例#32-② 已失效记录（AC-3）不在结果中', async () => {
      const rows = this.shared.c32rows as string[][];
      const hasAc3 = !!this.rowOf(rows, room2, this.nogiftKey);
      return { expect: 'AC-3 不在结果中', real: `含AC-3=${hasAc3}`, pass: !hasAc3 };
    });
    await this.check('用例#32-③ 分页 Total 等于生效中记录数', async () => {
      const rows = this.shared.c32rows as string[][];
      const total = Number(this.shared.c32total);
      return { expect: 'Total 与生效中记录数一致（≥当前页行数且>0）', real: `Total=${total}；行数=${rows.length}`, pass: total > 0 && total >= rows.length };
    });

    // ---------------- 用例#33 ----------------
    await this.act('用例#33 推荐列表按状态筛选「已失效」', async () => {
      await this.recSearch({ status: '已失效' });
      this.shared.c33rows = await this.recRows();
      this.shared.c33total = await this.totalCount(this.page!);
      await this.shot('case33-invalid');
    });
    await this.check('用例#33-① 各行生效状态均为「已失效」且包含 AC-3', async () => {
      const rows = this.shared.c33rows as string[][];
      const r = this.assertAll(rows, REC_COL.effective, '已失效');
      const hasAc3 = !!this.rowOf(rows, room2, this.nogiftKey);
      return { ...r, expect: `${r.expect} 且含 AC-3`, real: `${r.real}；含AC-3=${hasAc3}`, pass: r.pass && hasAc3 };
    });
    await this.check('用例#33-② 生效中记录（AC-1）不在结果中', async () => {
      const rows = this.shared.c33rows as string[][];
      const hasAc1 = !!this.rowOf(rows, room1, this.giftKey);
      return { expect: 'AC-1 不在结果中', real: `含AC-1=${hasAc1}`, pass: !hasAc1 };
    });
    await this.check('用例#33-③ 分页 Total 等于已失效记录数', async () => {
      const rows = this.shared.c33rows as string[][];
      const total = Number(this.shared.c33total);
      return { expect: 'Total 与已失效记录数一致（≥当前页行数且>0）', real: `Total=${total}；行数=${rows.length}`, pass: total > 0 && total >= rows.length };
    });

    // ---------------- 用例#34 ----------------
    await this.act('用例#34 推荐列表按推荐类型筛选「永久」', async () => {
      await this.recSearch({ type: '永久' });
      this.shared.c34rows = await this.recRows();
      this.shared.c34total = await this.totalCount(this.page!);
      await this.shot('case34-forever');
    });
    await this.check('用例#34-① 各行推荐类型均为「永久」且包含 AC-1', async () => {
      const rows = this.shared.c34rows as string[][];
      const r = this.assertAll(rows, REC_COL.type, '永久');
      const hasAc1 = !!this.rowOf(rows, room1, this.giftKey);
      return { ...r, expect: `${r.expect} 且含 AC-1`, real: `${r.real}；含AC-1=${hasAc1}`, pass: r.pass && hasAc1 };
    });
    await this.check('用例#34-② 短时记录（AC-2）不在结果中', async () => {
      const rows = this.shared.c34rows as string[][];
      const hasAc2 = !!this.rowOf(rows, room1, this.nogiftKey);
      return { expect: 'AC-2 不在结果中', real: `含AC-2=${hasAc2}`, pass: !hasAc2 };
    });
    await this.check('用例#34-③ 分页 Total 等于永久记录数', async () => {
      const rows = this.shared.c34rows as string[][];
      const total = Number(this.shared.c34total);
      return { expect: 'Total 与永久记录数一致（≥当前页行数且>0）', real: `Total=${total}；行数=${rows.length}`, pass: total > 0 && total >= rows.length };
    });

    // ---------------- 用例#35 ----------------
    await this.act('用例#35 推荐列表按推荐类型筛选「短时」', async () => {
      await this.recSearch({ type: '短时' });
      this.shared.c35rows = await this.recRows();
      this.shared.c35total = await this.totalCount(this.page!);
      await this.shot('case35-temp');
    });
    await this.check('用例#35-① 各行推荐类型均为「短时」且包含 AC-2、AC-3', async () => {
      const rows = this.shared.c35rows as string[][];
      const r = this.assertAll(rows, REC_COL.type, '短时');
      const hasAc2 = !!this.rowOf(rows, room1, this.nogiftKey);
      const hasAc3 = !!this.rowOf(rows, room2, this.nogiftKey);
      return { ...r, expect: `${r.expect} 且含 AC-2/AC-3`, real: `${r.real}；含AC-2=${hasAc2}；含AC-3=${hasAc3}`, pass: r.pass && hasAc2 && hasAc3 };
    });
    await this.check('用例#35-② 永久记录不在结果中', async () => {
      const rows = this.shared.c35rows as string[][];
      const bad = rows.filter((r) => r[REC_COL.type] !== '短时');
      return { expect: '无永久记录', real: `非短时行数=${bad.length}`, pass: bad.length === 0 };
    });
    await this.check('用例#35-③ 分页 Total 等于短时记录数', async () => {
      const rows = this.shared.c35rows as string[][];
      const total = Number(this.shared.c35total);
      return { expect: 'Total 与短时记录数一致（≥当前页行数且>0）', real: `Total=${total}；行数=${rows.length}`, pass: total > 0 && total >= rows.length };
    });

    // ---------------- 用例#36 ----------------
    await this.act('用例#36 推荐列表按房间ID 精确筛选', async () => {
      await this.recSearch({ roomId: room1 });
      this.shared.c36rows = await this.recRows();
      await this.shot('case36-roomid');
    });
    await this.check('用例#36-① 列表各行房间ID 均为所输入房间ID', async () => {
      const rows = this.shared.c36rows as string[][];
      return this.assertAll(rows, REC_COL.roomId, room1);
    });
    await this.check('用例#36-② 其他房间的推荐记录不在结果中', async () => {
      const rows = this.shared.c36rows as string[][];
      const others = rows.filter((r) => r[REC_COL.roomId] !== room1);
      return { expect: '仅包含该房间记录', real: `其他房间行数=${others.length}`, pass: rows.length > 0 && others.length === 0 };
    });

    // ---------------- 用例#37 ----------------
    await this.act('用例#37 按用户分类筛选「已送礼用户」', async () => {
      await this.recSearch({ userClass: '已送礼用户' });
      this.shared.c37rows = await this.recRows();
      await this.shot('case37-gift');
    });
    await this.check('用例#37-① 各行用户分类均为「已送礼用户」', async () => {
      const rows = this.shared.c37rows as string[][];
      return this.assertAll(rows, REC_COL.configKey, '已送礼用户');
    });
    await this.act('用例#37 切换用户分类为「未送礼用户」', async () => {
      await this.recSearch({ userClass: '未送礼用户' });
      this.shared.c37rows2 = await this.recRows();
      await this.shot('case37-nogift');
    });
    await this.check('用例#37-② 切换后各行均为「未送礼用户」且前一类记录不在结果中', async () => {
      const rows = this.shared.c37rows2 as string[][];
      const bad = rows.filter((r) => !r[REC_COL.configKey].includes('未送礼用户'));
      const gift = rows.filter((r) => r[REC_COL.configKey].includes('已送礼用户'));
      return {
        expect: '各行均为未送礼用户且无已送礼用户',
        real: `行数=${rows.length}；不符=${bad.length}；已送礼行=${gift.length}`,
        pass: rows.length > 0 && bad.length === 0 && gift.length === 0
      };
    });

    // ---------------- 用例#38 ----------------
    await this.act('用例#38 组合筛选：印尼语区 + 生效中 + 永久', async () => {
      await this.recSearch({ locale: '印尼语区', status: '生效中', type: '永久' });
      this.shared.c38rows = await this.recRows();
      await this.shot('case38-combo1');
    });
    await this.check('用例#38-① 组合1 各行同时满足三条件且含 AC-1', async () => {
      const rows = this.shared.c38rows as string[][];
      const bad = rows.filter((r) => r[REC_COL.locale] !== '印尼(in)' || r[REC_COL.effective] !== '生效中' || r[REC_COL.type] !== '永久');
      const hasAc1 = !!this.rowOf(rows, room1, this.giftKey);
      return {
        expect: '各行满足 印尼语区/生效中/永久 且含 AC-1',
        real: `行数=${rows.length}；不符=${bad.length}；含AC-1=${hasAc1}`,
        pass: rows.length > 0 && bad.length === 0 && hasAc1
      };
    });
    await this.act('用例#38 组合筛选：印尼语区 + 已失效 + 短时', async () => {
      await this.recSearch({ locale: '印尼语区', status: '已失效', type: '短时' });
      this.shared.c38rows2 = await this.recRows();
      await this.shot('case38-combo2');
    });
    await this.check('用例#38-② 组合2 各行同时满足三条件且含 AC-3', async () => {
      const rows = this.shared.c38rows2 as string[][];
      const bad = rows.filter((r) => r[REC_COL.locale] !== '印尼(in)' || r[REC_COL.effective] !== '已失效' || r[REC_COL.type] !== '短时');
      const hasAc3 = !!this.rowOf(rows, room2, this.nogiftKey);
      return {
        expect: '各行满足 印尼语区/已失效/短时 且含 AC-3',
        real: `行数=${rows.length}；不符=${bad.length}；含AC-3=${hasAc3}`,
        pass: rows.length > 0 && bad.length === 0 && hasAc3
      };
    });
    await this.check('用例#38-③ 两次结果互不交叉（AC-1 不在组合2、AC-3 不在组合1）', async () => {
      const rows1 = this.shared.c38rows as string[][];
      const rows2 = this.shared.c38rows2 as string[][];
      const ac1In2 = !!this.rowOf(rows2, room1, this.giftKey);
      const ac3In1 = !!this.rowOf(rows1, room2, this.nogiftKey);
      return { expect: 'AC-1∉组合2 且 AC-3∉组合1', real: `AC-1在组合2=${ac1In2}；AC-3在组合1=${ac3In1}`, pass: !ac1In2 && !ac3In1 };
    });

    // ---------------- 用例#39 ----------------
    await this.act('用例#39 设置状态与推荐类型后点击 Reset Filters', async () => {
      await this.recSearch({ status: '已失效', type: '短时' });
      this.shared.c39filtered = await this.totalCount(this.page!);
      await this.recReset();
      this.shared.c39total = await this.totalCount(this.page!);
      await this.shot('case39-reset');
    });
    await this.check('用例#39-① 状态与推荐类型筛选恢复未选择', async () => {
      const status = await this.recSelect('状态').locator('input').first().inputValue();
      const type = await this.recSelect('推荐类型').locator('input').first().inputValue();
      return { expect: '状态=空；推荐类型=空', real: `状态=${status || '空'}；推荐类型=${type || '空'}`, pass: status === '' && type === '' };
    });
    await this.check('用例#39-② 列表恢复默认全量结果（Total 与全量一致）', async () => {
      return { expect: `Total=${this.shared.fullTotal}`, real: `Total=${this.shared.c39total}`, pass: Number(this.shared.c39total) === Number(this.shared.fullTotal) };
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1/BD-2/BD-3 的全部自建推荐记录（页面批量删除）', async () => {
      await this.recDeleteByRoomIds([room1, room2, room3]);
    });
  }
}

await new RecFiltersTest().execute();
