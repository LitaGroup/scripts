/**
 * 项目 3744 / BL-0057：铭牌管理「是否是大铭牌」字段级独立权限 — 主执行脚本（#1~#10、#13）。
 * 用例来源：TK-0764 HANDOFF v3 九列用例（13 条）；技术方案：/98-tasks/20261127/764/TECH_DESIGN（v2）。
 * 覆盖：#1 添加弹窗展示/默认否/取消无副作用；#2 D1~D4 添加保存值一致；#3 无字段 key 添加不展示且存否；
 *       #4 R1/R2 有权限编辑回显/改值/留痕；#5 E1/E2 无字段 key 编辑原值保留/留痕；#6 列表列展示；
 *       #7 勾选字段 key 重登生效；#8 取消字段 key 重登不展示（兼基线）；#9 权限缓存约 120s 生效；#10 搜索/重置/分页回归；
 *       #13（条件性）仅有字段 key 无页面节点时菜单不可见且直达被拒。
 * 数据隔离：仅页面级构造；自建铭牌统一 qa_bigflag_<runId>_ 前缀，页面无删除入口按前缀保留；专用角色/账号结束删除。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=qa-ai ADMIN_PASSWORD=*** NOAUTH_USERNAME=qa-noauth NOAUTH_PASSWORD=***
 *       node projects/feature/lita-admin-3744-name-plate-bigflag/tests/tc01-name-plate.test.ts [--case=1] [--run-id=...]
 */
import { AdminBase, ROLE_HASH, PAGE_HASH, PAGE_URL, UI_BASE, delay, saveRunState, type PlateRecord } from './lib/admin-base.ts';

const CP: Record<number, number> = { 1: 12, 2: 16, 3: 5, 4: 12, 5: 12, 6: 3, 7: 3, 8: 2, 9: 1, 10: 3, 13: 2 };

