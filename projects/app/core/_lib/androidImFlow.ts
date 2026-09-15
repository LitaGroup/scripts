/**
 * Android Lite IM 共用流程：进消息 Tab、会话造数、发文本、长按菜单、多选归档。
 * 用例见 projects/app/android-lite/IM_SMOKE.md
 */
import type { AppBaseClass } from '../../../../src/base/AppBaseClass.ts';
import { by, sleep } from '../../../../src/resources/AppiumResource.ts';
import { sourceHasAndroidStringKeys } from './androidAppStrings.ts';
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
  await app['driver'].click(IM.chatInput);
  await sleep(300);
  await app['driver'].input(IM.chatInput, text);
  await sleep(500);
  // send_button 默认 gone，输入后才显示；等一下并必要时重试聚焦输入
  if (!(await app['driver'].waitFor(IM.chatSend, 5_000))) {
    await app['driver'].click(IM.chatInput);
    await sleep(200);
    try {
      await app['driver'].execute('mobile: type', [{ text }]);
    } catch {
      await app['driver'].input(IM.chatInput, text);
    }
    await sleep(500);
  }
  await app['driver'].hideKeyboard().catch(() => undefined);
  await sleep(300);
  await app['assertExists'](IM.chatSend, '发送按钮 send_button');
  await app['driver'].click(IM.chatSend);
  await sleep(1_000);
  const ok = await app['driver'].waitFor(chatBubbleContains(text), 20_000);
  if (!ok) throw new Error(`发送后未在消息列表回显: ${text}`);
}

async function countEmojiBubbles(app: AppBaseClass): Promise<number> {
  const a = await app['driver'].findElements(IM.emojiBubbleLottie);
  const b = await app['driver'].findElements(IM.emojiBubbleBorder);
  return Math.max(a.length, b.length);
}

async function countGiftBubbles(app: AppBaseClass): Promise<number> {
  const normal = (await app['driver'].findElements(IM.giftBubbleItem)).length;
  const box = (await app['driver'].findElements(IM.giftBoxBubbleItem)).length;
  return normal + box;
}

/** 关闭表情面板（若开着） */
export async function hideChatEmojiPanel(app: AppBaseClass): Promise<void> {
  if (!(await app['driver'].exists(IM.emojiPanel))) return;
  if (await app['driver'].isDisplayed(IM.emojiPanel).catch(() => false)) {
    if (await app['driver'].exists(IM.chatEmoji)) {
      await app['driver'].click(IM.chatEmoji);
      await sleep(500);
    } else {
      await app['driver'].back();
      await sleep(400);
    }
  }
}

/**
 * 私聊/群聊：打开表情面板并点选一个可用表情发送（不强制气泡数量增加）。
 * 对照：iv_keyboard_emoji → emoji_all_view/rv_emojis/iv_pic
 */
