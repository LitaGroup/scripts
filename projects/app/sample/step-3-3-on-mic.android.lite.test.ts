/**
 * Step 3.3：语音房上麦（Android / Lite）
 *
 * 流程：登录 → 搜索进房 → 点 Join（或麦位）→ 如有 Boss/Regular 选 Regular → 校验已上麦/排队
 *
 * 运行：
 *   node projects/app/sample/step-3-3-on-mic.android.lite.test.ts --room-no=<房间号>
 */
import { by } from '../../../src/resources/AppiumResource.ts';
import { ID, VoiceRoomSampleBase } from './voiceRoom.helpers.ts';

class Step33OnMic extends VoiceRoomSampleBase {
  constructor() {
    super(4);
  }

  protected async runCase(): Promise<void> {
    await this.act('打开APP并确保已登录', async () => {
      await this.ensureAppLoggedIn();
    });

    await this.act(`搜索并进入语音房 ${this.roomNo}`, async () => {
      await this.searchAndEnterRoom();
    });

    await this.act('申请上麦（Join / 麦位）', async () => {
      const result = await this.takeMic();
      this.log(`上麦结果: ${result}`);
    });

    await this.check('上麦成功或已进入排队', async () => {
      const onMic = await this.driver.exists(by.id(ID.onMicMute));
      const queued = await this.driver.exists(by.id(ID.queueRemind));
      const status = onMic ? '已上麦(静音按钮可见)' : queued ? '排队中' : '未上麦且未排队';
      return {
        expect: '已上麦或排队中',
        real: status,
        pass: onMic || queued,
      };
    });
  }
}

await new Step33OnMic().execute();
