/**
 * 项目 3730 / TK-0322 用例集：搜索与重置（用例 #5、#6、#7、#8）
 * 用例来源：TK-0322 HANDOFF v5；技术方案：/task/20261117/TK-0322/TECH_DESIGN
 * 覆盖：#5 搜索命中分桶名称结果仍升序（D1~D3，各 4 检查点）；#6 仅命中描述；#7 无命中空态；#8 重置恢复全量
 * 数据隔离：仅页面级自建 qa-sort- 数据（BD-01），执行前就绪确认，全部用例结束后统一清理
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-3730-bucket-topic-sort/tests/tc04-search-and-reset.test.ts
 */
import { BucketBase } from './lib/bucket-base.ts';
import { BD01, BD01_ORDER, expectedOrder, selfSubsequence, seq } from './lib/bucket-data.ts';

const HIT_TOPICS = ['qa-sort-topic2', 'qa-sort-Topic3', 'qa-sort-topic10'];
const DATA_ROWS = [
  { id: 'D1', keyword: 'topic' },
  { id: 'D2', keyword: 'QA-SORT-TOPIC' },
  { id: 'D3', keyword: '  topic  ' }
];

class BucketSearchCase extends BucketBase {
  constructor() {
    super('bucket-topic-sort-tc04');
  }

  private async searchAndRead(keyword: string): Promise<{ topics: string[]; rows: string[][] }> {
    await this.fillKeyword(keyword);
    await this.clickSearch();
    const rows = await this.readRows();
    return { topics: rows.map((cells) => cells[0] ?? ''), rows };
  }

