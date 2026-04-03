const SPEED_TEST_URL = 'https://open.bigmodel.cn/api/anthropic/v1/messages';

export interface SpeedTestResult {
    model: string;
    promptName: string;
    ttft: number;       // 首 Token 时间（秒）
    totalTime: number;  // 总耗时（秒）
    genTime: number;    // 生成耗时（秒）
    tps: number;        // 字符/秒
    charCount: number;
    error?: string;
}

export interface SpeedTestProgress {
    type: 'progress' | 'result' | 'done' | 'error';
    current: number;
    total: number;
    model: string;
    promptName: string;
    result?: SpeedTestResult;
    allResults?: SpeedTestResult[];
    errorMsg?: string;
}

export const DEFAULT_MODELS = ['glm-4.7', 'glm-5', 'glm-5-turbo', 'glm-5.1'];

export const TEST_PROMPTS = [
    { name: '代码生成', content: '请用Python实现一个快速排序算法，并加上注释。' },
    { name: '逻辑推理', content: '一个房间里有3盏灯和3个开关在房间外。你只能进入房间一次，如何确定每个开关对应哪盏灯？请详细分析。' },
    { name: '长文本生成', content: '请写一篇关于人工智能发展历史的短文，至少500字。' },
];

export const CONCURRENCY_OPTIONS = [1, 2, 3, 4, 6, 8];

export async function runSpeedTest(
    apiKey: string,
    models: string[],
    onProgress: (progress: SpeedTestProgress) => void,
    abortSignal?: AbortSignal,
    concurrency: number = 1
): Promise<SpeedTestResult[]> {
    const prompts = TEST_PROMPTS;
    const total = models.length * prompts.length;
    let completed = 0;
    const allResults: SpeedTestResult[] = [];

    // Build task list
    const tasks: { model: string; prompt: typeof TEST_PROMPTS[number] }[] = [];
    for (const prompt of prompts) {
        for (const model of models) {
            tasks.push({ model, prompt });
        }
    }

    let taskIndex = 0;

    async function worker(): Promise<void> {
        while (taskIndex < tasks.length) {
            if (abortSignal?.aborted) { return; }
            const task = tasks[taskIndex++];
            if (!task) { return; }

            onProgress({
                type: 'progress',
                current: completed + 1,
                total,
                model: task.model,
                promptName: task.prompt.name,
            });

            const result = await testSingleModel(apiKey, task.model, task.prompt.name, task.prompt.content);
            completed++;
            allResults.push(result);

            onProgress({
                type: 'result',
                current: completed,
                total,
                model: task.model,
                promptName: task.prompt.name,
                result,
            });
        }
    }

    const workerCount = Math.min(concurrency, tasks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    onProgress({
        type: 'done',
        current: completed,
        total,
        model: '',
        promptName: '',
        allResults,
    });

    return allResults;
}

async function testSingleModel(
    apiKey: string,
    model: string,
    promptName: string,
    promptContent: string
): Promise<SpeedTestResult> {
    const startTime = Date.now();
    let firstTokenTime = 0;
    let charCount = 0;

    try {
        const body = JSON.stringify({
            model,
            max_tokens: 4096,
            stream: true,
            messages: [{ role: 'user', content: promptContent }],
        });

        const response = await fetch(SPEED_TEST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText.slice(0, 100)}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('无法获取响应流');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) { break; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) { continue; }
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') { continue; }

                try {
                    const json = JSON.parse(data);
                    // Anthropic format: event: content_block_delta → delta.text
                    const text = json.delta?.text || json.content?.[0]?.text;
                    if (text) {
                        if (firstTokenTime === 0) {
                            firstTokenTime = Date.now();
                        }
                        charCount += text.length;
                    }
                } catch {
                    // 跳过无法解析的行
                }
            }
        }

        const endTime = Date.now();

        if (firstTokenTime === 0) {
            return { model, promptName, ttft: 0, totalTime: (endTime - startTime) / 1000, genTime: 0, tps: 0, charCount: 0, error: '无响应内容' };
        }

        const ttft = (firstTokenTime - startTime) / 1000;
        const totalTime = (endTime - startTime) / 1000;
        const genTime = (endTime - firstTokenTime) / 1000;
        const tps = genTime > 0 ? Math.round(charCount / genTime * 10) / 10 : 0;

        return {
            model,
            promptName,
            ttft: Math.round(ttft * 1000) / 1000,
            totalTime: Math.round(totalTime * 1000) / 1000,
            genTime: Math.round(genTime * 1000) / 1000,
            tps,
            charCount,
        };

    } catch (err) {
        return {
            model,
            promptName,
            ttft: 0,
            totalTime: 0,
            genTime: 0,
            tps: 0,
            charCount: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}
