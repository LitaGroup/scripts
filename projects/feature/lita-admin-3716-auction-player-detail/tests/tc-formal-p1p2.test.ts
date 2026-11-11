/**
 * 项目 3716「拍拍模式流水-主播维度」正式轮：P1/P2（UI）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF（22 条）
 * 覆盖：PAGE-01、FILTER-04、RESET-01、REG-01、REG-02、EDGE-01、EDGE-02
 * AUTH-02/03：无受限账号，阻塞（不写 check）
 * 数据隔离：BD-0 存量只读；不造数、无清理。
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P1P2FormalTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p1p2-formal');
    this.total = 25;
  }

  private async openDetail(): Promise<void> {
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-player-detail');
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(1200);
  }

  private async reset(): Promise<void> {
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await this.page!.waitForTimeout(1000);
  }

  private async setDates(day = 10): Promise<void> {
    await this.pickDate('开始日期', day);
    await this.pickDate('结束日期', day);
  }

  private async rows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((rs) =>
      rs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  private queryCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query') && !c.path.includes('download')).length;
  }

  private async switchSizeNoWait(n: number): Promise<boolean> {
    const sel = this.page!.locator('.el-pagination__sizes .el-select').first();
    if ((await sel.count()) === 0) return false;
    const disabled = await sel.evaluate((el) => el.classList.contains('is-disabled') || !!el.querySelector('input[disabled]')).catch(() => true);
    if (disabled) return false;
    await sel.click();
    const opt = this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: `${n}/page` }).first();
    if ((await opt.count()) === 0) return false;
    await opt.click();
    await this.page!.waitForTimeout(1200);
    return true;
  }

  private async clickPage2(): Promise<void> {
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }
    ).catch(() => null);
    await this.page!.locator('.el-pager li.number', { hasText: '2' }).first().click();
    await wait;
    await this.page!.waitForTimeout(1500);
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- TC-PAGE-01 ----------
    await this.openDetail();
    await this.setDates(10);
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    const totalDefault = await this.paginationTotal();
    const page1 = await this.rows();
    await this.clickPage2();
    const page2 = await this.rows();
    const set2 = new Set([...page1, ...page2].map((r) => r[1]));
    await this.pageSize(50);
    const page50 = await this.rows();
    const set50 = new Set(page50.map((r) => r[1]));
    await this.shot('page01-page2');
    await this.check('用例#TC-PAGE-01-① 分页总数始终显示 Total 26', async (): Promise<CheckResult> => {
      return { expect: 'Total 26', real: `默认 Total=${totalDefault}，切换 50 后 Total=${await this.paginationTotal()}`, pass: totalDefault === 26 && (await this.paginationTotal()) === 26 };
    });
    await this.check('用例#TC-PAGE-01-② 第1页 20 行 + 第2页 6 行，sale_batch_no 无重复且覆盖 26 个批次', async (): Promise<CheckResult> => {
      return { expect: '20+6；26 个不重复批次', real: `第1页=${page1.length}，第2页=${page2.length}，合并=${page1.length + page2.length}，唯一批次=${set2.size}`, pass: page1.length === 20 && page2.length === 6 && set2.size === 26 };
    });
    await this.check('用例#TC-PAGE-01-③ 切换每页 50 后单页 26 行，批次集合与翻页一致，无重复无丢失', async (): Promise<CheckResult> => {
      const same = page50.length === 26 && set50.size === 26 && [...set50].every((b) => set2.has(b));
      return { expect: '单页 26 行；集合一致', real: `单页=${page50.length}，唯一批次=${set50.size}，与翻页集合一致=${same}`, pass: same };
    });

    // ---------- TC-FILTER-04 ----------
    await this.reset();
    await this.setDates(10);
    await this.pickOption('大区', '印尼语区');
    await this.fillField('房间ID', '10101473,1002');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    const f4Rows = await this.rows();
    const f4Total = await this.paginationTotal();
    const f4Ids = [...new Set(f4Rows.map((r) => String(r[5])))].sort();
    await this.shot('filter04-locale-room');
    await this.check('用例#TC-FILTER-04-① Total 6 且列表 6 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 6；6 行', real: `Total=${f4Total}，行=${f4Rows.length}`, pass: f4Total === 6 && f4Rows.length === 6 };
    });
    await this.check('用例#TC-FILTER-04-② room id 列仅为 10101473 与 1002', async (): Promise<CheckResult> => {
      return { expect: '[1002,10101473]', real: JSON.stringify(f4Ids), pass: f4Ids.length === 2 && f4Ids[0] === '1002' && f4Ids[1] === '10101473' };
    });
    await this.check('用例#TC-FILTER-04-③ 结果为交集：6 行 ≤ 单房间 6 行且 ≤ 单大区 23 行', async (): Promise<CheckResult> => {
      return { expect: '行数 6 ≤ 6 且 ≤ 23，room id 为交集', real: `行=${f4Rows.length}，room id=${JSON.stringify(f4Ids)}`, pass: f4Rows.length === 6 && f4Rows.length <= 6 && f4Rows.length <= 23 && f4Ids.every((id) => id === '1002' || id === '10101473') };
    });

    // ---------- TC-RESET-01 ----------
    await this.reset();
    await this.setDates(10);
    await this.pickOption('大区', '印尼语区');
    await this.fillField('房间ID', '10101473');
    await this.fillField('主播ID', '322540');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.reset();
    const fieldValues: string[] = [];
    let allEmpty = true;
    const fields = this.page!.locator('.query-field');
    for (let i = 0; i < await fields.count(); i++) {
      const f = fields.nth(i);
      const label = (await f.locator('.query-label').innerText().catch(() => '')).trim();
      const vals = await f.locator('input, textarea').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      if (vals.some((v) => v.trim() !== '')) allEmpty = false;
      fieldValues.push(`${label}=${JSON.stringify(vals)}`);
    }
    const emptyReset = await this.emptyText();
    const stateReset = await this.paginationState();
    await this.shot('reset01-after-reset');
    await this.check('用例#TC-RESET-01-① 日期、大区、房间ID、主播ID 全部清空', async (): Promise<CheckResult> => {
      return { expect: '5 个筛选项值均为空', real: fieldValues.join('；'), pass: allEmpty };
    });
    await this.check('用例#TC-RESET-01-② 表格恢复空态「请输入查询条件后查看数据」，无数据行', async (): Promise<CheckResult> => {
      const rows = await this.rows();
      return { expect: '空态；0 行', real: `空态=${emptyReset}，行=${rows.length}`, pass: emptyReset.includes('请输入查询条件后查看数据') && rows.length === 0 };
    });
    await this.check('用例#TC-RESET-01-③ 分页恢复 Total 0，每页条数与上一页/下一页禁用', async (): Promise<CheckResult> => {
      return { expect: 'Total 0；size/prev/next 禁用', real: JSON.stringify(stateReset), pass: stateReset.total.includes('Total 0') && stateReset.sizeDisabled && stateReset.prevDisabled && stateReset.nextDisabled };
    });

    // ---------- TC-GUARD-02（查询后重置 → 操作分页/每页条数） ----------
    const g2Before = this.queryCount();
    const g2EmptyBefore = await this.emptyText();
    const g2RowsBefore = await this.rows();
    const g2Detail: string[] = [];
    const g2StateBefore = await this.paginationState();
    if (!g2StateBefore.nextDisabled) {
      await this.page!.locator('.el-pagination .btn-next').first().click();
      await this.page!.waitForTimeout(1200);
      g2Detail.push('已点击下一页');
    } else {
      g2Detail.push('下一页禁用未触发');
    }
    const g2Switched = await this.switchSizeNoWait(10);
    g2Detail.push(g2Switched ? '已切换每页条数' : '每页条数禁用未触发');
    const g2EmptyAfter = await this.emptyText();
    const g2RowsAfter = await this.rows();
    const g2StateAfter = await this.paginationState();
    const g2Loading = await this.loadingCount();
    g2Detail.push(`query 增量=${this.queryCount() - g2Before}`);
    await this.shot('guard02-after-reset');
    await this.check('用例#TC-GUARD-02-① 查询后重置，表格恢复空态且无数据行', async (): Promise<CheckResult> => {
      return { expect: '空态；0 行', real: `空态=${g2EmptyBefore}，行=${g2RowsBefore.length}`, pass: g2EmptyBefore.includes('请输入查询条件后查看数据') && g2RowsBefore.length === 0 };
    });
    await this.check('用例#TC-GUARD-02-② 重置后点击分页/切换每页条数，表格仍为空态、无数据行', async (): Promise<CheckResult> => {
      return { expect: '空态；0 行', real: `操作=${g2Detail.join('，')}；空态=${g2EmptyAfter}；行=${g2RowsAfter.length}`, pass: g2EmptyAfter.includes('请输入查询条件后查看数据') && g2RowsAfter.length === 0 };
    });
    await this.check('用例#TC-GUARD-02-③ 分页保持 Total 0，每页条数与上一页/下一页保持禁用', async (): Promise<CheckResult> => {
      return { expect: 'Total 0；size/prev/next 禁用', real: JSON.stringify(g2StateAfter), pass: g2StateAfter.total.includes('Total 0') && g2StateAfter.sizeDisabled && g2StateAfter.prevDisabled && g2StateAfter.nextDisabled };
    });
    await this.check('用例#TC-GUARD-02-④ 无 loading、未刷新出数据、无新增 query 请求', async (): Promise<CheckResult> => {
      return { expect: 'loading 0；query 增量 0', real: `loading=${g2Loading}；${g2Detail.join('，')}`, pass: g2Loading === 0 && this.queryCount() === g2Before };
    });

    // ---------- TC-REG-01 ----------
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-room-summary');
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(1500);
    await this.pickDate('开始日期', 8);
    await this.pickDate('结束日期', 8);
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    const regHeaders = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const regHeaderRows = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const regRows = await this.rows();
    const regTotal = await this.paginationTotal();
    const sum = (i: number) => Math.round(regRows.reduce((acc, r) => acc + num(r[i]), 0) * 100) / 100;
    await this.shot('reg01-room-summary-1108');
    await this.check('用例#TC-REG-01-① 12 列表头完整，连字符列名不被误拆/不串列', async (): Promise<CheckResult> => {
      const lower = regHeaders.map((h) => h.toLowerCase());
      const hyphen = ['total auction sessions - end', 'total auction sessions - success', 'total auction sessions - failure', 'auction coins - success', 'auction coins - failure'];
      const ok = regHeaders.length === 12 && regHeaderRows === 1 && hyphen.every((h) => lower.includes(h)) && !regHeaders.some((h) => h.length <= 1);
      return { expect: '12 列、单行平铺、连字符列名完整', real: `列=${regHeaders.length}，表头行=${regHeaderRows}，表头=${lower.join('|')}`, pass: ok };
    });
    await this.check('用例#TC-REG-01-② 列表 18 行且分页 Total 18', async (): Promise<CheckResult> => {
      return { expect: '18 行；Total 18', real: `行=${regRows.length}，Total=${regTotal}`, pass: regRows.length === 18 && regTotal === 18 };
    });
    await this.check('用例#TC-REG-01-③ 合计 35/21/14/728,846.40', async (): Promise<CheckResult> => {
      const got = { sessions: sum(3), success: sum(5), failure: sum(6), coins: sum(7) };
      return { expect: '35/21/14/728846.40', real: JSON.stringify(got), pass: got.sessions === 35 && got.success === 21 && got.failure === 14 && Math.abs(got.coins - 728846.4) < 0.01 };
    });

    // ---------- TC-REG-02 ----------
    await this.nav('/data-stats-manager/player-stats/player-data-report-new');
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(2000);
    const pdrFilters = (await this.page!.locator('.query-label').allInnerTexts()).map((t) => t.trim());
    await this.check('用例#TC-REG-02-① 筛选区含数据维度/开始日期/结束日期/大区/国家/陪玩ID/陪玩NO', async (): Promise<CheckResult> => {
      const need = ['数据维度', '开始日期', '结束日期', '大区', '国家', '陪玩ID', '陪玩NO'];
      const ok = need.every((n) => pdrFilters.some((f) => f.includes(n)));
      return { expect: need.join('/'), real: JSON.stringify(pdrFilters), pass: ok };
    });
    // 尝试「日维度 + 2026-11-10」；无数据则记录阻塞
    const dim = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '数据维度' }) }).first();
    await dim.locator('.el-select').click();
    await this.page!.waitForTimeout(500);
    await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '日维度' }).first().click();
    await this.page!.waitForTimeout(400);
    await this.pickDate('开始日期', 10);
    await this.pickDate('结束日期', 10);
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }
    ).catch(() => null);
    await this.page!.locator('button', { hasText: '查询' }).first().click();
    await wait;
    await this.page!.waitForTimeout(2500);
    const pdrHeaderRows = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const pdrHeaders = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const pdrRows = await this.rows();
    const pdrEmpty = await this.emptyText();
    await this.shot('reg02-player-daily');
    if (pdrRows.length > 0 && pdrHeaders.length > 0) {
      await this.check('用例#TC-REG-02-② 查询后表头呈两级分组结构，分组对齐、不串列、不截断', async (): Promise<CheckResult> => {
        return { expect: '表头行≥2，存在父级分组列', real: `表头行=${pdrHeaderRows}，表头列=${pdrHeaders.length}，表头=${pdrHeaders.join('|')}`, pass: pdrHeaderRows >= 2 && pdrHeaders.length > 0 };
      });
      await this.check('用例#TC-REG-02-③ 列表展示数据行（行数大于 0），无报错弹窗', async (): Promise<CheckResult> => {
        return { expect: '数据行>0；无报错', real: `数据行=${pdrRows.length}，空态=${pdrEmpty}`, pass: pdrRows.length > 0 };
      });
    } else {
      this.log(`REG-02 阻塞：日维度 2026-11-10 无数据（空态=${pdrEmpty}，表头行=${pdrHeaderRows}，表头列=${pdrHeaders.length}），无法验证两级分组表头`);
      this.notes.push(`REG-02 blocked: 日维度 2026-11-10 rows=0, headers=${pdrHeaders.length}, empty=${pdrEmpty}`);
    }

    // ---------- TC-EDGE-01 ----------
    await this.openDetail();
    const d1 = await this.setDateValue('开始日期', '2026-01-01');
    const d2 = await this.setDateValue('结束日期', '2026-01-02');
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    const edgeRows = await this.rows();
    const edgeEmpty = await this.emptyText();
    const edgeTotal = await this.paginationTotal();
    const edgeBody = (await this.page!.locator('body').innerText()).slice(0, 600);
    await this.shot('edge01-no-data');
    await this.check('用例#TC-EDGE-01-① 无数据区间返回 0 行，空态「暂无数据」', async (): Promise<CheckResult> => {
      return { expect: '0 行；空态 暂无数据', real: `dates=${d1}/${d2}，行=${edgeRows.length}，空态=${edgeEmpty}`, pass: edgeRows.length === 0 && edgeEmpty.includes('暂无数据') };
    });
    await this.check('用例#TC-EDGE-01-② 分页显示 Total 0', async (): Promise<CheckResult> => {
      return { expect: 'Total 0', real: `Total=${edgeTotal}`, pass: edgeTotal === 0 };
    });
    await this.check('用例#TC-EDGE-01-③ 页面无报错提示、不白屏', async (): Promise<CheckResult> => {
      const err = /404|无权限|not found|error/i.test(edgeBody);
      const filterVisible = (await this.page!.locator('.filter-card').count()) > 0;
      return { expect: '无错误；筛选区仍在', real: `错误=${err}，筛选区=${filterVisible}`, pass: !err && filterVisible };
    });

    // ---------- TC-EDGE-02 ----------
    await this.reset();
    await this.setDates(10);
    const ids = Array.from({ length: 100 }, (_, i) => String(1002 + i)).join(',');
    await this.fillField('房间ID', ids);
    const wait2 = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }
    ).catch(() => null);
    await this.page!.locator('button', { hasText: '查询' }).first().click();
    await wait2;
    await this.page!.waitForTimeout(3000);
    const e2Rows = await this.rows();
    const e2Empty = await this.emptyText();
    const e2Total = await this.paginationTotal();
    const e2Body = (await this.page!.locator('body').innerText()).slice(0, 800);
    const e2Filter = await this.page!.locator('.filter-card').count();
    await this.shot('edge02-long-ids');
    await this.check('用例#TC-EDGE-02-① 100+ 房间 ID 查询后页面不白屏、不崩溃', async (): Promise<CheckResult> => {
      return { expect: '页面仍可用，筛选区存在', real: `筛选区=${e2Filter}，body长度=${e2Body.length}`, pass: e2Filter > 0 && e2Body.length > 50 };
    });
    await this.check('用例#TC-EDGE-02-② 无报错弹窗/错误页，表格呈现数据行或空态「暂无数据」', async (): Promise<CheckResult> => {
      const err = /404|无权限|not found|error/i.test(e2Body);
      const stateOk = e2Rows.length > 0 || e2Empty.includes('暂无数据');
      return { expect: '无报错；数据行>0 或空态', real: `错误=${err}，行=${e2Rows.length}，空态=${e2Empty}`, pass: !err && stateOk };
    });
    await this.check('用例#TC-EDGE-02-③ 分页显示 Total N（N≥0）', async (): Promise<CheckResult> => {
      const m = (await this.totalText()).match(/Total\s+([\d,]+)/i);
      return { expect: 'Total N，N≥0', real: `Total 文本=${await this.totalText()}，数值=${m ? m[1] : 'N/A'}`, pass: !!m && Number(m[1].replace(/,/g, '')) >= 0 };
    });
  }
}

new P1P2FormalTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
