# 用例 → 检查点追溯（TK-0249 / TK-0247）

- 被测变更：lita-payment 余额变更接口 Redis 单写者锁
- 接口文档：`/task/20261112/TK-0247/API`
- 技术方案：`/task/20261112/TK-0247/TECH_DESIGN`
- 脚本：`tests/payment-redis-lock-off.test.ts`、`tests/payment-redis-lock-on.test.ts`

## 变更接口与影响面

| 接口 | 变更类型 | 风险 | 覆盖 |
| --- | --- | --- | --- |
| POST `/litapayment/global/trans/addAccountMoney` | 修改（加锁） | 高 | API-PAY-001/007/008/010/011/012 |
| POST `/litapayment/global/trans/subAccountMoney` | 修改（加锁） | 高 | API-PAY-002/009/010/011/012 |
| POST `/litapayment/global/trans/refund` | 修改（加锁） | 高 | API-PAY-003/013 |
| POST `/litapayment/global/trans/getTransResult` | 只读，影响面 | 中 | API-PAY-001/002/003/103 |
| POST `/litapayment/global/trans/getAmountByBiz` 等只读 | 只读，影响面 | 低 | API-PAY-014 |
| 鉴权（password/passwordVersion） | 不变 | 高 | API-PAY-004/005/006 |

## 锁关闭路径（默认 `redis-lock.enabled=false`）

| 用例 | 优先级 | 场景 | 检查点 | 预期 | 结果 |
| --- | --- | --- | --- | --- | --- |
| API-PAY-001 | P0 | addAccountMoney 成功 | 001-①~④ | state/data.status=OK，余额 +0.01，订单号含 biz_userId_transNo，getTransResult=OK | 通过（4/4） |
| API-PAY-002 | P0 | subAccountMoney 成功 | 002-①~④ | state/data.status=OK，deduct=0.01，余额 -0.01，getTransResult=OK | 通过（4/4） |
| API-PAY-003 | P0 | refund 成功 | 003-①~③ | state/data.status=OK，余额恢复，getTransResult=REFUND | 通过（3/3） |
| API-PAY-004 | P0 | 缺少 password 头 | 004-①~② | R_OPERATION_FAIL/400002，余额不变 | 通过（2/2） |
| API-PAY-005 | P0 | password 错误 | 005-①~② | R_OPERATION_FAIL/400002，余额不变 | 通过（2/2） |
| API-PAY-006 | P1 | passwordVersion=2 | 006-①~② | R_OPERATION_FAIL/400002，余额不变 | 通过（2/2） |
| API-PAY-007 | P1 | amount=0 | 007-①~② | FAIL，提示 amount 必须大于 0，余额不变 | 通过（2/2） |
| API-PAY-008 | P1 | amount=-1 | 008-①~② | FAIL，提示 amount 必须大于 0，余额不变 | 通过（2/2） |
| API-PAY-009 | P0 | 余额不足 | 009-①~② | LESS_MONEY/no account is available，余额不变 | 通过（2/2） |
| API-PAY-010 | P1 | biz 缺失 | 010-①~② | FAIL/biz 业务类型必填，余额不变 | 通过（2/2） |
| API-PAY-011 | P1 | transNo 缺失 | 011-①~② | FAIL/transNo 交易流水号必填项，余额不变 | 通过（2/2） |
| API-PAY-012 | P1 | 相同 transNo 重复加钱 | 012-①~④ | 首次 OK，重复返回同一 orderNo，不重复入账 | 通过（4/4） |
| API-PAY-013 | P1 | 退款不存在的交易 | 013-①~② | NOT_FOUND/交易未成功，余额不变 | 通过（2/2） |
| API-PAY-014 | P1 | 只读接口一致性 | 014-①~④ | getAccountMap/getAccountMapByBiz/getAmountByDealTypes 与 getAmountByBiz 一致 | 通过（4/4） |
| API-PAY-015 | P0 | 数据回补 | 015-① | 测试结束余额=基线 0.00 | 通过（1/1） |

锁关闭路径合计 **38 个检查点，38 通过，0 失败，0 跳过**。

## 锁开启路径（需环境开启 `redis-lock`）

