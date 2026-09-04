import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';

const BUCKET_USER_ID = 40;
const OPTION_USER_ID = 3884;
const TRACE_HEADERS: Record<string, string> = { 'l-trace-id': '99999999' };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

class Bucket extends TestBaseClass {
  private bucketData: Record<string, unknown> = {};
  private optionData: Record<string, unknown> = {};

  constructor() {
    super();
    this.total = 4;
  }

  protected async run(): Promise<void> {
    await this.act(`调用 basic-common/v1/bucket/get 接口（body user=${BUCKET_USER_ID}）`, async () => {
      // bucket 接口上下文改为 JSON body 传参，l-* header 不再读取（HANDOFF 2026-09-03）
      this.bucketData = asRecord(await this.api.request('basic-common/v1/bucket/get', {
        method: 'POST',
        body: { user: BUCKET_USER_ID },
        extraHeaders: TRACE_HEADERS,
      }));
    });

    await this.check('bucket/get data.agora_ains_switch 为 1', async (): Promise<CheckResult> => {
      const val = this.bucketData['agora_ains_switch'];
      return { expect: '1', real: String(val), pass: Number(val) === 1 };
    });

    await this.act(`调用 funbit/v2/system/option 接口（l-user-id=${OPTION_USER_ID}）`, async () => {
      // 注意：不能走 APITestResource —— 它会强制注入 l-debug-timestamp，导致该接口 500
      const res = await fetch('https://api.test.cinta.team/funbit/v2/system/option', {
        method: 'GET',
        headers: { 'l-user-id': String(OPTION_USER_ID), ...TRACE_HEADERS },
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      this.optionData = asRecord(body?.data);
    });

    await this.check('option data.bucket.agora_ains_switch 为 1', async (): Promise<CheckResult> => {
      const bucket = asRecord(this.optionData['bucket']);
      const val = bucket['agora_ains_switch'];
      return { expect: '1', real: String(val), pass: Number(val) === 1 };
    });
  }
}

await new Bucket().execute();
