// src/cli/commands/benchmark.ts
/**
 * @fileoverview LLM 性能基准测试命令
 * @description 对 LLM 提供商进行标准化性能测试，包括延迟、吞吐量、Token 生成速度等指标
 * @module cli/commands/benchmark
 * @author xzxllm
 * @license MIT
 *
 * 使用示例:
 * npx xzxllm-game benchmark --provider ollama --model qwen2.5:7b
 * npx xzxllm-game benchmark --provider openai --model gpt-4o --iterations 10
 * npx xzxllm-game benchmark --compare ollama,openai
 */

import { Command, Option } from 'commander';
import { LLMProviderFactory } from '../../llm/factory.js';
import type { ILLMProvider, LLMConfig } from '../../llm/types.js';

/**
 * 基准测试选项接口
 */
interface BenchmarkOptions {
  /** LLM 提供商 */
  provider: string;
  /** 模型名称 */
  model?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** API 密钥 */
  apiKey?: string;
  /** 测试迭代次数 */
  iterations: string;
  /** 提示词长度 */
  promptLength: string;
  /** 是否测试流式响应 */
  stream: boolean;
  /** 配置文件路径 */
  config: string;
  /** 输出格式 */
  format: 'table' | 'json' | 'csv';
  /** 输出文件 */
  output?: string;
  /** 调试模式 */
  debug: boolean;
  /** 对比模式 */
  compare?: string;
  /** 超时时间 */
  timeout: string;
}

/**
 * 单个测试结果接口
 */
interface BenchmarkResult {
  /** 测试名称 */
  name: string;
  /** 提供商类型 */
  provider: string;
  /** 模型名称 */
  model: string;
  /** 迭代次数 */
  iterations: number;
  /** 各次测试的详细结果 */
  runs: RunResult[];
  /** 汇总统计 */
  summary: {
    /** 平均首次 Token 延迟 (ms) */
    avgFirstTokenLatency: number;
    /** 平均总延迟 (ms) */
    avgTotalLatency: number;
    /** 平均 Token 生成速度 (tokens/s) */
    avgTokensPerSecond: number;
    /** 平均总 Token 数 */
    avgTotalTokens: number;
    /** 成功率 (%) */
    successRate: number;
    /** 最小延迟 */
    minLatency: number;
    /** 最大延迟 */
    maxLatency: number;
    /** P50 延迟 */
    p50Latency: number;
    /** P90 延迟 */
    p90Latency: number;
    /** P99 延迟 */
    p99Latency: number;
  };
}

/**
 * 单次运行结果接口
 */