| 用例 | 优先级 | 场景 | 检查点 | 预期 | 结果 |
| --- | --- | --- | --- | --- | --- |
| API-PAY-101 | P0 | 锁已开启且写入口产生指标 | 101-① | Prometheus 含 `redis_lock_acquire_total` 或 `redis_lock_wait_ms` | 通过（1/1） |
| API-PAY-102 | P0 | 同用户 80 并发 | 102-①~② | 仅 OK / R_FREQUENT_ACCESS 400005；至少 1 笔 busy | 通过（2/2，ok=8/busy=72/other=0） |
| API-PAY-103 | P0 | busy 请求不落账 | 103-① | busy transNo 的 getTransResult=NOT_FOUND | 通过（1/1，72/72） |
| API-PAY-104 | P0 | 余额与成功笔数一致 | 104-① | 余额=批次前+0.01×成功笔数 | 通过（1/1，0.09=0.01+0.08） |
| API-PAY-105 | P1 | 批次后锁释放 | 105-① | 普通加钱立即成功 | 通过（1/1） |
| API-PAY-106 | P1 | busy 流水号重试 | 106-①~② | 同一 transNo 重试成功且只入账一次 | 通过（2/2） |
| API-PAY-107 | P1 | 快速失败指标 | 107-① | `redis_lock_acquire_fail{reason=timeout}` 计数>0 | 通过（1/1，count=147） |
| API-PAY-108 | P0 | 数据回补 | 108-① | 余额=基线 | 通过（1/1，0.00） |

锁开启路径合计 **10 个检查点，10 通过，0 失败，0 跳过**（2026-11-12 20:18 环境开启后执行）。

## 总计

- 用例：23 条（锁关闭 15 + 锁开启 8），全部执行。
- 检查点：48 个（锁关闭 38 + 锁开启 10），48 通过，0 失败，0 阻塞，0 未执行。
- 说明：2026-11-12 20:18:45 首次锁开启运行出现 1 个失败，归因为脚本漏算前置 setup 的 0.01，**非产品缺陷**；修正后 20:18:59 复跑 10/10 通过。记录见 RUNS.md。

## 未覆盖说明

- Redis 故障降级、`fallback-to-db=false` 的 `BALANCE_LOCK_UNAVAILABLE`、看门狗续期、锁过期：需注入基础设施故障，本接口测试不 mock 被测服务，由 TK-0247 单元测试覆盖（TECH_DESIGN §10）。
- 性能/容量/499 指标：不属于本次接口测试范围（任务定义排除性能压测）。
- 生产环境：不测试。


---

# TK-0251 用例 → 检查点 → 脚本追溯

- 被测变更：TK-0250 lita-payment 余额 Redis 锁 P0 审计整改（bot-250-balance-lock-p0 @ 5a3e2cb）
- 用例设计：/task/20261112/TK-0251/CASES.md
- 测试环境：https://lita-payment.test.cinta.team
- 用户：A=7586（白名单），B=7587（非白名单）
- 业务：gamecenter_baishun1043
- 说明：本表是代码中的检查点清单；正式执行结果在 TEST_REPORT.md / RUNS.md 中按运行记录统计，未执行不写“通过”。

## 1. 默认关闭（C0，enabled=false）

脚本：tests/payment-lock-p0-off.test.ts

| 用例 | 检查点 | check 标题 | 结果 |
| --- | --- | --- | --- |
| API-LOCK-001 | 001-① | enabled=false 时 addAccountMoney 成功 | 待执行 |
| API-LOCK-001 | 001-② | 加钱后余额增加 0.01 | 待执行 |
| API-LOCK-001 | 001-③ | 默认关闭不产生 acquire/expired/redis_error 指标增量 | 待执行 |
| API-LOCK-001 | 001-④ | 加钱交易可查询且为 OK | 待执行 |
| API-LOCK-002 | 002-① | enabled=false 时 subAccountMoney 成功 | 待执行 |
| API-LOCK-002 | 002-② | 扣钱后余额减少 0.01 | 待执行 |
| API-LOCK-002 | 002-③ | 默认关闭不产生 acquire/expired/redis_error 指标增量 | 待执行 |
| API-LOCK-002 | 002-④ | 扣钱交易可查询且为 OK | 待执行 |
| API-LOCK-003 | 003-① | enabled=false 时 refund 成功 | 待执行 |
| API-LOCK-003 | 003-② | 退款后余额恢复到扣钱前 | 待执行 |
| API-LOCK-003 | 003-③ | 默认关闭不产生 acquire/expired/redis_error 指标增量 | 待执行 |
| API-LOCK-003 | 003-④ | 原扣钱交易状态变为 REFUND | 待执行 |
| API-LOCK-004 | 004-① | 默认关闭时同用户 2 并发 add 均成功且无 BUSY | 待执行 |
| API-LOCK-004 | 004-② | 2 并发 add 后余额准确增加 0.02 | 待执行 |
| API-LOCK-005 | 005-① | 默认关闭阶段结束余额回补至基线 | 待执行 |

