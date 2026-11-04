/**
 * 送礼详情报表 API 测试（测试环境真实 data-main 服务）
 *
 * 运行：node gift-send-detail-api.test.ts [--evidence-dir=...]
 * 说明：执行机直连 m-api.test.lita.game 被 WAF 拦截（403），data-main 测试网关
 *      https://api.test.cinta.team 暴露同一测试环境服务，使用其进行真实接口验证。
 *      接口请求/响应逐条留痕到 stdout 与 run.json。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import ExcelJS from 'exceljs';
import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';

const API_BASE = (process.env.SCRIPT_API_BASE ?? 'https://api.test.cinta.team').replace(/\/+$/, '');
const CONFIG_ID = 'gift-send-detail';
const SENDER_ID = '6360225';
const RECEIVER_ID = '6420152';
const GIFT_ID = '9358';
const ROOM_IDS = '10101411,10101412';
const DATE = { start_dt: '2026-11-03', end_dt: '2026-11-03' };
const SMALL_RANGE = { start_dt: '2026-11-02', end_dt: '2026-11-03', sender_id: SENDER_ID };
const EXPECTED_HEADERS = [
  '送礼用户id', '送礼用户no', '送礼用户nick',
  '接收用户id', '接收用户no', '接收用户nick',
  '礼物id', '礼物所属分类id', '礼物名称', '礼物类型', '礼物架',
  '礼物单价', '个数', '花费总币数',
  '房间id', '房间名称', '语言区', '服务完成时间',
];

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

interface CallRecord {
  seq: number;
  time: string;
  path: string;
  requestBody: unknown;
  status: number;
  contentType: string;
  responseSize: number;
  response: unknown;
}

interface QueryData {
  headers: Array<{ type: string; name: string }>;
  data: unknown[][];
  total: number;
  page: number;
  size: number;
  pages: number;
}

function queryData(record: CallRecord | undefined): QueryData {
  const data = (record?.response as { data?: QueryData } | undefined)?.data;
  return data ?? { headers: [], data: [], total: 0, page: 0, size: 0, pages: 0 };
}

function rowsAsObjects(record: CallRecord | undefined): Array<Record<string, unknown>> {
  const data = queryData(record);
  return (data.data ?? []).map((row) => {
    const obj: Record<string, unknown> = {};
    data.headers.forEach((header, index) => {
      obj[header.name] = row[index];
    });
    return obj;
  });
}

class GiftSendDetailApiTest extends CheckBaseClass {
  private readonly evidenceDir: string;
  private calls: CallRecord[] = [];
  private buffers = new Map<number, Buffer>();
  private seq = 0;

  constructor() {
    super();
    this.total = 18;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `gift-send-detail-api-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    try {
      await super.execute();
    } finally {
      const file = join(this.evidenceDir, 'api-calls.json');
      writeFileSync(file, JSON.stringify({ apiBase: API_BASE, calls: this.calls }, null, 2), 'utf8');
      this.log(`接口留痕文件: ${file}`);
    }
  }

  private async post(path: string, body: unknown): Promise<CallRecord> {
    const url = API_BASE + path;
    const started = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? '';
    let parsed: unknown = null;
    if (contentType.includes('json')) {
      parsed = JSON.parse(buffer.toString('utf8'));
    } else {
      parsed = { binary: true, size: buffer.length, disposition: res.headers.get('content-disposition') ?? '' };
    }
    this.seq++;
    const record: CallRecord = {
      seq: this.seq,
      time: new Date().toISOString(),
      path,
      requestBody: body,
      status: res.status,
      contentType,
      responseSize: buffer.length,
      response: parsed,
    };
    this.buffers.set(record.seq, buffer);
    this.calls.push(record);
    this.log(
      `接口留痕 #${record.seq}: POST ${url} | 参数: ${JSON.stringify(body)} | 状态: ${record.status} | Content-Type: ${contentType} | 大小: ${buffer.length}B | 耗时: ${Date.now() - started}ms | 响应: ${JSON.stringify(parsed).slice(0, 500)}`,
    );
    return record;
  }

  private query(conditions: Record<string, unknown>, page = 1, size = 2): Promise<CallRecord> {
    return this.post('/data-main/admin/stats/query', { configId: CONFIG_ID, conditions, page, size });
  }

  protected async run(): Promise<void> {
    let config: Record<string, unknown> = {};
    let senderCall: CallRecord | undefined;
    let receiverP1: CallRecord | undefined;
    let receiverP2: CallRecord | undefined;

    await this.act('读取送礼详情报表配置（config/get）', async () => {
      const call = await this.post('/data-main/admin/stats/config/get', { id: CONFIG_ID });
      if (call.status !== 200) throw new Error(`HTTP ${call.status}`);
      const body = call.response as { status: number; data: Record<string, unknown> };
      if (body.status !== 0) throw new Error(`业务 status=${body.status}`);
      config = body.data;
    });

    await this.check('配置：configId=gift-send-detail，database=odps，状态 VALID', async (): Promise<CheckResult> => {
      const real = `configId=${config.configId}，database=${config.database}，status=${config.status}`;
      return {
        expect: 'configId=gift-send-detail，database=odps，status=VALID',
        real,
        pass: config.configId === CONFIG_ID && config.database === 'odps' && config.status === 'VALID',
      };
    });

    await this.check('配置：7 个查询字段名称与类型符合接口文档', async (): Promise<CheckResult> => {
      const fields = (config.queryFields ?? []) as Array<Record<string, unknown>>;
      const real = fields.map((f) => `${f.name}:${f.type}`).join(',');
      const expect = 'start_dt:DATE,end_dt:DATE,sender_id:TEXT,receiver_id:TEXT,gift_id:TEXT,locale:LOCALE,room_ids:TEXT_LIST';
      return { expect, real, pass: real === expect };
    });

    await this.act('按送礼用户查询（单日范围）', async () => {
      senderCall = await this.query(SMALL_RANGE, 1, 20);
    });

    await this.check('送礼用户查询：total=1 且送礼用户ID一致', async (): Promise<CheckResult> => {
      const rows = rowsAsObjects(senderCall);
      const ids = rows.map((row) => String(row['送礼用户id']));
      return {
        expect: `total=1，送礼用户id=${SENDER_ID}`,
        real: `total=${queryData(senderCall).total}，rows=${rows.length}，id=${ids.join(',')}`,
        pass: queryData(senderCall).total === 1 && rows.length === 1 && ids.every((id) => id === SENDER_ID),
      };
    });

    await this.check('查询响应表头：18 列与接口文档一致', async (): Promise<CheckResult> => {
      const headers = queryData(senderCall).headers.map((h) => h.name);
      return { expect: EXPECTED_HEADERS.join('|'), real: headers.join('|'), pass: headers.join('|') === EXPECTED_HEADERS.join('|') };
    });

    await this.act('按接收用户查询第 1 页与第 2 页', async () => {
      receiverP1 = await this.query({ ...DATE, receiver_id: RECEIVER_ID }, 1, 2);
      receiverP2 = await this.query({ ...DATE, receiver_id: RECEIVER_ID }, 2, 2);
    });

    await this.check('接收用户查询：total>0，分页第 2 页返回不同记录', async (): Promise<CheckResult> => {
      const p1 = JSON.stringify(queryData(receiverP1).data[0] ?? null);
      const p2 = JSON.stringify(queryData(receiverP2).data[0] ?? null);
      return {
        expect: 'total>0，第 2 页有数据且首行与第 1 页不同',
        real: `total=${queryData(receiverP1).total}，page1=${queryData(receiverP1).data.length}，page2=${queryData(receiverP2).data.length}，p1=${p1.slice(0, 80)}，p2=${p2.slice(0, 80)}`,
        pass: queryData(receiverP1).total > 0 && queryData(receiverP2).data.length > 0 && p1 !== p2,
      };
    });

    let giftCall: CallRecord | undefined;
    await this.act('按礼物ID查询', async () => {
      giftCall = await this.query({ ...DATE, gift_id: GIFT_ID }, 1, 2);
    });

    await this.check('礼物ID查询：total>0 且返回行礼物ID一致', async (): Promise<CheckResult> => {
      const rows = rowsAsObjects(giftCall);
      const allMatch = rows.every((row) => String(row['礼物id']) === GIFT_ID);
      return {
        expect: `total>0，所有行礼物id=${GIFT_ID}`,
        real: `total=${queryData(giftCall).total}，rows=${rows.length}，ids=${rows.map((r) => r['礼物id']).join(',')}`,
        pass: queryData(giftCall).total > 0 && rows.length > 0 && allMatch,
      };
    });

    let localeCall: CallRecord | undefined;
    await this.act('按语言区查询（ko）', async () => {
      localeCall = await this.query({ ...DATE, locale: 'ko' }, 1, 2);
    });

    await this.check('语言区查询：total>0 且返回行语言区均为 ko', async (): Promise<CheckResult> => {
      const rows = rowsAsObjects(localeCall);
      const allMatch = rows.every((row) => String(row['语言区']) === 'ko');
      return {
        expect: 'total>0，所有行语言区=ko',
        real: `total=${queryData(localeCall).total}，rows=${rows.length}，locales=${rows.map((r) => r['语言区']).join(',')}`,
        pass: queryData(localeCall).total > 0 && rows.length > 0 && allMatch,
      };
    });

    let roomsCall: CallRecord | undefined;
    await this.act('按房间ID批量查询（逗号分隔）', async () => {
      roomsCall = await this.query({ ...DATE, room_ids: ROOM_IDS }, 1, 2);
    });

    await this.check('房间ID批量查询：total>0 且房间ID均属于提交列表', async (): Promise<CheckResult> => {
      const rows = rowsAsObjects(roomsCall);
      const allowed = ROOM_IDS.split(',');
      const allMatch = rows.every((row) => allowed.includes(String(row['房间id'])));
      return {
        expect: `total>0，房间id ∈ [${ROOM_IDS}]`,
        real: `total=${queryData(roomsCall).total}，rows=${rows.length}，ids=${rows.map((r) => r['房间id']).join(',')}`,
        pass: queryData(roomsCall).total > 0 && rows.length > 0 && allMatch,
      };
    });

    let download = Buffer.alloc(0);
    await this.act('导出送礼详情（合法条件）', async () => {
      const call = await this.post('/data-main/admin/stats/query/download', {
        configId: CONFIG_ID,
        conditions: SMALL_RANGE,
      });
      if (call.status !== 200) throw new Error(`HTTP ${call.status}`);
      download = this.buffers.get(call.seq) ?? Buffer.alloc(0);
      if (!String(call.contentType).includes('spreadsheetml.sheet')) throw new Error(`Content-Type 非 xlsx: ${call.contentType}`);
      if (download.length === 0) throw new Error('导出文件为空');
    });

    await this.check('导出文件：可解析 xlsx，表头与查询字段一致，含送礼用户数据', async (): Promise<CheckResult> => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(download);
      const sheet = workbook.worksheets[0];
      const headers: string[] = [];
      sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value ?? '').trim()));
      const values: string[] = [];
      sheet.getRow(2).eachCell((cell) => values.push(String(cell.value ?? '').trim()));
      const headersOk = headers.join('|') === EXPECTED_HEADERS.join('|');
      const senderOk = values[0] === SENDER_ID;
      return {
        expect: `18 列表头一致，首行送礼用户id=${SENDER_ID}`,
        real: `表头=${headers.join('|')}，首行=${values.slice(0, 3).join(',')}`,
        pass: headersOk && senderOk,
      };
    });

    let invalidCall: CallRecord | undefined;
    await this.act('非法 configId 查询（异常场景）', async () => {
      invalidCall = await this.post('/data-main/admin/stats/query', { configId: 'not-exists-config', conditions: DATE, page: 1, size: 2 });
    });

    await this.check('未知 configId：业务 status 非 0', async (): Promise<CheckResult> => {
      const status = (invalidCall?.response as { status?: number } | undefined)?.status;
      return { expect: 'status != 0', real: `status=${status}`, pass: status !== 0 };
    });
  }
}

await new GiftSendDetailApiTest().execute();
