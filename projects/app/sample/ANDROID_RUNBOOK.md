# Android 自动测试跑通（登录冒烟）

对应工程：**lita-lite-android**  
package：`com.litalite.android`  
脚本：`projects/app/core/login-*.android.lite.test.ts`  
用例：`projects/app/core/LOGIN_SMOKE.md`

---

## 准备

1. 模拟器或真机已安装 Lite App  
2. Appium 2 + UiAutomator2：`appium driver install uiautomator2`  
3. `config.app.json` 填手机号账号（与 iOS 可共用）

```bash
appium --address 127.0.0.1 --port 4723
adb devices
```

## 跑冒烟

```bash
cd /path/to/lita-script

SCRIPT_CONFIG=config.app.json \
SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
SCRIPT_OTP=1234 \
node --experimental-strip-types projects/app/core/login-phone-password.android.lite.test.ts

SCRIPT_CONFIG=config.app.json \
SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
node --experimental-strip-types projects/app/core/login-entries.android.lite.test.ts
```

多设备时加：`SCRIPT_ANDROID_UDID=<adb-serial>`。

## 与 sample 的关系

| 文件 | 说明 |
|------|------|
| `core/login-phone-password.android.lite.test.ts` | 发版 P0，读 `SCRIPT_CONFIG`，幂等登录 |
| `sample/step-2-phone-login.android.lite.test.ts` | 教学样例：强制先退登，硬编码号段示例 |

定位符请改 `_lib/androidLocators.ts`，避免只改 sample。
