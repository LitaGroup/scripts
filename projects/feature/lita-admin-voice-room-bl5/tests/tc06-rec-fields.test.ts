/**
 * 项目 BL-0005 / TK-0443：房间推荐管理-新增展示字段与生效状态
 * 用例来源：TK-0442 HANDOFF 九列用例 #40/#41/#42/#43；技术方案：TECH_DESIGN §3 AC-1~AC-5、§5 断言映射
 * 覆盖：#40 永久记录展示字段（lita/cinta 两数据行）；#41 短时记录推荐时间；#42 生效状态四数据行；#43 历史空值显示-
 * 数据隔离：AC-1~AC-5 写入 QA 自建房间真实实验KEY，执行后按房间批量删除
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc06-rec-fields.test.ts
 */
import { VoiceRoomBase, REC_COL } from './lib/voice-room-base.ts';
import { fmtTime } from './lib/admin-base.ts';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{1,2}$/;

class RecFieldsTest extends VoiceRoomBase {
  constructor() { super('tc06-rec-fields'); this.total = 25; }

  private rowOf(rows: string[][], roomId: string, key: string): string[] | null {
    return rows.find((r) => r[REC_COL.roomId] === roomId && r[REC_COL.configKey].includes(key)) ?? null;
  }

  protected async run(): Promise<void> {
    const now = Date.now();
    const ac2Start = new Date(now - 3600000);
    const ac2End = new Date(now + 86400000);
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
      await this.recEnsure({ roomId: room1, keyLabel: this.nogiftKey, type: '短时', weight: 10, start: ac2Start, end: ac2End });
      await this.recEnsure({ roomId: room2, keyLabel: this.nogiftKey, type: '短时', weight: 10, start: new Date(now - 172800000), end: new Date(now - 86400000) });
      await this.recEnsure({ roomId: room3, keyLabel: this.nogiftKey, type: '短时', weight: 10, start: new Date(now + 86400000), end: new Date(now - 3600000) });
      await this.recEnsure({ roomId: room3, keyLabel: this.giftKey, type: '永久', weight: 10 });
    });

    const room1 = this.shared.room1 as string;
    const room3 = this.shared.room3 as string;

    // ---------------- 用例#40 ----------------
    const c40rows = [
      { row: 1, roomId: room1, key: this.giftKey, platform: 'lita', name: this.roomName1, category: 'Official Room - New User', status: '开放' },
      { row: 2, roomId: room3, key: this.giftKey, platform: 'cinta', name: this.roomName3, category: '-', status: '关闭' }
    ];
    for (const item of c40rows) {
      await this.act(`用例#40[数据行${item.row}] 房间ID筛选 ${item.roomId} 查看展示字段`, async () => {
        await this.recSearch({ roomId: item.roomId });
        const rows = await this.recRows();
        this.shared[`c40row${item.row}`] = this.rowOf(rows, item.roomId, item.key);
        await this.shot(`case40-row${item.row}`);
      });
      await this.check(`用例#40-①[数据行${item.row}] 所属平台显示 ${item.platform}`, async () => {
        const row = this.shared[`c40row${item.row}`] as string[] | null;
        return { expect: item.platform, real: row?.[REC_COL.platform] ?? '（未找到记录）', pass: row?.[REC_COL.platform] === item.platform };
      });
      await this.check(`用例#40-②[数据行${item.row}] 房间名称显示 ${item.name}`, async () => {
        const row = this.shared[`c40row${item.row}`] as string[] | null;
        return { expect: item.name, real: row?.[REC_COL.roomName] ?? '（未找到记录）', pass: row?.[REC_COL.roomName] === item.name };
      });
      await this.check(`用例#40-③[数据行${item.row}] Room Category 显示 ${item.category}`, async () => {
        const row = this.shared[`c40row${item.row}`] as string[] | null;
        return { expect: item.category, real: row?.[REC_COL.roomCategory] ?? '（未找到记录）', pass: row?.[REC_COL.roomCategory] === item.category };
      });
      await this.check(`用例#40-④[数据行${item.row}] 房间状态显示 ${item.status}`, async () => {
        const row = this.shared[`c40row${item.row}`] as string[] | null;
        return { expect: item.status, real: row?.[REC_COL.roomStatus] ?? '（未找到记录）', pass: row?.[REC_COL.roomStatus] === item.status };
      });
      await this.check(`用例#40-⑤[数据行${item.row}] 操作人显示当前登录账号 qa-ai`, async () => {
        const row = this.shared[`c40row${item.row}`] as string[] | null;
        return { expect: 'qa-ai', real: row?.[REC_COL.operateName] ?? '（未找到记录）', pass: row?.[REC_COL.operateName] === 'qa-ai' };
      });
      await this.check(`用例#40-⑥[数据行${item.row}] 操作时间为日期时间格式且非「-」`, async () => {
        const row = this.shared[`c40row${item.row}`] as string[] | null;
        const v = row?.[REC_COL.operateTime] ?? '';
        return { expect: 'yyyy-MM-dd HH:mm:ss 且非「-」', real: v || '（空）', pass: DATETIME_RE.test(v) };
      });
    }

    // ---------------- 用例#41 ----------------
    await this.act('用例#41 房间ID筛选 AC-2 短时记录', async () => {
      await this.recSearch({ roomId: room1 });
      const rows = await this.recRows();
      this.shared.c41row = this.rowOf(rows, room1, this.nogiftKey);
      await this.shot('case41-temp-time');
    });
    await this.check('用例#41-① 推荐类型列显示「短时」', async () => {
      const row = this.shared.c41row as string[] | null;
      return { expect: '短时', real: row?.[REC_COL.type] ?? '（未找到记录）', pass: row?.[REC_COL.type] === '短时' };
    });
    await this.check('用例#41-② 推荐时间列显示「开始 ~ 结束」且与配置一致', async () => {
      const row = this.shared.c41row as string[] | null;
      const expected = `${fmtTime(ac2Start)} ~ ${fmtTime(ac2End)}`;
      return { expect: expected, real: row?.[REC_COL.time] ?? '（未找到记录）', pass: row?.[REC_COL.time] === expected };
    });
    await this.check('用例#41-③ 生效状态列显示「生效中」', async () => {
      const row = this.shared.c41row as string[] | null;
      return { expect: '生效中', real: row?.[REC_COL.effective] ?? '（未找到记录）', pass: row?.[REC_COL.effective] === '生效中' };
    });

    // ---------------- 用例#42 ----------------
    const c42rows = [
      { row: 1, roomId: room1, key: this.giftKey, effective: '生效中', type: '永久' },
      { row: 2, roomId: room1, key: this.nogiftKey, effective: '生效中', type: '短时' },
      { row: 3, roomId: this.shared.room2 as string, key: this.nogiftKey, effective: '已失效', type: '短时' },
      { row: 4, roomId: room3, key: this.nogiftKey, effective: '已失效', type: '短时' }
    ];
    for (const item of c42rows) {
      await this.act(`用例#42[数据行${item.row}] 房间ID筛选 ${item.roomId} 查看生效状态`, async () => {
        await this.recSearch({ roomId: item.roomId });
        const rows = await this.recRows();
        this.shared[`c42row${item.row}`] = this.rowOf(rows, item.roomId, item.key);
      });
      await this.check(`用例#42-①[数据行${item.row}] 生效状态显示 ${item.effective}`, async () => {
        const row = this.shared[`c42row${item.row}`] as string[] | null;
        return { expect: item.effective, real: row?.[REC_COL.effective] ?? '（未找到记录）', pass: row?.[REC_COL.effective] === item.effective };
      });
      await this.check(`用例#42-②[数据行${item.row}] 推荐类型显示 ${item.type}`, async () => {
        const row = this.shared[`c42row${item.row}`] as string[] | null;
        return { expect: item.type, real: row?.[REC_COL.type] ?? '（未找到记录）', pass: row?.[REC_COL.type] === item.type };
      });
    }

    // ---------------- 用例#43 ----------------
    await this.act('用例#43 查看历史记录行与自建 AC-1 行的空值展示', async () => {
      await this.recSearch({});
      await this.recPageSize(50);
      const rows = await this.recRows();
      this.shared.c43all = rows.length;
      this.shared.c43history = rows.find((r) => r[REC_COL.operateName] === '-' && r[REC_COL.operateTime] === '-') ?? null;
      this.shared.c43ac1 = rows.find((r) => r[REC_COL.roomId] === room1 && r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      await this.shot('case43-history');
    });
    await this.check('用例#43-① 历史记录行 Room Category/操作人/操作时间均显示「-」', async () => {
      const row = this.shared.c43history as string[] | null;
      if (!row) return { expect: '- / - / -', real: '未找到历史记录行（操作人=- 且已失效）', pass: false };
      const vals = [row[REC_COL.roomCategory], row[REC_COL.operateName], row[REC_COL.operateTime]];
      return { expect: '- / - / -', real: vals.join(' / '), pass: vals.every((v) => v === '-') };
    });
    await this.check('用例#43-② 自建 AC-1 行同三列显示实际值（非「-」）', async () => {
      const row = this.shared.c43ac1 as string[] | null;
      if (!row) return { expect: '三列均非「-」', real: '未找到 AC-1 记录', pass: false };
      const vals = [row[REC_COL.roomCategory], row[REC_COL.operateName], row[REC_COL.operateTime]];
      return { expect: '三列均非「-」', real: vals.join(' / '), pass: vals.every((v) => v !== '-') };
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1/BD-2/BD-3 的全部自建推荐记录（页面批量删除）', async () => {
      await this.recDeleteByRoomIds([room1, this.shared.room2 as string, room3]);
    });
  }
}

await new RecFieldsTest().execute();
