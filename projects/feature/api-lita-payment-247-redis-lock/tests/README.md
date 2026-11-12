# 测试脚本说明

## 输出协议

沿用 scripts 仓库 `CheckBaseClass`：`start` / `act` / `check` / `done`，每行一个 JSON。`check.status` 三态：`success` / `fail` / `skip`；`done.total` 包含 act 与 check。

## 文件

| 文件 | 用途 |
| --- | --- |
| `lib/payment-client.ts` | 真实 HTTP 客户端：固定测试网关、鉴权头、完整请求/响应留痕、password 脱敏 |
| `payment-redis-lock-off.test.ts` | 锁关闭路径回归：成功路径、契约、鉴权、异常、幂等、只读一致性、数据回补 |
| `payment-redis-lock-on.test.ts` | 锁开启路径：指标检测、同用户 80 并发、BALANCE_PROCESSING、失败不落账、重试、锁释放、数据回补 |

## 执行

```bash
# 锁关闭路径（默认环境即可执行）
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-off.test.ts --evidence-dir=./evidence/off

# 锁开启路径（需先在测试环境开启 redis-lock）
LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-on.test.ts --evidence-dir=./evidence/on
```

## 数据清理

- `payment-redis-lock-off.test.ts`：每个用例 `finally` 调用 `restoreToBaseline()`，把 `getAmountByBiz` 余额回补到启动时基线；最后一个检查点验证余额等于基线。
- `payment-redis-lock-on.test.ts`：并发批次结束后按 `基线 + 0.01 × 成功笔数` 校验，再按差值回补；异常路径也会先回补再抛检查失败。
- 清理失败会以 `[log]` 输出原始响应，并可能使最终余额检查点失败，不会吞错。

## 证据

- stdout 保留每次请求的 Method、完整 URL、脱敏 Header、Body、HTTP 状态、完整响应体、耗时。
- `--evidence-dir` 下的 `calls.json` 保存本次全部请求/响应，用于失败复现。
- 失败请求保留响应原文；不 mock、不重试到通过、不放宽断言。
