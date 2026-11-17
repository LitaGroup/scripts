/**
 * 项目 3730 / TK-0322 用例集：新增/删除回归与空 Topic 校验（用例 #9、#10、#11、#16）
 * 用例来源：TK-0322 HANDOFF v5；技术方案：/task/20261117/TK-0322/TECH_DESIGN
 * 覆盖：#9 新增 qa-sort-insert 按字母序插入（①~⑥）；#10 二次确认删除 qa-sort-zzz（①~⑤）；
 *       #11 删除确认取消（①~④）；#16 空 Topic 提交被拦截（①~③）
 * 数据隔离：仅页面级自建 qa-sort- 数据（BD-01/BD-02/BD-03），用例内自清理，全部用例结束后统一清理
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-3730-bucket-topic-sort/tests/tc05-add-delete-regression.test.ts
 */
import { BucketBase } from './lib/bucket-base.ts';
import { BD01, BD01_ORDER, BD02, expectedOrder, selfSubsequence, seq } from './lib/bucket-data.ts';

interface Snapshot {
  topic: string;
  description: string;
  ruleCount: string;
  createTime: string;
}

function indexOfTopic(topics: string[], topic: string): number {
  return topics.indexOf(topic);
}

class BucketAddDeleteCase extends BucketBase {
  constructor() {
    super('bucket-topic-sort-tc05');
  }

