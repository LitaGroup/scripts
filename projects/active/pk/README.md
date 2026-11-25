# active/pk 赛事 PK 项目

Lita 赛事 PK 活动的接口测试脚本。当前覆盖：

- 六周年 PK（`pk-v202608`）：家族榜结算链路（`family-*`）、陪陪榜初始化（`player-001-init`）。
- 2612 年度 PK（`pk-v202612`）：配置/路由、17 天赛程、奖励配置、礼物 Buff、获胜 Buff、旧活动回归。

## 目录

| 目录 | 说明 |
|---|---|
| `tests/` | 自动化测试用例（`*.test.ts`），2612 用例见 `tests/CASES.md` 与 `tests/COVERAGE.md` |
| `checks/` | 线上检查脚本（`*.check.ts`），用于六周年活动在线巡检 |
| `exports/` | 榜单/奖励数据导出脚本 |

## 环境

- 测试环境：`https://api.test.cinta.team`
- 依赖 `config.json`（gitignored）：`userToken`（只读 SQL 查询）、六周年历史用例另需 `mysql`/`redis`。
- Node.js 24+，直接执行 `node projects/active/pk/tests/xxx.test.ts`。

## 2612 年度 PK 背景

- 需求：文档 3458《【2026年度盛典】赛事PK》、文档 3459 奖励配置表、文档 3452 需求澄清。
- 方案：TK-0607 `TECH_DESIGN` v15，`pk-v202612` 纯配置复用六周年，生产 Java 零修改。
- 活动时间：2026-12-17 11:00 ~ 2027-01-02 23:59:59（UTC+8），大区 in/vi/ph/ko。
