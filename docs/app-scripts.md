# APP 自动化脚本规范（Appium）

> 适用范围：`projects/app/` 下的 APP 脚本（命名 `{name}.{ios|android}.{lita|lite}.{check|test}.ts`），
> 框架层为 `src/base/AppBaseClass.ts` + `src/resources/AppiumResource.ts`。

## 一、环境

| 环境变量 | 说明 | 默认 |
|---|---|---|
| `SCRIPT_APPIUM_URL` | Appium 服务地址 | `http://127.0.0.1:4723/`（内部备用 `http://172.20.1.79:4723/`） |
| `SCRIPT_ENV` | `TEST` / `PROD` | `TEST` |
| `SCRIPT_CONFIG` | 数据配置文件（JSON，提供账号密码，见 `config.app.example.json`） | 空 |

## 二、状态驱动模型

APP 操作基于状态完成：先检测状态，再操作与检查。

- 在构造函数中通过 `addState({name, kind?, activity?, detect, handle?})` 注册状态，**注册顺序 = 检测顺序**，建议：弹窗 → `logged-in` / `logged-out` → 其它页面；
- `activity`（可选，字符串支持精确/后缀匹配，或 RegExp）作为检测门控：**先比对当前 Activity，匹配后才执行元素级 `detect`**（更快、避免跨页面误判）；纯 Activity 判定的状态 `detect` 写 `async () => true`；
- 弹窗可能多层，标记 `kind: 'popup'` 并给出 `handle`，`closePopups()` 循环关闭；
- 每个流程开头用 `ensureLoggedIn()` / `ensureState(name)` / `ensureAnyState(names)` 保证前置状态。

## 三、超时与轮询规则

| 项 | 默认值 | 说明 |
|---|---|---|
| 状态等待超时 | **5s**（`stateTimeoutMs`） | `ensureState` / `ensureAnyState` / `ensureLoggedIn`；特殊情况（如登录完成）单独传参 |
| 状态检测轮询间隔 | **200ms**（`statePollMs`） | 框架内部所有 sleep 统一 200ms；`waitFor` 的 `intervalMs` 同默认 |
| 页面进入等待上限 | 3s（`pageTimeoutMs`） | `waitForElement` / `waitForActivity` |
| `unknown` 宽限期 | 5s（`unknownGraceMs`） | splash/启动场景，超时后走 `onUnknownState()` 恢复 |

## 四、软键盘处理

- **输入后、点击按钮前，先 `hideKeyboard()` 收起软键盘**，避免键盘遮挡按钮导致点击失败；
- `hideKeyboard()` 对密码框/安全键盘可能失效，框架已实现兜底：先 `mobile: hideKeyboard`，经 `isKeyboardShown()` 检测仍弹出时回退 BACK 键收起（仅在键盘弹出时按，不误触页面返回）。

## 五、元素定位获取（不靠猜）

编写用例时用 adb 命令实测：

```bash
# 当前 Activity
adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'
# UI 层级 / resource ID
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml
# 截图
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png
```

## 六、实战经验（模拟器实测总结）

1. **登录页关闭按钮有时序问题**：登录页标记元素先渲染，关闭按钮后出现，点击前需 `waitFor`；
2. **冷启动直落登录页时没有关闭按钮**（无处可返回），需判断存在再点击，不存在则保持当前页面；
3. **APP 终止时的页面会影响下次冷启动落点**：terminateApp 前停在哪个页面，下次启动可能直接恢复到该页面，写前置状态处理时需考虑；
4. UiAutomator2 的 `/value`（sendKeys）在部分输入框静默失败，`input()` 统一走 W3C Actions 逐字输入；
5. 页面切换期间元素可能瞬时失效，`click()` 内置一次自动重试。

## 七、验证基线（emulator-5554 + Appium）

| 脚本 | 结果 | 耗时 |
|---|---|---|
| `sample/sample.android.lite.test.ts` | 7/7 ✅ | ~32s |
| `sample/step-1-open-me.android.lite.test.ts` | 4/4 ✅ | ~3s |
| `sample/step-2-phone-login.android.lite.test.ts` | 10/10 ✅ | ~37s |
