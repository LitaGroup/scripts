# 项目 3707：Admin 特效管理-家族群聊背景 PAG 上传与展示

## 背景与范围

项目 3707《Admin-特效管理-家族群聊背景：支持上传 pag 格式图片。客户端支持显示 pag》要求 Admin 端在新增/编辑家族群聊背景时支持 `.pag` 上传与 PAG 播放预览，列表按 `.pag` 播放、非 PAG 展示静态图，并保持原有 png/jpg/gif/webp/mp4/mov 兼容与多语言名称配置能力。

本目录为 TK-0129 的 Admin UI 自动化执行脚本，覆盖 TK-0127 九列用例 #1～#12（P0 10 条、P1 2 条），共 55 个检查点（含 #6 三条数据行、#9 六条数据行展开）。

- 用例来源：`/task/20261109/TK-0127/HANDOFF`
- 技术方案：`/task/20261109/TK-0127/TECH_DESIGN`
- 执行任务：`/task/20261109/TK-0129/HANDOFF`

## 目录与文件

| 文件 | 说明 |
| --- | --- |
| `tests/family-pag-upload-display.test.ts` | 用例 #1～#12 主脚本（CheckBaseClass act/check 协议） |
| `tests/family-pag-regression.test.ts` | 平台回归入口（跳过 #2，执行 #3～#12） |
| `tests/lib/admin-base.ts` | 项目私有基类：真实登录、WAF 同源转发、页面操作、截图与请求留痕、截图帧比对 |
| `assets/BOT_TEST_PAG_3707.pag` | 任务提供的 PAG 样例（原样下载，未改扩展名/内容） |
| `assets/BOT_TEST_PAG_3707.{png,jpg,gif,webp,mp4,mov}` | 本地用 FFmpeg 生成的真实可解码文件（非改后缀） |
| `COVERAGE.md` | 检查点 ↔ check 双向核对与结果 |
| `RUNS.md` | 自测、红证与正式执行记录 |
| `README.md` | 本文件 |

## 运行

仓库根目录执行，凭证仅运行时注入（不写入脚本/日志/交付物）：

```bash
# 正式执行（#1～#12，按顺序；#2 会新增专用记录）
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' \
  node projects/feature/lita-admin-3707-family-pag/tests/family-pag-upload-display.test.ts

# 自测（不新增记录：#1、#2 前 3 个检查点、#10～#12）
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' \
  node projects/feature/lita-admin-3707-family-pag/tests/family-pag-upload-display.test.ts --selftest=1

# 断点续跑（专用记录已存在时，从 #N 继续，#2 不再重复新增）
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' \
  node projects/feature/lita-admin-3707-family-pag/tests/family-pag-upload-display.test.ts --from=7

# 平台缺陷回归入口（跳过 #2，执行 #3～#12；专用记录已存在时使用）
ADMIN_USERNAME=qa-ai ADMIN_PASSWORD='***' \
  node projects/feature/lita-admin-3707-family-pag/tests/family-pag-regression.test.ts
```

可选环境变量：`SCRIPT_UI_BASE`（默认 `https://admin.test.lita.game`）、`SCRIPT_API_BASE`（默认 `https://funbit-mgr.test.cinta.team`）。

## 环境与 WAF 说明

- Admin UI：`https://admin.test.lita.game`（2026-11-09 缺陷回归轮入口 `static/index-f3fad263.js`，HTML Last-Modified 2026-11-09 12:33:30 GMT；首次执行轮入口为 `static/index-747ac2bd.js`）。
- 执行机直连 `https://m-api.test.lita.game` 返回 WAF 403；基类仅在 Playwright 浏览器层把该主机请求**原样转发**到同源测试入口 `https://funbit-mgr.test.cinta.team`，不改 URL 业务参数与请求/响应体（规范 R1 例外，已在代码注释与本文件声明）。
- 验证点全部读取页面内容（DOM/可见文本/页面资源地址/渲染帧），不读取接口响应、不执行 SQL；网络留痕只写入 `run.json` 作为证据索引。

