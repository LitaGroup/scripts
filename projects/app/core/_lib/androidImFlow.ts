/**
 * Android Lite IM 共用流程：进消息 Tab、会话造数、发文本、长按菜单、多选归档。
 * 用例见 projects/app/android-lite/IM_SMOKE.md
 */
import type { AppBaseClass } from '../../../../src/base/AppBaseClass.ts';
import { by, sleep } from '../../../../src/resources/AppiumResource.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOGIN_LOC } from './androidLocators.ts';
import {
  ANDROID_IM_ACT,
  ANDROID_IM_LOC as IM,
  chatBubbleContains,
  conversationContentLocator,
  conversationNameLocator,
  conversationRowLocator,
  recommendAvatarLocator,
} from './androidImLocators.ts';

export function imSeedCount(app: AppBaseClass): number {
  const fromEnv = Number(process.env.SCRIPT_IM_SEED_COUNT ?? '');
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  const im = (app['scriptConfig'].im ?? {}) as { seedCount?: number };
  const n = Number(im.seedCount ?? 3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

export async function enterMessageTab(app: AppBaseClass, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await app['closePopups']();
    if (await app['driver'].exists(IM.messageList) || (await app['driver'].exists(IM.chatListRoot))) {
      return;
    }
    if (await app['driver'].exists(IM.tabMessage)) {
      await app['driver'].click(IM.tabMessage);
    }
    await sleep(800);
  }
  throw new Error('进入消息 Tab / 会话列表超时');
}

export async function enterHomeTab(app: AppBaseClass, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await app['closePopups']();
    if (await app['driver'].exists(IM.gameTitle) || (await app['driver'].exists(IM.recommendPlayers))) {
      if (await app['driver'].exists(IM.gameTitle)) {
        try {
          await app['driver'].click(IM.gameTitle);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (await app['driver'].exists(IM.tabHome)) {
      await app['driver'].click(IM.tabHome);
    }
    await sleep(800);
  }
  throw new Error('进入首页超时');
}

/** 会话列表可见行数（按 user_name 计数） */
export async function countConversationRows(app: AppBaseClass): Promise<number> {
  if (!(await app['driver'].exists(IM.messageList))) return 0;
  const rows = await app['driver'].findElements(IM.rowUserName);
  return rows.length;
}

export async function dismissLongPressSheet(app: AppBaseClass): Promise<void> {
  if (await app['driver'].exists(IM.longPressCancel)) {
    await app['driver'].click(IM.longPressCancel);
    await sleep(400);
  }
}

export async function dismissTransientDialogs(app: AppBaseClass): Promise<void> {
  for (const loc of IM.aboutArchiveCloseCandidates) {
    if (await app['driver'].exists(loc)) {
      try {
        await app['driver'].click(loc);
        await sleep(400);
      } catch {
        /* ignore */
      }
    }
  }
  await app['closePopups']();
}

/** 退出多选态（若在） */
export async function exitMultiSelectIfNeeded(app: AppBaseClass): Promise<void> {
  if (await app['driver'].exists(IM.listMoreDone) && (await app['driver'].isDisplayed(IM.listMoreDone))) {
    await app['driver'].click(IM.listMoreDone);
    await sleep(500);
  }
}

export async function enterMultiSelect(app: AppBaseClass): Promise<void> {
  await exitMultiSelectIfNeeded(app);
  await app['assertExists'](IM.listMore, '会话列表右上角 iv_more');
  await app['driver'].click(IM.listMore);
  await sleep(600);
  if (!(await app['driver'].exists(IM.listMoreDone))) {
    throw new Error('点击 iv_more 后未进入多选（tv_more 未出现）');
  }
}

/** 长按第 index 行（1-based），打开 DeleteChatListDialog */
export async function longPressConversation(app: AppBaseClass, index = 1): Promise<void> {
  await exitMultiSelectIfNeeded(app);
  const row = conversationRowLocator(index);
  await app['assertExists'](row, `会话列表第 ${index} 行`);
  await app['driver'].longClick(row, 1_200);
  await sleep(600);
}

export async function openConversationByIndex(app: AppBaseClass, index = 1): Promise<void> {
  await exitMultiSelectIfNeeded(app);
  const row = conversationRowLocator(index);
  await app['assertExists'](row, `会话列表第 ${index} 行`);
  await app['driver'].click(row);
  await app['waitForActivity'](/ChatActivity|SystemNotificationActivity/, 15_000);
}

export async function sendChatText(app: AppBaseClass, text: string): Promise<void> {
  await app['waitForElement'](IM.chatInput, '聊天输入框 input_message', 12_000);
  await app['driver'].input(IM.chatInput, text);
  await app['driver'].hideKeyboard();
  await app['assertExists'](IM.chatSend, '发送按钮 send_button');
  await app['driver'].click(IM.chatSend);
  await sleep(1_000);
  const ok = await app['driver'].waitFor(chatBubbleContains(text), 20_000);
  if (!ok) throw new Error(`发送后未在消息列表回显: ${text}`);
}

export async function backToMainFromChat(app: AppBaseClass): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await app['closePopups']();
    if (await app['isActivity'](ANDROID_IM_ACT.main)) return;
    if (await app['driver'].exists(IM.chatBack)) {
      await app['driver'].click(IM.chatBack);
      await sleep(700);
      continue;
    }
    await app['driver'].back();
    await sleep(700);
  }
  if (!(await app['isActivity'](ANDROID_IM_ACT.main))) {
    throw new Error(`未能从聊天页返回 MainActivity，当前=${app['activity']}`);
  }
}

/**
 * 确保至少有 seedCount 条会话：不足则从首页推荐陪玩师建私聊。
 * @returns 最终会话行数；若无法造数则抛错（由调用方 skip）
 */
export async function ensureImPrivateConversations(app: AppBaseClass, seedCount?: number): Promise<number> {
  const need = seedCount ?? imSeedCount(app);
  await enterMessageTab(app);
  let count = await countConversationRows(app);
  app['log'](`当前会话列表行数=${count}，目标≥${need}`);
  if (count >= need) return count;

  const tried = new Set<number>();
  let avatarIndex = 1;
  let created = 0;
  const maxAttempts = need * 4;

  while (count < need && created < maxAttempts) {
    await enterHomeTab(app);
    await sleep(800);
    // 尝试滚动露出推荐列表
    for (let s = 0; s < 3 && !(await app['driver'].exists(IM.recommendPlayers)); s++) {
      await app['driver'].swipeUp(0.5);
      await sleep(500);
    }
    if (!(await app['driver'].exists(IM.recommendPlayers))) {
      throw new Error('首页未找到智能推荐列表 recommendPlayers，无法造数');
    }

    // 找下一个可用头像
    let opened = false;
    for (let guard = 0; guard < 8 && !opened; guard++) {
      while (tried.has(avatarIndex) && avatarIndex < 30) avatarIndex += 1;
      const avatar = recommendAvatarLocator(avatarIndex);
      if (!(await app['driver'].exists(avatar))) {
        await app['driver'].swipeUp(0.45);
        await sleep(600);
        avatarIndex += 1;
        continue;
      }
      tried.add(avatarIndex);
      app['log'](`造数：打开推荐陪玩师 #${avatarIndex}`);
      await app['driver'].click(avatar);
      await sleep(1_200);
      await app['closePopups']();

      // 可能已在详情或需再点
      const onDetail =
        (await app['isActivity'](ANDROID_IM_ACT.userDetail)) ||
        (await app['driver'].exists(IM.chatButton)) ||
        (await app['driver'].exists(IM.playerUserNo));
      if (!onDetail) {
        app['log'](`陪玩师 #${avatarIndex} 未进入详情，跳过`);
        avatarIndex += 1;
        await backToMainFromChat(app).catch(async () => {
          await app['driver'].back();
        });
        continue;
      }

      if (!(await app['driver'].waitFor(IM.chatButton, 8_000))) {
        app['log'](`陪玩师 #${avatarIndex} 无 chatButton，跳过`);
        await app['driver'].back();
        await sleep(600);
        avatarIndex += 1;
        continue;
      }
      await app['driver'].click(IM.chatButton);
      await sleep(1_200);
      await app['closePopups']();

      if (!(await app['driver'].waitFor(IM.chatInput, 12_000))) {
        app['log'](`陪玩师 #${avatarIndex} 未进入聊天输入页，跳过`);
        await backToMainFromChat(app).catch(async () => {
          await app['driver'].back();
          await sleep(400);
          await app['driver'].back();
        });
        avatarIndex += 1;
        continue;
      }

      const text = `im-seed-${Date.now()}-${created + 1}`;
      await sendChatText(app, text);
      created += 1;
      opened = true;
      app['log'](`造数成功 ${created}：${text}`);
      await backToMainFromChat(app);
      avatarIndex += 1;
    }

    if (!opened) {
      throw new Error(`无法从首页推荐列表继续造数（已尝试头像索引至 ${avatarIndex}）`);
    }

    await enterMessageTab(app);
    count = await countConversationRows(app);
    app['log'](`造数后会话行数=${count}`);
  }

  if (count < need) {
    throw new Error(`会话造数不足：需要≥${need}，实际=${count}`);
  }
  return count;
}

/** 在聊天页检测是否像群聊（有群 header） */
export async function isGroupChatUi(app: AppBaseClass): Promise<boolean> {
  return (
    (await app['driver'].exists(IM.groupHeader)) ||
    (await app['driver'].exists(IM.groupRankBtn)) ||
    (await app['driver'].exists(IM.groupGuide))
  );
}

/** 找第一条私聊行索引（打开后若是群则关闭再试） */
export async function findFirstPrivateConversationIndex(
  app: AppBaseClass,
  maxScan = 8,
): Promise<number> {
  const total = await countConversationRows(app);
  const limit = Math.min(total, maxScan);
  for (let i = 1; i <= limit; i++) {
    await openConversationByIndex(app, i);
    await sleep(800);
    if (await app['isActivity'](ANDROID_IM_ACT.systemNotify)) {
      await app['driver'].back();
      await sleep(600);
      continue;
    }
    if (await app['driver'].exists(IM.chatInput)) {
      if (!(await isGroupChatUi(app))) {
        await backToMainFromChat(app);
        await enterMessageTab(app);
        return i;
      }
    }
    await backToMainFromChat(app);
    await enterMessageTab(app);
  }
  throw new Error('未找到可用的私聊会话（可先跑 SM-IM-00 造数）');
}

export async function findFirstGroupConversationIndex(
  app: AppBaseClass,
  maxScan = 10,
): Promise<number | null> {
  const total = await countConversationRows(app);
  const limit = Math.min(total, maxScan);
  for (let i = 1; i <= limit; i++) {
    await openConversationByIndex(app, i);
    await sleep(800);
    if (await app['driver'].exists(IM.chatInput) && (await isGroupChatUi(app))) {
      await backToMainFromChat(app);
      await enterMessageTab(app);
      return i;
    }
    await backToMainFromChat(app);
    await enterMessageTab(app);
  }
  return null;
}

export function uniqueImText(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export { conversationNameLocator, conversationContentLocator, conversationRowLocator, ANDROID_LITE_PACKAGE, LOGIN_LOC, by };
