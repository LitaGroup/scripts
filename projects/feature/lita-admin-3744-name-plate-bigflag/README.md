# lita-admin-3744-name-plate-bigflag

WO-0058 / BL-0057：Admin「特效管理 - 铭牌管理」添加/编辑铭牌弹窗「是否是大铭牌」字段级独立权限 UI 用例执行。

- 用例来源：TK-0764 HANDOFF v3 九列用例（13 条）；技术方案：`/98-tasks/20261127/764/TECH_DESIGN`（v2）。
- 被测环境：`https://admin.test.lita.game/`（测试环境，非生产）；页面 `#/effect-manager/name-plate`，权限配置 `#/permission/role`。
- 权限 key：`button:name-plate-index:big-flag`（权限树节点「添加铭牌「是否是大铭牌」」）。
- 账号：`qa-ai`（admin 正向/管理侧）、`qa-noauth`（零权限，仅 #11/#12，绝不改权）；字段级专用角色/账号 `qa_bigflag_<runId>` / `qa_bigflag_user_<runId>` 由测试页面级构造，执行结束删除。
- 数据：仅页面级构造；自建铭牌统一 `qa_bigflag_<runId>_` 前缀。页面无删除入口，按前缀隔离保留（不修改/删除存量铭牌）。

## 目录

```
tests/
  lib/admin-base.ts                 # 项目私有基类（登录/storageState/独立 context/WAF 转发/截图/run.json/权限树）
  tc01-name-plate.test.ts           # #1~#10、#13（71 checks）
  tc02-noauth.test.ts               # #11、#12（3 checks）
  assets/qa_bigflag_icon.png        # 上传样本（64x64 PNG）
  assets/qa_bigflag_thumb.png       # 上传样本（64x64 PNG）
  assets/qa_bigflag_bg.png          # 自定义铭牌背景图样本（256x128 PNG）
COVERAGE.md                         # 用例# -> 检查点 -> check 标记 -> 结果
RUNS.md                             # 运行记录
```

## 运行

```bash
# 工作目录：仓库根目录；必须设置 TMPDIR 防 /tmp 满载
export TMPDIR="$PWD/.tmp-playwright"
export ADMIN_USERNAME=qa-ai ADMIN_PASSWORD=***
export NOAUTH_USERNAME=qa-noauth NOAUTH_PASSWORD=***

# 主套件（#1~#10、#13；--case 可单条或多条过滤）
node projects/feature/lita-admin-3744-name-plate-bigflag/tests/tc01-name-plate.test.ts --run-id=<runId>

# 无权限族（#11/#12）
node projects/feature/lita-admin-3744-name-plate-bigflag/tests/tc02-noauth.test.ts --run-id=<runId>
```

- 默认启用 WAF 同源原样转发（本环境直连 `m-api` 返回 401/403）：`/admin/*`、`/api/*`、`/voiceroom/*`、`/common/*` → `SCRIPT_API_BASE`；`/data-main/*` → `SCRIPT_DB_API`。仅删除 `host`/`content-length` 等传输头，不改请求/响应体（R1 唯一例外）。
- 每账号真实 UI 登录 1 次并保存 `storageState`；每条用例 `browser.newContext({ storageState })` 独立上下文。
- `--run-id` 决定自建数据前缀、专用角色/账号名与运行态状态文件（`TMPDIR/qa-bigflag-state/state-<runId>.json`，600，不提交）。密码仅运行时环境变量/临时状态文件使用，不写入代码、日志、证据或报告。
- `--case=<N>` 可单条执行（如 `--case=1` 自测红证、`--case=2,10` 定向复跑）。

## 结果摘要（2026-11-27）

- 13 条用例：通过 11、未通过 1（#9 权限缓存约 120s 未生效，归因技术方案假设/用例问题，未提产品缺陷）、阻塞 1（#13 权限树父子联动无法仅勾字段子节点）、未执行 0。
- 检查点 74：通过 71、失败 1、跳过 2（阻塞）。
- 执行率 = 12/13 = 92.31%；通过率 = 11/12 = 91.67%。
- 详细报告：TK-0768 任务文档 `TEST_REPORT.md`、`EVIDENCE.md`；唯一九列表在 HANDOFF。
