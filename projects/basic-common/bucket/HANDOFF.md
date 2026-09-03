# Bucket 分桶（AB 通用服务）技术交接文档

> 本文以**代码实现为准**整理，与 `docs/bucket/README.md` 存在若干差异，差异汇总见第 9 节。

## 1. 概述

Bucket 是 basic-common 服务提供的通用 AB 分桶服务。业务方在数据库 `bucket_config` 表中为每个 topic 配置多条 Google Aviator 表达式（带优先级），客户端请求接口时，服务端基于请求 Header 中的用户上下文逐条求值，返回所有 topic 的命中值。

整体链路：

```
客户端 Header (L-*)
   │
   ▼
HttpRequestFilter（框架包，全局 Servlet Filter）── 解析 Header → Session（ThreadLocal）
   │
   ▼
BucketController ── POST /v1/bucket/get
   │
   ▼
AbBucketServiceImpl.getAll()
   ├─ Caffeine 缓存（10s）取全量 bucket_config
   ├─ buildEnv() 构建 Aviator 变量表（来自 Session）
   ├─ 按 topic 分组，同 topic 按 priority 升序，首个命中即返回 value
   └─ 未命中返回 "0"
   │
   ▼
R { status: 0, msg: "", data: { topic: value, ... } }
```

## 2. 对外接口

- **方法/路径**：`POST /basic-common/v1/bucket/get`
  - `@PostMapping("get")`（`BucketController.java:18`）
  - `/basic-common` 前缀来自 `application.yml` 的 `server.servlet.context-path`
- **请求参数**：无 body，用户上下文全部通过 Header 传递

| Header | 说明 | 解析目标 |
| --- | --- | --- |
| `L-User-ID` | 当前登录用户 ID | `Session.userID` |
| `L-User-Locale` | 数据大区（如 in、th、ar） | `Session.locale`（`LocaleEnum`） |
| `L-Lang` | 多语言（如 in、zh、en）；缺省时由 locale 推导 | `Session.lang`（`LangEnum`） |
| `L-Trace-ID` | 链路 ID；缺省时自动生成 | `Session.traceID` |
| `L-Version` | 客户端版本号 | `Session.version` |
| `L-App-Platform` | 客户端平台（android / ios / h5 ...） | `Session.platform`（`PlatformEnum`） |
| `L-IP` | 客户端真实 IP；缺省时回退 `X-Forwarded-For` → `X-Real-IP` → remoteAddr | `Session.ip` |
| `L-App-ID` | App 标识（lita / cinta / lite） | `Session.app`（`AppEnum`） |
| `L-Device-ID` | 设备 ID | `Session.device` |

Header 解析由框架包 `gg.lita.framework:web` 的 `HttpRequestFilter`（`@WebFilter("/*")`，`@Order(0)`）完成，Controller 本身不读 Header、不校验登录。

### 响应示例

```json
{
  "status": 0,
  "msg": "",
  "data": {
    "user-voice-ai-call": "1",
    "some-other-topic": "0"
  }
}
```

- 统一响应包装 `R`：`{status: int, msg: string, data: T}`，成功时 `status=0`。
- `data` 为 `LinkedHashMap`，topic 顺序按 SQL 排序（topic 升序）。
- **所有 value 均为字符串**；未命中的 topic 返回 `"0"`。

## 3. 代码结构

### 本仓库（`basic-common`）

| 文件 | 职责 |
| --- | --- |
| `src/main/java/gg/lita/basic/basiccommon/controller/BucketController.java` | HTTP 入口，`/v1/bucket/get`，调用 service 并用 `R` 包装返回 |
| `src/main/java/gg/lita/basic/basiccommon/service/AbBucketService.java` | Service 接口，定义 `Map<String, String> getAll()` |
| `src/main/java/gg/lita/basic/basiccommon/service/impl/AbBucketServiceImpl.java` | 核心实现：Caffeine 缓存、构建 Aviator env、分组求值 |
| `src/main/java/gg/lita/basic/basiccommon/mapper/basic/BucketConfigMapper.java` | MyBatis-Plus Mapper，注解 SQL 全量拉取配置 |
| `src/main/java/gg/lita/basic/basiccommon/model/basic/BucketConfig.java` | `bucket_config` 表实体 |
| `src/main/java/gg/lita/basic/basiccommon/component/BasicDataSourceConfiguration.java` | `basic` 数据源（HikariCP → `lita_basic` 库），`@MapperScan` 扫描 `mapper.basic` 包 |

