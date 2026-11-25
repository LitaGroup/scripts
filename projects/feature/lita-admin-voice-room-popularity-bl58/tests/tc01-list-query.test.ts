/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - 列表筛选/展示/排序/分页/空值（用例 #1~#12）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（§4 元素定位、§5 断言映射）
 * 覆盖：#1 USER ID 精确搜索；#2 组合筛选 r1~r3；#3 类型选项收敛；#4 弹窗筛选；#5 大区筛选；
 *       #6 ROOM ID 搜索；#7 重置筛选；#8 空结果；#9 列结构；#10 权重排序；#11 分页联动；#12 空值与 0 值展示
 * 数据隔离：BD-1 套件级共享基准 B1/B2/B3（页面构造，权重 5001/5002/5003），套件结束按权重+操作人清理；
 *           存量 159 条只读，不修改/删除存量配置。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc01-list-query.test.ts [--case=1]
 */
import { join } from 'node:path';
import { AdminBase } from './lib/admin-base.ts';

class ListQueryTest extends AdminBase {
  constructor() {
    super('tc01-list-query', { 1: 3, 2: 4, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1, 9: 2, 10: 2, 11: 3, 12: 2 });
  }

  private stateFile = '';

  protected async run(): Promise<void> {
    const needBaseline = this.needAny([1, 2, 5, 6, 10]);
    await this.act('登录 Admin 测试环境并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-ai.json');
      await this.ensureLoginState(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, this.stateFile);
    });

    if (needBaseline) {
      this.addCleanup('BD-1 基准数据清理（权重 5001/5002/5003 且操作人 qa-ai）', async () => this.cleanupBaseline());
      await this.act('BD-1 页面构造并确认 B1/B2/B3 就绪', async () => this.createBaseline());
    }

    try {
      if (this.wants(1)) await this.case1();
      if (this.wants(2)) await this.case2();
      if (this.wants(3)) await this.case3();
      if (this.wants(4)) await this.case4();
      if (this.wants(5)) await this.case5();
      if (this.wants(6)) await this.case6();
      if (this.wants(7)) await this.case7();
      if (this.wants(8)) await this.case8();
      if (this.wants(9)) await this.case9();
      if (this.wants(10)) await this.case10();
      if (this.wants(11)) await this.case11();
      if (this.wants(12)) await this.case12();
    } finally {
      await this.closeCasePage();
    }
  }

  // ---------------- BD-1 ----------------

  private async createBaseline(): Promise<void> {
    await this.newCasePage(this.stateFile);
    const page = this.page!;
    await this.createRecommendation(page, { locale: '印尼语区', type: '侧边推荐', userId: '23', weight: '5001' });
    await this.createRecommendation(page, { locale: '印尼语区', type: '侧边推荐', roomId: '10100001', weight: '5002' });
    await this.createRecommendation(page, { locale: '菲律宾区', type: '侧边推荐', roomId: '10100001', userId: '23', weight: '5003' });
    await this.resetFilters(page);
    const rows = await this.readRows(page);
    const top3 = rows.slice(0, 3).map((r) => r[7]);
    if (top3.join(',') !== '5003,5002,5001') {
      throw new Error(`BD-1 就绪确认失败：首页前 3 行权重=${top3.join(',')}，期望 5003,5002,5001`);
    }
    await this.shot('BD-1 基准数据就绪（首页前三行 5003/5002/5001）');
    await this.closeCasePage();
  }

  private async cleanupBaseline(): Promise<void> {
    if (!this.browser) return;
    await this.newCasePage(this.stateFile);
    const page = this.page!;
    const targets: Array<[string, string, string, string]> = [
      ['印尼语区', '23', '5001', 'B1'],
      ['印尼语区', '10100001', '5002', 'B2'],
      ['菲律宾区', '23', '5003', 'B3']
    ];
    for (const [locale, keyword, weight, name] of targets) {
      await this.resetFilters(page);
      await this.selectOption(page, page, '地区', locale);
      if (weight === '5002') await this.fillPlaceholder(page, 'ROOM ID', keyword);
      else await this.fillPlaceholder(page, 'USER ID', keyword);
      await this.search(page);
      const rows = await this.readRows(page);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][7] === weight && rows[i][9] === 'qa-ai') {
          await this.deleteRow(page, i);
        }
      }
      this.notes.push(`BD-1 清理 ${name}：筛选 ${locale}+${keyword}，目标权重 ${weight}`);
    }
    await this.resetFilters(page);
    await this.closeCasePage();
  }

  // ---------------- #1 ----------------

  private async case1(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#1 按 USER ID=23 搜索', async () => {
      await this.fillPlaceholder(page, 'USER ID', '23');
      await this.search(page);
    });
    const rows = await this.readRows(page);
    await this.check('用例#1-① USER ID 列每一行均显示 23', async () => {
      const wrong = rows.filter((r) => r[4] !== '23');
      await this.shotEl('.el-table__body-wrapper', 'case1-userid-rows');
      return {
        expect: '每一行 USER ID=23',
        real: `共 ${rows.length} 行；不符合 ${wrong.length} 行${wrong.length ? `：${wrong.map((r) => r[4]).join(',')}` : ''}`,
        pass: wrong.length === 0 && rows.length > 0
      };
    });
    await this.check('用例#1-② B1 行（权重 5001）USER NICK 非空', async () => {
      const b1 = rows.find((r) => r[7] === '5001' && r[4] === '23');
      const nick = b1?.[5] ?? '';
      await this.shotEl('.el-table__body-wrapper', 'case1-b1-nick');
      return { expect: 'B1 行 USER NICK 非空', real: b1 ? `权重=5001，USER NICK=${nick || '(空)'}` : '未找到权重 5001/USER ID=23 的 B1 行' , pass: Boolean(b1 && nick && nick !== '-') };
    });
    await this.check('用例#1-③ 分页总数 ≥1', async () => {
      const total = await this.totalCount(page);
      return { expect: 'Total ≥1', real: `Total=${total}`, pass: total >= 1 };
    });
    await this.closeCasePage();
  }

  // ---------------- #2 ----------------

  private async case2(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    let r1Rows: string[][] = [];
    await this.act('用例#2 执行数据行 r1（印尼语区+USER ID=23）', async () => {
      await this.selectOption(page, page, '地区', '印尼语区');
      await this.fillPlaceholder(page, 'USER ID', '23');
      await this.search(page);
      r1Rows = await this.readRows(page);
    });
    await this.check('用例#2-①[数据行1] 印尼语区+USER ID=23：每行大区=印尼(in)且 USER ID=23', async () => {
      const wrong = r1Rows.filter((r) => !r[1].startsWith('印尼(in)') || r[4] !== '23');
      await this.shotEl('.el-table__body-wrapper', 'case2-r1');
      return { expect: '每行 大区=印尼(in) 且 USER ID=23', real: `共 ${r1Rows.length} 行；不符合 ${wrong.length} 行`, pass: wrong.length === 0 && r1Rows.length > 0 };
    });
    let r2Rows: string[][] = [];
    await this.act('用例#2 执行数据行 r2（侧边推荐+USER ID=23）', async () => {
      await this.resetFilters(page);
      await this.selectOption(page, page, '推荐类型', '侧边推荐');
      await this.fillPlaceholder(page, 'USER ID', '23');
      await this.search(page);
      r2Rows = await this.readRows(page);
    });
    await this.check('用例#2-①[数据行2] 侧边推荐+USER ID=23：每行推荐类型=侧边推荐且 USER ID=23', async () => {
      const wrong = r2Rows.filter((r) => r[6] !== '侧边推荐' || r[4] !== '23');
      await this.shotEl('.el-table__body-wrapper', 'case2-r2');
      return { expect: '每行 推荐类型=侧边推荐 且 USER ID=23', real: `共 ${r2Rows.length} 行；不符合 ${wrong.length} 行`, pass: wrong.length === 0 && r2Rows.length > 0 };
    });
    let r3Rows: string[][] = [];
    await this.act('用例#2 执行数据行 r3（ROOM ID=10100001+USER ID=23）', async () => {
      await this.resetFilters(page);
      await this.fillPlaceholder(page, 'ROOM ID', '10100001');
      await this.fillPlaceholder(page, 'USER ID', '23');
      await this.search(page);
      r3Rows = await this.readRows(page);
    });
    await this.check('用例#2-①[数据行3] ROOM ID=10100001+USER ID=23：每行两列精确匹配', async () => {
      const wrong = r3Rows.filter((r) => r[2] !== '10100001' || r[4] !== '23');
      const baselineB3 = r3Rows.filter((r) => r[7] === '5003' && r[1].startsWith('菲律宾(ph)'));
      const stored = r3Rows.filter((r) => r[1].startsWith('印尼(in)'));
      await this.shotEl('.el-table__body-wrapper', 'case2-r3');
      this.notes.push(`#2 r3：共 ${r3Rows.length} 行，其中基准 B3 ${baselineB3.length} 行，印尼存量 ${stored.length} 行`);
      return {
        expect: '每行 ROOM ID=10100001 且 USER ID=23（存量该组合 1 行，基准 B3 亦命中）',
        real: `共 ${r3Rows.length} 行；不符合 ${wrong.length} 行；其中基准 B3=${baselineB3.length} 行，印尼存量=${stored.length} 行`,
        pass: wrong.length === 0 && r3Rows.length >= 1 && stored.length === 1
      };
    });
    await this.check('用例#2-②[数据行1,2] r1/r2 结果均包含基准行 B1（权重 5001）', async () => {
      const inR1 = r1Rows.some((r) => r[7] === '5001' && r[4] === '23');
      const inR2 = r2Rows.some((r) => r[7] === '5001' && r[4] === '23');
      return { expect: 'r1 与 r2 均含权重 5001 的 B1 行', real: `r1=${inR1 ? '含' : '不含'}；r2=${inR2 ? '含' : '不含'}`, pass: inR1 && inR2 };
    });
    await this.closeCasePage();
  }

  // ---------------- #3 ----------------

  private async case3(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    let options: string[] = [];
    await this.act('用例#3 展开推荐类型筛选下拉并选择侧边推荐', async () => {
      options = await this.openDropdownOptions(page, page, '推荐类型');
      await this.shot('case3-type-dropdown');
      await this.clickVisibleOption(page, '侧边推荐');
      await this.search(page);
    });
    const rows = await this.readRows(page);
    await this.check('用例#3-① 推荐类型下拉选项恰为 弹窗/侧边推荐 两项', async () => {
      const sorted = [...options].sort();
      const expect = ['侧边推荐', '弹窗'].sort();
      return { expect: `恰好两项：${expect.join('/')}`, real: `共 ${options.length} 项：${options.join('/')}`, pass: sorted.length === 2 && sorted.every((v, i) => v === expect[i]) };
    });
    await this.check('用例#3-② 筛选后每行推荐类型列显示 侧边推荐', async () => {
      const wrong = rows.filter((r) => r[6] !== '侧边推荐');
      await this.shotEl('.el-table__body-wrapper', 'case3-sidebar-rows');
      return { expect: '每行推荐类型=侧边推荐', real: `共 ${rows.length} 行；不符合 ${wrong.length} 行`, pass: wrong.length === 0 && rows.length > 0 };
    });
    await this.closeCasePage();
  }

  // ---------------- #4 ----------------

  private async case4(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#4 推荐类型筛选=弹窗并搜索', async () => {
      await this.selectOption(page, page, '推荐类型', '弹窗');
      await this.search(page);
    });
    const rows = await this.readRows(page);
    await this.check('用例#4-① 列表每一行推荐类型列显示 弹窗', async () => {
      const wrong = rows.filter((r) => r[6] !== '弹窗');
      await this.shotEl('.el-table__body-wrapper', 'case4-pop-rows');
      return { expect: '每行推荐类型=弹窗', real: `共 ${rows.length} 行；不符合 ${wrong.length} 行`, pass: wrong.length === 0 && rows.length > 0 };
    });
    await this.check('用例#4-② 结果行数 ≥1', async () => {
      return { expect: '行数 ≥1', real: `行数=${rows.length}`, pass: rows.length >= 1 };
    });
    await this.closeCasePage();
  }

  // ---------------- #5 ----------------

  private async case5(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#5 地区筛选=印尼语区并搜索', async () => {
      await this.selectOption(page, page, '地区', '印尼语区');
      await this.search(page);
    });
    const rows = await this.readRows(page);
    await this.check('用例#5-① 列表每一行大区列显示 印尼(in)', async () => {
      const wrong = rows.filter((r) => !r[1].startsWith('印尼(in)'));
      await this.shotEl('.el-table__body-wrapper', 'case5-in-rows');
      return { expect: '每行大区=印尼(in)', real: `共 ${rows.length} 行；不符合 ${wrong.length} 行`, pass: wrong.length === 0 && rows.length > 0 };
    });
    await this.check('用例#5-② 结果包含基准行 B1（USER ID=23、权重 5001）', async () => {
      const b1 = rows.find((r) => r[4] === '23' && r[7] === '5001');
      return { expect: '含 B1（USER ID=23、权重 5001）', real: b1 ? '含' : '不含' , pass: Boolean(b1) };
    });
    await this.closeCasePage();
  }

  // ---------------- #6 ----------------

  private async case6(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#6 按 ROOM ID=10100001 搜索', async () => {
      await this.fillPlaceholder(page, 'ROOM ID', '10100001');
      await this.search(page);
    });
    const rows = await this.readRows(page);
    await this.check('用例#6-① 列表每一行 ROOM ID 列显示 10100001', async () => {
      const wrong = rows.filter((r) => r[2] !== '10100001');
      await this.shotEl('.el-table__body-wrapper', 'case6-roomid-rows');
      return { expect: '每行 ROOM ID=10100001', real: `共 ${rows.length} 行；不符合 ${wrong.length} 行`, pass: wrong.length === 0 && rows.length > 0 };
    });
    await this.check('用例#6-② ROOM NAME 列显示 L-李扬的语音房1', async () => {
      const wrong = rows.filter((r) => r[3] !== 'L-李扬的语音房1');
      return { expect: '每行 ROOM NAME=L-李扬的语音房1', real: `共 ${rows.length} 行；不符合 ${wrong.length} 行${wrong.length ? `：${wrong.map((r) => r[3] || '(空)').join(',')}` : ''}`, pass: wrong.length === 0 && rows.length > 0 };
    });
    await this.closeCasePage();
  }

  // ---------------- #7 ----------------

  private async case7(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const totalBefore = await this.totalCount(page);
    await this.act('用例#7 多条件查询后点击 Reset Filters', async () => {
      await this.fillPlaceholder(page, 'USER ID', '23');
      await this.fillPlaceholder(page, 'ROOM ID', '10100001');
      await this.search(page);
      await this.resetFilters(page);
    });
    const userVal = await page.locator('input[placeholder="USER ID"]').inputValue();
    const roomVal = await page.locator('input[placeholder="ROOM ID"]').inputValue();
    await this.check('用例#7-① USER ID 与 ROOM ID 筛选框恢复为空', async () => {
      await this.shot('case7-reset-filters');
      return { expect: 'USER ID=空，ROOM ID=空', real: `USER ID=「${userVal}」，ROOM ID=「${roomVal}」`, pass: userVal === '' && roomVal === '' };
    });
    await this.check('用例#7-② 列表恢复全量，分页总数与重置前一致', async () => {
      const totalAfter = await this.totalCount(page);
      return { expect: `Total=${totalBefore}`, real: `Total=${totalAfter}`, pass: totalAfter === totalBefore };
    });
    await this.closeCasePage();
  }

  // ---------------- #8 ----------------

  private async case8(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#8 按不存在的 USER ID=999999999 搜索', async () => {
      await this.fillPlaceholder(page, 'USER ID', '999999999');
      await this.search(page);
    });
    const count = await this.rowCount(page);
    const empty = await this.emptyText(page);
    this.notes.push(`#8 观察：空态文案=「${empty}」；页面错误=${this.pageErrors.length ? this.pageErrors.join(' | ') : '无'}`);
    await this.check('用例#8-① 列表无任何数据行（显示空态占位）', async () => {
      await this.shot('case8-empty-state');
      return { expect: '行数=0', real: `行数=${count}，空态文案=「${empty}」`, pass: count === 0 };
    });
    await this.closeCasePage();
  }

  // ---------------- #9 ----------------

  private async case9(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const headers = (await page.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim());
    const expected = ['', '大区', 'ROOM ID', 'ROOM NAME', 'USER ID', 'USER NICK', '推荐类型', '权重', 'Create Time', '操作人', '操作'];
    await this.check('用例#9-① 表头 11 列结构与顺序正确', async () => {
      await this.shotEl('.el-table__header-wrapper', 'case9-header');
      return { expect: JSON.stringify(expected), real: JSON.stringify(headers), pass: headers.length === expected.length && headers.every((h, i) => h === expected[i]) };
    });
    await this.check('用例#9-② 表头不含 ID/进房人数限制/礼物流水上限', async () => {
      const forbidden = headers.filter((h) => h === 'ID' || h.includes('进房人数限制') || h.includes('礼物流水上限'));
      return { expect: '不含 ID/进房人数限制/礼物流水上限', real: forbidden.length ? `含：${forbidden.join('、')}` : '不含', pass: forbidden.length === 0 };
    });
    await this.closeCasePage();
  }

  // ---------------- #10 ----------------

  private async case10(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#10 查看首页权重列排序', async () => {
      await this.resetFilters(page);
    });
    const rows = await this.readRows(page);
    const weights = rows.map((r) => Number(r[7]));
    await this.check('用例#10-① 第一页权重列数值从上到下非递增', async () => {
      let ok = true;
      for (let i = 1; i < weights.length; i++) if (weights[i] > weights[i - 1]) ok = false;
      await this.shotEl('.el-table__body-wrapper', 'case10-weights');
      return { expect: '权重序列非递增', real: weights.join(','), pass: ok && weights.length > 0 };
    });
    await this.check('用例#10-② 前 3 行权重依次为 5003、5002、5001', async () => {
      const top3 = weights.slice(0, 3);
      return { expect: '5003,5002,5001', real: top3.join(','), pass: top3.join(',') === '5003,5002,5001' };
    });
    await this.closeCasePage();
  }

  // ---------------- #11 ----------------

  private async case11(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#11 记录初始分页并切换第 2 页', async () => {
      await this.resetFilters(page);
    });
    const total = await this.totalCount(page);
    const page1 = await this.readRows(page);
    await this.act('用例#11 点击分页第 2 页', async () => { await this.gotoPage(page, 2); });
    const page2 = await this.readRows(page);
    await this.check('用例#11-① 第 2 页行数等于每页条数且数据与第 1 页不同', async () => {
      const same = page1.length === page2.length && page1.every((r, i) => r.join('|') === page2[i]?.join('|'));
      await this.shotEl('.el-table__body-wrapper', 'case11-page2');
      return { expect: '第 2 页 10 行且数据与第 1 页不同', real: `第 1 页 ${page1.length} 行，第 2 页 ${page2.length} 行，${same ? '数据相同' : '数据不同'}`, pass: page2.length === 10 && !same };
    });
    await this.act('用例#11 切换每页条数为 20/page', async () => { await this.setPageSize(page, 20); });
    const rows20 = await this.readRows(page);
    await this.check('用例#11-② 切换 20/page 后列表每页显示 20 行', async () => {
      await this.shotEl('.el-table__body-wrapper', 'case11-20perpage');
      return { expect: '本页 20 行', real: `本页 ${rows20.length} 行`, pass: rows20.length === 20 };
    });
    await this.check('用例#11-③ 分页总数与页码按 Total/每页条数联动', async () => {
      const totalAfter = await this.totalCount(page);
      const pages = await this.pageNumbers(page);
      const maxPage = pages.length ? Math.max(...pages.map((p) => Number(p)).filter((n) => Number.isFinite(n))) : 0;
      const expectedPages = Math.ceil(totalAfter / 20);
      const text = await this.paginationText(page);
      return { expect: `Total=${totalAfter}，最大页码=${expectedPages}`, real: `Total=${totalAfter}，页码=${pages.join(',')}，分页文本「${text}」`, pass: totalAfter === total && maxPage === expectedPages };
    });
    await this.closeCasePage();
  }

  // ---------------- #12 ----------------

  private async case12(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.act('用例#12 推荐类型筛选=弹窗并查看 USER ID/USER NICK 列', async () => {
      await this.selectOption(page, page, '推荐类型', '弹窗');
      await this.search(page);
    });
    const rows = await this.readRows(page);
    await this.check('用例#12-① USER ID 列显示 -（0 值不展示为 0）', async () => {
      const wrong = rows.filter((r) => r[4] !== '-');
      await this.shotEl('.el-table__body-wrapper', 'case12-userid-dash');
      return { expect: '每行 USER ID=-', real: `共 ${rows.length} 行；不符合 ${wrong.length} 行${wrong.length ? `：${wrong.map((r) => r[4]).join(',')}` : ''}`, pass: wrong.length === 0 && rows.length > 0 };
    });
    await this.check('用例#12-② USER NICK 列显示 -，无 null/undefined 等其它占位', async () => {
      const wrong = rows.filter((r) => r[5] !== '-');
      return { expect: '每行 USER NICK=-', real: `共 ${rows.length} 行；不符合 ${wrong.length} 行${wrong.length ? `：${wrong.map((r) => r[5] || '(空)').join(',')}` : ''}`, pass: wrong.length === 0 && rows.length > 0 };
    });
    await this.closeCasePage();
  }
}

const test = new ListQueryTest();
await test.execute();
