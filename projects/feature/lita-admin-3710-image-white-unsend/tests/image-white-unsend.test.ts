/**
 * 项目 3710 / TK-0136：Admin 用户发图片白名单 + 陪玩师聊天记录 Unsend + 会话限制白名单回归
 * 用例来源：/task/20261109/TK-0135/HANDOFF（28 条九列用例）；技术方案：/task/20261109/TK-0135/TECH_DESIGN
 * 覆盖：#1~#16、#18、#21~#24、#26~#28；#6（BD-04 无数据）、#19/#20/#25（无 UNSEND 数据）按阻塞取证不生成检查点
 * 数据隔离：仅使用测试环境真实用户 ID；通过页面添加/删除图片白名单与会话限制白名单测试行；禁止 SQL 写库
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3710-image-white-unsend/tests/image-white-unsend.test.ts
 */
import { AdminBase, WHITE_HASH, SESSION_HASH, arg, setEquals, type Candidate, type WhiteRow, type SessionRow, type PaginationInfo, type ToastResult } from './lib/admin-base.ts';

const CASE_TOTAL = 87;

interface WhiteDataRow {
  label: string;
  text: string;
  ids: number[];
}

interface ConvoDataRow {
  label: string;
  playerId: string;
  start: string;
  end: string;
  type: string;
  display: string;
  count: number;
}

const CONVO_ROWS: ConvoDataRow[] = [
  { label: 'D1', playerId: '14', start: '2026-10-26', end: '2026-11-09', type: 'Normal', display: 'NORMAL', count: 6 },
  { label: 'D2', playerId: '5519', start: '2026-10-15', end: '2026-10-28', type: 'Auto Greeting', display: 'Auto Greeting', count: 1 },
  { label: 'D3', playerId: '1460', start: '2026-07-30', end: '2026-08-12', type: 'Group Messaging', display: 'Group Messaging', count: 1 },
];

const LOCALE_LABELS: Record<string, string> = {
  en: '英语区',
  in: '印尼语区',
  th: '泰国区',
  vi: '越南区',
  ar: '阿拉伯语区',
  zh: '中文区',
  ko: '韩国区',
  ph: '菲律宾区',
};

function localeCode(display: string): string {
  const m = display.match(/\(([a-z]{2})\)/i);
  return m ? m[1].toLowerCase() : '';
}

function localeLabel(display: string): string {
  const code = localeCode(display);
  return LOCALE_LABELS[code] ?? '';
}

function timeToEpoch(display: string): number {
  return new Date(display.replace(' ', 'T') + '+08:00').getTime();
}

class ImageWhiteUnsendTest extends AdminBase {
  private candidates: Candidate[] = [];
  private adminUser = process.env.ADMIN_USERNAME ?? '';
  private sessionUser: Candidate | null = null;
  private blockedNotes: string[] = [];

  constructor() {
    super('lita-admin-3710-image-white-unsend');
  }

  protected async run(): Promise<void> {
    this.total = CASE_TOTAL;
    await this.act('登录 Admin 测试环境', async () => {
      await this.login();
    });
    await this.act('BD-01 采集真实用户样本（陪玩师管理列表，只读）', async () => {
      this.candidates = await this.collectCandidates(600);
    });
    await this.act('前置清理：删除本账号上一轮残留的图片白名单行', async () => {
      const result = await this.whiteCleanupByOperator(this.adminUser);
      this.notes.push(`前置清理图片白名单：${JSON.stringify(result)}`);
    });

    try {
      const cases: { no: number; run: () => Promise<void> }[] = [
        { no: 1, run: () => this.case1() },
        { no: 2, run: () => this.case2() },
        { no: 3, run: () => this.case3() },
        { no: 4, run: () => this.case4() },
        { no: 5, run: () => this.case5() },
        { no: 6, run: () => this.case6Blocked() },
        { no: 7, run: () => this.case7() },
        { no: 8, run: () => this.case8() },
        { no: 9, run: () => this.case9() },
        { no: 10, run: () => this.case10() },
        { no: 11, run: () => this.case11() },
        { no: 12, run: () => this.case12() },
        { no: 13, run: () => this.case13() },
        { no: 14, run: () => this.case14() },
        { no: 15, run: () => this.case15() },
        { no: 16, run: () => this.case16() },
        { no: 18, run: () => this.case18() },
        { no: 19, run: () => this.case19to25Blocked() },
        { no: 21, run: () => this.case21() },
        { no: 22, run: () => this.case22() },
        { no: 23, run: () => this.case23() },
        { no: 24, run: () => this.case24() },
        { no: 26, run: () => this.case26() },
        { no: 27, run: () => this.case27() },
        { no: 28, run: () => this.case28() },
      ];
      const from = Number(arg('from', '1'));
      const to = Number(arg('to', '28'));
      this.log(`用例执行范围: ${from}~${to}（默认 1~28，--from/--to 仅自测用）`);
      for (const item of cases) {
        if (item.no >= from && item.no <= to) await item.run();
      }
    } finally {
      await this.act('收尾：清理图片白名单本轮测试行', async () => {
        const result = await this.whiteCleanupByOperator(this.adminUser);
        this.notes.push(`收尾清理图片白名单：${JSON.stringify(result)}`);
      });
      await this.act('收尾：清理会话限制白名单本轮测试用户 S', async () => {
        await this.cleanupSessionUser();
      });
    }
  }

  // ---------- 通用 ----------

  private async chk(title: string, expect: string, real: string, pass?: boolean, message?: string): Promise<void> {
    await this.check(title, async () => ({ expect, real, pass, message }));
  }

  private msgHas(toast: ToastResult, parts: string[]): boolean {
    const text = toast.texts.join(' | ');
    return parts.every((p) => text.includes(p));
  }

  private async errorToastCount(): Promise<number> {
    return this.p.locator('.el-message--error').count();
  }

  private async tableVisible(): Promise<boolean> {
    return this.p.locator('.app-container .el-table').first().isVisible().catch(() => false);
  }

  private async noDataText(): Promise<string> {
    return (await this.p.locator('.app-container .el-table__empty-text').first().innerText().catch(() => '')).trim();
  }

  private async inputValue(placeholder: string): Promise<string> {
    return this.p.locator(`.app-container input[placeholder="${placeholder}"]`).first().inputValue().catch(() => '(missing)');
  }

  private ids(rows: WhiteRow[]): string[] {
    return rows.map((r) => r.id);
  }

  private idsOfSession(rows: SessionRow[]): string[] {
    return rows.map((r) => r.userId).filter(Boolean);
  }

  private countAddMessage(toast: ToastResult, added: number, duplicated: number, notFound: number): boolean {
    return this.msgHas(toast, [`新增 ${added}`, `重复 ${duplicated}`, `不存在 ${notFound}`]);
  }

  private async cleanupWhite(): Promise<void> {
    const result = await this.whiteCleanupByOperator(this.adminUser);
    this.notes.push(`用例级清理图片白名单：${JSON.stringify(result)}`);
  }

  private async cleanupSessionUser(): Promise<void> {
    if (!this.sessionUser) return;
    await this.gotoSession();
    await this.sessionSearch(String(this.sessionUser.id));
    const rows = await this.sessionRows();
    if (rows.length > 0) {
      await this.sessionDeleteFirstRow();
    }
    await this.sessionSearch(String(this.sessionUser.id));
    const after = await this.sessionRows();
    this.notes.push(`收尾清理会话限制白名单 S=${this.sessionUser.id}：剩余 ${after.length} 行`);
  }

  // ---------- #1 入口 ----------

