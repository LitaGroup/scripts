# scripts

脚本仓库，脚本主要接入 <http://project.cinta.team/> 平台执行，遵循统一的输出协议（见 [AGENTS.md](AGENTS.md)）。

## 脚本场景

| 场景 | 说明 | 位置 |
|:---|:---|:---|
| 线下测试 | 测试环境的自动化测试用例（`.test.ts`） | `projects/<category>/<activity>/tests/` |
| 线上检查 | 生产环境健康检查（`.check.ts`） | `projects/<category>/<activity>/checks/` |
| 数据导出 | 数据查询/导出脚本 | 按项目放置 |

## 技术栈

- **TypeScript**，Node.js v24+ 原生类型剥离，直接运行，无需编译：
  ```bash
  node xxxxx.ts {parameters}
  ```
- ESM 模块（`package.json` 中 `"type": "module"`），本地 `.ts` 导入必须带 `.ts` 后缀。

## 编写方式

脚本基于公共基类编写，共享三层架构：

1. **资源层**（`src/resources/`）— MySQL / Redis / Nacos / API / Appium 连接器
2. **服务层**（`src/services/`）— 环境感知的业务实现（`'prod' | 'test'`）
3. **业务层**（`src/base/`）— `CheckBaseClass` / `AppBaseClass` 基类，统一 `act`/`check` 步骤与输出协议

参考示例：

- `projects/active/pk/` — 活动脚本示例（`tests/` 测试用例、`checks/` 线上检查）
- `projects/app/sample/` — APP 端（Appium）脚本示例

## 项目交接

从业务项目到脚本的衔接使用交接文档 **HANDOFF.md**，由各自项目自行生成并放在项目目录下，例如：

- `projects/active/ticket/HANDOFF.md`
- `projects/active/crazy-lamb/HANDOFF.md`

## 目录结构

```
projects/
  active/          # 活动类项目（tests/ + checks/）
  app/             # APP 端 Appium 脚本（文件名区分平台/flavor/类型）
src/
  resources/       # 资源层
  services/        # 服务层
  base/            # 业务基类
config.example.json       # 配置模板（secrets 放 config.json，gitignored）
config.app.example.json   # APP 脚本配置模板
docs/              # 补充文档（如 APP 脚本约定）
```

更多约定（命名、输出协议、环境耦合等）详见 [AGENTS.md](AGENTS.md)。