export async function sendChatEmoji(app: AppBaseClass): Promise<void> {
  await hideChatEmojiPanel(app);
  await app['waitForElement'](IM.chatEmoji, '表情按钮 iv_keyboard_emoji', 10_000);
  if (!(await app['driver'].isDisplayed(IM.chatEmoji).catch(() => false))) {
    throw new Error('表情按钮 iv_keyboard_emoji 存在但不可见');
  }
  await app['driver'].click(IM.chatEmoji);
  await sleep(1_000);
  if (!(await app['driver'].waitFor(IM.emojiPanel, 10_000))) {
    throw new Error('点击表情按钮后未出现 emoji_all_view');
  }
  const deadlineLoad = Date.now() + 10_000;
  while (Date.now() < deadlineLoad && (await app['driver'].findElements(IM.emojiItem)).length === 0) {
    await sleep(400);
  }
  const items = await app['driver'].findElements(IM.emojiItem);
  if (items.length === 0) throw new Error('表情面板无 iv_pic 可点');

  // 依次尝试前几个，跳过锁定/解锁弹窗；点到未弹解锁的即视为已发送
  let sent = false;
  for (let i = 1; i <= Math.min(items.length, 6); i++) {
    const loc = by.xpath(`(//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/iv_pic'])[${i}]`);
    try {
      await app['driver'].click(loc);
    } catch {
      await sleep(500);
      try {
        await app['driver'].click(loc);
      } catch {
        continue;
      }
    }
    await sleep(1_200);
    const unlock =
      (await app['driver'].exists(by.id(`${ANDROID_LITE_PACKAGE}:id/tv_unlock_emoji`))) ||
      ((await app['driver'].exists(by.id(`${ANDROID_LITE_PACKAGE}:id/img_close`))) &&
        (await app['driver'].exists(by.id(`${ANDROID_LITE_PACKAGE}:id/emojiAnimationView`))));
    if (unlock) {
      if (await app['driver'].exists(by.id(`${ANDROID_LITE_PACKAGE}:id/img_close`))) {
        await app['driver'].click(by.id(`${ANDROID_LITE_PACKAGE}:id/img_close`));
      } else {
        await app['driver'].back();
      }
      await sleep(500);
      continue;
    }
    sent = true;
    break;
  }
  await hideChatEmojiPanel(app);
  if (!sent) {
    throw new Error('未能点选可用表情（均为锁定或点击失败）');
  }
  const bubbles = await countEmojiBubbles(app);
  app['log'](`表情已点选发送（不强制气泡增量），当前气泡数=${bubbles}`);
}

/** 余额不足 / 引导充值（按 strings.xml key 解析当前语言文案，不写死多语言） */
async function sourceHasTopUp(app: AppBaseClass): Promise<boolean> {
  return sourceHasAndroidStringKeys(app, [
    'not_enough_coin_send_gift_toast',
    'not_enough_coin_message',
    'insufficient_balance',
    'top_up_options_label',
    'top_up_block_pop_up_title',
  ]);
}

async function giftSentEvidence(app: AppBaseClass, before: number): Promise<boolean> {
  // 仅「可见」连击条；hierarchy 里 GONE 的 giftComboView 不能算成功
  try {
    if (await app['driver'].isDisplayed(IM.giftComboView)) return true;
  } catch {
    /* ignore */
  }
  return (await countGiftBubbles(app)) > before;
}

async function ensureGiftPanelOpen(app: AppBaseClass): Promise<void> {
  if (await app['driver'].exists(IM.giftPanelRoot)) {
    if (await app['driver'].isDisplayed(IM.giftPanelRoot).catch(() => true)) return;
  }
  await app['waitForElement'](IM.chatGift, '礼物按钮 iv_gift', 10_000);
  await app['driver'].click(IM.chatGift);
  await sleep(1_000);
  if (!(await app['driver'].waitFor(IM.giftPanelRoot, 12_000))) {
    throw new Error('点击 iv_gift 后未出现 sendGiftRootLayout');
  }
}

/** 货架接口已返回：出现可见礼物 icon/price（默认首个已选中） */
async function waitGiftShelfLoaded(app: AppBaseClass, timeoutMs = 20_000): Promise<void> {
  const visibleIcon = by.xpath(
    `//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/itemGiftIconIv' and @displayed='true']`,
  );
  const visiblePrice = by.xpath(
    `//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/itemGiftPriceTv' and @displayed='true']`,
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await app['driver'].exists(visibleIcon)) return;
    if (await app['driver'].exists(visiblePrice)) return;
    await sleep(400);
  }
  throw new Error('礼物面板加载超时：无可见 itemGiftIconIv / itemGiftPriceTv');
}

/**
 * BaseGiftDialog.onClickSendGift：walletAmount == null 或 selectedGift == null 时点 Send 无效果。
 * 等余额文案出现，并点一下可见货架首个礼物，保证选中态。
 */
