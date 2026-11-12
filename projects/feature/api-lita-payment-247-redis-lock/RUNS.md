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

---

# TK-0251 运行记录（余额 Redis 锁 P0 接口并发与灰度回归）

## 状态

- 2026-11-12 21:29：测试代码与用例已准备完成，等待 TK-0250 修复（bot-250-balance-lock-p0 @ 5a3e2cb）部署到测试环境。
- 当前未执行任何依赖 P0 新版本的用例；不把旧版本探测结果写入本任务结论。
- 配置阶段 C0-C3 由需求方/运维在测试环境 Nacos 切换；执行前记录实际配置与生效时间。

## 待执行运行矩阵

| 阶段 | 脚本 | 命令 | 状态 |
| --- | --- | --- | --- |
| C0 | payment-lock-p0-off.test.ts | node payment-lock-p0-off.test.ts | 未执行（等待部署/配置） |
| C1 | payment-lock-p0-gray.test.ts | node payment-lock-p0-gray.test.ts --scope=whitelist | 未执行 |
| C1 | payment-lock-p0-concurrency.test.ts | node payment-lock-p0-concurrency.test.ts --scope=whitelist | 未执行 |
| C1 | payment-lock-p0-transaction.test.ts | node payment-lock-p0-transaction.test.ts | 未执行 |
| C1 | payment-lock-p0-lease.test.ts | node payment-lock-p0-lease.test.ts --mode=lease0 | 未执行 |
| C2 | payment-lock-p0-gray.test.ts | node payment-lock-p0-gray.test.ts --scope=all | 未执行 |
| C2 | payment-lock-p0-concurrency.test.ts | node payment-lock-p0-concurrency.test.ts --scope=all | 未执行 |
| C2 | payment-lock-p0-transaction.test.ts | node payment-lock-p0-transaction.test.ts | 未执行 |
| C3 | payment-lock-p0-lease.test.ts | node payment-lock-p0-lease.test.ts --mode=lease1 | 未执行 |
| 指标 | payment-lock-p0-metrics.test.ts | node payment-lock-p0-metrics.test.ts | 未执行 |

## 2026-11-12 21:30-21:31 · 脚本自测（旧版本，仅验证可执行性）

- 环境：https://lita-payment.test.cinta.team，仍是 TK-0247 版本（旧 inScope：gray-games 1043 命中，A/B 均加锁）
- 目的：验证脚本、公共工具、余额回补、指标解析可执行；**不作为 TK-0250 P0 版本的结论**。
- 配置：旧版本 redis-lock.enabled=true、gray-games=["1043"]、wait-ms=300、lease-ms=3000、fail-fast=true
- 运行与结果：

| 脚本 | 命令 | 结果 | 说明 |
| --- | --- | --- | --- |
| payment-lock-p0-gray.test.ts | --scope=all，并发 10 | done success，9 check 通过，0 fail，0 skip | A/B 各 10 并发，acquireDelta=10/10，余额回补 0.00 |
| payment-lock-p0-concurrency.test.ts | --scope=all，并发 20 | done success，16 check 通过，0 fail，0 skip | 同用户 20 并发 ok=9/busy=11，余额=0.09；BUSY 均未入账；orderNo 唯一 |
| payment-lock-p0-transaction.test.ts | 默认 | done success，6 check 通过，1 skip | 301/302/303/305 通过；304 接口层无法观察提交顺序，skip 并引用 P0-7 |
| payment-lock-p0-lease.test.ts | --mode=lease0 | done success，3 check 通过，0 fail，0 skip | 旧版本 lease=3000，仅验证正常释放路径；**不代表 lease-ms=0 看门狗已验证** |
| payment-lock-p0-metrics.test.ts | 默认 | done success，5 check 通过，0 fail，2 skip | acquire/timeout/标签基数通过；expired/redis_error 未触发，skip |

- 结论：脚本可执行；正式 P0 结论必须在 5a3e2cb 部署后按 C0-C3 重新执行。

## 2026-11-12 22:07:41 · C0 默认关闭正式执行

- 部署版本：lita-payment test 分支 7023656（P0 修复；锁代码与 bot-250-balance-lock-p0 @ 5a3e2cb 逐文件 SHA256 一致）
- 实例：https://lita-payment.test.cinta.team，process_start_time_seconds=1.79449234208E9（22:07:28 重启后）
- Nacos（lita-test / lita-payment-api.yaml）实际配置：enabled=false、wait-ms=300、lease-ms=0、fail-fast=true、fallback-to-db=true、startup-check=WARN、gray-games=["1043"]、gray-biz-list=["gamecenter_baishun1043"]、gray-user-whitelist=[]
- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_TEST_USER_ID=7586 node payment-lock-p0-off.test.ts --evidence-dir=<本机 evidence/C0-off>
- 结果：

