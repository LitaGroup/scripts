/**
 * 项目139 / 语音房管理-主播认证标识配置：47 条用例中的 #12～#20 + 非 UI 附录 N-B3-LOG / N-B5-EMPTY
 *
 * 用例来源：TK-0083 HANDOFF 九列表格；技术方案：TK-0083 TECH_DESIGN §2/§3「主播认证-批量删除」「主播认证-单条与回归」。
 * 覆盖：#12 入口与未勾选禁用；#13 勾选两条/二次确认/取消；#14 确认批量删除；#15 取消后两条保留；
 *       #16 双会话已删一条后批量删除跳过；#17 单条删除；#18 多 uid 新增；#19 编辑认证内容；#20 导出 Excel。
 * 非 UI 附录：N-B3-LOG（#14 删除后审计日志）、N-B5-EMPTY（空参数保护，三次请求前后计数）。
 * 数据隔离：仅使用 uid 池 [19440456,19526094,1789] 和内容前缀 TK83-<runId>；每个用例预检/造数/就绪/清理。
 * 运行（仓库根目录，凭证运行时注入）：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/anchor-certification-47cases.test.ts
 */
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { AdminBase, MAIN_TEST_UIDS, UI_BASE, stamp } from './lib/admin-base.ts';

const TEST_UIDS = [...MAIN_TEST_UIDS, 1789];
const DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

class AnchorCertification47Cases extends AdminBase {
  private createdIds: number[] = [];
  private runId = stamp().replace('-', '');
  private runContent = `TK83-${this.runId}`;
  private editedContent = `TK83-${this.runId}-edited`;
  private effectiveTime = formatDateTime(new Date(Date.now() - 86400000));
  private expirationTime = formatDateTime(new Date(Date.now() + 30 * 86400000));

  constructor() {
    super('anchor-certification-47cases');
    this.total = 26;
  }

  private async certPage(options: { userId?: number; page?: number; rows?: number } = {}): Promise<{ total: number; rows: any[] }> {
    const response = await this.api('/api/anchor/certification/page', {
      method: 'POST',
      body: {
        page: options.page ?? 1,
        rows: options.rows ?? 100,
        ...(options.userId !== undefined ? { userId: options.userId } : {}),
      },
    });
    if (String(response.json?.status) !== '0') throw new Error(`主播认证分页接口失败: ${response.json?.msg}`);
    const data = response.json?.data ?? {};
    return { total: Number(data.total ?? 0), rows: data.data ?? [] };
  }

  private async certRowsForUid(uid: number): Promise<any[]> {
    return (await this.certPage({ userId: uid })).rows;
  }

  private async assertAbsent(uids: number[]): Promise<void> {
    for (const uid of uids) {
      const rows = await this.certRowsForUid(uid);
      if (rows.length > 0) throw new Error(`预检冲突：uid ${uid} 已存在主播认证，停止执行`);
    }
  }

  private async addViaApi(uids: number[], content: string, type = 2): Promise<number[]> {
    await this.assertAbsent(uids);
    const response = await this.api('/api/anchor/certification/add', {
      method: 'POST',
      body: {
        userIds: uids.join(','),
        certificationType: type,
        certificationContent: content,
        textColor: '#242633',
        blackTextColor: '#E3E3E3',
        effectiveTime: this.effectiveTime,
        expirationTime: this.expirationTime,
      },
    });
    if (String(response.json?.status) !== '0') throw new Error(`API 新增认证失败: ${response.json?.msg}`);
    const ids: number[] = [];
    for (const uid of uids) {
      const rows = await this.certRowsForUid(uid);
      if (rows.length !== 1) throw new Error(`新增后 uid ${uid} 认证记录数应为 1，实际 ${rows.length}`);
      if (String(rows[0].certificationContent) !== content) throw new Error(`新增后 uid ${uid} 认证内容不符`);
      const id = Number(rows[0].id);
      ids.push(id);
      if (!this.createdIds.includes(id)) this.createdIds.push(id);
    }
    return ids;
  }

