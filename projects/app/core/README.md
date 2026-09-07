# 核心检查（App）

发版必要检查。命名：`{name}.{ios|android}.{lita|lite}.{check|test}.ts`

## 登录冒烟（双端）

完整用例：**[LOGIN_SMOKE.md](./LOGIN_SMOKE.md)**

| 平台 | 工程 | 密码登录 | 入口可见 |
|------|------|----------|----------|
| iOS | lita-ios-v2 (`but.lita.ios`) | `login-phone-password.ios.lita.test.ts` | `login-entries.ios.lita.test.ts` |
| Android | lita-lite-android (`com.litalite.android`) | `login-phone-password.android.lite.test.ts` | `login-entries.android.lite.test.ts` |

共用：`_lib/ios*`、`_lib/android*`；账号 `config.app.json`。

```bash
# iOS
SCRIPT_CONFIG=config.app.json SCRIPT_IOS_DEVICE="iPhone 17" SCRIPT_OTP=1234 \
  node --experimental-strip-types projects/app/core/login-phone-password.ios.lita.test.ts

# Android
SCRIPT_CONFIG=config.app.json SCRIPT_OTP=1234 \
  node --experimental-strip-types projects/app/core/login-phone-password.android.lite.test.ts
```

跑通手册：

- [../sample/IOS_RUNBOOK.md](../sample/IOS_RUNBOOK.md)
- [../sample/ANDROID_RUNBOOK.md](../sample/ANDROID_RUNBOOK.md)

> `login.android.lita.check.ts` 为兼容旧路径，已转调 Lite 密码登录脚本。
