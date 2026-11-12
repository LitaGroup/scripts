# 测试脚本说明

## 输出协议

沿用 scripts 仓库 `CheckBaseClass`：`start` / `act` / `check` / `done`，每行一个 JSON。`check.status` 三态：`success` / `fail` / `skip`；`done.total` 包含 act 与 check。

## 文件

| 文件 | 用途 |
| --- | --- |
| `lib/payment-client.ts` | 真实 HTTP 客户端：固定测试网关、鉴权头、完整请求/响应留痕、password 脱敏 |
| `lib/payment-lock-helpers.ts` | TK-0251 公共工具：Prometheus 指标解析、余额基线/回补、BUSY 分类、批量结果汇总 |
| `payment-redis-lock-off.test.ts` | TK-0249 锁关闭路径回归：成功路径、契约、鉴权、异常、幂等、只读一致性、数据回补 |
| `payment-redis-lock-on.test.ts` | TK-0249 锁开启路径：指标检测、同用户 80 并发、BALANCE_PROCESSING、失败不落账、重试、锁释放、数据回补 |
| `payment-lock-p0-off.test.ts` | TK-0251 C0：默认关闭回归，add/sub/refund 成功且无锁指标增量 |
| `payment-lock-p0-gray.test.ts` | TK-0251 C1/C2：白名单 A 加锁、B 不加锁；空白名单全量加锁 |
| `payment-lock-p0-concurrency.test.ts` | TK-0251 C1/C2：同用户并发互斥、add+sub、add+refund、不同用户、30 并发、流水一致性 |
| `payment-lock-p0-transaction.test.ts` | TK-0251 C1/C2：业务失败/参数失败后锁释放；提交顺序引用 P0-7（skip） |
| `payment-lock-p0-lease.test.ts` | TK-0251 C1/C3：lease-ms=0 冒烟；lease-ms=1ms 过期指标与业务正确性 |
| `payment-lock-p0-metrics.test.ts` | TK-0251：核心指标、timeout reason、标签基数；缺失故障注入项 skip 并注明 |

## 执行

```bash
# 锁关闭路径（默认环境即可执行）
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-off.test.ts --evidence-dir=./evidence/off

# 锁开启路径（需先在测试环境开启 redis-lock）
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-on.test.ts --evidence-dir=./evidence/on

# TK-0251 P0（需按 CASES.md 的 C0-C3 配置阶段执行）
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-lock-p0-off.test.ts
LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_NON_GRAY_USER_ID=7587 node payment-lock-p0-gray.test.ts --scope=whitelist
LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_NON_GRAY_USER_ID=7587 node payment-lock-p0-concurrency.test.ts --scope=whitelist
LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_NON_GRAY_USER_ID=7587 node payment-lock-p0-transaction.test.ts
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-lock-p0-lease.test.ts --mode=lease0
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-lock-p0-lease.test.ts --mode=lease1
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-lock-p0-metrics.test.ts
```

## 数据清理

- `payment-redis-lock-off.test.ts`：每个用例 `finally` 调用 `restoreToBaseline()`，把 `getAmountByBiz` 余额回补到启动时基线；最后一个检查点验证余额等于基线。
- `payment-redis-lock-on.test.ts`：并发批次结束后按 `基线 + 0.01 × 成功笔数` 校验，再按差值回补；异常路径也会先回补再抛检查失败。
- 清理失败会以 `[log]` 输出原始响应，并可能使最终余额检查点失败，不会吞错。

## 证据

- stdout 保留每次请求的 Method、完整 URL、脱敏 Header、Body、HTTP 状态、完整响应体、耗时。
- `--evidence-dir` 下的 `calls.json` 保存本次全部请求/响应，用于失败复现。
- 失败请求保留响应原文；不 mock、不重试到通过、不放宽断言。