### 框架包（`gg.lita.framework:web:1.0.0`，本地 Maven 仓库）

| 类 | 职责 |
| --- | --- |
| `HttpRequestFilter` | 全局 Filter，解析 `L-*` Header 写入 `Session` ThreadLocal，并写 MDC |
| `Session` | 用户上下文（ThreadLocal 持有）：userID / app / locale / lang / platform / version / ip / device / traceID 等 |
| `R<T>` | 统一响应包装 |
| `BaseController` | 控制器基类（本模块未使用其方法） |

### 技术栈

- Java 21，Spring Boot 3.3.2（父 POM 继承链：`basic-public-parent` → `web-parent-pom` → `spring-boot-starter-parent`）
- `com.googlecode.aviator:aviator:5.4.3`（`pom.xml:52-56`）
- Caffeine 3.1.8、MyBatis-Plus 3.5.7、mysql-connector-j 9.0.0（父 POM 引入）

## 4. 核心实现细节

### 4.1 求值主流程（`AbBucketServiceImpl.getAll()`，第 35-54 行）

```java
List<BucketConfig> configs = configCache.get("all", k -> baseMapper.getAll());
Map<String, Object> env = buildEnv();          // 每请求构建一次，所有表达式复用
// 按 topic 分组（LinkedHashMap 保序），同 topic 内已按 priority 升序
// 逐条 evaluate，首个命中即取值并 break；未命中默认 "0"
```

要点：

- **排序不在 Java 侧做**，依赖 SQL：`select * from bucket_config order by topic asc, priority asc`（`BucketConfigMapper.java:12`）。
- 同 topic 只取**最高优先级（数字最小）的一条命中**，DB 唯一键 `idx_topic_priority(topic, priority)` 保证同 topic 优先级不重复。
- 分组用 `LinkedHashMap`，响应中 topic 顺序与 SQL 排序一致。

### 4.2 表达式求值（`evaluate()`，第 56-73 行）

```java
Object result = AviatorEvaluator.execute(expression, env, true);  // cached=true
```

- **编译缓存**：第三个参数 `cached=true`，编译产物由 Aviator 内部缓存（key 为表达式文本，LRU，默认容量 65536）管理，业务代码不自行缓存。
- **结果判定宽松**：
  - `Boolean` → 直接使用；
  - `Number` → 非 0 即真；
  - 其他类型 → 非 null 即真。
  - ⚠️ 意味着写 `1` 这类非布尔表达式也会命中，**配置时应约定只写布尔表达式**。
- **兜底策略**：
  - 空 / 空白 `condition` → 直接不命中；
  - 任何异常（语法错误、变量类型不符等）→ `log.warn("AB表达式求值失败 ...")` 并视为不命中，不影响其他 topic。
  - ⚠️ 配置写错时**静默失败**，只能通过日志排查。

### 4.3 变量注入（`buildEnv()`，第 75-87 行）

见第 6 节变量表。其中 `session.getUserID64()`：userID 为空或 `Long.parseLong` 失败时**静默返回 `0L`**，因此未登录/异常用户的 `user` 变量恒为 `0`。

## 5. 缓存机制

存在**两层相互独立的缓存**：

| 层 | 实现 | 说明 |
| --- | --- | --- |
| 配置缓存 | Caffeine，`expireAfterWrite(10s)`，单 key `"all"`（`AbBucketServiceImpl.java:30-32`） | **惰性加载**：无定时刷新，过期后第一个请求同步查库回填。`cache.get(key, fn)` 对同 key 原子加载，过期瞬间无并发回源放大 |
| 表达式编译缓存 | Aviator 内部缓存（`execute(expr, env, true)`） | key 为表达式文本；配置 10 秒刷新后文本变化才产生新编译项，旧项靠 LRU 自然淘汰 |

**生效延迟**：多实例部署时各实例各自缓存，配置变更最长约 **10 秒/实例** 生效。

## 6. 表达式可用变量（以代码为准）

`buildEnv()` 实际注入 **8 个变量**：

