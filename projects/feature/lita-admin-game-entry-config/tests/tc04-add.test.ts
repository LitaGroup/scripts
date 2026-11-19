/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」添加用户（用例#17~#24）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#17 弹窗打开/取消；#18 单个添加；#19 批量添加；#20 已存在；#21 不存在 UID；
 *       #22 软删复活；#23 重复输入去重；#24 分隔符变体（3 数据行）
 * 数据隔离：仅页面级 add/delete；自建 UID 用后页面删除；存量 1003 条只读，不执行批量/条件删除。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc04-add.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';
import type { AddResult } from './lib/game-entry-base.ts';

const U1 = '19440456';
const U2 = '13365989';
const U3 = '8268067';
const U4 = '7446886';
const UA = '7433600';
const UB = '7423160';
const NONEXIST = '999999999999';

class AddCase extends GameEntryBase {
  constructor() { super('tc04-add'); this.total = 66; }

  private async enterPage(): Promise<void> {
    await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    await this.gotoPageDirect(this.page!);
  }

  private async ensureAbsent(uid: string): Promise<void> {
    await this.queryByUid(uid);
    if ((await this.rowCount()) > 0) await this.deleteFiltered(true);
  }

  private async addUids(text: string): Promise<AddResult> {
    await this.openAddDialog();
    const result = await this.submitAdd(text);
    await this.closeAddDialog();
    return result;
  }

  private async cleanupUids(uids: string[]): Promise<void> {
    for (const uid of uids) {
      await this.queryByUid(uid);
      if ((await this.rowCount()) > 0) await this.deleteFiltered(true);
    }
  }

  /** 成功路径页面提示「成功添加 N 个用户」；失败路径弹「添加结果 成功 x 个，失败 y 个。原因…」。 */
  private resultCounts(result: AddResult): { success: number; fail: number } {
    const box = result.text.match(/成功\s*(\d+)\s*个[，,]\s*失败\s*(\d+)\s*个/);
    if (box) return { success: Number(box[1]), fail: Number(box[2]) };
    const toast = result.text.match(/成功添加\s*(\d+)\s*个用户/);
    if (toast) return { success: Number(toast[1]), fail: 0 };
    return { success: -1, fail: -1 };
  }

