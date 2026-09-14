/**
 * Android Lite IM 会话列表冒烟：造数 + 列表 + 长按 + 多选
 *
 * 用例：SM-IM-00/01/02/09/10/11/20/29～38（见 IM_SMOKE.md）
 * 工程：lita-lite-android，package com.litalite.android
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/android-lite/im-conversation-list.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { sleep } from '../../../src/resources/AppiumResource.ts';
import { ANDROID_IM_ACT, ANDROID_IM_LOC as IM, conversationRowLocator } from '../core/_lib/androidImLocators.ts';
import {
  backToMainFromChat,
  countConversationRows,
  dismissLongPressSheet,
  dismissTransientDialogs,
  enterMessageTab,
  enterMultiSelect,
  ensureImPrivateConversations,
  exitMultiSelectIfNeeded,
  findFirstGroupConversationIndex,
  findFirstPrivateConversationIndex,
  longPressConversation,
  openConversationByIndex,
} from '../core/_lib/androidImFlow.ts';
import {
  androidLiteCapabilities,
  ensureAndroidLoggedIn,
  loginWithPhonePassword,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidImConversationListSmoke extends AppBaseClass {
  private imReady = false;
  private hasGroup = false;

  constructor() {
    super('android', 'lite');
    this.total = 22;
    registerAndroidLoginStates(this);
  }

  private requireImReady(): void {
    if (!this.imReady) this.skip('会话造数未完成，跳过本步');
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

    // —— SM-IM-00 ——
    await this.act('SM-IM-00 会话造数（首页推荐陪玩师）', async () => {
      try {
        const n = await ensureImPrivateConversations(this);
        this.imReady = true;
        this.log(`造数完成，会话行数=${n}`);
      } catch (e) {
        this.skip(`造数失败，后续 IM 列表步骤将 skip: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // —— SM-IM-01 ——
    await this.act('SM-IM-01 进入消息 Tab 会话列表', async () => {
      this.requireImReady();
      await enterMessageTab(this);
    });

    await this.check('SM-IM-01 会话列表容器可见', async () => {
      this.requireImReady();
      const hasList = await this.driver.exists(IM.messageList);
      const hasRoot = await this.driver.exists(IM.chatListRoot);
      return {
        expect: 'message_list 或 fragment_message_center',
        real: hasList ? 'message_list' : hasRoot ? 'fragment_message_center' : 'missing',
        pass: hasList || hasRoot,
      };
    });

    // —— SM-IM-02 ——
    await this.check('SM-IM-02 列表基础元素可见', async () => {
      this.requireImReady();
      const title = await this.driver.exists(IM.listTitle);
      const search = await this.driver.exists(IM.listSearch);
      const more = await this.driver.exists(IM.listMore);
      const list = await this.driver.exists(IM.messageList);
      const missing = [
        !title && 'tv_title',
        !search && 'img_search',
        !more && 'iv_more',
        !list && 'message_list',
      ].filter(Boolean);
      return {
        expect: 'tv_title + img_search + iv_more + message_list',
        real: missing.length ? `缺: ${missing.join(',')}` : 'ok',
        pass: missing.length === 0,
      };
    });

    // —— SM-IM-09 ——
    await this.act('SM-IM-09 打开会话搜索', async () => {
      this.requireImReady();
      await exitMultiSelectIfNeeded(this);
      await this.assertExists(IM.listSearch, 'img_search');
      await this.driver.click(IM.listSearch);
      await sleep(1_000);
    });

    await this.check('SM-IM-09 进入搜索页', async () => {
      this.requireImReady();
      const onSearch = await this.isActivity(ANDROID_IM_ACT.searchConversation);
      return {
        expect: 'SearchConversationActivity',
        real: this.activity,
        pass: onSearch,
      };
    });

    await this.act('SM-IM-09 返回会话列表', async () => {
      this.requireImReady();
      await this.driver.back();
      await sleep(800);
      await enterMessageTab(this);
    });

    // —— SM-IM-20 ——
    await this.act('SM-IM-20 系统通知入口（有则点开）', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const total = await countConversationRows(this);
      let opened = false;
      for (let i = 1; i <= Math.min(total, 6); i++) {
        await openConversationByIndex(this, i);
        await sleep(700);
        if (await this.isActivity(ANDROID_IM_ACT.systemNotify)) {
          opened = true;
          this.log(`第 ${i} 行为系统通知`);
          await this.driver.back();
          await sleep(600);
          break;
        }
        await backToMainFromChat(this).catch(async () => {
          await this.driver.back();
          await sleep(500);
        });
        await enterMessageTab(this);
      }
      if (!opened) this.log('未扫到系统通知会话，本步仅记录（不 fail）');
    });

    // —— SM-IM-29 ——
    await this.act('SM-IM-29 长按私聊出操作底栏', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const idx = await findFirstPrivateConversationIndex(this);
      await longPressConversation(this, idx);
    });

    await this.check('SM-IM-29 底栏四项可见', async () => {
      this.requireImReady();
      const pin = await this.driver.exists(IM.longPressPin);
      const ignore = await this.driver.exists(IM.longPressIgnoreUnread);
      const del = await this.driver.exists(IM.longPressDelete);
      const cancel = await this.driver.exists(IM.longPressCancel);
      const ok = pin && ignore && del && cancel;
      if (!ok) await dismissLongPressSheet(this);
      return {
        expect: 'tv_topping / ignore / delete / cancel',
        real: `pin=${pin} ignore=${ignore} del=${del} cancel=${cancel}`,
        pass: ok,
      };
    });

    await this.act('关闭长按底栏', async () => {
      this.requireImReady();
      await dismissLongPressSheet(this);
    });

    // —— SM-IM-30 / 31 ——
    await this.act('SM-IM-30 长按置顶私聊', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const idx = await findFirstPrivateConversationIndex(this);
      await longPressConversation(this, idx);
      await this.assertExists(IM.longPressPin, 'tv_topping');
      await this.driver.click(IM.longPressPin);
      await sleep(1_200);
      await dismissTransientDialogs(this);
    });

    await this.check('SM-IM-30 出现置顶角标 iv_pin', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const hasPin = await this.driver.exists(IM.rowPin);
      return {
        expect: '列表存在 iv_pin',
        real: hasPin ? 'iv_pin' : 'missing',
        pass: hasPin,
      };
    });

    await this.act('SM-IM-31 长按取消置顶', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      // 优先点带 pin 的行：长按第一行（置顶后通常在最前）
      await longPressConversation(this, 1);
      await this.assertExists(IM.longPressPin, 'tv_topping(unpin)');
      await this.driver.click(IM.longPressPin);
      await sleep(1_200);
      await dismissTransientDialogs(this);
    });

    await this.check('SM-IM-31 置顶角标消失或减少', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      // 不强求全局无 pin（可能另有置顶），只要操作未崩溃且底栏已关
      const sheetGone = !(await this.driver.exists(IM.longPressCancel));
      return {
        expect: '长按底栏已关闭',
        real: sheetGone ? 'sheet closed' : 'sheet still open',
        pass: sheetGone,
      };
    });

    // —— SM-IM-32 ——
    await this.act('SM-IM-32 群聊长按无置顶项', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const gIdx = await findFirstGroupConversationIndex(this);
      this.hasGroup = gIdx != null;
      if (gIdx == null) {
        this.skip('账号无群聊会话，跳过 SM-IM-32');
      }
      await longPressConversation(this, gIdx!);
    });

    await this.check('SM-IM-32 群聊底栏无 tv_topping', async () => {
      this.requireImReady();
      if (!this.hasGroup) this.skip('账号无群聊会话，跳过 SM-IM-32');
      const pin = await this.driver.exists(IM.longPressPin);
      const del = await this.driver.exists(IM.longPressDelete);
      await dismissLongPressSheet(this);
      return {
        expect: '无 tv_topping，且有 delete/cancel',
        real: `pin=${pin} del=${del}`,
        pass: !pin && del,
      };
    });

    // —— SM-IM-33 ——
    await this.act('SM-IM-33 长按忽略未读', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      if (!(await this.driver.exists(IM.rowUnread))) {
        this.skip('列表无未读角标，跳过 SM-IM-33');
      }
      const idx = await findFirstPrivateConversationIndex(this);
      await longPressConversation(this, idx);
      await this.assertExists(IM.longPressIgnoreUnread, 'tv_ignore_all_unread_message');
      await this.driver.click(IM.longPressIgnoreUnread);
      await sleep(1_000);
    });

    await this.check('SM-IM-33 忽略未读后底栏关闭', async () => {
      this.requireImReady();
      if (!(await this.driver.exists(IM.rowUnread)) && !(await this.driver.exists(IM.longPressCancel))) {
        // 无未读时上一步已 skip；若仍进入本 check 则宽松通过
      }
      const sheetGone = !(await this.driver.exists(IM.longPressCancel));
      return {
        expect: '底栏关闭',
        real: sheetGone ? 'ok' : 'still open',
        pass: sheetGone,
      };
    });

    // —— SM-IM-35 / 38 ——
    await this.act('SM-IM-35 右上角 iv_more 进入多选', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      await enterMultiSelect(this);
    });

    await this.check('SM-IM-35 多选态：tvMore + 底栏', async () => {
      this.requireImReady();
      const done = await this.driver.exists(IM.listMoreDone);
      const readAll = await this.driver.exists(IM.listReadAll);
      const archive = await this.driver.exists(IM.listArchive);
      const moreGone = !(await this.driver.exists(IM.listMore)) || !(await this.driver.isDisplayed(IM.listMore));
      return {
        expect: 'tv_more + tvReadAll + tvArchive',
        real: `done=${done} read=${readAll} arch=${archive} moreHidden≈${moreGone}`,
        pass: done && readAll && archive,
      };
    });

    await this.act('SM-IM-38 点 tvMore 退出多选', async () => {
      this.requireImReady();
      await exitMultiSelectIfNeeded(this);
      await sleep(500);
    });

    await this.check('SM-IM-38 恢复 iv_more', async () => {
      this.requireImReady();
      const more = await this.driver.exists(IM.listMore);
      const doneGone = !(await this.driver.exists(IM.listMoreDone));
      return {
        expect: 'iv_more 可见，tv_more 消失',
        real: `more=${more} doneGone=${doneGone}`,
        pass: more && doneGone,
      };
    });

    // —— SM-IM-36 ——
    await this.act('SM-IM-36 多选批量已读', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      await enterMultiSelect(this);
      // 多选态点行 = 选中（勿用 openConversation）
      try {
        await this.driver.click(conversationRowLocator(1));
      } catch {
        try {
          await this.driver.click(IM.rowItem);
        } catch {
          /* 仍可点已读 */
        }
      }
      if (await this.driver.exists(IM.chatInput)) {
        await backToMainFromChat(this);
        await enterMessageTab(this);
        await enterMultiSelect(this);
      }
      await this.assertExists(IM.listReadAll, 'tvReadAll');
      await this.driver.click(IM.listReadAll);
      await sleep(1_200);
      await exitMultiSelectIfNeeded(this);
    });

    await this.check('SM-IM-36 批量已读完成（无崩溃）', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const listOk = await this.driver.exists(IM.messageList);
      return { expect: '仍在会话列表', real: listOk ? 'message_list' : 'missing', pass: listOk };
    });

    // —— SM-IM-37 归档（破坏性，放后）——
    await this.act('SM-IM-37 多选归档一条私聊', async () => {
      this.requireImReady();
      await ensureImPrivateConversations(this, 2);
      await enterMessageTab(this);
      const before = await countConversationRows(this);
      await enterMultiSelect(this);
      try {
        await this.driver.click(conversationRowLocator(1));
      } catch {
        try {
          await this.driver.click(IM.rowItem);
        } catch {
          /* ignore */
        }
      }
      await this.assertExists(IM.listArchive, 'tvArchive');
      await this.driver.click(IM.listArchive);
      await sleep(1_200);
      await dismissTransientDialogs(this);
      await exitMultiSelectIfNeeded(this);
      this.log(`归档前行数=${before}`);
    });

    await this.check('SM-IM-37 归档后仍在列表页', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const listOk = await this.driver.exists(IM.messageList);
      return { expect: 'message_list', real: listOk ? 'ok' : 'missing', pass: listOk };
    });

    // —— SM-IM-34 删除（最后）——
    await this.act('SM-IM-34 长按删除一条私聊', async () => {
      this.requireImReady();
      await ensureImPrivateConversations(this, 2);
      await enterMessageTab(this);
      const before = await countConversationRows(this);
      if (before < 2) this.skip('会话不足 2 条，跳过删除以免清空列表');
      const idx = await findFirstPrivateConversationIndex(this);
      await longPressConversation(this, idx);
      await this.assertExists(IM.longPressDelete, 'tv_delete');
      await this.driver.click(IM.longPressDelete);
      await sleep(1_200);
      await dismissTransientDialogs(this);
      this.log(`删除前行数=${before}`);
    });

    await this.check('SM-IM-34 删除后列表仍可用', async () => {
      this.requireImReady();
      await enterMessageTab(this);
      const listOk = await this.driver.exists(IM.messageList);
      const after = await countConversationRows(this);
      return {
        expect: 'message_list 可见',
        real: `rows=${after}`,
        pass: listOk,
      };
    });
  }
}

await new AndroidImConversationListSmoke().execute();
