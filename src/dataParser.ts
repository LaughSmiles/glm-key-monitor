import { TokenLimit } from './apiClient';

export interface QuotaStatus {
    percentage: number;
    remainingTime: string;
    progressBar: string;
    color: string;
    nextResetTime: number;
}

export function parseQuotaStatus(data: { limits: TokenLimit[] }): QuotaStatus | null {
    const tokenLimits = data.limits.filter(l => l.type === 'TOKENS_LIMIT');
    if (tokenLimits.length === 0) {
        return null;
    }

    const currentWindow = tokenLimits.reduce((prev, curr) =>
        curr.nextResetTime < prev.nextResetTime ? curr : prev
    );

    const percentage = currentWindow.percentage;
    const remainingTime = formatRemainingTime(currentWindow.nextResetTime);
    const progressBar = formatProgressBar(percentage);
    const color = getStatusColor(percentage);

    return { percentage, remainingTime, progressBar, color, nextResetTime: currentWindow.nextResetTime };
}

export function formatProgressBar(percentage: number, width: number = 12): string {
    const filled = Math.round((percentage / 100) * width);
    const actualFilled = percentage > 0 && filled === 0 ? 1 : filled;
    const empty = width - actualFilled;
    return '\u2588'.repeat(actualFilled) + '\u2591'.repeat(empty);
}

export function formatRemainingTime(timestampMs: number): string {
    const nowMs = Date.now();
    const remainingMs = timestampMs - nowMs;
    if (remainingMs <= 0) {
        return '即将重置';
    }
    const remainingSeconds = Math.floor(remainingMs / 1000);
    let hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);

    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        hours = hours % 24;
        if (hours > 0) {
            return `${days}天${hours}h${minutes}m后重置`;
        }
        return `${days}天后重置`;
    } else if (hours > 0) {
        return `${hours}h${minutes}m后重置`;
    } else {
        return `${minutes}m后重置`;
    }
}

export function getStatusColor(percentage: number): 'green' | 'yellow' | 'red' {
    if (percentage >= 90) {
        return 'red';
    } else if (percentage >= 70) {
        return 'yellow';
    }
    return 'green';
}

export function formatNumber(num: number): string {
    return num.toLocaleString('en-US');
}