  protected async run(): Promise<void> {
    this.total = 24;

    await this.act('qa-ai 真实登录 Admin', async () => {
      await this.login(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('BD-01 数据集就绪', async () => {
      await this.openBucketListViaMenu();
      await this.ensureBd01();
    });

    // 用例 #5：D1~D3 数据行逐行展开
    for (const dataRow of DATA_ROWS) {
      let result: { topics: string[]; rows: string[][] } = { topics: [], rows: [] };
      await this.act(`用例5[${dataRow.id}] 输入关键词「${dataRow.keyword}」并点击 Search`, async () => {
        await this.openBucketListViaMenu();
        result = await this.searchAndRead(dataRow.keyword);
      });
      const { topics, rows } = result;
      const tag = `[${dataRow.id}]`;
      const keywordNorm = dataRow.keyword.trim().toLowerCase();
      const selfOrder = selfSubsequence(topics);

      await this.check(`用例#5-①${tag} 结果包含 topic2/Topic3/topic10 且相对顺序正确`, async () => {
        await this.shotEl('.el-table', `case5-${dataRow.id}-hit-order`);
        return {
          expect: seq(HIT_TOPICS),
          real: seq(selfOrder),
          pass: JSON.stringify(selfOrder) === JSON.stringify(HIT_TOPICS)
        };
      });

      await this.check(`用例#5-②${tag} 结果集全量序列与锁定比较器期望顺序一致`, async () => {
        const expected = expectedOrder(topics);
        await this.shotEl('.el-table', `case5-${dataRow.id}-full-order`);
        return { expect: seq(expected), real: seq(topics), pass: JSON.stringify(topics) === JSON.stringify(expected) };
      });

      await this.check(`用例#5-③${tag} 每结果行 Topic 或描述包含关键词（忽略大小写与首尾空格）`, async () => {
        const bad = rows.filter((cells) => {
          const topic = (cells[0] ?? '').toLowerCase();
          const desc = (cells[1] ?? '').toLowerCase();
          return !topic.includes(keywordNorm) && !desc.includes(keywordNorm);
        });
        await this.shotEl('.el-table', `case5-${dataRow.id}-keyword-match`);
        return {
          expect: `每行 Topic 或描述包含「${keywordNorm}」`,
          real: bad.length === 0 ? `${rows.length} 行全部命中` : `未命中 ${bad.length} 行：${bad.map((c) => c[0]).join(',')}`,
          pass: bad.length === 0 && rows.length > 0
        };
      });

      await this.check(`用例#5-④${tag} 其余 9 条自建行不显示`, async () => {
        const others = BD01_ORDER.filter((t) => !HIT_TOPICS.includes(t));
        const shown = others.filter((t) => topics.includes(t));
        await this.shotEl('.el-table', `case5-${dataRow.id}-others-hidden`);
        return {
          expect: '其余 9 条自建行均不显示',
          real: shown.length === 0 ? '9 条均未显示' : `仍显示：${shown.join(',')}`,
          pass: shown.length === 0
        };
      });

      await this.act(`用例5[${dataRow.id}] 点击 Reset 恢复全量`, async () => {
        await this.clickReset();
      });
    }

    // 用例 #6：仅命中描述
    let case6: { topics: string[]; rows: string[][] } = { topics: [], rows: [] };
    await this.act('用例6 输入关键词 sortdesc 并点击 Search', async () => {
      await this.openBucketListViaMenu();
      case6 = await this.searchAndRead('sortdesc');
    });
    const b2 = case6.rows.find((cells) => (cells[0] ?? '') === 'qa-sort-B2');

    await this.check('用例#6-① 结果包含 qa-sort-B2，描述列显示 sortdesc-only-token', async () => {
      await this.shotEl('.el-table', 'case6-b2-row');
      return {
        expect: 'qa-sort-B2 | sortdesc-only-token',
        real: b2 ? `${b2[0]} | ${b2[1]}` : '未找到 qa-sort-B2 行',
        pass: !!b2 && b2[1] === 'sortdesc-only-token'
      };
    });

    await this.check('用例#6-② 其余 11 条自建行不显示', async () => {
      const others = BD01_ORDER.filter((t) => t !== 'qa-sort-B2');
      const shown = others.filter((t) => case6.topics.includes(t));
      await this.shotEl('.el-table', 'case6-others-hidden');
      return {
        expect: '其余 11 条自建行均不显示',
        real: shown.length === 0 ? '11 条均未显示' : `仍显示：${shown.join(',')}`,
        pass: shown.length === 0
      };
    });

    await this.check('用例#6-③ 结果集全量序列与锁定比较器期望顺序一致', async () => {
      const expected = expectedOrder(case6.topics);
      await this.shotEl('.el-table', 'case6-full-order');
      return { expect: seq(expected), real: seq(case6.topics), pass: JSON.stringify(case6.topics) === JSON.stringify(expected) };
    });

    await this.check('用例#6-④ 每结果行 Topic 或描述包含 sortdesc（忽略大小写）', async () => {
      const bad = case6.rows.filter((cells) => !(cells[0] ?? '').toLowerCase().includes('sortdesc') && !(cells[1] ?? '').toLowerCase().includes('sortdesc'));
      await this.shotEl('.el-table', 'case6-keyword-match');
      return {
        expect: '每行 Topic 或描述包含「sortdesc」',
        real: bad.length === 0 ? `${case6.rows.length} 行全部命中` : `未命中 ${bad.length} 行`,
        pass: bad.length === 0 && case6.rows.length > 0
      };
    });

    await this.act('用例6 点击 Reset 恢复全量', async () => {
      await this.clickReset();
    });

    // 用例 #7：无命中空态
    await this.act('用例7 输入关键词 qa-sort-nohit-xyz 并点击 Search', async () => {
      await this.openBucketListViaMenu();
      await this.searchAndRead('qa-sort-nohit-xyz');
    });
    const case7Topics = await this.readTopics();

    await this.check('用例#7-① 表格显示空态文案 No Data', async () => {
      const real = await this.emptyText();
      await this.shotEl('.el-table', 'case7-empty-text');
      return { expect: 'No Data', real: real || '（空态文案为空）', pass: real === 'No Data' };
    });

    await this.check('用例#7-② 表格数据行数为 0', async () => {
      const rows = await this.readRows();
      await this.shotEl('.el-table', 'case7-zero-rows');
      return { expect: '数据行数=0', real: `数据行数=${rows.length}；Topic=${seq(case7Topics) || '无'}`, pass: rows.length === 0 };
    });

    await this.check('用例#7-③ 页面无错误提示（无 Request failed / 请先登录 等）', async () => {
      const errors = this.errorMessages();
      await this.shot('case7-no-error');
      return {
        expect: '无错误类提示',
        real: errors.length === 0 ? `无错误提示；累计提示=${this.allMessages().join(' / ') || '无'}` : errors.join(' / '),
        pass: errors.length === 0
      };
    });

    await this.check('用例#7-④ 分页条不展示', async () => {
      const visible = await this.paginationVisible();
      await this.shotEl('.el-table', 'case7-no-pagination');
      return { expect: '分页条不可见', real: `分页条可见=${visible}；节点数=${await this.paginationCount()}`, pass: !visible };
    });

    await this.act('用例7 点击 Reset 恢复全量', async () => {
      await this.clickReset();
    });

    // 用例 #8：搜索后重置
    await this.act('用例8 输入关键词 topic 并点击 Search 后点击 Reset', async () => {
      await this.openBucketListViaMenu();
      await this.searchAndRead('topic');
      await this.clickReset();
    });
    const case8Topics = await this.readTopics();
    const case8Input = await this.keywordValue();
    const case8Placeholder = await this.page!.locator('input[placeholder="Topic 关键词（前端过滤）"]').first().getAttribute('placeholder');

    await this.check('用例#8-① 关键词输入框清空并重新显示 placeholder', async () => {
      await this.shotEl('.el-table', 'case8-keyword-cleared');
      return {
        expect: '输入值为空且 placeholder=Topic 关键词（前端过滤）',
        real: `输入值=「${case8Input}」；placeholder=${case8Placeholder ?? '无'}`,
        pass: case8Input === '' && case8Placeholder === 'Topic 关键词（前端过滤）'
      };
    });

    await this.check('用例#8-② 列表恢复全量展示，12 条自建行全部可见', async () => {
      const self = selfSubsequence(case8Topics);
      await this.shotEl('.el-table', 'case8-full-list');
      return {
        expect: '12 条自建行全部可见',
        real: `自建行数=${self.length}；${seq(self)}`,
        pass: self.length === BD01.length && BD01.every((row) => case8Topics.includes(row.topic))
      };
    });

    await this.check('用例#8-③ 自建行相对序为 BD-01 序列，全量序列与比较器期望序一致', async () => {
      const expected = expectedOrder(case8Topics);
      await this.shotEl('.el-table', 'case8-order');
      return {
        expect: `自建子序列=${seq(BD01_ORDER)}；全量=${seq(expected)}`,
        real: `自建子序列=${seq(selfSubsequence(case8Topics))}；全量=${seq(case8Topics)}`,
        pass: JSON.stringify(selfSubsequence(case8Topics)) === JSON.stringify(BD01_ORDER) && JSON.stringify(case8Topics) === JSON.stringify(expected)
      };
    });

    await this.check('用例#8-④ 页面无错误提示', async () => {
      const errors = this.errorMessages();
      await this.shot('case8-no-error');
      return {
        expect: '无错误类提示',
        real: errors.length === 0 ? `无错误提示；累计提示=${this.allMessages().join(' / ') || '无'}` : errors.join(' / '),
        pass: errors.length === 0
      };
    });
  }
}

await new BucketSearchCase().execute();
