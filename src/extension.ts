import * as vscode from 'vscode';
import { getKey, setKey } from './keyStorage';
import { getQuotaLimit } from './apiClient';
import { parseQuotaStatus, QuotaStatus, formatRemainingTime } from './dataParser';
import { createStatusBarItem, updateStatusBar } from './statusBar';
import { showUsageDetails } from './webviewPanel';

let refreshTimer: ReturnType<typeof setInterval> | undefined;
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let isLoading = false;
let lastQuotaStatus: QuotaStatus | null = null;
let statusBarItem: vscode.StatusBarItem | undefined;
let refreshGeneration = 0;

export async function activate(context: vscode.ExtensionContext) {
    statusBarItem = createStatusBarItem();
    statusBarItem.show();
    updateStatusBar(statusBarItem, { type: 'empty', message: '未设置 Key' });
    context.subscriptions.push(statusBarItem);

    // Check for stored key and refresh on activation
    const storedKey = await getKey(context);
    if (storedKey) {
        refreshQuota(context, statusBarItem);
    }

    // Register command: Set API Key
    const setKeyCommand = vscode.commands.registerCommand('glmKeyMonitor.setKey', async () => {
        const input = await vscode.window.showInputBox({
            prompt: '请输入你的 GLM API Key',
            ignoreFocusOut: true,
            validateInput: (value) => value && value.trim().length > 0 ? undefined : 'API Key 不能为空'
        });
        if (input) {
            await setKey(context, input.trim());
            vscode.window.showInformationMessage('GLM API Key 已保存');
            refreshQuota(context, statusBarItem!);
        }
    });
    context.subscriptions.push(setKeyCommand);

    // Register command: Refresh
    const refreshCommand = vscode.commands.registerCommand('glmKeyMonitor.refresh', () => {
        refreshQuota(context, statusBarItem!);
    });
    context.subscriptions.push(refreshCommand);

    // Register command: Clear Status (called when key is deleted)
    const clearStatusCommand = vscode.commands.registerCommand('glmKeyMonitor.clearStatus', () => {
        refreshGeneration++;
        lastQuotaStatus = null;
        isLoading = false;
        if (statusBarItem) {
            updateStatusBar(statusBarItem, { type: 'empty', message: '未设置 Key' });
        }
    });
    context.subscriptions.push(clearStatusCommand);

    // Register command: Show Usage Details
    const detailsCommand = vscode.commands.registerCommand('glmKeyMonitor.showUsageDetails', async () => {
        const apiKey = await getKey(context);
        await showUsageDetails(context, apiKey);
    });
    context.subscriptions.push(detailsCommand);

    // Start auto-refresh timer
    startRefreshTimer(context, statusBarItem);

    // Start countdown timer (update status bar every 60s)
    startCountdownTimer(statusBarItem);

    // Refresh on window focus
    const focusDisposable = vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
            refreshQuota(context, statusBarItem!);
        }
    });
    context.subscriptions.push(focusDisposable);

    // Restart timer on config change
    const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('glmKeyMonitor.refreshInterval')) {
            startRefreshTimer(context, statusBarItem!);
        }
    });
    context.subscriptions.push(configDisposable);
}

async function refreshQuota(context: vscode.ExtensionContext, item: vscode.StatusBarItem) {
    if (isLoading) {
        return;
    }

    const apiKey = await getKey(context);
    if (!apiKey) {
        updateStatusBar(item, { type: 'empty', message: '未设置 Key' });
        lastQuotaStatus = null;
        return;
    }

    isLoading = true;
    const thisGeneration = refreshGeneration;
    updateStatusBar(item, { type: 'loading' });

    try {
        const result = await getQuotaLimit(apiKey);
        // 如果在请求期间 Key 被删除，丢弃旧结果
        if (thisGeneration !== refreshGeneration) {
            return;
        }
        if (result.code === 200 && result.data) {
            const quotaStatus = parseQuotaStatus(result.data);
            if (quotaStatus) {
                lastQuotaStatus = quotaStatus;
                updateStatusBar(item, { type: 'quota', status: quotaStatus });
            } else {
                updateStatusBar(item, { type: 'error', message: '无配额数据' });
            }
        } else {
            const msg = result.msg || 'Unknown error';
            if (msg.includes('unauthorized') || msg.includes('Unauthorized') || msg.includes('invalid')) {
                updateStatusBar(item, { type: 'error', message: 'Key 无效' });
            } else {
                updateStatusBar(item, { type: 'error', message: '查询失败' });
            }
        }
    } catch {
        if (thisGeneration !== refreshGeneration) {
            return;
        }
        updateStatusBar(item, { type: 'error', message: '查询失败' });
    } finally {
        isLoading = false;
    }
}

function startRefreshTimer(context: vscode.ExtensionContext, item: vscode.StatusBarItem) {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    const interval = vscode.workspace.getConfiguration('glmKeyMonitor').get<number>('refreshInterval', 10);
    const intervalMs = Math.max(interval, 1) * 60 * 1000;
    refreshTimer = setInterval(() => refreshQuota(context, item), intervalMs);
}

function startCountdownTimer(item: vscode.StatusBarItem) {
    countdownTimer = setInterval(() => {
        if (lastQuotaStatus && !isLoading) {
            const { percentage, progressBar, color, nextResetTime } = lastQuotaStatus;
            const remainingTime = formatRemainingTime(nextResetTime);
            updateStatusBar(item, {
                type: 'quota',
                status: { percentage, remainingTime, progressBar, color, nextResetTime }
            });
        }
    }, 60_000);
}

export function deactivate() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = undefined;
    }
}
