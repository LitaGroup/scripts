import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class ModCommonRoundCheck extends CheckBaseClass {
  private header: string[] = [];
  private rows: unknown[][] = [];

  constructor() {
    super();
    this.total = 3;
  }

  protected async run(): Promise<void> {
    await this.act('查询 mod_common_round 最近 5 条数据', async () => {
      const r = await MySQLProdResource.query(
        'active',
        'select id, biz, topic, start_time, finish_time, status from mod_common_round order by id desc limit 5',
      );
      this.header = r.header;
      this.rows = r.data;
    });
    await sleep(1000);

    await this.check('查询到数据', async (): Promise<CheckResult> => {
      return { expect: 'rows >= 1', real: `rows = ${this.rows.length}`, pass: this.rows.length >= 1 };
    });
    await sleep(1000);

    await this.check('结果包含 status 列', async (): Promise<CheckResult> => {
      const has = this.header.includes('status');
      return { expect: 'status', real: has ? 'status' : '(缺失)' };
    });
    await sleep(1000);
  }
}

await new ModCommonRoundCheck().execute();
