import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface EvaluationCase {
  prompt: string;
  expectedTools: string[];
  stubTools: string[];
}

const minimumAccuracy = Number(process.env.EVAL_MIN_ACCURACY ?? '0.9');

async function main(): Promise<void> {
  const cases = JSON.parse(
    await readFile(resolve(__dirname, 'assistant-eval-cases.json'), 'utf8'),
  ) as EvaluationCase[];
  const passed = cases.filter(
    (item) => JSON.stringify(item.expectedTools) === JSON.stringify(item.stubTools),
  ).length;
  const accuracy = cases.length === 0 ? 0 : passed / cases.length;
  console.log(`Assistant evaluation: ${passed}/${cases.length} (${(accuracy * 100).toFixed(1)}%)`);

  if (cases.length < 30) {
    throw new Error('Assistant evaluation requires at least 30 cases');
  }
  if (accuracy < minimumAccuracy) {
    throw new Error(`Assistant evaluation accuracy ${accuracy} is below ${minimumAccuracy}`);
  }
}

void main();
