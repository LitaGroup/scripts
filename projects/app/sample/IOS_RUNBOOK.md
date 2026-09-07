# iOS 自动测试跑通流程（登录样例）

对应脚本：
- 正式冒烟：`projects/app/core/login-phone-password.ios.lita.test.ts`、`login-entries.ios.lita.test.ts`
- 用例文档：`projects/app/core/LOGIN_SMOKE.md`
- Sample 入口：`projects/app/sample/login.ios.lita.test.ts`（共用 `core/_lib`）

App：`lita-ios-v2`，**bundleId = `but.lita.ios`**（`Lita` / `LitaDev` 相同，显示名分别为 Lita / LitaDev）。

---

## 0. 你需要什么

| 项 | 说明 |
|---|---|
| Mac + Xcode | 能编模拟器或真机 |
| Node.js **v24+**（或 **v22** + `--experimental-strip-types`） | 直接跑 `.ts`，无需编译 |
| Appium 2 + XCUITest Driver | 驱动 iOS |
| 已安装的 App | 模拟器或真机上装好 LitaDev/Lita |
| 测试账号 | 写入 `config.app.json` |

---

## 1. 安装 Appium（本机一次）

```bash
npm install -g appium
appium driver install xcuitest
appium driver list   # 应能看到 xcuitest
```

可选：Appium Inspector（图形化看控件树，方便填定位符）。

---

## 2. 准备 App（lita-ios-v2）

在 Xcode：

1. Scheme 选 **LitaDev**（日常调试）或 **Lita**
2. Destination 选模拟器，例如 **iPhone 16**
3. Run 安装到模拟器（或真机）

确认已安装：

```bash
xcrun simctl listapps booted | grep -i lita
# 或
xcrun simctl get_app_container booted but.lita.ios
```

记下模拟器名字（后面 `SCRIPT_IOS_DEVICE` 要用），例如 `iPhone 16`：

```bash
xcrun simctl list devices available | grep Booted
```

---

## 3. 启动 Appium Server

另开终端：

```bash
appium --address 127.0.0.1 --port 4723
```

保持运行。默认地址即脚本用的 `http://127.0.0.1:4723/`。

---

## 4. 配置测试账号（lita-script）

```bash
cd /Users/cuizhangqiang/Desktop/LitaCoding/lita-script
cp config.app.example.json config.app.json
```

编辑 `config.app.json`：

```json
{
  "accounts": {
    "default": {
      "username": "你的手机号",
      "password": "你的密码",
      "countryCode": "62"
    }
  }
}
```

`config.app.json` 已在 `.gitignore`，勿提交。区号按测试号国家填写（印尼常用 `62`）。

---

## 5. 第一次跑（先打通会话）

```bash
cd /Users/cuizhangqiang/Desktop/LitaCoding/lita-script

SCRIPT_CONFIG=config.app.json \
SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
SCRIPT_IOS_DEVICE="iPhone 17" \
SCRIPT_OTP=1234 \
node --experimental-strip-types projects/app/core/login-phone-password.ios.lita.test.ts
```

可选环境变量：

| 变量 | 用途 |
|---|---|
| `SCRIPT_IOS_DEVICE` | 模拟器名，如 `iPhone 17` |
| `SCRIPT_IOS_VERSION` | 系统版本，如 `18.2`（多台同名时建议加） |
| `SCRIPT_IOS_UDID` | 真机 UDID（真机必填） |
| `SCRIPT_OTP` | 新设备验证码，测试环境常用 `1234` |
| `SCRIPT_ENV` | `TEST`（默认）/ `PROD` |

成功时 stdout 会出现类似：

```text
[start] ...
[act] {"title":"创建 Appium 会话 (ios/lita/test)","status":"success",...}
...
[done] {"status":"success",...}
```

---

## 6. 校准定位符（第一次几乎必做）

iOS 登录页图标按钮常**没有** accessibilityId，样例里 `LOC.*` 用文案兜底，语言/UI 一变就会失败。

校准步骤：

1. Appium 会话起来后，在失败日志里看脚本打印的 **page source 片段**  
2. 或用 Appium Inspector 连同一 capabilities，点选「我的 / 登录 / 手机号 / 密码」  
3. 改共用定位 `projects/app/core/_lib/iosLocators.ts`：
   - 优先：`by.accessibilityId('...')`
   - 其次：`by.text('...')` / `by.textContains('...')`
   - 再：`by.xpath('//XCUIElementTypeButton[@name="..."]')`

建议在 `lita-ios-v2` 给登录关键控件补 `accessibilityIdentifier`（一劳永逸）。

---

## 7. 推荐闭环（你要跑通的完整流程）

```text
① Xcode 安装 LitaDev 到模拟器
② appium 起服务（4723）
③ 填 config.app.json 账号
④ node --experimental-strip-types core/login-phone-password.ios.lita.test.ts
⑤ 失败 → dump/Inspector 改 core/_lib/iosLocators.ts → 再跑
⑥ [done] success → 流程跑通
```

之后加用例：在 `core/` 新建 `xxx.ios.lita.test.ts`，复用 `_lib`，用 `act` / `check` / `ensureState`。

---

## 8. 常见问题

| 现象 | 处理 |
|---|---|
| 创建会话超时 / WDA 失败 | 第一次装 WDA 较慢；Xcode 对 WebDriverAgent 签过名；模拟器已 Boot |
| 找不到 App | 确认 `but.lita.ios` 已安装；LitaDev 显示名不同但 bundleId 相同 |
| 点不到「我的」 | `LOC.tabMe` 文案与当前语言不符，改 page source 里的真实 label |
| 登录入口是纯图标 | 必须 dump 后写 xpath/accessibilityId，不能靠文案 |
| `hideKeyboard` 无效 | iOS 可点空白处或 Return；框架里 Android BACK 兜底对 iOS 无效 |
| 真机 | 设 `SCRIPT_IOS_UDID`，设备信任电脑，WDA 签名与设备一致 |

---

## 10. 新设备验证码（当前卡点）

模拟器首次登录该账号会进入「输入验证码 (OTP)」页（文案：更改登入设备…将使用验证码）。

可选处理：

1. **手动过一次**：在模拟器输入验证码完成登录，之后同模拟器可直接跑密码流  
2. **临时注入**：`SCRIPT_OTP=1234 node --experimental-strip-types ...`  
3. **自动查库**：配置 `config.json` 的 test mysql，查 `lita_stats.sms_record_{yyyyMM}`（见 Android sample）

| | Android | iOS（本样例） |
|---|---|---|
| Driver | UiAutomator2 | XCUITest |
| 应用标识 | appPackage + appActivity | **bundleId** |
| 页面门控 | Activity | **不要用 activity**，靠元素状态 |
| 现成用例 | 较完整 | 密码登录 + 入口冒烟已校准（中文包）；见 LOGIN_SMOKE.md |
