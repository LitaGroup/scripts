# pk-v202808 测试脚本交付说明

## 交付内容

按用例文档 `pk-v202808-backend-self-test-cases`（17 条）编写后端自动化脚本：

| 类型 | 路径 |
|---|---|
| 服务层 | `src/services/Pk202808Service.ts`（接口/消息/MySQL/Redis，biz 隔离） |
| 基类 | `projects/active/pk-v202808/tests/_lib/Pk202808Base.ts` |
| 常量/赛程 | `projects/active/pk-v202808/tests/_lib/constants.ts` |
| 奖励期望 | `projects/active/pk-v202808/tests/_lib/awards.ts`（55 个 awardName，ADD/VIEW 全量） |
| 1v1 编排 | `projects/active/pk-v202808/tests/_lib/PkStageRunner.ts` |
| 用例 | `projects/active/pk-v202808/tests/001~017-*.test.ts` |
| 说明 | `projects/active/pk-v202808/README.md`、`fixtures.example.json` |
| 基类接入 | `src/base/TestBaseClass.ts` 增加 `pk` getter |

时间口径：2026→2028；活动北京时间 2028-08-17 14:00:00 ~ 2028-08-29 23:59:59；
阶段/日榜/1v1 按大区本地时间；决赛统一按绝对结束时刻收尾。

## 验证结果

- `node --check`：新增 21 个 `.ts` 文件全部通过语法检查。
- `tsc --noEmit --strict`：新增代码无类型错误（仅仓库既有的 `RedisTestResource` ioredis 类型告警）。
- 试运行 001：脚本正常输出 `start/act/check/done`，在读取 `config.json` 时失败
  （仓库未提供测试库凭据，属预期）。

## 执行状态：未执行（阻塞）

1. 测试环境未注册新 biz：`POST https://api.test.cinta.team/active/v3/pk-v202808/detail`
   返回 `{"status":1,"msg":"Active not found"}`。技术方案状态亦为“设计稿，未开发、未配置”。
2. 本地没有 `config.json`（测试环境 MySQL/Redis 直连凭据），无法查库、造数、结算。
3. 有效陪玩/家族成员等 fixtures 未提供；脚本在缺失时按步骤 `skip` 并说明原因。

因此本次**不产出测试通过结论**，也没有创建缺陷。待环境部署 `pk-v202808`、导入奖励配置并
提供 fixtures 后，按 README 的顺序即可执行。

## 覆盖与偏差

- 覆盖 17 条用例主链：五类榜单、32 模块轮次、奖励全量 diff、消息幂等/时间边界、身份与阶段/PK Buff、
  阶段晋级/继承/复活/1v1/全球家族榜、查询接口与结算对账。
- 陪玩订单消息按 `funbit.play_order_status_log` 与 `transNo/userId/playerId/amount/mainStatus/finishTime`
  实现；若提测契约不同，仅需改 `sendOrderStatus`。
- 001 的奖励 diff 以需求奖励表为准构建期望（466 条 ADD + 42 条 VIEW 口径）；VIEW 中 CUSTOM 占位 ID
  以最终奖励 SQL 设计稿为准。
- 014 的“结算前新增/移出家族成员”快照场景未自动化（需写 `family_user` 造数），其余阶段全员/本体
  奖励、名单数量、全球榜来源 topic 已覆盖。
- 006~011 依赖 201/101 名有效陪玩 fixtures；缺失时跳过并提示，不伪造结果。

## 运行

```bash
cd <repo-root>
export PK_FIXTURES=projects/active/pk-v202808/fixtures.json
node projects/active/pk-v202808/tests/001-config-init.test.ts
# 001 → 002/003 → 004/005 → 006 ... 011 → 012/013 → 014/015 → 016 → 017
```