# 年度回忆接口测试用例设计（TK-0391）

- 被测变更：TK-0378「年度回忆后端接口与数据表开发」（实现子任务 TK-0386、配置发布 TK-0387）
- 需求来源：PRD `#3399`、需求澄清 `#3454`（C00–C32）
- 契约来源：TK-0383 `API.md` / `TECH_DESIGN.md`（v2.2 配置复用版）、TK-0386 `API.md`
- 数据契约：TK-0317 交付 stats 宽表 `lita_2026_year_in_review`（61 列，主键 `id`=用户 UID）
- 测试环境：`https://api.test.cinta.team`
- 时间模拟：`l-debug-timestamp`；登录/大区：`l-user-id` / `l-user-locale`

## 一、变更接口清单

| 接口 | Method + Path | 变更类型 | 鉴权 | 风险 | 关联需求 |
| --- | --- | --- | --- | --- | --- |
| 获取年度回忆（完整 biz） | `POST /active/v3/annual-review-v202612/get` | 新增（配置驱动） | 必须登录 | P0 | PRD 全部 21 页 |
| 获取年度回忆（alias） | `POST /active/v3/annual-review/get` | 新增（Nacos `init.alias`） | 必须登录 | P0 | TK-0383 第三次验收「双路径兼容」 |
| 活动配置（完整 biz） | `POST /active/v3/annual-review-v202612/config` | 新增（框架内置） | 无 | P2 | 前端可选 |
| 活动配置（alias） | `POST /active/v3/annual-review/config` | 新增（alias 解析） | 无 | P2 | 前端可选 |

## 二、影响面清单

| 影响对象 | 影响方式 | 验证方式 |
| --- | --- | --- |
| `anniversary-v202608`（六周年） | 共用 `AnniversaryActive` + `ReportModule`，`main.yaml` 合并 `businesses/alias` | `/config`、`/get` 回归 |
| `pk-v202608` 等其它活动 | `main.yaml` 注册表变更 | `/config` 回归 |
| `main.yaml` alias 解析 | 新增 `annual-review` 前缀，可能解析冲突 | 完整/短路径响应一致；多期匹配异常未出现 |
| stats 数据源 | 新表 `lita_2026_year_in_review`，`field=id` | `report.user.id` 与登录用户一致、61 列契约 |

## 三、用例总览

优先级：P0 = 主流程/关键权限/关键契约；P1 = 重要分支与边界；P2 = 辅助接口与健壮性。