  protected async run(): Promise<void> {
    this.total = 18;

    await this.act('qa-ai 真实登录 Admin', async () => {
      await this.login(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('BD-01 数据集就绪', async () => {
      await this.openBucketListViaMenu();
      await this.ensureBd01();
    });

    // ===== 用例 #9：新增回归 =====
    await this.act('用例9 前置：qa-sort-insert 不存在', async () => {
      await this.openBucketListViaMenu();
      await this.ensureInsertAbsent();
    });
    const baseline9: Snapshot[] = await this.readSnapshot();

    await this.act('用例9 弹窗新增 qa-sort-insert（描述：新增回归插入样本）', async () => {
      await this.addTopic(BD02.topic, BD02.description);
    });

    const afterAdd = await this.readSnapshot();
    const topics9 = afterAdd.map((r) => r.topic);
    const insertRow = afterAdd.find((r) => r.topic === BD02.topic);
    const dialogClosed = !(await this.dialogVisible());

    await this.check('用例#9-① 「新增 Topic」弹窗关闭', async () => {
      await this.shotEl('.el-table', 'case9-dialog-closed');
      return { expect: '新增弹窗关闭（不可见）', real: `弹窗可见=${!dialogClosed}`, pass: dialogClosed };
    });

    await this.check('用例#9-② 列表出现 Topic=qa-sort-insert、描述=新增回归插入样本 的新行', async () => {
      await this.shotEl('.el-table', 'case9-new-row');
      return {
        expect: 'qa-sort-insert | 新增回归插入样本',
        real: insertRow ? `${insertRow.topic} | ${insertRow.description}` : '未找到新行',
        pass: !!insertRow && insertRow.description === BD02.description
      };
    });

    await this.check('用例#9-③ 新行相对位置：qa-sort-B2 之后、qa-sort-mid 之前', async () => {
      const b2 = indexOfTopic(topics9, 'qa-sort-B2');
      const ins = indexOfTopic(topics9, BD02.topic);
      const mid = indexOfTopic(topics9, 'qa-sort-mid');
      await this.shotEl('.el-table', 'case9-insert-position');
      return {
        expect: 'B2 < insert < mid',
        real: `B2 下标=${b2}；insert 下标=${ins}；mid 下标=${mid}`,
        pass: b2 >= 0 && ins === b2 + 1 && mid === ins + 1
      };
    });

    await this.check('用例#9-④ 全量序列（含新行与存量行）与锁定比较器期望顺序一致', async () => {
      const expected = expectedOrder(topics9);
      await this.shotEl('.el-table', 'case9-full-order');
      return { expect: seq(expected), real: seq(topics9), pass: JSON.stringify(topics9) === JSON.stringify(expected) };
    });

    await this.check('用例#9-⑤ 其余 12 条自建行 Topic/描述/规则数/创建时间显示值与基线一致', async () => {
      const diffs: string[] = [];
      for (const base of baseline9.filter((r) => r.topic.startsWith('qa-sort-'))) {
        const now = afterAdd.find((r) => r.topic === base.topic);
        if (!now) { diffs.push(`${base.topic}: 行丢失`); continue; }
        if (now.description !== base.description) diffs.push(`${base.topic}: 描述 ${base.description}→${now.description}`);
        if (now.ruleCount !== base.ruleCount) diffs.push(`${base.topic}: 规则数 ${base.ruleCount}→${now.ruleCount}`);
        if (now.createTime !== base.createTime) diffs.push(`${base.topic}: 创建时间 ${base.createTime}→${now.createTime}`);
      }
      await this.shotEl('.el-table', 'case9-baseline-unchanged');
      return {
        expect: '12 条自建行 4 列显示值与新增前基线完全一致',
        real: diffs.length === 0 ? '12 条自建行显示值均未变化' : diffs.join('；'),
        pass: diffs.length === 0
      };
    });

    await this.check('用例#9-⑥ 列表中 Topic 以 qa-sort- 开头的行共 13 行', async () => {
      const self = selfSubsequence(topics9);
      await this.shotEl('.el-table', 'case9-self-count');
      return { expect: 'qa-sort- 行数=13', real: `qa-sort- 行数=${self.length}`, pass: self.length === 13 };
    });

    await this.act('用例9 清理：删除 qa-sort-insert 并确认行消失', async () => {
      await this.clickDelete(BD02.topic);
      await this.confirmDelete();
      await this.waitTableSettled();
      const topics = await this.readTopics();
      if (topics.includes(BD02.topic)) throw new Error('qa-sort-insert 清理失败：行仍存在');
    });

    // ===== 用例 #10：删除回归 =====
    await this.act('用例10 前置：确认 qa-sort-zzz 存在并记录基线', async () => {
      await this.openBucketListViaMenu();
      await this.waitTableSettled();
      const topics = await this.readTopics();
      if (!topics.includes('qa-sort-zzz')) throw new Error('前置不满足：qa-sort-zzz 不存在');
    });
    const baseline10 = await this.readSnapshot();
    let deleteDialogText = '';

    await this.act('用例10 点击 qa-sort-zzz 行「删除」并观察二次确认弹窗', async () => {
      deleteDialogText = await this.clickDelete('qa-sort-zzz');
      await this.shot('case10-delete-dialog');
    });

    await this.check('用例#10-① 删除前弹出二次确认弹窗（文案原样记录）', async () => {
      const visible = await this.page!.locator('.el-message-box').isVisible();
      return {
        expect: '弹出二次确认弹窗',
        real: `可见=${visible}；原文=${deleteDialogText}`,
        pass: visible && deleteDialogText.includes('qa-sort-zzz')
      };
    });

    await this.act('用例10 点击确认弹窗「确认删除」', async () => {
      await this.confirmDelete();
    });

    const afterDelete = await this.readSnapshot();
    const topics10 = afterDelete.map((r) => r.topic);

    await this.check('用例#10-② 确认后 qa-sort-zzz 行不再显示', async () => {
      await this.shotEl('.el-table', 'case10-row-removed');
      return { expect: 'qa-sort-zzz 不在列表', real: `qa-sort-zzz 显示=${topics10.includes('qa-sort-zzz')}`, pass: !topics10.includes('qa-sort-zzz') };
    });

    await this.check('用例#10-③ 剩余 11 条自建行相对顺序正确', async () => {
      const expectRest = BD01_ORDER.filter((t) => t !== 'qa-sort-zzz');
      const real = selfSubsequence(topics10);
      await this.shotEl('.el-table', 'case10-remaining-order');
      return { expect: seq(expectRest), real: seq(real), pass: JSON.stringify(real) === JSON.stringify(expectRest) };
    });

    await this.check('用例#10-④ 全量序列与锁定比较器期望顺序一致', async () => {
      const expected = expectedOrder(topics10);
      await this.shotEl('.el-table', 'case10-full-order');
      return { expect: seq(expected), real: seq(topics10), pass: JSON.stringify(topics10) === JSON.stringify(expected) };
    });

    await this.check('用例#10-⑤ 其余行显示值与基线一致且页面无错误提示', async () => {
      const diffs: string[] = [];
      for (const base of baseline10.filter((r) => r.topic !== 'qa-sort-zzz')) {
        const now = afterDelete.find((r) => r.topic === base.topic);
        if (!now) { diffs.push(`${base.topic}: 行丢失`); continue; }
        if (JSON.stringify(now) !== JSON.stringify(base)) diffs.push(`${base.topic}: 显示值变化`);
      }
      const errors = this.errorMessages();
      await this.shotEl('.el-table', 'case10-others-unchanged');
      return {
        expect: '其余行 4 列显示值与基线一致，且无错误类提示',
        real: `显示值差异=${diffs.join('；') || '无'}；错误提示=${errors.join(' / ') || '无'}`,
        pass: diffs.length === 0 && errors.length === 0
      };
    });

    await this.act('用例10 清理：按 BD-01 D12 参数重新创建 qa-sort-zzz 并确认恢复 12 行', async () => {
      const d12 = BD01.find((r) => r.topic === 'qa-sort-zzz');
      if (!d12) throw new Error('BD-01 缺少 D12 定义');
      await this.addTopic(d12.topic, d12.description);
      const rows = (await this.readSnapshot()).filter((r) => r.topic.startsWith('qa-sort-'));
      if (rows.length !== BD01.length) throw new Error(`BD-03 恢复失败：qa-sort- 行数=${rows.length}`);
    });

    // ===== 用例 #11：删除确认取消 =====
    await this.act('用例11 点击 qa-sort-zzz 行「删除」菜单', async () => {
      await this.openBucketListViaMenu();
      await this.waitTableSettled();
      await this.clickDelete('qa-sort-zzz');
    });

    await this.act('用例11 点击确认弹窗「取消」', async () => {
      await this.cancelDelete();
    });

    const afterCancel = await this.readSnapshot();
    const topics11 = afterCancel.map((r) => r.topic);

    await this.check('用例#11-① 确认弹窗关闭', async () => {
      const visible = await this.page!.locator('.el-message-box').isVisible().catch(() => false);
      await this.shot('case11-dialog-closed');
      return { expect: '确认弹窗关闭（不可见）', real: `弹窗可见=${visible}`, pass: !visible };
    });

    await this.check('用例#11-② qa-sort-zzz 行仍显示', async () => {
      await this.shotEl('.el-table', 'case11-zzz-visible');
      return { expect: 'qa-sort-zzz 仍显示', real: `qa-sort-zzz 显示=${topics11.includes('qa-sort-zzz')}`, pass: topics11.includes('qa-sort-zzz') };
    });

    await this.check('用例#11-③ 12 条自建行齐全且相对序为 BD-01 序列，全量序列与比较器一致', async () => {
      const self = selfSubsequence(topics11);
      const expected = expectedOrder(topics11);
      await this.shotEl('.el-table', 'case11-full-order');
      return {
        expect: `12 条自建行：${seq(BD01_ORDER)}；全量=${seq(expected)}`,
        real: `${self.length} 条自建行：${seq(self)}；全量=${seq(topics11)}`,
        pass: self.length === BD01.length && JSON.stringify(self) === JSON.stringify(BD01_ORDER) && JSON.stringify(topics11) === JSON.stringify(expected)
      };
    });

    await this.check('用例#11-④ 页面无错误提示', async () => {
      const errors = this.errorMessages();
      await this.shot('case11-no-error');
      return {
        expect: '无错误类提示',
        real: errors.length === 0 ? `无错误提示；累计提示=${this.allMessages().join(' / ') || '无'}` : errors.join(' / '),
        pass: errors.length === 0
      };
    });

    // ===== 用例 #16：空 Topic 提交 =====
    await this.act('用例16 打开新增弹窗，不填 Topic 直接点击「确定」', async () => {
      await this.openBucketListViaMenu();
      await this.waitTableSettled();
      await this.openAddDialog();
      const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: '新增 Topic' }) }).first();
      await dialog.getByRole('button', { name: '确定' }).first().click();
      await this.page!.locator('.el-form-item__error').first().waitFor({ state: 'visible', timeout: 15000 });
    });

