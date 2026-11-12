# lita-payment 余额变更 Redis 锁改造（TK-0247 / TK-0249）

TK-0249「任务 247 的改动测试」的接口测试脚本。被测变更为 **TK-0247**：`lita-payment` 余额变更入口增加 Redis 单写者锁。

## 被测接口

| 方法 | 路径 | 变更 |
| --- | --- | --- |
| POST | `/litapayment/global/trans/addAccountMoney` | 增加 `@UserBalanceLock`（Redis 锁） |
| POST | `/litapayment/global/trans/subAccountMoney` | 同上 |
| POST | `/litapayment/global/trans/refund` | 同上 |
| POST | `/litapayment/global/trans/getAmountByBiz`、`getAccountMap`、`getAccountMapByBiz`、`getAmountByDealTypes`、`getTransResult` | 只读，不受影响（用于一致性校验） |

- 接口文档：`/task/20261112/TK-0247/API`
- 技术方案：`/task/20261112/TK-0247/TECH_DESIGN`
- 需求方案：`/sre/baishun-callback-lock-optimization`

## 测试环境

- 基地址：`https://lita-payment.test.cinta.team`（可用 `LITA_PAYMENT_HOST` 覆盖）
- 鉴权：请求头 `password` + `passwordVersion: 1`；密码从环境变量 `LITA_PAYMENT_TRANS_PASSWORD` 读取，**不写入代码/日志/报告**
- 测试用户：`7586`；业务：`gamecenter_baishun1043`（与灰度 `1043` 一致）
- 健康检查：`GET /actuator/health`；锁指标：`GET /actuator/prometheus`（只读）
- 生产环境禁止写入

## 目录

```
api-lita-payment-247-redis-lock/
  README.md                  # 本文件
  COVERAGE.md                # 用例 → 检查点 → 脚本追溯
  RUNS.md                    # 实际运行记录
  tests/
    README.md
    lib/payment-client.ts    # 真实 HTTP 客户端：留痕、密码脱敏、业务状态解析
    payment-redis-lock-off.test.ts  # 锁关闭（默认）路径回归
    payment-redis-lock-on.test.ts   # 锁开启路径（需环境开启灰度）
```

## 运行

```bash
cd projects/feature/api-lita-payment-247-redis-lock/tests
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-off.test.ts
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-on.test.ts
```

可选环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `LITA_PAYMENT_HOST` | `https://lita-payment.test.cinta.team` | 支付测试网关 |
| `LITA_PAYMENT_BIZ` | `gamecenter_baishun1043` | 测试业务 |
| `LITA_PAYMENT_TEST_USER_ID` | `7586` | 测试用户 |
| `LITA_PAYMENT_RUN_ID` | 时间戳 | 流水号前缀，保证本次唯一 |
| `LITA_PAYMENT_LOCK_CONCURRENCY` | `80` | 锁开启用例并发数 |
| `LITA_PAYMENT_TRANS_PASSWORD` | 无（必填） | 支付接口密码，取值见 API 文档，不落仓库 |

## 数据与安全

- 只操作测试用户 `7586` + `biz=gamecenter_baishun1043`，每笔金额 `0.01`。
- 每个用例在 `finally` 中按基线回补余额；锁开启并发用例按“成功笔数 × 0.01”回补。
- 流水号格式 `TK249-<runId>-<tag>`，本次自建、可追溯。
- 日志中的 `password` 一律脱敏为 `***`；不记录任何 Token/Cookie/密钥。
- 运行产物写入 `evidence/`（仓库 `.gitignore` 已忽略），不提交。

## 已知限制

- 锁开启路径依赖测试环境 Nacos 配置：`redis-lock.enabled=true`、`gray-games=["1043"]`、`fail-fast=true`、`fallback-to-db=true`。未开启时脚本将锁开启场景标记 `skip`（阻塞），不伪造通过。
- 不直接读写 Redis/MySQL；Redis 故障/降级、看门狗续期等场景由 TK-0247 单元测试覆盖，本接口测试不重复注入基础设施故障。
- 不做性能压测；80 并发仅用于触发有界等待/快速失败，不评估吞吐。