| 用例编号 | 场景 | 优先级 | 前置 | 预期（依据） |
| --- | --- | --- | --- | --- |
| API-ANNIV-001 | 完整路径主流程 | P0 | 活动期内、用户 21、in | HTTP 200、status=0、data 含 report+player、report.user 为当前用户行（API.md §1.1/§2） |
| API-ANNIV-002 | 双路径一致性 | P0 | 同上 | 完整路径与短路径 status/msg/data 深度相等（TK-0383 双路径要求） |
| API-ANNIV-003 | 61 列契约与类型 | P0 | 同上 | 61 个文档字段无缺失；数值=number、字符串=string、is_player=boolean；日期允许 string/number（API.md §3） |
| API-ANNIV-004 | 用户身份一致性 | P0 | 同上 | `report.user.id`=`player.id`=登录用户；`player.createTime`（+08:00 日期）与 `register_date` 一致 |
| API-ANNIV-005 | player 结构 | P1 | 同上 | 含 name/id/no/avatar/type/status/createTime/isHost（API.md §2.1；isPlayer 为 null 时可缺省） |
| API-ANNIV-006 | 只读幂等 | P1 | 同上 | 连续两次调用响应完全一致（API.md §1.1「幂等」） |
| API-ANNIV-010 | 未登录 | P0 | 活动期内 | status=1、msg=`User need login first`、data=null；用户 ID=0 同（API.md §4） |
| API-ANNIV-011 | 越权查询 | P0 | 登录用户 21 | body 传 `userId/id=8` 不生效，仍返回 21，响应与空 body 一致（API.md §1.1、§7.4） |
| API-ANNIV-012 | 六个启用大区 | P1 | 活动期内 | in/vi/th/ko/zh/ph 均返回同一 report.user（config enableLocales） |
| API-ANNIV-013 | 未启用大区 | P1 | 活动期内 | ar/en 返回 status=0、report={}、player 正常（API.md §4） |
| API-ANNIV-014 | 未启用大区双路径 | P2 | 同上 | 短路径与完整路径一致 |
| API-ANNIV-020 | 活动时间边界 | P0 | 用户 21 | 2026-12-14 00:00:00 与 2027-12-31 23:59:59（含）返回 report.user（Nacos 配置） |
| API-ANNIV-021 | 开始前容错 | P1 | 同上 | 开始前 1 秒、开始前整 7 天 → status=0、report={}；7 天+1 秒 → status=1、`Activity is not active`（API.md §4 + 框架 7 天容错） |
| API-ANNIV-022 | 结束后容错 | P1 | 同上 | 结束后 1 秒、结束后整 7 天 → status=0、report={}；7 天+1 秒 → status=1、`Activity is not active` |
| API-ANNIV-023 | 容错窗口双路径 | P1 | 同上 | 活动期内两路径一致；超容错窗口两路径均 status=1（文案差异记为观察项） |
| API-ANNIV-030 | 完整路径配置 | P1 | — | biz=annual-review-v202612、startTime=1797177600000、finishTime=1830268799000、6 大区 |
| API-ANNIV-031 | 短路径配置 | P2 | 活动期内 | status=0，时间与大区与完整路径一致（biz 返回路径别名） |
| API-ANNIV-032 | 六周年回归 | P1 | — | anniversary-v202608 `/config` 正常；`/get`（2026-08-20）status=0 且 report.user 非空 |
| API-ANNIV-033 | PK 活动回归 | P1 | — | pk-v202608 `/config` status=0 且 biz 正确 |
| API-ANNIV-034 | 路径与方法 | P2 | 活动期内 | 未知子路径 → status=1 `Method not found`；GET → 非 200 |
| API-ANNIV-040 | 宽表无行 | P1 | 用户 999999999 | status=0、report={}、player 为对象；短路径一致（API.md §4） |
| API-ANNIV-041 | 请求体边界 | P2 | 用户 21 | 无 body 可用；未知字段被忽略，响应与 `{}` 一致（API.md §1.1） |
| API-ANNIV-043 | 多次幂等 | P1 | 用户 21 | 连续 3 次 status/msg/data 完全一致 |
| API-ANNIV-044 | 请求隔离 | P2 | — | 无数据用户请求后查询有数据用户不受影响 |
| API-ANNIV-050-00 ~ 20 | PRD 21 页字段覆盖 | P0（P0/P19/P20 关键） | 用户 21 | 每页所需 `report.user` 字段全部存在（PRD 第二章 + API.md §5） |
| API-ANNIV-051 | 身份 code 合法性 | P1 | 用户 8/11/14/21/28 | `identity_code` 属于文档 12 个 code（API.md §3.8） |
| API-ANNIV-052 | 身份名称一致 | P1 | 同上 | `identity_name` 与 code 对应名称一致 |
| API-ANNIV-053 | 身份优先级一致 | P1 | 同上 | `identity_priority` 与 code 对应优先级一致（1 最高） |
| API-ANNIV-054 | 枚举一致性 | P2 | 同上 | `active_time` 属于四个时段；关系类型属于 cp/friend/bestie/brother/family（无样本时 skip，数据口径见 TK-0379） |

## 四、明确不在本次接口测试范围

| 项 | 责任方 / 说明 |
| --- | --- |
| stats 宽表 61 列取数口径、数据完整性、主键唯一性 | 数据测试任务 TK-0379 |
| 身份卡 8/9/10 CASE 顺序（Q04 待确认） | 数据侧 TK-0317，按 Q04 结论修正 |
| 昵称/头像、被引用用户 ID 解析、注销跳过、多语言文案 | 前端 TK-0381（需求方已确认前端具备该能力） |
| 分享/保存/二维码/埋点 | 客户端与前端 |
| 真实网关 APISIX 签名 + 真实用户 Token 链路 | 测试环境网关需签名；本次使用框架测试头验证应用层契约 |
| 生产环境 | 禁止调用 |

## 五、测试数据

| 用户 ID | 用途 | 说明 |
| --- | --- | --- |
| 21 | 主用例 | 宽表有行，chat/order/gift/voice/identity 有值 |
| 2 | 官方账号 | 宽表有行，仅基础/礼物字段 |
| 999999999 | 空数据 | 宽表无行 |
| 8/11/14/21/28 | 身份卡一致性抽查 | 宽表有 `identity_*` 数据 |

数据为只读查询，本套用例不写入、不造数、不清理。
