import * as vscode from 'vscode';
import { getQuotaLimit, getModelUsage, getToolUsage, TokenLimit } from './apiClient';
import { formatProgressBar, formatRemainingTime, formatNumber, getStatusColor } from './dataParser';
import { getKey, setKey, deleteKey as deleteStoredKey } from './keyStorage';

let currentPanel: vscode.WebviewPanel | undefined;
let panelContext: vscode.ExtensionContext | undefined;
let currentApiKey: string | undefined;
let panelDisposables: vscode.Disposable[] = [];

const INTERVAL_OPTIONS = [1, 3, 5, 10, 15, 30, 60];
const TIME_RANGE_OPTIONS = [24, 168, 720];
const TIME_RANGE_LABELS: Record<number, string> = { 24: '24 小时', 168: '7 天', 720: '30 天' };
let currentTimeRange = 24;

export async function showUsageDetails(context: vscode.ExtensionContext, apiKey?: string): Promise<void> {
    panelContext = context;
    if (apiKey) { currentApiKey = apiKey; }

    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Two);
        if (apiKey) {
            await loadUsageData(apiKey, currentTimeRange);
        } else {
            const currentInterval = vscode.workspace.getConfiguration('glmKeyMonitor').get<number>('refreshInterval', 10);
            currentPanel.webview.html = getNoKeyHtml(currentInterval);
        }
    } else {
        // 清理旧的 disposables
        panelDisposables.forEach(d => d.dispose());
        panelDisposables = [];

        currentPanel = vscode.window.createWebviewPanel(
            'glmUsageDetails',
            'GLM API 使用量报告',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        // 所有面板相关的 disposable 统一管理
        panelDisposables.push(currentPanel);
        panelDisposables.push(currentPanel.onDidDispose(() => {
            currentPanel = undefined;
            panelContext = undefined;
            panelDisposables.forEach(d => d.dispose());
            panelDisposables = [];
        }));

        // 监听 webview 消息
        panelDisposables.push(currentPanel.webview.onDidReceiveMessage(async (msg) => {
            if (!panelContext) { return; }

            if (msg.command === 'refresh') {
                const key = await getKey(panelContext);
                if (key) {
                    await loadUsageData(key, currentTimeRange);
                }
            } else if (msg.command === 'setKey') {
                const input = await vscode.window.showInputBox({
                    prompt: '请输入你的 GLM API Key',
                    ignoreFocusOut: true,
                    validateInput: (value) => value && value.trim().length > 0 ? undefined : 'API Key 不能为空'
                });
                if (input && panelContext) {
                    currentApiKey = input.trim();
                    await setKey(panelContext, input.trim());
                    vscode.window.showInformationMessage('GLM API Key 已保存');
                    await loadUsageData(input.trim(), currentTimeRange);
                    vscode.commands.executeCommand('glmKeyMonitor.refresh');
                }
            } else if (msg.command === 'deleteKey') {
                const confirm = await vscode.window.showWarningMessage(
                    '确定要删除已保存的 GLM API Key 吗？',
                    { modal: true },
                    '删除'
                );
                if (confirm === '删除' && panelContext) {
                    await deleteStoredKey(panelContext);
                    currentApiKey = undefined;
                    vscode.window.showInformationMessage('GLM API Key 已删除');
                    vscode.commands.executeCommand('glmKeyMonitor.clearStatus');
                    if (currentPanel) {
                        currentPanel.dispose();
                    }
                }
            } else if (msg.command === 'setInterval') {
                const minutes = msg.value as number;
                const config = vscode.workspace.getConfiguration('glmKeyMonitor');
                await config.update('refreshInterval', minutes, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`自动刷新间隔已设置为 ${minutes} 分钟`);
            } else if (msg.command === 'setTimeRange') {
                const hours = msg.value as number;
                currentTimeRange = hours;
                const key = await getKey(panelContext);
                if (key) {
                    await loadUsageData(key, hours);
                }
            }
        }));

        if (apiKey) {
            await loadUsageData(apiKey, currentTimeRange);
        } else {
            const currentInterval = vscode.workspace.getConfiguration('glmKeyMonitor').get<number>('refreshInterval', 10);
            currentPanel.webview.html = getNoKeyHtml(currentInterval);
        }
    }
}

