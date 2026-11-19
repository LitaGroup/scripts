# 年度回忆（annual-review-v202612）接口测试

TK-0391「年度回忆后端接口 TK-0378 需求符合性测试」的接口测试脚本。

- 需求：`#3712`【PRD】2026年度盛典-年度回忆（迭代项 BL-0011 / 迭代 2026W47）
- 需求澄清：`/api/documents/3454.md`（C00–C32）
- 后端交付：TK-0378（子任务 TK-0383 技术方案、TK-0386 后端开发、TK-0387 Nacos 发布）
- 接口文档：`/api/docs/detail/task/20261119/TK-0383/API.md`、`/api/docs/detail/task/20261119/TK-0386/API.md`
- 测试报告：`/task/20261119/TK-0391/TEST_REPORT`（任务文档）
- 用例设计：[CASES.md](CASES.md)
- 追溯矩阵：[COVERAGE.md](COVERAGE.md)
- 运行记录：[RUNS.md](RUNS.md)

## 被测接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/active/v3/annual-review-v202612/get` | 完整 biz 路径，返回当前登录用户 `report.user`（61 列宽表行）+ `player` |
| POST | `/active/v3/annual-review/get` | alias 短路径，必须与完整路径响应一致 |
| POST | `/active/v3/annual-review-v202612/config` | 活动配置（biz/startTime/finishTime/enableLocales） |
| POST | `/active/v3/annual-review/config` | 短路径配置（活动期内可用） |

回归范围：`anniversary-v202608`（六周年）`/config`、`/get` 与 `pk-v202608` `/config` 未受影响。

## 测试环境

- 基地址：`https://api.test.cinta.team`（不含 token，使用框架测试头模拟登录）
- 时间：活动配置 `startTime=2026-12-14T00:00:00+08:00`、`finishTime=2027-12-31T23:59:59+08:00`，当前真实时间不在活动期，统一使用 `l-debug-timestamp` 模拟
- 登录/大区：`l-user-id`、`l-user-locale`
- 数据：stats 宽表 `lita_2026_year_in_review`（61 列），测试用户 `21`（字段较全）、`2`（官方账号）、`999999999`（无行）
- 生产环境禁止调用

## 目录

```
api-annual-review/
  README.md          # 本文件
  CASES.md           # 用例设计（编号、场景、预期、需求依据）
  COVERAGE.md        # 用例 → 检查点 → check 标题 → 执行结果
  RUNS.md            # 实际运行记录（命令、时间、退出码、统计）
  tests/
    README.md        # 脚本说明与运行方式
    _lib/            # 常量、HTTP 客户端（留痕/脱敏）、测试基类
    001-contract.test.ts          # 接口契约与响应结构
    002-auth-locale.test.ts       # 鉴权、越权、大区过滤
    003-time-window.test.ts       # 活动时间窗与 7 天链接容错
    004-config-regression.test.ts # 配置接口与既有活动回归
    005-empty-edge.test.ts        # 空数据、无 body、未知字段、幂等
    006-prd-coverage.test.ts      # PRD 21 页字段覆盖与枚举一致性
```

## 运行

```bash
cd projects/feature/api-annual-review/tests
node 001-contract.test.ts
node 002-auth-locale.test.ts
node 003-time-window.test.ts
node 004-config-regression.test.ts
node 005-empty-edge.test.ts
node 006-prd-coverage.test.ts
```

依赖：Node.js 24+（原生 TS，无构建步骤）；`npm install --ignore-scripts` 安装仓库依赖即可。

## 范围边界

- 本套脚本只验证**接口契约与接口行为**，不验证 stats 宽表数据口径（由数据测试任务 TK-0379 覆盖）。
- 昵称/头像渲染、被引用用户 ID 解析、注销跳过、多语言文案由前端按已确认方案（C 系列结论 + TK-0383 v2.2）处理，不在本接口断言内。
- 身份卡 8/9/10 的 CASE 顺序属数据侧口径（Q04 待确认），本套用例只校验 code/name/priority 的接口返回一致性。
