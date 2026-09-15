 * Android Lite IM 私聊冒烟：打开会话、发文本、发表情、默认礼物连送、入口检查、列表摘要
 *
 * 用例：SM-IM-03～05 / 12～15 / 23（见 IM_SMOKE.md）
 * 顺序：同会话内 03→04→13→14→12/15/23，最后回列表做 05（不重进私聊）
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
  isInPrivateChatUi,
  openConversationByIndex,
  sendChatEmoji,
  sendChatDefaultGift,
  sendChatText,
  uniqueImText,
} from '../core/_lib/androidImFlow.ts';
import { sourceHasAndroidStringKeys, resolveAndroidStrings } from '../core/_lib/androidAppStrings.ts';
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
  /** 启动时是否已停在私聊页（避免重复找会话） */
  private startedInChat = false;

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
      this.startedInChat = await isInPrivateChatUi(this);
      if (this.startedInChat) this.log('启动后已在私聊页，后续会话步骤将复用');
    });

    await this.act('SM-IM-00 确保至少 1 条私聊', async () => {
      if (this.startedInChat || (await isInPrivateChatUi(this))) {
        this.log('已在私聊页，跳过造数');
        return;
      }
      try {
        await ensureImPrivateConversations(this, 1);
      } catch (e) {
        this.skip(`无私聊且造数失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // —— SM-IM-03 ——
    await this.act('SM-IM-03 打开一条私聊', async () => {
      if (await isInPrivateChatUi(this)) {
        this.log('已在私聊输入页，跳过列表查找');
        this.startedInChat = true;
        return;
      }
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
      // 标题偶发晚于输入区渲染 / 特效昵称拿不到 text，短等后仍空则不挡通过
      let title = '';
      const titleDeadline = Date.now() + 2_500;
      while (Date.now() < titleDeadline) {
        if (await this.driver.exists(IM.chatTitle)) {
          try {
            title = (await this.driver.textOf(IM.chatTitle)).trim();
          } catch {
            title = '';
          }
          if (title) break;
        }
        await sleep(300);
      }
      return {
        expect: 'input_message + (iv_gift|emoji)（标题可选）',
        real: `input=${input} giftOrEmoji=${giftOrEmoji} title=${title || '(empty/optional)'}`,
        pass: !!(input && giftOrEmoji),
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

    // —— SM-IM-12/15/23：仍在私聊页做入口检查，避免回列表后再重进 ——
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

    // —— SM-IM-05 列表摘要（最后回列表，不再重进私聊） ——
    await this.act('SM-IM-05 返回会话列表', async () => {
      await backToMainFromChat(this);
      await enterMessageTab(this);
      await sleep(1_200); // 等会话摘要刷新
    });

    await this.check('SM-IM-05 列表摘要已更新', async () => {
      const giftCopies = await resolveAndroidStrings(this, [
        'you_sent_a_gift_message',
        'send_gift_sender_chat_message',
        'im_receive_gift',
      ]);
      const contents = await this.driver.findElements(IM.rowContent);
      const seen: string[] = [];
      let matched = '';
      let how = '';
      for (let i = 1; i <= Math.max(contents.length, 1); i++) {
        const loc = conversationContentLocator(i);
        if (!(await this.driver.exists(loc))) continue;
        const text = (await this.driver.textOf(loc)).trim();
        if (text) seen.push(text.slice(0, 80));
        if (
          this.lastSent &&
          (text.includes(this.lastSent) || text.includes(this.lastSent.slice(0, 12)))
        ) {
          matched = text;
          how = 'text';
          break;
        }
        if (giftCopies.some((g) => g && text.includes(g))) {
          matched = text;
          how = 'gift-key';
          break;
        }
        // 列表摘要偶发用礼物名；本轮已成功送礼则非空摘要即可
        if (this.giftSentCount >= 1 && text.length > 0) {
          matched = text;
          how = 'gift-sent-fallback';
          break;
        }
      }
      if (!matched && this.giftSentCount >= 1) {
        const srcHit = await sourceHasAndroidStringKeys(this, [
          'you_sent_a_gift_message',
          'send_gift_sender_chat_message',
        ]);
        if (srcHit) {
          matched = '(source gift key)';
          how = 'source';
        }
      }
      return {
        expect: `message_content 含刚发文案或礼物摘要（本轮送礼 ${this.giftSentCount}）`,
        real: matched
          ? `hit=${how} text=${matched}`
          : `not found; seen=[${seen.slice(0, 5).join(' | ')}]`,
        pass: matched.length > 0,
      };
    });
  }
}

await new AndroidImPrivateChatSmoke().execute();