    const validationText = (await this.page!.locator('.el-form-item__error').first().innerText().catch(() => '')).trim();
    await this.shot('case16-validation');
    const afterEmptySubmit = await this.readSnapshot();
    const topics16 = afterEmptySubmit.map((r) => r.topic);
    await this.act('用例16 关闭弹窗（点击取消，无数据变更）', async () => {
      await this.cancelAddDialog();
    });
    const afterClose16 = await this.readSnapshot();
    const topics16After = afterClose16.map((r) => r.topic);

    await this.check('用例#16-① 提交被拦截：列表不新增数据行，12 条自建行齐全且相对顺序正确', async () => {
      const self = selfSubsequence(topics16After);
      await this.shotEl('.el-table', 'case16-no-new-row');
      return {
        expect: '无新增行；12 条自建行齐全且为 BD-01 序列',
        real: `弹窗期间行数=${topics16.length}；关闭后行数=${topics16After.length}；自建行=${self.length}；序列=${seq(self)}`,
        pass: topics16After.length === topics16.length && self.length === BD01.length && JSON.stringify(self) === JSON.stringify(BD01_ORDER)
      };
    });

    await this.check('用例#16-② 弹窗出现必填校验提示（文案原样记录）', async () => {
      return {
        expect: '出现必填校验提示（原文记录）',
        real: validationText || '（未捕获到提示）',
        pass: validationText.length > 0
      };
    });

    await this.check('用例#16-③ 全量序列与锁定比较器期望顺序一致', async () => {
      const expected = expectedOrder(topics16After);
      await this.shotEl('.el-table', 'case16-full-order');
      return { expect: seq(expected), real: seq(topics16After), pass: JSON.stringify(topics16After) === JSON.stringify(expected) };
    });
  }
}

await new BucketAddDeleteCase().execute();
