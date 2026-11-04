/**
 * 项目139 / 语音房管理-主播认证标识配置：批量删除全链路（真实页面 + 真实接口 + 只读 DB 审计日志核对）
 *
 * 覆盖：
 * 1. 入口、未勾选禁用、多选、二次确认条数与取消；
 * 2. 确认删除成功文案、刷新、勾选清空；
 * 3. 不存在 ID 跳过文案、重复 ID 不误报（接口层）；
 * 4. anchor_certification_log 产生 DELETE 记录且含操作人；
 * 5. 既有功能回归：单条新增/编辑/删除、导出；
 * 6. 末页删空后按新分页规则回到第 1 页，保留认证类型筛选与每页条数（新增 11 条银色主播-普通测试认证）。
 *
 * 运行：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/anchor-certification-batch-delete.test.ts
 */
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { AdminBase, MAIN_TEST_UIDS, ROLLBACK_TEST_UIDS, CERT_TYPE_SILVER_NORMAL } from './lib/admin-base.ts';

/** 主流程新增 3 条，仅勾选前 2 条，第 3 条用于验证“未勾选行不被删除”并复用做单条编辑/删除 */
const MAIN_UIDS = [...MAIN_TEST_UIDS, 1789];

class AnchorCertificationBatchDelete extends AdminBase {
  private createdIds: number[] = [];
  private deletedCertIds: number[] = [];

  constructor() {
    super('anchor-certification-batch-delete');
    this.total = 11;
  }

  private async certPage(options: { userId?: number; certificationType?: number; page?: number; rows?: number } = {}): Promise<any[]> {
    const response = await this.api('/api/anchor/certification/page', {
      method: 'POST',
      body: { page: options.page ?? 1, rows: options.rows ?? 100, ...(options.userId ? { userId: options.userId } : {}), ...(options.certificationType ? { certificationType: options.certificationType } : {}) },
    });
    return response.json?.data?.data ?? [];
  }

  private async addViaApi(uids: number[], type: number, content: string): Promise<void> {
    const response = await this.api('/api/anchor/certification/add', {
      method: 'POST',
      body: {
        userIds: uids.join(','),
        certificationType: type,
        certificationContent: content,
        textColor: '#242633',
        blackTextColor: '#E3E3E3',
        effectiveTime: '2026-10-01 00:00:00',
        expirationTime: '2026-12-31 23:59:59',
      },
    });
    if (String(response.json?.status) !== '0') throw new Error(`API 新增认证失败: ${response.json?.msg}`);
    for (const uid of uids) {
      const rows = await this.certPage({ userId: uid });
      for (const row of rows) this.createdIds.push(Number(row.id));
    }
  }

  private async batchDeleteViaApi(ids: number[]): Promise<{ status: string; msg: string; data: string }> {
    const response = await this.api('/api/anchor/certification/batchDelete', { method: 'POST', body: { ids } });
    return { status: String(response.json?.status), msg: String(response.json?.msg ?? ''), data: String(response.json?.data ?? '') };
  }

  private rowByUid(uid: number) {
    return this.rows().filter({ hasText: String(uid) }).first();
  }

  /** 操作列 fixed=right，编辑/删除按钮位于固定列 body（主表按钮被固定层遮挡） */
  private async fixedRowByUid(uid: number) {
    const index = await this.p.evaluate((target) => {
      const vm = (document.querySelector('.app-container') as any).__vue__;
      return (vm.tableData ?? []).findIndex((row: any) => String(row.userId) === String(target));
    }, String(uid));
    if (index < 0) throw new Error(`列表中未找到 uid=${uid}`);
    return this.p.locator('.app-container .el-table__fixed-right .el-table__fixed-body-wrapper tbody tr').nth(index);
  }