  private async deleteViaApi(ids: number[]): Promise<string> {
    if (!ids.length) return '';
    const response = await this.api('/api/anchor/certification/batchDelete', { method: 'POST', body: { ids } });
    if (String(response.json?.status) !== '0') throw new Error(`清理主播认证失败: ${response.json?.msg}`);
    this.createdIds = this.createdIds.filter((id) => !ids.includes(id));
    return String(response.json?.data ?? '');
  }

  private async openAnchor(): Promise<void> {
    await this.open('/voice-room/anchor-certification', '.app-container');
    await this.waitRows(1);
  }

  private async setLargePage(): Promise<void> {
    const state = await this.paginationState();
    if (state.total <= 10) return;
    await this.changePageSize(50);
    await this.waitRows(1);
  }

  private rowByUid(uid: number) {
    return this.rows().filter({ hasText: String(uid) }).first();
  }

  private async rowCellsByUid(uid: number): Promise<string[]> {
    const index = await this.p.evaluate((target) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const rows = Array.from(table.querySelectorAll('.el-table__body-wrapper tbody tr.el-table__row')) as HTMLElement[];
      return rows.findIndex((row) => (row.children[2] as HTMLElement)?.innerText?.trim() === String(target));
    }, uid);
    if (index < 0) throw new Error(`页面未找到 uid=${uid} 的行`);
    return this.mainRowCells(index);
  }

  private async fixedRightRowByUid(uid: number) {
    const index = await this.p.evaluate((target) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const rows = Array.from(table.querySelectorAll('.el-table__body-wrapper tbody tr.el-table__row')) as HTMLElement[];
      return rows.findIndex((row) => (row.children[2] as HTMLElement)?.innerText?.trim() === String(target));
    }, uid);
    if (index < 0) throw new Error(`固定操作列未找到 uid=${uid}`);
    return this.fixedRightRows().nth(index);
  }

  private async selectByUid(uid: number): Promise<void> {
    await this.rowByUid(uid).locator('.el-checkbox').first().click();
  }

  private async uidRowCountOnPage(uid: number): Promise<number> {
    return this.p.evaluate((target) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const rows = Array.from(table.querySelectorAll('.el-table__body-wrapper tbody tr.el-table__row')) as HTMLElement[];
      return rows.filter((row) => (row.children[2] as HTMLElement)?.innerText?.trim() === String(target)).length;
    }, uid);
  }

  async run(): Promise<void> {
    let s2: import('playwright').Page | null = null;
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
      });

      // ==================== 用例#12 ====================
      let entryVisible12 = false;
      let disabled12 = false;
      await this.act('用例#12 菜单进入主播认证标识配置并等待列表加载', async () => {
        await this.openAnchor();
        entryVisible12 = await this.button('批量删除').isVisible();
        disabled12 = await this.buttonDisabled('批量删除');
        await this.shot('用例12-入口与禁用态');
      });
      await this.check('用例#12-① 表格首列为多选列且工具栏「批量删除」按钮可见', async () => ({
        expect: '多选列可见;批量删除按钮可见',
        real: `多选列可见=${await this.p.locator('.app-container .el-table__header-wrapper .el-checkbox').first().isVisible().catch(() => false)};批量删除按钮可见=${entryVisible12}`,
        pass: entryVisible12 && (await this.p.locator('.app-container .el-table__header-wrapper .el-checkbox').first().isVisible().catch(() => false)),
      }));
      await this.check('用例#12-② 未勾选任何行时「批量删除」按钮为禁用态', async () => ({
        expect: 'true',
        real: String(disabled12),
        pass: disabled12 === true,
      }));

      // ==================== 用例#13 ====================
      let enabled13 = false;
      let confirm13 = '';
      let ids13: number[] = [];
      await this.act('用例#13 造数 2 条认证，进入页面并勾选两条', async () => {
        ids13 = await this.addViaApi([TEST_UIDS[0], TEST_UIDS[1]], this.runContent, 2);
        await this.openAnchor();
        await this.setLargePage();
        await this.waitRows(2);
        await this.selectByUid(TEST_UIDS[0]);
        await this.selectByUid(TEST_UIDS[1]);
        enabled13 = !(await this.buttonDisabled('批量删除'));
        await this.shot('用例13-已勾选2条');
        await this.button('批量删除').click();
        confirm13 = await this.waitConfirmDialog();
        await this.shot('用例13-二次确认');
      });
      await this.check('用例#13-① 勾选两行后「批量删除」按钮为可用态', async () => ({
        expect: 'false',
        real: String(!enabled13),
        pass: enabled13 === true,
      }));
      await this.check('用例#13-② 二次确认文案为「确认删除选中的 2 条主播认证标识？」', async () => ({
        expect: '确认删除选中的 2 条主播认证标识？',
        real: confirm13,
        pass: confirm13 === '确认删除选中的 2 条主播认证标识？',
      }));
      await this.act('用例#13 取消并清理 2 条测试认证', async () => {
        await this.cancelBox();
        await this.batchDeleteCleanup(ids13);
      });

      // ==================== 用例#14 ====================
      let ids14: number[] = [];
      let deletedIds14: number[] = [];
      let remainingId14 = 0;
      let remainingUid14 = TEST_UIDS[2];
      let toast14 = '';
      let toastCount14 = 0;
      let remainCount14 = 0;
      let pageHasSelected14 = true;
      let pageHasRemaining14 = false;
      let checked14 = -1;
      let disabled14 = false;
      await this.act('用例#14 造数 3 条认证，记录勾选/未勾选并确认批量删除', async () => {
        ids14 = await this.addViaApi(TEST_UIDS, this.runContent, 2);
        deletedIds14 = ids14.slice(0, 2);
        remainingId14 = ids14[2];
        await this.openAnchor();
        await this.setLargePage();
        await this.waitRows(3);
        await this.selectByUid(TEST_UIDS[0]);
        await this.selectByUid(TEST_UIDS[1]);
        await this.shot('用例14-已勾选2条');
        await this.button('批量删除').click();
        const text = await this.waitConfirmDialog();
        if (text !== '确认删除选中的 2 条主播认证标识？') throw new Error(`二次确认文案不符: ${text}`);
        await this.confirmBox();
        toast14 = await this.waitToast('成功删除2条数据');
        toastCount14 = await this.toastCount('成功删除2条数据');
        await this.waitListIdle();
        await this.shot('用例14-批量删除成功');
        remainCount14 = (await this.certRowsForUid(remainingUid14)).length;
        pageHasSelected14 = (await this.uidRowCountOnPage(TEST_UIDS[0])) > 0 || (await this.uidRowCountOnPage(TEST_UIDS[1])) > 0;
        pageHasRemaining14 = (await this.uidRowCountOnPage(remainingUid14)) === 1;
        checked14 = await this.checkedRowCount();
        disabled14 = await this.buttonDisabled('批量删除');
      });
      await this.check('用例#14-① 页面轻提示为「成功删除2条数据」', async () => ({
        expect: '成功删除2条数据;count=1',
        real: `${toast14};count=${toastCount14}`,
        pass: toast14 === '成功删除2条数据' && toastCount14 === 1,
      }));
      await this.check('用例#14-② 刷新后的列表不含两个勾选认证，仍显示未勾选认证', async () => ({
        expect: 'selectedRows=0;remainingRows=1',
        real: `selectedRows=${pageHasSelected14 ? '>0' : 0};remainingRows=${pageHasRemaining14 ? 1 : 0};apiRemaining=${remainCount14}`,
        pass: pageHasSelected14 === false && pageHasRemaining14 === true && remainCount14 === 1,
      }));
      await this.check('用例#14-③ 表格勾选数为 0，「批量删除」按钮恢复禁用态', async () => ({
        expect: 'checked=0;disabled=true',
        real: `checked=${checked14};disabled=${disabled14}`,
        pass: checked14 === 0 && disabled14 === true,
      }));

      // 非 UI 附录 N-B3-LOG：批量删除审计日志
      let nB3Ok = true;
      let nB3Detail = '';
      try {
        const dbRows = await this.dbQuery(
          `select id, anchor_certification_id, user_id, operate_name, operate_type, content from anchor_certification_log where anchor_certification_id in (${deletedIds14.join(',')}) order by id desc`,
          'funbit',
        );
        const detail: string[] = [];
        for (let i = 0; i < deletedIds14.length; i++) {
          const certId = deletedIds14[i];
          const uid = TEST_UIDS[i];
          const hit = dbRows.find((row: any) => Number(row.anchor_certification_id) === certId && String(row.operate_type) === 'DELETE' && String(row.user_id) === String(uid) && String(row.operate_name) === this.operator && String(row.content).includes('批量删除主播认证标识') && String(row.content).includes(String(uid)));
          detail.push(`cert=${certId},uid=${uid},hit=${hit ? '1' : '0'}`);
          if (!hit) nB3Ok = false;
        }
        nB3Detail = `${detail.join(';')};rows=${dbRows.length};operator=${this.operator}`;
      } catch (error) {
        nB3Ok = false;
        nB3Detail = `只读 DB 查询失败: ${(error as Error).message}（标阻塞，不宣称已核对）`;
      }
      await this.check('N-B3-LOG 每个被删认证 ID 均有 DELETE 审计日志且操作人/内容匹配', async () => ({
        expect: '每个 certId 1 条 DELETE;operate_name=admin;content 含批量删除主播认证标识及 uid',
        real: nB3Detail,
        pass: nB3Ok,
      }));

      await this.act('用例#14 清理未删除的认证', async () => {
        await this.batchDeleteCleanup([remainingId14]);
      });

      // ==================== 用例#15 ====================
      let beforeTotal15 = 0;
      let ids15: number[] = [];
      let after15: { first: number; second: number; total: number; successToast: number } = { first: -1, second: -1, total: -1, successToast: -1 };
      await this.act('用例#15 造数 2 条认证，勾选后打开批量删除并取消', async () => {
        ids15 = await this.addViaApi([TEST_UIDS[0], TEST_UIDS[1]], this.runContent, 2);
        await this.openAnchor();
        await this.setLargePage();
        await this.waitRows(2);
        beforeTotal15 = (await this.certPage()).total;
        await this.selectByUid(TEST_UIDS[0]);
        await this.selectByUid(TEST_UIDS[1]);
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.cancelBox();
        await this.waitListIdle();
        await this.shot('用例15-取消后');
        after15 = {
          first: (await this.certRowsForUid(TEST_UIDS[0])).length,
          second: (await this.certRowsForUid(TEST_UIDS[1])).length,
          total: (await this.certPage()).total,
          successToast: await this.toastCount('成功删除'),
        };
      });
      await this.check('用例#15-① 取消后两个目标认证仍各显示 1 条，列表总数仍为删除前总数', async () => ({
        expect: `each=1;total=${beforeTotal15}`,
        real: `each=${after15.first},${after15.second};total=${after15.total}`,
        pass: after15.first === 1 && after15.second === 1 && after15.total === beforeTotal15,
      }));
      await this.check('用例#15-② 页面不出现批量删除成功提示', async () => ({
        expect: '0',
        real: String(after15.successToast),
        pass: after15.successToast === 0,
      }));
      await this.act('用例#15 清理 2 条测试认证', async () => {
        await this.batchDeleteCleanup(ids15);
      });

      // ==================== 用例#16 双会话 ====================
      let ids16: number[] = [];
      let toast16 = '';
      let s1HasA16 = true;
      let s1HasB16 = true;
      let checked16 = -1;
      let disabled16 = false;
      await this.act('用例#16 造数认证 A/B，S1 勾选 A/B，S2 按用户ID筛选并删除 A', async () => {
        ids16 = await this.addViaApi([TEST_UIDS[0], TEST_UIDS[1]], this.runContent, 2);
        await this.openAnchor();
        await this.setLargePage();
        await this.waitRows(2);
        await this.selectByUid(TEST_UIDS[0]);
        await this.selectByUid(TEST_UIDS[1]);
        await this.shot('用例16-S1已勾选A与B');
        s2 = await this.context!.newPage();
        await s2.goto(`${UI_BASE}/#/voice-room/anchor-certification`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await s2.waitForSelector('.app-container', { timeout: 45000 });
        await s2.locator('.app-container input[placeholder="用户ID"]').fill(String(TEST_UIDS[0]));
        await s2.locator('.app-container button').filter({ hasText: /^\s*Search\s*$/ }).first().click();
        await s2.waitForFunction(() => (document.querySelector('.app-container') as any)?.__vue__?.tableData?.length === 1, null, { timeout: 30000 });
        await s2.locator('.app-container .el-table__fixed-right .el-table__fixed-body-wrapper tbody tr.el-table__row').first().getByRole('button', { name: '删除' }).click();
        await s2.locator('.el-message-box:visible').getByRole('button', { name: '确定' }).click();
        await s2.locator('.el-message').filter({ hasText: '删除成功' }).first().waitFor({ state: 'visible', timeout: 10000 });
        await s2.waitForTimeout(300);
        await s2.screenshot({ path: join(this.evidenceDir, '16-S2删除A.png'), fullPage: true });
      });
      await this.act('用例#16 S1 对仍勾选的 A/B 点击批量删除并确认', async () => {
        await this.button('批量删除').click();
        const text = await this.waitConfirmDialog();
        if (text !== '确认删除选中的 2 条主播认证标识？') throw new Error(`S1 二次确认文案不符: ${text}`);
        await this.confirmBox();
        toast16 = await this.waitToast('成功删除1条数据，1条记录不存在已跳过');
        await this.waitListIdle();
        await this.shot('用例16-S1批量删除后');
        s1HasA16 = (await this.uidRowCountOnPage(TEST_UIDS[0])) > 0;
        s1HasB16 = (await this.uidRowCountOnPage(TEST_UIDS[1])) > 0;
        checked16 = await this.checkedRowCount();
        disabled16 = await this.buttonDisabled('批量删除');
        if (s2) await s2.close().catch(() => undefined);
        s2 = null;
      });
      await this.check('用例#16-① S1 轻提示为「成功删除1条数据，1条记录不存在已跳过」', async () => ({
        expect: '成功删除1条数据，1条记录不存在已跳过',
        real: toast16,
        pass: toast16 === '成功删除1条数据，1条记录不存在已跳过',
      }));
      await this.check('用例#16-② S1 列表不再显示认证 A 与认证 B', async () => ({
        expect: 'A=0;B=0',
        real: `A=${s1HasA16 ? '>0' : 0};B=${s1HasB16 ? '>0' : 0}`,
        pass: s1HasA16 === false && s1HasB16 === false,
      }));
      await this.check('用例#16-③ S1 表格勾选数为 0，「批量删除」按钮恢复禁用态', async () => ({
        expect: 'checked=0;disabled=true',
        real: `checked=${checked16};disabled=${disabled16}`,
        pass: checked16 === 0 && disabled16 === true,
      }));

      // ==================== 用例#17 ====================
      let ids17: number[] = [];
      let left17 = -1;
      let error17 = -1;
      let contentVisible17 = false;
      await this.act('用例#17 造数 uid 1789 认证，按用户ID查询并执行单条删除', async () => {
        ids17 = await this.addViaApi([TEST_UIDS[2]], this.runContent, 2);
        await this.openAnchor();
        await this.fillByPlaceholder('用户ID', String(TEST_UIDS[2]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        const row = await this.fixedRightRowByUid(TEST_UIDS[2]);
        await row.getByRole('button', { name: '删除' }).click();
        const text = await this.waitConfirmDialog();
        if (!text.includes('是否要删除')) throw new Error(`单条删除确认文案不符: ${text}`);
        await this.confirmBox();
        await this.waitToast('删除成功');
        await this.waitListIdle();
        await this.shot('用例17-单条删除后');
        left17 = (await this.certRowsForUid(TEST_UIDS[2])).length;
        error17 = await this.errorToastCount();
        contentVisible17 = await this.p.locator('.app-container').isVisible();
      });
      await this.check('用例#17-① 查询结果不再显示 uid 1789 的本用例认证', async () => ({
        expect: '0',
        real: String(left17),
        pass: left17 === 0,
      }));
      await this.check('用例#17-② 页面不出现错误提示或空白页', async () => ({
        expect: 'errorToast=0;内容区可见',
        real: `errorToast=${error17};内容区可见=${contentVisible17}`,
        pass: error17 === 0 && contentVisible17 === true,
      }));

      // ==================== 用例#18 ====================
      let added18: number[] = [];
      let rows18: Array<{ uid: number; count: number; type: string; content: string; effective: string; expiration: string }> = [];
      await this.act('用例#18 三个 uid 均无认证，通过新增认证弹窗一次新增多 uid', async () => {
        await this.assertAbsent(TEST_UIDS);
        await this.openAnchor();
        await this.button('新增认证').click();
        const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '认证类型' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        await this.fillDialogField('用户ID', TEST_UIDS.join(','), '.el-dialog:visible', 'textarea');
        await this.selectOption('认证类型', '金色主播-普通');
        await this.fillDialogField('认证内容', this.runContent);
        await this.setDateField('生效时间', this.effectiveTime);
        await this.setDateField('过期时间', this.expirationTime);
        await this.shot('用例18-新增认证弹窗');
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        await this.waitToast('添加成功');
        await this.waitListIdle();
        await this.setLargePage();
        await this.waitRows(1);
        await this.shot('用例18-新增后列表');
        for (const uid of TEST_UIDS) {
          const rows = await this.certRowsForUid(uid);
          if (rows.length === 1) added18.push(Number(rows[0].id));
          const pageCells = await this.rowCellsByUid(uid);
          rows18.push({
            uid,
            count: rows.length,
            type: pageCells[5] ?? '',
            content: pageCells[6] ?? '',
            effective: pageCells[7] ?? '',
            expiration: pageCells[8] ?? '',
          });
        }
        this.createdIds.push(...added18.filter((id) => !this.createdIds.includes(id)));
      });
      await this.check('用例#18-① 列表显示三个目标 uid 的认证，每个 uid 恰好 1 条，合计 3 条', async () => ({
        expect: '每个 uid=1;合计=3',
        real: rows18.map((row) => `${row.uid}:${row.count}`).join(';') + `;total=${rows18.reduce((sum, row) => sum + row.count, 0)}`,
        pass: rows18.length === 3 && rows18.every((row) => row.count === 1) && rows18.reduce((sum, row) => sum + row.count, 0) === 3,
      }));
      await this.check('用例#18-② 三条认证类型均为金色主播-普通、认证内容均为本次内容', async () => ({
        expect: `type=金色主播-普通;content=${this.runContent}`,
        real: rows18.map((row) => `${row.type}|${row.content}`).join(';'),
        pass: rows18.length === 3 && rows18.every((row) => row.type === '金色主播-普通' && row.content === this.runContent),
      }));
      await this.check('用例#18-③ 三条生效时间与过期时间分别等于前置值', async () => ({
        expect: `effective=${this.effectiveTime};expiration=${this.expirationTime}`,
        real: rows18.map((row) => `${row.effective}|${row.expiration}`).join(';'),
        pass: rows18.length === 3 && rows18.every((row) => row.effective === this.effectiveTime && row.expiration === this.expirationTime),
      }));
      await this.act('用例#18 清理本次新增的三个认证', async () => {
        await this.batchDeleteCleanup(added18);
      });

      // ==================== 用例#19 ====================
      let ids19: number[] = [];
      let snapshot19: any = null;
      let after19: any = null;
      let page19: string[] = [];
      let total19 = -1;
      await this.act('用例#19 造数 uid 1789 认证，按用户ID查询并编辑认证内容', async () => {
        ids19 = await this.addViaApi([TEST_UIDS[2]], this.runContent, 2);
        snapshot19 = (await this.certRowsForUid(TEST_UIDS[2]))[0];
        await this.openAnchor();
        await this.fillByPlaceholder('用户ID', String(TEST_UIDS[2]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        const row = await this.fixedRightRowByUid(TEST_UIDS[2]);
        await row.getByRole('button', { name: '编辑' }).click();
        const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '编辑认证' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        await this.fillDialogField('认证内容', this.editedContent);
        await this.shot('用例19-编辑弹窗');
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        await this.waitToast('编辑成功');
        await this.waitListIdle();
        await this.shot('用例19-编辑后');
        after19 = (await this.certRowsForUid(TEST_UIDS[2]))[0];
        page19 = await this.rowCellsByUid(TEST_UIDS[2]);
        total19 = (await this.certPage({ userId: TEST_UIDS[2] })).total;
      });
      await this.check('用例#19-① 目标行认证内容显示编辑后内容', async () => ({
        expect: this.editedContent,
        real: page19[6] ?? '',
        pass: (page19[6] ?? '') === this.editedContent,
      }));
      await this.check('用例#19-② 目标行认证类型与有效期保持前置快照值', async () => ({
        expect: `${snapshot19?.certificationTypeLabel}|${snapshot19?.effectiveTime}|${snapshot19?.expirationTime}`,
        real: `${page19[5] ?? ''}|${page19[7] ?? ''}|${page19[8] ?? ''}`,
        pass: (page19[5] ?? '') === String(snapshot19?.certificationTypeLabel ?? '') && (page19[7] ?? '') === String(snapshot19?.effectiveTime ?? '') && (page19[8] ?? '') === String(snapshot19?.expirationTime ?? ''),
      }));
      await this.check('用例#19-③ 目标查询结果总行数为 1', async () => ({
        expect: '1',
        real: String(total19),
        pass: total19 === 1,
      }));
      await this.act('用例#19 清理认证', async () => {
        await this.batchDeleteCleanup(ids19);
      });

      // ==================== 用例#20 ====================
      let ids20: number[] = [];
      let snapshot20: any = null;
      let exportFile20 = '';
      let exportHeaders20: string[] = [];
      let exportRow20: any[] = [];
      let exportDataRowCount20 = -1;
      const expectedHeaders20 = ['大区', '用户ID', '用户NO', '昵称', '认证类型', '认证内容', '文字颜色', '深色文字颜色', '生效时间', '过期时间', '状态'];
      await this.act('用例#20 造数 uid 1789 认证，筛选后点击导出并解析 xlsx', async () => {
        ids20 = await this.addViaApi([TEST_UIDS[2]], this.runContent, 2);
        snapshot20 = (await this.certRowsForUid(TEST_UIDS[2]))[0];
        await this.openAnchor();
        await this.fillByPlaceholder('用户ID', String(TEST_UIDS[2]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        exportFile20 = await this.downloadViaButton('导出');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(exportFile20);
        const sheet = workbook.worksheets[0];
        exportHeaders20 = ((sheet.getRow(1).values as any[]) ?? []).slice(1).map((value) => String(value ?? '').trim());
        exportRow20 = ((sheet.getRow(2).values as any[]) ?? []).slice(1).map((value) => String(value ?? '').trim());
        exportDataRowCount20 = sheet.actualRowCount - 1;
        if (exportDataRowCount20 < 0) exportDataRowCount20 = 0;
        this.log(`用例20 导出文件=${exportFile20};headers=${JSON.stringify(exportHeaders20)};row=${JSON.stringify(exportRow20)}`);
        await this.shot('用例20-导出文件');
      });
      await this.check('用例#20-① 下载 1 个可打开的 xlsx 文件且首个工作表存在', async () => ({
        expect: '文件可打开;工作表存在',
        real: `file=${exportFile20 || '未下载'};sheet=${exportHeaders20.length > 0 ? '存在' : '不存在'}`,
        pass: Boolean(exportFile20) && exportHeaders20.length > 0,
      }));
      await this.check('用例#20-② 表头依次为 11 列', async () => ({
        expect: expectedHeaders20.join('|'),
        real: exportHeaders20.join('|'),
        pass: exportHeaders20.length === 11 && exportHeaders20.every((header, index) => header === expectedHeaders20[index]),
      }));
      await this.check('用例#20-③ 数据行恰好 1 条', async () => ({
        expect: '1',
        real: String(exportDataRowCount20),
        pass: exportDataRowCount20 === 1,
      }));
      await this.check('用例#20-④ 数据行用户ID为 1789，类型、内容、颜色与有效期等于前置造数值', async () => ({
        expect: `uid=1789;type=${snapshot20?.certificationTypeLabel};content=${this.runContent};textColor=#242633;black=#E3E3E3;eff=${this.effectiveTime};exp=${this.expirationTime}`,
        real: `uid=${exportRow20[1] ?? ''};type=${exportRow20[4] ?? ''};content=${exportRow20[5] ?? ''};textColor=${exportRow20[6] ?? ''};black=${exportRow20[7] ?? ''};eff=${exportRow20[8] ?? ''};exp=${exportRow20[9] ?? ''}`,
        pass: (exportRow20[1] ?? '') === String(TEST_UIDS[2])
          && (exportRow20[4] ?? '') === String(snapshot20?.certificationTypeLabel ?? '')
          && (exportRow20[5] ?? '') === this.runContent
          && (exportRow20[6] ?? '').toLowerCase() === '#242633'
          && (exportRow20[7] ?? '').toLowerCase() === '#e3e3e3'
          && (exportRow20[8] ?? '') === this.effectiveTime
          && (exportRow20[9] ?? '') === this.expirationTime,
      }));
      await this.act('用例#20 清理认证', async () => {
        await this.batchDeleteCleanup(ids20);
      });

      // ==================== 非 UI 附录 N-B5-EMPTY ====================
      let nB5Ok = true;
      let nB5Detail = '';
      let nB5Before = 0;
      let nB5After = 0;
      await this.act('N-B5-EMPTY 向同源测试入口发送三组空参数请求', async () => {
        nB5Before = (await this.certPage()).total;
        const bodies: Array<{ label: string; body?: unknown }> = [
          { label: 'empty-body' },
          { label: '{}', body: {} },
          { label: 'ids=[]', body: { ids: [] } },
        ];
        const results: string[] = [];
        for (const item of bodies) {
          const response = await this.api('/api/anchor/certification/batchDelete', { method: 'POST', body: item.body });
          const status = String(response.json?.status ?? '');
          const msg = String(response.json?.msg ?? '');
          results.push(`${item.label}:http=${response.status},status=${status},msg=${msg}`);
          if (status === '0' || msg !== '请选择要删除的数据') nB5Ok = false;
        }
        nB5After = (await this.certPage()).total;
        nB5Detail = results.join(' | ');
        this.log(`N-B5-EMPTY ${nB5Detail}; count ${nB5Before}->${nB5After}`);
      });
      await this.check('N-B5-EMPTY 三次空请求均返回「请选择要删除的数据」且无业务删除', async () => ({
        expect: '三次 status!=0;msg=请选择要删除的数据;count前后一致',
        real: `${nB5Detail};count=${nB5Before}->${nB5After}`,
        pass: nB5Ok && nB5Before === nB5After,
      }));
    } finally {
      if (s2) await s2.close().catch(() => undefined);
      const cleanupIds = [...new Set(this.createdIds)];
      if (cleanupIds.length > 0) {
        await this.batchDeleteCleanup(cleanupIds).catch((error) => this.log(`清理失败: ${(error as Error).message}`));
      }
      for (const uid of TEST_UIDS) {
        const left = await this.certRowsForUid(uid).catch(() => [] as any[]);
        if (left.length > 0) this.log(`清理后 uid ${uid} 仍有认证: ${left.map((row: any) => row.id).join(',')}`);
      }
      this.log(`清理后测试 uid 认证核对完成`);
    }
  }

  /** 清理本用例登记的认证 ID；先确认仍存在，失败时记录残留 ID，不吞错为成功 */
  private async batchDeleteCleanup(ids: number[]): Promise<void> {
    const targets = ids.filter((id) => Number.isFinite(id) && id > 0);
    if (!targets.length) return;
    const allRows = (await this.certPage({ rows: 500 })).rows;
    const existing = targets.filter((id) => allRows.some((row: any) => Number(row.id) === id));
    if (!existing.length) {
      this.log(`清理认证 ids=${targets.join(',')} 已不存在，无需删除`);
      return;
    }
    let result = '';
    try {
      result = await this.deleteViaApi(existing);
    } catch (error) {
      const afterRows = (await this.certPage({ rows: 500 })).rows;
      const still = existing.filter((id) => afterRows.some((row: any) => Number(row.id) === id));
      if (!still.length) {
        this.log(`清理认证 ids=${existing.join(',')} 接口返回异常但记录已不存在: ${(error as Error).message}`);
        return;
      }
      throw error;
    }
    this.log(`清理认证 ids=${existing.join(',')} 响应=${result}`);
    const afterRows = (await this.certPage({ rows: 500 })).rows;
    const still = existing.filter((id) => afterRows.some((row: any) => Number(row.id) === id));
    if (still.length > 0) throw new Error(`清理后认证 ID ${still.join(',')} 仍存在`);
  }
}

await new AnchorCertification47Cases().execute();
