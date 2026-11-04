# Lita Admin — 送礼详情报表

项目 141《【报表优化需求】送礼详情》的 Admin 端测试脚本。

- 需求文档：`/api/docs/detail/project/141/document/143.md`
- 接口文档：`/api/documents/3375.md`（项目文档 `API.md`《送礼详情报表接口说明》）
- 报表路径：Admin — 数据统计管理 — 礼物相关数据 — 送礼详情
- 页面地址：`https://admin.test.lita.game/#/data-stats-manager/gift-send-detail`
- 报表配置：`configId=gift-send-detail`，`database=odps`

## 测试范围

| 需求点 | 覆盖脚本 |
|:---|:---|
| 页面加载：标题、7 个筛选项、按钮、初始空表/分页 | `tests/gift-send-detail-page-validation.test.ts` |
| 日期必填（开始/结束） | `tests/gift-send-detail-page-validation.test.ts` |
| 送礼人/收礼人/礼物ID 三选一（查询与导出） | `tests/gift-send-detail-page-validation.test.ts`、`tests/gift-send-detail-export.test.ts` |
| 正常查询、语言区/房间ID 组合、分页、表格字段 | `tests/gift-send-detail-filters-pagination.test.ts` |
| 房间ID 批量（换行/逗号，提交逗号分隔字符串） | `tests/gift-send-detail-filters-pagination.test.ts` |
| 导出 xlsx：文件名、表头、数据、非法条件不导出 | `tests/gift-send-detail-export.test.ts` |
| 深链 `?uid=` 预填且不自动查询 | `tests/gift-send-detail-deeplink-reset.test.ts` |
| 重置：清空条件/结果、分页禁用、不自动查询、其他报表不受影响 | `tests/gift-send-detail-deeplink-reset.test.ts` |
| 接口：config/get、query（全部条件/分页/表头）、download、异常 configId | `tests/gift-send-detail-api.test.ts` |

排除项：生产环境、业务代码修改、性能/安全渗透、旧送礼详情页面（已无路由引用）。

## 目录结构

```
lita-admin-gift-send-detail/
  README.md
  RUNS.md                 # 实际运行记录（时间、命令、通过/失败数）
  COVERAGE.md             # 需求 → 测试点 → 脚本追溯
  tests/
    README.md
    lib/admin-report.ts   # Playwright 基类：会话、真实接口代理、截图与接口留痕
    gift-send-detail-*.test.ts
    evidence/             # 运行时截图/run.json（gitignore，不入库）
```

## 依赖

- Node.js >= 24（原生 TypeScript 类型剥离，无需编译）
- `playwright`（Chromium；本机已安装浏览器缓存）
- `exceljs`（导出文件解析）
- 在 scripts 仓库根目录执行 `npm install`

## 环境与已知限制

- 执行机直连 `https://m-api.test.lita.game/admin/*` 会被边缘 WAF 返回 `403 Access Denied`，**登录接口不可达**（页面静态资源与 data-main 接口正常）。
- 报表业务接口通过内网测试网关 `https://api.test.cinta.team` 的同一 `data-main` 服务访问，脚本默认使用该地址；可用 `SCRIPT_API_BASE` 覆盖。
- 脚本在未提供 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 时使用受控会话桩仅绕过登录接口；**报表配置、查询、导出均请求真实测试环境后端**。提供账号密码时会先走真实登录流程，失败则直接报错，不回退。
- 密码/token 不写入脚本、日志、报告；`run.json` 仅记录是否获取到 token（长度），不记录明文。

详见 `tests/README.md`。
