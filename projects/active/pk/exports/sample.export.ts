import { ExportBaseClass, type ExportColumn } from '../../../../src/base/ExportBaseClass.ts';

/**
 * 导出脚本示例：演示 ExportBaseClass 的用法。
 * 运行：node projects/active/pk/exports/sample.export.ts --output-dir=./output [--format=csv]
 */
class SampleExport extends ExportBaseClass {
  constructor() {
    super();
    this.total = 2;
  }

  protected async run(): Promise<void> {
    const rankColumns: ExportColumn[] = [
      { key: 'rank', header: '名次' },
      { key: 'player', header: '玩家ID' },
      { key: 'score', header: '积分' },
      { key: 'memo', header: '备注' },
    ];
    const rankData = [
      { rank: 1, player: '10001', score: 9800, memo: '含,逗号' },
      { rank: 2, player: '10002', score: 8600, memo: '含"引号' },
      { rank: 3, player: '10003', score: 7200, memo: '含\n换行' },
    ];
    await this.export('榜单数据', rankData, { columns: rankColumns, filename: 'rank-sample.csv' });

    const awardData = [
      { player: '10001', type: 'COIN', count: 500, days: -1 },
      { player: '10002', type: 'GIFT', giftId: 3001, count: 1, days: 7 },
    ];
    await this.export('发奖记录', awardData);
  }
}

await new SampleExport().execute();