  private async case1(): Promise<void> {
    await this.act('用例#1 步骤：菜单进入用户发图片白名单', async () => {
      await this.gotoWhite();
    });
    const hash = await this.p.evaluate(() => location.hash);
    const title = await this.p.title();
    const visible = await this.p.evaluate(() => {
      const q = (sel: string) => document.querySelectorAll(sel).length;
      return {
        locale: q('.app-container input[placeholder="Locale"]'),
        id: q('.app-container input[placeholder="ID"]'),
        no: q('.app-container input[placeholder="NO"]'),
        search: Array.from(document.querySelectorAll('.app-container button')).some((b) => (b.textContent ?? '').trim() === 'Search'),
        reset: Array.from(document.querySelectorAll('.app-container button')).some((b) => (b.textContent ?? '').trim() === 'Reset Filters'),
        add: Array.from(document.querySelectorAll('.app-container button')).some((b) => (b.textContent ?? '').trim() === '添加'),
      };
    });
    const values = {
      locale: await this.inputValue('Locale'),
      id: await this.inputValue('ID'),
      no: await this.inputValue('NO'),
    };
    await this.check('用例#1-① 路由为 #/user-manager/user-image-white', async () => ({ expect: WHITE_HASH, real: hash }));
    await this.check('用例#1-② 页面标题显示「用户发图片白名单」', async () => ({
      expect: '用户发图片白名单 - Lita Admin',
      real: title,
    }));
    await this.check('用例#1-③ Locale/ID/NO/Search/Reset Filters/添加均可见且默认值为空', async () => {
      const ok = visible.locale === 1 && visible.id === 1 && visible.no === 1 && visible.search && visible.reset && visible.add && values.locale === '' && values.id === '' && values.no === '';
      return {
        expect: '控件全部可见；三个筛选值均为空',
        real: `locale=${visible.locale},id=${visible.id},no=${visible.no},search=${visible.search},reset=${visible.reset},add=${visible.add};values=${values.locale}|${values.id}|${values.no}`,
        pass: ok,
      };
    });
  }

  // ---------- #2 Locale 筛选 ----------

  private async case2(): Promise<void> {
    const first = this.candidates[0];
    const label = localeLabel(first.locale);
    const other = this.candidates.find((c) => c.id !== first.id && c.locale && c.locale !== first.locale && localeLabel(c.locale) && c.locale !== '');
    if (!other || !label) throw new Error(`BD-02 样本不足：first=${first.id}/${first.locale}, other=${other?.id}/${other?.locale}`);
    const otherLabel = localeLabel(other.locale);
    await this.act('用例#2 前置：页面添加两个不同 Locale 的真实用户', async () => {
      await this.gotoWhite();
      await this.whiteAdd(`${first.id}\n${other.id}`);
    });
    await this.act('用例#2 步骤：按 Locale 筛选、清空、再筛选、重置', async () => {
      await this.gotoWhite();
      await this.whiteSearch({ locale: label });
    });
    const filter1 = await this.whiteRows();
    const filter1Value = await this.inputValue('Locale');
    await this.act('用例#2 步骤：清空 Locale 后 Search', async () => {
      await this.whiteClearSelects();
      await this.whiteSearch({});
    });
    const cleared = await this.whiteRows();
    const clearedValue = await this.inputValue('Locale');
    await this.act('用例#2 步骤：再次按 L 筛选', async () => {
      await this.whiteSearch({ locale: label });
    });
    const filter2 = await this.whiteRows();
    await this.act('用例#2 步骤：点击 Reset Filters', async () => {
      await this.whiteReset();
    });
    const reset = await this.whiteRows();
    const resetValue = await this.inputValue('Locale');

    await this.check('用例#2-① 两次按 L 筛选后每行 Locale 均为 L 且包含目标行', async () => {
      const ok1 = filter1.length > 0 && filter1.every((r) => r.locale === first.locale) && filter1.some((r) => r.id === String(first.id));
      const ok2 = filter2.length > 0 && filter2.every((r) => r.locale === first.locale) && filter2.some((r) => r.id === String(first.id));
      return {
        expect: `两次筛选均仅 ${first.locale} 且含 ${first.id}`,
        real: `filter1=[${filter1.map((r) => `${r.id}:${r.locale}`).join(',')}],filter2=[${filter2.map((r) => `${r.id}:${r.locale}`).join(',')}]`,
        pass: ok1 && ok2,
      };
    });
    await this.check('用例#2-② 两次结果均不包含另一 Locale 的行', async () => {
      const bad1 = filter1.filter((r) => r.locale === other.locale || r.id === String(other.id));
      const bad2 = filter2.filter((r) => r.locale === other.locale || r.id === String(other.id));
      return {
        expect: `不出现 ${other.id}/${other.locale}`,
        real: `filter1其他=${bad1.length},filter2其他=${bad2.length}`,
        pass: bad1.length === 0 && bad2.length === 0,
      };
    });
    await this.check('用例#2-③ 清空与重置后 Locale 为空且默认列表两类行均可见', async () => {
      const hasBoth = (rows: WhiteRow[]) => rows.some((r) => r.id === String(first.id)) && rows.some((r) => r.id === String(other.id));
      const ok = clearedValue === '' && resetValue === '' && hasBoth(cleared) && hasBoth(reset);
      return {
        expect: `清空/重置后 Locale 为空，且含 ${first.id} 与 ${other.id}`,
        real: `clearLocale='${clearedValue}',resetLocale='${resetValue}',clearIds=[${this.ids(cleared)}],resetIds=[${this.ids(reset)}]`,
        pass: ok,
      };
    });
    await this.act('用例#2 清理：删除本次两个白名单行', async () => {
      await this.cleanupWhite();
    });
  }

  // ---------- #3 ID 筛选 ----------

  private async case3(): Promise<void> {
    const exist = this.candidates[1];
    const absent = '999999999';
    await this.act('用例#3 前置：页面添加 ID 样本', async () => {
      await this.gotoWhite();
      await this.whiteAdd(String(exist.id));
    });
    await this.act('用例#3 步骤：D1 按存在 ID 精确查询', async () => {
      await this.gotoWhite();
      await this.whiteSearch({ id: String(exist.id) });
    });
    const d1 = await this.whiteRows();
    const d1Error = await this.errorToastCount();
    const d1Table = await this.tableVisible();
    await this.act('用例#3 步骤：D2 按不存在 ID 查询', async () => {
      await this.whiteSearch({ id: absent });
    });
    const d2 = await this.whiteRows();
    const d2NoData = await this.noDataText();
    const d2Error = await this.errorToastCount();
    const d2Table = await this.tableVisible();

    await this.check('用例#3-①[D1] 存在 ID 查询恰有 1 行', async () => ({
      expect: '1',
      real: String(d1.length),
      pass: d1.length === 1,
    }));
    await this.check('用例#3-②[D1] ID 列为存在样本值', async () => ({
      expect: String(exist.id),
      real: d1[0]?.id ?? '(无行)',
      pass: d1.length === 1 && d1[0]?.id === String(exist.id),
    }));
    await this.check('用例#3-③[D1] 页面无错误提示', async () => ({
      expect: '无错误提示',
      real: `errors=${d1Error},tableVisible=${d1Table}`,
      pass: d1Error === 0 && d1Table,
    }));
    await this.check('用例#3-①[D2] 不存在 ID 查询为 0 行并显示 No Data', async () => ({
      expect: '0 行; No Data',
      real: `${d2.length} 行; ${d2NoData}`,
      pass: d2.length === 0 && d2NoData.includes('No Data'),
    }));
    await this.check('用例#3-②[D2] 不显示其他 ID', async () => ({
      expect: '0',
      real: String(d2.length),
      pass: d2.length === 0,
    }));
    await this.check('用例#3-③[D2] 页面无错误提示', async () => ({
      expect: '无错误提示',
      real: `errors=${d2Error},tableVisible=${d2Table}`,
      pass: d2Error === 0 && d2Table,
    }));
    await this.act('用例#3 清理：删除本次白名单行', async () => {
      await this.whiteDeleteById(String(exist.id));
    });
  }

