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
| API-PAY-101 | P0 | 锁已开启且写入口产生指标 | 101-① | Prometheus 含 `redis_lock_acquire_total` 或 `redis_lock_wait_ms` | 阻塞（环境未开启） |
| API-PAY-102 | P0 | 同用户 80 并发 | 102-①~② | 仅 OK / R_FREQUENT_ACCESS 400005；至少 1 笔 busy | 阻塞（环境未开启） |
| API-PAY-103 | P0 | busy 请求不落账 | 103-① | busy transNo 的 getTransResult=NOT_FOUND | 阻塞（环境未开启） |
| API-PAY-104 | P0 | 余额与成功笔数一致 | 104-① | 余额=基线+0.01×成功笔数 | 阻塞（环境未开启） |
| API-PAY-105 | P1 | 批次后锁释放 | 105-① | 普通加钱立即成功 | 阻塞（环境未开启） |
| API-PAY-106 | P1 | busy 流水号重试 | 106-①~② | 同一 transNo 重试成功且只入账一次 | 阻塞（环境未开启） |
| API-PAY-107 | P1 | 快速失败指标 | 107-① | `redis_lock_acquire_fail{reason=timeout}` 计数>0 | 阻塞（环境未开启） |
| API-PAY-108 | P0 | 数据回补 | 108-① | 余额=基线 | 阻塞（环境未开启） |

锁开启路径合计 **10 个检查点，0 通过，0 失败，10 阻塞/未执行**（2026-11-12 20:04 环境探测；待环境开启后复跑）。

## 未覆盖说明

- Redis 故障降级、`fallback-to-db=false` 的 `BALANCE_LOCK_UNAVAILABLE`、看门狗续期、锁过期：需注入基础设施故障，本接口测试不 mock 被测服务，由 TK-0247 单元测试覆盖（TECH_DESIGN §10）。
- 性能/容量/499 指标：不属于本次接口测试范围（任务定义排除性能压测）。
- 生产环境：不测试。
