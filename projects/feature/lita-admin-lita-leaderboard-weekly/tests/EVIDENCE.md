# EVIDENCE — 项目 3713 Lita Leaderboard Weekly Data（TK-0216）

- 环境：https://admin.test.lita.game（非生产）
- 证据根目录（工位）：`/home/ecs-user/runtime/worker/1059/.tmp_docs/tk216/`（formal-p0-r2 / formal-p1 / formal-chrome / formal-edge）
- 上传方式：`POST /api/files/upload.md`，返回无需登录的公共 URL
- 脱敏：截图仅含 Admin 页面内容与测试账号可见的榜单昵称；`run.json` 已过滤 `L-USER-TOKEN`/cookie/accessToken；不含账号口令、会话令牌、个人敏感信息
- 说明：Chrome / Edge 截图分别来自 Playwright `channel: chrome` / `msedge`（本机 Chrome 157.0.8103.50 / Edge 157.0.4341.46）

## 1. 环境与版本证据

| 项 | 证据 |
| --- | --- |
| 前端入口 | `https://admin.test.lita.game/static/index-c1477f3a.js`；响应头 `Last-Modified: Wed, 11 Nov 2026 11:03:46 GMT` |
| 表头键修正已部署 | 入口产物包含 `"ranking type":"Ranking Type"` 映射（对应 1a1e941）；页面实际表头为 Rank/Ranking Type/... 12 列 |
| 代码提交记录 | `GET /api/code-events.md?projectId=3713`：2026-11-11 17:47:56 `1a1e941` fix(stats): 按 data-main 新列名修正周榜表头与金额格式化键 |
| B1 就绪 | 见用例 6 D1 截图与 `formal-p0-r2/run.json`（20 行、Top1 508,600、12 列表头） |
| 无「未配置查询条件」 | 用例 1 ④ 检查通过；截图 02-case1-report-loaded.png |

## 2. 按用例证据