interface RunResult {
  /** 运行序号 */
  run: number;
  /** 是否成功 */
  success: boolean;
  /** 首次 Token 延迟 (ms) */
  firstTokenLatency?: number;
  /** 总延迟 (ms) */
  totalLatency?: number;
  /** 生成的 Token 数 */
  tokensGenerated?: number;
  /** Token 生成速度 (tokens/s) */
  tokensPerSecond?: number;
  /** 生成的文本内容 */
  content?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 注册基准测试命令
 * @param program Commander 程序实例
 */
export function registerBenchmarkCommand(program: Command): void {
  program
    .command('benchmark')
    .alias('bench')
    .description('LLM 性能基准测试')
    .addOption(
      new Option('-p, --provider <type>', 'LLM 提供商类型')
        .choices(['local', 'ollama', 'openai', 'anthropic', 'custom'])
        .default('ollama')
    )
    .addOption(
      new Option('-m, --model <name>', '模型名称 (如 qwen2.5:7b, gpt-4o)')
        .default('qwen2.5:7b')
    )
    .addOption(
      new Option('--base-url <url>', 'API 基础 URL (用于 ollama/custom)')
    )
    .addOption(
      new Option('--api-key <key>', 'API 密钥 (用于 openai/anthropic)')
    )
    .addOption(
      new Option('-n, --iterations <number>', '测试迭代次数')
        .default('5')
        .argParser(parseInt)
    )
    .addOption(
      new Option('--prompt-length <chars>', '提示词长度 (字符数)')
        .default('200')
        .argParser(parseInt)
    )
    .addOption(
      new Option('--stream', '测试流式响应性能')
        .default(false)
    )
    .addOption(
      new Option('-f, --format <format>', '输出格式')
        .choices(['table', 'json', 'csv'])
        .default('table')
    )
    .addOption(
      new Option('-o, --output <path>', '输出文件路径')
    )
    .addOption(
      new Option('--compare <providers>', '对比多个提供商 (逗号分隔)')
    )
    .addOption(
      new Option('--timeout <ms>', '请求超时时间 (毫秒)')
        .default('60000')
        .argParser(parseInt)
    )
    .action(async (options: BenchmarkOptions) => {
      await executeBenchmark(options);
    });
}

/**
 * 执行基准测试命令
 * @param options 命令选项
 */
async function executeBenchmark(options: BenchmarkOptions): Promise<void> {
  console.log('⚡ xzxllmGame LLM 性能基准测试');
  console.log('═══════════════════════════════\n');

  let results: BenchmarkResult[] = [];

  try {
    // 如果是对比模式
    if (options.compare) {
      const providers = options.compare.split(',').map(p => p.trim());
      console.log(`🔍 对比模式: ${providers.join(' vs ')}\n`);

      for (const provider of providers) {
        const result = await runBenchmarkForProvider({
          ...options,
          provider,
        });
        results.push(result);
      }
    } else {
      // 单提供商测试
      const result = await runBenchmarkForProvider(options);
      results.push(result);
    }

    // 输出结果
    await outputResults(results, options);

  } catch (error) {
    console.error('\n❌ 测试失败:', error instanceof Error ? error.message : String(error));

    if (options.debug && error instanceof Error && error.stack) {
      console.error('\n调试信息:', error.stack);
    }

    process.exit(1);
  }
}

/**
 * 为指定提供商运行基准测试
 * @param options 测试选项
 * @returns 测试结果
 */
async function runBenchmarkForProvider(
  options: BenchmarkOptions
): Promise<BenchmarkResult> {
  const iterations = parseInt(options.iterations, 10);
  const promptLength = parseInt(options.promptLength, 10);
  const timeout = parseInt(options.timeout, 10);

  console.log(`\n🧪 测试提供商: ${options.provider}`);
  console.log(`   模型: ${options.model}`);
  console.log(`   迭代次数: ${iterations}`);
  console.log(`   提示词长度: ${promptLength} 字符`);
  if (options.stream) {
    console.log('   模式: 流式响应');
  }
  console.log('');

  // 创建提供商配置
  const llmConfig: LLMConfig = {
    provider: options.provider as LLMConfig['provider'],
    model: options.model || 'qwen2.5:7b',
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    timeout,
  };

  // 创建提供商实例
  const provider = LLMProviderFactory.createProvider(llmConfig);

  // 初始化
  console.log('🔧 初始化提供商...');
  await provider.initialize();
  console.log('✅ 初始化完成\n');

  // 生成测试提示词
  const testPrompt = generateTestPrompt(promptLength);

  // 执行测试
  console.log('🏃 开始测试...');
  const runs: RunResult[] = [];

  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`  运行 ${i + 1}/${iterations}... `);

    const runStart = Date.now();
    const runResult: RunResult = {
      run: i + 1,
      success: false,
    };

    try {
      if (options.stream && provider.generateStream) {
        // 流式测试
        const streamResult = await benchmarkStream(provider, testPrompt, timeout);
        Object.assign(runResult, streamResult);
        runResult.success = true;
      } else {
        // 非流式测试
        const response = await provider.generate(testPrompt, {
          maxTokens: 500,
          temperature: 0.7,
        });

        const runEnd = Date.now();
        const totalLatency = runEnd - runStart;

        // 估算 Token 数 (简化计算)
        const tokensGenerated = response.usage?.completionTokens ||
          estimateTokens(response.content);

        runResult.firstTokenLatency = totalLatency; // 非流式模式下相同
        runResult.totalLatency = totalLatency;
        runResult.tokensGenerated = tokensGenerated;
        runResult.tokensPerSecond = tokensGenerated / (totalLatency / 1000);
        runResult.content = response.content.slice(0, 100); // 只保存前100字符
        runResult.success = true;
      }

      process.stdout.write(`✓ ${runResult.totalLatency}ms\n`);

    } catch (error) {
      runResult.error = error instanceof Error ? error.message : String(error);
      runResult.success = false;
      process.stdout.write(`✗ ${runResult.error}\n`);
    }

    runs.push(runResult);

    // 测试间短暂延迟
    if (i < iterations - 1) {
      await sleep(500);
    }
  }

  // 释放资源
  await provider.dispose();

  // 计算汇总统计
  const summary = calculateSummary(runs);

  const result: BenchmarkResult = {
    name: `${options.provider}-${options.model}`,
    provider: options.provider,
    model: options.model || 'unknown',
    iterations,
    runs,
    summary,
  };

  return result;
}

/**
 * 基准测试流式响应
 * @param provider LLM 提供商
 * @param prompt 测试提示词
 * @param timeout 超时时间
 * @returns 运行结果
 */
