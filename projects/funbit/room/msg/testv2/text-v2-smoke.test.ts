import { CheckBaseClass, type CheckResult } from '../../../../../src/base/CheckBaseClass.ts';

/**
 * 公屏广播 TEXT_V2 冒烟测试（测试环境）
 * 需求：http://project.cinta.team/api/documents/81.md
 * 接口：http://project.cinta.team/api/documents/102.md
 * 技术方案：http://project.cinta.team/api/documents/101.md
 *
 * 覆盖：富文本完整参数 / 多段样式 / 省略 paramMap / 省略 action / 指定与空 receiverIds 发送成功，
 *      以及 roomId（缺失/0/负数）与 content（缺失/空串/全空格）的必填校验。
 * 说明：本用例只验证服务端接口契约；声网下发后的客户端高亮/加粗/字号展示需真机联调确认。
 *
 * 运行：node text-v2-smoke.test.ts [--room-id=10100001] [--receiver-id=40]
 * 前置：可访问测试环境网关，无需登录态。
 */

const TEST_HOST = 'https://api.test.cinta.team/';
const PATH = 'litaroom/v2/test/sendTextV2';
const HTTP_TIMEOUT_MS = 30_000;

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const ROOM_ID = Number(arg('room-id', '10100001'));
const RECEIVER_ID = Number(arg('receiver-id', '40'));

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

interface ApiResponse {
  http: number;
  body: Record<string, unknown>;
}

class TextV2Smoke extends CheckBaseClass {
  private runTag = '';

  constructor() {
    super();
    this.total = 7;
  }

  protected async run(): Promise<void> {
    this.runTag = `[smoke ${Date.now()}]`;

    await this.check('完整参数：content + paramMap 全样式 + action + receiverIds 发送成功', async (): Promise<CheckResult> => {
      const content = `${this.runTag} Congratulations to {nick} for winning the crown`;
      const res = await this.send({
        roomId: ROOM_ID,
        content,
        paramMap: [
          {
            type: 'text',
            value: '{nick}',
            specialTextColor: '#FFD700',
            bold: true,
            size: 18,
            isUnderline: false,
          },
        ],
        action: { type: 'web_dialog', data: {} },
        receiverIds: [RECEIVER_ID],
      });
      return this.expectSuccess(res, '完整参数');
    });

    await this.check('多段样式：不同子串分别设置高亮/加粗/字号/下划线发送成功', async (): Promise<CheckResult> => {
      const content = `${this.runTag} gold bold big underline`;
      const res = await this.send({
        roomId: ROOM_ID,
        content,
        paramMap: [
          { type: 'text', value: 'gold', specialTextColor: '#FF0000' },
          { type: 'text', value: 'bold', bold: true },
          { type: 'text', value: 'big', size: 24 },
          { type: 'text', value: 'underline', isUnderline: true },
        ],
      });
      return this.expectSuccess(res, '多段样式');
    });

    await this.check('省略 paramMap：按普通文本发送成功', async (): Promise<CheckResult> => {
      const res = await this.send({ roomId: ROOM_ID, content: `${this.runTag} plain text only` });
      return this.expectSuccess(res, '无 paramMap');
    });

    await this.check('省略 action：仅文本与样式仍发送成功', async (): Promise<CheckResult> => {
      const res = await this.send({
        roomId: ROOM_ID,
        content: `${this.runTag} no action {nick}`,
        paramMap: [{ type: 'text', value: '{nick}', bold: true }],
      });
      return this.expectSuccess(res, '无 action');
    });

    await this.check('receiverIds=[]：向房间内所有人发送成功', async (): Promise<CheckResult> => {
      const res = await this.send({
        roomId: ROOM_ID,
        content: `${this.runTag} broadcast to all`,
        paramMap: [{ type: 'text', value: 'all', specialTextColor: '#00FF00' }],
        receiverIds: [],
      });
      return this.expectSuccess(res, '空 receiverIds');
    });

    await this.check('roomId 缺失/0/负数：返回「roomId 不能为空且必须大于 0」', async (): Promise<CheckResult> => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ['缺失', { content: `${this.runTag} no room` }],
        ['0', { roomId: 0, content: `${this.runTag} zero room` }],
        ['负数', { roomId: -1, content: `${this.runTag} negative room` }],
      ];
      return this.expectValidation(cases, 'roomId 不能为空且必须大于 0');
    });

    await this.check('content 缺失/空串/全空格：返回「content 不能为空」', async (): Promise<CheckResult> => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ['缺失', { roomId: ROOM_ID }],
        ['空串', { roomId: ROOM_ID, content: '' }],
        ['全空格', { roomId: ROOM_ID, content: '   ' }],
      ];
      return this.expectValidation(cases, 'content 不能为空');
    });
  }

  private async send(body: Record<string, unknown>): Promise<ApiResponse> {
    const url = `${TEST_HOST}${PATH}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`请求 ${url} 失败：${(e as Error).message}`);
    }
    const text = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`HTTP ${res.status} 非 JSON 响应：${text.slice(0, 300)}`);
    }
    return { http: res.status, body: parsed };
  }

  private expectSuccess(res: ApiResponse, scene: string): CheckResult {
    const b = res.body;
    const data = asRecord(b.data);
    const result = asRecord(data.result);
    const requestId = String(result.request_id ?? '');
    const problems: string[] = [];
    if (res.http !== 200) problems.push(`HTTP=${res.http}`);
    if (String(b.status) !== '0') problems.push(`status=${b.status}`);
    if (String(b.state) !== 'OK') problems.push(`state=${b.state}`);
    if (String(b.msg) !== 'OK') problems.push(`msg=${b.msg}`);
    if (data.success !== true) problems.push(`data.success=${data.success}`);
    if (String(data.httpStatus) !== '200') problems.push(`data.httpStatus=${data.httpStatus}`);
    if (String(result.code) !== 'message_sent') problems.push(`result.code=${result.code}`);
    if (String(result.result) !== 'success') problems.push(`result.result=${result.result}`);
    if (requestId.length === 0) problems.push('request_id 为空');
    if (problems.length === 0) this.log(`${scene} 发送成功 requestId=${requestId}`);
    return {
      expect: 'HTTP=200,status=0,state=OK,success=true,code=message_sent,request_id 非空',
      real: problems.length === 0 ? '符合' : problems.join('；'),
      pass: problems.length === 0,
    };
  }

  private async expectValidation(
    cases: Array<[string, Record<string, unknown>]>,
    expectedMsg: string,
  ): Promise<CheckResult> {
    const bad: string[] = [];
    for (const [name, body] of cases) {
      const res = await this.send(body);
      const b = res.body;
      if (res.http !== 200
        || String(b.status) !== '400002'
        || String(b.state) !== 'R_OPERATION_FAIL'
        || String(b.msg) !== expectedMsg
        || b.data !== undefined) {
        bad.push(`${name}: HTTP=${res.http},status=${b.status},state=${b.state},msg=${b.msg},data=${b.data === undefined ? '无' : '有'}`);
      }
    }
    return {
      expect: `HTTP=200,status=400002,state=R_OPERATION_FAIL,msg=${expectedMsg},无 data`,
      real: bad.length === 0 ? '全部符合' : bad.join('；'),
      pass: bad.length === 0,
    };
  }
}

await new TextV2Smoke().execute();
