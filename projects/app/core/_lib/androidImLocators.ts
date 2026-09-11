/**
 * Android Lite IM（私聊/群聊/会话列表）定位符。
 * package: com.litalite.android
 */
import { by } from '../../../../src/resources/AppiumResource.ts';
import { ANDROID_LITE_PACKAGE } from './androidLocators.ts';

const id = (name: string) => by.id(`${ANDROID_LITE_PACKAGE}:id/${name}`);
const xid = (raw: string) => `${ANDROID_LITE_PACKAGE}:id/${raw}`;

export const ANDROID_IM_ACT = {
  main: '.MainActivity',
  chat: '.ui.chat.ChatActivity',
  userDetail: '.ui.user.UserDetailActivity',
  searchConversation: '.ui.search.SearchConversationActivity',
  systemNotify: '.ui.chat.SystemNotificationActivity',
  groupMember: '.ui.chat.GroupMemberActivity',
} as const;

export const ANDROID_IM_LOC = {
  tabHome: id('navigation_home'),
  tabMessage: id('navigation_message_center'),
  tabMe: id('navigation_user_center'),

  // 会话列表
  chatListRoot: id('fragment_message_center'),
  messageList: id('message_list'),
  listTitle: id('tv_title'),
  listSearch: id('img_search'),
  listMore: id('iv_more'),
  listMoreDone: id('tv_more'),
  listReadAll: id('tvReadAll'),
  listArchive: id('tvArchive'),
  imError: id('ll_im_error_view'),

  // 列表行
  rowUserName: id('user_name'),
  rowContent: id('message_content'),
  rowUnread: id('tv_unread_message_count'),
  rowPin: id('iv_pin'),
  rowSelect: id('ivSelect'),
  rowItem: id('clItem'),

  // 长按底栏 DeleteChatListDialog
  longPressPin: id('tv_topping'),
  longPressIgnoreUnread: id('tv_ignore_all_unread_message'),
  longPressDelete: id('tv_delete'),
  longPressCancel: id('tv_cancel'),
  longPressRecover: id('tv_undelete'),

  // 聊天页
  chatInput: id('input_message'),
  chatSend: id('send_button'),
  chatBack: id('toolbar_back_button'),
  chatTitle: id('toolbar_player_name'),
  chatMore: id('ivMore'),
  chatFollow: id('chatFollowTv'),
  chatEmoji: id('iv_keyboard_emoji'),
  chatGift: id('iv_gift'),
  chatAdd: id('iv_chat_add'),
  chatPicture: id('img_bottom_picture'),
  chatVoiceCall: id('voice_call'),
  chatVideoCall: id('img_bottom_video_call'),
  groupHeader: id('headerView'),
  groupRankBtn: id('btn_ranking'),
  groupGuide: id('tv_group_guide'),
  aboutArchiveCloseCandidates: [
    id('tv_cancel'),
    by.text('OK'),
    by.text('Got it'),
    by.text('知道了'),
    by.textContains('OK'),
  ],

  // 造数：首页推荐 + 主页私聊
  gameTitle: id('tv_game_title'),
  recommendPlayers: id('recommendPlayers'),
  chatButton: id('chatButton'),
  playerUserNo: id('tv_user_no'),
  userDetailProfile: id('userDetailProfileView'),
};

/** 推荐列表内可点击头像（兼容新旧卡片） */
export function recommendAvatarLocator(index = 1): ReturnType<typeof by.xpath> {
  return by.xpath(
    `(//*[@resource-id='${xid('recommendPlayers')}']//*[@resource-id='${xid('img_avatar')}' or @resource-id='${xid('player_profile_pic')}'])[${index}]`,
  );
}

/** 会话列表第 n 行（1-based）整行可点击区域 */
export function conversationRowLocator(index = 1): ReturnType<typeof by.xpath> {
  return by.xpath(
    `(//*[@resource-id='${xid('message_list')}']//*[@resource-id='${xid('user_name')}']/ancestor::*[@clickable='true'][1])[${index}]`,
  );
}

/** 会话列表第 n 行的 user_name */
export function conversationNameLocator(index = 1): ReturnType<typeof by.xpath> {
  return by.xpath(`(//*[@resource-id='${xid('message_list')}']//*[@resource-id='${xid('user_name')}'])[${index}]`);
}

/** 会话列表第 n 行的 message_content */
export function conversationContentLocator(index = 1): ReturnType<typeof by.xpath> {
  return by.xpath(
    `(//*[@resource-id='${xid('message_list')}']//*[@resource-id='${xid('message_content')}'])[${index}]`,
  );
}

/** 聊天消息列表中包含指定文本的气泡 */
export function chatBubbleContains(text: string): ReturnType<typeof by.xpath> {
  const safe = text.replace(/"/g, '\\"');
  return by.xpath(`//*[@resource-id='${xid('message_list')}']//*[contains(@text,"${safe}")]`);
}
