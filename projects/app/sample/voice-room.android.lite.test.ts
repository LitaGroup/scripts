/**
 * 语音房完整 Sample：搜索进房 → 发消息 → 上麦 → 送礼（Android / Lite）
 *
 * 运行（模拟器 Pixel 7a 示例）：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST SCRIPT_DEVICE_UDID=emulator-5554 \
 *     node projects/app/sample/voice-room.android.lite.test.ts --room-no=2000
 *
 * 若已手动进入 2000 房，可跳过搜索：
 *   ... --room-no=2000 --skip-enter
 */
import { by } from '../../../src/resources/AppiumResource.ts';
import { ID, parseMessage, parseSkipEnter, VoiceRoomSampleBase } from './voiceRoom.helpers.ts';

class VoiceRoomSample extends VoiceRoomSampleBase {
  private readonly message: string;
  private readonly skipEnter: boolean;

  constructor() {
    super(8);
    this.message = parseMessage(`vr-${Date.now()}`);
    this.skipEnter = parseSkipEnter();
  }

  protected async runCase(): Promise<void> {
    await this.act('打开APP并确保已登录', async () => {
      await this.ensureAppLoggedIn();
    });

    // ---------- 3.1 搜索并进入 ----------
    if (this.skipEnter) {
      await this.act('跳过搜索（--skip-enter），确认已在语音房', async () => {
        if (!(await this.isActivity(/\.ui\.voiceRoom\.(FunVoiceRoomActivity|VoiceRoomActivity|PersonVoiceRoomActivity)$/))) {
          throw new Error('当前不在语音房 Activity，请先手动进入 2000 房或去掉 --skip-enter');
        }
        await this.prepareRoomUi(15_000);
      });
    } else {
      await this.act(`搜索并进入语音房 ${this.roomNo}`, async () => {
        await this.searchAndEnterRoom();
      });
    }

    await this.check('3.1 已进入目标语音房', async () => this.assertInTargetRoom());

    // ---------- 3.2 发送消息 ----------
    await this.act(`3.2 发送公屏消息：${this.message}`, async () => {
      await this.sendRoomMessage(this.message);
    });

    await this.check('3.2 公屏出现刚发送的消息', async () => {
      const found = await this.hasRoomMessage(this.message);
      return {
        expect: `公屏含 "${this.message}"`,
        real: found ? '已找到' : '未找到消息气泡',
        pass: found,
      };
    });

    // ---------- 3.3 上麦 ----------
    await this.act('3.3 申请上麦', async () => {
      const result = await this.takeMic();
      this.log(`上麦结果: ${result}`);
    });

    await this.check('3.3 上麦成功或排队中', async () => {
      const onMic = await this.driver.exists(by.id(ID.onMicMute));
      const queued = await this.driver.exists(by.id(ID.queueRemind));
      return {
        expect: '已上麦或排队中',
        real: onMic ? '已上麦' : queued ? '排队中' : '失败',
        pass: onMic || queued,
      };
    });

    // ---------- 3.4 送礼 ----------
    await this.act('3.4 打开礼物面板并送礼', async () => {
      await this.sendGift();
    });

    await this.check('3.4 送礼动作完成', async () => {
      const r = await this.assertGiftSent();
      if (r.emptyMic) this.skip(r.real);
      return r;
    });
  }
}

await new VoiceRoomSample().execute();
