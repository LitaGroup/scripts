import { CheckBaseClass } from '../../../../src/base/CheckBaseClass.ts';
import { loadTestAccount, MomentLiveClient, type TestAccount } from './lib/moment-live-client.ts';

/**
 * TK-0314 动态类型 live（分享直播间）—— 发布接口限流验证
 *
 * 被测约束：POST /v2/api/moment/publish 标注 @IpLimit(accessLimitSize=10, cycleLimitTime=60)
 *          （见 MomentAPI#publish），单 IP 60 秒最多 10 次。
 * 覆盖用例：API-LIVE-020（见 COVERAGE.md）
 * 运行：
 *   cd projects/feature/api-funbit-moment-live/tests
 *   node moment-live-ratelimit.test.ts
 *
 * 说明：请求体使用 roomId=0 的非法内容，确保即使未被限流也不会产生动态数据；
 *      限流由框架统一处理：命中时返回 HTTP 304 + 空响应体。
 */

class MomentLiveRateLimit extends CheckBaseClass {
  private readonly client = new MomentLiveClient();
  private account: TestAccount | null = null;
  private token = '';

  constructor() {
    super();
    this.total = 3;
  }

  protected async run(): Promise<void> {
    const ready = await this.setup();
    if (!ready) return;

    const burst = 12;
    const results: Array<{ no: number; http: number; status: string; msg: string; bytes: number }> = [];
    await this.act(`连续发起 ${burst} 次发布请求（roomId=0，非法内容）`, async () => {
      for (let i = 1; i <= burst; i++) {
        const res = await this.client.publish(
          { momentType: 'live', content: { text: { text: `TK-0314 ratelimit ${i}` }, live: { roomId: 0 } } },
          this.token,
        );
        results.push({
          no: i,
          http: res.httpStatus,
          status: String(res.json?.status ?? ''),
          msg: String(res.json?.msg ?? ''),
          bytes: res.raw.length,
        });
      }
      this.log(`限流探测结果：${JSON.stringify(results)}`);
    });

    await this.check('【API-LIVE-020-1】P2 限流：60 秒窗口内被正常处理的发布请求不超过 10 次', async () => {
      const handled = results.filter((r) => r.http === 200).length;
      return {
        expect: `HTTP 200 次数 ≤ 10（@IpLimit accessLimitSize=10）`,
        real: `HTTP 200 次数=${handled}，明细=${results.map((r) => r.http).join(',')}`,
        pass: handled <= 10,
      };
    });

    await this.check('【API-LIVE-020-2】P2 限流：超出窗口配额后返回 HTTP 304 + 空响应体', async () => {
      const blocked = results.filter((r) => r.http === 304);
      const nonEmpty = blocked.filter((r) => r.bytes !== 0);
      return {
        expect: '至少 1 次 HTTP 304，且 304 响应体为空',
        real: `HTTP 304 次数=${blocked.length}，非空响应体次数=${nonEmpty.length}`,
        pass: blocked.length >= 1 && nonEmpty.length === 0,
        message:
          blocked.length === 0
            ? `连续 ${burst} 次请求未触发限流：${results.map((r) => r.http).join(',')}`
            : nonEmpty.length > 0
              ? `限流响应包含响应体：${nonEmpty.map((r) => r.bytes).join(',')}`
              : undefined,
      };
    });

    await this.check('【API-LIVE-020-3】P2 限流：非法内容始终按业务错误拒绝，未产生成功发布（status=0）', async () => {
      const invalid = results.filter((r) => r.http === 200);
      const bad = invalid.filter((r) => r.status !== '1' || r.msg !== 'live.roomId 传入的值错误');
      const created = results.filter((r) => r.status === '0');
      return {
        expect: '所有被处理的请求均为 status=1 / live.roomId 传入的值错误，无 status=0',
        real: `被处理=${invalid.length} 不符合=${bad.length} 成功发布=${created.length}`,
        pass: bad.length === 0 && created.length === 0,
      };
    });
  }

  private async setup(): Promise<boolean> {
    await this.act('前置：登录测试账号获取发布权限', async () => {
      const account = loadTestAccount();
      this.account = account;
      const login = await this.client.login(account);
      this.token = login.token;
      this.log(`登录用户=${login.userId} locale=${login.locale}`);
    });
    return !!this.token;
  }
}

await new MomentLiveRateLimit().execute();
