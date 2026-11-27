import { type CheckResult, CheckBaseClass } from '../../../src/base/CheckBaseClass.ts';

const HOST = 'https://api.test.cinta.team';
const PATH = 'basic-promotion-main/v2/option/init';

interface CallResult {
  httpStatus: number;
  status: string;
  data: unknown;
  body: unknown;
}

async function callOptionInit(extraHeaders: Record<string, string> = {}): Promise<CallResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'l-user-id': '3884',
    'l-user-locale': 'VN',
    'l-app-id': 'Lita',
    'l-trace-id': 'tk750-selftest',
    ...extraHeaders,
  };
  const res = await fetch(`${HOST}/${PATH}`, {
    method: 'POST',
    headers,
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const status = body && body['status'] !== undefined ? String(body['status']) : 'missing';
  return { httpStatus: res.status, status, data: body?.['data'], body };
}

class DebugTimestampCaller extends CheckBaseClass {
  private last: CallResult | null = null;

  constructor() {
    super();
    this.total = 8;
  }

  protected async run(): Promise<void> {
    await this.act('TC-01 不携带 L-DEBUG-TIMESTAMP 调用 option/init', async () => {
      this.last = await callOptionInit();
      if (this.last.httpStatus !== 200) {
        throw new Error(`HTTP ${this.last.httpStatus}: ${JSON.stringify(this.last.body).slice(0, 300)}`);
      }
    });

    await this.check('TC-01 option/init 业务状态为 0', async (): Promise<CheckResult> => {
      const status = this.last?.status ?? 'missing';
      return { expect: '0', real: status, pass: status === '0' };
    });

    await this.act('TC-02 携带合法毫秒 L-DEBUG-TIMESTAMP 调用 option/init', async () => {
      this.last = await callOptionInit({ 'l-debug-timestamp': String(Date.now()) });
      if (this.last.httpStatus !== 200) {
        throw new Error(`HTTP ${this.last.httpStatus}: ${JSON.stringify(this.last.body).slice(0, 300)}`);
      }
    });

    await this.check('TC-02 option/init 业务状态为 0', async (): Promise<CheckResult> => {
      const status = this.last?.status ?? 'missing';
      return { expect: '0', real: status, pass: status === '0' };
    });

    await this.act('TC-03 携带合法 LitaDateTime 调试头调用 option/init', async () => {
      this.last = await callOptionInit({ 'l-debug-timestamp': '2026-07-10T10:00:00+08:00' });
      if (this.last.httpStatus !== 200) {
        throw new Error(`HTTP ${this.last.httpStatus}: ${JSON.stringify(this.last.body).slice(0, 300)}`);
      }
    });

    await this.check('TC-03 option/init 业务状态为 0', async (): Promise<CheckResult> => {
      const status = this.last?.status ?? 'missing';
      return { expect: '0', real: status, pass: status === '0' };
    });

    await this.act('TC-04 先有头再无头连续调用 option/init', async () => {
      const withHeader = await callOptionInit({ 'l-debug-timestamp': '2026-07-10T10:00:00+08:00' });
      if (withHeader.httpStatus !== 200 || withHeader.status !== '0') {
        throw new Error(`有头请求异常: HTTP ${withHeader.httpStatus}, status ${withHeader.status}`);
      }
      this.last = await callOptionInit();
      if (this.last.httpStatus !== 200) {
        throw new Error(`HTTP ${this.last.httpStatus}: ${JSON.stringify(this.last.body).slice(0, 300)}`);
      }
    });

    await this.check('TC-04 无头请求业务状态为 0 且响应结构正常', async (): Promise<CheckResult> => {
      const data = this.last?.data;
      const isRecord = !!data && typeof data === 'object';
      const showGameHome = isRecord ? (data as Record<string, unknown>)['showGameHome'] : undefined;
      const pass = this.last?.status === '0' && typeof showGameHome === 'boolean';
      return {
        expect: 'status=0 且 data.showGameHome 为布尔值',
        real: `status=${this.last?.status}, data=${JSON.stringify(data)}`,
        pass,
      };
    });
  }
}

await new DebugTimestampCaller().execute();