  // ---------- #4 NO 筛选 ----------

  private async case4(): Promise<void> {
    const exist = this.candidates[4];
    const absentNo = '999999998';
    await this.act('用例#4 前置：页面添加 NO 样本', async () => {
      await this.gotoWhite();
      await this.whiteAdd(String(exist.id));
    });
    await this.act('用例#4 步骤：D1 按存在 NO 查询', async () => {
      await this.gotoWhite();
      await this.whiteSearch({ no: exist.no });
    });
    const d1 = await this.whiteRows();
    const d1Error = await this.errorToastCount();
    await this.act('用例#4 步骤：D2 按不存在 NO 查询', async () => {
      await this.whiteSearch({ no: absentNo });
    });
    const d2 = await this.whiteRows();
    const d2NoData = await this.noDataText();
    const d2Error = await this.errorToastCount();

    await this.check('用例#4-①[D1] 存在 NO 查询恰有 1 行', async () => ({
      expect: '1',
      real: String(d1.length),
      pass: d1.length === 1,
    }));
    await this.check('用例#4-②[D1] NO 与对应 ID 单元格正确', async () => ({
      expect: `${exist.no} / ${exist.id}`,
      real: d1[0] ? `${d1[0].no} / ${d1[0].id}` : '(无行)',
      pass: d1.length === 1 && d1[0]?.no === exist.no && d1[0]?.id === String(exist.id),
    }));
    await this.check('用例#4-③[D1] 页面无错误提示', async () => ({
      expect: '无错误提示',
      real: `errors=${d1Error}`,
      pass: d1Error === 0,
    }));
    await this.check('用例#4-①[D2] 不存在 NO 查询为 0 行并显示 No Data', async () => ({
      expect: '0 行; No Data',
      real: `${d2.length} 行; ${d2NoData}`,
      pass: d2.length === 0 && d2NoData.includes('No Data'),
    }));
    await this.check('用例#4-②[D2] 不显示其他 NO', async () => ({
      expect: '0',
      real: String(d2.length),
      pass: d2.length === 0,
    }));
    await this.check('用例#4-③[D2] 页面无错误提示', async () => ({
      expect: '无错误提示',
      real: `errors=${d2Error}`,
      pass: d2Error === 0,
    }));
    await this.act('用例#4 清理：删除本次白名单行', async () => {
      await this.whiteDeleteById(String(exist.id));
    });
  }

  // ---------- #5 列表完整资料 ----------

  private async case5(): Promise<void> {
    const target = this.candidates[2];
    await this.act('用例#5 前置：页面添加完整资料用户', async () => {
      await this.gotoWhite();
      await this.whiteAdd(String(target.id));
    });
    await this.act('用例#5 步骤：按 ID 查询目标行', async () => {
      await this.gotoWhite();
      await this.whiteSearch({ id: String(target.id) });
    });
    const rows = await this.whiteRows();
    const headers = await this.headerTexts();
    const row = rows[0];
    await this.shot('case5-target-row');
    await this.check('用例#5-① 表头七列顺序正确', async () => {
      const expected = ['Locale', 'ID', 'NO', 'Nick', 'Add Time', 'Operator', 'Action'];
      return { expect: expected.join('|'), real: headers.join('|'), pass: expected.every((v, i) => headers[i] === v) };
    });
    await this.check('用例#5-② 目标行七字段完整且 Add Time/Operator 非空', async () => {
      const ok = rows.length === 1 && row?.locale === target.locale && row?.id === String(target.id) && row?.no === target.no && (row?.nick ?? '') !== '' && (row?.addTime ?? '') !== '' && (row?.operator ?? '') !== '';
      return {
        expect: `${target.locale}|${target.id}|${target.no}|非空Nick|非空AddTime|非空Operator`,
        real: row ? `${row.locale}|${row.id}|${row.no}|${row.nick}|${row.addTime}|${row.operator}` : '(无行)',
        pass: ok,
      };
    });
    await this.check('用例#5-③ Action 列显示删除操作', async () => ({
      expect: '含删除',
      real: row?.action ?? '(无行)',
      pass: (row?.action ?? '').includes('删除'),
    }));
    await this.act('用例#5 清理：删除本次白名单行', async () => {
      await this.whiteDeleteById(String(target.id));
    });
  }

  // ---------- #6 阻塞取证 ----------

  private async case6Blocked(): Promise<void> {
    await this.act('用例#6 阻塞取证：初始白名单无历史资料缺失行', async () => {
      await this.gotoWhite();
      const total = await this.whiteTotal();
      const rows = await this.whiteRows();
      await this.shot('case6-blocked-white-list');
      this.blockedNotes.push(`用例#6 阻塞：BD-04 需要已存在的 M1/M2 白名单行；实测初始 Total=${total.total}、rows=${rows.length}，无历史行；页面无法添加不存在用户，禁止 SQL 造数。`);
      this.notes.push(this.blockedNotes[this.blockedNotes.length - 1]);
      this.log(this.blockedNotes[this.blockedNotes.length - 1]);
    });
  }

  // ---------- #7 分页 ----------

  private async case7(): Promise<void> {
    const list = this.candidates.slice(10, 21);
    await this.act('用例#7 前置：添加 11 个真实用户使 T>D', async () => {
      await this.gotoWhite();
      await this.whiteAdd(list.map((c) => String(c.id)).join('\n'));
    });
    const p1 = await this.whiteTotal();
    const rows1 = await this.whiteRows();
    await this.act('用例#7 步骤：点击下一页', async () => {
      await this.waitListResponse('/api/userImageWhite/list', async () => {
        await this.clickPager('2');
      });
    });
    const rows2 = await this.whiteRows();
    const p2 = await this.whiteTotal();
    await this.act('用例#7 步骤：每页条数选择 20/page', async () => {
      await this.waitListResponse('/api/userImageWhite/list', async () => {
        await this.selectPageSize('20/page');
      });
    });
    const p4 = await this.whiteTotal();
    const rows4 = await this.whiteRows();
    await this.shot('case7-pagination');

    await this.check('用例#7-① 初始分页 Total=T/第1页/每页D条', async () => ({
      expect: `total=${list.length},current=1,pageSize=10/page`,
      real: `total=${p1.total},current=${p1.current},pageSize=${p1.pageSize}`,
      pass: p1.total === list.length && p1.current === '1' && p1.pageSize === '10/page',
    }));
    await this.check('用例#7-② 第一页行数为 D 且 ID 集合一致', async () => {
      const ids1 = this.ids(rows1);
      const expectedIds = list.map((c) => String(c.id));
      return {
        expect: `10 行且属于 BD-05 的 11 个 ID`,
        real: `${rows1.length} 行 / [${ids1}]`,
        pass: rows1.length === 10 && new Set(ids1).size === 10 && ids1.every((id) => expectedIds.includes(id)),
      };
    });
    await this.check('用例#7-③ 下一页为第 2 页且行数与第一页不重复', async () => {
      const ids1 = this.ids(rows1);
      const ids2 = this.ids(rows2);
      const overlap = ids1.filter((id) => ids2.includes(id));
      const expectedIds = list.map((c) => String(c.id));
      const remaining = expectedIds.filter((id) => !ids1.includes(id));
      return {
        expect: `current=2,rows=${list.length - 10},overlap=0`,
        real: `current=${p2.current},rows=${rows2.length},overlap=[${overlap}],ids2=[${ids2}]`,
        pass: p2.current === '2' && rows2.length === list.length - 10 && overlap.length === 0 && setEquals(ids2, remaining),
      };
    });
    await this.check('用例#7-④ 切换 S=20/page 后回第 1 页、Total=T、行数 min(S,T)', async () => {
      // total=11、20/page 只有 1 页，el-pagination 按 hide-on-single-page 隐藏；
      // 此时“当前页”不可见，但仅有一个分页即第 1 页，以 Total/行数/ID 集合等价判定。
      const paginationVisible = await this.p.locator('.el-pagination').first().isVisible().catch(() => false);
      const currentOk = p4.current === '1' || (!paginationVisible && p4.total === list.length);
      return {
        expect: `current=1（单页隐藏时以 Total/T 等价）,total=${list.length},rows=${Math.min(20, list.length)}`,
        real: `current=${p4.current || '(hidden)'},total=${p4.total},rows=${rows4.length},pagesVisible=${paginationVisible}`,
        pass: currentOk && p4.total === list.length && rows4.length === Math.min(20, list.length) && new Set(this.ids(rows4)).size === list.length,
      };
    });
    await this.act('用例#7 清理：删除本次 11 个白名单行', async () => {
      await this.cleanupWhite();
    });
  }

