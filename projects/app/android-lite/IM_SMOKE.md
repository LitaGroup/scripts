# IM 冒烟用例（Android Lite）

> **工程**：`lita-lite-android`，package `com.litalite.android`  
> **脚本目录**（与登录同级）：`projects/app/android-lite/`  
> **登录复用**：`ensureAndroidLoggedIn` + `config.app.json` → `accounts.default`  
> **定位锚点**：消息 Tab=`navigation_message_center`；列表=`message_list`；输入=`input_message`；发送=`send_button`

---

## 0. 数据前置：会话为空时先造数

私聊会话列表若为空（或私聊条数不足），**不得直接跑列表长按/多选用例**，须先走造数：

```text
MainActivity 首页(Game)
  → recommendPlayers 智能推荐陪玩师
  → 点头像进 UserDetailActivity
  → chatButton 进 ChatActivity（私聊）
  → input_message 发一条唯一文本 → send_button
  → 返回（可连退到首页）
  → 换下一位陪玩师，重复至满足数量
  → 再进消息 Tab 做会话列表用例
```

| 项 | 约定 |
|----|------|
| 默认最少私聊会话数 | **3**（可用 `SCRIPT_IM_SEED_COUNT` 或 `config.app.json` → `im.seedCount` 覆盖） |
| 选人来源 | 首页 `recommendPlayers`（兼容 `img_avatar` / `player_profile_pic`） |
| 进聊按钮 | 陪玩师主页底栏 `chatButton` |
| 建会话判定 | 发出文本成功，或消息 Tab 列表出现对应 `user_name` |
| 跳过策略 | 推荐列表不足 / 全是自己 / 无法进聊 → 本轮 IM 列表相关用例 **skip** 并写明原因 |
| 去重 | 同一轮造数尽量选不同陪玩师；已存在会话可计入「已满足数量」 |

### SM-IM-00 会话造数（Seed）

- **P**：P0（列表类用例前置）
- **脚本**：`im-conversation-list` 开头 / 或抽 `ensureImPrivateConversations(n)`
- **步骤**：
  1. 登录就绪；关弹窗
  2. 进消息 Tab，统计**私聊**会话数（无 `family_` / 非系统号；有 `groupId` 的不算私聊）
  3. 若 `count >= seedCount` → 结束造数
  4. 否则切首页 → 滚动加载 `recommendPlayers` → 依次打开未聊过的陪玩师 → `chatButton` → 发 `im-seed-<ts>-<i>` → back
  5. 回到消息 Tab，断言私聊数 `>= seedCount`
- **期望**：列表至少 N 条可操作私聊，供后续置顶/归档/删除使用（删除会消耗会话，造数宜略留余量）

---

## 1. 用例总表

