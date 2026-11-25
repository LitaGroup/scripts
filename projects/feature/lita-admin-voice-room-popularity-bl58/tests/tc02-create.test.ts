/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - 单条新增（用例 #13~#17）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（PM-2、§4.2 新增弹窗定位、§5 断言映射）
 * 覆盖：#13 侧边推荐仅用户新增；#14 侧边推荐房+用户新增；#15 弹窗类型新增（USER ID 不渲染）；
 *       #16 新增弹窗类型选项收敛；#17 权重留空默认 0 与负数（r1/r2）
 * 数据隔离：每条用例自建独立记录，验证后按行删除；冲突按用例前置降级（#15 菲律宾->泰国）。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc02-create.test.ts [--case=13]
 */
import { join } from 'node:path';
import type { Page } from 'playwright';
import { AdminBase } from './lib/admin-base.ts';

class CreateTest extends AdminBase {
  constructor() {
    super('tc02-create', { 13: 3, 14: 3, 15: 4, 16: 2, 17: 4 });
  }

  private stateFile = '';

  protected async run(): Promise<void> {
    await this.act('登录 Admin 测试环境并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-ai.json');
      await this.ensureLoginState(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, this.stateFile);
    });
    try {
      if (this.wants(13)) await this.case13();
      if (this.wants(14)) await this.case14();
      if (this.wants(15)) await this.case15();
      if (this.wants(16)) await this.case16();
      if (this.wants(17)) await this.case17();
    } finally {
      await this.closeCasePage();
    }
  }

  // ---------------- #13 ----------------

  private async case13(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    let created = false;
    try {
      await this.act('用例#13 新增 菲律宾区/侧边推荐/仅用户 23/权重 58', async () => {
        await this.createRecommendation(page, { locale: '菲律宾区', type: '侧边推荐', userId: '23', weight: '58' });
        created = true;
      });
      await this.act('用例#13 筛选 菲律宾区+USER ID=23 定位新行', async () => {
        await this.selectOption(page, page, '地区', '菲律宾区');
        await this.fillPlaceholder(page, 'USER ID', '23');
        await this.search(page);
      });
      const rows = await this.readRows(page);
      await this.check('用例#13-① 筛选后新行可见（恰 1 行）', async () => {
        await this.shotEl('.el-table__body-wrapper', 'case13-new-row');
        return { expect: '筛选结果恰 1 行', real: `共 ${rows.length} 行`, pass: rows.length === 1 };
      });
      await this.check('用例#13-② 新行 USER ID=23、权重=58、类型=侧边推荐、大区=菲律宾(ph)', async () => {
        const r = rows[0] ?? [];
        const ok = r[4] === '23' && r[7] === '58' && r[6] === '侧边推荐' && r[1].startsWith('菲律宾(ph)');
        return { expect: 'USER ID=23，权重=58，推荐类型=侧边推荐，大区=菲律宾(ph)', real: `USER ID=${r[4] ?? ''}，权重=${r[7] ?? ''}，类型=${r[6] ?? ''}，大区=${r[1] ?? ''}`, pass: ok };
      });
      await this.act('用例#13 删除新行清理', async () => {
        if (await this.rowCount(page) > 0) await this.deleteRow(page, 0);
        await this.search(page);
      });
      await this.check('用例#13-③ 清理后该行不再显示', async () => {
        const count = await this.rowCount(page);
        await this.shot('case13-cleaned');
        return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
      });
    } finally {
      if (created) await this.cleanupByLocaleUser(page, '菲律宾区', '23').catch(() => undefined);
      await this.closeCasePage();
    }
  }

  // ---------------- #14 ----------------

  private async case14(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    let created = false;
    try {
      await this.act('用例#14 新增 越南区/侧边推荐/房间 10100001+用户 23/权重 158', async () => {
        await this.createRecommendation(page, { locale: '越南区', type: '侧边推荐', roomId: '10100001', userId: '23', weight: '158' });
        created = true;
      });
      await this.act('用例#14 筛选 越南区+ROOM ID=10100001 定位新行', async () => {
        await this.selectOption(page, page, '地区', '越南区');
        await this.fillPlaceholder(page, 'ROOM ID', '10100001');
        await this.search(page);
      });
      const rows = await this.readRows(page);
      await this.check('用例#14-① 筛选后新行可见（房+用形态恰 1 行）', async () => {
        await this.shotEl('.el-table__body-wrapper', 'case14-new-row');
        return { expect: '筛选结果恰 1 行', real: `共 ${rows.length} 行`, pass: rows.length === 1 };
      });
      await this.check('用例#14-② 新行 ROOM ID=10100001、USER ID=23、类型=侧边推荐、权重=158', async () => {
        const r = rows[0] ?? [];
        const ok = r[2] === '10100001' && r[4] === '23' && r[6] === '侧边推荐' && r[7] === '158';
        return { expect: 'ROOM ID=10100001，USER ID=23，推荐类型=侧边推荐，权重=158', real: `ROOM ID=${r[2] ?? ''}，USER ID=${r[4] ?? ''}，类型=${r[6] ?? ''}，权重=${r[7] ?? ''}`, pass: ok };
      });
      await this.act('用例#14 删除新行清理', async () => {
        if (await this.rowCount(page) > 0) await this.deleteRow(page, 0);
        await this.search(page);
      });
      await this.check('用例#14-③ 清理后行消失', async () => {
        const count = await this.rowCount(page);
        await this.shot('case14-cleaned');
        return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
      });
    } finally {
      if (created) await this.cleanupByLocaleRoom(page, '越南区', '10100001').catch(() => undefined);
      await this.closeCasePage();
    }
  }

  // ---------------- #15 ----------------

  private async case15(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    let created = false;
    let locale = '菲律宾区';
    try {
      // 就绪确认：菲律宾区+弹窗+ROOM ID=10100001 是否已有记录；有则按用例降级到泰国区
      await this.act('用例#15 就绪确认弹窗类型同键记录是否存在', async () => {
        await this.selectOption(page, page, '地区', '菲律宾区');
        await this.selectOption(page, page, '推荐类型', '弹窗');
        await this.fillPlaceholder(page, 'ROOM ID', '10100001');
        await this.search(page);
        if (await this.rowCount(page) > 0) locale = '泰国区';
        this.notes.push(`#15 使用大区：${locale}（菲律宾区同键记录=${await this.rowCount(page)} 行）`);
        await this.resetFilters(page);
      });
      const dlg = await this.openCreateDialog(page);
      await this.act('用例#15 选择弹窗类型并查看字段集合', async () => {
        await this.dialogSelect(page, dlg, '请选择推荐类型', '弹窗');
      });
      await this.check('用例#15-① 选择弹窗后弹窗内不显示 USER ID 输入项', async () => {
        const count = await this.dialogItemCount(dlg, 'USER ID');
        await this.shotEl('.el-dialog__wrapper:visible', 'case15-pop-dialog');
        return { expect: 'USER ID 项不渲染（count=0）', real: `count=${count}`, pass: count === 0 };
      });
      const labels = await this.dialogLabels(dlg);
      await this.check('用例#15-② 弹窗字段仅含 Locale/推荐类型/ROOM ID/权重（及侧边推荐说明），无进房人数限制/礼物流水上限', async () => {
        const required = ['Locale', '推荐类型', 'ROOM ID', '权重'];
        const allowed = [...required, '推荐说明'];
        const forbidden = labels.filter((l) => l.includes('进房人数限制') || l.includes('礼物流水上限'));
        const missing = required.filter((l) => !labels.includes(l));
        const extra = labels.filter((l) => !allowed.includes(l));
        const ok = missing.length === 0 && extra.length === 0 && forbidden.length === 0;
        return { expect: `必含 ${required.join('、')}；仅允许 ${allowed.join('/')}；无禁用字段`, real: `${labels.join('、')}；缺少=${missing.length ? missing.join('、') : '无'}；额外=${extra.length ? extra.join('、') : '无'}；禁用=${forbidden.length ? forbidden.join('、') : '无'}`, pass: ok };
      });
      await this.act('用例#15 填写并提交弹窗类型记录', async () => {
        await this.dialogSelect(page, dlg, '请选择区域', locale);
        await this.dialogFill(dlg, 'ROOM ID', '10100001');
        await this.dialogFill(dlg, '权重', '258');
        await this.submitCreateDialog(page, dlg);
        const hidden = await dlg.waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
        if (!hidden) throw new Error(`新增未成功：${(await this.drainToasts(page)).join(' | ')}`);
        created = true;
      });
      await this.act(`用例#15 筛选 ${locale}+推荐类型=弹窗 定位新行`, async () => {
        await this.selectOption(page, page, '地区', locale);
        await this.selectOption(page, page, '推荐类型', '弹窗');
        await this.search(page);
      });
      const rows = await this.readRows(page);
      await this.check('用例#15-③ 新行类型=弹窗、ROOM ID=10100001、USER ID 列显示 -', async () => {
        const r = rows.find((x) => x[2] === '10100001') ?? [];
        const ok = rows.length === 1 && r[6] === '弹窗' && r[2] === '10100001' && r[4] === '-';
        await this.shotEl('.el-table__body-wrapper', 'case15-new-row');
        return { expect: '恰 1 行：推荐类型=弹窗，ROOM ID=10100001，USER ID=-', real: `共 ${rows.length} 行；类型=${r[6] ?? ''}，ROOM ID=${r[2] ?? ''}，USER ID=${r[4] ?? ''}`, pass: ok };
      });
      await this.act('用例#15 删除新行清理', async () => {
        if (await this.rowCount(page) > 0) await this.deleteRow(page, 0);
        await this.search(page);
      });
      await this.check('用例#15-④ 清理后行消失', async () => {
        const count = await this.rowCount(page);
        await this.shot('case15-cleaned');
        return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
      });
    } finally {
      if (created) await this.cleanupByLocaleTypeRoom(page, locale, '弹窗', '10100001').catch(() => undefined);
      await this.closeCasePage();
    }
  }

  // ---------------- #16 ----------------

  private async case16(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const dlg = await this.openCreateDialog(page);
    let options: string[] = [];
    await this.act('用例#16 展开新增弹窗推荐类型下拉并查看选项', async () => {
      options = await this.openDropdownOptions(page, dlg, '请选择推荐类型');
      await this.shot('case16-type-options');
    });
    await this.check('用例#16-① 下拉选项恰为 弹窗/侧边推荐 两项', async () => {
      const sorted = [...options].sort();
      const expected = ['侧边推荐', '弹窗'].sort();
      return { expect: `恰好两项：${expected.join('/')}`, real: `共 ${options.length} 项：${options.join('/')}`, pass: sorted.length === 2 && sorted.every((v, i) => v === expected[i]) };
    });
    await this.act('用例#16 点击取消关闭弹窗', async () => {
      await this.closeDropdown(page);
      await this.closeDialog(dlg, '取 消');
    });
    await this.check('用例#16-② 取消后弹窗关闭', async () => {
      const visible = await dlg.isVisible().catch(() => false);
      await this.shot('case16-dialog-closed');
      return { expect: '弹窗不可见', real: visible ? '仍可见' : '已关闭', pass: !visible };
    });
    await this.closeCasePage();
  }

  // ---------------- #17 ----------------

  private async case17(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const rowsSpec: Array<{ row: number; weight: string; expect: string }> = [
      { row: 1, weight: '', expect: '0' },
      { row: 2, weight: '-5', expect: '-5' }
    ];
    try {
      for (const spec of rowsSpec) {
        await this.act(`用例#17 数据行${spec.row}：新增 阿拉伯区/侧边推荐/仅用户 23/权重「${spec.weight || '留空'}」`, async () => {
          await this.resetFilters(page);
          try {
            await this.createRecommendation(page, { locale: '阿拉伯语区', type: '侧边推荐', userId: '23', weight: spec.weight });
          } catch (e) {
            this.notes.push(`#17 数据行${spec.row} 新增异常：${(e as Error).message}`);
          }
        });
        await this.act(`用例#17 数据行${spec.row}：筛选 阿拉伯区+USER ID=23 查看权重`, async () => {
          await this.selectOption(page, page, '地区', '阿拉伯语区');
          await this.fillPlaceholder(page, 'USER ID', '23');
          await this.search(page);
        });
        const rows = await this.readRows(page);
        await this.check(`用例#17-①[数据行${spec.row}] 新行权重列显示 ${spec.expect}`, async () => {
          const r = rows[0] ?? [];
          await this.shotEl('.el-table__body-wrapper', `case17-r${spec.row}`);
          return { expect: `权重=${spec.expect}`, real: `行数=${rows.length}，权重=${r[7] ?? '(无行)'}`, pass: rows.length === 1 && r[7] === spec.expect };
        });
        await this.act(`用例#17 数据行${spec.row}：删除该行清理`, async () => {
          if (await this.rowCount(page) > 0) await this.deleteRow(page, 0);
          await this.search(page);
        });
        await this.check(`用例#17-②[数据行${spec.row}] 清理后记录消失`, async () => {
          const count = await this.rowCount(page);
          return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
        });
        await this.cleanupByLocaleUser(page, '阿拉伯语区', '23').catch(() => undefined);
      }
    } finally {
      await this.cleanupByLocaleUser(page, '阿拉伯语区', '23').catch(() => undefined);
      await this.closeCasePage();
    }
  }

  // ---------------- 清理辅助 ----------------

  private async cleanupByLocaleUser(page: Page, locale: string, userId: string): Promise<void> {
    if (!this.page) return;
    await this.resetFilters(page);
    await this.selectOption(page, page, '地区', locale);
    await this.fillPlaceholder(page, 'USER ID', userId);
    await this.search(page);
    const rows = await this.readRows(page);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
    }
  }

  private async cleanupByLocaleRoom(page: Page, locale: string, roomId: string): Promise<void> {
    if (!this.page) return;
    await this.resetFilters(page);
    await this.selectOption(page, page, '地区', locale);
    await this.fillPlaceholder(page, 'ROOM ID', roomId);
    await this.search(page);
    const rows = await this.readRows(page);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
    }
  }

  private async cleanupByLocaleTypeRoom(page: Page, locale: string, type: string, roomId: string): Promise<void> {
    if (!this.page) return;
    await this.resetFilters(page);
    await this.selectOption(page, page, '地区', locale);
    await this.selectOption(page, page, '推荐类型', type);
    await this.fillPlaceholder(page, 'ROOM ID', roomId);
    await this.search(page);
    const rows = await this.readRows(page);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
    }
  }
}

const test = new CreateTest();
await test.execute();
