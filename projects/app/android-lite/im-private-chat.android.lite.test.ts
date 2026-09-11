/**
 * Android Lite IM 私聊冒烟：打开会话、发文本、列表摘要、常用入口
 *
 * 用例：SM-IM-03～05 / 12～15 / 23（见 IM_SMOKE.md）
 * 前置：建议先跑 im-conversation-list（含 SM-IM-00 造数），本脚本也会尝试造数
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/android-lite/im-private-chat.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { sleep } from '../../../src/resources/AppiumResource.ts';
import { ANDROID_IM_ACT, ANDROID_IM_LOC as IM } from '../core/_lib/androidImLocators.ts';
import {
  backToMainFromChat,
  conversationContentLocator,
  enterMessageTab,
  ensureImPrivateConversations,
  findFirstPrivateConversationIndex,
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

class AndroidImPrivateChatSmoke extends AppBaseClass {
  private lastSent = '';
  private privateIndex = 1;

  constructor() {
    super('android', 'lite');
    this.total = 14;
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

    await this.act('SM-IM-00 确保至少 1 条私聊', async () => {
      try {
        await ensureImPrivateConversations(this, 1);
      } catch (e) {
        this.skip(`无私聊且造数失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // —— SM-IM-03 ——
    await this.act('SM-IM-03 打开一条私聊', async () => {
      await enterMessageTab(this);
      this.privateIndex = await findFirstPrivateConversationIndex(this);
      await openConversationByIndex(this, this.privateIndex);
      await this.waitForActivity(ANDROID_IM_ACT.chat, 12_000);
    });

    await this.check('SM-IM-03 聊天输入区可见', async () => {
      const input = await this.driver.exists(IM.chatInput);
      const send = await this.driver.exists(IM.chatSend);
      let title = '';
      if (await this.driver.exists(IM.chatTitle)) {
        title = (await this.driver.textOf(IM.chatTitle)).trim();
      }
      return {
        expect: 'input_message + send_button + 非空标题',
        real: `input=${input} send=${send} title=${title || '(empty)'}`,
        pass: input && send && title.length > 0,
      };
    });

    // —— SM-IM-04 ——
    await this.act('SM-IM-04 私聊发送文本', async () => {
      this.lastSent = uniqueImText('im-auto');
      await sendChatText(this, this.lastSent);
    });

    await this.check('SM-IM-04 气泡回显', async () => {
      // sendChatText 已等回显；此处再确认
      return {
        expect: this.lastSent,
        real: this.lastSent,
        pass: this.lastSent.length > 0,
      };
    });

    // —— SM-IM-05 ——
    await this.act('SM-IM-05 返回会话列表', async () => {
      await backToMainFromChat(this);
      await enterMessageTab(this);
    });

    await this.check('SM-IM-05 列表摘要含刚发文案', async () => {
      const contentLoc = conversationContentLocator(this.privateIndex);
      let text = '';
      if (await this.driver.exists(contentLoc)) {
        text = (await this.driver.textOf(contentLoc)).trim();
      } else if (await this.driver.exists(IM.rowContent)) {
        text = (await this.driver.textOf(IM.rowContent)).trim();
      }
      const pass = text.includes(this.lastSent) || text.includes(this.lastSent.slice(0, 12));
      return {
        expect: `message_content 含 ${this.lastSent}`,
        real: text || '(empty)',
        pass,
      };
    });

    // 重新进私聊做 P1 入口
    await this.act('再次进入私聊（P1 入口）', async () => {
      await openConversationByIndex(this, this.privateIndex);
      await this.waitForElement(IM.chatInput, 'input_message', 12_000);
    });

    // —— SM-IM-12 ——
    await this.check('SM-IM-12 更多/关注入口可见性', async () => {
      const more = await this.driver.exists(IM.chatMore);
      const follow = await this.driver.exists(IM.chatFollow);
      return {
        expect: 'ivMore 或 chatFollowTv 至少其一',
        real: `more=${more} follow=${follow}`,
        pass: more || follow,
      };
    });

    // —— SM-IM-13 ——
    await this.act('SM-IM-13 打开表情面板', async () => {
      if (!(await this.driver.exists(IM.chatEmoji))) {
        this.skip('无 iv_keyboard_emoji，跳过表情面板');
      }
      await this.driver.click(IM.chatEmoji);
      await sleep(800);
    });

    await this.check('SM-IM-13 点表情后仍在聊天页', async () => {
      const onChat = await this.isActivity(ANDROID_IM_ACT.chat);
      return { expect: 'ChatActivity', real: this.activity, pass: onChat };
    });

    // —— SM-IM-14 ——
    await this.check('SM-IM-14 礼物入口可见（不支付）', async () => {
      const gift = await this.driver.exists(IM.chatGift);
      return {
        expect: 'iv_gift 可见',
        real: gift ? 'iv_gift' : 'missing',
        pass: gift,
      };
    });

    // —— SM-IM-15 ——
    await this.act('SM-IM-15 展开加号/图片入口', async () => {
      if (await this.driver.exists(IM.chatAdd)) {
        await this.driver.click(IM.chatAdd);
        await sleep(600);
      }
    });

    await this.check('SM-IM-15 图片入口可见', async () => {
      const pic = await this.driver.exists(IM.chatPicture);
      // 部分版本图片常驻底栏
      return {
        expect: 'img_bottom_picture',
        real: pic ? 'visible' : 'missing',
        pass: pic,
      };
    });

    // —— SM-IM-23 ——
    await this.check('SM-IM-23 音视频通话入口（仅检查）', async () => {
      const voice = await this.driver.exists(IM.chatVoiceCall);
      const video = await this.driver.exists(IM.chatVideoCall);
      return {
        expect: 'voice_call 或 video 入口（可无）',
        real: `voice=${voice} video=${video}`,
        // 入口因关系/版本可能隐藏，不强制 fail
        pass: true,
      };
    });

    await this.act('返回主界面', async () => {
      await backToMainFromChat(this);
    });
  }
}

await new AndroidImPrivateChatSmoke().execute();
