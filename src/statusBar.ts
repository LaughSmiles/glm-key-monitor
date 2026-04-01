import * as vscode from 'vscode';
import { QuotaStatus } from './dataParser';

const COLOR_MAP: Record<string, string> = {
    green: '#4EC9B0',
    yellow: '#CE9178',
    red: '#F44747'
};

export interface QuotaDisplayState {
    type: 'quota';
    status: QuotaStatus;
}

export interface ErrorDisplayState {
    type: 'error';
    message: string;
}

export interface EmptyDisplayState {
    type: 'empty';
    message: string;
}

export interface LoadingDisplayState {
    type: 'loading';
}

export type DisplayState = QuotaDisplayState | ErrorDisplayState | EmptyDisplayState | LoadingDisplayState;

export function createStatusBarItem(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.command = 'glmKeyMonitor.showUsageDetails';
    item.tooltip = 'GLM API Key 使用量监控 - 点击查看详情';
    return item;
}

export function updateStatusBar(item: vscode.StatusBarItem, state: DisplayState): void {
    switch (state.type) {
        case 'quota': {
            const { status } = state;
            item.text = `GLM: ${status.progressBar} ${status.percentage}% | ${status.remainingTime}`;
            item.color = COLOR_MAP[status.color];
            break;
        }
        case 'error': {
            item.text = `GLM: ${state.message}`;
            item.color = COLOR_MAP.red;
            break;
        }
        case 'empty': {
            item.text = `GLM: ${state.message}`;
            item.color = undefined;
            break;
        }
        case 'loading': {
            item.text = 'GLM: 查询中...';
            item.color = undefined;
            break;
        }
    }
}