  private async addViaUi(uids: number[], typeLabel: string, content: string): Promise<void> {
    await this.button('新增认证').click();
    const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '认证类型' }).last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await this.fillDialogField('用户ID', uids.join(','), '.el-dialog:visible', 'textarea');
    await this.selectOption('认证类型', typeLabel);
    await this.fillDialogField('认证内容', content);
    await this.setDateField('生效时间', '2026-10-01 00:00:00');
    await this.setDateField('过期时间', '2026-12-31 23:59:59');
    await this.shot(`新增认证弹窗-${uids.length}个uid`);
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await this.waitToast('添加成功');
    await this.p.waitForTimeout(1000);
  }

  async run(): Promise<void> {
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
      });

      await this.act('打开主播认证标识配置：入口、列表与未勾选禁用态', async () => {
        await this.open('/voice-room/anchor-certification', '.app-container');
        await this.waitRows(1);
        const rows = await this.rowCount();
        const disabled = await this.buttonDisabled('批量删除');
        await this.shot('主播认证-入口与禁用态');
        this.log(`列表行数=${rows}，批量删除未勾选禁用=${disabled}`);
        if (!(await this.button('批量删除').isVisible())) throw new Error('批量删除按钮不存在');
        if (!(await this.button('新增认证').isVisible())) throw new Error('新增认证按钮不存在');
        if (!(await this.button('导出').isVisible())) throw new Error('导出按钮不存在');
        if (!disabled) throw new Error('未勾选时批量删除按钮未禁用');
      });

      await this.act('通过页面新增 3 条测试认证（多 uid）', async () => {
        for (const uid of MAIN_UIDS) {
          const existing = await this.certPage({ userId: uid });
          if (existing.length > 0) throw new Error(`测试 uid=${uid} 已存在主播认证，为保护数据停止执行`);
        }
        await this.addViaUi(MAIN_UIDS, '金色主播-普通', 'AI回归-批量删除');
        const rows = await this.certPage();
        for (const uid of MAIN_UIDS) {
          const found = rows.filter((row: any) => String(row.userId) === String(uid));
          if (found.length !== 1) throw new Error(`新增后接口未查到 uid=${uid} 的唯一记录`);
          this.createdIds.push(Number(found[0].id));
        }
      });

      await this.act('勾选 2 条：按钮启用且二次确认展示条数', async () => {
        for (const uid of MAIN_TEST_UIDS) {
          await this.rowByUid(uid).locator('.el-checkbox').first().click();
          await this.p.waitForTimeout(200);
        }
        if (await this.buttonDisabled('批量删除')) throw new Error('勾选后批量删除按钮仍禁用');
        await this.shot('主播认证-已勾选2条');
        await this.button('批量删除').click();
        const text = await this.waitConfirmDialog();
        this.log(`二次确认文案: ${text}`);
        await this.shot('主播认证-二次确认2条');
        if (!text.includes('2')) throw new Error(`二次确认未展示勾选条数: ${text}`);
      });

      await this.act('取消二次确认：不发起删除、数据与勾选保持不变', async () => {
        const before = await this.rowCount();
        await this.cancelBox();
        await this.p.waitForTimeout(800);
        const after = await this.rowCount();
        const deleteCalls = this.calls.filter((call) => call.url.includes('/api/anchor/certification/batchDelete'));
        await this.shot('主播认证-取消确认');
        if (after !== before) throw new Error(`取消后行数变化 ${before} -> ${after}`);
        if (deleteCalls.length > 0) throw new Error('取消确认后仍发起了批量删除请求');
        if (await this.buttonDisabled('批量删除')) throw new Error('取消后勾选被意外清空');
      });

      await this.act('确认删除勾选的 2 条：成功文案、刷新、勾选清空、未勾选行保留', async () => {
        const selectedRows = await this.certPage();
        const deletedIds = selectedRows
          .filter((row: any) => MAIN_TEST_UIDS.map(String).includes(String(row.userId)))
          .map((row: any) => Number(row.id));
        this.deletedCertIds = deletedIds;
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.confirmBox();
        const toast = await this.waitToast('成功删除2条数据');
        this.log(`成功提示: ${toast}`);
        await this.p.waitForTimeout(1200);
        const disabled = await this.buttonDisabled('批量删除');
        await this.shot('主播认证-批量删除成功');
        if (!toast.includes('成功删除2条数据')) throw new Error(`成功提示不符合后端文案: ${toast}`);
        if (!disabled) throw new Error('删除成功后勾选未清空');
        for (const uid of MAIN_TEST_UIDS) {
          const left = await this.certPage({ userId: uid });
          if (left.length > 0) throw new Error(`uid=${uid} 删除后仍存在认证记录`);
        }
        const untouched = await this.certPage({ userId: 1789 });
        if (untouched.length !== 1) throw new Error('未勾选的第 3 条记录被误删');
        this.createdIds = this.createdIds.filter((id) => !deletedIds.includes(id));
      });

      await this.act('只读 DB 核对：批量删除产生 anchor_certification_log DELETE 记录（含操作人）', async () => {
        const idList = (await this.dbQuery(`select id, anchor_certification_id, user_id, operate_name, operate_type, content from anchor_certification_log where anchor_certification_id in (${this.deletedCertIds.join(',')}) order by id desc limit 50`)) as any[];
        const deleted = idList.filter((row) => String(row.operate_type) === 'DELETE');
        this.log(`最近日志=${JSON.stringify(idList.slice(0, 6))}`);
        await this.shot('主播认证-审计日志核对');
        for (const uid of MAIN_TEST_UIDS) {
          const hit = deleted.find((row) => String(row.user_id) === String(uid) && String(row.operate_name) === 'admin' && String(row.content).includes(`uid ${uid}`));
          if (!hit) throw new Error(`未找到 uid=${uid} 的 DELETE 审计日志（operator=admin）`);
        }
      });

      await this.act('接口层：重复 ID 不误报、不存在 ID 跳过、空参数报错', async () => {
        await this.addViaApi([1751, 1752], 3, 'AI回归-重复ID');
        const dupRow = await this.certPage({ userId: 1751 });
        const dupId = Number(dupRow[0].id);
        const dup = await this.batchDeleteViaApi([dupId, dupId]);
        this.log(`重复ID响应=${JSON.stringify(dup)}`);
        if (dup.status !== '0' || dup.data !== '成功删除1条数据') throw new Error(`重复 ID 未去重或文案不符: ${JSON.stringify(dup)}`);
        this.createdIds = this.createdIds.filter((id) => id !== dupId);

        const missingRow = await this.certPage({ userId: 1752 });
        const missingId = Number(missingRow[0].id);
        const mixed = await this.batchDeleteViaApi([missingId, 999999999]);
        this.log(`不存在ID响应=${JSON.stringify(mixed)}`);
        if (mixed.status !== '0' || mixed.data !== '成功删除1条数据，1条记录不存在已跳过') throw new Error(`不存在 ID 跳过文案不符: ${JSON.stringify(mixed)}`);
        this.createdIds = this.createdIds.filter((id) => id !== missingId);

        const empty = await this.api('/api/anchor/certification/batchDelete', { method: 'POST', body: { ids: [] } });
        if (String(empty.json?.status) !== '1' || String(empty.json?.msg) !== '请选择要删除的数据') throw new Error(`空参数响应不符: ${JSON.stringify(empty.json)}`);
      });

      await this.act('既有功能回归：页面单条编辑/删除（新增已由多 uid 新增覆盖）', async () => {
        const uid = 1789;
        // 复用主流程中未被勾选的第 3 条记录，验证单条编辑/删除入口
        await this.p.locator('.app-container .search-box input[placeholder="用户ID"]').fill(String(uid));
        await this.button('Search').click();
        await this.waitRows(1);
        const row = this.rowByUid(uid);
        await row.waitFor({ state: 'visible', timeout: 10000 });
        const created = await this.certPage({ userId: uid });
        if (created.length !== 1) throw new Error('单条编辑前未查到待操作记录');
        const id = Number(created[0].id);

        await (await this.fixedRowByUid(uid)).locator('button').filter({ hasText: '编辑' }).first().click();
        const editDialog = this.p.locator('.el-dialog:visible').filter({ hasText: '编辑认证' }).last();
        await editDialog.waitFor({ state: 'visible', timeout: 10000 });
        await this.fillDialogField('认证内容', 'AI回归-单条-已编辑');
        await editDialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        await this.waitToast('编辑成功');
        await this.p.waitForTimeout(800);
        const updated = await this.certPage({ userId: uid });
        await this.shot('主播认证-单条编辑');
        if (updated[0]?.certificationContent !== 'AI回归-单条-已编辑') throw new Error('单条编辑内容未生效');

        await (await this.fixedRowByUid(uid)).locator('button').filter({ hasText: '删除' }).first().click();
        const deleteText = await this.waitConfirmDialog();
        if (!deleteText.includes('是否要删除')) throw new Error(`单条删除确认文案不符: ${deleteText}`);
        await this.confirmBox();
        await this.waitToast('删除成功');
        await this.p.waitForTimeout(800);
        if ((await this.certPage({ userId: uid })).length > 0) throw new Error('单条删除后记录仍存在');
        this.createdIds = this.createdIds.filter((item) => item !== id);
        await this.button('Reset').click();
        await this.p.waitForTimeout(1000);
      });

      await this.act('既有功能回归：导出 Excel 正常下载且列完整', async () => {
        const [download] = await Promise.all([
          this.p.waitForEvent('download', { timeout: 30000 }),
          this.button('导出').click(),
        ]);
        const file = join(this.evidenceDir, `anchor-export-${Date.now()}.xlsx`);
        await download.saveAs(file);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(file);
        const sheet = workbook.worksheets[0];
        const headers = sheet.getRow(1).values.slice(1) as string[];
        await this.shot('主播认证-导出文件');
        this.log(`导出表头=${JSON.stringify(headers)}`);
        for (const expected of ['大区', '用户ID', '用户NO', '昵称', '认证类型', '认证内容', '生效时间', '过期时间', '状态']) {
          if (!headers.includes(expected)) throw new Error(`导出缺少列 ${expected}`);
        }
      });

      await this.act('末页删空：批量删除成功后回第 1 页，保留认证类型筛选与每页条数（新增 11 条）', async () => {
        await this.addViaUi(ROLLBACK_TEST_UIDS, '银色主播-普通', 'AI回归-末页删除回第1页');
        const created = await this.certPage({ certificationType: CERT_TYPE_SILVER_NORMAL });
        if (created.length !== ROLLBACK_TEST_UIDS.length) throw new Error(`末页场景测试数据应为 ${ROLLBACK_TEST_UIDS.length} 条，实际 ${created.length}`);
        this.createdIds.push(...created.map((row: any) => Number(row.id)));

        // 重新加载确保分页状态为默认 10 条/页，再过滤“银色主播-普通”（该类型仅有本次测试数据）
        await this.p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.p.waitForSelector('.app-container', { timeout: 45000 });
        await this.waitRows(1);
        await this.waitListIdle();
        await this.p.locator('.app-container .search-box .el-select').nth(1).click();
        await this.p.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: '银色主播-普通' }).first().click();
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(10);
        const totalText = await this.p.locator('.el-pagination').innerText().catch(() => '(分页组件隐藏)');
        this.log(`分页信息=${totalText.replace(/\n/g, ' ')}`);
        await this.shot('主播认证-过滤后第1页');
        await this.gotoPage(2);
        const page2Rows = await this.rowCount();
        this.log(`第2页行数=${page2Rows}`);
        await this.shot('主播认证-末页第2页');
        if (page2Rows !== 1) throw new Error(`末页应仅剩 1 行测试数据，实际 ${page2Rows}`);
        await this.selectRow(0);
        const lastUidText = await this.rows().first().locator('td').nth(2).innerText();
        const lastUid = Number(lastUidText.trim());
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.confirmBox();
        await this.waitToast('成功删除1条数据');
        await this.waitPageActive(1);
        const state = await this.p.evaluate(() => {
          const vm = (document.querySelector('.app-container') as any).__vue__;
          return {
            page: vm.pageInfo?.page,
            rows: vm.pageInfo?.rows,
            total: vm.pageInfo?.total,
            certificationType: vm.searchForm?.certificationType,
            tableRows: vm.tableData?.length,
            userIds: (vm.tableData ?? []).map((row: any) => Number(row.userId)),
          };
        });
        await this.shot('主播认证-末页删除成功后回到第1页');
        this.log(`删除后状态=${JSON.stringify(state)}`);
        const left = await this.certPage({ certificationType: CERT_TYPE_SILVER_NORMAL });
        this.createdIds = this.createdIds.filter((id) => left.some((row: any) => Number(row.id) === id));
        if (state.page !== 1) throw new Error(`批量删除成功后未回到第 1 页: ${JSON.stringify(state)}`);
        if (state.rows !== 10) throw new Error(`批量删除成功后每页条数未保留为 10: ${JSON.stringify(state)}`);
        if (String(state.certificationType) !== String(CERT_TYPE_SILVER_NORMAL)) throw new Error(`批量删除成功后认证类型筛选未保留: ${JSON.stringify(state)}`);
        if (state.tableRows !== 10 || state.total !== 10) throw new Error(`删除后第 1 页应为 10 条/共 10 条: ${JSON.stringify(state)}`);
        if (left.length !== 10) throw new Error(`接口过滤后应剩 10 条测试认证，实际 ${left.length}`);
        if (!left.every((row: any) => String(row.userId) !== String(lastUid))) throw new Error(`末页删除的 uid=${lastUid} 仍存在`);
        if (state.userIds.includes(lastUid)) throw new Error(`末页删除的 uid=${lastUid} 仍出现在当前页`);
      });
    } finally {
      const remaining = await this.certPage().catch(() => [] as any[]);
      const testUids = new Set([...MAIN_TEST_UIDS, ...ROLLBACK_TEST_UIDS, 1751, 1752, 1789].map(String));
      const leftovers = remaining.filter((row: any) => testUids.has(String(row.userId))).map((row: any) => Number(row.id));
      if (leftovers.length > 0) {
        const result = await this.batchDeleteViaApi(leftovers).catch(() => null);
        this.log(`清理测试认证 ids=${leftovers.join(',')} 结果=${JSON.stringify(result)}`);
      }
      const after = await this.certPage().catch(() => [] as any[]);
      const still = after.filter((row: any) => testUids.has(String(row.userId)));
      this.log(`清理后测试账号仍存在认证: ${still.map((row: any) => row.userId).join(',') || '无'}`);
    }
  }
}

await new AnchorCertificationBatchDelete().execute();