```text
[start] {"total":15,"startTime":"2026-11-12T14:07:41.228Z"}
[done]  {"status":"success","total":16,"success":16,"fail":0,"skip":0,"message":"","time":1572,"cost":1572}
```

- 说明：total=16 含 1 个 act；15 个 check 全部通过。add/sub/refund 成功，余额回补 0.00，acquire/expired/redis_error 增量为 0。
- 退出码：0
- 证据：/tmp/opencode/tk251-evidence/C0-off（calls.json、metrics.json、C0-off.log、nacos-C0.yaml）

## 2026-11-12 22:25:45 · C1 灰度语义（白名单 A，biz 配置非空）

- Nacos C1 实际配置：enabled=true、wait-ms=300、lease-ms=0、key-prefix="lock:deal:"、fail-fast=true、fallback-to-db=true、startup-check=WARN、gray-user-whitelist=[7586]、gray-games=["1043"]、gray-biz-list=["gamecenter_baishun1043"]
- 配置生效：2026-11-12 22:25:37 CST
- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 LITA_PAYMENT_NON_GRAY_USER_ID=7587 node payment-lock-p0-gray.test.ts --scope=whitelist
- 结果：

```text
[start] {"total":5,"startTime":"2026-11-12T14:25:45.021Z"}
[check] API-LOCK-101-②：acquireDelta=1，waitAcquiredDelta=1
[check] API-LOCK-102-②：B acquireDelta=0，waitAcquiredDelta=0
[check] API-LOCK-106-①：A=0.00（ok=true），B=0.00（ok=true）
[done]  {"status":"success","total":6,"success":6,"fail":0,"skip":0,"message":"","time":656,"cost":656}
```

- 结论：A=7586 加锁；B=7587 未加锁；gray-games/gray-biz-list 非空但不改变判断，符合 P0-1。
- 证据：/home/ecs-user/work/tk251-evidence/C1-gray

## 2026-11-12 22:25:49 · C1 并发互斥

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 LITA_PAYMENT_NON_GRAY_USER_ID=7587 LITA_PAYMENT_CONCURRENCY=30 node payment-lock-p0-concurrency.test.ts --scope=whitelist
- 结果：

```text
[start] {"total":17,"startTime":"2026-11-12T14:25:49.085Z"}
[check] API-LOCK-206-①：total=30，ok=4，busy=26，other=0
[check] API-LOCK-206-②：余额=0.04（before 0.00 + 0.01×4）
[check] API-LOCK-206-③：acquireDelta=4，ok=4，busy=26，timeoutDelta=26
[check] API-LOCK-206-④：busy=26，timeoutDelta=26
[check] API-LOCK-207-①：ok=4 均可查，busy=26 均 NOT_FOUND，异常=0
[check] API-LOCK-207-②：orderNo 唯一数=4，空值=0
[check] API-LOCK-208-①：A=0.00（ok=true），B=0.00（ok=true）
[done]  {"status":"success","total":18,"success":18,"fail":0,"skip":0,"message":"","time":3312,"cost":3312}
```

- 覆盖：不同 transNo 2 并发、相同 transNo 2 并发（2 笔 OK 同 orderNo，只入账一次）、add+sub、add+refund（refund 只成功一次，原交易 REFUND）、不同用户并发均成功、30 并发快速失败、流水/订单号一致性、数据回补。
- 证据：/home/ecs-user/work/tk251-evidence/C1-concurrency

## 2026-11-12 22:25:55 · C1 事务边界

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 node payment-lock-p0-transaction.test.ts
- 结果：

```text
[start] {"total":7,"startTime":"2026-11-12T14:25:55.089Z"}
[check] API-LOCK-301：余额不足回滚，余额不变；下一笔 add 立即成功
[check] API-LOCK-302：amount=0 参数失败，余额不变；下一笔 add 立即成功
[check] API-LOCK-303：两笔成功，余额 before+0.02
[check] API-LOCK-304：skip（接口层无法观察提交顺序，引用 TK-0250 P0-7）
[check] API-LOCK-305：余额回补 0.00
[done]  {"status":"success","total":8,"success":7,"fail":0,"skip":1,"message":"","time":739,"cost":739}
```

- 说明：304 为接口层证据边界，skip 不等于通过；引用 TK-0250 UserBalanceLockTransactionTest（commit→unlock、rollback→unlock）与 UserBalanceLockRedisIT。
- 证据：/home/ecs-user/work/tk251-evidence/C1-transaction

