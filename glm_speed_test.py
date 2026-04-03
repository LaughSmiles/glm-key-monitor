# -*- coding: utf-8 -*-
"""
GLM 模型响应速度对比测试脚本
通过智谱 Anthropic 兼容接口测试 GLM-4.7、GLM-5、GLM-5-Turbo 的响应速度

使用前请先安装依赖: pip install anthropic
"""

import time
import json
from anthropic import Anthropic

# ============ 配置区 ============
API_KEY = "83c45e19340544a79407b52c941e9599.DW5i67bBraqTpgHM"
BASE_URL = "https://open.bigmodel.cn/api/anthropic"

# 要测试的模型列表
MODELS = [
    "glm-4.7",
    "glm-5",
    "glm-5-turbo",
    "glm-5.1",
]

# 测试用的 prompt（可自行修改）
TEST_PROMPTS = [
    {
        "name": "代码生成",
        "content": "请用Python实现一个快速排序算法，并加上注释。"
    },
    {
        "name": "逻辑推理",
        "content": "一个房间里有3盏灯和3个开关在房间外。你只能进入房间一次，如何确定每个开关对应哪盏灯？请详细分析。"
    },
    {
        "name": "长文本生成",
        "content": "请写一篇关于人工智能发展历史的短文，至少500字。"
    },
]

# 每个模型对每个 prompt 测试的轮次
ROUNDS = 1
# ================================


def test_model(client, model: str, prompt_content: str):
    """测试单个模型的响应速度，返回详细的性能指标"""
    start_time = time.time()
    first_token_time = None
    char_count = 0
    full_content = ""

    try:
        with client.messages.stream(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt_content}],
        ) as stream:
            for text in stream.text_stream:
                if first_token_time is None:
                    first_token_time = time.time()
                char_count += len(text)
                full_content += text

        end_time = time.time()

        if first_token_time is None:
            return None

        total_time = end_time - start_time
        ttft = first_token_time - start_time
        generation_time = end_time - first_token_time
        tps = char_count / generation_time if generation_time > 0 else 0

        return {
            "model": model,
            "ttft": round(ttft, 3),
            "total_time": round(total_time, 3),
            "gen_time": round(generation_time, 3),
            "tps": round(tps, 1),
            "char_count": char_count,
            "content_preview": full_content[:100] + "..." if len(full_content) > 100 else full_content,
        }

    except Exception as e:
        return {
            "model": model,
            "error": str(e),
        }


def print_separator(char="─", length=80):
    print(char * length)


def print_header():
    print_separator("═")
    print(f"{'GLM 模型响应速度对比测试':^80}")
    print(f"{'测试模型: ' + ', '.join(MODELS):^80}")
    print(f"{'测试轮次: ' + str(ROUNDS):^80}")
    print_separator("═")


def print_results_table(all_results):
    """以表格形式打印所有结果"""
    print_separator("═")
    header = f"{'模型':<16} | {'Prompt':<10} | {'首Token':>8} | {'总耗时':>8} | {'生成速度':>10} | {'字符数':>6}"
    print(header)
    print_separator("─")

    for prompt_name in [p["name"] for p in TEST_PROMPTS]:
        for result in all_results:
            if result.get("prompt_name") != prompt_name:
                continue
            if "error" in result:
                print(f"{result['model']:<16} | {prompt_name:<10} | ERROR: {result['error'][:45]}")
                continue

            row = (
                f"{result['model']:<16} | "
                f"{prompt_name:<10} | "
                f"{result['ttft']:>6.3f}s | "
                f"{result['total_time']:>6.3f}s | "
                f"{result['tps']:>6.1f} c/s | "
                f"{result['char_count']:>6}"
            )
            print(row)
        print_separator("─")

    # 汇总对比
    print_separator("═")
    print(f"{'各模型平均性能汇总':^80}")
    print_separator("═")

    model_stats = {}
    for result in all_results:
        if "error" in result:
            continue
        model = result["model"]
        if model not in model_stats:
            model_stats[model] = {"ttft_sum": 0, "total_sum": 0, "tps_sum": 0, "count": 0}
        model_stats[model]["ttft_sum"] += result["ttft"]
        model_stats[model]["total_sum"] += result["total_time"]
        model_stats[model]["tps_sum"] += result["tps"]
        model_stats[model]["count"] += 1

    summary_header = f"{'模型':<16} | {'平均首Token':>10} | {'平均总耗时':>10} | {'平均生成速度':>12} | {'测试次数':>6}"
    print(summary_header)
    print_separator("─")

    for model, stats in model_stats.items():
        avg_ttft = stats["ttft_sum"] / stats["count"]
        avg_total = stats["total_sum"] / stats["count"]
        avg_tps = stats["tps_sum"] / stats["count"]
        row = (
            f"{model:<16} | "
            f"{avg_ttft:>8.3f}s | "
            f"{avg_total:>8.3f}s | "
            f"{avg_tps:>8.1f} c/s | "
            f"{stats['count']:>6}"
        )
        print(row)

    print_separator("═")


def save_results(all_results, filename="glm_speed_test_results.json"):
    """保存测试结果到 JSON 文件"""
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n测试结果已保存到: {filename}")


def main():
    client = Anthropic(api_key=API_KEY, base_url=BASE_URL)

    print_header()
    all_results = []

    for prompt_info in TEST_PROMPTS:
        print(f"\n测试场景: {prompt_info['name']}")
        print(f"Prompt: {prompt_info['content'][:60]}...")
        print_separator("─")

        for model in MODELS:
            print(f"  正在测试 {model} ...", end="", flush=True)

            for round_num in range(1, ROUNDS + 1):
                result = test_model(client, model, prompt_info["content"])

                if result is None:
                    print(f" 轮次{round_num}: 无响应", flush=True)
                    continue

                result["prompt_name"] = prompt_info["name"]
                result["round"] = round_num

                if "error" in result:
                    print(f"\n    轮次{round_num}: ERROR - {result['error']}", flush=True)
                else:
                    print(
                        f"\n    轮次{round_num}: "
                        f"首Token={result['ttft']}s, "
                        f"总耗时={result['total_time']}s, "
                        f"速度={result['tps']} c/s",
                        flush=True,
                    )

                all_results.append(result)

            print()

    # 打印汇总表格
    print_results_table(all_results)

    # 保存结果
    save_results(all_results)

    # 找出最快的模型
    model_avg = {}
    for r in all_results:
        if "error" in r:
            continue
        m = r["model"]
        model_avg.setdefault(m, []).append(r["total_time"])

    if model_avg:
        fastest = min(model_avg, key=lambda m: sum(model_avg[m]) / len(model_avg[m]))
        avg_time = sum(model_avg[fastest]) / len(model_avg[fastest])
        print(f"\n最快模型: {fastest} (平均耗时 {avg_time:.3f}s)")


if __name__ == "__main__":
    main()
