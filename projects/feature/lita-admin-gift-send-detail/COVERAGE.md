# 需求覆盖追溯（项目 141 / 提测 34）

需求来源：`/api/docs/detail/project/141/document/143.md`、接口文档 `/api/documents/3375.md`。
执行环境：`https://admin.test.lita.game`（UI）、`https://api.test.cinta.team`（data-main 测试网关）。

| # | 需求/测试范围 | 测试点 | 脚本 | 断言要点 | 结果 |
|:--|:---|:---|:---|:---|:---|
| 1 | 页面加载 | 标题、路由、7 个筛选项、按钮、初始空表/分页 | `page-validation` | 标题含「送礼详情」；labels=`开始日期*|结束日期*|送礼用户ID|接收用户ID|礼物ID|语言区|房间ID`；rows=0；分页禁用；无自动 query | 通过 |
| 2 | 日期必填 | 开始/结束日期为空 | `page-validation`、`export` | 「请选择开始日期」「请选择结束日期」；query/download 新增 0 | 通过 |
| 3 | 三选一 | 仅日期+语言区、仅日期+房间ID 查询/导出 | `page-validation`、`export` | 「送礼用户ID、接收用户ID、礼物ID 至少填写一项」；不发请求/下载 | 通过 |
| 4 | 正常查询 | 送礼人、收礼人、礼物ID 任一条件 | `filters-pagination`、`api` | 送礼人 total=1；收礼人 total=375；礼物ID total>0 且行值=9358 | 通过 |
| 5 | 语言区/房间ID 组合 | 语言区+接收用户；语言区+房间ID+送礼用户 | `filters-pagination` | 请求体条件同时存在；返回行语言区=in、房间ID∈提交列表；组合 total=1 | 通过 |
| 6 | 分页 | 首页 20 行、下一页 | `filters-pagination` | 下一页请求 page=2、沿用原 conditions、total 不变、首行变化 | 通过 |
| 7 | 表格字段 | 18 列与接口一致 | `filters-pagination`、`api`、`export` | 表头逐项相等；首行 9 个关键字段值可在页面/导出中匹配 | 通过 |
| 8 | 房间ID 批量 | 换行、逗号（含空格）输入 | `filters-pagination` | 提交 `room_ids=10101411,10101412`；查询返回房间ID均属于列表 | 通过 |
| 9 | 导出 | 合法条件 xlsx；非法条件不导出 | `export`、`api` | 文件名 `礼物赠送明细查询_*.xlsx`；18 列表头；首行送礼用户=6360225；非法条件 0 下载请求 | 通过 |
| 10 | 深链 | `?uid=6360225` 预填、不自动查询、补日期可查 | `deeplink-reset` | 输入框值=6360225；query=0；查询 total=1 | 通过 |
| 11 | 重置 | 清空条件/结果、分页禁用、不自动查询 | `deeplink-reset` | 所有条件为空；rows=0；分页禁用；新增 query=0 | 通过 |
| 12 | 其他报表不受影响 | 进入「直播间日数据」 | `deeplink-reset` | 标题正确、表头含 Date/Room ID、无错误；不触发送礼详情 query；无送礼详情筛选项 | 通过 |
| 13 | 接口配置 | `config/get` | `api` | configId=gift-send-detail、database=odps、status=VALID、7 个字段类型正确 | 通过 |
| 14 | 接口查询 | `query` 各条件/分页/表头 | `api` | 18 列表头；各条件 total>0 且行值匹配；page=2 数据变化 | 通过 |
| 15 | 接口导出 | `query/download` | `api` | HTTP 200、Content-Type=xlsx、文件可解析、表头/首行正确 | 通过 |
| 16 | 接口异常 | 未知 configId | `api` | 业务 status=1（配置不存在） | 通过 |

## 未覆盖/排除

| 项 | 原因 |
|:---|:---|
| 真实账号登录（`ai`）后的会话与菜单权限 | 执行机出口被边缘 WAF 拦截 `/admin/*`（403），登录接口不可达；使用受控会话桩，报表接口走真实后端。详见 `tests/README.md` |
| 生产环境 | 任务排除项 |
| 性能/安全渗透 | 任务排除项 |
| 旧送礼详情页面 | 已无路由引用，任务排除项 |
| 全量大数据导出 | 任务要求控制单日、仅验证表头与数据 |
