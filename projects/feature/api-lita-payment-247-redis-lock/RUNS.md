# 运行记录（TK-0249）

## 2026-11-12 20:03:14 · 锁关闭路径

- 脚本：`tests/payment-redis-lock-off.test.ts`
- 环境：`https://lita-payment.test.cinta.team`
- 用户/业务：7586 / `gamecenter_baishun1043`
- 命令：`LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-off.test.ts --evidence-dir=<本机 evidence 目录>`
- 结果：

```text
[start] {"total":38,"startTime":"2026-11-12T12:03:14.660Z"}
[done]  {"status":"success","total":39,"success":39,"fail":0,"skip":0,"message":"","time":1279,"cost":1279}
```

- 说明：`total=39` 含 1 个 act（读取基线）+ 38 个 check；38 个检查点全部通过。
- 退出码：0
- 证据：请求/响应明细见运行 stdout 与本机 `calls.json`（72 次请求）；余额最终 0.00。

## 2026-11-12 20:12 · 锁开启前环境复检（阻塞）

- 脚本：`tests/payment-redis-lock-on.test.ts`
- 结果：8 个检查点 skip（`redis-lock.enabled=false`），未伪造通过。
- 说明：20:07、20:08、20:10、20:12 四次加钱探针后 Prometheus 均无 `redis_lock_*` 指标。

## 2026-11-12 20:18:45 · 锁开启路径（首次执行，脚本基线错误）

- 前置：需求方确认已开启 redis-lock；20:18 加钱探针后 Prometheus 出现 `redis_lock_wait_ms`、`redis_lock_hold_ms`、`redis_lock_acquire_total`，确认切面生效。
- 结果：

```text
[start] {"total":10,"startTime":"2026-11-12T12:18:45.071Z"}
[check] API-PAY-104-① status=fail：期望 余额=0.05（基线 0.00 + 0.01×5），实际 余额=0.06
[done]  {"status":"fail","total":10,"success":9,"fail":1,"message":"API-PAY-104-① ...","time":1759,"cost":1759}
```

- 归因：**测试脚本基线错误**。用例前置 setup 已加钱 0.01，批次 5 笔成功，实际余额 0.01+0.05=0.06；脚本却按“启动基线 0.00+0.05”计算。**非产品缺陷**。
- 修正：改为读取批次前余额 `beforeBatch`，期望 = `beforeBatch + 0.01 × 成功笔数`。

## 2026-11-12 20:18:59 · 锁开启路径（修正后，通过）

- 命令：`LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-on.test.ts --evidence-dir=<本机 evidence 目录>`
- 结果：

```text
[start] {"total":10,"startTime":"2026-11-12T12:18:59.247Z"}
[check] API-PAY-101-① success：redis_lock_acquire_total / redis_lock_wait_ms 均存在
[check] API-PAY-102-① success：total=80，ok=8，busy=72，other=0
[check] API-PAY-102-② success：busy=72，ok=8
[check] API-PAY-103-① success：72 笔 busy 全部 getTransResult=NOT_FOUND
[check] API-PAY-104-① success：余额=0.09（批次前 0.01 + 0.01×8）
[check] API-PAY-105-① success：批次后普通加钱立即成功
[check] API-PAY-106-① success：busy transNo 重试成功
[check] API-PAY-106-② success：重试只入账一次（0.09→0.10→0.11）
[check] API-PAY-107-① success：redis_lock_acquire_fail{reason="timeout"} 命中
[check] API-PAY-108-① success：最终余额=0.00，回补基线
[done]  {"status":"success","total":10,"success":10,"fail":0,"skip":0,"message":"","time":3572,"cost":3572}
```

- 锁指标（执行后）：`redis_lock_acquire_total{reason="acquired"}=23`、`redis_lock_acquire_fail_total{reason="timeout"}=147`、`redis_lock_wait_ms_count{result="timeout"}=147`、`redis_lock_hold_ms_count{result="released"}=23`，无 expired/redis_error。
- 退出码：0
- 证据：本机 `calls.json`（含 80 并发请求与重试/回补），余额最终 0.00。

## 2026-11-12 20:19 · 锁关闭路径与锁开启路径关系说明

- 20:03 的锁关闭回归是在 `redis-lock.enabled=false` 下执行，代表默认关闭路径。
- 20:18 的锁开启回归是在 `enabled=true` 且 gray 1043 命中下执行，代表灰度开启路径。
- 两次运行不冲突：前者验证“关闭时不改变现状”，后者验证“开启时快速失败/不丢单/可重试”。

## 结论

- 23 条用例、48 个检查点最终全部通过（锁关闭 38 + 锁开启 10）。
- 首次锁开启运行的 1 个失败为脚本基线错误，已修正并复跑通过，不计产品缺陷。
- 未发现产品缺陷。