| ID | 标题 | P | 建议脚本 | 自动化 |
|----|------|---|----------|--------|
| SM-IM-00 | 私聊会话造数（首页陪玩师） | P0 | list / helper | ✅ |
| SM-IM-01 | 消息 Tab 进入会话列表 | P0 | list | ✅ |
| SM-IM-02 | 会话列表基础元素可见 | P0 | list | ✅ |
| SM-IM-03 | 打开一条已有私聊 | P0 | private | ✅ |
| SM-IM-04 | 私聊发送文本并回显 | P0 | private | ✅ |
| SM-IM-05 | 返回后列表摘要更新 | P0 | private | ✅ |
| SM-IM-06 | 打开一条群聊（family） | P0 | group | ✅（无群则 skip） |
| SM-IM-07 | 群聊发送文本并回显 | P0 | group | ✅ |
| SM-IM-08 | IM 断连提示 | P1 | list | 半自动 |
| SM-IM-09 | 搜索会话 | P1 | list | ✅ |
| SM-IM-10 | 多选后批量已读 | P1 | list | ✅ |
| SM-IM-11 | 多选后批量归档 | P1 | list | ✅ |
| SM-IM-12 | 私聊更多/关注入口 | P1 | private | ✅ UI |
| SM-IM-13 | 私聊发送表情并回显 | P1 | private | ✅ 真实发送 |
| SM-IM-14 | 私聊发送礼物 | P1 | private | ✅ 真发；余额不足则 skip |
| SM-IM-15 | 私聊图片入口 | P1 | private | ✅ |
| SM-IM-16 | 陌生人底栏 | P1 | private | 需造数 |
| SM-IM-17 | 群聊 @ 并发送 | P1 | group | ✅ 真实 @ 发送 |
| SM-IM-18 | 群聊更多：公告/背景 | P1 | group | ✅ |
| SM-IM-19 | 群聊送礼（含选人） | P1 | group | ✅ 真发；余额不足则 skip |
| SM-IM-20 | 系统通知入口 | P1 | list | ✅ |
| SM-IM-21 | 建家族 | P2 | group-create | 半自动 |
| SM-IM-22 | 双端互发 | P2 | dual | 双账号 |
| SM-IM-23 | 音视频通话入口 | P2 | private | 仅入口 |
| SM-IM-24 | 语音消息 | P2 | private | 半自动 |
| SM-IM-25 | 图片发送成功 | P2 | private | 半自动 |
| SM-IM-26 | 未读红点 | P1 | list | 需对端 |
| SM-IM-27 | 置顶角标展示 | P1 | list | ✅（依赖 30） |
| SM-IM-28 | MiniChat 房内 | P2 | 语音房 | 后置 |
| **SM-IM-29** | **长按出操作底栏** | **P1** | list | ✅ |
| **SM-IM-30** | **长按置顶** | **P1** | list | ✅ |
| **SM-IM-31** | **长按取消置顶** | **P1** | list | ✅ |
| **SM-IM-32** | **群聊长按无置顶** | **P1** | list | ✅（有群） |
| **SM-IM-33** | **长按忽略未读** | **P1** | list | ✅ |
| **SM-IM-34** | **长按删除会话** | **P1** | list | ✅ |
| **SM-IM-35** | **右上角 iv_more 进入多选** | **P1** | list | ✅ |
| **SM-IM-36** | **多选已读 tvReadAll** | **P1** | list | ✅ |
| **SM-IM-37** | **多选归档 tvArchive** | **P1** | list | ✅ |
| **SM-IM-38** | **退出多选 tvMore** | **P1** | list | ✅ |

**发版最小集**：SM-IM-00～07 +（有余力）29～31、35～37

---

## 2. P0 详细用例

### SM-IM-00 会话造数
见 §0。

### SM-IM-01 消息 Tab 进入会话列表
- **前置**：已登录（建议先跑完 SM-IM-00）
- **步骤**：点 `navigation_message_center`
- **期望**：`message_list` 或 `fragment_message_center` 可见

### SM-IM-02 列表基础元素
- **期望**：`tv_title`、`img_search`、`iv_more`、`message_list` 可见

### SM-IM-03 打开私聊
- **前置**：至少 1 条私聊（SM-IM-00）
- **步骤**：点一条无私聊 `groupId` 的行
- **期望**：`ChatActivity`；`input_message` 可见；`toolbar_player_name` 非空（`send_button` 可能在输入前隐藏，不强制）

### SM-IM-04 私聊发文本回显
- **步骤**：输入 `im-auto-<ts>` → `send_button`
- **期望**：`message_list` 内出现该文案（≤20s）

### SM-IM-05 列表摘要更新
- **步骤**：`toolbar_back_button` 回列表
- **期望**：对应行 `message_content` 含刚发文案

### SM-IM-06 / 07 群聊打开与发文本
- **前置**：存在 `family_*` 会话；否则 **skip**
- **期望**：群特征 UI + 文本回显

---

## 3. 长按 / 右上角多选（补全）

> 对照：`ChatListAdapter` 长按 → `DeleteChatListDialog`；`iv_more` → 多选底栏 `tvReadAll` / `tvArchive`（**不是**三选项 Popup）。

### SM-IM-29 长按出底栏
- **前置**：SM-IM-00 私聊 ≥1
- **步骤**：长按一条私聊（`clItem` / 列表行）
- **期望**：底栏出现 `tv_topping`、`tv_ignore_all_unread_message`、`tv_delete`、`tv_cancel`

### SM-IM-30 置顶
- **步骤**：未置顶私聊 → 长按 → `tv_topping`（Pin）
- **期望**：成功 Toast / 行出现 `iv_pin`；会话偏上