## 2026-11-12 22:25:59 · C1 lease-ms=0 冒烟

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 node payment-lock-p0-lease.test.ts --mode=lease0
- 结果：

```text
[start] {"total":3,"startTime":"2026-11-12T14:25:59.267Z"}
[check] API-LOCK-401-①：ok=10，busy=0，other=0
[check] API-LOCK-401-②：acquireDelta=10，expiredDelta=0，redisErrorDelta=0
[check] API-LOCK-405-①：余额=0.00，清理 ok=true
[done]  {"status":"success","total":4,"success":4,"fail":0,"skip":0,"message":"","time":595,"cost":595}
```

- 说明：接口层只能证明正常释放无 expired；看门狗长事务不丢锁引用 TK-0250 UserBalanceLockRedisIT.watchdogShouldRenewLeaseWhenLeaseMsIsZero。
- 证据：/home/ecs-user/work/tk251-evidence/C1-lease0

## 2026-11-12 22:26:37 · C1 指标核验（lease1/故障注入未执行）

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** node payment-lock-p0-metrics.test.ts
- 结果：

```text
[start] {"total":6,"startTime":"2026-11-12T14:26:37.232Z"}
[log] acquire=44 acquireFail=26 timeout=26 expired=0 redisError=0
[check] API-LOCK-501-①：acquire/fail/wait 指标可见，acquire=44（success）
[check] API-LOCK-502-①：timeout=26（success）
[check] API-LOCK-501-②：skip（未执行 lease-ms=1ms）
[check] API-LOCK-501-③：skip（未注入 Redis 故障，引用 TK-0252）
[check] API-LOCK-504-①：无 userId/transNo/biz 高基数标签（success）
[check] API-LOCK-502-②：reason 取值=timeout（success）
[done]  {"status":"success","total":7,"success":5,"fail":0,"skip":2,"message":"","time":62,"cost":62}
```

- 说明：expired 需 C3 lease-ms=1ms；redis_error/client_missing 由 TK-0252 故障注入，本任务不重复。
- 证据：/home/ecs-user/work/tk251-evidence/C1-metrics

## 2026-11-12 22:38:24 · C2 空白名单全量加锁

- Nacos C2 读回：enabled=true、gray-user-whitelist=[]、lease-ms=0、wait-ms=300、fail-fast=true、fallback-to-db=true、startup-check=WARN；配置注释为“TK-0251 C2 验证：清空余额锁灰度用户白名单”
- 配置生效：2026-11-12 22:38:15 CST
- 功能确认：B=7587 20 并发 acquireDelta=15、busy=5，空白名单下 B 已加锁，配置在运行实例生效。

### C2 灰度全量

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 LITA_PAYMENT_NON_GRAY_USER_ID=7587 node payment-lock-p0-gray.test.ts --scope=all
- 结果：

```text
[start] {"total":9,"startTime":"2026-11-12T14:38:24.317Z"}
[check] API-LOCK-104-①：B total=20，ok=15，busy=5，other=0
[check] API-LOCK-104-②：B acquireDelta=15，ok=15，busy=5
[check] API-LOCK-104-③：B 余额=0.15（0.00+0.01×15）
[check] API-LOCK-105-①：A total=20，ok=9，busy=11，other=0
[check] API-LOCK-105-②：A acquireDelta=9，ok=9，busy=11
[check] API-LOCK-105-③：A 余额=0.09（0.00+0.01×9）
[check] API-LOCK-106-①：A=0.00，B=0.00
[done]  {"status":"success","total":10,"success":10,"fail":0,"skip":0,"message":"","time":1539,"cost":1539}
```

### C2 并发互斥

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 LITA_PAYMENT_NON_GRAY_USER_ID=7587 LITA_PAYMENT_CONCURRENCY=30 node payment-lock-p0-concurrency.test.ts --scope=all
- 结果：

```text
[start] {"total":17,"startTime":"2026-11-12T14:38:29.257Z"}
[check] API-LOCK-206-①：total=30，ok=8，busy=22，other=0
[check] API-LOCK-206-②：余额=0.08（0.00+0.01×8）
[check] API-LOCK-206-③：acquireDelta=8，ok=8，busy=22，timeoutDelta=22
[check] API-LOCK-206-④：busy=22，timeoutDelta=22
[check] API-LOCK-207-①：ok=8 均可查，busy=22 均 NOT_FOUND，异常=0
[check] API-LOCK-207-②：orderNo 唯一数=8，空值=0
[check] API-LOCK-208-①：A=0.00，B=0.00
[done]  {"status":"success","total":18,"success":18,"fail":0,"skip":0,"message":"","time":2621,"cost":2621}
```

