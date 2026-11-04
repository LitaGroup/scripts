/**
 * 送礼详情正常查询、组合筛选、房间ID批量与分页（UI）
 *
 * 覆盖：
 * 1. 送礼人 / 收礼人 / 礼物ID 任一条件可查询，表格字段与接口一致
 * 2. 语言区、房间ID 可组合，房间ID 换行/逗号输入提交为逗号分隔字符串
 * 3. 分页正常：第 2 页请求 page=2 且沿用原条件
 *
 * 运行：node gift-send-detail-filters-pagination.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  AdminReportBase,
  GIFT_ID,
  RECEIVER_ID,
  ROOM_IDS,
  SENDER_ID,
} from './lib/admin-report.ts';

class FiltersPaginationTest extends AdminReportBase {
  constructor() {
    super('gift-send-detail-filters-pagination');
    this.total = 11;
  }

  protected async run(): Promise<void> {
    await this.ensureSession();
    await this.openReport();
    await this.shot('page-loaded');

    // 1. 送礼用户
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.setText('送礼用户ID', SENDER_ID);
    let response = await this.clickQuery();
    let body = await response.json();
    await this.page!.waitForTimeout(600);
    await this.shot('sender-query');
    await this.check('送礼用户查询：total=1，表格 18 列与接口一致', async (): Promise<CheckResult> => {
      const rows = await this.tableRowCount();
      const headers = (await this.tableHeaders()).join('|');
      return {
        expect: `total=1，rows=1，表头=${this.expectHeaders()}`,
        real: `total=${body.data?.total}，rows=${rows}，表头=${headers}`,
        pass: body.data?.total === 1 && rows === 1 && headers === this.expectHeaders(),
      };
    });

    await this.check('送礼用户查询：首行关键字段与接口响应一致', async (): Promise<CheckResult> => {
      const row = body.data?.data?.[0] ?? [];
      const headers = (body.data?.headers ?? []) as Array<{ name: string }>;
      const obj: Record<string, unknown> = {};
      headers.forEach((item, index) => { obj[item.name] = row[index]; });
      const text = (await this.page!.locator('.el-table__body-wrapper tbody tr').first().innerText()).replace(/\s+/g, ' ');
      const fields = ['送礼用户id', '接收用户id', '礼物id', '房间id', '房间名称', '礼物名称', '礼物类型', '语言区', '服务完成时间'];
      const missing = fields.filter((field) => !text.includes(String(obj[field] ?? '')));
      return {
        expect: '首行包含接口返回的 9 个关键字段值',
        real: missing.length === 0 ? '全部匹配' : `缺失 ${missing.join(',')}；行文本=${text.slice(0, 200)}`,
        pass: missing.length === 0,
      };
    });

    // 2. 接收用户 + 分页
    await this.clickReset();
    await this.setDate('开始日期', '2026-11-03');
    await this.setDate('结束日期', '2026-11-03');
    await this.setText('接收用户ID', RECEIVER_ID);
    response = await this.clickQuery();
    body = await response.json();
    await this.page!.waitForTimeout(600);
    const page1Text = await this.page!.locator('.el-table__body-wrapper tbody tr').first().innerText();
    await this.shot('receiver-page1');

    await this.check('接收用户查询：total>0，首页 20 行，分页可用', async (): Promise<CheckResult> => {
      const rows = await this.tableRowCount();
      const disabled = await this.paginationDisabled();
      return {
        expect: 'total>0，rows=20，分页可用',
        real: `total=${body.data?.total}，rows=${rows}，分页禁用=${disabled}`,
        pass: (body.data?.total ?? 0) > 0 && rows === 20 && !disabled,
      };
    });

    const before = this.queryCalls().length;
    const page2Response = this.page!.waitForResponse(
      (item) => item.url().includes('/data-main/admin/stats/query') && !item.url().includes('/download'),
      { timeout: 60000 },
    );
    await this.page!.locator('.box-pagination .btn-next').click();
    const page2 = await page2Response;
    const page2Body = await page2.json();
    const page2Payload = JSON.parse(page2.request().postData() ?? '{}');
    await this.page!.waitForTimeout(600);
    const page2Text = await this.page!.locator('.el-table__body-wrapper tbody tr').first().innerText();
    await this.shot('receiver-page2');

    await this.check('分页下一页：请求 page=2，沿用原查询条件', async (): Promise<CheckResult> => {
      const conditions = page2Payload.conditions ?? {};
      const expect = { start_dt: '2026-11-03', end_dt: '2026-11-03', receiver_id: RECEIVER_ID };
      return {
        expect: `page=2，conditions=${JSON.stringify(expect)}`,
        real: `page=${page2Payload.page}，conditions=${JSON.stringify(conditions)}，新增请求=${this.queryCalls().length - before}`,
        pass: Number(page2Payload.page) === 2 && JSON.stringify(conditions) === JSON.stringify(expect) && this.queryCalls().length - before === 1,
      };
    });

    await this.check('分页下一页：total 不变且首行数据变化', async (): Promise<CheckResult> => {
      return {
        expect: 'total 不变，第 2 页首行与第 1 页不同',
        real: `p1total=${body.data?.total}，p2total=${page2Body.data?.total}，首行变化=${page1Text !== page2Text}`,
        pass: body.data?.total === page2Body.data?.total && page1Text !== page2Text,
      };
    });

    // 3. 礼物ID
    await this.clickReset();
    await this.setDate('开始日期', '2026-11-03');
    await this.setDate('结束日期', '2026-11-03');
    await this.setText('礼物ID', GIFT_ID);
    response = await this.clickQuery();
    body = await response.json();
    await this.page!.waitForTimeout(600);
    await this.shot('gift-query');
    await this.check('礼物ID查询：total>0 且表格礼物ID均为 9358', async (): Promise<CheckResult> => {
      const rows = await this.tableRowCount();
      const giftIndex = ((body.data?.headers ?? []) as Array<{ name: string }>).findIndex((item) => item.name === '礼物id');
      const ids: string[] = [];
      for (let i = 0; i < rows; i++) {
        const cells = await this.page!.locator('.el-table__body-wrapper tbody tr').nth(i).locator('td').allInnerTexts();
        ids.push((cells[giftIndex] ?? '').trim());
      }
      return {
        expect: 'total>0，20 行礼物id=9358（精确匹配）',
        real: `total=${body.data?.total}，rows=${rows}，ids=${ids.join(',')}`,
        pass: (body.data?.total ?? 0) > 0 && rows > 0 && ids.every((id) => id === GIFT_ID),
      };
    });

    // 4. 语言区
    await this.clickReset();
    await this.setDate('开始日期', '2026-11-03');
    await this.setDate('结束日期', '2026-11-03');
    await this.setText('接收用户ID', RECEIVER_ID);
    await this.setLocale('印尼语区');
    response = await this.clickQuery();
    body = await response.json();
    await this.page!.waitForTimeout(600);
    await this.shot('locale-query');
    await this.check('语言区+接收用户查询：total>0 且表格语言区均为 in', async (): Promise<CheckResult> => {
      const localeIndex = ((body.data?.headers ?? []) as Array<{ name: string }>).findIndex((item) => item.name === '语言区');
      const rows = await this.tableRowCount();
      const locales: string[] = [];
      for (let i = 0; i < rows; i++) {
        const cells = await this.page!.locator('.el-table__body-wrapper tbody tr').nth(i).locator('td').allInnerTexts();
        locales.push((cells[localeIndex] ?? '').trim());
      }
      return {
        expect: 'total>0，语言区列均为 in',
        real: `total=${body.data?.total}，rows=${rows}，locales=${[...new Set(locales)].join(',')}`,
        pass: (body.data?.total ?? 0) > 0 && rows > 0 && locales.every((item) => item === 'in'),
      };
    });

    // 5. 房间ID 换行批量 + 送礼用户
    await this.clickReset();
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.setText('送礼用户ID', SENDER_ID);
    await this.setRoomIds(`${ROOM_IDS[0]}\n${ROOM_IDS[1]}`);
    response = await this.clickQuery();
    body = await response.json();
    const newlinePayload = JSON.parse(response.request().postData() ?? '{}');
    await this.page!.waitForTimeout(600);
    await this.shot('rooms-newline');
    await this.check('房间ID 换行输入：提交为逗号分隔字符串', async (): Promise<CheckResult> => {
      const submitted = String(newlinePayload.conditions?.room_ids ?? '');
      return {
        expect: ROOM_IDS.join(','),
        real: submitted,
        pass: submitted === ROOM_IDS.join(','),
      };
    });

    await this.check('房间ID + 送礼用户组合查询：返回数据且房间ID属于提交列表', async (): Promise<CheckResult> => {
      const row = body.data?.data?.[0] ?? [];
      const headers = (body.data?.headers ?? []) as Array<{ name: string }>;
      const roomIndex = headers.findIndex((item) => item.name === '房间id');
      const roomIds = (body.data?.data ?? []).map((item: unknown[]) => String(item[roomIndex]));
      return {
        expect: `total>0，房间id ∈ [${ROOM_IDS.join(',')}]`,
        real: `total=${body.data?.total}，房间id=${roomIds.join(',')}，首行=${JSON.stringify(row).slice(0, 120)}`,
        pass: (body.data?.total ?? 0) > 0 && roomIds.every((id: string) => ROOM_IDS.includes(id)),
      };
    });

    // 6. 房间ID 逗号（含空格）
    await this.setRoomIds(`${ROOM_IDS[0]}, ${ROOM_IDS[1]}`);
    response = await this.clickQuery();
    const commaPayload = JSON.parse(response.request().postData() ?? '{}');
    await this.page!.waitForTimeout(600);
    await this.shot('rooms-comma');
    await this.check('房间ID 逗号输入（含空格）：归一化为逗号分隔字符串', async (): Promise<CheckResult> => {
      const submitted = String(commaPayload.conditions?.room_ids ?? '');
      return { expect: ROOM_IDS.join(','), real: submitted, pass: submitted === ROOM_IDS.join(',') };
    });

    // 7. 语言区 + 房间ID + 送礼用户
    await this.setLocale('印尼语区');
    response = await this.clickQuery();
    body = await response.json();
    await this.page!.waitForTimeout(600);
    await this.shot('combo-query');
    await this.check('语言区+房间ID+送礼用户组合：total=1 且条件同时生效', async (): Promise<CheckResult> => {
      const row = body.data?.data?.[0] ?? [];
      const headers = (body.data?.headers ?? []) as Array<{ name: string }>;
      const obj: Record<string, unknown> = {};
      headers.forEach((item, index) => { obj[item.name] = row[index]; });
      return {
        expect: 'total=1，sender=6360225，locale=in，room=10101411',
        real: `total=${body.data?.total}，sender=${obj['送礼用户id']}，locale=${obj['语言区']}，room=${obj['房间id']}`,
        pass: body.data?.total === 1 && String(obj['送礼用户id']) === SENDER_ID && obj['语言区'] === 'in' && ROOM_IDS.includes(String(obj['房间id'])),
      };
    });

    await this.shot('filters-pagination-done');
  }
}

await new FiltersPaginationTest().execute();
