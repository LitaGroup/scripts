# Android / Lite 自动测试

对应工程：**lita-lite-android**  
package：`com.litalite.android`

---

## 准备

1. 模拟器或真机已安装 Lite App  
2. Appium 2 + UiAutomator2：`appium driver install uiautomator2`  
3. 可选：`config.app.json` 填账号（未配置时语音房脚本回退示例号）

```bash
appium --address 127.0.0.1 --port 4723
adb devices
```

---

## 语音房功能测试（推荐）

串联 **3.1～3.4**：搜索进房 → 发消息 → 上麦 → 送礼。

| 编号 | 场景 |
|------|------|
| 3.1 | 语音房搜索并进入 |
| 3.2 | 进入语音房发送消息 |
| 3.4 | 语音房送礼（在上麦前执行） |
| 3.3 | 语音房上麦 |

入口脚本（正式环境唯一识别）：`voice-room.android.lite.test.ts`（公共能力已内联，单文件）

```bash
cd /path/to/scripts

SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
  node projects/app/android-lite/voice-room.android.lite.test.ts
```

可选参数：

```bash
--room-no=2000              # 或 SCRIPT_ROOM_NO（默认 2000）；搜不到则 Party 列表随机
--message=hello             # 公屏文案
--skip-enter                # 已在房内时跳过 3.1
SCRIPT_CONFIG=config.app.json
SCRIPT_DEVICE_UDID=<adb-serial>
```

### 注意

- 3.1 先按号搜索（默认 2000）；无在线结果时自动从 Party 列表随机进房。
- 上麦可能排队（`ll_bottom_remind`），「已上麦或排队」视为通过。
- 送礼需账号有足够金币；麦上无其他用户时 3.4 可能 skip。

---

## 登录冒烟（core）

正式登录用例在 `projects/app/core/`，见 `LOGIN_SMOKE.md`。

```bash
SCRIPT_CONFIG=config.app.json \
SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
node projects/app/core/login-phone-password.android.lite.test.ts
```

同级目录也可跑：`projects/app/android-lite/login-phone-password.android.lite.test.ts`。

---

## IM 冒烟（会话列表 / 私聊 / 群聊）

用例说明见同目录 `IM_SMOKE.md`。共用 helper：`projects/app/core/_lib/androidImFlow.ts`。

```bash
SCRIPT_CONFIG=config.app.json \
SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
node --experimental-strip-types projects/app/android-lite/im-conversation-list.android.lite.test.ts

# 私聊收发
node --experimental-strip-types projects/app/android-lite/im-private-chat.android.lite.test.ts

# 群聊（无 family 会话会 skip）
node --experimental-strip-types projects/app/android-lite/im-group-chat.android.lite.test.ts
```

可选：`SCRIPT_IM_SEED_COUNT=3` 或 `config.app.json` → `im.seedCount`（默认 3）。列表为空时会从首页 `recommendPlayers` 造私聊。