| 变量 | 类型 | 来源 | 取值说明 / 缺省 |
| --- | --- | --- | --- |
| `user` | long | `L-User-ID` | 用户 ID 的数字形式；**解析失败/未登录为 `0`** |
| `locale` | String | `L-User-Locale` | 小写码，如 `'in'`、`'th'`、`'ar'`；未知为 `'unknown'` |
| `lang` | String | `L-Lang`（缺省时由 locale 推导） | 如 `'in'`、`'zh'`、`'en'` |
| `platform` | String | `L-App-Platform` | ⚠️ **数字字符串**：Android=`'1'`、IOS=`'2'`、Browser=`'3'`、Internal=`'4'`、Unknown=`'0'` |
| `ip` | String | `L-IP` | 客户端 IP |
| `app` | String | `L-App-ID` | `'Lita'` / `'Cinta'` / `'Lite'` / `'Unknown'` |
| `version` | String | `L-Version` | 客户端版本号 |
| `device` | String | `L-Device-ID` | 设备 ID |

`L-App-Platform` 的归一化：`PlatformEnum.from()` 将 header 值小写后按别名匹配（`ios/iphone/2`→IOS，`android/1`→Android，`h5/web/browser/3`→Browser，`internal/4`→Internal），匹配不到为 `Unknown`。

### 表达式示例

```
user % 100 < 10                          -- 按用户 ID 尾号分 10% 灰度
user == 0                                -- 未登录用户
app == 'Lita'                            -- 仅 Lita App
platform == '2'                          -- 仅 iOS（注意是数字字符串）
locale == 'in' && lang == 'en'           -- 印尼大区 + 英文
string.compareTo(version, '8.20.0') >= 0 -- 版本号不低于 8.20.0（字典序比较，注意位数）
```

## 7. 数据库表结构与实体映射

表：`lita_basic.bucket_config`（DDL 见 `README.md` 或 `BucketConfig.java` 类注释）。

| 列 | 说明 | 实体字段 |
| --- | --- | --- |
| `id` | 自增主键 | `Long id` |
| `topic` | 分组名称 | `String topic` |
| `condition` | Aviator 表达式 | `String condition` |
| `value` | 命中后的值（DB 为 `int unsigned`） | ⚠️ `String value`（类型转换，故接口返回字符串） |
| `description` | 描述 | `String description` |
| `priority` | 优先级，数字越小越高 | `Integer priority` |
| `create_time` / `update_time` | 时间戳（bigint） | `long createTime` / `long updateTime`（MyBatis-Plus 默认驼峰映射） |

唯一键 `idx_topic_priority(topic, priority)`：同 topic 下优先级不可重复，保证排序语义稳定。

## 8. 配置使用指南

### 新增一个分桶规则

1. 向 `bucket_config` 插入记录：`topic`（分组名）、`condition`（Aviator 表达式）、`priority`、`value`、`description`。
2. 同 topic 可配多条规则，按 `priority` 数字从小到大依次判断，首个命中返回其 `value`；全部未命中返回 `"0"`。
3. 配置最长 10 秒后生效（各实例独立）。

### 注意事项

- **只写布尔表达式**（求值结果判定宽松，非布尔也会被当命中处理，容易误配）。
- 平台判断写 `platform == '2'`，**不是** `platform == 'IOS'`。
- 表达式中可用 `user == 0` 判未登录，但注意与真实 ID 0 无法区分。
- 表达式写错会**静默不命中**，排查关键字：日志 `AB表达式求值失败`。
- 空 `condition` 的记录永远不命中，可用来占位/停用某条规则。
- `traceID` **不可用于表达式**（未注入 env）。

## 9. 与 README 的差异汇总

| # | README 描述 | 代码实现 |
| --- | --- | --- |
| 1 | `GET /basic-common/v1/bucket/get` | 实际是 **`@PostMapping`**（`BucketController.java:18`），调用方必须用 POST |
| 2 | 变量 `userID`（字符串）、`userID64`（数字） | 实际只有 **`user`**（long 类型）一个变量 |
| 3 | 变量 `traceID` | **未注入** env，表达式不可用 |
| 4 | 变量表 9 项 | 实际 8 项，额外提供 README 未写的 **`device`** |
| 5 | `platform` 取值 `Android/IOS/Browser` | 实际是**数字字符串** `'1'/'2'/'3'`（`PlatformEnum.toString()` 返回 int value 的字符串） |
| 6 | 未命中返回 `0` | 实际返回**字符串 `"0"`**；`value` 列在实体/接口中均为 String |

## 10. 运维与排障

- **配置不生效**：等待 ≥10 秒（缓存过期）；确认表达式语法正确（看 `AB表达式求值失败` warn 日志）。
- **topic 缺失**：该 topic 在 `bucket_config` 中无任何记录时，响应中不会出现该 key（只对库里存在的 topic 求值）。
- **测试现状**：本模块无任何单元/集成测试，`src/test` 下测试均与 bucket 无关。