  protected async run(): Promise<void> {
    // ===== 用例#17 添加弹窗打开与取消 =====
    await this.act('用例#17 步骤1 进入页面并点击添加用户', async () => {
      await this.enterPage();
      await this.openAddDialog();
      await this.shot('case17-add-dialog', true);
    });
    await this.check('用例#17-① 弹出标题为「添加用户」的弹窗', async () => {
      const info = await this.addDialogInfo();
      return { expect: '添加用户', real: info.title, pass: info.title === '添加用户' };
    });
    await this.check('用例#17-② 弹窗显示用户 UID 标签与多行文本输入框及提示文案', async () => {
      const info = await this.addDialogInfo();
      const label = await this.dialog().evaluate((d) => (d.querySelector('.el-form-item__label, label')?.textContent ?? '').trim());
      const isTextarea = await this.dialog().locator('textarea').count();
      await this.shotEl('.el-dialog', 'case17-dialog-body');
      return {
        expect: '支持单个或批量粘贴。可用换行、逗号或空格分隔，单次最多 5000 个 UID',
        real: `label=${label}; textarea=${isTextarea}; placeholder=${info.placeholder}`,
        pass: info.placeholder === '支持单个或批量粘贴。可用换行、逗号或空格分隔，单次最多 5000 个 UID' && isTextarea === 1 && label.includes('用户 UID')
      };
    });
    await this.check('用例#17-③ 弹窗底部显示「取消」与「确认添加」按钮', async () => {
      const info = await this.addDialogInfo();
      const ok = info.buttons.includes('取消') && info.buttons.includes('确认添加');
      return { expect: '取消 / 确认添加', real: info.buttons.join(' / '), pass: ok };
    });
    await this.check('用例#17-④ 点击取消后弹窗关闭，列表数据与 Total 无变化', async () => {
      const before = { rows: await this.rowCount(), total: await this.totalText() };
      await this.closeAddDialog();
      await this.waitTableSettled();
      const after = { rows: await this.rowCount(), total: await this.totalText() };
      const dialogOpen = await this.dialog().isVisible().catch(() => false);
      return {
        expect: `弹窗关闭且 rows=${before.rows}/total=${before.total} 不变`,
        real: `dialogOpen=${dialogOpen}; rows=${after.rows}; total=${after.total}`,
        pass: !dialogOpen && after.rows === before.rows && after.total === before.total
      };
    });

    // ===== 用例#18 添加单个有效 UID =====
    await this.act(`用例#18 前置 确认 ${U1} 不在白名单`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
    });
    await this.act(`用例#18 步骤2~4 添加 ${U1} 并观察添加结果`, async () => {
      const r = await this.addUids(U1);
      this.dumpJson('case18-add-result.json', r);
      this.lastAdd = r;
      await this.shot('case18-add-result', true);
    });
    await this.act(`用例#18 步骤5~6 查询 ${U1}`, async () => {
      await this.queryByUid(U1);
      await this.shot('case18-row', true);
    });
    await this.check('用例#18-① 提交后页面显示添加结果（总计 1、成功 1、失败 0）', async () => {
      const r = this.lastAdd!;
      const c = this.resultCounts(r);
      return {
        expect: '添加结果展示成功 1 / 失败 0（用例原文：总计1/成功1/失败0）',
        real: `kind=${r.kind}; 成功=${c.success}; 失败=${c.fail}; 页面文案「${r.text}」`,
        pass: c.success === 1 && c.fail === 0
      };
    });
    await this.check(`用例#18-② 查询后列表显示 1 行且用户 UID=${U1}`, async () => {
      const rows = await this.rows();
      return { expect: `1 行, UID=${U1}`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === U1 };
    });
    await this.check('用例#18-③ 该行添加人显示当前登录账号 qa-ai', async () => {
      const row = (await this.rows())[0] ?? [];
      return { expect: 'qa-ai', real: row[7] ?? '', pass: (row[7] ?? '') === 'qa-ai' };
    });
    await this.check('用例#18-④ 该行添加时间显示当前日期时间（yyyy-MM-dd HH:mm:ss）', async () => {
      const row = (await this.rows())[0] ?? [];
      const t = row[6] ?? '';
      return { expect: `以 ${this.today} 开头的 yyyy-MM-dd HH:mm:ss`, real: t, pass: t.startsWith(this.today) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t) };
    });
    await this.act(`用例#18 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUids([U1]); });

    // ===== 用例#19 批量添加 =====
    await this.act(`用例#19 前置 确认 ${U2}/${U3}/${U4} 均不在白名单`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U2);
      await this.ensureAbsent(U3);
      await this.ensureAbsent(U4);
    });
    await this.act(`用例#19 步骤2~4 批量添加 3 枚 UID（换行分隔）并观察结果`, async () => {
      const r = await this.addUids(`${U2}\n${U3}\n${U4}`);
      this.dumpJson('case19-add-result.json', r);
      this.lastAdd = r;
    });
    await this.act(`用例#19 步骤5~6 查询 ${U2}`, async () => {
      await this.queryByUid(U2);
      await this.shot('case19-batch-row', true);
    });
    await this.check('用例#19-① 添加结果显示成功 3 / 失败 0（总计 3）', async () => {
      const c = this.resultCounts(this.lastAdd!);
      return { expect: '成功 3 / 失败 0（用例原文：总计3/成功3/失败0）', real: `成功=${c.success}; 失败=${c.fail}; 文案「${this.lastAdd!.text}」`, pass: c.success === 3 && c.fail === 0 };
    });
    await this.check(`用例#19-② 查询 ${U2} 显示 1 行且添加人为 qa-ai`, async () => {
      const rows = await this.rows();
      return { expect: `1 行, UID=${U2}, 添加人=qa-ai`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}, 添加人=${rows[0]?.[7] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === U2 && rows[0]?.[7] === 'qa-ai' };
    });
    await this.check('用例#19-③ 该行添加时间为当前日期时间', async () => {
      const t = (await this.rows())[0]?.[6] ?? '';
      return { expect: `以 ${this.today} 开头`, real: t, pass: t.startsWith(this.today) };
    });
    await this.act(`用例#19 清理 页面删除自建 ${U2}/${U3}/${U4}`, async () => { await this.cleanupUids([U2, U3, U4]); });

    // ===== 用例#20 添加已存在 UID =====
    await this.act(`用例#20 前置 构造 ${U1} 在白名单（页面添加）`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUids(U1);
    });
    await this.act(`用例#20 步骤2~4 再次添加 ${U1} 并观察结果`, async () => {
      const r = await this.addUids(U1);
      this.dumpJson('case20-add-result.json', r);
      this.lastAdd = r;
      await this.shot('case20-duplicate-result', true);
    });
    await this.act(`用例#20 步骤5 查询 ${U1} 确认原数据不变`, async () => {
      await this.queryByUid(U1);
    });
    await this.check('用例#20-① 页面显示添加结果（总计 1、成功 0、失败 1）', async () => {
      const c = this.resultCounts(this.lastAdd!);
      return { expect: '成功 0 / 失败 1（用例原文：总计1/成功0/失败1）', real: `成功=${c.success}; 失败=${c.fail}; 文案「${this.lastAdd!.text}」`, pass: c.success === 0 && c.fail === 1 };
    });
    await this.check(`用例#20-② 失败原因明细显示「已经存在」及对应 UID ${U1}`, async () => {
      const t = this.lastAdd!.text;
      return { expect: '含「已经存在」与 UID', real: t, pass: t.includes('已经存在') && t.includes(U1) };
    });
    await this.check(`用例#20-③ 查询该 UID 列表仍显示 1 行（原数据不变）`, async () => {
      const rows = await this.rows();
      return { expect: '1 行', real: `${rows.length} 行, UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === U1 };
    });
    await this.act(`用例#20 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUids([U1]); });

    // ===== 用例#21 添加不存在用户 UID =====
    await this.act('用例#21 步骤1~2 进入页面并打开添加弹窗', async () => {
      await this.enterPage();
      await this.openAddDialog();
    });
    await this.act(`用例#21 步骤3~4 输入 ${NONEXIST} 并确认添加`, async () => {
      const r = await this.submitAdd(NONEXIST);
      this.dumpJson('case21-add-result.json', r);
      this.lastAdd = r;
      await this.closeAddDialog();
      await this.shot('case21-nonexistent-result', true);
    });
    await this.act(`用例#21 步骤5 查询 ${NONEXIST} 确认无落库`, async () => {
      await this.queryByUid(NONEXIST);
    });
    await this.check('用例#21-① 页面显示添加结果（总计 1、成功 0、失败 1）', async () => {
      const c = this.resultCounts(this.lastAdd!);
      return { expect: '成功 0 / 失败 1（用例原文：总计1/成功0/失败1）', real: `成功=${c.success}; 失败=${c.fail}; 文案「${this.lastAdd!.text}」`, pass: c.success === 0 && c.fail === 1 };
    });
    await this.check('用例#21-② 失败原因明细显示「用户id不存在」及对应 UID', async () => {
      const t = this.lastAdd!.text;
      return { expect: '含「用户id不存在」与 UID', real: t, pass: t.includes('用户id不存在') && t.includes(NONEXIST) };
    });
    await this.check('用例#21-③ 查询该 UID 显示 No Data（无数据落库）', async () => {
      const e = await this.emptyText();
      const n = await this.rowCount();
      return { expect: 'No Data / 0 行', real: `empty=${e}; rows=${n}`, pass: e === 'No Data' && n === 0 };
    });

    // ===== 用例#22 软删后复活 =====
    await this.act(`用例#22 前置 确认 ${U1} 不在白名单并首次添加`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUids(U1);
    });
    await this.act(`用例#22 前置 查询 ${U1} 记录首次添加时间并页面删除（构造软删）`, async () => {
      await this.queryByUid(U1);
      const row = (await this.rows())[0] ?? [];
      this.firstAddTime = row[6] ?? '';
      await this.rowCheckbox(0);
      await this.deleteSelected(true);
      await this.shot('case22-after-soft-delete', true);
    });
    await this.act(`用例#22 前置 确认软删后查询 No Data 并重新添加 ${U1}`, async () => {
      await this.queryByUid(U1);
      if ((await this.rowCount()) !== 0) throw new Error('软删后查询仍有数据，前置状态不成立');
      const r = await this.addUids(U1);
      this.dumpJson('case22-revive-result.json', r);
      this.lastAdd = r;
    });
    await this.act(`用例#22 步骤5~6 查询 ${U1} 查看复活后行数据`, async () => {
      await this.queryByUid(U1);
      await this.shot('case22-revived-row', true);
    });
    await this.check('用例#22-① 添加结果显示成功 1 / 失败 0（复活计入成功）', async () => {
      const c = this.resultCounts(this.lastAdd!);
      return { expect: '成功 1 / 失败 0', real: `成功=${c.success}; 失败=${c.fail}; 文案「${this.lastAdd!.text}」`, pass: c.success === 1 && c.fail === 0 };
    });
    await this.check(`用例#22-② 查询列表显示 1 行 ${U1}`, async () => {
      const rows = await this.rows();
      return { expect: `1 行 UID=${U1}`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === U1 };
    });
    await this.check('用例#22-③ 添加时间为当前日期时间（复活刷新，晚于首次添加时间）', async () => {
      const t = (await this.rows())[0]?.[6] ?? '';
      return { expect: `≥ 首次 ${this.firstAddTime} 且为当天`, real: t, pass: t.startsWith(this.today) && t >= this.firstAddTime };
    });
    await this.check('用例#22-④ 添加人显示当前账号 qa-ai', async () => {
      const s = (await this.rows())[0]?.[7] ?? '';
      return { expect: 'qa-ai', real: s, pass: s === 'qa-ai' };
    });
    await this.act(`用例#22 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUids([U1]); });

    // ===== 用例#23 重复输入同一 UID =====
    await this.act(`用例#23 前置 确认 ${U1} 不在白名单`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
    });
    await this.act(`用例#23 步骤2~4 输入 ${U1},${U1},${U1} 并确认添加`, async () => {
      const r = await this.addUids(`${U1},${U1},${U1}`);
      this.dumpJson('case23-dedupe-result.json', r);
      this.lastAdd = r;
    });
    await this.act(`用例#23 步骤5~6 查询 ${U1} 查看是否重复`, async () => {
      await this.queryByUid(U1);
      await this.shot('case23-dedupe-row', true);
    });
    await this.check('用例#23-① 添加结果显示成功 1（去重后按 1 个处理）', async () => {
      const c = this.resultCounts(this.lastAdd!);
      return { expect: '成功 1（总计 1）', real: `成功=${c.success}; 失败=${c.fail}; 文案「${this.lastAdd!.text}」`, pass: c.success === 1 };
    });
    await this.check('用例#23-② 查询该 UID 列表仅显示 1 行（无重复行）', async () => {
      const n = await this.rowCount();
      return { expect: '1', real: String(n), pass: n === 1 };
    });
    await this.act(`用例#23 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUids([U1]); });

    // ===== 用例#24 分隔符变体（3 数据行） =====
    const variants: Array<{ key: string; text: string }> = [
      { key: 'a-逗号', text: `${UA},${UB}` },
      { key: 'b-空格', text: `${UA} ${UB}` },
      { key: 'c-换行', text: `${UA}\n${UB}` }
    ];
    for (const v of variants) {
      await this.act(`用例#24[数据行${v.key}] 前置 确认 ${UA}/${UB} 不在白名单`, async () => {
        await this.enterPage();
        await this.ensureAbsent(UA);
        await this.ensureAbsent(UB);
      });
      await this.act(`用例#24[数据行${v.key}] 步骤2~4 使用${v.key}分隔输入并确认添加`, async () => {
        const r = await this.addUids(v.text);
        this.dumpJson(`case24-${v.key}-result.json`, r);
        this.lastAdd = r;
      });
      await this.act(`用例#24[数据行${v.key}] 步骤5~6 查询 ${UA}`, async () => {
        await this.queryByUid(UA);
        await this.shot(`case24-${v.key}-row`, true);
      });
      await this.check(`用例#24[数据行${v.key}]-① 添加结果显示成功 2 / 失败 0（总计 2）`, async () => {
        const c = this.resultCounts(this.lastAdd!);
        return { expect: '成功 2 / 失败 0', real: `成功=${c.success}; 失败=${c.fail}; 文案「${this.lastAdd!.text}」`, pass: c.success === 2 && c.fail === 0 };
      });
      await this.check(`用例#24[数据行${v.key}]-② 查询 ${UA} 显示 1 行且添加人为 qa-ai`, async () => {
        const rows = await this.rows();
        return { expect: `1 行, UID=${UA}, 添加人=qa-ai`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}, 添加人=${rows[0]?.[7] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === UA && rows[0]?.[7] === 'qa-ai' };
      });
      await this.act(`用例#24[数据行${v.key}] 清理 页面删除自建 ${UA}/${UB}`, async () => { await this.cleanupUids([UA, UB]); });
    }
  }

  private lastAdd: AddResult | null = null;
  private firstAddTime = '';
}

await new AddCase().execute();
