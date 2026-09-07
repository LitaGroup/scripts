/**
 * Step 3.4：语音房送礼（Android / Lite）
 *
 * 流程：登录 → 搜索进房 → 打开礼物面板 → 选礼物 → Send
 * 注意：账号需有足够金币，否则送礼按钮可能跳转充值。
 *
 * 运行：
 *   node projects/app/sample/step-3-4-send-gift.android.lite.test.ts --room-no=<房间号>
 */
import { by } from '../../../src/resources/AppiumResource.ts';
import { ID, VoiceRoomSampleBase } from './voiceRoom.helpers.ts';

class Step34SendGift extends VoiceRoomSampleBase {
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

    await this.act('打开礼物面板并发送礼物', async () => {
      await this.sendGift();
    });

    await this.check('送礼动作完成（连击或面板关闭）', async () => {
      // 成功常见表现：出现连击 giftComboView，或礼物面板关闭
      const combo = await this.driver.waitFor(by.id(ID.giftCombo), 5_000);
      const panelGone = !(await this.driver.exists(by.id(ID.giftSend)));
      const ok = combo || panelGone;
      return {
        expect: '出现连击或礼物面板关闭',
        real: combo ? '出现连击' : panelGone ? '面板已关闭' : '面板仍在且无连击',
        pass: ok,
      };
    });
  }
}

await new Step34SendGift().execute();
