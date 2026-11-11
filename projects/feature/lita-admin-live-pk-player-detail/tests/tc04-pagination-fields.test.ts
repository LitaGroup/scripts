/**
 * 项目3718 / Admin 直播PK场次数据：分页不重不漏与字段展示（用例 #11、#14）
 * 用例来源：/task/20261111/TK-0209/HANDOFF；技术方案：/task/20261111/TK-0209/TECH_DESIGN（SK5、SK8）
 * 覆盖：#11 33 行 10/page 四页 10/10/10/3 不重不漏（6）；#14 21 字段/二级表头/角色文案/空值（7）
 * 数据隔离：仅查询现有 PK 数据；不造数、不写库。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc04-pagination-fields.test.ts
 */
import { AdminBase } from './lib/admin-base.ts';

const HASH = '/data-stats-manager/live-data/live-pk-player-detail';
const COLUMNS = [
  'date', 'pk id', 'player_id', 'player_no', 'player_nick', 'player_role', 'room id', 'room nick',
  'total pk players', 'pk rank', 'total pk score', 'total pk score - taptap', 'total pk score - giftsend coins',
  'taptap user number', 'giftsend user number', 'total user', 'total enter newcomer during pk',
  'top 1 spender uid', 'top 1 spender no', 'top 1 spender nick', 'top 1 spender giftsend coins'
];

class PaginationFieldsTest extends AdminBase {
  constructor() {
    super('live-pk-pagination-fields');
    this.total = 13;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.openReport(HASH);

    // 用例#11
    await this.act('用例#11 步骤：基线查询 33 行并切换 10/page，依次翻至第 4 页', async () => {
      await this.setDate('开始日期', '2026-11-01');
      await this.setDate('结束日期', '2026-11-10');
      await this.pickOption('大区', '印尼语区');
      await this.clickQuery();
      await this.pageSize(10);
    });
    const total11 = await this.totalText();
    const pagers = await this.pagerNumbers();
    const pages: string[][][] = [await this.rows()];
    for (const n of [2, 3, 4]) {
      await this.gotoPage(n);
      pages.push(await this.rows());
    }
    const all = pages.flat();
    const keys = all.map((r) => `${r[0]}|${r[1]}|${r[2]}`);

    await this.check('用例#11-① 切换后分页显示 Total 33、页码 1~4', async () => ({
      expect: 'Total 33；页码=1,2,3,4',
      real: `${total11}；页码=${pagers.join(',')}`,
      pass: total11 === 'Total 33' && pagers.join(',') === '1,2,3,4'
    }));
    await this.shot('用例#11-①');
    await this.check('用例#11-② 第 1 页显示 10 行', async () => ({ expect: '10', real: String(pages[0].length), pass: pages[0].length === 10 }));
    await this.shot('用例#11-②');
    await this.check('用例#11-③ 第 2、3 页各显示 10 行', async () => ({
      expect: '第2页=10|第3页=10',
      real: `第2页=${pages[1].length}|第3页=${pages[2].length}`,
      pass: pages[1].length === 10 && pages[2].length === 10
    }));
    await this.shot('用例#11-③');
    await this.check('用例#11-④ 第 4 页显示 3 行', async () => ({ expect: '3', real: String(pages[3].length), pass: pages[3].length === 3 }));
    await this.shot('用例#11-④');
    await this.check('用例#11-⑤ 四页 33 行按 date+pk id+player_id 无重复、无丢失', async () => {
      const unique = new Set(keys);
      return {
        expect: '合计=33；去重=33',
        real: `合计=${all.length}；去重=${unique.size}；各页=${pages.map((p) => p.length).join('/')}`,
        pass: all.length === 33 && unique.size === 33
      };
    });
    await this.shot('用例#11-⑤');
    await this.check('用例#11-⑥ 第 4 页 3 行 pk id 依次 255、256、256，pk rank 依次 2、1、2', async () => {
      const real = pages[3].map((r) => `${r[1]}/${r[9]}`).join('；');
      return { expect: '255/2；256/1；256/2', real, pass: real === '255/2；256/1；256/2' };
    });
    await this.shot('用例#11-⑥');

    // 用例#14：复用同一次基线查询，扩到 50/page 读取全部 33 行
    await this.pageSize(50);
    const headers = await this.headers();
    const headerTexts = headers.map((h) => h.text).filter(Boolean);
    const rows14 = await this.rows();
    await this.check('用例#14-① 表格表头共显示 21 列', async () => ({ expect: '21', real: String(headerTexts.length), pass: headerTexts.length === 21 }));
    await this.shot('用例#14-①');
    await this.check('用例#14-② 21 个列名依次与约定完全一致', async () => ({
      expect: COLUMNS.join('|'),
      real: headerTexts.join('|'),
      pass: JSON.stringify(headerTexts) === JSON.stringify(COLUMNS)
    }));
    await this.shot('用例#14-②');
    await this.check('用例#14-③ Total PK Score 呈二级表头（父表头 + Taptap/giftsend coins 子表头）', async () => {
      const flat = headers.every((h) => h.colspan === 1 && h.rowspan === 1);
      return {
        expect: '二级表头：Total PK Score 父表头跨 2 列，子表头 Taptap / giftsend coins',
        real: flat ? `页面为单行扁平 ${headers.length} 列（colspan/rowspan 均为 1），无父表头` : `colspan=${headers.map((h) => h.colspan).join(',')}；rowspan=${headers.map((h) => h.rowspan).join(',')}`,
        pass: !flat
      };
    });
    await this.shot('用例#14-③');
    await this.check('用例#14-④ player_role 列显示值仅为「发起者」或「参加者」', async () => {
      const values = [...new Set(rows14.map((r) => r[5]))];
      return { expect: '子集 ⊆ {发起者,参加者}', real: values.join('|'), pass: values.length > 0 && values.every((v) => v === '发起者' || v === '参加者') };
    });
    await this.shot('用例#14-④');
    await this.check('用例#14-⑤ 无原始异常列名（无 player_role_code、null/undefined 列名）', async () => {
      const bad = headerTexts.filter((t) => /player_role_code|null|undefined/i.test(t));
      return { expect: '无异常列名', real: bad.length ? bad.join('|') : '无异常列名', pass: bad.length === 0 };
    });
    await this.shot('用例#14-⑤');
    await this.check('用例#14-⑥ top 1 spender uid/no/nick 空值行显示「-」', async () => {
      const r = rows14.find((x) => x[1] === '227' && x[2] === '450400') ?? rows14[0] ?? [];
      const cells = [r[17], r[18], r[19]];
      return { expect: '-|-|-', real: cells.join('|'), pass: cells.join('|') === '-|-|-' };
    });
    await this.shot('用例#14-⑥');
    await this.check('用例#14-⑦ 页面无报错', async () => {
      const errors = await this.errorDialogs();
      const real = `错误提示=${errors.length}；pageerror=${this.pageErrors.length}`;
      return { expect: '错误提示=0；pageerror=0', real, pass: errors.length === 0 && this.pageErrors.length === 0 };
    });
    await this.shot('用例#14-⑦');
  }
}

new PaginationFieldsTest().execute();
