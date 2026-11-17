# RUNS — 实际执行记录

> 工位：opencode-agent-01；时区：Asia/Shanghai（+08:00）。
> 完整 stdout（每次请求的 URL / 脱敏 Header / Body / HTTP 状态 / 响应原文 / 耗时）留存在工位 `evidence/tk0314-final/*.log`。
> 说明：脚本基于 `CheckBaseClass`，进程退出码不会因 check 失败而改变（示例中均为 0），**结果以 `[done].status` 与 `[check].status` 为准**。
> 凭证（AccessToken / 手机号 / 验证码 / IM Token / proxyHeader / tis）不写入文档与日志。

## 2026-11-17 · 最终执行

| 时间 | 脚本（cwd=`projects/feature/api-funbit-moment-live/tests`） | 退出码 | `[done]` |
| --- | --- | --- | --- |
| 17:28:09 | `node door-entry.test.ts`（补充 R2 边界） | 0 | success：total 4 / success 4 / fail 0 / skip 0 |
| 17:29:52–17:30:55 | `node moment-live-publish.test.ts` | 0 | success：total 18 / success 18 / fail 0 / skip 0 |
| 17:32:02–17:32:04 | `node moment-live-query.test.ts`（第 1 次，环境 502） | 0 | fail：act 失败（环境中断，见下） |
| 17:34:09–17:34:10 | `node moment-live-ratelimit.test.ts` | 0 | success：total 5 / success 5 / fail 0 / skip 0 |
| 17:35:25–17:35:32 | `node moment-live-query.test.ts`（第 2 次，登录 System error） | 0 | fail：act 失败（环境中断，见下） |
| 17:36:01–17:37:04 | `node moment-live-query.test.ts`（第 3 次，最终结果） | 0 | success：total 16 / success 14 / fail 0 / skip 2 |
| 17:37:23–17:38:24 | 红证抽查（临时错误期望，见 §5） | 0 | fail：total 16 / success 13 / fail 1 / skip 2（预期失败，已恢复） |

### 1. 发布与校验（moment-live-publish.test.ts）

- 16 个 check + 2 个 act（前置/清理）：`[done] {"status":"success","total":18,"success":18,"fail":0,"skip":0,"time":62748}`
- 覆盖：在播/未开播发布、anchor 回退、roomId=0/负数/缺失/不存在/跨大区、未登录、content 缺失、类型非法/缺失、兼容路径、字段覆盖、authorId 默认、text 可选。
- 清理：删除 8 条动态（`179490779200001/2/3`、`179490785400001`、`179490785500001~4`），抽查 `info` 返回 `data=undefined`。

### 2. 查询填充与回归（moment-live-query.test.ts）

- `[done] {"status":"success","total":16,"success":14,"fail":0,"skip":2,"time":63718}`
- 通过 12 个 check（登录列表/详情、免登列表/`info`/`user/one`、关注流、批量填充、text 回归、历史动态回归、数字字段、localeRooms 增量、living 一致）。
- 阻塞 2 个：API-LIVE-108/109，热门流 4+2 次轮询 `data.datas` 均为 0 条，批次未包含本次新发布 live 动态。
- 清理：删除 3 条动态（`179490816200001/2`、`179490816300001`）。

### 3. 发布限流（moment-live-ratelimit.test.ts）

- 连续 12 次发布（`roomId=0`）：HTTP 200 ×10（均为 `status=1 / live.roomId 传入的值错误`）→ HTTP 304 ×2（空响应体）。
- 3 个检查点全部通过；无成功发布。

### 4. 入口 3/4 边界（door-entry.test.ts，补充同 PRD R2）

- locale 实时在播数：`in`=12、`zh`=3、`th/en/ar/vi`=0。
- `in`：`openDoor.show=true`，`doorplate.action={tab:voice_room,subtab:live}`。
- `zh`：`openDoor.show=false`，`doorplate.status=400002 / NOT_OPEN_LIVE_ROOM`。
- 6 个 locale 判断与实时数量一致。

### 5. 红证抽查（断言有效性）

- 操作：将 `moment-live-query.test.ts` 复制为临时脚本，把 API-LIVE-101 的期望 `living` 临时改为 `false` 后执行，执行完删除临时脚本。
- 实际输出：`【API-LIVE-101】... "status":"fail","message":"字段不符：living=true≠false"`，`[done].fail=1`。
- 结论：断言在期望偏离时必然失败，非恒真；正式脚本已恢复为 `living=true` 并重跑通过。

## 执行过程中的环境中断（如实记录）

| 时间 | 脚本 | 现象 | 处理 |
| --- | --- | --- | --- |
| 17:32:02–17:32:04 | `moment-live-query.test.ts`（第 1 次） | 前置 `GET /litalive/internalcall/localeRooms` 返回 **HTTP 502 Bad Gateway**，act 失败 | 环境瞬时故障，按「环境中断可整条重跑一次」重跑（未修改任何用例预期） |
| 17:35:25–17:35:32 | `moment-live-query.test.ts`（第 2 次） | 登录返回 `status=3 / System error`（同一时段手工复测已恢复正常） | 环境瞬时故障，重跑第 3 次成功 |
| — | — | 以上两次均未产生动态数据；第 3 次运行前后均核验残留 0 条 | — |

## 代码提交

| 项 | 值 |
| --- | --- |
| 仓库 | `git@github.com:LitaGroup/scripts.git` |
| 分支 | `test/tk-0314-moment-live-api`（开发分支）→ 合并 `main` |
| 提交 | `a7f2258`（用例提交）；`b7d6cfe`（merge 到 main）；后续仅文档补充提交 |
| 远端 main | 已包含上述提交（核对：`git ls-remote origin refs/heads/main`，交付时 HEAD 由 HANDOFF 记录） |

## 数据与安全

- 测试账号：`locale=in`，凭证来自本地 `config.json`（`.gitignore`），不提交、不打印。
- 直播间：在播 `10300107`（anchor 1609，tag game/mkl）、未开播 `13300100`（anchor 1635，tag game/game）、anchor 回退 `10300201`（anchorId=0→11436）、跨大区 `13300106`（locale=zh）。
- 执行后按 `TK-0314` 前缀检索账号动态：残留 0 条。
