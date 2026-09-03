# 导出脚本编写说明

数据导出脚本（`.export.ts`）基于 `ExportBaseClass`（`src/base/ExportBaseClass.ts`）编写，输出协议与 `CheckBaseClass` 完全兼容（`start` / `act` / `done`），并额外增加 `files` 类型。

## 命名与位置

- 后缀名：`xxxxxx.export.ts`
- 位置：`projects/<category>/<activity>/exports/`（与 `checks/`、`tests/` 平级）
- 运行：

```bash
node xxxxxxx.export.ts --output-dir=xxxxx [--format=csv]
```

## 命令行参数

| 参数 | 必填 | 说明 |
|:---|:---|:---|
| `--output-dir=<dir>` | 是 | 输出目录，不存在自动创建；**缺失时脚本直接 fail（不执行 run()）** |
| `--format=<fmt>` | 否 | 输出格式，默认 `csv`；支持 `csv` / `xlsx` / `json` / `yaml` / `json-line` / `markdown`；**非法值直接 fail** |

## 基类 API

### export(title, data, opts?)

导出数据，每个调用为一个 `act` 步骤（计入 total，成功/失败走标准协议）：

```ts
protected async export(
  title: string,
  data: Record<string, unknown>[],
  opts?: { columns?: ExportColumn[]; filename?: string },
): Promise<string> // 返回相对 output-dir 的文件名
```

- `title` — 步骤标题；也是默认文件名（slug 化 + 当前格式扩展名）
- `data` — 行数据（对象数组）
- `opts.columns` — 列定义 `ExportColumn = { key: string; header?: string }`；缺省取数据行对象的键序（前 20 行取并集），表头默认同 `key`
- `opts.filename` — 自定义文件名；扩展名会被**强制替换**为当前格式扩展名（传 `a.csv` + `--format=xlsx` 得到 `a.xlsx`）

### 通用序列化方法

| 方法 | 说明 |
|:---|:---|
| `toCsv(data, columns)` | RFC 4180 转义，UTF-8 带 BOM（Excel 直接打开中文不乱码），CRLF 换行 |
| `toXlsx(data, columns)` | 基于 exceljs，单 sheet |
| `toJson(data)` | JSON 数组，两空格缩进 |
| `toJsonLine(data)` | 每行一个 JSON 对象（`.jsonl`） |
| `toYaml(data)` | 最小实现，支持嵌套数组/对象，不安全标量自动加引号 |
| `toMarkdown(data, columns)` | Markdown 表格，`\|` 转义为 `\\\|`，换行转 `<br>` |

`null/undefined` 序列化为空串（csv/markdown）或 `null`（yaml）。格式由 `--format` 统一决定，写入 `outputDir` 前自动 `mkdir -p`。

## 编写模板

```ts
import { ExportBaseClass, type ExportColumn } from '../../../../src/base/ExportBaseClass.ts';

class XxxExport extends ExportBaseClass {
  constructor() {
    super();
    this.total = 2; // export() 调用次数
  }

  protected async run(): Promise<void> {
    const columns: ExportColumn[] = [
      { key: 'player', header: '玩家ID' },
      { key: 'score', header: '积分' },
    ];
    const data = [/* ...查询得到的数据... */];
    await this.export('榜单数据', data, { columns });       // 榜单数据.csv
    await this.export('发奖记录', awardData);               // 发奖记录.csv（列自动推断）
  }
}

await new XxxExport().execute();
```

可完整运行的示例见 `projects/active/pk/exports/sample.export.ts`。

## 输出协议示例

```
[start] {"total":2,"time":0,"startTime":"2026-09-03T03:30:48.508Z"}
[log] 已导出 3 行 → rank-sample.xlsx
[act] {"no":1,"title":"[导出] 榜单数据","status":"success","message":"","time":14}
[act] {"no":2,"title":"[导出] 发奖记录","status":"success","message":"","time":19}
[files] [{"title":"榜单数据","file":"rank-sample.xlsx"},{"title":"发奖记录","file":"发奖记录.xlsx"}]
[done] {"status":"success","total":2,"success":2,"fail":0,"skip":0,"message":"","time":20,"cost":20}
```

- `files` 行在 `run()` 结束后、`done` 之前输出**一次**，`data` 为所有导出文件的 `{title, file}` 数组，`file` 为相对 `output-dir` 的文件名。
- 在 `run()` 内也可照常使用 `act()` / `check()` / `log()` / `skip()`（继承自 `CheckBaseClass`）。