  // ---------- #8 批量分隔符 ----------

  private async case8(): Promise<void> {
    const base = this.candidates.slice(21, 33);
    const rows: WhiteDataRow[] = [
      { label: 'D1', text: `${base[0].id}\n${base[1].id}\n${base[2].id}`, ids: [base[0].id, base[1].id, base[2].id] },
      { label: 'D2', text: `${base[3].id},${base[4].id},${base[5].id}`, ids: [base[3].id, base[4].id, base[5].id] },
      { label: 'D3', text: `${base[6].id} ${base[7].id} ${base[8].id}`, ids: [base[6].id, base[7].id, base[8].id] },
      { label: 'D4', text: `${base[9].id},\n${base[10].id} ${base[11].id}`, ids: [base[9].id, base[10].id, base[11].id] },
    ];
    for (const data of rows) {
      const tBefore = (await this.gotoWhite(), (await this.whiteTotal()).total);
      const toast = await this.act2Add(data.text);
      const tAfter = await this.whiteTotal();
      const searchResults: { id: number; rows: WhiteRow[] }[] = [];
      for (const id of data.ids) {
        await this.whiteSearch({ id: String(id) });
        searchResults.push({ id, rows: await this.whiteRows() });
      }
      const resultText = searchResults.map((r) => `${r.id}:${r.rows.length}:${r.rows[0]?.id ?? '-'}`).join(',');
      await this.check(`用例#8-①[${data.label}] 新增 3/重复 0/不存在 0`, async () => ({
        expect: '新增 3，重复 0，不存在 0',
        real: toast.texts.join(' | ') || '(无提示)',
        pass: this.countAddMessage(toast, 3, 0, 0),
      }));
      await this.check(`用例#8-②[${data.label}] 列表总数较添加前增加 3`, async () => ({
        expect: String(tBefore + 3),
        real: `${tAfter.total}（rows=${tAfter.rows}）`,
        pass: tAfter.total === tBefore + 3,
      }));
      await this.check(`用例#8-③[${data.label}] 三个 UID 分别查询均只显示对应 1 行`, async () => ({
        expect: '3 个查询各 1 行且 ID 对应',
        real: resultText,
        pass: searchResults.every((r) => r.rows.length === 1 && r.rows[0]?.id === String(r.id)),
      }));
      await this.act(`用例#8[${data.label}] 清理：删除本次 3 个白名单行`, async () => {
        await this.cleanupWhite();
      });
    }
  }

