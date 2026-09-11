# 示例代码

基础环境：模拟器/真机已完成 Lita Lite App 的安装（`com.litalite.android`），Appium 可用。
- Android：`step-1-open-me.android.lite.test.ts` / `step-2-phone-login.android.lite.test.ts`
- **iOS 登录样例**：`login.ios.lita.test.ts`（复用 `../core/_lib`，bundleId `but.lita.ios`）
- **Android 登录样例**：`step-2-phone-login.android.lite.test.ts`（Lite）
- **正式冒烟（双端）**：`../core/login-phone-password.*.test.ts`、`login-entries.*.test.ts`
- **用例文档**：[LOGIN_SMOKE.md](../core/LOGIN_SMOKE.md)
- **跑通说明**：[IOS_RUNBOOK.md](./IOS_RUNBOOK.md)
- **语音房测试**：见 [`../lita-lite/`](../lita-lite/)（`voice-room.android.lite.test.ts`）

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
