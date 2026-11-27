# L-DEBUG-TIMESTAMP 发送端修复（TK-0750）测试报告

> 测试范围：`lita-framework` / `funbit-framework` 发送端调试头透传修复，`basic-promotion-main` 框架升级联调
> 测试轮次：后端白盒 / 接口联调
> 测试环境：test；`basic-promotion-main` 镜像 `basic-promotion-main:212`（工单 #111）；`lita-framework` test @ `0a86ade`
> 设计文档：[CASES.md](./CASES.md)　用例脚本：`tests/001-debug-timestamp-caller.test.ts`
> 执行记录：[运行 #352](http://work.cinta.team/projects/3752/tests/177)　执行时间：2026-11-27

## 一、测试结论

**结论：通过。**

本次范围内 7 个用例全部通过（4 个接口自动化用例 8/8 步骤成功，3 个制品/日志/回归核验用例由部署证据确认）。普通请求（未携带 `L-DEBUG-TIMESTAMP`）在测试环境不再向下游注入该头；携带合法毫秒/LitaDateTime 调试头时仍按原格式透传，业务结果正常。接收端 TK-0744 尚未部署，合法调试头仍会在 `lita-basic-test` 触发既有 ERROR，属父任务范围，不影响本任务发送端结论。

## 二、执行统计

| 轮次 | 用例总数 | 通过 | 失败 | 阻塞 | 未执行 |
|:---|:---|:---|:---|:---|:---|
| 后端白盒（接口） | 4 | 4 | 0 | 0 | 0 |
| 制品 / 日志核验 | 2 | 2 | 0 | 0 | 0 |
| 回归 | 1 | 1 | 0 | 0 | 0 |
| 合计 | 7 | 7 | 0 | 0 | 0 |

### 自动化执行

- 平台用例 ID 177，运行 ID 352：`success`，8/8 步骤，0 失败，0 跳过，耗时 193ms。
- 本地执行同一脚本：8/8 通过。
- 单元测试：`lita-framework` `HttpRequestFilterTest` + `SessionTest` 11/11 通过；`funbit-framework` `SessionRequestFilterTest` 7/7 通过。

## 三、关键证据

| 场景 | 请求头 | 接口结果 | 运行实例 Session | 下游 `lita-basic-test` |
|:---|:---|:---|:---|:---|
| A 无头（部署后） | 不含 `L-DEBUG-TIMESTAMP` | 200，`showGameHome=false` | `timestamp=1795763903856`，`debugTimestampProvided=false` | 对应时间戳 0 条 `Invalid debug timestamp` |
| B 毫秒头（部署后） | `1795763903775` | 200，结果一致 | `timestamp=1795763903775`，`debugTimestampProvided=true` | 2 条对应 ERROR，证明有头仍透传 |
| C 日期字符串头（部署后） | `2026-11-27T15:25:00+08:00` | 200，结果一致 | `timestamp=1795764300000`，`debugTimestampProvided=true` | 2 条对应 ERROR，证明有头仍透传 |
| 部署前基线（镜像 211） | 不含调试头 | 200 | - | 2 条 `Invalid debug timestamp`，复现问题 |

其他证据：

- `basic-promotion-main` test 合入 `8c09bdb`，依赖树唯一解析 `gg.lita.framework:web:1.0.1`，产物内嵌 `BOOT-INF/lib/web-1.0.1.jar`。
- 运行实例日志出现 `debugTimestampProvided` 字段，该字段仅 web 1.0.1 引入，确认运行版本。
- `lita-framework` test `0a86ade` 已含修复 `0760be8` 与 1.0.1 版本提交 `7256236`。

## 四、缺陷清单

无。本次未产生缺陷单。

环境 / 口径差异（无缺陷单）：

- 接收端 TK-0744 未部署：合法毫秒/日期调试头仍触发 `lita-basic-test` 的 `Invalid debug timestamp` ERROR，属接收端既有问题，由父任务 TK-0744 处理。
- `lita-framework` 无 test 远程制品发布通道：通过 test 分支可复现构建 + 构建机本地安装 1.0.1 完成联调，长期需补齐正式发布流程。
- 构建产物 SHA-256 因含时间戳不可复现：制品核验以坐标、字节码与运行日志字段为准。

## 五、风险与未覆盖项

- 未覆盖：APP / H5——不涉及。
- 未覆盖：`funbit-framework` 真实调用方出站链路——本次未部署升级对应调用方，验证依赖单元测试与制品字节码核验。
- 遗留风险：`basic-promotion-main` 直接硬编码 `web:1.0.1`，后续框架升级需同步；建议改用 dependencyManagement/BOM 统一版本。
- 遗留风险：非法非空调试头仍被视为“已提供”并透传回退时间，符合本次方案边界；如需收敛应由接收端或网关处理。
- 遗留风险：`lita-framework` test 分支修复尚未回补 main，需按发布流程同步。

## 六、测试数据与清理

- 本次未写入数据库、缓存、消息或配置；接口调用仅读取/计算，无需清理。
- 测试使用的用户/请求头均为临时请求参数，未产生持久化数据。

## 七、结论与建议

本任务发送端修复在测试环境验证通过，满足需求 #3752 的发送端目标。建议：

1. 由父任务 TK-0744 完成接收端数字解析修复部署，消除合法调试头的 ERROR。
2. 开发侧补齐 `lita-framework` 正式制品发布流程，并按依赖升级说明同步其他调用方。
3. 将 `basic-promotion-main` test 提交按规范回补 main，避免 test 分支重置后丢失。

---

**维护人**: Lita R&D Team
