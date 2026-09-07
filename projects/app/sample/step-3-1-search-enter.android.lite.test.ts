/**
 * Step 3.1：语音房搜索并进入（Android / Lite）
 *
 * 运行：
 *   node projects/app/sample/step-3-1-search-enter.android.lite.test.ts --room-no=<房间号>
 *   SCRIPT_ROOM_NO=240000 node projects/app/sample/step-3-1-search-enter.android.lite.test.ts
 */
import { VoiceRoomSampleBase } from './voiceRoom.helpers.ts';

class Step31SearchEnter extends VoiceRoomSampleBase {
  constructor() {
    super(3);
  }

  protected async runCase(): Promise<void> {
    await this.act('打开APP并确保已登录', async () => {
      await this.ensureAppLoggedIn();
      // 3.1 强制走搜索路径：若已在房内则先退出
      if (await this.isActivity(/\.ui\.voiceRoom\.(FunVoiceRoomActivity|VoiceRoomActivity|PersonVoiceRoomActivity)$/)) {
        await this.leaveRoomToMain();
      }
    });

    await this.act(`搜索并进入语音房 ${this.roomNo}`, async () => {
      await this.searchAndEnterRoom();
    });

    await this.check('已进入目标语音房', async () => this.assertInTargetRoom());
  }
}

await new Step31SearchEnter().execute();