async function ensureDefaultGiftReadyToSend(app: AppBaseClass): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await app['driver'].exists(IM.giftSendPrice)) {
      try {
        const t = (await app['driver'].textOf(IM.giftSendPrice)).trim();
        if (t.length > 0) break;
      } catch {
        /* ignore */
      }
    }
    await sleep(300);
  }
  if (!(await app['driver'].exists(IM.giftSendPrice))) {
    app['log']('未等到 sendGiftPriceTv（钱包可能未返回），仍尝试发送');
  } else {
    app['log'](`钱包余额文案: ${(await app['driver'].textOf(IM.giftSendPrice).catch(() => '')) || '(空)'}`);
  }

  const firstGift = by.xpath(
    `(//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/itemGiftLayout' and @displayed='true'])[1]`,
  );
  if (await app['driver'].exists(firstGift)) {
    app['log']('点击货架首个礼物，确保默认选中');
    await app['driver'].click(firstGift);
    await sleep(500);
  }
}

async function pickGroupGiftRecipientIfNeeded(app: AppBaseClass): Promise<void> {
  if (!(await app['driver'].exists(IM.giftSelectPeople))) return;
  await app['driver'].click(IM.giftSelectPeople);
  await sleep(1_500);
  if (await app['isActivity'](ANDROID_IM_ACT.groupMember) || (await app['driver'].exists(IM.groupMemberList))) {
    const nameLoc = by.xpath(
      `(//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/rl_all_user_list_view']//*[@clickable='true'])[1]`,
    );
    if (await app['driver'].exists(nameLoc)) {
      await app['driver'].click(nameLoc);
      await sleep(600);
    } else {
      const anyUser = by.xpath(
        `(//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/user_name' or @resource-id='${ANDROID_LITE_PACKAGE}:id/userNameTv'])[1]`,
      );
      if (await app['driver'].exists(anyUser)) {
        await app['driver'].click(anyUser);
        await sleep(600);
      }
    }
    if (await app['driver'].exists(IM.groupMemberDone)) {
      await app['driver'].click(IM.groupMemberDone);
      await sleep(1_200);
    } else {
      throw new Error('选人页无 tv_done');
    }
  }
}

async function closeGiftPanelIfOpen(app: AppBaseClass): Promise<void> {
  if (!(await app['driver'].exists(IM.giftPanelRoot))) return;
  await app['driver'].back().catch(() => undefined);
  await sleep(400);
  if (await app['driver'].exists(IM.giftPanelRoot)) {
    await app['driver'].back().catch(() => undefined);
  }
}

/**
 * 打开礼物面板 → 等货架加载（接口成功）→ 对默认选中礼物点 Send，连送 times 次（默认 3）。
 * 不切换 Tab、不排序、不切换礼物。
 */
