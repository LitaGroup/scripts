# COVERAGE — 用例 → 检查点 → 脚本 → 结果

- 任务：TK-0314（动态类型 live：发布校验与查询填充）
- 用例设计：`/task/20261117/TK-0314/CASES.md`
- 执行记录：`RUNS.md`；报告：`/task/20261117/TK-0314/TEST_REPORT.md`
- 结果口径：通过 / 未通过 / 阻塞 / 未执行

## 1. 发布接口 — `moment-live-publish.test.ts`

| 用例 | 检查点 | check 标题（脚本内 no.） | 结果 |
| --- | --- | --- | --- |
| API-LIVE-001 | 在播房间发布成功，`content.live` 完整且 `living=true` | no.2 【API-LIVE-001】 | 通过 |
| API-LIVE-002 | 未开播房间发布成功，`living=false` | no.3 【API-LIVE-002】 | 通过 |
| API-LIVE-003 | `anchor_id` 为空回退 `user_id` | no.4 【API-LIVE-003】 | 通过 |
| API-LIVE-004 | `roomId=0` → `live.roomId 传入的值错误` | no.5 【API-LIVE-004】 | 通过 |
| API-LIVE-005 | `content.live` 缺失 → 同上 | no.6 【API-LIVE-005】 | 通过 |
| API-LIVE-006 | `roomId<0` → 同上 | no.7 【API-LIVE-006】 | 通过 |
| API-LIVE-007 | `roomId` 不存在 → `live room not exist` | no.8 【API-LIVE-007】 | 通过 |
| API-LIVE-008 | 跨大区 roomId → `live room not exist` | no.9 【API-LIVE-008】 | 通过 |
| API-LIVE-009 | 未登录 → `status=2 / 未登录` | no.10 【API-LIVE-009】 | 通过 |
| API-LIVE-010 | `content` 缺失 → `必须传入内容!` | no.11 【API-LIVE-010】 | 通过 |
| API-LIVE-011 | `momentType=livex` → `作品类型错误！livex` | no.12 【API-LIVE-011】 | 通过 |
| API-LIVE-012 | `momentType` 缺失 → `作品类型错误！null` | no.13 【API-LIVE-012】 | 通过 |
| API-LIVE-013 | 兼容路径 `/moment/publish` 发布成功 | no.14 【API-LIVE-013】 | 通过 |
| API-LIVE-014 | 请求侧伪造展示字段被服务端覆盖 | no.15 【API-LIVE-014】 | 通过 |
| API-LIVE-015 | `authorId` 缺省/0 归属当前登录用户 | no.16 【API-LIVE-015】 | 通过 |
| API-LIVE-016 | 不传 `content.text` 发布成功 | no.17 【API-LIVE-016】 | 通过 |
| （前置） | 登录 + 读取 localeRooms + 选择房间 | no.1 | 成功 |
| （清理） | 删除本次 7 条动态并抽查 | no.18 | 成功 |

## 2. 查询填充与回归 — `moment-live-query.test.ts`

| 用例 | 检查点 | check 标题（脚本内 no.） | 结果 |
| --- | --- | --- | --- |
| API-LIVE-101 | 登录版用户列表 `content.live` 完整（living=true） | no.2 【API-LIVE-101】 | 通过 |
| API-LIVE-102 | 登录版详情 `/user/one` | no.3 【API-LIVE-102】 | 通过 |
| API-LIVE-103 | 免登版用户列表 | no.4 【API-LIVE-103】 | 通过 |
| API-LIVE-104 | 免登版详情 `/info` | no.5 【API-LIVE-104】 | 通过 |
| API-LIVE-105 | 免登版详情 `/user/one` | no.6 【API-LIVE-105】 | 通过 |
| API-LIVE-106 | 关注流列表 | no.7 【API-LIVE-106】 | 通过 |
| API-LIVE-107 | 在播/未开播两条批量填充 | no.8 【API-LIVE-107】 | 通过 |
| API-LIVE-108 | 热门流 `/hotsort/list` 填充 | no.9 【API-LIVE-108】 | 阻塞（批次未包含本次 live 动态） |
| API-LIVE-109 | 热门流 `/hotsort/listv2` 填充 | no.10 【API-LIVE-109】 | 阻塞（同上） |
| API-LIVE-110 | text 类型发布/查询回归、无 `content.live` | no.11 【API-LIVE-110】 | 通过 |
| API-LIVE-111 | 其他用户历史动态回归 | no.12 【API-LIVE-111】 | 通过 |
| API-LIVE-112 | 数字字段兼容（string/number 可解析） | no.13 【API-LIVE-112】 | 通过 |
| API-LIVE-113 | `localeRooms` 增量字段与 list 原有字段 | no.14 【API-LIVE-113】 | 通过 |
| API-LIVE-114 | 发布响应与查询 `living` 一致 | no.15 【API-LIVE-114】 | 通过 |
| （前置） | 登录 + 发布 2 条 live + 1 条 text | no.1 | 成功 |
| （清理） | 删除本次 3 条动态 | no.16 | 成功 |

## 3. 发布限流 — `moment-live-ratelimit.test.ts`

| 用例 | 检查点 | check 标题（脚本内 no.） | 结果 |
| --- | --- | --- | --- |
| API-LIVE-020 | 连续 12 次发布（roomId=0）：处理次数 ≤10、超限 HTTP 304 空响应、无成功发布 | no.3 【API-LIVE-020-1】 | 通过 |
| API-LIVE-020 | 同上 | no.4 【API-LIVE-020-2】 | 通过 |
| API-LIVE-020 | 同上 | no.5 【API-LIVE-020-3】 | 通过 |

## 4. 补充（同 PRD R2）— `door-entry.test.ts`

| 用例 | 检查点 | check 标题（脚本内 no.） | 结果 |
| --- | --- | --- | --- |
| API-LIVE-024 | 开播数 12（locale=in）→ `openDoor.show=true`、`doorplate.action=voice_room/live` | no.2 【API-LIVE-024】 | 通过 |
| API-LIVE-025 | 开播数 3（locale=zh）→ `openDoor.show=false`、`doorplate=NOT_OPEN_LIVE_ROOM` | no.3 【API-LIVE-025】 | 通过 |
| API-LIVE-026 | 6 个 locale 的 `show` 与实时开播数一致 | no.4 【API-LIVE-026】 | 通过 |

## 5. 未执行用例

| 用例 | 检查点 | 未执行原因 |
| --- | --- | --- |
| API-LIVE-017 | 直播结束后 2 分钟 `living=false` | 需控制真实直播间开播/下播，测试环境不具备 |
| API-LIVE-018 | 跨大区/房间删除查询仅保留 `roomId` | 发布强校验发布者大区，接口侧无法构造该数据 |
| API-LIVE-019 | 动态 `locale` 为空回退发布者 locale | 发布时服务端强制写入发布者 locale，无法构造 |
| API-LIVE-021 | 老客户端未知类型处理 | 客户端渲染行为，接口测试无法验证 |

## 6. 统计

| 指标 | 值 |
| --- | --- |
| 设计用例 | 38（P0 11 / P1 18 / P2 9） |
| 通过 | 32 |
| 未通过 | 0 |
| 阻塞 | 2（API-LIVE-108/109） |
| 未执行 | 4（API-LIVE-017/018/019/021） |
| 执行率 | 32/38 = 84.2% |
| 通过率 | 32/32 = 100% |
