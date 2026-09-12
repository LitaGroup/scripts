# 登录冒烟用例（iOS Lita + Android Lite）

> **iOS**：`lita-ios-v2`，bundleId `but.lita.ios`，flavor=`lita`  
> **Android**：`lita-lite-android`，package `com.litalite.android`，flavor=`lite`  
> 账号：`config.app.json` → `SCRIPT_ENV=PROD`（默认）用 `accounts.prod`；`SCRIPT_ENV=TEST` 用 `accounts.test`  
> 定位与流程：`projects/app/core/_lib/`  
> Android 包：PROD 装 **release**，TEST 装 **debug**（同 applicationId，需覆盖安装）

---

## 1. 登录方式对照

| 方式 | iOS (Lita) | Android (Lite) | 自动化 |
|------|------------|----------------|--------|
| 手机号 + 密码 / OTP | ✅ | ✅ | **P0 主路径** |
| Facebook | ✅ | ✅ | 入口冒烟；**完整登录见 SM-LOGIN-06** |
| Google | ✅ | ✅ | 入口冒烟；**完整登录见 SM-LOGIN-07** |
| Line | ✅（按区） | ✅（按区） | 同上 |
| Kakao | ✅（按区 / DEBUG） | ✅（按区，韩区高优） | 同上 |
| Apple | ✅ | ❌ 无入口 | iOS 手工；Android 验「无入口」 |
| Naver | 已下线 | UI 壳无逻辑 | 不测 |

### 手机号分支（两端一致：`hspw`）

```text
登录页 → 手机号 → 下一步
  ├─ hspw=true  → 密码页 → 登录
  │                 ├─ 首页
  │                 └─ 新设备 / 风控 → OTP
  └─ hspw=false → WhatsApp 弹窗（可关）→ OTP → 首页
```

---

## 2. 冒烟用例

| ID | 标题 | P | iOS 脚本 | Android 脚本 |
|----|------|---|----------|--------------|
| SM-LOGIN-01 | 登录页入口可见 | P0 | `login-entries.ios.lita.test.ts` | `login-entries.android.lite.test.ts` |
| SM-LOGIN-02 | 手机号+密码进首页 | P0 | `login-phone-password.ios.lita.test.ts` | `login-phone-password.android.lite.test.ts` |
| SM-LOGIN-03 | 新设备 OTP | P0 | 含在 02（`SCRIPT_OTP`） | 含在 02（查库 / `SCRIPT_OTP`） |
| SM-LOGIN-04 | WhatsApp 可关闭 | P1 | 状态机 | 状态机 |
| SM-LOGIN-05 | 无密码仅 OTP | P1 | 半自动 | 半自动 |
| SM-LOGIN-06 | Facebook 完整登录 | P1 | 手工 | `login-facebook.android.lite.test.ts` |
| SM-LOGIN-07 | Google 完整登录 | P1 | 手工 | `login-google.android.lite.test.ts` |
| SM-LOGIN-08 | Apple 完整登录 | P2 | 手工真机 | Android N/A |
| SM-LOGIN-09 | Line 完整登录 | P2 | 手工 | 手工 |
| SM-LOGIN-10 | Kakao 完整登录 | P2 | 手工 | 手工 |
| SM-LOGIN-11 | 已登录幂等 | P0 | `ensureLoggedIn` | `ensureAndroidLoggedIn` |
| SM-LOGIN-12 | 错误密码提示 | P1 | 手工 | 手工 |
| SM-LOGIN-13 | 韩国手机登录 UI | P2 | 手工 | 手工（低优电话图标） |

### SM-LOGIN-01 要点

- **前置**：未登录（Android 脚本会尝试自动退出）
- **期望**：手机号入口必现；≥1 个三方入口；Android 不应出现 Apple

### SM-LOGIN-06 要点（Android Facebook）

- **前置**：设备 Facebook App 或 Chrome 已登录 Facebook；脚本会先退出 App 登录态再进登录页
- **退出后**：若落到访客首页，会再点底部「我的」进入登录页（不要卡在首页）
- **步骤**：点 `rl_facebook_login` / `iv_low_facebook_login` → 授权页点 **Continue as / Continue**（可选 `SCRIPT_FACEBOOK_NAME` 匹配展示名）→ 回主页「我的」
- **期望**：`mePage` 或数字 `user_no`
- **脚本**：`projects/app/android-lite/login-facebook.android.lite.test.ts`（`core/` 下有同名入口）

