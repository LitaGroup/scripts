# 动态类型 live（分享直播间）接口测试

TK-0314 接口测试脚本：验证动态新增类型 `live` 的**发布校验**与**查询填充**，以及兼容与回归。

- 需求：`3724`【PRD】直播间相关优化-w292 → R1「动态新增直播（live）类型」
- 需求整理：`/task/20261117/TK-0310/REQUIREMENTS.md`（v1.0，已冻结）
- 接口文档：`/task/20261117/TK-0314/API.md`
- 用例设计：`/task/20261117/TK-0314/CASES.md`
- 测试报告：`/task/20261117/TK-0314/TEST_REPORT.md`
- 证据：`/task/20261117/TK-0314/EVIDENCE.md`

## 被测接口

| 方法 | 路径 | 变更 |
| --- | --- | --- |
| POST | `/v2/api/moment/publish` | 新增 `momentType=live`：`content.live.roomId>0` 校验、直播间存在性校验、返回填充信息 |
| POST | `/moment/publish` | 同上的兼容路径 |
| GET | `/v2/api/moment/user/list` | 列表返回填充后的 `content.live` |
| GET | `/v2/api/moment/user/one` | 详情返回填充后的 `content.live` |
| GET | `/v2/api/moment/attention/list` | 关注流返回填充后的 `content.live` |
| GET | `/v2/moment/user/list` | 免登版列表，同上 |
| GET | `/v2/moment/info` | 免登版详情，同上 |
| GET | `/v2/moment/user/one` | 免登版详情，同上 |
| GET | `/v2/moment/hotsort/list` | 热门流，同上 |
| GET | `/v2/moment/hotsort/listv2` | 热门流（含房间弹窗），同上 |
| GET | `/litalive/internalcall/localeRooms` | 新增 `noLiveList`（未开播房间），用于发布校验与查询填充的数据源 |

## 测试环境

- 基地址：`https://api.test.cinta.team`（可用 `MOMENT_LIVE_HOST` 覆盖）
- 网关前缀：funbit 客户端接口 `/funbit`，直播服务内部接口 `/litalive`
- 被测分支（三仓库同名 `zjy/live-door-show`）：
  - funbit-api `5663ea5`（功能提交，分支 HEAD `7ebd9b42` 仅新增设计文档）
  - litalive `ffd60ce`
  - lita-public `8be8608`
- 账号：测试环境可登录账号（**不写入仓库**，见下文「测试账号」）

## 目录

```
api-funbit-moment-live/
  README.md                 # 本文件
  COVERAGE.md               # 用例 → 检查点 → 脚本追溯与结果
  RUNS.md                   # 实际执行记录（命令 / 时间 / 统计）
  tests/
    README.md
    lib/moment-live-client.ts       # 真实 HTTP 客户端：留痕、脱敏、限流窗口、账号加载
    moment-live-publish.test.ts     # 发布与参数校验（API-LIVE-001~016）
    moment-live-query.test.ts       # 查询填充与回归（API-LIVE-101~114）
    moment-live-ratelimit.test.ts   # 发布限流（API-LIVE-020）
    door-entry.test.ts              # 补充：同 PRD R2 的入口显示 3/4 边界（API-LIVE-024~026）
```

## 测试账号

凭证不进入仓库，按以下任一方式提供：

1. 环境变量：`MOMENT_LIVE_COUNTRY_CODE` / `MOMENT_LIVE_MOBILE` / `MOMENT_LIVE_VERIFY_CODE`
2. 配置文件：`config.json` 的 `momentLive` 段（仓库根 `config.json` 已在 `.gitignore`），或通过 `LITA_CONFIG_PATH` 指定：

```json
{
  "momentLive": { "countryCode": "**", "mobile": "***", "verifyCode": "***" }
}
```

账号要求：`locale` 为非空大区，且该大区存在至少 1 个在播、1 个未开播直播间（脚本会实时读取 `localeRooms` 选择房间）。

## 运行

```bash
cd projects/feature/api-funbit-moment-live/tests
node moment-live-publish.test.ts
node moment-live-query.test.ts
node moment-live-ratelimit.test.ts
node door-entry.test.ts
```

| 脚本 | 用例 | 说明 |
| --- | --- | --- |
| `moment-live-publish.test.ts` | API-LIVE-001 ~ 016 | 发布成功/失败、边界、兼容路径、字段覆盖、authorId 默认、text 可选 |
| `moment-live-query.test.ts` | API-LIVE-101 ~ 114 | 6 个查询接口填充、批量填充、关注流、热门流、其他类型回归、数字字段兼容、localeRooms 增量 |
| `moment-live-ratelimit.test.ts` | API-LIVE-020 | 单 IP 60 秒 10 次限流（HTTP 304 + 空响应体） |
| `door-entry.test.ts` | API-LIVE-024 ~ 026 | 补充：R2 入口显示 3/4 边界（≥4 显示、3 个不显示、各 locale 一致） |

## 数据与安全

- 动态内容使用 `TK-0314 <场景> <时间戳>` 前缀，便于识别与清理。
- 每个脚本在 `finally` 阶段删除本次创建的全部动态（`POST /v2/api/moment/delete`），并抽查确认已删除。
- 只使用测试环境与本次自建数据；不读写生产。
- 日志中 `AccessToken`、手机号、验证码一律脱敏；不记录 Cookie / 密钥。

## 已知限制

1. **限流**：`/publish` 为单 IP 60 秒 10 次（`@IpLimit`）。脚本内置发布窗口（9 次/61 秒）自动等待；`ratelimit` 脚本故意突破窗口验证 304。
2. **缓存**：直播间数据按大区缓存 2 分钟，`living` 最长约 2 分钟延迟。脚本不构造「开播/下播状态切换」场景（需控制真实直播间状态），按已知限制判定。
3. **热门流批次**：`hotsort` 的数据来自定时批次（近 7 天、`state=pass`、主播为陪玩、grade 0/1）。测试环境批次可能不包含本次新发布的 live 动态，脚本轮询未命中时按「阻塞」记录，不伪造通过。
4. **跨大区/房间删除后的查询**：需要动态 `locale` 与直播间大区不一致（或房间被删除），接口侧无法构造（发布时强校验发布者大区），本次未覆盖。
5. **locale 为空回退**：发布时服务端强制写入发布者 locale，接口侧无法构造空的动态 `locale`，本次未覆盖。