小计：15 个检查点。

## 2. 灰度语义（C1/C2，P0-1）

脚本：tests/payment-lock-p0-gray.test.ts

| 用例 | 检查点 | check 标题 | 适用模式 | 结果 |
| --- | --- | --- | --- | --- |
| API-LOCK-101 | 101-① | 白名单用户 A 的 add 成功 | C1/C2 | 待执行 |
| API-LOCK-101 | 101-② | A 请求产生加锁指标增量 | C1/C2 | 待执行 |
| API-LOCK-102 | 102-① | 非白名单用户 B 的 add 成功 | C1 | 待执行 |
| API-LOCK-102 | 102-② | B 请求不产生 acquire 增量（biz 灰度配置不参与） | C1 | 待执行 |
| API-LOCK-104 | 104-① | 空白名单时 B 并发结果仅为 OK 或 BUSY | C2 | 待执行 |
| API-LOCK-104 | 104-② | B 请求产生加锁指标增量且覆盖成功笔数 | C2 | 待执行 |
| API-LOCK-104 | 104-③ | B 并发后余额与成功笔数一致 | C2 | 待执行 |
| API-LOCK-105 | 105-① | 空白名单时 A 并发结果仅为 OK 或 BUSY | C2 | 待执行 |
| API-LOCK-105 | 105-② | A 请求产生加锁指标增量且覆盖成功笔数 | C2 | 待执行 |
| API-LOCK-105 | 105-③ | A 并发后余额与成功笔数一致 | C2 | 待执行 |
| API-LOCK-106 | 106-① | 灰度阶段结束 A/B 余额回补至基线 | C1/C2 | 待执行 |

小计：白名单模式执行 5 个检查点；全量模式执行 9 个检查点。

## 3. 并发互斥（C1/C2，P0-4/P0-7）

脚本：tests/payment-lock-p0-concurrency.test.ts

| 用例 | 检查点 | check 标题 | 结果 |
| --- | --- | --- | --- |
| API-LOCK-201 | 201-① | 同用户 2 并发 add（不同 transNo）仅返回 OK 或 BUSY | 待执行 |
| API-LOCK-201 | 201-② | 余额与成功笔数一致且 BUSY 未入账 | 待执行 |
| API-LOCK-202 | 202-① | 相同 transNo 2 并发最多一笔成功或复用同一订单号 | 待执行 |
| API-LOCK-202 | 202-② | 相同 transNo 并发只入账一次 | 待执行 |
| API-LOCK-203 | 203-① | 同用户并发 add+sub 仅返回 OK 或 BUSY，且至少一笔执行 | 待执行 |
| API-LOCK-203 | 203-② | add+sub 并发后余额精确且不为负 | 待执行 |
| API-LOCK-204 | 204-① | 同用户并发 add+refund 仅返回 OK 或 BUSY | 待执行 |
| API-LOCK-204 | 204-② | add+refund 并发后余额精确且退款状态正确 | 待执行 |
| API-LOCK-205 | 205-① | 不同用户并发 add 均成功且无 BUSY | 待执行 |
| API-LOCK-205 | 205-② | 不同用户各自余额准确增加 0.01 | 待执行 |
| API-LOCK-206 | 206-① | 同用户 30 并发 add 结果仅为 OK 或 BUSY | 待执行 |
| API-LOCK-206 | 206-② | 高并发后余额等于基线加成功笔数金额 | 待执行 |
| API-LOCK-206 | 206-③ | 高并发期间锁指标增量覆盖成功笔数 | 待执行 |
| API-LOCK-207 | 207-① | 并发后 OK 交易可查、BUSY 交易未入账 | 待执行 |
| API-LOCK-207 | 207-② | 并发成功后 orderNo 无重复 | 待执行 |
| API-LOCK-208 | 208-① | 并发阶段结束 A/B 余额回补至基线 | 待执行 |