async function loadUsageData(apiKey: string, timeRange: number = 24): Promise<void> {
    if (!currentPanel) { return; }

    const currentInterval = vscode.workspace.getConfiguration('glmKeyMonitor').get<number>('refreshInterval', 10);
    currentPanel.webview.html = getLoadingHtml(currentInterval, timeRange);

    try {
        const endTime = formatDateTime(new Date());
        const startTime = formatDateTime(new Date(Date.now() - timeRange * 60 * 60 * 1000));

        const [quotaResult, modelResult, toolResult] = await Promise.all([
            getQuotaLimit(apiKey),
            getModelUsage(apiKey, startTime, endTime),
            getToolUsage(apiKey, startTime, endTime)
        ]);

        if (currentPanel) {
            currentPanel.webview.html = generateReportHtml(quotaResult, modelResult, toolResult, currentInterval, timeRange);
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        if (currentPanel) {
            currentPanel.webview.html = getErrorHtml(errorMsg, currentInterval, timeRange);
        }
    }
}

// ==================== HTML 生成函数 ====================

function getBarColorClass(pct: number): string {
    const color = getStatusColor(pct);
    return color === 'red' ? 'bar-red' : color === 'yellow' ? 'bar-yellow' : 'bar-green';
}

function wrapHtml(bodyContent: string, currentInterval: number = 10, timeRange: number = 24): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${getCommonStyles()}</style></head><body>
${getToolbarHtml(currentInterval, timeRange)}
${bodyContent}
${getScript()}
</body></html>`;
}

function getCommonStyles(): string {
    return `
  body { background:var(--vscode-editor-background); color:var(--vscode-editor-foreground); font-family:var(--vscode-font-family); padding:20px; margin:0; }
  h1, h2, h3 { color:var(--vscode-editor-foreground); margin-top:24px; }
  .toolbar { display:flex; gap:8px; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--vscode-panel-border); flex-wrap:wrap; }
  .btn { background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none; padding:6px 14px; border-radius:3px; cursor:pointer; font-size:13px; }
  .btn:hover { background:var(--vscode-button-hoverBackground); }
  .btn-secondary { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); }
  .btn-secondary:hover { background:var(--vscode-button-secondaryHoverBackground); }
  .interval-group { display:flex; align-items:center; gap:4px; font-size:13px; color:var(--vscode-descriptionForeground); }
  .interval-group select { background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border); border-radius:3px; padding:3px 8px; font-size:13px; }
  .key-display { font-size:13px; color:var(--vscode-descriptionForeground); font-family:var(--vscode-editor-font-family); margin-left:auto; }
  .section { border:1px solid var(--vscode-panel-border); border-radius:6px; padding:16px; margin:12px 0; }
  .bar-container { background:var(--vscode-input-background); border-radius:4px; padding:2px; margin:4px 0; }
  .bar-fill { height:18px; border-radius:3px; transition:width 0.3s; }
  .bar-green { background:#4EC9B0; }
  .bar-yellow { background:#CE9178; }
  .bar-red { background:#F44747; }
  table { width:100%; border-collapse:collapse; margin:8px 0; }
  td, th { padding:6px 12px; border-bottom:1px solid var(--vscode-panel-border); text-align:left; }
  .label { color:var(--vscode-descriptionForeground); }
  .value { font-weight:bold; }
  .error { color:#F44747; }
  .spinner { display:inline-block; width:16px; height:16px; border:2px solid var(--vscode-descriptionForeground); border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; vertical-align:middle; margin-right:8px; }
  @keyframes spin { to { transform:rotate(360deg); } }
`;
}

function getToolbarHtml(currentInterval: number, currentTimeRange: number = 24): string {
    const options = INTERVAL_OPTIONS.map(m =>
        `<option value="${m}" ${m === currentInterval ? 'selected' : ''}>${m} 分钟</option>`
    ).join('');

    const timeRangeOptions = TIME_RANGE_OPTIONS.map(h =>
        `<option value="${h}" ${h === currentTimeRange ? 'selected' : ''}>${TIME_RANGE_LABELS[h]}</option>`
    ).join('');

    const keyDisplay = currentApiKey || '未设置';

    return `<div class="toolbar">
  <button class="btn" onclick="refresh()">🔄 刷新</button>
  <button class="btn btn-secondary" onclick="setKey()">🔑 设置 Key</button>
  <button class="btn btn-secondary" onclick="deleteKey()">🗑️ 删除 Key</button>
  <span class="key-display">Key: ${keyDisplay}</span>
  <div class="interval-group">
    <span>📅 查询范围:</span>
    <select onchange="changeTimeRange(this.value)">${timeRangeOptions}</select>
  </div>
  <div class="interval-group">
    <span>⏱ 自动刷新:</span>
    <select onchange="changeInterval(this.value)">${options}</select>
  </div>
</div>`;
}

function getScript(): string {
    return `<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function setKey() { vscode.postMessage({ command: 'setKey' }); }
function deleteKey() { vscode.postMessage({ command: 'deleteKey' }); }
function changeInterval(val) { vscode.postMessage({ command: 'setInterval', value: parseInt(val) }); }
function changeTimeRange(val) { vscode.postMessage({ command: 'setTimeRange', value: parseInt(val) }); }
</script>`;
}

function getNoKeyHtml(currentInterval: number = 10): string {
    return wrapHtml(`<div class="section" style="text-align:center; padding:40px 20px;">
  <h2>🔑 未设置 API Key</h2>
  <p style="color:var(--vscode-descriptionForeground); margin:16px 0;">请先设置你的 GLM API Key 以查看使用量数据</p>
  <button class="btn" style="font-size:15px; padding:10px 24px;" onclick="setKey()">🔑 设置 API Key</button>
</div>`, currentInterval, currentTimeRange);
}

function getLoadingHtml(currentInterval: number = 10, timeRange: number = 24): string {
    return wrapHtml(`<p><span class="spinner"></span>正在加载使用量数据...</p>`, currentInterval, timeRange);
}

function getErrorHtml(error: string, currentInterval: number = 10, timeRange: number = 24): string {
    return wrapHtml(`<h2 class="error">查询失败</h2><p>${error}</p>`, currentInterval, timeRange);
}

function generateReportHtml(
    quota: { code: number; msg?: string; data?: { level: string; limits: TokenLimit[] } },
    model: { code: number; msg?: string; data?: any },
    tool: { code: number; msg?: string; data?: any },
    currentInterval: number = 10,
    timeRange: number = 24
): string {
    let html = `<h1>GLM API 使用量报告</h1>`;

    // Quota section
    if (quota.code === 200 && quota.data) {
        const { level, limits } = quota.data;
        html += `<div class="section"><h2>配额限制</h2>`;
        html += `<p><span class="label">账户等级:</span> <span class="value">${level}</span></p>`;

        const tokenLimits = limits.filter(l => l.type === 'TOKENS_LIMIT');
        if (tokenLimits.length > 0) {
            const current = tokenLimits.reduce((a, b) => a.nextResetTime < b.nextResetTime ? a : b);
            const pct = current.percentage;
            const barColor = getBarColorClass(pct);

            html += `<h3>Token 使用量 (5小时窗口)</h3>`;
            html += `<div class="bar-container"><div class="bar-fill ${barColor}" style="width:${Math.min(pct, 100)}%"></div></div>`;
            html += `<p>${formatProgressBar(pct)} ${pct}% | ${formatRemainingTime(current.nextResetTime)}</p>`;
        }

        for (const limit of limits) {
            if (limit.type === 'TIME_LIMIT') {
                const pct = limit.percentage;
                const barColor = getBarColorClass(pct);
                html += `<h3>MCP 使用量 (月度)</h3>`;
                html += `<div class="bar-container"><div class="bar-fill ${barColor}" style="width:${Math.min(pct, 100)}%"></div></div>`;
                html += `<p>${formatProgressBar(pct)} ${pct}%</p>`;
                if (limit.usageDetails) {
                    html += `<table><tr><th>工具</th><th>使用次数</th></tr>`;
                    for (const d of limit.usageDetails) {
                        if (d.usage > 0) {
                            html += `<tr><td>${d.modelCode}</td><td>${formatNumber(d.usage)}</td></tr>`;
                        }
                    }
                    html += `</table>`;
                }
            }
        }
        html += `</div>`;
    } else {
        html += `<div class="section"><p class="error">配额查询失败: ${quota.msg || 'Unknown'}</p></div>`;
    }

    // Model usage section
    if (model.code === 200 && model.data) {
        const { totalUsage } = model.data;
        html += `<div class="section"><h2>模型使用量</h2>`;
        html += `<table>
          <tr><td class="label">总调用次数</td><td class="value">${formatNumber(totalUsage.totalModelCallCount)} 次</td></tr>
          <tr><td class="label">总Token消耗</td><td class="value">${formatNumber(totalUsage.totalTokensUsage)}</td></tr>
        </table></div>`;
    } else {
        html += `<div class="section"><p class="error">模型使用量查询失败: ${model.msg || 'Unknown'}</p></div>`;
    }

    // Tool usage section
    if (tool.code === 200 && tool.data) {
        const { totalUsage } = tool.data;
        html += `<div class="section"><h2>工具使用量</h2>`;
        html += `<table>
          <tr><td class="label">网络搜索</td><td class="value">${formatNumber(totalUsage.totalNetworkSearchCount)} 次</td></tr>
          <tr><td class="label">网页读取</td><td class="value">${formatNumber(totalUsage.totalWebReadMcpCount)} 次</td></tr>
          <tr><td class="label">ZRead 工具</td><td class="value">${formatNumber(totalUsage.totalZreadMcpCount)} 次</td></tr>
        </table>`;

        if (totalUsage.toolDetails && totalUsage.toolDetails.length > 0) {
            html += `<h3>工具明细</h3><table><tr><th>工具</th><th>使用次数</th></tr>`;
            for (const t of totalUsage.toolDetails) {
                html += `<tr><td>${t.modelName}</td><td>${formatNumber(t.totalUsageCount)}</td></tr>`;
            }
            html += `</table>`;
        }
        html += `</div>`;
    } else {
        html += `<div class="section"><p class="error">工具使用量查询失败: ${tool.msg || 'Unknown'}</p></div>`;
    }

    return wrapHtml(html, currentInterval, timeRange);
}

function formatDateTime(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