export async function sendChatDefaultGift(
  app: AppBaseClass,
  opts: { times?: number; groupPickRecipient?: boolean; intervalMs?: number } = {},
): Promise<{ sent: number; status: 'ok' | 'topup' | 'empty' }> {
  const times = Math.max(1, opts.times ?? 3);
  const intervalMs = opts.intervalMs ?? 2_000;
  await hideChatEmojiPanel(app);
  // 先关面板数清基线，避免历史 ll_box_gift_item 误判成功
  await closeGiftPanelIfOpen(app);
  const baselineBubbles = await countGiftBubbles(app);
  app['log'](`送礼前气泡基线 normal+box=${baselineBubbles}`);

  await ensureGiftPanelOpen(app);
  await waitGiftShelfLoaded(app);

  if (opts.groupPickRecipient) {
    await pickGroupGiftRecipientIfNeeded(app);
    await ensureGiftPanelOpen(app);
    await waitGiftShelfLoaded(app);
  }

  await ensureDefaultGiftReadyToSend(app);

  if (!(await app['driver'].exists(IM.giftSendSubmit))) {
    app['log']('货架已加载但无 sendGiftSubmitTv');
    await closeGiftPanelIfOpen(app);
    return { sent: 0, status: 'empty' };
  }

  app['log'](`默认选中礼物连送 ${times} 次（间隔 ${intervalMs}ms）`);
  let sent = 0;
  for (let i = 0; i < times; i++) {
    await ensureGiftPanelOpen(app);
    if (!(await app['driver'].exists(IM.giftSendSubmit))) {
      app['log'](`第 ${i + 1} 次发送：Send 按钮不可见，停止`);
      break;
    }

    let comboBefore = false;
    try {
      comboBefore = await app['driver'].isDisplayed(IM.giftComboView);
    } catch {
      comboBefore = false;
    }
    const before = await countGiftBubbles(app);
    app['log'](`发送默认礼物 [${i + 1}/${times}]`);
    await app['driver'].click(IM.giftSendSubmit);
    await sleep(1_200);

    if (await sourceHasTopUp(app)) {
      app['log']('送礼触发 Top Up / 充值，判定余额不足');
      await closeGiftPanelIfOpen(app);
      return { sent, status: 'topup' };
    }
    await app['refreshActivity']();
    if (/TopUp|Recharge|Wallet|充值/i.test(app['activity'] ?? '')) {
      app['log'](`跳转充值页 ${app['activity']}，判定余额不足`);
      await app['driver'].back().catch(() => undefined);
      await sleep(800);
      return { sent, status: 'topup' };
    }

    let ok = false;
    const end = Date.now() + 8_000;
    while (Date.now() < end) {
      if (await giftSentEvidence(app, before)) {
        ok = true;
        break;
      }
      // 连击：首击后 combo 已显示，再点 Send 仍算一次
      try {
        if (comboBefore && (await app['driver'].isDisplayed(IM.giftComboView))) {
          ok = true;
          break;
        }
      } catch {
        /* ignore */
      }
      if (await sourceHasTopUp(app)) {
        app['log']('送礼过程出现充值文案，判定余额不足');
        await closeGiftPanelIfOpen(app);
        return { sent, status: 'topup' };
      }
      await sleep(400);
    }

    if (ok) {
      sent += 1;
      app['log'](`默认礼物已发送 ${sent}/${times}`);
    } else {
      app['log'](`第 ${i + 1} 次面板内未确认到回显（稍后关面板按增量核对）`);
    }

    if (i < times - 1) await sleep(intervalMs);
  }

  await closeGiftPanelIfOpen(app);
  await sleep(800);
  const afterBubbles = await countGiftBubbles(app);
  const gained = Math.max(0, afterBubbles - baselineBubbles);
  app['log'](`关面板后气泡 ${baselineBubbles} → ${afterBubbles}（+${gained}），面板内计次=${sent}`);
  if (gained > 0) {
    // 以列表增量为准；面板内连击可能多次对应 1 条气泡，取 max(面板计次, 增量) 且不超过 times
    const finalSent = Math.min(times, Math.max(sent, gained));
    return { sent: finalSent, status: 'ok' };
  }
  if (sent > 0) {
    // 仅有连击回显、列表暂未刷出时仍记成功
    return { sent, status: 'ok' };
  }
  return { sent: 0, status: 'empty' };
}

/** @deprecated 使用 sendChatDefaultGift；保留别名兼容旧调用 */
export async function sendChatGiftsByCheapest(
  app: AppBaseClass,
  opts: { maxCount?: number; groupPickRecipient?: boolean; intervalMs?: number } = {},
): Promise<{ sent: number; status: 'ok' | 'topup' | 'empty' }> {
  return sendChatDefaultGift(app, {
    times: opts.maxCount ?? 3,
    groupPickRecipient: opts.groupPickRecipient,
    intervalMs: opts.intervalMs,
  });
}

/**
 * 打开礼物面板，对默认选中礼物点 Send 一次。
 * @returns 'sent' 出现礼物气泡；'topup' 余额不足弹充值（调用方可 skip）
 */
export async function sendChatGift(
  app: AppBaseClass,
  opts: { groupPickRecipient?: boolean } = {},
): Promise<'sent' | 'topup'> {
  const r = await sendChatDefaultGift(app, { times: 1, groupPickRecipient: opts.groupPickRecipient });
  if (r.sent >= 1) return 'sent';
  return 'topup';
}

/**
 * 群聊 @：输入 @ → 选成员 → 补一段文本发送并回显。
 */
