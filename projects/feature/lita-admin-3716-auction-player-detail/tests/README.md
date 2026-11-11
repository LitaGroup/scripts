# 项目 3716「拍拍模式流水-主播维度」Admin UI 测试

## 目录

```
projects/feature/lita-admin-3716-auction-player-detail/tests/
├── lib/admin-base.ts          # 复用 3715 通用报表页测试基类（基础设施）
├── tc-p0-report.test.ts       # P0 10 条：权限/首屏/必填/查询/导出/表头/渲染/筛选
├── tc-p1-extra.test.ts        # P1 重点回归：分页/重置/组合筛选/房间维度/Player Data Report(New)
├── COVERAGE.md                # 用例检查点 ↔ check 双向对照
├── RUNS.md                    # 运行记录
└── README.md
```

## 运行

```bash
cd projects/feature/lita-admin-3716-auction-player-detail/tests

ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-p0-report.test.ts --evidence-dir=./evidence/p0

ADMIN_USERNAME=*** ADMIN_PASSWORD=*** \
  node tc-p1-extra.test.ts --evidence-dir=./evidence/p1
```

- Node.js v24+ 直跑 TypeScript（类型剥离），无需编译。
- 凭证仅运行时环境变量注入，不写入代码/日志/证据。
- 证据：截图、`run.json`（页面请求留痕）、导出 xlsx 与解析结果。
- 只读查询测试环境存量数据，不造数、无清理责任。

## 专项口径

- 页面表头为接口返回的小写列名（17 列），按列数/列序/不截断判定，不因小写判失败。
- 导出中 `auction success - Date&Time` 被 EasyExcel 按 " - " 分层为两行表头（数据未错位），在证据中记录实际表现。
- 大区「in」在页面上的选项文案为「印尼语区」。