### SM-LOGIN-07 要点（Android Google）

- **前置**：设备系统已登录 Google；脚本会先退出 App 登录态再进登录页
- **退出后**：若落到访客首页，会再点底部「我的」进入登录页
- **步骤**：点 `iv_low_google_login` / `rl_google_login` → 账号选择页点已登账号（可选 `SCRIPT_GOOGLE_EMAIL`）→ 如有 Continue/同意则点 → 回主页「我的」
- **期望**：`mePage` 或数字 `user_no`
- **脚本**：`projects/app/android-lite/login-google.android.lite.test.ts`（`core/` 下有同名入口）

### SM-LOGIN-02 要点

- **前置**：`config.app.json`；PROD：`86` / `18810242906`（OTP 查库）；TEST：`62` 开头号 + OTP `1234`
- **步骤**：入口 → 选区号 → 手机号 → Next/下一步 → 密码 → 登录 →（可选）OTP
- **期望**：进入主页 / 我的页已登录标记
- **OTP**：默认经 `userToken` 查 `stats.sms_record_*`；可用 `SCRIPT_OTP` / `accounts.smsCode` 覆盖

---

## 3. 运行命令

账号共用一份配置即可（并行双端建议错开或分号，避免互踢）：

```bash
cd /path/to/lita-script
export SCRIPT_CONFIG=config.app.json
export SCRIPT_APPIUM_URL=http://127.0.0.1:4723/
# 默认 SCRIPT_ENV=PROD（线上 release + accounts.prod + 查库 OTP）
# 测网：export SCRIPT_ENV=TEST（debug 包 + accounts.test + OTP 1234）
# 可选覆盖：export SCRIPT_OTP=xxxx

# iOS（模拟器名按本机修改；iOS 仍常用 SCRIPT_OTP）
SCRIPT_IOS_DEVICE="iPhone 17" SCRIPT_OTP=1234 \
  node --experimental-strip-types projects/app/core/login-phone-password.ios.lita.test.ts
SCRIPT_IOS_DEVICE="iPhone 17" \
  node --experimental-strip-types projects/app/core/login-entries.ios.lita.test.ts

# Android（可选 SCRIPT_ANDROID_UDID）
node --experimental-strip-types projects/app/core/login-phone-password.android.lite.test.ts
node --experimental-strip-types projects/app/core/login-entries.android.lite.test.ts
# Google：设备需已登录 Google；可选 SCRIPT_GOOGLE_EMAIL
node --experimental-strip-types projects/app/core/login-google.android.lite.test.ts
# Facebook：设备需已登录 Facebook；可选 SCRIPT_FACEBOOK_NAME
node --experimental-strip-types projects/app/core/login-facebook.android.lite.test.ts
# 或 android-lite 同级：
# node --experimental-strip-types projects/app/android-lite/login-google.android.lite.test.ts
# node --experimental-strip-types projects/app/android-lite/login-facebook.android.lite.test.ts
```

| 变量 | 用途 |
|------|------|
| `SCRIPT_CONFIG` | 账号 JSON（PROD 查短信需 `userToken`） |
| `SCRIPT_ENV` | `PROD`（默认）/ `TEST` |
| `SCRIPT_OTP` | 覆盖验证码；PROD 不设则查 `sms_record_*`；TEST 默认 `1234` |
| `SCRIPT_GOOGLE_EMAIL` | Google 账号页优先点选的邮箱；也可用 `google.email` / `accounts.google.email` |
| `SCRIPT_FACEBOOK_NAME` | Facebook 授权页优先匹配的展示名；也可用 `facebook.name` / `accounts.facebook.name` |
| `SCRIPT_IOS_DEVICE` / `UDID` / `VERSION` | iOS 设备 |
| `SCRIPT_ANDROID_UDID` / `SCRIPT_ANDROID_DEVICE` | Android 设备 |

跑通说明：iOS 见 [../sample/IOS_RUNBOOK.md](../sample/IOS_RUNBOOK.md)；Android 见 [../sample/ANDROID_RUNBOOK.md](../sample/ANDROID_RUNBOOK.md)。

---

## 4. 发版最小集（双端）

**每端各跑：**

1. SM-LOGIN-01 入口  
2. SM-LOGIN-02 手机密码（含 OTP）  
3. SM-LOGIN-11 幂等（再跑一次 02 即可）

**再抽检：** 当前发布区 1 个三方手工（iOS 可含 Apple；Android 不含）。
