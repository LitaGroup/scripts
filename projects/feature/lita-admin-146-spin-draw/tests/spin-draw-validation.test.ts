/**
 * 项目 146 / 水果机数据查询：必填校验与非法用户ID（SK-02、SK-03）
 * 用例来源：TK-0112 HANDOFF（/task/20261109/TK-0112/HANDOFF）；技术方案：/task/20261109/TK-0112/TECH_DESIGN
 * 覆盖：#3～#18（共 48 个检查点）
 * 数据隔离：全程只读，不造数、不写库；每条用例重置查询条件后执行
 * 运行：ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-validation.test.ts
 */
import { SpinDrawAdminBase, ROUTE_SUMMARY, ROUTE_DAILY, normalizeText } from './lib/admin-base.ts';

interface ValidationScenario {
  caseNo: number;
  page: 'summary' | 'daily';
  leaf: string;
  route: string;
  start: string;
  end: string;
  uid: string;
  toast: string;
}

const SCENARIOS: ValidationScenario[] = [
  { caseNo: 3, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '', end: '2026-11-08', uid: '17612704', toast: '请选择开始日期' },
  { caseNo: 4, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '2026-11-08', end: '', uid: '17612704', toast: '请选择结束日期' },
  { caseNo: 5, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '2026-11-08', end: '2026-11-08', uid: '', toast: '请输入用户ID' },
  { caseNo: 6, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '', end: '', uid: '', toast: '请选择开始日期' },
  { caseNo: 7, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '', end: '2026-11-08', uid: '17612704', toast: '请选择开始日期' },
  { caseNo: 8, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '2026-11-08', end: '', uid: '17612704', toast: '请选择结束日期' },
  { caseNo: 9, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '2026-11-08', end: '2026-11-08', uid: '', toast: '请输入用户ID' },
  { caseNo: 10, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '', end: '', uid: '', toast: '请选择开始日期' },
  { caseNo: 11, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '2026-11-08', end: '2026-11-08', uid: 'abc', toast: '请输入正确的用户ID' },
  { caseNo: 12, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '2026-11-08', end: '2026-11-08', uid: '1.5', toast: '请输入正确的用户ID' },
  { caseNo: 13, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '2026-11-08', end: '2026-11-08', uid: '-1', toast: '请输入正确的用户ID' },
  { caseNo: 14, page: 'summary', leaf: '水果机数据-汇总', route: ROUTE_SUMMARY, start: '2026-11-08', end: '2026-11-08', uid: '0', toast: '请输入正确的用户ID' },
  { caseNo: 15, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '2026-11-08', end: '2026-11-08', uid: 'abc', toast: '请输入正确的用户ID' },
  { caseNo: 16, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '2026-11-08', end: '2026-11-08', uid: '1.5', toast: '请输入正确的用户ID' },
  { caseNo: 17, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '2026-11-08', end: '2026-11-08', uid: '-1', toast: '请输入正确的用户ID' },
  { caseNo: 18, page: 'daily', leaf: '水果机数据-按日', route: ROUTE_DAILY, start: '2026-11-08', end: '2026-11-08', uid: '0', toast: '请输入正确的用户ID' },
];

class SpinDrawValidationTest extends SpinDrawAdminBase {
  constructor() {
    super('spin-draw-validation');
    this.total = SCENARIOS.length * 3;
  }

  protected async run(): Promise<void> {
    await this.login();
    for (const scenario of SCENARIOS) {
      await this.executeScenario(scenario);
    }
  }

  private async executeScenario(s: ValidationScenario): Promise<void> {
    const pageName = s.page === 'summary' ? '水果机数据-汇总' : '水果机数据-按日';
    await this.act(`用例#${s.caseNo} ${pageName}查询校验（用户ID=${s.uid || '空'}）`, async () => {
      await this.openByMenu(s.leaf, s.route);
      await this.resetForm();
      await this.clearToasts();
      if (s.start) await this.setDate('开始日期', s.start);
      if (s.end) await this.setDate('结束日期', s.end);
      if (s.uid) await this.setUid(s.uid);
      const before = await this.snapshot();
      const firedPromise = this.waitQueryResponse(3000);
      await this.clickQueryRaw();
      const toast = await this.lastToast(10000);
      const fired = await firedPromise;
      await this.waitListIdle(30000);
      const after = await this.snapshot();
      const beforeState = `${before.rows.length} 行|Total ${before.total}|${before.empty}`;
      const afterState = `${after.rows.length} 行|Total ${after.total}|${after.empty}`;

      await this.uiCheck(`用例#${s.caseNo}-① Toast 提示「${s.toast}」`, `case${s.caseNo}-1-toast`, async () => {
        return this.textCheck(s.toast, toast);
      });
      await this.uiCheck(`用例#${s.caseNo}-② 结果区保持查询前状态且不出现数据行`, `case${s.caseNo}-2-nochange`, async () => {
        return this.textCheck(beforeState, afterState, `查询请求发起=${fired}；${beforeState} → ${afterState}`);
      });
      await this.uiCheck(`用例#${s.caseNo}-③ 结果区显示「请输入查询条件后查看数据」且 Total 0`, `case${s.caseNo}-3-empty`, async () => {
        const real = `${normalizeText(after.empty)}|Total ${after.total}`;
        return this.textCheck('请输入查询条件后查看数据|Total 0', real);
      });
    });
  }
}

await new SpinDrawValidationTest().execute();
