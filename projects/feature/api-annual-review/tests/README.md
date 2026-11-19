# 测试脚本说明

## 输出协议

沿用 scripts 仓库 `CheckBaseClass`：`start` / `act` / `check` / `done`，每行一个 JSON。`check.status` 三态：`success` / `fail` / `skip`；`done.total` 包含 act 与 check。

## 文件

| 文件 | 用途 |
| --- | --- |
| `_lib/constants.ts` | 接口路径、活动时间、测试用户、61 列字段清单、DDL 类型集合、身份卡映射、PRD 21 页字段映射 |
| `_lib/client.ts` | HTTP 客户端：真实调用 api.test.cinta.team，逐次留痕（Method/URL/Header/Body/HTTP/响应/耗时），昵称头像脱敏，响应稳定序列化 |
| `_lib/AnnualReviewTestBase.ts` | 测试基类：基于 `TestBaseClass`，注入 `annualReview` 客户端 |
| `001-contract.test.ts` | 接口契约：完整/短路径、61 列字段、类型映射、player 结构、身份一致性、幂等 |
| `002-auth-locale.test.ts` | 未登录、用户 ID=0、body 越权注入、六个启用大区、未启用大区及双路径 |
| `003-time-window.test.ts` | 活动开始/结束边界、前后 7 天链接容错、容错外错误语义、双路径 |
| `004-config-regression.test.ts` | `/config`（完整/短路径）、六周年与 PK 活动回归、未知路径、GET 方法 |
| `005-empty-edge.test.ts` | 宽表无行、无 body、未知字段、三次幂等、请求隔离 |
| `006-prd-coverage.test.ts` | PRD 21 页逐页字段覆盖、身份卡 code/name/priority、active_time / 关系类型枚举 |

## 运行

```bash
# 仓库根目录安装依赖（Playwright 浏览器不需要，--ignore-scripts 即可）
npm install --ignore-scripts

cd projects/feature/api-annual-review/tests
node 001-contract.test.ts
node 002-auth-locale.test.ts
node 003-time-window.test.ts
node 004-config-regression.test.ts
node 005-empty-edge.test.ts
node 006-prd-coverage.test.ts
```

无环境变量、无本地 config.json 依赖。脚本只读访问测试环境。

## 请求约定

| 项 | 值 |
| --- | --- |
| Host | `https://api.test.cinta.team` |
| Header | `Content-Type: application/json`、`l-debug-timestamp`、`l-user-id`、`l-user-locale` |
| Body | `{}`（或空） |
| 时间格式 | `yyyy-MM-ddTHH:mm:ss` / 带 `±HH:mm` 偏移；不支持毫秒与空格分隔 |
| 鉴权 | 测试环境框架 Session 测试头；**不使用真实 Token，不写入任何凭证** |

## 数据与清理

- 全部为只读查询；不造数、不写库、不清理。
- 测试用户：`21`（宽表有行、字段较全）、`2`（官方账号）、`999999999`（无行）、`8/11/14/21/28`（身份卡抽查）。

## 留痕与脱敏

- stdout 逐次记录请求与响应，响应中的 `nick` / `avatar` / `name` 以 `***` 替换（个人敏感信息不入日志）。
- 失败信息保留完整响应结构（脱敏后）与可复现 curl（`APITestResource` 内置）。
- 断言失败即 `fail`，不重试到通过、不吞错。

## 断言原则

- 预期只来自 PRD、需求澄清结论、接口文档、Nacos 配置与 stats 表 DDL；不以实现现状倒推预期。
- 数据口径（61 列取值是否正确）不在本套脚本范围，由数据测试任务 TK-0379 覆盖。
