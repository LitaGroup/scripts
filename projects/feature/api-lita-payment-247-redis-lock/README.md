# lita-payment 余额变更 Redis 锁改造（TK-0247 / TK-0249 / TK-0251）

TK-0249「任务 247 的改动测试」与 TK-0251「余额 Redis 锁 P0 接口并发与灰度回归」的接口测试脚本。被测变更为 **TK-0247**（Redis 单写者锁）与 **TK-0250**（P0 审计整改）。

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

---

# TK-0251 余额 Redis 锁 P0 接口并发与灰度回归

- 被测变更：TK-0250「lita-payment 余额 Redis 锁 P0 审计整改」，修复分支 `bot-250-balance-lock-p0` @ `5a3e2cb`
- 用例设计：`/task/20261112/TK-0251/CASES.md`
- 追溯表：`COVERAGE.md` 的 TK-0251 章节
- 范围：默认关闭回归、P0-1 灰度语义、P0-4/P0-7 并发互斥、P0-4 事务边界、P0-5 租约、指标；不做全量回归/性能/故障注入（故障注入由 TK-0252 覆盖）

## TK-0251 测试用户

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `LITA_PAYMENT_TEST_USER_ID` | `7586` | 白名单用户 A |
| `LITA_PAYMENT_GRAY_USER_ID` | `7586` | 灰度用例的白名单用户 A |
| `LITA_PAYMENT_NON_GRAY_USER_ID` | 无（必填） | 非白名单用户 B，需求方确认使用 `7587` |
| `LITA_PAYMENT_BIZ` | `gamecenter_baishun1043` | 测试业务 |
| `LITA_PAYMENT_TRANS_PASSWORD` | 无（必填） | 运行期环境变量注入，不落仓库 |
| `LITA_PAYMENT_GRAY_SCOPE` | `whitelist` | `whitelist`（C1）或 `all`（C2） |
| `LITA_PAYMENT_LEASE_MODE` | `lease0` | `lease0`（C1）或 `lease1`（C3） |
| `LITA_PAYMENT_CONCURRENCY` | `30` | 并发互斥脚本并发数 |
| `LITA_PAYMENT_GRAY_CONCURRENCY` | `20` | 灰度全量脚本并发数 |
| `LITA_PAYMENT_LEASE_CONCURRENCY` | `10` | 短租约脚本并发数 |

## TK-0251 配置阶段与运行命令

| 阶段 | 配置要点 | 命令 |
| --- | --- | --- |
| C0 | `enabled=false` | `node payment-lock-p0-off.test.ts` |
| C1 | `enabled=true`、`gray-user-whitelist=[7586]`、`gray-games/gray-biz-list` 非空、`lease-ms=0`、`wait-ms=300`、`fail-fast=true` | `node payment-lock-p0-gray.test.ts --scope=whitelist`；`node payment-lock-p0-concurrency.test.ts --scope=whitelist`；`node payment-lock-p0-transaction.test.ts`；`node payment-lock-p0-lease.test.ts --mode=lease0` |
| C2 | 空白名单、`lease-ms=0` | `node payment-lock-p0-gray.test.ts --scope=all`；`node payment-lock-p0-concurrency.test.ts --scope=all`；`node payment-lock-p0-transaction.test.ts` |
| C3 | `lease-ms=1`、`wait-ms=300`、`fail-fast=true` | `node payment-lock-p0-lease.test.ts --mode=lease1` |
| 指标 | 建议在 C1-C3 后执行 | `node payment-lock-p0-metrics.test.ts` |

每个脚本都支持 `--evidence-dir=<目录>`，默认写入 `tests/evidence/`（仓库 `.gitignore` 已忽略）。

## TK-0251 限制

- 配置切换由需求方/运维在测试环境 Nacos 操作，脚本不修改配置；执行前必须确认实际配置与生效时间。
- 接口层无法直接观察事务提交顺序、看门狗续期、ERROR 日志；引用 TK-0250 P0-7 集成测试与 TK-0252 日志，并在报告中标注“引用不替代接口级结论”。
- P0 实现未提供 `redis_lock_skipped` 指标；非白名单用户“未加锁”用请求前后 `redis_lock_acquire_total` 无增量证明。
- 短租约 C3 若需要重启，需同时设置 `transaction-p99-ms=0` 或 `startup-check=WARN/SKIP`，否则启动自检可能失败。
- 只操作测试环境与自建流水；A/B 余额按基线回补，流水号 `TK251-` 前缀可追溯。

## TK-0251 验证结果（2026-11-12）

- 部署版本：lita-payment test @ 7023656（P0 修复；锁代码与 5a3e2cb 逐文件 SHA256 一致），2026-11-12 22:05:42 新 JVM 启动。
- C0：15/15 检查点通过；add/sub/refund 正常，无锁指标增量，余额回补 0.00。
- C1：灰度 5/5（A=7586 加锁、B=7587 不加锁，biz 配置不参与）；并发 17/17（30 并发 ok=4/busy=26，余额 0.04，BUSY 未入账）；事务 6 通过 + 1 skip（304 接口层限制）；lease0 3/3；指标 4 通过 + 2 skip。
- C2：灰度 9/9（空白名单 A/B 均加锁，B acquireDelta=15/busy=5）；并发 17/17（30 并发 ok=8/busy=22，余额 0.08）；事务 6 通过 + 1 skip。
- C3：lease1 5/5（10 并发 ok=10，expiredDelta=10，余额 0.10，后续 add 成功）；metrics 5 通过 + 1 skip（expired=14、timeout=64、acquire=325）。
- 统计：29 条用例（P0 27/P1 2），61 个唯一检查点；59 通过、0 未通过、2 阻塞（304 事务顺序、501-③ Redis 异常指标，引用 P0-7/TK-0252）。
- 缺陷：未发现产品缺陷，未创建缺陷。
- 详细报告与证据：任务文档 `/task/20261112/TK-0251/TEST_REPORT.md`、`EVIDENCE.md`；运行记录见 `RUNS.md`，追溯见 `COVERAGE.md`。
