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

## 2026-11-12 20:03:55 · 锁开启路径（环境未开启，阻塞）

- 脚本：`tests/payment-redis-lock-on.test.ts`
- 命令：`LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-on.test.ts --evidence-dir=<本机 evidence 目录>`
- 结果：

```text
[start] {"total":10,"startTime":"2026-11-12T12:03:55.325Z"}
[check] 101~108 status=skip message="redis-lock.enabled=false：测试环境未开启 Redis 锁，锁开启路径无法验证"
[done]  {"status":"success","total":8,"success":0,"fail":0,"skip":8,"message":"","time":174,"cost":174}
```

- 结论：8 个锁开启检查点标记 skip（阻塞/未执行），未伪造通过；脚本已就绪，待环境开启后复跑。

## 2026-11-12 20:07:24 · 环境复检

- 操作：对 7586 加钱 0.01（`TK249-PROBE-200724`），查询 `/actuator/prometheus`，再扣钱 0.01 回补。
- 结果：交易成功；Prometheus 仍无 `redis_lock_*` 指标。判定 `redis-lock.enabled` 尚未实际开启。
- 数据：加/扣各 0.01，最终余额 0.00。

---

## 待补充

- 锁开启后的正式执行记录（API-PAY-101~108）。
- 缺陷记录（如发现）。
