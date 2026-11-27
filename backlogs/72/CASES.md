# BL-0072 L-DEBUG-TIMESTAMP 发送端修复 · 测试用例设计

## 1. 文档信息

| 项 | 内容 |
|:---|:---|
| 任务 | TK-0750（父任务 TK-0744，技术方案 TK-0745 v3.0） |
| 需求 | #3752 funbit-framework 修复 L-DEBUG-TIMESTAMP 毫秒解析，消除 lita-basic ERROR 刷屏 |
| 迭代项 | BL-0072 |
| 测试环境 | `https://api.test.cinta.team` |
| 变更仓库 | `lita-framework`（发送端）、`funbit-framework`（发送端）、`basic-promotion-main`（调用方依赖升级） |
| 测试依据 | 技术方案 v3.0；需求方确认「B 含调用方联调」 |
| 说明 | 本次为公共框架库变更，框架本身无独立运行服务；接口级验证通过调用方 basic-promotion-main 完成，下游请求头/日志证据由部署任务只读核验补充 |

## 2. 需求要点

| 编号 | 要点 | 来源 |
|:---|:---|:---|
| R01 | 直接修改 `lita-framework` 与 `funbit-framework` 发送端 | 技术方案 R01 |
| R02 | 原始请求未携带 / 空 `L-DEBUG-TIMESTAMP` 时，下游请求不得新增该头 | 技术方案 R02 |
| R03 | 原始请求携带非空调试头时，继续向全链路透传 | 技术方案 R03 |
| R04 | 未携带调试头时 `session.timestamp` 仍为服务器当前时间 | 技术方案 R04 |
| R05 | 保持现有毫秒编码与 Feign 使用方式 | 技术方案 R05 |
| R06 | 两套框架均有测试、发布与回滚设计 | 技术方案 R06 |

## 3. 技术方案覆盖映射

| 设计项 | 覆盖用例 |
|:---|:---|
| lita-framework `Session.debugTimestampProvided` / `copy()` | UT-01～UT-03（单元）、TC-05（制品核验） |
| lita-framework `HttpRequestFilter` 来源记录与条件透传 | UT-04～UT-10（单元）、TC-01、TC-02、TC-05 |
| funbit-framework `Session` / `SessionRequestFilter` 对称改动 | UT-11～UT-17（单元）、TC-05 |
| Feign 拦截器实际出站头 | UT-08、UT-09（单元） |
| 调用方 basic-promotion-main 升级 web 1.0.1 | TC-01～TC-04、TC-06 |
| 下游无新增调试头 / 无新增 ERROR | TC-06（部署日志/镜像核验） |

## 4. 设计方法

- 等价类：无头、空头、合法非空头、非法非空头。
- 边界值：空字符串、非法字符串、合法毫秒、合法 LitaDateTime。
- 判定表：来源标记 × `toHeaders` 输出。
- 状态迁移：同一线程连续「有头 → 无头」请求，验证 ThreadLocal 状态不串。
- 错误推测：Session 复制丢失标记、Feign 拦截器重复写头、调用方仍引用旧框架版本。

## 5. 用例

### 5.1 后端白盒 / 接口（测试环境）

