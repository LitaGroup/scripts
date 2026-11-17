/**
 * 项目 3730 / TK-0322 用例集：刷新与菜单重进稳定性（用例 #3）
 * 用例来源：TK-0322 HANDOFF v5；技术方案：/task/20261117/TK-0322/TECH_DESIGN
 * 覆盖：#3 刷新 3 次 + 菜单重进，5 次加载顺序完全一致（①~④）
 * 数据隔离：仅页面级自建 qa-sort- 数据（BD-01），执行前就绪确认，全部用例结束后统一清理
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-3730-bucket-topic-sort/tests/tc02-refresh-stability.test.ts
 */
import { BucketBase } from './lib/bucket-base.ts';
import { BD01, BD01_ORDER, expectedOrder, selfSubsequence, seq } from './lib/bucket-data.ts';

class BucketRefreshStabilityCase extends BucketBase {
  constructor() {
    super('bucket-topic-sort-tc02');
  }

  protected async run(): Promise<void> {
    this.total = 4;

    await this.act('qa-ai 真实登录 Admin', async () => {
      await this.login(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('BD-01 数据集就绪', async () => {
      await this.openBucketListViaMenu();
      await this.ensureBd01();
    });

    const sequences: string[][] = [];

    await this.act('菜单进入列表并记录 S0', async () => {
      await this.openBucketListViaMenu();
      sequences.push(await this.readTopics());
    });

    for (const n of [1, 2, 3]) {
      await this.act(`F5 刷新第 ${n} 次并记录 S${n}`, async () => {
        await this.page!.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page!.waitForFunction(() => location.hash.includes('/system-cloud-control/bucket-group/list'), undefined, { timeout: 30000 });
        await this.waitTableSettled();
        await this.waitRowsPresent();
        sequences.push(await this.readTopics());
      });
    }

    await this.act('点击左侧菜单「系统云控」后重新点击「桶的清单」并记录 S4', async () => {
      const leaf = this.page!.locator('.el-menu-item', { hasText: '系统云控' }).first();
      await leaf.waitFor({ state: 'visible', timeout: 15000 });
      await leaf.click();
      await this.page!.waitForFunction(() => !location.hash.includes('/bucket-group/list'), undefined, { timeout: 30000 });
      const back = this.page!.locator('.el-menu-item', { hasText: '桶的清单' }).first();
      await back.waitFor({ state: 'visible', timeout: 15000 });
      await back.click();
      await this.page!.waitForFunction(() => location.hash.includes('/system-cloud-control/bucket-group/list'), undefined, { timeout: 30000 });
      await this.waitTableSettled();
      await this.waitRowsPresent();
      sequences.push(await this.readTopics());
    });

    await this.check('用例#3-① S1、S2、S3、S4 与 S0 完全一致', async () => {
      const s0 = sequences[0] ?? [];
      const differs = sequences.slice(1).map((s, i) => (JSON.stringify(s) === JSON.stringify(s0) ? '' : `S${i + 1}`)).filter(Boolean);
      await this.shotEl('.el-table', 'case3-s0');
      return {
        expect: `S0~S4 五次加载全量序列逐项相同：${seq(s0)}`,
        real: `S0~S4 一致=${differs.length === 0}；差异序列=${differs.join(',') || '无'}`,
        pass: differs.length === 0
      };
    });

    await this.check('用例#3-② 每次加载 12 条自建行相对顺序均为 BD-01 确定性序列', async () => {
      const bad = sequences.map((s, i) => (JSON.stringify(selfSubsequence(s)) === JSON.stringify(BD01_ORDER) ? '' : `S${i}`)).filter(Boolean);
      await this.shotEl('.el-table', 'case3-self-order');
      return {
        expect: `S0~S4 均为 ${seq(BD01_ORDER)}`,
        real: sequences.map((s, i) => `S${i}: ${seq(selfSubsequence(s))}`).join(' || '),
        pass: bad.length === 0
      };
    });

    await this.check('用例#3-③ 每次加载全量序列与锁定比较器期望顺序一致', async () => {
      const bad = sequences.map((s, i) => (JSON.stringify(s) === JSON.stringify(expectedOrder(s)) ? '' : `S${i}`)).filter(Boolean);
      await this.shotEl('.el-table', 'case3-full-order');
      return {
        expect: 'S0~S4 全量序列均等于锁定比较器期望序',
        real: bad.length === 0 ? 'S0~S4 全部一致' : `不一致：${bad.join(',')}；S0=${seq(sequences[0] ?? [])}`,
        pass: bad.length === 0
      };
    });

    await this.check('用例#3-④ 每次加载均显示全部 12 条自建行，无丢失、无重复', async () => {
      const stats = sequences.map((s, i) => {
        const self = selfSubsequence(s);
        const unique = new Set(self);
        return { i, count: self.length, unique: unique.size };
      });
      const bad = stats.filter((s) => s.count !== BD01.length || s.unique !== BD01.length);
      await this.shotEl('.el-table', 'case3-row-count');
      return {
        expect: `每次加载 qa-sort- 行数=${BD01.length} 且无重复`,
        real: stats.map((s) => `S${s.i}: ${s.count} 行/去重 ${s.unique}`).join('，'),
        pass: bad.length === 0
      };
    });
  }
}

await new BucketRefreshStabilityCase().execute();
