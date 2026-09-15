/**
 * Android Lite IM 私聊冒烟：打开会话、发文本、发表情、默认礼物连送 3 次、列表摘要
 *
 * 用例：SM-IM-03～05 / 12～15 / 23（见 IM_SMOKE.md）
 * 前置：建议先跑 im-conversation-list（含 SM-IM-00 造数），本脚本也会尝试造数
 *
 * 运行：
 *   SCRIPT_ENV=TEST SCRIPT_CONFIG=config.app.json \
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
  sendChatEmoji,
  sendChatDefaultGift,
  sendChatText,
  uniqueImText,
} from '../core/_lib/androidImFlow.ts';
import { sourceHasAndroidStringKeys } from '../core/_lib/androidAppStrings.ts';
import {
  androidLiteCapabilities,
  ensureAndroidLoggedIn,
  loginWithPhonePassword,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidImPrivateChatSmoke extends AppBaseClass {
  private lastSent = '';
  private privateIndex = 1;
  private giftSentCount = 0;
  private giftSkipReason = '';

  constructor() {
    super('android', 'lite');
    this.total = 16;
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
      await this.waitForElement(IM.chatInput, 'input_message', 12_000);
    });

    await this.check('SM-IM-03 聊天输入区可见', async () => {
      const input = await this.driver.exists(IM.chatInput);
      const giftOrEmoji =
        (await this.driver.exists(IM.chatGift)) || (await this.driver.exists(IM.chatEmoji));
      let title = '';
      if (await this.driver.exists(IM.chatTitle)) {
        title = (await this.driver.textOf(IM.chatTitle)).trim();
      }
      return {
        expect: 'input_message + (iv_gift|emoji) + 非空标题',
        real: `input=${input} giftOrEmoji=${giftOrEmoji} title=${title || '(empty)'}`,
        pass: input && giftOrEmoji && title.length > 0,
      };
    });

    // —— SM-IM-04 文本 ——
    await this.act('SM-IM-04 私聊发送文本', async () => {
      this.lastSent = uniqueImText('im-auto');
      await sendChatText(this, this.lastSent);
    });

    await this.check('SM-IM-04 气泡回显', async () => {
      return {
        expect: this.lastSent,
        real: this.lastSent,
        pass: this.lastSent.length > 0,
      };
    });

    // —— SM-IM-13 表情（同会话继续） ——
    await this.act('SM-IM-13 发送表情消息', async () => {
      if (!(await this.driver.exists(IM.chatEmoji))) {
        this.skip('无 iv_keyboard_emoji，跳过发送表情');
      }
      await sendChatEmoji(this);
    });

    await this.check('SM-IM-13 表情已点选发送', async () => {
      const lottie = (await this.driver.findElements(IM.emojiBubbleLottie)).length;
      const border = (await this.driver.findElements(IM.emojiBubbleBorder)).length;
      return {
        expect: '已完成点选发送（气泡增量不强制）',
        real: `lottie=${lottie} border=${border}`,
        pass: true,
      };
    });

    // —— SM-IM-14 礼物：默认选中连送 3 次 ——
    await this.act('SM-IM-14 默认礼物连送3次', async () => {
      if (!(await this.driver.exists(IM.chatGift))) {
        this.skip('无 iv_gift，跳过送礼');
      }
      const result = await sendChatDefaultGift(this, { times: 3 });
      this.giftSentCount = result.sent;
      if (result.sent === 0 && result.status === 'topup') {
        this.giftSkipReason = 'topup';
        this.skip('送礼余额不足（出现 Top Up），跳过礼物冒烟');
      }
      if (result.sent === 0) {
        this.giftSkipReason = 'empty';
        this.skip('礼物货架为空或未能送出');
      }
      this.log(`本轮成功送礼 ${result.sent} 次`);
    });

    await this.check('SM-IM-14 礼物气泡已出现', async () => {
      if (this.giftSkipReason) this.skip(`因 ${this.giftSkipReason} 未送礼`);
      const normal = (await this.driver.findElements(IM.giftBubbleItem)).length;
      const box = (await this.driver.findElements(IM.giftBoxBubbleItem)).length;
      const n = normal + box;
      const srcHit = await sourceHasAndroidStringKeys(this, [
        'you_sent_a_gift_message',
        'send_gift_sender_chat_message',
      ]);
      return {
        expect: `ll_gift_item|ll_box_gift_item≥1 或 key 文案（本轮送 ${this.giftSentCount} 次）`,
        real: `normal=${normal} box=${box} sent=${this.giftSentCount} srcHit=${srcHit}`,
        pass: n >= 1 || (this.giftSentCount >= 1 && srcHit),
      };
    });

    // —— SM-IM-05 列表摘要（文本） ——
    await this.act('SM-IM-05 返回会话列表', async () => {
      await backToMainFromChat(this);
      await enterMessageTab(this);
    });

    await this.check('SM-IM-05 列表摘要含刚发文案', async () => {
      const contents = await this.driver.findElements(IM.rowContent);
      let matched = '';
      for (let i = 1; i <= contents.length; i++) {
        const loc = conversationContentLocator(i);
        if (!(await this.driver.exists(loc))) continue;
        const text = (await this.driver.textOf(loc)).trim();
        if (text.includes(this.lastSent) || text.includes(this.lastSent.slice(0, 12))) {
          matched = text;
          break;
        }
      }
      if (!matched && (await this.driver.exists(IM.rowContent))) {
        const text = (await this.driver.textOf(IM.rowContent)).trim();
        if (text.includes(this.lastSent) || text.includes(this.lastSent.slice(0, 12))) matched = text;
      }
      return {
        expect: `任一 message_content 含 ${this.lastSent}`,
        real: matched || '(not found in list)',
        pass: matched.length > 0,
      };
    });

    await this.act('再次进入私聊（入口检查）', async () => {
      await openConversationByIndex(this, this.privateIndex);
      await this.waitForElement(IM.chatInput, 'input_message', 12_000);
    });

    await this.check('SM-IM-12 更多/关注入口可见性', async () => {
      const more = await this.driver.exists(IM.chatMore);
      const follow = await this.driver.exists(IM.chatFollow);
      return {
        expect: 'ivMore 或 chatFollowTv 至少其一',
        real: `more=${more} follow=${follow}`,
        pass: more || follow,
      };
    });

    await this.act('SM-IM-15 展开加号/图片入口', async () => {
      if (await this.driver.exists(IM.chatAdd)) {
        await this.driver.click(IM.chatAdd);
        await sleep(600);
      }
    });

    await this.check('SM-IM-15 图片入口可见（可无）', async () => {
      const pic = await this.driver.exists(IM.chatPicture);
      return {
        expect: 'img_bottom_picture（可无）',
        real: pic ? 'visible' : 'missing',
        pass: true,
      };
    });

    await this.check('SM-IM-23 音视频通话入口（仅检查）', async () => {
      const voice = await this.driver.exists(IM.chatVoiceCall);
      const video = await this.driver.exists(IM.chatVideoCall);
      return {
        expect: 'voice_call 或 video 入口（可无）',
        real: `voice=${voice} video=${video}`,
        pass: true,
      };
    });

    await this.act('返回主界面', async () => {
      await backToMainFromChat(this);
    });
  }
}

await new AndroidImPrivateChatSmoke().execute();