小计：16 个检查点。

## 4. 事务边界（C1/C2，P0-4）

脚本：tests/payment-lock-p0-transaction.test.ts

| 用例 | 检查点 | check 标题 | 结果 |
| --- | --- | --- | --- |
| API-LOCK-301 | 301-① | 余额不足导致业务回滚且余额不变 | 待执行 |
| API-LOCK-301 | 301-② | 回滚后锁已释放，下一笔 add 立即成功 | 待执行 |
| API-LOCK-302 | 302-① | amount=0 参数失败且余额不变 | 待执行 |
| API-LOCK-302 | 302-② | 参数失败后锁已释放，下一笔 add 立即成功 | 待执行 |
| API-LOCK-303 | 303-① | 成功响应后下一笔 add 可立即获取锁 | 待执行 |
| API-LOCK-304 | 304-① | 锁释放发生在事务提交之后（接口层 skip，引用 P0-7） | 待执行（预计 skip） |
| API-LOCK-305 | 305-① | 事务边界阶段结束余额回补至基线 | 待执行 |

小计：7 个检查点（其中 1 个接口层 skip）。

## 5. 租约与过期（C1/C3，P0-5）

脚本：tests/payment-lock-p0-lease.test.ts

| 用例 | 检查点 | check 标题 | 适用模式 | 结果 |
| --- | --- | --- | --- | --- |
| API-LOCK-401 | 401-① | lease-ms=0 时连续 10 笔 add 全部成功且无 BUSY | lease0 | 待执行 |
| API-LOCK-401 | 401-② | lease-ms=0 正常释放不产生 expired 指标 | lease0 | 待执行 |
| API-LOCK-402 | 402-① | lease-ms=1ms 并发 add 仅返回 OK 或 BUSY | lease1 | 待执行 |
| API-LOCK-402 | 402-② | 固定短租约触发 redis_lock_expired 指标增量 | lease1 | 待执行 |
| API-LOCK-402 | 402-③ | 过期路径下业务结果正确、余额与成功笔数一致 | lease1 | 待执行 |
| API-LOCK-402 | 402-④ | 过期后后续请求仍可继续成功 | lease1 | 待执行 |
| API-LOCK-405 | 405-① | 租约阶段结束余额回补至基线 | lease0/lease1 | 待执行 |

小计：lease0 执行 3 个检查点；lease1 执行 5 个检查点。

## 6. 指标与告警（C1-C3）

脚本：tests/payment-lock-p0-metrics.test.ts

| 用例 | 检查点 | check 标题 | 结果 |
| --- | --- | --- | --- |
| API-LOCK-501 | 501-① | 核心锁指标可见（acquire/acquire_fail/wait_ms） | 待执行 |
| API-LOCK-501 | 501-② | 锁过期指标可见（lease-ms=1ms 阶段后） | 待执行（无 C3 则 skip） |
| API-LOCK-501 | 501-③ | Redis 异常指标可见（需故障注入） | 待执行（预计 skip，引用 TK-0252） |
| API-LOCK-502 | 502-① | timeout 失败原因可区分 | 待执行 |
| API-LOCK-502 | 502-② | 不同失败原因使用不同 reason 标签值 | 待执行 |
| API-LOCK-504 | 504-① | 指标标签不含 userId/transNo/biz 等高基数字段 | 待执行 |

小计：6 个检查点（其中 1-2 个可能因故障注入缺失 skip）。

## 7. 汇总

- 检查点定义：62 个（按脚本中的 check 标题去重统计）。
- 单轮全量执行（C1+C2+C3 各跑一次）会重复执行共享检查点，报告按实际运行输出统计，不把同一检查点的多次运行混算为不同用例。
- 用例：25 个编号（001-005、101/102/104/105/106、201-208、301-305、401/402/405、501/502/504）。
- 全局清理 API-LOCK-901 在 TEST_REPORT.md 中按 A/B 基线核对，不单独计 check。

## 8. 状态说明

- 当前全部为“待执行”，因为 TK-0250 修复尚未部署、配置窗口未到。
- 正式执行后，本表“结果”列按通过/未通过/阻塞/未执行四态更新；skip 必须写原因，不改为通过。
