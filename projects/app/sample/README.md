# 示例代码

基础环境：模拟器/真机已完成 Lita Lite App 的安装（`com.litalite.android`），Appium 可用。
- Android：`step-1-open-me.android.lite.test.ts` / `step-2-phone-login.android.lite.test.ts`
- **iOS 登录样例**：`login.ios.lita.test.ts`（复用 `../core/_lib`，bundleId `but.lita.ios`）
- **Android 登录样例**：`step-2-phone-login.android.lite.test.ts`（Lite）
- **正式冒烟（双端）**：`../core/login-phone-password.*.test.ts`、`login-entries.*.test.ts`
- **用例文档**：[LOGIN_SMOKE.md](../core/LOGIN_SMOKE.md)
- **跑通说明**：[IOS_RUNBOOK.md](./IOS_RUNBOOK.md) / [ANDROID_RUNBOOK.md](./ANDROID_RUNBOOK.md)

---

## 1–2. 登录相关（既有）

1. 处理登录状态为未登录  
2. 验证手机号密码登录  
3. 判断是否登录成功  

详见：

- `step-1-open-me.android.lite.test.ts`
- `step-2-phone-login.android.lite.test.ts`
- `sample.android.lite.test.ts`

账号示例：`18611755224` / `123456`（或通过 `SCRIPT_CONFIG` 注入）。

---

## 3. 语音房（新增）

依赖源码工程：`lita-lite-android`（Party → 搜索 → Fun/Voice/Person 语音房）。

| 编号 | 场景 | 脚本 |
|------|------|------|
| 3.1 | 语音房搜索并进入 | `step-3-1-search-enter.android.lite.test.ts` |
| 3.2 | 进入语音房发送消息 | `step-3-2-send-message.android.lite.test.ts` |
| 3.3 | 语音房上麦 | `step-3-3-on-mic.android.lite.test.ts` |
| 3.4 | 语音房送礼 | `step-3-4-send-gift.android.lite.test.ts` |
| 全部 | 3.1→3.4 串联 | `voice-room.android.lite.test.ts` |

公共逻辑：`voiceRoom.helpers.ts`（登录、Party、搜索进房、发消息、上麦、送礼）。

### 必填参数

房间展示号（用户可见的 `roomNo`）。**测试环境默认 `2000`**，也可显式传入：

```bash
--room-no=2000
# 或
SCRIPT_ROOM_NO=2000
```

可选：

```bash
--message=hello
SCRIPT_CONFIG=config.app.json
SCRIPT_APPIUM_URL=http://127.0.0.1:4723/
SCRIPT_ENV=TEST
SCRIPT_DEVICE_UDID=1A091FDEE0026Y   # 多设备/USB+无线并存时建议指定
```

### 运行示例

```bash
# 测试环境默认进 2000 房（完整 3.1–3.4）
SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
  node projects/app/sample/voice-room.android.lite.test.ts

# 或显式指定
node projects/app/sample/voice-room.android.lite.test.ts --room-no=2000

# 分步
node projects/app/sample/step-3-1-search-enter.android.lite.test.ts --room-no=2000
node projects/app/sample/step-3-2-send-message.android.lite.test.ts --room-no=2000
node projects/app/sample/step-3-3-on-mic.android.lite.test.ts --room-no=2000
node projects/app/sample/step-3-4-send-gift.android.lite.test.ts --room-no=2000
```

### 关键元素（Lite）

| 能力 | resource-id |
|------|-------------|
| Party tab | `navigation_voice_room` |
| 搜索入口 | `img_search_room` |
| 搜索框 | `searchEt`（IME Search） |
| 结果房间号 | `tv_room_id`（`ID:{roomNo}`） |
| 房内房间号 | `roomIdTextView` |
| 公屏入口 / 输入 | `iv_message` / `input_view`（IME Send） |
| 上麦 Join | `tv_apply_order`；已上麦 `fl_bottom_voice` |
| 送礼 | `iv_gift` → `itemGiftLayout` → `sendGiftSubmitTv` |

### 注意

- 搜索结果仅能进入**在线**房间；离线房间点不进去（`--room-no` 必须是当前在线的展示号）。
- 进房后常见遮罩脚本已处理：Share/Invite、Room Guide、Boss/Regular 选座、录音权限、周榜运营弹窗。
- 上麦可能进入排队（`ll_bottom_remind`），脚本将「已上麦或排队」视为通过。
- 送礼：`iv_gift` 为 PAG，常不在无障碍树，脚本会点右下角热区兜底；账号需有足够金币。
- 未配置 `SCRIPT_CONFIG` 时回退示例账号 `18611755224` / `123456`。
- 框架补充：`AppiumResource.performEditorAction`（搜索/发送）、`AppBaseClass.abortCase`（参数缺失 fail-fast）。