export async function sendGroupAtMention(app: AppBaseClass, suffix?: string): Promise<string> {
  await hideChatEmojiPanel(app);
  await app['waitForElement'](IM.chatInput, 'input_message', 10_000);
  await app['driver'].click(IM.chatInput);
  await sleep(300);
  // 输入 @ 触发选人
  await app['driver'].input(IM.chatInput, '@');
  await sleep(1_200);
  const hasSelector =
    (await app['driver'].waitFor(IM.atUserName, 8_000)) ||
    (await app['driver'].exists(IM.atSelectorList));
  if (!hasSelector) {
    throw new Error('输入 @ 后未出现选人面板（userNameTv / recyclerView）');
  }
  // 优先点 Everyone / 所有人，否则第一个成员
  const everyone = [
    by.text('Everyone'),
    by.text('所有人'),
    by.textContains('Everyone'),
    by.textContains('所有人'),
  ];
  let picked = false;
  for (const loc of everyone) {
    if (await app['driver'].exists(loc)) {
      await app['driver'].click(loc);
      picked = true;
      break;
    }
  }
  if (!picked) {
    const first = by.xpath(`(//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/userNameTv'])[1]`);
    await app['assertExists'](first, '第一个 @ 成员');
    await app['driver'].click(first);
  }
  await sleep(800);
  const tag = suffix ?? uniqueImText('im-at');
  // mention 插入后追加可识别后缀（input() 会清空，改用 mobile:type / adb）
  if (await app['driver'].exists(IM.chatInput)) {
    await app['driver'].click(IM.chatInput);
    await sleep(200);
    const suffixText = ` ${tag}`;
    try {
      await app['driver'].execute('mobile: type', [{ text: suffixText }]);
    } catch {
      try {
        await app['driver'].execute('mobile: shell', [
          { command: 'input', args: ['text', suffixText.replace(/ /g, '%s')] },
        ]);
      } catch {
        // 仍可只发 mention；校验时用 tag 可能失败，再兜底发完整文本
        app['log']('追加 @ 后缀失败，改为整段文本发送');
        await app['driver'].input(IM.chatInput, `@Everyone ${tag}`);
      }
    }
  }
  await app['driver'].hideKeyboard().catch(() => undefined);
  await sleep(400);
  if (!(await app['driver'].exists(IM.chatSend))) {
    // 再点一次输入触发 send 显示
    await app['driver'].click(IM.chatInput);
    await sleep(300);
  }
  await app['assertExists'](IM.chatSend, 'send_button');
  await app['driver'].click(IM.chatSend);
  await sleep(1_000);
  const ok = await app['driver'].waitFor(chatBubbleContains(tag), 20_000);
  if (!ok) throw new Error(`@ 消息发送后未回显: ${tag}`);
  app['log'](`群聊 @ 消息已发送: ${tag}`);
  return tag;
}

export async function backToMainFromChat(app: AppBaseClass): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await app['closePopups']();
    await app['refreshActivity']();
    const act = app['activity'] ?? '';
    if (/\.MainActivity$/i.test(act)) return;
    // 多按返回会退到桌面，拉回 App 再进主页
    if (/NexusLauncher|launcher/i.test(act) || !act) {
      app['log'](`backToMain：当前在桌面/未知(${act || '空'}) → activateApp`);
      await app['activateApp']();
      await sleep(1_200);
      await app['closePopups']();
      if (await app['isActivity'](ANDROID_IM_ACT.main)) return;
      continue;
    }
    if (await app['driver'].exists(IM.chatBack)) {
      await app['driver'].click(IM.chatBack);
      await sleep(700);
      continue;
    }
    await app['driver'].back();
    await sleep(700);
  }
  await app['refreshActivity']();
  if (/\.MainActivity$/i.test(app['activity'] ?? '')) return;
  if (/NexusLauncher|launcher/i.test(app['activity'] ?? '')) {
    await app['activateApp']();
    await sleep(1_500);
    await app['closePopups']();
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