| 编号 | 用例 | 证据文件 | 公共地址 | 摘要 |
| --- | --- | --- | --- | --- |
| E01 | 1 | formal-p0-r2/01-case1-menu-expanded.png | http://work.cinta.team/files/20261111/222bb3e6-b320-431d-b774-54c578d03268.png | 数据统计管理-用户数据展开，叶子菜单可见 |
| E02 | 1 | formal-p0-r2/02-case1-report-loaded.png | http://work.cinta.team/files/20261111/2b2e6ea0-5a15-4be6-a9b5-615d461cf4e6.png | 报表标题、3 控件、3 按钮加载成功 |
| E03 | 3 | formal-p0-r2/03-case3-empty-required.png | http://work.cinta.team/files/20261111/f08c8275-4fa9-4454-b3d3-febd07b4510e.png | 空条件点击查询，提示「请选择Week」，等待态 Total 0 |
| E04 | 4 | formal-p0-r2/04-case4-week-missing.png | http://work.cinta.team/files/20261111/c7e295a3-9bb9-4fc8-889d-bfa4860e23db.png | 仅选 Ranking Type，提示「请选择Week」 |
| E05 | 5 | formal-p0-r2/05-case5-ranking-missing.png | http://work.cinta.team/files/20261111/9bad22f7-db01-4f30-b109-d545add28540.png | 仅选 Week，提示「请选择Ranking Type」 |
| E06 | 6-D1 | formal-p0-r2/06-case6-D1-after-query.png | http://work.cinta.team/files/20261111/e4d5371e-d307-40d7-9990-892f55a76c0f.png | 订单榜印尼语区 20 行，Top1 508,600 |
| E07 | 6-D1 | formal-p0-r2/case6-D1-table.png | http://work.cinta.team/files/20261111/7a3aa9d1-4daf-4b9c-86e5-4f1acfb5bb1c.png | 12 列表头与 20 行明细 |
| E08 | 6-D2 | formal-p0-r2/07-case6-D2-after-query.png | http://work.cinta.team/files/20261111/ff40bab9-6d60-4c7b-819f-200cabff16b4.png | 礼物榜 20 行，Top1 2,401,099 |
| E09 | 6-D2 | formal-p0-r2/case6-D2-table.png | http://work.cinta.team/files/20261111/5b48835e-9d6c-496c-b420-ef0ac1394402.png | 表头/行明细 |
| E10 | 6-D3 | formal-p0-r2/08-case6-D3-after-query.png | http://work.cinta.team/files/20261111/d4f018b9-0aa3-4ebf-818c-2d9c0aa8885a.png | 消费榜 20 行，Top1 2,151,806，Order/Gift 拆分正确 |
| E11 | 6-D3 | formal-p0-r2/case6-D3-table.png | http://work.cinta.team/files/20261111/f36171f9-70e0-4524-8cc6-cad34b9dcda6.png | 表头/行明细 |
| E12 | 7-D1 | formal-p0-r2/09-case7-2026-11-05-after-query.png | http://work.cinta.team/files/20261111/a5afaa87-129c-468e-b450-6eddf6ed877b.png | 周四查询归一到 2026-11-02 |
| E13 | 7-D2 | formal-p0-r2/10-case7-2026-11-08-after-query.png | http://work.cinta.team/files/20261111/03ad605f-8825-4698-a969-6a776c38072d.png | 周日查询归一到 2026-11-02 |
| E14 | 8 | formal-p0-r2/11-case8-page1.png | http://work.cinta.team/files/20261111/973172aa-cce9-4124-a97d-30ff8ea17122.png | 不选 Locale：Total 80 第 1 页 |
| E15 | 8 | formal-p0-r2/12-case8-page4.png | http://work.cinta.team/files/20261111/6ec2170d-eb8b-4680-9be8-4f512ceb3ffe.png | 第 4 页，跨 4 页聚合 80 行 |
| E16 | 9 | formal-p1/01-case9-page1.png | http://work.cinta.team/files/20261111/22454f6b-1d9b-4af7-ab0f-7bdb8ccfad81.png | 分页 1-4、每页 20 行、Total 80 |
| E17 | 10-D1 | formal-p1/02-case10-2026-11-09-empty.png | http://work.cinta.team/files/20261111/43168f34-2d6c-4847-9012-736096f77aea.png | 2026-11-09 空态「暂无数据」Total 0 |
| E18 | 10-D2 | formal-p1/03-case10-2025-01-06-empty.png | http://work.cinta.team/files/20261111/e4e1e170-967d-410f-939a-b9a0eedc92dd.png | 2025-01-06 空态「暂无数据」Total 0 |
| E19 | 11 | formal-p1/04-case11-after-reset.png | http://work.cinta.team/files/20261111/a747d8db-8fcb-49cb-ab71-ed967f04c19d.png | 重置后条件清空、0 项、等待态 Total 0 |
| E20 | 12 | formal-p0-r2/13-case12-before-export.png | http://work.cinta.team/files/20261111/2aded91c-aeeb-4c63-b6cd-5889768cd43b.png | 导出前 20 行与筛选条件 |
| E21 | 12 | formal-p0-r2/14-case12-after-export.png | http://work.cinta.team/files/20261111/ab4dd521-3520-4a94-a6c4-a9fe4b2bbd0c.png | 导出后页面条件/列表不变 |
| E22 | 12 | formal-p0-r2/周订单礼物消费榜_89093537.xlsx | http://work.cinta.team/files/20261111/a02f411e-c95f-4f6f-81e9-8a831cc46ea1.xlsx | 21 行×12 列，小写表头，首行数值与页面一致 |
| E23 | 13 | formal-p1/05-case13-spin-summary.png | http://work.cinta.team/files/20261111/247dd94f-bf6b-411c-895f-3d6261adb75a.png | 水果机汇总 1 行 Total 1，5 列结果表 |
| E24 | 14 | formal-p1/06-case14-form.png | http://work.cinta.team/files/20261111/2ba44e5b-7eca-4176-bfaf-cbaf77163254.png | 送礼详情标题/7 标签/空态 |
| E25 | 14 | formal-p1/07-case14-result.png | http://work.cinta.team/files/20261111/f9beb0e5-3d72-4bda-8e4e-c0eb44d658b5.png | Total 892、45 页、首屏 20 行、18 列表头 |
| E26 | 15-D1 | formal-p1/08-case15-D1.png | http://work.cinta.team/files/20261111/7def258e-fa82-4188-b2d2-bbbefb75e4b6.png | 订单榜不选大区：Total 80，Locale 含四区 |
| E27 | 15-D2 | formal-p1/09-case15-D2.png | http://work.cinta.team/files/20261111/45d687bf-912a-4bf3-b37e-4261b4b6c8b4.png | 消费榜不选大区：Total 80，Rank 1-20 |
| E28 | 15-D3 | formal-p1/10-case15-D3.png | http://work.cinta.team/files/20261111/88cfa1a7-6b93-4b42-a764-bcd9a537e408.png | 礼物榜韩国区：Total 20，Locale 均 ko |
| E29 | 16-D1 | formal-chrome/01-case16-chrome-query.png | http://work.cinta.team/files/20261111/29323c8b-2a09-4718-b2de-78847158f6c3.png | Chrome 基线查询 20 行 |
| E30 | 16-D1 | formal-chrome/02-case16-chrome-export.png | http://work.cinta.team/files/20261111/9a619dbd-2d86-4ff1-a4a5-a01ae4e3e1c5.png | Chrome 导出后页面 |
| E31 | 16-D1 | formal-chrome/周订单礼物消费榜_38391552.xlsx | http://work.cinta.team/files/20261111/409b1d29-5ea9-4f9c-afb0-9f8532ad6026.xlsx | Chrome 导出 21×12 |
| E32 | 16-D2 | formal-edge/01-case16-edge-query.png | http://work.cinta.team/files/20261111/e3c15308-78e9-4502-b9ce-3e8c5d3a2844.png | Edge 基线查询 20 行 |
| E33 | 16-D2 | formal-edge/02-case16-edge-export.png | http://work.cinta.team/files/20261111/9a6a23c5-9655-4023-b55f-72916c8ddd69.png | Edge 导出后页面 |
| E34 | 16-D2 | formal-edge/周订单礼物消费榜_25813290.xlsx | http://work.cinta.team/files/20261111/2da65536-cca3-4b31-b632-0f5afa254fff.xlsx | Edge 导出 21×12 |
| E35 | 17 | formal-p1/11-case17-size-10.png | http://work.cinta.team/files/20261111/517f456d-3ee0-473f-90cb-2a0a6c302832.png | 10/page，10 行，共 8 页，回到第 1 页 |