function parseTime(text: string): number {
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

class NamePlateBigFlagRunner extends AdminBase {
  private aiUser = process.env.ADMIN_USERNAME;
  private aiPwd = process.env.ADMIN_PASSWORD;

  constructor() {
    super('tk0768-name-plate', CP);
  }

  private async ensureMtimeGap(record: PlateRecord | undefined): Promise<void> {
    if (!record?.createdAt) return;
    const created = Date.parse(record.createdAt);
    const started = Date.now();
    while (Date.now() - created < 2500 && Date.now() - started < 10000) await delay(200);
  }

  private muserMatches(value: string, expectedUser: string, expectedDisplay?: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (v.includes(expectedUser)) return true;
    if (expectedDisplay && expectedDisplay.trim() && v.includes(expectedDisplay.trim())) return true;
    return false;
  }

  protected async run(): Promise<void> {
    const needSpecial = [3, 5, 6, 7, 8, 9, 13].some((n) => this.wants(n));
    if (!this.aiUser || !this.aiPwd) throw new Error('缺少 ADMIN_USERNAME/ADMIN_PASSWORD 运行时环境变量');
    await this.ensureLoginState(this.aiUser, this.aiPwd, this.aiStateFile, 'qa-ai');

    if (needSpecial) {
      await this.newCasePage(this.aiStateFile, ROLE_HASH);
      await this.ensureSpecialReady(this.page!);
      await this.reloginSpecial();
      this.addCleanup('恢复专用角色基线并删除专用账号/角色', async () => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const page = await this.newCasePage(this.aiStateFile, ROLE_HASH);
            await this.cleanupSpecial(page);
            return;
          } catch (e) {
            this.notes.push(`专用角色/账号清理第 ${attempt} 次失败：${(e as Error).message}`);
            await this.closeCasePage();
          }
        }
        throw new Error('专用角色/账号清理连续 2 次失败，见 run.json notes');
      });
    }

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
    if (this.wants(13)) await this.case13();
  }

  // ---------- #1 ----------
  private async case1(): Promise<void> {
    const page = await this.newCasePage(this.aiStateFile, PAGE_HASH);
    const beforeTotal = await this.totalCount(page);
    const beforeRows = (await this.rows(page)).length;
    const dlg = await this.openAddDialog(page);
    const labels = await this.dialogLabels(dlg);
    await this.shot('case1-add-dialog', true, page);

    await this.check('用例#1-① 添加弹窗展示「是否是大铭牌」字段', async () => {
      const count = await this.dialogItem(dlg, page, '是否是大铭牌').count();
      return { expect: '字段可见', real: count > 0 ? '可见' : '不可见', pass: count > 0 };
    });
    await this.check('用例#1-② 「是否是大铭牌」默认选中「否」', async () => {
      const checked = await this.bigFlagChecked(page, dlg);
      return { expect: '否', real: checked, pass: checked === '否' };
    });
    const existing: Array<[string, string, number]> = [
      ['③-1', '铭牌类型', 1],
      ['③-2', '铭牌ID', 1],
      ['③-3', '铭牌描述', 1],
      ['③-4', '铭牌宽度', 1],
      ['③-5', '铭牌高度', 1],
      ['③-6', '铭牌排序', 1],
      ['③-7', '铭牌icon', 1],
      ['③-8', '铭牌缩略图', 1],
      ['③-9', '铭牌大区配置', 1],
    ];
    for (const [tag, label, min] of existing) {
      await this.check(`用例#1-${tag} 既有表单项「${label}」正常展示`, async () => {
        const count = await this.dialogItem(dlg, page, label).count();
        return { expect: `>=${min}`, real: String(count), pass: count >= min };
      });
    }
    await this.cancelDialog(page, dlg);
    await this.waitTableSettled(page);
    await this.check('用例#1-④ 点击 Cancel 后弹窗关闭且列表记录总数不变', async () => {
      const afterTotal = await this.totalCount(page);
      const afterRows = (await this.rows(page)).length;
      const closed = !(await dlg.isVisible().catch(() => false));
      const pass = closed && afterTotal === beforeTotal && afterRows === beforeRows;
      return { expect: `弹窗关闭;Total=${beforeTotal};行数=${beforeRows}`, real: `弹窗${closed ? '关闭' : '仍打开'};Total=${afterTotal};行数=${afterRows}`, pass };
    });
    await this.shot('case1-after-cancel', true, page);
    this.notes.push(`#1 弹窗表单项：${labels.join('/')}`);
  }

  // ---------- #2 ----------
  private async case2(): Promise<void> {
    const page = await this.newCasePage(this.aiStateFile, PAGE_HASH);
    const runRows: Array<{ key: string; desc: string; type: string; bigFlag: '是' | '否'; expected: '是' | '否'; defaultOnly?: boolean }> = [
      { key: 'D1', desc: `qa_bigflag_${this.runId}_d1`, type: '普通铭牌', bigFlag: '是', expected: '是' },
      { key: 'D2', desc: `qa_bigflag_${this.runId}_d2`, type: '普通铭牌', bigFlag: '否', expected: '否' },
      { key: 'D3', desc: `qa_bigflag_${this.runId}_d3`, type: '普通铭牌', bigFlag: '否', expected: '否', defaultOnly: true },
    ];

    // D4 条件行：先确认铭牌类型下拉是否存在「自定义铭牌」
    const probeDlg = await this.openAddDialog(page);
    const typeOptions = await this.plateTypeOptions(page, probeDlg);
    await this.cancelDialog(page, probeDlg);
    const hasCustom = typeOptions.includes('自定义铭牌');
    this.notes.push(`#2 铭牌类型选项：${typeOptions.join('/')}`);

    for (const row of runRows) {
      await this.check(`用例#2-①[数据行${row.key}] 保存后搜索结果仅显示该自建铭牌行`, async () => {
        // 复用已存在行（首次正式执行已创建并校验过 D1~D3；脚本修复后的定向复跑不重复造行）
        const rec = this.state.plates[row.desc]
          ? await this.ensurePlate(page, row.key, { desc: row.desc, type: row.type, bigFlag: row.defaultOnly ? '否' : row.bigFlag, runCase: 2 })
          : await this.createPlate(page, { desc: row.desc, type: row.type, bigFlag: row.defaultOnly ? undefined : row.bigFlag, runCase: 2 });
        const rows = await this.rows(page);
        const hitRows = rows.filter((r) => r[1] === row.desc);
        this.notes.push(`#2 ${row.key} 新增成功 ID=${rec.id} 列表值=${rows[0]?.[7] ?? ''}`);
        return { expect: `命中 1 行：${row.desc}`, real: `命中 ${hitRows.length} 行`, pass: hitRows.length === 1 };
      });
      const rowsAfter = await this.rows(page);
      const hit = rowsAfter.find((r) => r[1] === row.desc);
      await this.check(`用例#2-②[数据行${row.key}] 列表「是否是大铭牌」列值=参数预期「${row.expected}」`, async () => {
        const real = hit?.[7] ?? '行不存在';
        return { expect: row.expected, real, pass: real === row.expected };
      });
      await this.check(`用例#2-③[数据行${row.key}] 列表「铭牌类型」列值参数行类型「${row.type}」`, async () => {
        const real = hit?.[6] ?? '行不存在';
        return { expect: row.type, real, pass: real === row.type };
      });
      await this.check(`用例#2-④[数据行${row.key}] 列表「铭牌描述」列与填写值一致`, async () => {
        const real = hit?.[1] ?? '行不存在';
        return { expect: row.desc, real, pass: real === row.desc };
      });
    }

    if (hasCustom) {
      const desc = `qa_bigflag_${this.runId}_d4`;
      await this.check('用例#2-①[数据行D4] 保存后搜索结果仅显示该自建铭牌行', async () => {
        if (this.state.plates[desc]) {
          await this.searchByDesc(page, desc);
          const rowsHit = await this.rows(page);
          const hitRows = rowsHit.filter((r) => r[1] === desc);
          this.notes.push(`#2 D4 复用已存在行（脚本修复定向复跑）`);
          return { expect: `命中 1 行：${desc}`, real: `命中 ${hitRows.length} 行`, pass: hitRows.length === 1 };
        }
        const rec = await this.createPlate(page, { desc, type: '自定义铭牌', bigFlag: '是', runCase: 2 });
        const rows = await this.rows(page);
        const hitRows = rows.filter((r) => r[1] === desc);
        this.notes.push(`#2 D4 新增成功 ID=${rec.id} 列表值=${rows[0]?.[7] ?? ''}`);
        return { expect: `命中 1 行：${desc}`, real: `命中 ${hitRows.length} 行`, pass: hitRows.length === 1 };
      });
      const rowsAfter = await this.rows(page);
      const hit = rowsAfter.find((r) => r[1] === desc);
      await this.check('用例#2-②[数据行D4] 列表「是否是大铭牌」列值=参数预期「是」', async () => {
        const real = hit?.[7] ?? '行不存在';
        return { expect: '是', real, pass: real === '是' };
      });
      await this.check('用例#2-③[数据行D4] 列表「铭牌类型」列值=自定义铭牌', async () => {
        const real = hit?.[6] ?? '行不存在';
        return { expect: '自定义铭牌', real, pass: real === '自定义铭牌' };
      });
      await this.check('用例#2-④[数据行D4] 列表「铭牌描述」列与填写值一致', async () => {
        const real = hit?.[1] ?? '行不存在';
        return { expect: desc, real, pass: real === desc };
      });
    } else {
      for (const tag of ['①', '②', '③', '④']) {
        await this.check(`用例#2-${tag}[数据行D4] 条件行（自定义铭牌）执行`, async () => {
          this.skip('条件不满足：铭牌类型下拉不存在「自定义铭牌」，按用例约定记录并跳过该行（未伪造）');
        });
      }
    }
    await this.shot('case2-final-list', true, page);
  }

  // ---------- #3 ----------
  private async case3(): Promise<void> {
    await this.reloginSpecial();
    const page = await this.newCasePage(this.specialStateFile, '#/dashboard', { waitTable: false });
    await this.waitMenuSettled(page);
    const navMode = await this.navigateToNamePlate(page);
    this.notes.push(`#3 专用账号导航方式：${navMode}`);

    const dlg = await this.openAddDialog(page);
    const labels = await this.dialogLabels(dlg);
    await this.check('用例#3-① 专用账号添加弹窗不展示「是否是大铭牌」表单项', async () => {
      const count = await this.dialogItem(dlg, page, '是否是大铭牌').count();
      return { expect: '0（不展示）', real: String(count), pass: count === 0 };
    });
    const otherFields: Array<[string, string]> = [['②-1', '铭牌类型'], ['②-2', '铭牌描述'], ['②-3', '铭牌排序']];
    for (const [tag, label] of otherFields) {
      await this.check(`用例#3-${tag} 其余表单项「${label}」正常展示且可填写`, async () => {
        const item = this.dialogItem(dlg, page, label);
        const visible = await item.isVisible().catch(() => false);
        const editable = label === '铭牌类型'
          ? await item.locator('.el-select').first().isVisible().catch(() => false)
          : await item.locator('input').first().isEditable().catch(() => false);
        return { expect: '可见且可操作', real: `visible=${visible}, editable=${editable}`, pass: visible && editable };
      });
    }

    const desc = `qa_bigflag_${this.runId}_nokey`;
    await this.selectElOption(page, dlg, this.dialogItem(dlg, page, '铭牌类型').locator('.el-select'), '普通铭牌');
    await this.dialogItem(dlg, page, '铭牌描述').locator('input').first().fill(desc);
    await this.dialogItem(dlg, page, '铭牌排序').locator('input').first().fill('99');
    await this.dialogItem(dlg, page, '铭牌宽度').locator('input').first().fill('250');
    await this.dialogItem(dlg, page, '铭牌高度').locator('input').first().fill('70');
    await this.uploadImages(page, dlg);
    await this.shot('case3-special-add', true, page);
    await this.submitDialog(page, dlg);
    await this.searchByDesc(page, desc);
    const hit = (await this.rows(page)).find((r) => r[1] === desc);
    await this.check('用例#3-③ 保存成功后列表该行「是否是大铭牌」列显示「否」', async () => {
      const real = hit?.[7] ?? '行不存在';
      const rec: PlateRecord = { desc, id: hit?.[0] ?? '', bigFlag: (real as '是' | '否'), type: hit?.[6] ?? '', runCase: 3, createdAt: new Date().toISOString() };
      this.state.plates[desc] = rec;
      saveRunState(this.state);
      return { expect: '否', real, pass: real === '否' };
    });
    await this.shot('case3-result', true, page);
    this.notes.push(`#3 专用账号弹窗表单项：${labels.join('/')}`);
  }

  // ---------- #4 ----------
  private async case4(): Promise<void> {
    const page = await this.newCasePage(this.aiStateFile, PAGE_HASH);
    const d1 = await this.ensurePlate(page, 'd1', { desc: `qa_bigflag_${this.runId}_d1`, type: '普通铭牌', bigFlag: '是', runCase: 4 });
    const d2 = await this.ensurePlate(page, 'd2', { desc: `qa_bigflag_${this.runId}_d2`, type: '普通铭牌', bigFlag: '否', runCase: 4 });

    const plans: Array<{ tag: string; rec: PlateRecord; original: '是' | '否'; target: '是' | '否' }> = [
      { tag: 'R1', rec: d2, original: d2.bigFlag, target: d2.bigFlag === '是' ? '否' : '是' },
      { tag: 'R2', rec: d1, original: d1.bigFlag, target: d1.bigFlag === '是' ? '否' : '是' },
    ];
    for (const plan of plans) {
      await this.ensureMtimeGap(plan.rec);
      await this.searchByDesc(page, plan.rec.desc);
      const before = (await this.rows(page)).find((r) => r[1] === plan.rec.desc);
      if (!before) throw new Error(`#4 ${plan.tag} 未找到目标行 ${plan.rec.desc}`);
      const oldMtime = before[8] ?? '';
      const oldMuser = before[9] ?? '';
      const dlg = await this.openEditDialog(page, plan.rec.desc);
      const descEcho = await this.dialogItem(dlg, page, '铭牌描述').locator('input').first().inputValue();
      const sortEcho = await this.dialogItem(dlg, page, '铭牌排序').locator('input').first().inputValue();
      await this.check(`用例#4-①[数据行${plan.tag}] 编辑弹窗展示「是否是大铭牌」字段`, async () => {
        const count = await this.dialogItem(dlg, page, '是否是大铭牌').count();
        return { expect: '字段可见', real: count > 0 ? '可见' : '不可见', pass: count > 0 };
      });
      await this.check(`用例#4-②[数据行${plan.tag}] 修改前字段选中值与列表当前值「${plan.original}」一致`, async () => {
        const checked = await this.bigFlagChecked(page, dlg);
        return { expect: plan.original, real: checked, pass: checked === plan.original };
      });
      await this.check(`用例#4-④[数据行${plan.tag}] 弹窗完整回显描述/排序且与列表一致`, async () => {
        const ok = descEcho === plan.rec.desc && sortEcho === (before[5] ?? '');
        return { expect: `描述=${plan.rec.desc};排序=${before[5] ?? ''}`, real: `描述=${descEcho};排序=${sortEcho}`, pass: ok };
      });
      await this.dialogItem(dlg, page, '是否是大铭牌').locator('.el-radio').filter({ hasText: new RegExp(`^${plan.target}$`) }).first().click();
      await this.submitDialog(page, dlg);
      await this.searchByDesc(page, plan.rec.desc);
      const after = (await this.rows(page)).find((r) => r[1] === plan.rec.desc);
      await this.check(`用例#4-③[数据行${plan.tag}] 保存后列表「是否是大铭牌」列变为「${plan.target}」`, async () => {
        const real = after?.[7] ?? '行不存在';
        return { expect: plan.target, real, pass: real === plan.target };
      });
      await this.check(`用例#4-⑤-1[数据行${plan.tag}] 保存后「最后修改时间」刷新且晚于修改前`, async () => {
        const now = after?.[8] ?? '';
        const a = parseTime(oldMtime);
        const b = parseTime(now);
        const pass = Number.isFinite(a) && Number.isFinite(b) ? b > a : now !== oldMtime;
        return { expect: `> ${oldMtime}`, real: now, pass };
      });
      await this.check(`用例#4-⑤-2[数据行${plan.tag}] 保存后「最后修改人」为当前执行账号 qa-ai`, async () => {
        const real = after?.[9] ?? '';
        const pass = this.muserMatches(real, this.aiUser ?? 'qa-ai');
        this.notes.push(`#4 ${plan.tag} 最后修改人显示=${real}（映射 qa-ai）`);
        return { expect: 'qa-ai', real, pass };
      });
      if (after) {
        plan.rec.bigFlag = (after[7] as '是' | '否');
        this.state.plates[plan.rec.desc] = plan.rec;
        saveRunState(this.state);
      }
      this.notes.push(`#4 ${plan.tag} 修改前最后修改人=${oldMuser}`);
      await this.shot(`case4-${plan.tag}-after`, true, page);
    }
  }

  // ---------- #5 ----------
  private async case5(): Promise<void> {
    // 先由 qa-ai 确保 BK-03「是/否」基准两行存在
    {
      const aiPage = await this.newCasePage(this.aiStateFile, PAGE_HASH);
      await this.ensurePlate(aiPage, 'yes', { desc: `qa_bigflag_${this.runId}_yes`, type: '普通铭牌', bigFlag: '是', runCase: 5 });
      await this.ensurePlate(aiPage, 'no', { desc: `qa_bigflag_${this.runId}_no`, type: '普通铭牌', bigFlag: '否', runCase: 5 });
    }
    await this.reloginSpecial();
    const page = await this.newCasePage(this.specialStateFile, '#/dashboard', { waitTable: false });
    await this.waitMenuSettled(page);
    const navMode = await this.navigateToNamePlate(page);
    this.notes.push(`#5 专用账号导航方式：${navMode}`);

    const plans: Array<{ tag: string; desc: string; original: '是' | '否' }> = [
      { tag: 'E1', desc: `qa_bigflag_${this.runId}_yes`, original: '是' },
      { tag: 'E2', desc: `qa_bigflag_${this.runId}_no`, original: '否' },
    ];
    for (const plan of plans) {
      await this.ensureMtimeGap(this.state.plates[plan.desc]);
      await this.searchByDesc(page, plan.desc);
      const before = (await this.rows(page)).find((r) => r[1] === plan.desc);
      if (!before) throw new Error(`#5 ${plan.tag} 未找到目标行 ${plan.desc}`);
      const oldMtime = before[8] ?? '';
      const dlg = await this.openEditDialog(page, plan.desc);
      await this.check(`用例#5-①[数据行${plan.tag}] Edit 弹窗不展示「是否是大铭牌」表单项`, async () => {
        const count = await this.dialogItem(dlg, page, '是否是大铭牌').count();
        return { expect: '0（不展示）', real: String(count), pass: count === 0 };
      });
      await this.dialogItem(dlg, page, '铭牌排序').locator('input').first().fill('98');
      await this.shot(`case5-${plan.tag}-edit`, true, page);
      let saveError = '';
      try {
        await this.submitDialog(page, dlg);
      } catch (e) {
        saveError = (e as Error).message;
      }
      await this.check(`用例#5-②[数据行${plan.tag}] 保存成功（弹窗关闭且无报错）`, async () => {
        const closed = !(await dlg.isVisible().catch(() => false));
        return { expect: '弹窗关闭', real: closed ? '弹窗关闭' : `未关闭：${saveError || '未知'}`, pass: closed && !saveError };
      });
      await this.searchByDesc(page, plan.desc);
      const after = (await this.rows(page)).find((r) => r[1] === plan.desc);
      await this.check(`用例#5-③[数据行${plan.tag}] 列表「是否是大铭牌」列仍为原值「${plan.original}」`, async () => {
        const real = after?.[7] ?? '行不存在';
        return { expect: plan.original, real, pass: real === plan.original };
      });
      await this.check(`用例#5-④[数据行${plan.tag}] 「铭牌排序」列显示修改后值 98`, async () => {
        const real = after?.[5] ?? '行不存在';
        return { expect: '98', real, pass: real === '98' };
      });
      await this.check(`用例#5-⑤-1[数据行${plan.tag}] 「最后修改时间」刷新且晚于修改前`, async () => {
        const now = after?.[8] ?? '';
        const a = parseTime(oldMtime);
        const b = parseTime(now);
        const pass = Number.isFinite(a) && Number.isFinite(b) ? b > a : now !== oldMtime;
        return { expect: `> ${oldMtime}`, real: now, pass };
      });
      await this.check(`用例#5-⑤-2[数据行${plan.tag}] 「最后修改人」为当前执行专用账号`, async () => {
        const real = after?.[9] ?? '';
        const pass = this.muserMatches(real, this.state.userName, 'qa bigflag test user');
        this.notes.push(`#5 ${plan.tag} 最后修改人显示=${real}（映射 ${this.state.userName} / 显示名 qa bigflag test user）`);
        return { expect: `${this.state.userName}（或显示名 qa bigflag test user）`, real, pass };
      });
      await this.shot(`case5-${plan.tag}-after`, true, page);
    }
  }

  // ---------- #6 ----------
  private async case6(): Promise<void> {
    {
      const aiPage = await this.newCasePage(this.aiStateFile, PAGE_HASH);
      await this.ensurePlate(aiPage, 'yes', { desc: `qa_bigflag_${this.runId}_yes`, type: '普通铭牌', bigFlag: '是', runCase: 6 });
      await this.ensurePlate(aiPage, 'no', { desc: `qa_bigflag_${this.runId}_no`, type: '普通铭牌', bigFlag: '否', runCase: 6 });
    }
    await this.reloginSpecial();
    const page = await this.newCasePage(this.specialStateFile, '#/dashboard', { waitTable: false });
    await this.waitMenuSettled(page);
    const navMode = await this.navigateToNamePlate(page);
    this.notes.push(`#6 专用账号导航方式：${navMode}`);

    await this.check('用例#6-① 列表表头包含「是否是大铭牌」列（11 列完整）', async () => {
      const headers = await this.tableHeaders(page);
      const expected = ['铭牌ID', '铭牌描述', '铭牌图片', '铭牌宽度', '铭牌高度', '铭牌排序', '铭牌类型', '是否是大铭牌', '最后修改时间', '最后修改人', '操作'];
      const ok = headers.length === 11 && headers.includes('是否是大铭牌') && expected.every((h, i) => headers[i] === h);
      return { expect: expected.join('/'), real: headers.join('/'), pass: ok };
    });
    await this.searchByDesc(page, `qa_bigflag_${this.runId}_`);
    const rows = await this.rows(page);
    const yesRow = rows.find((r) => r[1] === `qa_bigflag_${this.runId}_yes`);
    const noRow = rows.find((r) => r[1] === `qa_bigflag_${this.runId}_no`);
    await this.check('用例#6-②-1 自建「是」值行「是否是大铭牌」列显示「是」', async () => {
      const real = yesRow?.[7] ?? '行不存在';
      return { expect: '是', real, pass: real === '是' };
    });
    await this.check('用例#6-②-2 自建「否」值行「是否是大铭牌」列显示「否」', async () => {
      const real = noRow?.[7] ?? '行不存在';
      return { expect: '否', real, pass: real === '否' };
    });
    await this.shot('case6-list', true, page);
  }

  // ---------- #7 ----------
  private async case7(): Promise<void> {
    const page = await this.newCasePage(this.aiStateFile, ROLE_HASH);
    const dlg = await this.openEditRole(page, this.state.roleName);
    await this.prepareRoleTree(page, dlg);
    await this.check('用例#7-① 权限树存在「添加铭牌「是否是大铭牌」」节点且命名清晰', async () => {
      const node = this.treeNode(dlg, page, '添加铭牌「是否是大铭牌」');
      const visible = await node.isVisible().catch(() => false);
      const text = visible ? (await node.locator('.el-tree-node__label').innerText()).trim() : '';
      return { expect: '节点可见：添加铭牌「是否是大铭牌」', real: visible ? text : '不可见', pass: visible && text === '添加铭牌「是否是大铭牌」' };
    });
    await this.setTreeChecked(dlg, page, '添加铭牌「是否是大铭牌」', true);
    let saveError = '';
    try {
      await this.submitDialog(page, dlg);
    } catch (e) {
      saveError = (e as Error).message;
    }
    await this.check('用例#7-② 勾选后保存成功（弹窗关闭且无报错）', async () => {
      const closed = !(await dlg.isVisible().catch(() => false));
      return { expect: '保存成功且弹窗关闭', real: closed ? '弹窗关闭' : `未关闭：${saveError || '未知'}`, pass: closed && !saveError };
    });

    await this.reloginSpecial();
    const sp = await this.newCasePage(this.specialStateFile, '#/dashboard', { waitTable: false });
    await this.waitMenuSettled(sp);
    await this.navigateToNamePlate(sp);
    const add = await this.openSpecialAddDialog(sp);
    await this.check('用例#7-③ 专用账号重新登录后添加弹窗展示字段且默认「否」', async () => {
      const checked = await this.bigFlagChecked(sp, add.dlg);
      return { expect: '字段可见且默认否', real: `hasField=${add.hasField};checked=${checked}`, pass: add.hasField && checked === '否' };
    });
    await this.shot('case7-special-add', true, sp);
    await this.cancelDialog(sp, add.dlg);
  }

  // ---------- #8 ----------
  private async case8(): Promise<void> {
    const page = await this.newCasePage(this.aiStateFile, ROLE_HASH);
    // 前置：先建立「字段 key 已勾选」状态（若已勾选则跳过实际变更）
    let needGrant = true;
    {
      const dlg = await this.openEditRole(page, this.state.roleName);
      await this.prepareRoleTree(page, dlg);
      needGrant = (await this.treeState(dlg, page, '添加铭牌「是否是大铭牌」')) !== 'checked';
      await this.cancelDialog(page, dlg);
    }
    if (needGrant) {
      await this.setFieldKey(page, true);
      await this.reloginSpecial();
      const p = await this.newCasePage(this.specialStateFile, '#/dashboard', { waitTable: false });
      await this.waitMenuSettled(p);
      await this.navigateToNamePlate(p);
      const a = await this.openSpecialAddDialog(p);
      this.notes.push(`#8 前置建立字段 key 已勾选：字段可见=${a.hasField}`);
      await this.cancelDialog(p, a.dlg);
      await this.newCasePage(this.aiStateFile, ROLE_HASH);
    }

    const dlg = await this.openEditRole(page, this.state.roleName);
    await this.prepareRoleTree(page, dlg);
    await this.setTreeChecked(dlg, page, '添加铭牌「是否是大铭牌」', false);
    let saveError = '';
    try {
      await this.submitDialog(page, dlg);
    } catch (e) {
      saveError = (e as Error).message;
    }
    await this.check('用例#8-① 取消字段 key 勾选并保存成功（无报错）', async () => {
      const closed = !(await dlg.isVisible().catch(() => false));
      return { expect: '保存成功且弹窗关闭', real: closed ? '弹窗关闭' : `未关闭：${saveError || '未知'}`, pass: closed && !saveError };
    });

    await this.reloginSpecial();
    const sp = await this.newCasePage(this.specialStateFile, '#/dashboard', { waitTable: false });
    await this.waitMenuSettled(sp);
    await this.navigateToNamePlate(sp);
    const add = await this.openSpecialAddDialog(sp);
    await this.check('用例#8-② 专用账号重新登录后添加弹窗不展示字段且其余表单项正常', async () => {
      const otherOk = add.labels.includes('铭牌类型') && add.labels.includes('铭牌描述') && add.labels.includes('铭牌排序');
      return { expect: '字段不展示；其余表单项正常', real: `hasField=${add.hasField};labels=${add.labels.join('/')}`, pass: !add.hasField && otherOk };
    });
    await this.shot('case8-special-add', true, sp);
    await this.cancelDialog(sp, add.dlg);
  }

  // ---------- #9 ----------
  private async case9(): Promise<void> {
    // 基线：无字段 key（前置）
    await this.newCasePage(this.aiStateFile, ROLE_HASH);
    await this.ensureBaseline(this.page!);
    await this.reloginSpecial();

    const aiPage = await this.newCasePage(this.aiStateFile, ROLE_HASH);
    const { ctx: spCtx, page: sp } = await this.newAuxPage(this.specialStateFile, '#/dashboard');
    try {
      await this.waitMenuSettled(sp);
      await this.navigateToNamePlate(sp);
      const init = await this.openSpecialAddDialog(sp);
      this.notes.push(`#9 初始（未授权）字段可见=${init.hasField}`);
      await this.cancelDialog(sp, init.dlg);

      // qa-ai 勾选字段 key
      await this.gotoRoles(aiPage);
      await this.setFieldKey(aiPage, true);
      const grantedAt = Date.now();

      let appeared = false;
      let lastLabels: string[] = [];
      let lastState = '';
      for (let i = 0; i < 15 && !appeared; i++) {
        await delay(10000);
        try {
          await sp.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
          const loginVisible = await sp.locator('input[name="username"]').isVisible().catch(() => false);
          if (loginVisible) {
            lastState = '页面被重定向到登录页（会话失效）';
          } else {
            await this.waitTableReady(sp, 30000);
            const a = await this.openSpecialAddDialog(sp);
            lastLabels = a.labels;
            appeared = a.hasField;
            lastState = `hasField=${a.hasField}`;
            await this.cancelDialog(sp, a.dlg);
          }
        } catch (e) {
          lastState = (e as Error).message.slice(0, 160);
        }
        this.notes.push(`#9 等待 ${Math.round((Date.now() - grantedAt) / 1000)}s 后字段可见=${appeared}（${lastState}）`);
      }
      await this.check('用例#9-① 勾选后不重新登录，等待缓存约 2 分钟后添加弹窗展示「是否是大铭牌」', async () => {
        const waited = Math.round((Date.now() - grantedAt) / 1000);
        return {
          expect: '字段可见（约 120s 内）',
          real: appeared ? `第 ${waited}s 字段可见` : `等待 ${waited}s 仍不可见（${lastState}；重登后可见由 #7 证明）`,
          pass: appeared,
        };
      });
      await this.shot('case9-after-cache', true, sp);
    } finally {
      await ctxClose(spCtx);
    }
  }

  // ---------- #10 ----------
  private async case10(): Promise<void> {
    const page = await this.newCasePage(this.aiStateFile, PAGE_HASH);
    const defaultTotal = await this.totalCount(page);
    await this.searchByDesc(page, `qa_bigflag_${this.runId}_`);
    const rows = await this.rows(page);
    const prefix = `qa_bigflag_${this.runId}_`;
    const expectedRows = Object.values(this.state.plates).filter((p) => p.desc.startsWith(prefix)).length;
    await this.check('用例#10-① 按前缀搜索结果仅显示匹配的自建记录（行数=自建条数）', async () => {
      const allMatch = rows.every((r) => (r[1] ?? '').startsWith(prefix));
      const pass = allMatch && rows.length === expectedRows;
      return { expect: `${expectedRows} 行且全部匹配 ${prefix}`, real: `${rows.length} 行；desc=${rows.map((r) => r[1]).join('|')}`, pass };
    });
    const pagText = await this.paginationText(page);
    await this.resetFilters(page);
    await this.check('用例#10-② 点击 Reset Filters 后搜索输入清空且列表恢复默认总数', async () => {
      const val = await this.searchInputValue(page);
      const total = await this.totalCount(page);
      return { expect: `输入为空;Total=${defaultTotal}`, real: `输入=${JSON.stringify(val)};Total=${total}`, pass: val === '' && total === defaultTotal };
    });
    await this.check('用例#10-③ 分页组件正常展示且 Total 与列表数据量一致', async () => {
      const text = await this.paginationText(page);
      const total = await this.totalCount(page);
      const visible = await page.locator('.el-pagination').first().isVisible().catch(() => false);
      return { expect: '分页可见且含 Total', real: `visible=${visible};${text || pagText}`, pass: visible && /Total/i.test(text) && total > 0 };
    });
    await this.shot('case10-reset', true, page);
  }

  // ---------- #13 ----------
  private async case13(): Promise<void> {
    const page = await this.newCasePage(this.aiStateFile, ROLE_HASH);
    let blocked = '';
    try {
      await this.setFieldOnly(page);
    } catch (e) {
      blocked = (e as Error).message;
      this.notes.push(`#13 权限树仅勾字段子节点构造失败：${blocked}`);
    }
    if (blocked) {
      await this.check('用例#13-① 仅勾字段 key 不勾页面节点后菜单不可见', async () => {
        this.skip(`阻塞/未覆盖：权限树父子联动无法仅勾字段子节点（${blocked}）`);
      });
      await this.check('用例#13-② 直达路由被拒（跳转 404）', async () => {
        this.skip(`阻塞/未覆盖：权限树父子联动无法仅勾字段子节点（${blocked}）`);
      });
      return;
    }

    await this.reloginSpecial();
    const sp = await this.newCasePage(this.specialStateFile, '#/dashboard', { waitTable: false });
    await this.waitMenuSettled(sp);
    const menuItems = (await sp.locator('.el-menu-item:visible').allInnerTexts()).map((t) => t.trim());
    const groups = (await sp.locator('.el-submenu__title:visible').allInnerTexts()).map((t) => t.trim());
    const menuHasEntry = menuItems.includes('铭牌管理') || groups.includes('特效管理');
    // 直接访问确认页面权限是否仍被保留（用于判定「仅字段 key」前置是否可构造）
    await sp.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.waitTableReady(sp).catch(() => undefined);
    const directUrl = sp.url();
    const directTable = await sp.locator('.el-table').first().isVisible().catch(() => false);
    const pageStillGranted = directUrl.includes('/effect-manager/name-plate') && directTable;
    if (menuHasEntry || pageStillGranted) {
      // 父节点半选（is-indeterminate）仍被 updateRole 一并提交，权限树无法表达「仅字段 key、无页面节点」
      this.notes.push(`#13 阻塞：权限树父子联动，取消页面节点后保存仍保留页面权限（menu=${menuHasEntry}, direct=${pageStillGranted}, tree=parent:indeterminate/page:unchecked/field:checked）`);
      await this.check('用例#13-① 仅有字段 key（无页面节点）时左侧菜单不展示「铭牌管理」入口', async () => {
        this.skip('阻塞/未覆盖：权限树父子联动无法仅勾字段子节点（取消页面节点保存后菜单仍显示「铭牌管理」），按用例约定记录并上报父任务');
      });
      await this.check('用例#13-② 直达铭牌管理路由被拒并跳转 404 页', async () => {
        this.skip('阻塞/未覆盖：权限树父子联动无法仅勾字段子节点（直达路由仍可进入并展示列表），按用例约定记录并上报父任务');
      });
      await this.shot('case13-blocked', true, sp);
      return;
    }
    await this.check('用例#13-① 仅有字段 key（无页面节点）时左侧菜单不展示「铭牌管理」入口', async () => {
      return { expect: '菜单无「铭牌管理」/「特效管理」', real: `items=${menuItems.join('|')};groups=${groups.join('|')}`, pass: true };
    });
    await this.check('用例#13-② 直达铭牌管理路由被拒并跳转 404 页', async () => {
      await sp.waitForFunction(() => location.hash.includes('/404'), undefined, { timeout: 20000 }).catch(() => undefined);
      const url = sp.url();
      const tableVisible = await sp.locator('.el-table').first().isVisible().catch(() => false);
      return { expect: 'URL 含 #/404 且不展示列表', real: `url=${url};tableVisible=${tableVisible}`, pass: url.includes('/404') && !tableVisible };
    });
    await this.shot('case13-404', true, sp);
  }
}

async function ctxClose(ctx: { close: () => Promise<void> }): Promise<void> {
  await ctx.close().catch(() => undefined);
}

const runner = new NamePlateBigFlagRunner();
await runner.execute();
