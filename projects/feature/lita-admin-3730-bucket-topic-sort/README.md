# lita-admin-3730-bucket-topic-sort

Lita Admin「系统控制 - 分桶分群 - 桶的清单」分桶列表默认按 Topic 字母序升序排序的 UI 测试脚本（项目 #3730「验-0101」，需求 #3460，提测 #63）。

## 用例来源

- 用例表格：TK-0322（任务 322）HANDOFF v5 九列用例表格（16 条 / 65 检查点 / 用例 5 按 D1~D3 展开后 73 个执行检查点）。
- 技术方案：`/task/20261117/TK-0322/TECH_DESIGN`（骨架 SK-A~E、造数 BD-01~03、元素定位 L-01~L-22、引用式断言映射）。
- 本目录 check 标记与用例检查点一一对应，见 `COVERAGE.md`。

## 运行前置

- Node.js v24+（原生 TS 类型剥离，`node xxx.test.ts` 直跑，无构建步骤）。
- 测试环境 `https://admin.test.lita.game`（`SCRIPT_UI_BASE` 可覆盖）。
- 账号：正向 `qa-ai`（`ADMIN_USERNAME`/`ADMIN_PASSWORD`）；无权限族 `qa-noauth`（`NOAUTH_USERNAME`/`NOAUTH_PASSWORD`）。凭证仅运行时注入，禁止写入代码/日志/证据/文档。

## 运行方式

```bash
cd projects/feature/lita-admin-3730-bucket-topic-sort

# 正向用例（#1~#12、#16）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc01-list-default-order.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc02-refresh-stability.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc03-single-page-pagination.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc04-search-and-reset.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc05-add-delete-regression.test.ts
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tc06-detail-navigation.test.ts

# 无权限族（#13~#15）
NOAUTH_USERNAME=… NOAUTH_PASSWORD=… node tests/tc07-noauth-permission.test.ts

# 数据清理（全部用例结束后；逐条页面删除 qa-sort- 数据并确认 0 行）
ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tools/cleanup-bd01.ts
```

证据默认写入 `evidence/<slug>-<时间戳>/`（run.json + 截图），可用 `--evidence-dir=<绝对路径>` 指定。

## 数据隔离

- 仅页面级自建 `qa-sort-` 前缀数据（BD-01 12 条；BD-02 `qa-sort-insert` 随用例 9 创建/删除；BD-03 `qa-sort-zzz` 随用例 10 删除后重建）。
- 禁止 SQL/接口造数；禁止修改或删除非自建数据；结束后 `tests/tools/cleanup-bd01.ts` 页面逐条删除并确认搜索 `qa-sort` 结果 0 行。

## 环境适配声明（R1 例外）

- 执行机直连 `m-api.test.lita.game` 被边缘 WAF 403（登录/init 均 403），浏览器层做同源原样转发：
  - `/admin/*` 等 → `https://funbit-mgr.test.cinta.team`
  - `/admin-main/*`、`/data-main/*` → `https://api.test.cinta.team`（平台网关）
- 平台网关 `/admin-main/*` 要求 `l-user-token` + `l-user-id`：转发时以本次真实登录会话的 `accesstoken` 与会话用户 id 做等价头映射（同一会话身份；不改 URL、业务参数与响应体；不 mock、不注入响应）。该适配仅用于网络层连通，验证点全部读取页面内容。

## 目录

```
tests/
  lib/admin-base.ts      # 登录/转发/等待/表格/弹窗/菜单/截图/请求留痕
  lib/bucket-base.ts     # BD-01 就绪确认、BD-02 前置、列表入口
  lib/bucket-data.ts     # BD-01 数据、锁定比较器、期望序计算
  tc01-list-default-order.test.ts     # 用例 1、2
  tc02-refresh-stability.test.ts      # 用例 3
  tc03-single-page-pagination.test.ts # 用例 4
  tc04-search-and-reset.test.ts       # 用例 5（D1~D3）、6、7、8
  tc05-add-delete-regression.test.ts  # 用例 9、10、11、16
  tc06-detail-navigation.test.ts      # 用例 12
  tc07-noauth-permission.test.ts      # 用例 13、14、15
  tools/cleanup-bd01.ts               # 数据清理工具（非平台用例）
COVERAGE.md  RUNS.md  README.md
```