async function benchmarkStream(
  provider: ILLMProvider,
  prompt: string,
  timeout: number
): Promise<Partial<RunResult>> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let totalTokens = 0;
    let content = '';

    const timeoutId = setTimeout(() => {
      reject(new Error('请求超时'));
    }, timeout);

    provider.generateStream!(prompt, { maxTokens: 500, temperature: 0.7 }, {
      onData: (chunk: string) => {
        if (firstTokenTime === null) {
          firstTokenTime = Date.now();
        }
        content += chunk;
        totalTokens += estimateTokens(chunk);
      },
      onComplete: () => {
        clearTimeout(timeoutId);
        const endTime = Date.now();
        const totalLatency = endTime - startTime;

        resolve({
          firstTokenLatency: firstTokenTime ? firstTokenTime - startTime : totalLatency,
          totalLatency,
          tokensGenerated: totalTokens,
          tokensPerSecond: totalTokens / (totalLatency / 1000),
          content: content.slice(0, 100),
        });
      },
      onError: (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });
  });
}

/**
 * 计算汇总统计
 * @param runs 运行结果数组
 * @returns 汇总统计
 */
/**
 * 计算汇总统计
 * @param runs 运行结果数组
 * @returns 汇总统计
 */
function calculateSummary(runs: RunResult[]) {
  const successfulRuns = runs.filter(r => r.success);

  if (successfulRuns.length === 0) {
    return {
      avgFirstTokenLatency: 0,
      avgTotalLatency: 0,
      avgTokensPerSecond: 0,
      avgTotalTokens: 0,
      successRate: 0,
      minLatency: 0,
      maxLatency: 0,
      p50Latency: 0,
      p90Latency: 0,
      p99Latency: 0,
    };
  }

  const latencies = successfulRuns.map(r => r.totalLatency!);
  latencies.sort((a, b) => a - b);

  const avgFirstTokenLatency = average(successfulRuns.map(r => r.firstTokenLatency!));
  const avgTotalLatency = average(latencies);
  const avgTokensPerSecond = average(successfulRuns.map(r => r.tokensPerSecond!));
  const avgTotalTokens = average(successfulRuns.map(r => r.tokensGenerated!));

  return {
    avgFirstTokenLatency,
    avgTotalLatency,
    avgTokensPerSecond,
    avgTotalTokens,
    successRate: (successfulRuns.length / runs.length) * 100,
    minLatency: Math.min(...latencies),
    maxLatency: Math.max(...latencies),
    p50Latency: percentile(latencies, 0.5),
    p90Latency: percentile(latencies, 0.9),
    p99Latency: percentile(latencies, 0.99),
  };
}

/**
 * 输出测试结果
 * @param results 测试结果数组
 * @param options 命令选项
 */
async function outputResults(
  results: BenchmarkResult[],
  options: BenchmarkOptions
): Promise<void> {
  // 根据格式输出
  switch (options.format) {
    case 'json':
      outputJson(results, options.output);
      break;
    case 'csv':
      outputCsv(results, options.output);
      break;
    case 'table':
    default:
      outputTable(results);
      break;
  }

  // 如果是对比模式，输出对比表格
  if (results.length > 1) {
    outputComparison(results);
  }
}

/**
 * 以表格格式输出
 * @param results 测试结果数组
 */
function outputTable(results: BenchmarkResult[]): void {
  results.forEach(result => {
    console.log(`\n📊 ${result.provider} (${result.model}) 测试结果`);
    console.log('═══════════════════════════════');

    const s = result.summary;
    console.log(`
汇总统计:
  成功率:       ${s.successRate.toFixed(1)}%
  平均首Token:  ${s.avgFirstTokenLatency.toFixed(0)} ms
  平均总延迟:   ${s.avgTotalLatency.toFixed(0)} ms
  Token生成:    ${s.avgTokensPerSecond.toFixed(1)} tokens/s
  平均Token数:  ${s.avgTotalTokens.toFixed(0)}

延迟分布:
  最小: ${s.minLatency.toFixed(0)} ms
  P50:  ${s.p50Latency.toFixed(0)} ms
  P90:  ${s.p90Latency.toFixed(0)} ms
  P99:  ${s.p99Latency.toFixed(0)} ms
  最大: ${s.maxLatency.toFixed(0)} ms
`);

    // 显示失败的运行
    const failures = result.runs.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('失败记录:');
      failures.forEach(f => {
        console.log(`  运行 ${f.run}: ${f.error}`);
      });
    }
  });
}

/**
 * 输出对比表格
 * @param results 测试结果数组
 */
