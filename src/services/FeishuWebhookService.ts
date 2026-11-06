/**
 * 飞书群机器人 webhook 投递（interactive 卡片 / 纯文本兜底）。
 *
 * 约定（见 /task/20261106/TK-0089/TECH_DESIGN §6.4）：
 * - 成功判定：HTTP 200 且响应体 code === 0（飞书业务失败可能返回 HTTP 200）。
 * - 重试：网络错误、HTTP 5xx、飞书限流码 9499，最多 3 次，退避 1s/3s/9s。
 * - 不重试：HTTP 4xx 与其它业务码。
 * - 错误信息包含 HTTP 状态与飞书 code/msg，不包含 webhook 全文。
 */

export interface WebhookOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelaysMs?: number[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAYS = [1000, 3000, 9000];
const RATE_LIMIT_CODE = 9499;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskUrl(url: string): string {
  const idx = url.lastIndexOf('/');
  return idx > 0 ? `${url.slice(0, idx)}/***` : '***';
}

export class FeishuWebhookService {
  private readonly webhook: string;
  private readonly timeoutMs: number;
  private readonly retryDelaysMs: number[];

  constructor(webhook: string, options: WebhookOptions = {}) {
    if (!webhook || !/^https?:\/\//i.test(webhook)) {
      throw new Error('FeishuWebhookService: webhook 未配置或格式非法（需 http(s) 地址）');
    }
    this.webhook = webhook;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_RETRY_DELAYS.length;
    this.retryDelaysMs = (options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS).slice(0, Math.max(0, maxRetries));
  }

  async sendCard(card: object): Promise<void> {
    await this.send({ msg_type: 'interactive', card });
  }

  async sendText(text: string): Promise<void> {
    await this.send({ msg_type: 'text', content: JSON.stringify({ text }) });
  }

  private async send(body: object): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      try {
        return await this.sendOnce(body);
      } catch (e) {
        const err = e as Error & { retryable?: boolean };
        lastError = err;
        if (!err.retryable || attempt === this.retryDelaysMs.length) {
          throw err;
        }
        await sleep(this.retryDelaysMs[attempt]);
      }
    }
    throw lastError ?? new Error('FeishuWebhookService: 未知错误');
  }

  private async sendOnce(body: object): Promise<void> {
    let response: Response;
    try {
      response = await fetch(this.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const err = e as Error;
      const wrapped = new Error(
        `飞书推送网络错误（${maskUrl(this.webhook)}）: ${err.name === 'TimeoutError' ? `超时 ${this.timeoutMs}ms` : err.message}`,
      ) as Error & { retryable?: boolean };
      wrapped.retryable = true;
      throw wrapped;
    }

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      const retryable = response.status >= 500;
      const err = new Error(
        `飞书推送 HTTP ${response.status} ${response.statusText}（${maskUrl(this.webhook)}）: ${text.slice(0, 300)}`,
      ) as Error & { retryable?: boolean };
      err.retryable = retryable;
      throw err;
    }

    let payload: { code?: number; msg?: string; StatusCode?: number; StatusMessage?: string } = {};
    try {
      payload = text === '' ? {} : JSON.parse(text);
    } catch {
      throw new Error(`飞书推送响应不是合法 JSON: ${text.slice(0, 300)}`);
    }
    const code = payload.code ?? payload.StatusCode ?? 0;
    if (code !== 0) {
      const err = new Error(
        `飞书推送业务失败 code=${code} msg=${payload.msg ?? payload.StatusMessage ?? ''}`,
      ) as Error & { retryable?: boolean };
      err.retryable = code === RATE_LIMIT_CODE;
      throw err;
    }
  }
}