- 覆盖：同用户 2 并发不同/相同 transNo、add+sub、add+refund、不同用户并发、30 并发、流水/订单号一致性、数据回补。
- 证据：/home/ecs-user/work/tk251-evidence/C2-concurrency

### C2 事务边界

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 node payment-lock-p0-transaction.test.ts
- 结果：

```text
[start] {"total":7,"startTime":"2026-11-12T14:38:34.475Z"}
[check] API-LOCK-301：余额不足回滚，余额不变；下一笔 add 立即成功
[check] API-LOCK-302：amount=0 参数失败，余额不变；下一笔 add 立即成功
[check] API-LOCK-303：两笔成功，余额 before+0.02
[check] API-LOCK-304：skip（接口层无法观察提交顺序，引用 TK-0250 P0-7）
[check] API-LOCK-305：余额回补 0.00
[done]  {"status":"success","total":8,"success":7,"fail":0,"skip":1,"message":"","time":875,"cost":875}
```

- 证据：/home/ecs-user/work/tk251-evidence/C2-transaction

## 2026-11-12 22:54:10 · C3 lease-ms=1ms 过期路径

- Nacos C3 读回：enabled=true、wait-ms=300、lease-ms=1、transaction-p99-ms=0、key-prefix="lock:deal:"、fail-fast=true、fallback-to-db=true、startup-check=WARN、gray-user-whitelist=[]、gray-games=["1043"]、gray-biz-list=["gamecenter_baishun1043"]
- 配置生效：2026-11-12 22:54:05 CST
- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 LITA_PAYMENT_LEASE_CONCURRENCY=10 node payment-lock-p0-lease.test.ts --mode=lease1
- 结果：

```text
[start] {"total":5,"startTime":"2026-11-12T14:54:10.721Z"}
[check] API-LOCK-402-①：10 并发 ok=10，busy=0，other=0
[check] API-LOCK-402-②：expiredDelta=10，acquireDelta=10
[check] API-LOCK-402-③：余额=0.10（0.00+0.01×10）
[check] API-LOCK-402-④：过期后后续 add 成功
[check] API-LOCK-405-①：余额回补 0.00
[done]  {"status":"success","total":6,"success":6,"fail":0,"skip":0,"message":"","time":1248,"cost":1248}
```

- 说明：接口层验证 redis_lock_expired 指标增量、业务结果正确、后续请求可继续；ERROR 日志引用 TK-0252/需求方 SLS，不替代接口级结论。
- 证据：/home/ecs-user/work/tk251-evidence/C3-lease1

## 2026-11-12 22:54:15 · C3 指标核验

- 命令：LITA_PAYMENT_TRANS_PASSWORD=*** node payment-lock-p0-metrics.test.ts
- 结果：

```text
[start] {"total":6,"startTime":"2026-11-12T14:54:15.565Z"}
[log] acquire=325 acquireFail=64 timeout=64 expired=14 redisError=0
[check] API-LOCK-501-①：acquire/fail/wait 可见，acquire=325
[check] API-LOCK-502-①：timeout=64
[check] API-LOCK-501-②：expired=14（success）
[check] API-LOCK-501-③：skip（redis_error 需故障注入，引用 TK-0252）
[check] API-LOCK-504-①：无高基数标签
[check] API-LOCK-502-②：reason=timeout
[done]  {"status":"success","total":7,"success":6,"fail":0,"skip":1,"message":"","time":59,"cost":59}
```

- 证据：/home/ecs-user/work/tk251-evidence/C3-metrics

## 2026-11-12 22:59:18 · C4 恢复安全基线

- Nacos C4 读回：enabled=false、wait-ms=300、lease-ms=0、key-prefix="lock:deal:"、fail-fast=true、fallback-to-db=true、startup-check=WARN、gray-games=["1043"]、gray-biz-list=["gamecenter_baishun1043"]、gray-user-whitelist=[]；transaction-p99-ms 实际键已移除（仅注释提及）。
- 配置注释：TK-0251 C4 恢复：余额锁安全基线，enabled=false，移除 transaction-p99-ms，仅测试环境。
- 生效时间：2026-11-12 22:59:18 CST。
- 稳定观察：22:59:30 → 23:01:30（120s）redis_lock_acquire_total 385 → 385，delta=0。
- 余额核对：A=7586 0.00，B=7587 0.0000。
- 结论：测试环境已恢复默认关闭；测试数据已清理。