| 编号 | 场景 | 步骤 / 类型 | 校验点 | 设计方法 |
|:---|:---|:---|:---|:---|
| TC-01 | 无头调用调用方接口 | act：`POST /basic-promotion-main/v2/option/init`，不携带 `L-DEBUG-TIMESTAMP`，`l-user-locale=VN`；check：HTTP 与业务状态 | HTTP 200，`status=0` | 等价类 |
| TC-02 | 合法毫秒调试头调用 | act：同一接口携带 `L-DEBUG-TIMESTAMP=<当前毫秒>`；check：业务状态 | HTTP 200，`status=0` | 边界值 |
| TC-03 | 合法 LitaDateTime 调试头调用 | act：同一接口携带 `L-DEBUG-TIMESTAMP=2026-07-10T10:00:00+08:00`；check：业务状态 | HTTP 200，`status=0` | 边界值 |
| TC-04 | 连续有头/无头请求 | act：先携带调试头调用，再不带调试头调用；check：第二次业务状态 | 第二次 HTTP 200，`status=0`，无异常 | 状态迁移 |
| TC-05 | 部署制品核验 | check：测试环境运行实例内 `BOOT-INF/lib/web-1.0.1.jar`；`Session` 含 `debugTimestampProvided`；`HttpRequestFilter` 存在 `isDebugTimestampProvided` 条件分支；funbit 制品含同名标记与条件透传 | 四项全部成立 | 错误推测 |
| TC-06 | 下游调试头/日志核验 | check：无头调用后，测试环境 lita-basic 无新增 `Invalid debug timestamp`；或按部署任务提供的等价只读证据 | 无新增错误 / 证据成立 | 错误推测 |
| TC-07 | 普通业务回归 | check：TC-01 返回结构与基线一致（`data.showGameHome` 为布尔值） | 字段存在且为布尔 | 等价类 |

### 5.2 单元测试（本地，两套框架）

| 编号 | 场景 | 预期 |
|:---|:---|:---|
| UT-01 | 新建/empty/init/random Session | `debugTimestampProvided=false` |
| UT-02 | `copy()` 复制 true | 标记与 timestamp 保留 |
| UT-03 | `copy()` 复制 false | 标记与 timestamp 保留 |
| UT-04 | 无头请求构造 Session | 时间在请求前后区间内，标记 false |
| UT-05 | 空头请求 | 标记 false，出站不含调试头 |
| UT-06 | 合法毫秒头 | 标记 true，时间等于输入，出站值一致 |
| UT-07 | 合法 LitaDateTime 头 | 标记 true，时间按现有规则解析，出站为毫秒 |
| UT-08 | 非法非空头 | 标记 true，时间回退当前时间，出站为回退值 |
| UT-09 | 连续有头 → 无头 | 第二次标记 false，无出站调试头，ThreadLocal 清理 |
| UT-10 | Feign 拦截器无调试上下文 | 出站无调试头 |
| UT-11 | Feign 拦截器有调试上下文 | 出站仅一个调试头且值正确 |
| UT-12 | funbit 新建 Session 默认不传播 | 出站无调试头 |
| UT-13 | funbit 无头/空头 | 标记 false，无出站头 |
| UT-14 | funbit 非空头 | 标记 true，出站值与 Session 时间一致 |
| UT-15 | funbit LitaDateTime 头 | 时间解析正确，出站毫秒一致 |
| UT-16 | funbit 非法非空头 | 标记 true，时间回退，出站回退值 |
| UT-17 | funbit 连续请求 | 第二次无出站头，ThreadLocal 清理 |

## 6. 执行顺序与依赖

1. 部署任务 TK-0752（lita-framework 1.0.1 制品）→ TK-0754（basic-promotion-main 升级部署）、TK-0753（funbit-framework）。
2. 确认测试环境运行版本与需求分支 commit 一致后执行 TC-01～TC-04。
3. TC-05、TC-06 使用部署任务提供的制品/日志只读证据。
4. 最后执行 TC-07 回归。

## 7. 覆盖度自检

- 需求要点 R01-R06 均有用例映射，无孤儿要点。
- 技术方案接口清单：本变更无新增/变更业务接口，仅涉及 `L-DEBUG-TIMESTAMP` 头契约；TC-01～TC-04 覆盖调用方接口。
- 数据写入点：无数据库、缓存、消息写入。
- 未覆盖项：无法从 HTTP 响应直接观察下游请求头，需依赖制品与日志证据（TC-05/TC-06）；funbit 真实调用方出站链路本次未部署升级，标注为未覆盖。
- APP / H5：不涉及。

## 8. 待确认事项

无。测试环境验证范围已由需求方确认「B 含调用方联调」。

## 9. 问题跟踪

| 用例 | 结果 | 缺陷单 |
|:---|:---|:---|
| 待执行 | - | - |
