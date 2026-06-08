import { TokenLimit } from './apiClient';

export interface QuotaStatus {
    percentage: number;
    remainingTime: string;
    progressBar: string;
    color: string;
    nextResetTime: number;
    modelName: string;
}

export function parseQuotaStatus(data: { limits: TokenLimit[] }, detectedModel?: string): QuotaStatus | null {
    const tokenLimits = data.limits.filter(l => l.type === 'TOKENS_LIMIT');
    if (tokenLimits.length === 0) {
        return null;
    }

    const currentWindow = tokenLimits.reduce((prev, curr) =>
        curr.nextResetTime < prev.nextResetTime ? curr : prev
    );

    // Model name: detected from model-usage API > usageDetails > fallback "GLM"
    let modelName = detectedModel || 'GLM';
    if (!detectedModel) {
        let maxUsage = 0;
        for (const limit of tokenLimits) {
            if (limit.usageDetails) {
                for (const detail of limit.usageDetails) {
                    if (detail.usage > maxUsage) {
                        maxUsage = detail.usage;
                        modelName = detail.modelCode;
                    }
                }
            }
        }
    }

    const percentage = currentWindow.percentage;
    const remainingTime = formatWindowTime(currentWindow.nextResetTime);
    const progressBar = formatProgressBar(percentage);
    const color = getStatusColor(percentage);

    return { percentage, remainingTime, progressBar, color, nextResetTime: currentWindow.nextResetTime, modelName };
}

export function formatProgressBar(percentage: number, width: number = 12): string {
    const filled = Math.round((percentage / 100) * width);
    const actualFilled = percentage > 0 && filled === 0 ? 1 : filled;
    const empty = width - actualFilled;
    return '\u2588'.repeat(actualFilled) + '\u2591'.repeat(empty);
}

const WINDOW_HOURS = 5;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

export function formatWindowTime(timestampMs: number): string {
    const nowMs = Date.now();
    const remainingMs = timestampMs - nowMs;
    const elapsedMs = Math.max(0, WINDOW_MS - remainingMs);

    const totalElapsedMinutes = Math.floor(elapsedMs / 60000);
    const hours = Math.floor(totalElapsedMinutes / 60);
    const minutes = totalElapsedMinutes % 60;

    let elapsed: string;
    if (hours > 0) {
        elapsed = `${hours}h ${minutes}m`;
    } else {
        elapsed = `${minutes}m`;
    }

    return `(${elapsed} / ${WINDOW_HOURS}h)`;
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

/**
 * Extract the most-used model name from raw model-usage API response.
 * The API returns data.modelSummaryList with { modelName, totalTokens, sortOrder }.
 * Picks the model with sortOrder 1 (highest usage).
 */
export function extractModelName(rawResponse: any): string | undefined {
    if (!rawResponse || rawResponse.code !== 200 || !rawResponse.data) {
        return undefined;
    }
    const data = rawResponse.data;

    // Try modelSummaryList (top-level or inside totalUsage) and modelDataList
    const candidateFields = ['modelSummaryList', 'modelDataList'];
    for (const field of candidateFields) {
        const arr = data[field] || (data.totalUsage && data.totalUsage[field]);
        if (Array.isArray(arr) && arr.length > 0) {
            // Pick the one with highest totalTokens (or sortOrder 1)
            let top = arr[0];
            let maxTokens = top.totalTokens || 0;
            for (const item of arr) {
                const tokens = item.totalTokens || 0;
                if (tokens > maxTokens) {
                    maxTokens = tokens;
                    top = item;
                }
            }
            if (typeof top.modelName === 'string' && top.modelName.length > 0 && maxTokens > 0) {
                return top.modelName;
            }
        }
    }

    return undefined;
}

export function formatNumber(num: number): string {
    return num.toLocaleString('en-US');
}