## PAG 播放判定方式

列表与弹窗的 PAG 预览为 `PAGPlayer` 渲染的 `canvas.pag-canvas`。脚本对同一 canvas 连续采样多帧截图，解码 PNG 后按像素比较帧差（阈值：变化像素 ≥0.3% 且最大通道差 ≥20），并同时校验无 `PAG加载失败` console 记录、单元格内无 `img`/错误占位；静态图以 `img.complete && naturalWidth>0` 判定已解码。该判定不依赖接口响应。

## 数据隔离与清理状态

- 需求方约束：test 环境最多新增**一条**专用记录，名称固定 `BOT_TEST_PAG_3707`；不得修改任何现有记录；执行侧不执行 SQL。
- 本轮新增记录：**背景ID 23 / BOT_TEST_PAG_3707**（列表 Total 22 → 23）；曾用 Edit 在同一记录内切换 png/jpg/gif/webp/mp4/mov/PAG，结束时两个媒体字段已恢复为 PAG；en=`BOT_TEST_PAG_3707_EN`、zh=`BOT_TEST_PAG_3707_中文`。
- 页面无删除入口，**测试数据未清理**，保留该记录供后续回归与产品核实（详见 TEST_REPORT「数据清理」）。
- 未修改任何现有记录；未执行 SQL；未操作生产环境。

## 轮次结果（TK-0129，2026-11-09）

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| #1～#5 | 通过 | 页面入口、新增 PAG、列表缩略图/背景图 PAG、双列 PNG 静态 |
| #6 | 未通过 | 列表两列媒体字段颠倒（缺陷 #250）；①③ 通过，E1/E2 的 ② 未通过 |
| #7 | 通过 | en/zh 名称保存与回显正常；「默认 en 页签」假设不成立，记用例问题 Q-01 |
| #8 | 通过 | 两个 PAG 预览地址保留 `.pag`，Cancel 后记录状态不变 |
| #9 | 未通过 | png/jpg/gif/webp 正常；mp4/mov 预览与列表均破图（缺陷 #251） |
| #10～#12 | 通过 | 三个必填项空值均保持弹窗打开、列表 Total 不变 |

- 四态：通过 10 / 未通过 2 / 阻塞 0 / 未执行 0；执行率 100%，通过率 83.3%。
- 缺陷：#250（中，前端，列表两列媒体颠倒）、#251（中，前端，mp4/mov 预览与列表破图），修复后进入 TK-0133 回归。

## 轮次结果（TK-0133 缺陷回归，2026-11-09）

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| #3/#4/#5 | 通过 | PAG 与 PNG 列表展示正常，修复未引入回归 |
| #6 | 通过 | E1/E2/E3 列表两列与 Edit 回显均按预期，两列不再颠倒（#250 修复确认） |
| #7/#8 | 通过 | en/zh 回显、PAG 预览地址与 Cancel 无副作用 |
| #9 | 通过 | F1～F4 静态图正常；F5 mp4 / F6 mov 弹窗与列表均以 video 展示（readyState=4、videoWidth=320、error 无），无破图（#251 修复确认） |
| #10～#12 | 通过 | 必填校验保持弹窗打开且 Total 23 不变 |

- 部署基线：入口 `static/index-f3fad263.js`，家族群聊背景 chunk `static/index-975df218.js`。
- 回归结果：45/45 check 通过；平台 testId 107 的 `run.md` 仍报 `ERR_MODULE_NOT_FOUND`（既有平台运行器问题），以工位本地 Node v24.22.1 直跑同脚本为准。
- 视频断言适配：#9 F5/F6 按 `<video>` 的 readyState/videoWidth/error 判定可显示，F1～F4 仍按静态 img 判定；红证抽查（videoWidth 阈值改错）4 个 check 失败，恢复后 45/45 通过。
