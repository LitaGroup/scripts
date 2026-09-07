/**
 * Step 3.2：进入语音房发送消息（Android / Lite）
 *
 * 前置：会先搜索并进入 --room-no 指定房间。
 *
 * 运行：
 *   node projects/app/sample/step-3-2-send-message.android.lite.test.ts --room-no=<房间号>
 *   node ... --room-no=240000 --message=hello
 */
import { parseMessage, VoiceRoomSampleBase } from './voiceRoom.helpers.ts';

class Step32SendMessage extends VoiceRoomSampleBase {
  private readonly message: string;

  constructor() {
    super(5);
    this.message = parseMessage(`auto-${Date.now()}`);
  }

  protected async runCase(): Promise<void> {
    await this.act('打开APP并确保已登录', async () => {
      await this.ensureAppLoggedIn();
    });

    await this.act(`搜索并进入语音房 ${this.roomNo}`, async () => {
      await this.searchAndEnterRoom();
    });

    await this.act(`发送公屏消息：${this.message}`, async () => {
      await this.sendRoomMessage(this.message);
    });

    await this.check('公屏出现刚发送的消息', async () => {
      const found = await this.hasRoomMessage(this.message);
      return {
        expect: `公屏含 "${this.message}"`,
        real: found ? '已找到' : '未找到消息气泡',
        pass: found,
      };
    });

    await this.check('仍在目标语音房', async () => this.assertInTargetRoom());
  }
}

await new Step32SendMessage().execute();
