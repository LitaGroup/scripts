# tests — 动态 live 类型接口用例

## 覆盖功能点

| 脚本 | 用例编号 | 覆盖内容 |
| --- | --- | --- |
| `moment-live-publish.test.ts` | API-LIVE-001 ~ 016 | 发布 live（在播/未开播）、anchorId 回退、roomId=0/负数/缺失/不存在/跨大区、未登录、content 缺失、momentType 非法/缺失、兼容路径 `/moment/publish`、伪造展示字段被覆盖、authorId 默认、content.text 可选 |
| `moment-live-query.test.ts` | API-LIVE-101 ~ 114 | 登录版列表/详情、免登版列表/详情/`user/one`、关注流、批量填充、热门流 list/listv2、text 回归、其他用户历史动态回归、数字字段兼容、`localeRooms` 增量字段、发布与查询 living 一致 |
| `moment-live-ratelimit.test.ts` | API-LIVE-020 | 单 IP 60 秒 10 次限流（HTTP 304 + 空响应体），非法内容不产生成功发布 |
| `door-entry.test.ts` | API-LIVE-024 ~ 026 | 补充（同 PRD R2）：开播数 ≥4 显示入口、3 个不显示、各 locale 判断与实时数量一致 |

每个 `check` 的标题带用例编号，与 `COVERAGE.md` 和任务文档 `CASES.md` 一一对应。

## 执行方式

```bash
# 在测试目录下执行
cd projects/feature/api-funbit-moment-live/tests
node moment-live-publish.test.ts
node moment-live-query.test.ts
node moment-live-ratelimit.test.ts
node door-entry.test.ts
```

输出协议：`start` / `act` / `check` / `done`（每行 JSON，见仓库 AGENTS.md）。

## 依赖与环境

- Node.js 24+（原生 TypeScript 直跑，无构建步骤）、ESM。
- 测试环境：`https://api.test.cinta.team`（`MOMENT_LIVE_HOST` 可覆盖）。
- 账号：`MOMENT_LIVE_COUNTRY_CODE` / `MOMENT_LIVE_MOBILE` / `MOMENT_LIVE_VERIFY_CODE`，或 `config.json` 的 `momentLive` 段（凭证不提交）。
- 直播间数据：`GET /litalive/internalcall/localeRooms?locale=<账号 locale>`，脚本自动选择：
  - 在播房间：`list` 中 `anchorId>0` 且 `tagName` 非空
  - 未开播房间：`noLiveList` 中 `tagName` 非空
  - anchorId 回退：`list` 中 `anchorId=0` 的房间（无则用例标记阻塞）
  - 跨大区：其他 locale 的第一个房间（无则用例标记阻塞）

## 注意事项

1. **限流**：发布接口 10 次/60 秒/IP。`lib/moment-live-client.ts` 的 `RateWindow` 在 9 次后等待窗口重置；`ratelimit` 脚本故意不等待以验证 304。
2. **免登查询接口**：`/v2/moment/{user/list,info,user/one,hotsort/list,hotsort/listv2}` 均为 5 次/30 秒/IP，脚本控制调用次数。
3. **数据清理**：每个脚本 `finally` 删除本次创建的动态并抽查；若删除失败会在 `act` 中显式失败。
4. **阻塞不伪造**：热门流批次未包含 live 动态时，用例标记 `skip`（阻塞）并在报告中说明，不改为条件断言。
5. **不修改业务代码、不 mock 被测接口**：全部为真实 HTTP 调用。
