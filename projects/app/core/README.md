# 核心检查（App）

- **共享层**：`_lib/`（定位 / 登录 / IM helper）、用例文档（如 `LOGIN_SMOKE.md`）
- **iOS Lita 脚本**：本目录 `*.ios.lita.{test,check}.ts`
- **Android Lite 脚本**：只放在 `../android-lite/`（平台导入只认该目录，避免与 `core/` 双份）

命名：`{name}.{ios|android}.{lita|lite}.{check|test}.ts`

## 登录冒烟（双端）

完整用例：**[LOGIN_SMOKE.md](./LOGIN_SMOKE.md)**

| 平台 | 工程 | 密码登录 | 入口可见 |
|------|------|----------|----------|
| iOS | lita-ios-v2 (`but.lita.ios`) | `login-phone-password.ios.lita.test.ts`（本目录） | `login-entries.ios.lita.test.ts`（本目录） |
| Android | lita-lite-android (`com.litalite.android`) | `../android-lite/login-phone-password.android.lite.test.ts` | `../android-lite/login-entries.android.lite.test.ts` |

共用：`_lib/ios*`、`_lib/android*`；账号 `config.app.json`。

```bash
# iOS
SCRIPT_CONFIG=config.app.json SCRIPT_IOS_DEVICE="iPhone 17" SCRIPT_OTP=1234 \
  node --experimental-strip-types projects/app/core/login-phone-password.ios.lita.test.ts

# Android Lite
SCRIPT_CONFIG=config.app.json SCRIPT_OTP=1234 \
  node --experimental-strip-types projects/app/android-lite/login-phone-password.android.lite.test.ts
```

跑通手册：

- [../sample/IOS_RUNBOOK.md](../sample/IOS_RUNBOOK.md)
- [../sample/ANDROID_RUNBOOK.md](../sample/ANDROID_RUNBOOK.md) / [../android-lite/ANDROID_RUNBOOK.md](../android-lite/ANDROID_RUNBOOK.md)

> `login.android.lita.check.ts` 为兼容旧路径，已转调 `android-lite` 密码登录脚本。