function outputComparison(results: BenchmarkResult[]): void {
  console.log('\n\n📈 性能对比');
  console.log('═══════════════════════════════');

  console.log(`
${'提供商'.padEnd(12)} ${'模型'.padEnd(15)} ${'成功率'.padEnd(8)} ${'延迟(ms)'.padEnd(10)} ${'速度(t/s)'.padEnd(10)}`);
  console.log('-'.repeat(60));

  results.forEach(r => {
    const name = `${r.provider}`.padEnd(12);
    const model = `${r.model}`.padEnd(15);
    const success = `${r.summary.successRate.toFixed(0)}%`.padEnd(8);
    const latency = `${r.summary.avgTotalLatency.toFixed(0)}`.padEnd(10);
    const speed = `${r.summary.avgTokensPerSecond.toFixed(1)}`.padEnd(10);
    console.log(`${name} ${model} ${success} ${latency} ${speed}`);
  });

  // 找出最优
  const fastest = results.reduce((prev, curr) =>
    prev.summary.avgTokensPerSecond > curr.summary.avgTokensPerSecond ? prev : curr
  );
  const lowestLatency = results.reduce((prev, curr) =>
    prev.summary.avgTotalLatency < curr.summary.avgTotalLatency ? prev : curr
  );

  console.log(`
🏆 结果:
  最快生成: ${fastest.provider} (${fastest.summary.avgTokensPerSecond.toFixed(1)} tokens/s)
  最低延迟: ${lowestLatency.provider} (${lowestLatency.summary.avgTotalLatency.toFixed(0)} ms)
`);
}

/**
 * 以 JSON 格式输出
 * @param results 测试结果数组
 * @param outputPath 输出文件路径
 */
function outputJson(results: BenchmarkResult[], outputPath?: string): void {
  const json = JSON.stringify(results, null, 2);

  if (outputPath) {
    const fs = require('fs');
    fs.writeFileSync(outputPath, json, 'utf8');
    console.log(`\n💾 结果已保存到: ${outputPath}`);
  } else {
    console.log(json);
  }
}

/**
 * 以 CSV 格式输出
 * @param results 测试结果数组
 * @param outputPath 输出文件路径
 */
function outputCsv(results: BenchmarkResult[], outputPath?: string): void {
  const lines: string[] = [
    'provider,model,run,success,first_token_ms,total_latency_ms,tokens_generated,tokens_per_second',
  ];

  results.forEach(result => {
    result.runs.forEach(run => {
      lines.push([
        result.provider,
        result.model,
        run.run,
        run.success,
        run.firstTokenLatency || '',
        run.totalLatency || '',
        run.tokensGenerated || '',
        run.tokensPerSecond?.toFixed(2) || '',
      ].join(','));
    });
  });

  const csv = lines.join('\n');

  if (outputPath) {
    const fs = require('fs');
    fs.writeFileSync(outputPath, csv, 'utf8');
    console.log(`\n💾 结果已保存到: ${outputPath}`);
  } else {
    console.log(csv);
  }
}

/**
 * 生成测试提示词
 * @param length 目标长度
 * @returns 提示词
 */
function generateTestPrompt(length: number): string {
  const basePrompt = `请设计一个推箱子谜题。要求：
1. 谜题大小为 8x8
2. 包含 3 个箱子和 3 个目标点
3. 确保谜题有解且难度适中
4. 以 JSON 格式输出，包含：
   - 玩家起始位置
   - 箱子位置数组
   - 目标点位置数组
   - 墙壁位置数组

请直接输出 JSON，不要包含其他说明。`;

  if (basePrompt.length >= length) {
    return basePrompt.slice(0, length);
  }

  // 如果不够长，重复填充
  const repetitions = Math.ceil(length / basePrompt.length);
  let result = '';
  for (let i = 0; i < repetitions; i++) {
    result += `[${i + 1}] ` + basePrompt + '\n\n';
  }

  return result.slice(0, length);
}

/**
 * 估算 Token 数
 * @param text 文本
 * @returns Token 估算数
 */
function estimateTokens(text: string): number {
  // 简化的 Token 估算：约 4 个字符 1 个 Token
  return Math.ceil(text.length / 4);
}

/**
 * 计算平均值
 * @param values 数值数组
 * @returns 平均值
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return (values.reduce((a, b) => a + b, 0) / values.length) || 0;
}

/**
 * 计算百分位数
 * @param sortedValues 已排序的数值数组
 * @param p 百分位 (0-1)
 * @returns 百分位数值
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sortedValues.length * p) - 1);
  return sortedValues[index] ?? 0;
}

/**
 * 睡眠函数
 * @param ms 毫秒数
 * @returns Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