### SM-IM-31 取消置顶
- **步骤**：已置顶 → 长按 → Unpin 文案的 `tv_topping`
- **期望**：`iv_pin` 消失

### SM-IM-32 群聊无置顶项
- **步骤**：长按群会话
- **期望**：**不出现** `tv_topping`（代码：`groupId` 非空则隐藏）

### SM-IM-33 忽略未读
- **前置**：目标行有 `tv_unread_message_count`（可用对端消息或本地未读；无未读则先制造/skip）
- **步骤**：长按 → `tv_ignore_all_unread_message`
- **期望**：该行未读角标消失或为 0

### SM-IM-34 删除会话
- **前置**：造数会话中选一条「可删」私聊（勿删唯一依赖会话；删前保证列表仍 ≥2）
- **步骤**：长按 → `tv_delete`
- **期望**：该会话离开主列表；可用再造数补回

### SM-IM-35 进入多选
- **步骤**：点 `iv_more`
- **期望**：`iv_more` 不可见；`tvMore` 可见；底栏 `llAllBottomView` / `tvReadAll` / `tvArchive` 可见；列表进入可选态

### SM-IM-36 多选已读
- **步骤**：多选 ≥1 有未读（或任意选中）→ `tvReadAll`
- **期望**：选中项未读清零；退出或可再点 `tvMore` 收起

### SM-IM-37 多选归档
- **步骤**：多选 ≥1 私聊 → `tvArchive`
- **期望**：会话离开主列表；可能出现 `AboutArchiveDialog`（关掉即可）
- **注意**：归档 ≠ 长按菜单项；与 SM-IM-34 删除区分

### SM-IM-38 退出多选
- **步骤**：多选态点 `tvMore`
- **期望**：恢复 `iv_more`；底栏隐藏；选择态关闭

---

## 4. 脚本拆分建议

```text
projects/app/android-lite/
  login-phone-password.android.lite.test.ts
  home.android.lite.test.ts
  voice-room.android.lite.test.ts
  IM_SMOKE.md                          # 本文
  im-conversation-list.android.lite.test.ts
      # SM-IM-00,01,02,09～11,29～38,20
  im-private-chat.android.lite.test.ts
      # SM-IM-03～05,12～16（可依赖 00）
  im-group-chat.android.lite.test.ts
      # SM-IM-06,07,17～19
  ../core/_lib/androidImFlow.ts        # 造数 / 进消息 Tab / 长按菜单 helper
```

### 配置扩展示例

```json
{
  "accounts": {
    "default": {
      "username": "18810242906",
      "password": "123456",
      "countryCode": "86"
    }
  },
  "im": {
    "seedCount": 3,
    "peerNameContains": "",
    "groupId": "",
    "groupNameContains": ""
  }
}
```

---

## 5. 关键 resource-id（自动化）

| 场景 | id |
|------|-----|
| 消息 Tab | `navigation_message_center` |
| 列表 / 搜索 / 更多 | `message_list`, `img_search`, `iv_more`, `tv_more` |
| 多选底栏 | `tvReadAll`, `tvArchive` |
| 列表行 | `user_name`, `message_content`, `tv_unread_message_count`, `iv_pin` |
| 长按底栏 | `tv_topping`, `tv_ignore_all_unread_message`, `tv_delete`, `tv_cancel` |
| 聊天 | `input_message`, `send_button`, `toolbar_back_button`, `toolbar_player_name` |
| 造数 | 首页 `recommendPlayers` → 主页 `chatButton` |

---

## 6. 执行顺序建议

```text
登录 → SM-IM-00 造数(≥3私聊)
     → SM-IM-01/02 列表冒烟
     → SM-IM-35～38 多选/已读/归档（归档会减少列表，注意顺序）
     → SM-IM-29～33 长按置顶/忽略（置顶可先于归档）
     → SM-IM-34 删除（最后做，或删完再补造数）
     → SM-IM-03～05 私聊收发
     → SM-IM-06～07 群聊（可选）
```

归档/删除会破坏数据，**同一脚本内应：先读后写、先非破坏再破坏，必要时中途再跑 SM-IM-00 补会话。**
