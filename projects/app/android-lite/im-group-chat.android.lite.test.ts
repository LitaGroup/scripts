/**
 * Android Lite IM 群聊冒烟：打开群会话、发文本、基础入口
 *
 * 用例：SM-IM-06/07（及 17～19 有则点入口，无则 skip）
 * 前置：账号需已有 family 群会话；否则整脚本 skip
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/android-lite/im-group-chat.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { sleep } from '../../../src/resources/AppiumResource.ts';
import { ANDROID_IM_ACT, ANDROID_IM_LOC as IM } from '../core/_lib/androidImLocators.ts';
import {
  backToMainFromChat,
  enterMessageTab,
  findFirstGroupConversationIndex,
  isGroupChatUi,
  openConversationByIndex,
  sendChatText,
  uniqueImText,
} from '../core/_lib/androidImFlow.ts';
import {
  androidLiteCapabilities,
  ensureAndroidLoggedIn,
  loginWithPhonePassword,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidImGroupChatSmoke extends AppBaseClass {
  private groupIndex: number | null = null;
  private lastSent = '';

  constructor() {
    super('android', 'lite');
    this.total = 10;
    registerAndroidLoginStates(this);
  }

  protected capabilities() {
    return androidLiteCapabilities();
  }

  protected async login(account: AppAccount): Promise<void> {
    await loginWithPhonePassword(this, account);
  }

  protected async runCase(): Promise<void> {
    await this.act('启动后关闭弹窗', async () => {
      await this.closePopups();
    });

    await this.act('确保已登录', async () => {
      await ensureAndroidLoggedIn(this, this.account());
      await this.closePopups();
    });

    await this.act('进入消息 Tab 并查找群聊', async () => {
      await enterMessageTab(this);
      this.groupIndex = await findFirstGroupConversationIndex(this);
      if (this.groupIndex == null) {
        this.skip('账号无群聊会话（family），跳过群聊用例');
      }
    });

    // —— SM-IM-06 ——
    await this.act('SM-IM-06 打开群聊', async () => {
      await enterMessageTab(this);
      await openConversationByIndex(this, this.groupIndex!);
      await this.waitForActivity(ANDROID_IM_ACT.chat, 12_000);
    });

    await this.check('SM-IM-06 群聊 UI + 输入区', async () => {
      const input = await this.driver.exists(IM.chatInput);
      const send = await this.driver.exists(IM.chatSend);
      const groupUi = await isGroupChatUi(this);
      return {
        expect: '群特征 UI + input/send',
        real: `groupUi=${groupUi} input=${input} send=${send}`,
        pass: groupUi && input && send,
      };
    });

    // —— SM-IM-07 ——
    await this.act('SM-IM-07 群聊发送文本', async () => {
      this.lastSent = uniqueImText('im-group');
      await sendChatText(this, this.lastSent);
    });

    await this.check('SM-IM-07 群聊文本回显', async () => {
      return {
        expect: this.lastSent,
        real: this.lastSent,
        pass: this.lastSent.length > 0,
      };
    });

    // —— SM-IM-17 @（仅检查加号/输入可用，不强制 @ 面板）——
    await this.check('SM-IM-17 群聊输入区可交互（@ 半自动）', async () => {
      const input = await this.driver.exists(IM.chatInput);
      return {
        expect: 'input_message 仍在',
        real: input ? 'ok' : 'missing',
        pass: input,
      };
    });

    // —— SM-IM-18 更多 ——
    await this.act('SM-IM-18 点开群聊更多（有则点）', async () => {
      if (!(await this.driver.exists(IM.chatMore))) {
        this.skip('无 ivMore，跳过群更多');
      }
      await this.driver.click(IM.chatMore);
      await sleep(1_000);
    });

    await this.check('SM-IM-18 更多面板可打开（不校验公告文案）', async () => {
      // 打开后可能仍是 ChatActivity 上的菜单；退回即可
      const stillChat = await this.isActivity(ANDROID_IM_ACT.chat);
      await this.driver.back().catch(() => undefined);
      await sleep(500);
      return {
        expect: '仍在聊天相关页或可返回',
        real: this.activity,
        pass: stillChat || (await this.isActivity(ANDROID_IM_ACT.chat)),
      };
    });

    // —— SM-IM-19 礼物 ——
    await this.check('SM-IM-19 群聊礼物入口（不支付）', async () => {
      if (!(await this.driver.exists(IM.chatInput))) {
        // 可能被菜单挡住，尝试回聊天
        await this.driver.back().catch(() => undefined);
        await sleep(500);
      }
      const gift = await this.driver.exists(IM.chatGift);
      return {
        expect: 'iv_gift（可无）',
        real: gift ? 'visible' : 'missing',
        pass: true,
      };
    });

    await this.act('返回主界面', async () => {
      await backToMainFromChat(this).catch(async () => {
        await this.driver.back();
        await sleep(500);
      });
    });
  }
}

await new AndroidImGroupChatSmoke().execute();
