# GLM Key Monitor

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

VS Code 扩展，监控智谱 AI (BigModel) API Key 的使用量，在状态栏实时显示 Token 剩余百分比和重置倒计时，并提供多模型并发测速功能。

## 功能特性

- **状态栏实时监控** — 显示 Token 使用百分比进度条 + 距重置的剩余时间
- **详细使用报告** — 点击状态栏打开 Webview 面板，查看配额限制、模型使用量、工具使用量
- **多模型测速** — 对比不同 GLM 模型的响应速度（首 Token 时间、总耗时、生成速度）
- **并发测试** — 支持 1~8 线程并发测速，大幅缩短总测试时间
- **模型管理** — 预设 glm-4.7/glm-5/glm-5-turbo/glm-5.1，支持手动添加自定义模型，配置跨会话持久化
- **多时间维度查询** — 支持 24 小时 / 7 天 / 30 天时间范围切换
- **自动刷新** — 支持 1/3/5/10/15/30/60 分钟自动刷新间隔
- **倒计时更新** — 每 60 秒自动更新剩余时间，无需额外 API 调用
- **Key 安全管理** — API Key 默认脱敏显示（`abcdef****wxyz`），点击切换明文
- **后台测速** — 关闭面板后测速继续执行，完成后弹通知提醒
- **窗口聚焦刷新** — 切回 VS Code 窗口时自动刷新数据

## 安装

从源码构建：

```bash
git clone https://github.com/LaughSmiles/glm-key-monitor.git
cd glm-key-monitor
npm install
npm run compile
npm run package
code --install-extension glm-key-monitor-0.1.0.vsix
```

或直接下载 [latest release](https://github.com/LaughSmiles/glm-key-monitor/releases) 的 `.vsix` 文件，在编辑器中 `Ctrl+Shift+P` → `Extensions: Install from VSIX...`。

## 使用方式

### 首次设置

1. 按 `Ctrl+Shift+P` → 输入 `GLM: Set API Key`
2. 粘贴你的智谱 AI API Key（[获取地址](https://open.bigmodel.cn/usercenter/apikeys)）
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
| `glmKeyMonitor.speedTestModels` | `["glm-4.7","glm-5","glm-5-turbo","glm-5.1"]` | 测速模型列表 |

## 状态栏显示

```
GLM: ████████░░░ 68% | 2h35m后重置
```

| 颜色 | 条件 |
|------|------|
| 绿色 | 使用量 < 70% |
| 黄色 | 使用量 70% ~ 89% |
| 红色 | 使用量 >= 90% |

## 使用报告面板

点击状态栏打开 Webview 报告页面，包含：

- **配额限制** — Token 使用量（5小时窗口）+ MCP 使用量（月度）
- **模型使用量** — 总调用次数、总 Token 消耗（支持 24h / 7d / 30d 切换）
- **工具使用量** — 网络搜索、网页读取、ZRead 等工具调用次数明细（支持 24h / 7d / 30d 切换）
- **模型测速** — 多模型并发测速，实时进度条，结果汇总对比（最快模型标记）

### 测速功能

测速使用智谱 AI 的 Anthropic 兼容接口（`open.bigmodel.cn/api/anthropic`），不消耗账户余额。

测速指标：
| 指标 | 说明 |
|------|------|
| 首 Token 时间 (TTFT) | 从发请求到收到第一个字符的耗时 |
| 总耗时 | 完整响应时间 |
| 生成速度 | 字符数/秒 (c/s) |

支持 1~8 线程并发测试，关闭面板后测速在后台继续执行，完成后弹出通知。

## API 端点

扩展调用以下智谱 AI 开放平台接口：

| 接口 | 用途 |
|------|------|
| `/api/monitor/usage/quota/limit` | 查询配额限制 |
| `/api/monitor/usage/model-usage` | 查询模型调用量 |
| `/api/monitor/usage/tool-usage` | 查询工具调用量 |
| `/api/anthropic/v1/messages` | 测速（Anthropic 兼容接口） |

## 项目结构

```
src/
├── extension.ts      # 扩展入口，命令注册、定时器、刷新逻辑
├── apiClient.ts      # API 客户端，HTTP 请求 + 类型定义
├── dataParser.ts     # 数据解析，配额状态计算 + 格式化工具
├── statusBar.ts      # 状态栏 UI，显示状态管理
├── webviewPanel.ts   # Webview 面板，报告页面 + 测速区块
├── speedTest.ts      # 测速核心，SSE 流式请求 + 并发管理
└── keyStorage.ts     # Key 持久化存储
```

## 开发

```bash
npm install
npm run compile    # 编译
npm run watch      # 监听模式
npm run package    # 打包 VSIX
```

按 `F5` 在 VS Code 扩展开发宿主中调试。

## 要求

- VS Code >= 1.85.0
- 智谱 AI (BigModel) API Key

## License

MIT
