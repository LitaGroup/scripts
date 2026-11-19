/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」仅时间条件删除实际执行与恢复（用例#41，需求方裁决授权）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2，BD-06）
 * 覆盖：#41 当天（2026-11-19）存量 3 条的实际时间条件删除 + 同用例批量恢复（No Data/Total 0 → 3 行/Total 1003）
 * 数据安全：仅针对执行当天存量（前置校验，范围 >10 条立即阻塞停止）；严禁对 2026-10-19 的 1000 条执行实际删除；
 *           删除后立即通过「添加用户」批量恢复全部 UID；元数据变化（createTime/createdBy）在结果中如实披露。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc09-time-delete-restore.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';

/** 自建测试 UID 池（用于识别并清理前序用例可能的残留，绝不清理存量 UID） */
const SELF_UID_POOL = ['19440456', '13365989', '8268067', '7446886', '7433600', '7423160', '7398493', '7384743'];

class TimeDeleteRestoreCase extends GameEntryBase {
  constructor() { super('tc09-time-delete-restore'); this.total = 14; }

  private confirmSemantics(text: string): boolean {
    return text.includes('删除确认') && text.includes('确定删除') && text.includes('只会删除符合该筛选条件的用户');
  }

  protected async run(): Promise<void> {
    // 安全护栏：需求方 2026-11-19 20:38 裁决“不再操作 22518445/12811470/5519 三行”，默认禁止重复执行；
    // 如确需复验，必须先确认当天 3 条存量可恢复（尤其 22518445/12811470 无 user_profile），再显式设置 ALLOW_CASE41=1。
    if (process.env.ALLOW_CASE41 !== '1') {
      await this.act('用例#41 安全护栏：默认禁止重复执行（需 ALLOW_CASE41=1）', async () => {
        this.skip('按需求方裁决，#41 不重复执行；如确需复验，请先确认 3 条存量可恢复并显式设置 ALLOW_CASE41=1');
      });
      return;
    }
    await this.act('用例#41 步骤1 进入游戏入口配置页面', async () => {
      await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
      await this.gotoPageDirect(this.page!);
    });
    await this.act('用例#41 步骤2~3 选择执行当天为起止日期并查询', async () => {
      await this.clickReset();
      await this.pickDateRange(this.today, this.today);
      await this.clickQuery();
      await this.shot('case41-today-before', true);
    });
    await this.act('用例#41 前置数据核查 从页面读取当天范围全部 UID（>10 条阻塞）', async () => {
      this.beforeCount = await this.rowCount();
      this.beforeUids = (await this.rows()).map((r) => r[1]);
      this.beforeTotal = await this.totalNumber();
      this.dumpJson('case41-before.json', { date: this.today, rows: this.beforeCount, total: this.beforeTotal, uids: this.beforeUids });
      if (this.beforeCount > 10) {
        this.blocked = true;
        return;
      }
      if (this.beforeCount !== this.beforeTotal) throw new Error(`列表行数(${this.beforeCount})与 Total(${this.beforeTotal})不一致`);
      if (this.beforeCount > 3) {
        // 4~10 条：先识别并页面清理自建 UID 残留，再复核当天范围
        const selfLeft = this.beforeUids.filter((u) => SELF_UID_POOL.includes(u));
        for (const uid of selfLeft) {
          await this.queryByUid(uid);
          if ((await this.rowCount()) > 0) await this.deleteFiltered(true);
        }
        await this.clickReset();
        await this.pickDateRange(this.today, this.today);
        await this.clickQuery();
        this.beforeCount = await this.rowCount();
        this.beforeUids = (await this.rows()).map((r) => r[1]);
        this.beforeTotal = await this.totalNumber();
        this.dumpJson('case41-before-after-cleanup.json', { rows: this.beforeCount, total: this.beforeTotal, uids: this.beforeUids });
        if (this.beforeCount !== 3) this.blocked = true;
      }
    });

    if (this.blocked) {
      await this.check('用例#41-前置 当天范围数据异常（>10 条或清理后仍≠3），按用例判定阻塞停止', async () => {
        return {
          expect: '当天范围 = 3 条',
          real: `实际 ${this.beforeCount} 条（Total ${this.beforeTotal}）：${this.beforeUids.join(',')}`,
          pass: false,
          message: '数据异常，用例#41 阻塞停止执行，未执行任何删除'
        };
      });
      return;
    }

    await this.check('用例#41-① 步骤3 查询后列表显示 3 行且 Total=3，与前置记录一致', async () => {
      const [n, t] = [await this.rowCount(), await this.totalNumber()];
      return {
        expect: `3 行 / Total 3（页面记录 ${this.beforeUids.join(',')}）`,
        real: `${n} 行 / Total ${t} / UID=${this.beforeUids.join(',')}`,
        pass: n === 3 && t === 3 && this.beforeCount === 3 && this.beforeUids.length === 3
      };
    });

    await this.act('用例#41 步骤4~5 点击删除筛选结果并在确认弹窗确认', async () => {
      this.confirmText = await this.deleteFiltered(true);
      await this.shot('case41-after-delete', true);
    });
    await this.check('用例#41-② 确认弹窗提示删除范围，确认后列表 No Data 且 Total 0', async () => {
      const [n, e, t] = [await this.rowCount(), await this.emptyText(), await this.totalText()];
      return {
        expect: `弹窗提示删除范围（用例原文「将删除当前筛选条件下全部有效白名单」，实际文案记录偏差 D-10）且 0 行/No Data/Total 0`,
        real: `弹窗「${this.confirmText}」；${n} 行 / ${e} / ${t}`,
        pass: this.confirmSemantics(this.confirmText) && n === 0 && e === 'No Data' && t === 'Total 0'
      };
    });

    await this.act('用例#41 步骤6 按当天日期范围重新查询', async () => {
      await this.clickQuery();
      await this.shot('case41-requery-empty', true);
    });
    await this.check('用例#41-③ 删除后按该日期范围重新查询显示 No Data 且 Total 0', async () => {
      const [n, e, t] = [await this.rowCount(), await this.emptyText(), await this.totalText()];
      return { expect: '0 行 / No Data / Total 0', real: `${n} 行 / ${e} / ${t}`, pass: n === 0 && e === 'No Data' && t === 'Total 0' };
    });

    await this.act('用例#41 步骤7 通过添加用户批量恢复全部被删 UID', async () => {
      await this.openAddDialog();
      const result = await this.submitAdd(this.beforeUids.join('\n'));
      this.dumpJson('case41-restore-result.json', result);
      this.restoreText = result.text;
      await this.closeAddDialog();
    });
    await this.act('用例#41 步骤8a 按当天日期范围查询验证恢复', async () => {
      await this.clickQuery();
      this.restoredRows = await this.rows();
      this.dumpJson('case41-restored.json', { rows: this.restoredRows.length, uids: this.restoredRows.map((r) => r[1]) });
      await this.shot('case41-restored', true);
    });
    await this.check('用例#41-④ 恢复后查询显示 3 行且包含全部被删 UID（批量复活）', async () => {
      const uids = this.restoredRows.map((r) => r[1]);
      const ok = this.restoredRows.length === 3 && this.beforeUids.every((u) => uids.includes(u));
      return { expect: `3 行且含 ${this.beforeUids.join(',')}`, real: `${this.restoredRows.length} 行: ${uids.join(',')}`, pass: ok };
    });

    await this.act('用例#41 步骤8b 点击重置后查看全量 Total', async () => {
      await this.clickReset();
      await this.shot('case41-after-reset', true);
    });
    await this.check('用例#41-⑤ 重置后全量 Total 恢复显示 Total 1003', async () => {
      const t = await this.totalText();
      return { expect: 'Total 1003', real: t, pass: t === 'Total 1003' };
    });
    await this.check('用例#41-⑥ 恢复行添加时间为当前时间、添加人为当前账号（元数据变化如实披露）', async () => {
      const rows = this.restoredRows;
      const times = rows.map((r) => r[6] ?? '');
      const creators = rows.map((r) => r[7] ?? '');
      const ok = rows.length === 3 && times.every((t) => t.startsWith(this.today) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)) && creators.every((c) => c === 'qa-ai');
      return {
        expect: '3 行添加时间=当天当前时间、添加人=qa-ai（原始 migration 元数据无法恢复）',
        real: `时间=${times.join(' | ')}; 添加人=${creators.join(' | ')}`,
        pass: ok
      };
    });
  }

  private blocked = false;
  private beforeCount = 0;
  private beforeTotal = -1;
  private beforeUids: string[] = [];
  private confirmText = '';
  private restoreText = '';
  private restoredRows: string[][] = [];
}

await new TimeDeleteRestoreCase().execute();