  private async act2Add(text: string): Promise<ToastResult> {
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#8 步骤：提交当前数据行批量添加', async () => {
      toast = await this.whiteAdd(text);
    });
    return toast;
  }

  // ---------- #9 500 上限 ----------

  private async case9(): Promise<void> {
    const list = this.candidates.slice(100, 600);
    const tBefore = (await this.gotoWhite(), (await this.whiteTotal()).total);
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#9 步骤：单次提交 500 个真实 UID', async () => {
      toast = await this.whiteAdd(list.map((c) => String(c.id)).join('\n'));
    });
    const tAfter = await this.whiteTotal();
    const samples = [list[0], list[Math.floor(list.length / 2)], list[list.length - 1]];
    const sampleResults: { id: number; rows: WhiteRow[] }[] = [];
    for (const sample of samples) {
      await this.whiteSearch({ id: String(sample.id) });
      sampleResults.push({ id: sample.id, rows: await this.whiteRows() });
    }
    await this.shot('case9-500-result');
    await this.check('用例#9-① 结果提示新增 500/重复 0/不存在 0', async () => ({
      expect: '新增 500，重复 0，不存在 0',
      real: toast.texts.join(' | ') || '(无提示)',
      pass: this.countAddMessage(toast, 500, 0, 0),
    }));
    await this.check('用例#9-② 列表总数为 T+500', async () => ({
      expect: String(tBefore + 500),
      real: `total=${tAfter.total}（rows=${tAfter.rows}）`,
      pass: tAfter.total === tBefore + 500,
    }));
    await this.check('用例#9-③ 首/中/尾三个样本各只显示对应 1 行', async () => ({
      expect: '3 个样本各 1 行且 ID 对应',
      real: sampleResults.map((r) => `${r.id}:${r.rows.length}:${r.rows[0]?.id ?? '-'}`).join(','),
      pass: sampleResults.every((r) => r.rows.length === 1 && r.rows[0]?.id === String(r.id)),
    }));
    await this.act('用例#9 清理：页面删除本次 500 行', async () => {
      await this.cleanupWhite();
    });
  }

  // ---------- #10 501 上限 ----------

  private async case10(): Promise<void> {
    const tBefore = (await this.gotoWhite(), await this.whiteTotal());
    const dummy = Array.from({ length: 501 }, (_, i) => String(900000001 + i));
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#10 步骤：输入 501 个 UID 并确认', async () => {
      toast = await this.whiteAttemptAdd(dummy.join('\n'));
    });
    const tAfter = await this.whiteTotal();
    const text = toast.texts.join(' ');
    await this.shot('case10-501-blocked');
    await this.check('用例#10-① 页面出现错误提示', async () => ({
      expect: '错误提示可见',
      real: toast.texts.join(' | ') || '(无提示)',
      pass: toast.texts.length > 0 || toast.errors.length > 0,
    }));
    await this.check('用例#10-② 提示明确表达单次最多添加 500 个用户', async () => ({
      expect: '含「单次最多添加」与「500」',
      real: text || '(无提示)',
      pass: text.includes('单次最多添加') && text.includes('500'),
    }));
    await this.check('用例#10-③ 列表总数与行集合不变', async () => ({
      expect: `total=${tBefore.total},rows=${tBefore.rows}`,
      real: `total=${tAfter.total},rows=${tAfter.rows}`,
      pass: tAfter.total === tBefore.total && tAfter.rows === tBefore.rows,
    }));
    await this.act('用例#10 清理：取消添加弹窗', async () => {
      await this.whiteCancelAdd();
    });
  }

  // ---------- #11 去重与幂等 ----------

  private async case11(): Promise<void> {
    const a = this.candidates[33];
    const b = this.candidates[34];
    const tBefore = (await this.gotoWhite(), (await this.whiteTotal()).total);
    let toast1: ToastResult = { texts: [], errors: [] };
    let toast2: ToastResult = { texts: [], errors: [] };
    await this.act('用例#11 步骤：首次提交 A,A,B', async () => {
      toast1 = await this.whiteAdd(`${a.id},${a.id},${b.id}`);
    });
    await this.act('用例#11 步骤：再次提交 A,A,B', async () => {
      toast2 = await this.whiteAdd(`${a.id},${a.id},${b.id}`);
    });
    await this.whiteReset();
    const totalAfter = await this.whiteTotal();
    const searchA = (await this.whiteSearch({ id: String(a.id) }), await this.whiteRows());
    const searchB = (await this.whiteSearch({ id: String(b.id) }), await this.whiteRows());

    await this.check('用例#11-① 首次新增 2/重复 0/不存在 0', async () => ({
      expect: '新增 2，重复 0，不存在 0',
      real: toast1.texts.join(' | ') || '(无提示)',
      pass: this.countAddMessage(toast1, 2, 0, 0),
    }));
    await this.check('用例#11-② 第二次新增 0/重复 2/不存在 0', async () => ({
      expect: '新增 0，重复 2，不存在 0',
      real: toast2.texts.join(' | ') || '(无提示)',
      pass: this.countAddMessage(toast2, 0, 2, 0),
    }));
    await this.check('用例#11-③ A、B 各 1 行且总数仅增加 2', async () => ({
      expect: `A=1,B=1,total=${tBefore + 2}`,
      real: `A=${searchA.length},B=${searchB.length},total=${totalAfter.total}`,
      pass: searchA.length === 1 && searchA[0]?.id === String(a.id) && searchB.length === 1 && searchB[0]?.id === String(b.id) && totalAfter.total === tBefore + 2,
    }));
    await this.act('用例#11 清理：删除 A/B', async () => {
      await this.cleanupWhite();
    });
  }

  // ---------- #12 非数字 UID ----------

  private async case12(): Promise<void> {
    const tBefore = (await this.gotoWhite(), await this.whiteTotal());
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#12 步骤：输入 abc 并确认', async () => {
      toast = await this.whiteAttemptAdd('abc');
    });
    const dialogCount = await this.p.locator('.el-dialog:visible').count();
    const tAfter = await this.whiteTotal();
    const text = toast.texts.join(' ');
    await this.check('用例#12-① 出现用户 ID 格式错误提示并指出 abc', async () => ({
      expect: '含「用户ID格式错误」与「abc」',
      real: text || '(无提示)',
      pass: text.includes('用户ID格式错误') && text.includes('abc'),
    }));
    await this.check('用例#12-② 添加弹窗仍打开', async () => ({
      expect: '1',
      real: String(dialogCount),
      pass: dialogCount === 1,
    }));
    await this.check('用例#12-③ 列表总数与行集合不变', async () => ({
      expect: `total=${tBefore.total},rows=${tBefore.rows}`,
      real: `total=${tAfter.total},rows=${tAfter.rows}`,
      pass: tAfter.total === tBefore.total && tAfter.rows === tBefore.rows,
    }));
    await this.act('用例#12 清理：取消添加弹窗', async () => {
      await this.whiteCancelAdd();
    });
  }

  // ---------- #13 真实 + 不存在混合 ----------

  private async case13(): Promise<void> {
    const a = this.candidates[35];
    const n = '999999999';
    const tBefore = (await this.gotoWhite(), (await this.whiteTotal()).total);
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#13 步骤：提交真实 UID + 不存在 UID', async () => {
      toast = await this.whiteAdd(`${a.id},${n}`);
    });
    const searchA = (await this.whiteSearch({ id: String(a.id) }), await this.whiteRows());
    const searchN = (await this.whiteSearch({ id: n }), await this.whiteRows());
    const noDataN = await this.noDataText();
    await this.whiteReset();
    const totalAfter = await this.whiteTotal();
    await this.check('用例#13-① 新增 1/重复 0/不存在 1', async () => ({
      expect: '新增 1，重复 0，不存在 1',
      real: toast.texts.join(' | ') || '(无提示)',
      pass: this.countAddMessage(toast, 1, 0, 1),
    }));
    await this.check('用例#13-② A 查询 1 行，N 查询 No Data', async () => ({
      expect: `A=1(${a.id}),N=0(No Data)`,
      real: `A=${searchA.length}(${searchA[0]?.id ?? '-'}),N=${searchN.length}(${noDataN})`,
      pass: searchA.length === 1 && searchA[0]?.id === String(a.id) && searchN.length === 0 && noDataN.includes('No Data'),
    }));
    await this.check('用例#13-③ 总数较初始仅增加 1', async () => ({
      expect: String(tBefore + 1),
      real: String(totalAfter.total),
      pass: totalAfter.total === tBefore + 1,
    }));
    await this.act('用例#13 清理：删除 A', async () => {
      await this.cleanupWhite();
    });
  }

  // ---------- #14 删除二次确认 ----------

  private async case14(): Promise<void> {
    const target = this.candidates[36];
    await this.act('用例#14 前置：添加待删除行', async () => {
      await this.gotoWhite();
      await this.whiteAdd(String(target.id));
    });
    await this.act('用例#14 步骤：按 ID 查询并点击删除', async () => {
      await this.whiteSearch({ id: String(target.id) });
    });
    const tBefore = await this.whiteTotal();
    let confirm = { text: '', buttons: [] as string[] };
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#14 步骤：二次确认删除', async () => {
      const result = await this.whiteDeleteRow(0);
      confirm = result.confirm;
      toast = result.toast;
    });
    await this.whiteSearch({ id: String(target.id) });
    const afterRows = await this.whiteRows();
    const afterNoData = await this.noDataText();
    const tAfter = await this.whiteTotal();
    await this.shot('case14-after-delete');

    await this.check('用例#14-① 出现二次确认框并提供取消与确认', async () => ({
      expect: `含 ${target.id}；取消/确定`,
      real: `${confirm.text} | ${confirm.buttons.join('/')}`,
      pass: confirm.text.includes(String(target.id)) && confirm.buttons.includes('取消') && confirm.buttons.includes('确定'),
    }));
    await this.check('用例#14-② 确认后目标 ID 查询为 No Data', async () => ({
      expect: '0 行; No Data',
      real: `${afterRows.length} 行; ${afterNoData}`,
      pass: afterRows.length === 0 && afterNoData.includes('No Data'),
    }));
    await this.act('用例#14 步骤：Reset Filters 查看默认列表总数', async () => {
      await this.whiteReset();
    });
    const defaultTotal = await this.whiteTotal();
    await this.check('用例#14-③ 默认列表总数为 T-1', async () => ({
      expect: String(tBefore.total - 1),
      real: `filteredTotal=${tAfter.total},defaultTotal=${defaultTotal.total}`,
      pass: defaultTotal.total === tBefore.total - 1,
    }));
    await this.act('用例#14 清理：确认目标已不存在', async () => {
      const rows = await this.whiteRows();
      if (rows.length > 0) await this.cleanupWhite();
    });
  }

  // ---------- #15 双标签重复删除 ----------

  private async case15(): Promise<void> {
    const target = this.candidates[37];
    await this.act('用例#15 前置：添加目标行并在标签页 A 查询', async () => {
      await this.gotoWhite();
      await this.whiteAdd(String(target.id));
      await this.whiteSearch({ id: String(target.id) });
    });
    const tBefore = await this.whiteTotal();
    const pageB = await this.newPage();
    await this.act('用例#15 前置：标签页 B 加载同一目标行', async () => {
      await this.gotoHash(WHITE_HASH, true, pageB);
      await pageB.locator('.app-container input[placeholder="ID"]').first().fill(String(target.id));
      await Promise.all([
        pageB.waitForResponse((r) => r.url().includes('/api/userImageWhite/list') && r.request().method() === 'GET', { timeout: 45000 }),
        pageB.locator('.app-container button').filter({ hasText: /^\s*Search\s*$/ }).first().click(),
      ]);
      await pageB.locator('.app-container .el-table__body-wrapper tbody tr.el-table__row').first().waitFor({ state: 'visible', timeout: 10000 });
    });
    await this.act('用例#15 步骤：标签页 A 删除目标行', async () => {
      await this.whiteDeleteRow(0);
    });
    await this.whiteSearch({ id: String(target.id) });
    const aRows = await this.whiteRows();

    let bConfirm = { text: '', buttons: [] as string[] };
    let bToast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#15 步骤：标签页 B 对旧行再次删除并刷新', async () => {
      const row = pageB.locator('.app-container .el-table__body-wrapper tbody tr.el-table__row').first();
      await row.locator('button').filter({ hasText: /^\s*删除\s*$/ }).first().click();
      await pageB.locator('.el-message-box').first().waitFor({ state: 'visible', timeout: 10000 });
      bConfirm = await pageB.locator('.el-message-box').first().evaluate((box) => ({
        text: (box.querySelector('.el-message-box__message')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        buttons: Array.from(box.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()).filter(Boolean),
      }));
      const delWait = pageB.waitForResponse((r) => r.url().includes('/api/userImageWhite/delete'), { timeout: 45000 }).catch(() => null);
      await pageB.locator('.el-message-box:visible button').filter({ hasText: /^\s*确定\s*$/ }).first().click();
      await delWait;
      await pageB.locator('.el-message').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
      bToast = {
        texts: (await pageB.locator('.el-message').allInnerTexts()).map((t) => t.trim()).filter(Boolean),
        errors: (await pageB.locator('.el-message--error').allInnerTexts()).map((t) => t.trim()).filter(Boolean),
      };
      await Promise.all([
        pageB.waitForResponse((r) => r.url().includes('/api/userImageWhite/list') && r.request().method() === 'GET', { timeout: 45000 }),
        pageB.locator('.app-container button').filter({ hasText: /^\s*Search\s*$/ }).first().click(),
      ]);
      await pageB.waitForFunction(() => document.querySelectorAll('.app-container .el-table__body-wrapper tbody tr.el-table__row').length === 0, null, { timeout: 10000 }).catch(() => undefined);
      await this.shot('case15-tabB-after-delete', pageB);
    });
    const bRows = await pageB.evaluate(() =>
      Array.from(document.querySelectorAll('.app-container .el-table__body-wrapper tbody tr.el-table__row')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())),
    );
    const bNoData = (await pageB.locator('.app-container .el-table__empty-text').first().innerText().catch(() => '')).trim();
    const bTotal = await pageB.evaluate(() => {
      const text = document.querySelector('.el-pagination__total')?.textContent?.trim() ?? '';
      const m = text.match(/\d+/);
      return m ? Number(m[0]) : document.querySelectorAll('.app-container .el-table__body-wrapper tbody tr.el-table__row').length;
    });

    await this.check('用例#15-① 标签页 A 删除后目标行消失', async () => ({
      expect: '0',
      real: String(aRows.length),
      pass: aRows.length === 0,
    }));
    await this.check('用例#15-② 标签页 B 第二次确认后不出现错误提示', async () => ({
      expect: '0 个错误提示',
      real: `errors=${bToast.errors.length},texts=${bToast.texts.join('|')}`,
      pass: bToast.errors.length === 0,
    }));
    await this.check('用例#15-③ 刷新后目标仍 No Data 且总数为 T-1', async () => ({
      expect: `0 行; No Data; total=${tBefore.total - 1}`,
      real: `${bRows.length} 行; ${bNoData}; total=${bTotal}`,
      pass: bRows.length === 0 && bNoData.includes('No Data') && bTotal === tBefore.total - 1,
    }));
    await pageB.close();
    await this.act('用例#15 清理：确认目标已不存在', async () => {
      const rows = await this.whiteRows();
      if (rows.length > 0) await this.cleanupWhite();
    });
  }

  // ---------- #16 操作留痕 ----------

  private async case16(): Promise<void> {
    const target = this.candidates[38];
    const before = new Date();
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#16 前置：添加真实新 UID', async () => {
      await this.gotoWhite();
      toast = await this.whiteAdd(String(target.id));
    });
    const after = new Date();
    await this.whiteReset();
    await this.whiteSearch({ id: String(target.id) });
    const row = (await this.whiteRows())[0];
    await this.shot('case16-add-time-operator');
    await this.check('用例#16-① Add Time 为年月日时分秒且与本次提交时间一致', async () => {
      const formatOk = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row?.addTime ?? '');
      const epoch = formatOk ? timeToEpoch(row.addTime) : 0;
      const lower = before.getTime() - 2000;
      const upper = after.getTime() + 5000;
      return {
        expect: `${new Date(lower).toISOString()} <= AddTime <= ${new Date(upper).toISOString()}`,
        real: `${row?.addTime ?? '(无行)'} (${epoch ? new Date(epoch).toISOString() : 'invalid'})`,
        pass: formatOk && epoch >= lower && epoch <= upper,
      };
    });
    await this.check('用例#16-② Operator 为当前登录 Admin 用户名', async () => ({
      expect: this.adminUser,
      real: row?.operator ?? '(无行)',
      pass: row?.operator === this.adminUser,
    }));
    await this.act('用例#16 清理：删除本次白名单行', async () => {
      await this.whiteDeleteById(String(target.id));
    });
  }

  // ---------- #18 下拉与默认筛选 ----------

  private async case18(): Promise<void> {
    await this.act('用例#18 步骤：进入聊天记录并查看/展开 Message type', async () => {
      await this.gotoConvo();
    });
    const before = await this.convoDefaults();
    const datesBefore = await this.convoReadDates();
    let options: string[] = [];
    await this.act('用例#18 步骤：展开 Message type 下拉', async () => {
      options = await this.convoOpenTypeOptions();
    });
    const after = await this.convoDefaults();
    const datesAfter = await this.convoReadDates();
    await this.shot('case18-message-type');
    await this.check('用例#18-① 展开前 Message type 为空', async () => ({
      expect: '',
      real: before.type,
      pass: before.type === '',
    }));
    await this.check('用例#18-② 下拉选项依次为 Auto Greeting/Group Messaging/Normal/Unsend', async () => {
      const expected = ['Auto Greeting', 'Group Messaging', 'Normal', 'Unsend'];
      return { expect: expected.join('|'), real: options.join('|'), pass: expected.every((v, i) => options[i] === v) };
    });
    await this.check('用例#18-③ 其他筛选为空且日期保持默认范围', async () => {
      const empty = !before.player && !before.user && !before.paid && !before.firstPaid && !before.cinta;
      const unchanged = datesBefore.start === datesAfter.start && datesBefore.end === datesAfter.end && datesBefore.start !== '';
      return {
        expect: '其他筛选为空；日期未变化且非空',
        real: `player='${before.player}',user='${before.user}',paid='${before.paid}',firstPaid='${before.firstPaid}',cinta='${before.cinta}',dates=${datesBefore.start}~${datesBefore.end}->${datesAfter.start}~${datesAfter.end}`,
        pass: empty && unchanged,
      };
    });
  }

  // ---------- #19/#20/#25 阻塞取证 ----------

  private async case19to25Blocked(): Promise<void> {
    await this.act('用例#19/#20/#25 阻塞取证：UNSEND 数据为空且筛选无结果', async () => {
      await this.gotoConvo();
      await this.convoSearch({ playerId: '14', start: '2026-10-26', end: '2026-11-09', type: 'Unsend' });
      const rows = await this.convoRows();
      const noData = await this.noDataText();
      await this.shot('case19-25-unsend-empty');
      const note = `用例#19/#20/#25 阻塞：player_message.biz='UNSEND' 只读计数=0、im_message.status=6 计数=0；页面 player 14 + Unsend + 默认日期查询 ${rows.length} 行（${noData}），无真实撤回数据。`;
      this.blockedNotes.push(note);
      this.notes.push(note);
      this.log(note);
    });
  }

  // ---------- #21 既有类型回归 ----------

  private async case21(): Promise<void> {
    for (const data of CONVO_ROWS) {
      await this.act(`用例#21[${data.label}] 步骤：筛选 ${data.type}`, async () => {
        await this.gotoConvo();
        await this.convoSearch({ playerId: data.playerId, start: data.start, end: data.end, type: data.type });
      });
      const rows = await this.convoRows();
      const types = [...new Set(rows.map((r) => r.type))];
      await this.check(`用例#21-①[${data.label}] 列表行数等于 BD-14 记录 K 且大于 0`, async () => ({
        expect: String(data.count),
        real: String(rows.length),
        pass: rows.length === data.count && rows.length > 0,
      }));
      await this.check(`用例#21-②[${data.label}] 每行 message type 均为对应展示值`, async () => ({
        expect: data.display,
        real: types.join('|') || '(无行)',
        pass: rows.length > 0 && rows.every((r) => r.type === data.display),
      }));
      await this.check(`用例#21-③[${data.label}] 不出现其他消息类型且页面无错误提示`, async () => {
        const errors = await this.errorToastCount();
        return {
          expect: `仅 ${data.display}; 无错误`,
          real: `${types.join('|') || '(无行)'}; errors=${errors}`,
          pass: types.length === 1 && types[0] === data.display && errors === 0,
        };
      });
    }
  }

  // ---------- #22 必填校验 ----------

  private async case22(): Promise<void> {
    await this.act('用例#22 步骤：清空筛选后直接 Search', async () => {
      await this.gotoConvo();
      await this.clearToasts();
      await this.clickButton('Search');
    });
    const toast = await this.readToasts(4000);
    const rows = await this.convoRows();
    const values = await this.convoDefaults();
    await this.check('用例#22-① 页面提示原文「player id or user id 必须填一个」', async () => ({
      expect: 'player id or user id 必须填一个',
      real: toast.texts.join(' | ') || '(无提示)',
      pass: toast.texts.some((t) => t === 'player id or user id 必须填一个'),
    }));
    await this.check('用例#22-② 不展示查询结果且原筛选值不被修改', async () => ({
      expect: 'rows=0; player/user 为空',
      real: `rows=${rows.length};player='${values.player}',user='${values.user}'`,
      pass: rows.length === 0 && values.player === '' && values.user === '',
    }));
  }

  // ---------- #23 跨度校验 ----------

  private async case23(): Promise<void> {
    await this.act('用例#23 步骤：输入 2026-10-01~2026-11-09 并 Search', async () => {
      await this.gotoConvo();
      await this.convoSetDates('2026-10-01', '2026-11-09');
      await this.fillByPlaceholder('Player ID', '14');
      await this.clearToasts();
      await this.clickButton('Search');
    });
    const toast = await this.readToasts(4000);
    const dates = await this.convoReadDates();
    const rows = await this.convoRows();
    await this.check('用例#23-① 页面提示原文「时间跨度不能大于14天」', async () => ({
      expect: '时间跨度不能大于14天',
      real: toast.texts.join(' | ') || '(无提示)',
      pass: toast.texts.some((t) => t === '时间跨度不能大于14天'),
    }));
    await this.check('用例#23-② 不展示查询结果且输入条件保留', async () => ({
      expect: `rows=0; dates=2026-10-01~2026-11-09`,
      real: `rows=${rows.length}; dates=${dates.start}~${dates.end}`,
      pass: rows.length === 0 && dates.start === '2026-10-01' && dates.end === '2026-11-09',
    }));
  }

  // ---------- #24 反向日期 ----------

  private async case24(): Promise<void> {
    let toast: ToastResult = { texts: [], errors: [] };
    await this.act('用例#24 步骤：输入开始 2026-11-09、结束 2026-10-26 并 Search', async () => {
      await this.gotoConvo();
      await this.convoSetDates('2026-11-09', '2026-10-26');
      await this.fillByPlaceholder('Player ID', '14');
      await this.clearToasts();
      await this.clickButton('Search');
      await this.p.waitForFunction(() => {
        const s = document.querySelector('.app-container input[placeholder="开始日期"]') as HTMLInputElement | null;
        const e = document.querySelector('.app-container input[placeholder="结束日期"]') as HTMLInputElement | null;
        return !!s && !!e && s.value !== '' && s.value === e.value;
      }, null, { timeout: 8000 }).catch(() => undefined);
      toast = await this.readToasts(3000);
    });
    const dates = await this.convoReadDates();
    const tableVisible = await this.tableVisible();
    await this.check('用例#24-① Search 后开始与结束日期均为 2026-11-09', async () => ({
      expect: '2026-11-09 ~ 2026-11-09',
      real: `${dates.start} ~ ${dates.end}`,
      pass: dates.start === '2026-11-09' && dates.end === '2026-11-09',
    }));
    await this.check('用例#24-② 无日期错误提示且主内容区/结果表格可见', async () => ({
      expect: 'errors=0; tableVisible=true',
      real: `errors=${toast.errors.length}; tableVisible=${tableVisible}; texts=${toast.texts.join('|')}`,
      pass: toast.errors.length === 0 && tableVisible,
    }));
  }

  // ---------- #26 图片/会话隔离 ----------

  private async case26(): Promise<void> {
    const isolate = this.candidates[39];
    const historyBefore = await this.sessionHistory();
    await this.act('用例#26 前置：仅将 I 加入图片白名单并确认图片页 1 行', async () => {
      await this.gotoWhite();
      await this.whiteAdd(String(isolate.id));
      await this.whiteSearch({ id: String(isolate.id) });
    });
    const imageRows = await this.whiteRows();
    await this.act('用例#26 步骤：会话限制白名单按 I 查询并 Reset', async () => {
      await this.gotoSession();
      await this.sessionSearch(String(isolate.id));
    });
    const searchRows = await this.sessionRows();
    const searchNoData = await this.noDataText();
    const searchTotal = await this.sessionTotal();
    await this.act('用例#26 步骤：点击 Reset Filters', async () => {
      await this.sessionReset();
    });
    const resetRows = await this.sessionRows();
    const resetTotal = await this.sessionTotal();
    const resetNoData = await this.noDataText();
    const historyAfter = await this.sessionHistory();
    await this.shot('case26-session-isolation');

    await this.check('用例#26-① 会话页查询 I 为 No Data 且不出现 I', async () => ({
      expect: '0 行; No Data',
      real: `${searchRows.length} 行; ${searchNoData}; total=${searchTotal.total}`,
      pass: imageRows.length === 1 && searchRows.length === 0 && searchNoData.includes('No Data'),
    }));
    await this.check('用例#26-② 重置后默认列表总数仍为 T 且不包含 I', async () => ({
      expect: `total=${historyBefore.total},默认列表*,不含 ${isolate.id}`,
      real: `resetRows=${resetRows.length},resetTotal=${resetTotal.total},empty='${resetNoData}',含I=${resetRows.some((r) => r.userId === String(isolate.id))}`,
      pass: resetTotal.total === historyBefore.total && resetRows.length > 0 && !resetRows.some((r) => r.userId === String(isolate.id)),
      message: 'Reset Filters 仅清空 USER ID 输入，不触发列表刷新（与 origin/dev 源文件 im-white.vue 一致），按用例字面步骤无法观察默认列表；已作为用例问题反馈',
    }));
    await this.check('用例#26-③ 历史行集合保持不变且页面无错误提示', async () => {
      const same = historyBefore.total === historyAfter.total && historyAfter.ids.length === historyBefore.ids.length && historyAfter.ids.every((id) => historyBefore.ids.includes(id));
      const errors = await this.errorToastCount();
      return {
        expect: `total=${historyBefore.total},ids 不变,errors=0`,
        real: `total=${historyAfter.total},ids=${historyAfter.ids.length},errors=${errors}`,
        pass: same && errors === 0,
      };
    });
    await this.act('用例#26 清理：从图片白名单删除 I', async () => {
      await this.whiteDeleteById(String(isolate.id));
    });
  }

  // ---------- #27 会话分页回归 ----------

  private async case27(): Promise<void> {
    const history = await this.sessionHistory();
    await this.act('用例#27 步骤：读取初始分页', async () => {
      await this.gotoSession();
    });
    const p1 = await this.sessionTotal();
    const rows1 = await this.sessionRows();
    await this.act('用例#27 步骤：点击第 2 页', async () => {
      await this.waitListResponse('/api/imUserWhite/list', async () => {
        await this.clickPager('2');
      });
    });
    const p2 = await this.sessionTotal();
    const rows2 = await this.sessionRows();
    await this.act('用例#27 步骤：返回第 1 页', async () => {
      await this.waitListResponse('/api/imUserWhite/list', async () => {
        await this.clickPager('1');
      });
    });
    const rows1b = await this.sessionRows();
    await this.shot('case27-session-pagination');
    await this.check('用例#27-① 初始 Total=T、10/page、第 1 页 10 行且 ID 集合一致', async () => ({
      expect: `total=${history.total},current=1,10/page,rows=${rows1.length}`,
      real: `total=${p1.total},current=${p1.current},${p1.pageSize},rows=${rows1.length}`,
      pass: p1.total === history.total && p1.current === '1' && p1.pageSize === '10/page' && rows1.length === 10 && this.idsOfSession(rows1).every((id) => history.page1.includes(id)),
    }));
    await this.check('用例#27-② 第 2 页行数 T-10、ID 集合一致且不与第一页重复', async () => {
      const ids2 = this.idsOfSession(rows2);
      const overlap = ids2.filter((id) => history.page1.includes(id));
      return {
        expect: `current=2,rows=${history.total - 10},overlap=0`,
        real: `current=${p2.current},rows=${rows2.length},overlap=[${overlap}],total=${p2.total}`,
        pass: p2.current === '2' && rows2.length === history.total - 10 && overlap.length === 0 && ids2.every((id) => history.page2.includes(id)) && p2.total === history.total,
      };
    });
    await this.check('用例#27-③ 返回第 1 页后行数与 ID 集合和初始一致', async () => {
      const ids1 = this.idsOfSession(rows1);
      const ids1b = this.idsOfSession(rows1b);
      return {
        expect: `rows=${rows1.length};ids 一致`,
        real: `rows=${rows1b.length};ids1=[${ids1}];ids1b=[${ids1b}]`,
        pass: rows1b.length === rows1.length && ids1b.length === ids1.length && ids1b.every((id) => ids1.includes(id)),
      };
    });
  }

  // ---------- #28 会话增删回归 ----------

  private async case28(): Promise<void> {
    const s = this.candidates[40];
    this.sessionUser = s;
    const historyBefore = await this.sessionHistory();
    await this.act('用例#28 步骤：批量新增 S 并查询', async () => {
      await this.gotoSession();
      await this.sessionAdd(String(s.id));
    });
    const totalAfterAdd = await this.sessionTotal();
    await this.act('用例#28 步骤：按 S 查询新增行', async () => {
      await this.sessionSearch(String(s.id));
    });
    const rowsAfterAdd = await this.sessionRows();
    const addRow = rowsAfterAdd[0];
    await this.act('用例#28 步骤：删除 S 行', async () => {
      await this.sessionDeleteFirstRow();
    });
    await this.sessionSearch(String(s.id));
    const rowsAfterDelete = await this.sessionRows();
    const noDataAfterDelete = await this.noDataText();
    await this.act('用例#28 步骤：点击 Reset Filters', async () => {
      await this.sessionReset();
    });
    const rowsAfterReset = await this.sessionRows();
    const totalAfterReset = await this.sessionTotal();
    const noDataAfterReset = await this.noDataText();
    const historyAfter = await this.sessionHistory();
    await this.shot('case28-session-add-delete');

    await this.check('用例#28-① 新增后 Total=T+1，S 查询仅 1 行且字段完整', async () => ({
      expect: `total=${historyBefore.total + 1};USER ID=${s.id};createTime/op user 非空`,
      real: `total=${totalAfterAdd.total};rows=${rowsAfterAdd.length};uid='${addRow?.userId ?? ''}',createTime='${addRow?.createTime ?? ''}',opUser='${addRow?.opUser ?? ''}'`,
      pass: totalAfterAdd.total === historyBefore.total + 1 && rowsAfterAdd.length === 1 && addRow?.userId === String(s.id) && (addRow?.createTime ?? '') !== '' && (addRow?.opUser ?? '') !== '',
    }));
    await this.check('用例#28-② 删除后 S 查询不再显示并显示 No Data', async () => ({
      expect: '0 行; No Data',
      real: `${rowsAfterDelete.length} 行; ${noDataAfterDelete}`,
      pass: rowsAfterDelete.length === 0 && noDataAfterDelete.includes('No Data'),
    }));
    await this.check('用例#28-③ 重置后默认列表恢复 T 且历史集合不变', async () => {
      const same = historyAfter.total === historyBefore.total && historyAfter.ids.length === historyBefore.ids.length && historyAfter.ids.every((id) => historyBefore.ids.includes(id));
      return {
        expect: `resetTotal=${historyBefore.total},默认列表;历史集合不变`,
        real: `resetRows=${rowsAfterReset.length},resetTotal=${totalAfterReset.total},empty='${noDataAfterReset}';reloadTotal=${historyAfter.total},ids=${historyAfter.ids.length},历史不变=${same}`,
        pass: totalAfterReset.total === historyBefore.total && rowsAfterReset.length > 0 && same,
        message: 'Reset Filters 仅清空 USER ID 输入，不触发列表刷新（与 origin/dev 源文件 im-white.vue 一致），按用例字面步骤无法恢复默认列表；重新加载后历史集合与 Total 正常，已作为用例问题反馈',
      };
    });
    await this.act('用例#28 清理：确认 S 已不存在', async () => {
      await this.gotoSession();
      await this.sessionSearch(String(s.id));
      const rows = await this.sessionRows();
      if (rows.length > 0) await this.sessionDeleteFirstRow();
      this.sessionUser = null;
    });
  }
}

await new ImageWhiteUnsendTest().execute();
