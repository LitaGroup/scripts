/**
 * 语音房功能测试（Android / Lite）— 串联 3.1～3.4
 *
 *   3.1 语音房搜索并进入
 *   3.2 进入语音房发送消息
 *   3.4 语音房送礼（在上麦前：需麦上有其他用户）
 *   3.3 语音房上麦
 *
 * 运行：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     node projects/app/lita-lite/voice-room.android.lite.test.ts --room-no=2000
 *
 * 可选：
 *   --message=hello          公屏文案（默认 vr-<timestamp>）
 *   --skip-enter             已在目标房内时跳过 3.1 搜索进房
 *   SCRIPT_CONFIG=config.app.json
 *   SCRIPT_DEVICE_UDID=<adb-serial>
 */
import { by } from '../../../src/resources/AppiumResource.ts';
import { ID, parseMessage, parseSkipEnter, ROOM_ACTIVITY, VoiceRoomSampleBase } from './voiceRoom.helpers.ts';

class VoiceRoomTest extends VoiceRoomSampleBase {
  private readonly message: string;
  private readonly skipEnter: boolean;
  private micResult: 'on-mic' | 'queued' | null = null;
  private giftResult: 'sent' | 'empty-mic' | null = null;

  constructor() {
    // 登录 + 3.1 act/check + 3.2 act/check + 3.4 act/check + 3.3 act/check
    super(9);
    this.message = parseMessage(`vr-${Date.now()}`);
    this.skipEnter = parseSkipEnter();
  }

  protected async runCase(): Promise<void> {
    await this.act('打开APP并确保已登录', async () => {
      await this.ensureAppLoggedIn();
    });

    // ---------- 3.1 语音房搜索并进入 ----------
    if (this.skipEnter) {
      await this.act('3.1 跳过搜索（--skip-enter），确认已在语音房', async () => {
        if (!(await this.isActivity(ROOM_ACTIVITY))) {
          throw new Error('当前不在语音房 Activity，请先手动进入目标房或去掉 --skip-enter');
        }
        await this.prepareRoomUi(8_000);
      });
    } else {
      await this.act(`3.1 搜索并进入语音房 ${this.roomNo}`, async () => {
        // 已在目标房则复用（searchAndEnterRoom 内部判断）；勿强制退房
        await this.searchAndEnterRoom();
      });
    }

    await this.check('3.1 已进入目标语音房', async () => this.assertInTargetRoom());

    // ---------- 3.2 进入语音房发送消息 ----------
    await this.act(`3.2 发送公屏消息：${this.message}`, async () => {
      await this.sendRoomMessage(this.message);
    });

    await this.check('3.2 公屏出现刚发送的消息', async () => {
      const found = await this.hasRoomMessage(this.message, 6_000);
      return {
        expect: `公屏含 "${this.message}"`,
        real: found ? '已找到' : '未找到消息气泡',
        pass: found,
      };
    });

    // ---------- 3.4 语音房送礼（先于上麦，避免独自占麦后无人可送） ----------
    await this.act('3.4 打开礼物面板并送礼', async () => {
      this.giftResult = await this.sendGift();
      this.log(`送礼结果: ${this.giftResult}`);
    });

    await this.check('3.4 送礼动作完成', async () => {
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
      return this.assertGiftSent(this.giftResult ?? undefined);
    });

    // ---------- 3.3 语音房上麦 ----------
    await this.act('3.3 申请上麦（Join / 麦位）', async () => {
      this.micResult = await this.takeMic();
      this.log(`上麦结果: ${this.micResult}`);
    });

    await this.check('3.3 上麦成功或排队中', async () => {
      if (this.micResult === 'on-mic' || this.micResult === 'queued') {
        return {
          expect: '已上麦或排队中',
          real: this.micResult === 'on-mic' ? '已上麦' : '排队中',
          pass: true,
        };
      }
      const onMic = await this.driver.exists(by.id(ID.onMicMute));
      const queued = await this.driver.exists(by.id(ID.queueRemind));
      return {
        expect: '已上麦或排队中',
        real: onMic ? '已上麦' : queued ? '排队中' : '未上麦且未排队',
        pass: onMic || queued,
      };
    });
  }
}

await new VoiceRoomTest().execute();
