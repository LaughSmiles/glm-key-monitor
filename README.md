# GLM Key Monitor

VS Code 扩展，监控智谱 AI (BigModel) API Key 的使用量，在状态栏实时显示 Token 剩余百分比和重置倒计时。

## 功能特性

- **状态栏实时监控** — 显示 Token 使用百分比进度条 + 距重置的剩余时间
- **详细使用报告** — 点击状态栏打开 Webview 面板，查看配额限制、模型使用量、工具使用量
- **多时间维度查询** — 支持 24 小时 / 7 天 / 30 天时间范围切换
- **自动刷新** — 支持 1/3/5/10/15/30/60 分钟自动刷新间隔
- **倒计时更新** — 每 60 秒自动更新剩余时间，无需额外 API 调用
- **Key 管理** — 在 Webview 内设置/删除 API Key，Key 明文存储
- **窗口聚焦刷新** — 切回 VS Code 窗口时自动刷新数据

## 安装

```bash
# 编译
npm run compile

# 打包为 .vsix
npm run package

# 安装到 VS Code
code --install-extension glm-key-monitor-0.1.0.vsix
```

## 使用方式

### 首次设置

1. 按 `Ctrl+Shift+P` → 输入 `GLM: Set API Key`
2. 粘贴你的智谱 AI API Key
3. 状态栏自动显示使用量

或点击右下角状态栏的 `GLM` 区域，在打开的页面中点击"设置 Key"。

### 命令

| 命令 | 说明 |
|------|------|
| `GLM: Set API Key` | 设置 API Key |
| `GLM: Refresh Usage` | 手动刷新使用量 |
| `GLM: Show Usage Details` | 打开详细使用报告 |

### 配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `glmKeyMonitor.refreshInterval` | `10` | 自动刷新间隔（分钟） |

## 状态栏显示

```
GLM: ████████░░░ 68% | 2h35m后重置
```

- 🟢 绿色 — 使用量 < 70%
- 🟡 黄色 — 使用量 70% ~ 89%
- 🔴 红色 — 使用量 >= 90%

## 使用报告面板

点击状态栏打开 Webview 报告页面，包含：

- **配额限制** — Token 使用量（5小时窗口）+ MCP 使用量（月度）
- **模型使用量** — 总调用次数、总 Token 消耗（支持 24h / 7d / 30d 切换）
- **工具使用量** — 网络搜索、网页读取、ZRead 等工具调用次数明细（支持 24h / 7d / 30d 切换）

## API 端点

扩展调用以下智谱 AI 开放平台接口：

| 接口 | 用途 |
|------|------|
| `/api/monitor/usage/quota/limit` | 查询配额限制 |
| `/api/monitor/usage/model-usage` | 查询模型调用量 |
| `/api/monitor/usage/tool-usage` | 查询工具调用量 |

## 项目结构

```
src/
├── extension.ts      # 扩展入口，命令注册、定时器、刷新逻辑
├── apiClient.ts      # API 客户端，HTTP 请求 + 类型定义
├── dataParser.ts     # 数据解析，配额状态计算 + 格式化工具
├── statusBar.ts      # 状态栏 UI，显示状态管理
├── webviewPanel.ts   # Webview 面板，详细报告页面
└── keyStorage.ts     # Key 持久化存储
```

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式
npm run watch
```

## 要求

- VS Code >= 1.85.0
- 智谱 AI (BigModel) API Key

## License

MIT