## 3. 运行留痕与失败/红证证据

| 编号 | 内容 | 地址 |
| --- | --- | --- |
| E36 | 正式 P0 run2（51/51）run.json | http://work.cinta.team/files/20261111/bb4c34aa-6c60-47e5-a800-a0e8f17cc5f8.json |
| E37 | 正式 P1（43/43）run.json | http://work.cinta.team/files/20261111/a3f0c49b-2023-48d4-96a9-e71d80e4e8cc.json |
| E38 | 正式 Chrome（3/3）run.json | http://work.cinta.team/files/20261111/b782384b-3d7d-40a1-8421-e0b1560eed31.json |
| E39 | 正式 Edge（3/3）run.json | http://work.cinta.team/files/20261111/613e2272-ad1b-45ec-8a0f-81a01b4510b1.json |
| E40 | 正式 P0 run1（50/51，成功提示 NO-TOAST）run.json（保留首轮失败证据） | http://work.cinta.team/files/20261111/3f5a353d-59a2-43ee-99d3-ed1090c2de43.json |
| E41 | 正式 P0 run1 D3 失败现场截图 | http://work.cinta.team/files/20261111/b12bdfcf-8e51-4137-9eca-a922feae7bbb.png |
| E42 | 红证抽查 run.json（改错期望值后 check 失败） | http://work.cinta.team/files/20261111/d87d9873-f6ec-4066-9e8d-9cd272ec8d31.json |

## 4. 阻塞证据

- 用例 2：当前未提供无 `lita-leaderboard-weekly` 权限的普通账号；qa-ai 具备权限（菜单可见、路由可进入）。需求方在任务输入中明确「无权限账号缺失时记阻塞，不虚构账号、不修改角色/权限」，故未代码化、无执行截图。所需支持：提供一个无该报表权限的普通账号。

## 5. 数据清理

- BD-0 无造数、无写操作；仅只读查询与导出。
- 导出文件保存在证据目录并按证据上传；未修改任何业务数据或角色权限。
