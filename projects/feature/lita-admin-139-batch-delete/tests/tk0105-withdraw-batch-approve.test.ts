/**
 * 项目139 / TK-0105 用例执行轮次：审核-提现-查询批量审核回归（用例 #23）。
 *
 * 用例来源：/task/20261109/TK-0101/HANDOFF（v5）九列用例 #23；
 * 技术方案：/task/20261109/TK-0101/TECH_DESIGN（WD-04、S18）。
 *
 * 覆盖：#23 选择2条待审核记录批量通过，状态流转且成为陪玩师时间不变。
 * 数据隔离：仅使用现有待审核测试记录（本任务授权 2 条）；记录申请ID，不修改数据库、不回滚；
 *      审批后的记录按既有测试数据流程交由负责人回收。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-139-batch-delete/tests/tk0105-withdraw-batch-approve.test.ts --approve=1
 *      默认不带 --approve=1 时为安全演练：只验证勾选后按钮态，不提交审批。
 */
import { Tk0105Base, type WithdrawRecord } from './lib/tk0105-base.ts';

const APPROVE = process.argv.includes('--approve=1');

class Tk0105WithdrawBatchApproveTest extends Tk0105Base {
  constructor() {
    super('tk0105-withdraw-batch-approve');
    this.total = 4;
  }

  protected async run(): Promise<void> {
    await this.login();
    let rows: WithdrawRecord[] = [];
    let apiRecords: any[] = [];
    await this.act('用例#23 选择状态待审核并搜索，记录前两条待审核记录及申请ID', async () => {
      await this.openWithdraw();
      await this.resetWithdrawFilters();
      await this.selectWithdrawStatus('待审核');
      await this.page!.waitForTimeout(500);
      const responsePromise = this.page!.waitForResponse(
        (response) => response.url().includes('/api/withdraw?') && response.url().includes('status=1') && !response.url().includes('export'),
        { timeout: 60000 },
      );
      await this.searchWithdraw();
      const response = await responsePromise;
      const json = (await response.json()) as { data?: { data?: any[] } };
      apiRecords = json?.data?.data ?? [];
      rows = await this.readWithdrawRows();
      if (rows.length < 2) throw new Error('待审核列表不足2条');
      const a = rows[0];
      const b = rows[1];
      const aApi = apiRecords.find((item) => String(item.userId) === a.userId);
      const bApi = apiRecords.find((item) => String(item.userId) === b.userId && String(item.id) !== String(aApi?.id));
      this.log(`申请A：申请ID=${aApi?.id ?? '未取得'}，用户ID=${a.userId}，成为陪玩师时间=${a.becomePlayerTime}`);
      this.log(`申请B：申请ID=${bApi?.id ?? '未取得'}，用户ID=${b.userId}，成为陪玩师时间=${b.becomePlayerTime}`);
      await this.selectFixedLeftRow(0);
      await this.selectFixedLeftRow(1);
      this.recordA = a;
      this.recordB = b;
      this.applyA = Number(aApi?.id ?? 0);
      this.applyB = Number(bApi?.id ?? 0);
    });
    await this.check('用例#23-① 勾选A、B后通过按钮为可用态', async () => {
      const button = this.page!.locator('.app-container button').filter({ hasText: /^\s*通过\s*$/ }).first();
      const visible = await button.isVisible();
      const disabled = await button.isDisabled();
      return { expect: '可见且可用', real: `${visible ? '可见' : '不可见'}且${disabled ? '禁用' : '可用'}`, pass: visible && !disabled };
    });
    if (!APPROVE) {
      this.log('安全演练模式：未点击通过，不消耗授权数据。正式执行需加 --approve=1');
      await this.shot('case23-dry-run-selected');
      return;
    }
    await this.act('用例#23 点击通过并处理可能的确认框', async () => {
      await this.clearToasts();
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*通过\s*$/ }).first().click();
      const box = this.page!.locator('.el-message-box:visible').first();
      if (await box.count()) {
        await box.getByRole('button', { name: '确定', exact: true }).click();
      }
    });
    await this.check('用例#23-② 页面通知批量操作完成总2条成功2条', async () => {
      const text = await this.waitBatchNotification(30000);
      return {
        expect: '批量操作完成, 总 2 条, 成功: 2 条',
        real: text,
        message: text.includes('总 2 条') && text.includes('成功: 2 条') ? undefined : `实际通知：${text}`,
      };
    });
    await this.act('用例#23 选择状态已通过&待打款并搜索', async () => {
      await this.openWithdraw();
      await this.resetWithdrawFilters();
      await this.selectWithdrawStatus('已通过&待打款');
      await this.page!.waitForTimeout(500);
      await this.searchWithdraw();
    });
    let afterRows: WithdrawRecord[] = [];
    await this.check('用例#23-③ 查询结果包含A、B且状态均为已通过&待打款', async () => {
      afterRows = await this.readWithdrawRows();
      const a = afterRows.find((row) => row.userId === this.recordA.userId && row.applyTime === this.recordA.applyTime);
      const b = afterRows.find((row) => row.userId === this.recordB.userId && row.applyTime === this.recordB.applyTime);
      const pass = !!a && !!b && a.status === '已通过&待打款' && b.status === '已通过&待打款';
      return {
        expect: `A=${this.recordA.userId}/${this.recordA.applyTime}、B=${this.recordB.userId}/${this.recordB.applyTime}，状态均为已通过&待打款`,
        real: `A=${a ? `${a.status}` : '缺失'}、B=${b ? `${b.status}` : '缺失'}`,
        pass,
      };
    });
    await this.check('用例#23-④ A、B成为陪玩师时间与审核前记录值一致', async () => {
      const a = afterRows.find((row) => row.userId === this.recordA.userId && row.applyTime === this.recordA.applyTime);
      const b = afterRows.find((row) => row.userId === this.recordB.userId && row.applyTime === this.recordB.applyTime);
      return {
        expect: `${this.recordA.becomePlayerTime} / ${this.recordB.becomePlayerTime}`,
        real: `${a?.becomePlayerTime ?? '缺失'} / ${b?.becomePlayerTime ?? '缺失'}`,
      };
    });
    await this.shot('case23-withdraw-batch-approve');
    this.log(`授权提现记录已处理：申请A=${this.applyA}，申请B=${this.applyB}；按既有测试数据流程交负责人回收，未改库回滚`);
  }

  private recordA!: WithdrawRecord;
  private recordB!: WithdrawRecord;
  private applyA = 0;
  private applyB = 0;

  private async waitBatchNotification(timeout: number): Promise<string> {
    const started = Date.now();
    let text = '';
    while (Date.now() - started < timeout) {
      const notification = this.page!.locator('.el-notification').first();
      if (await notification.isVisible().catch(() => false)) {
        const content = notification.locator('.el-notification__content').first();
        text = ((await content.count()) > 0 ? await content.innerText() : await notification.innerText()).replace(/\s+/g, ' ').trim();
        if (text.includes('批量操作完成')) break;
      }
      const message = this.page!.locator('.el-message').first();
      if (await message.isVisible().catch(() => false)) {
        text = (await message.innerText()).replace(/\s+/g, ' ').trim();
        if (text.includes('批量操作完成')) break;
      }
      await this.page!.waitForTimeout(300);
    }
    return text;
  }
}

const test = new Tk0105WithdrawBatchApproveTest();
await test.execute();
