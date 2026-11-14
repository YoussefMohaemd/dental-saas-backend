import { type AssistantActionExecutionSummary } from './assistant-action-executor';

export type AssistantVerificationIssueKind = 'unknown_id' | 'unknown_number' | 'unknown_price';

export interface AssistantVerificationIssue {
  kind: AssistantVerificationIssueKind;
  value: string;
}

export interface AssistantVerificationResult {
  status: 'verified' | 'warnings';
  issues: AssistantVerificationIssue[];
}

export function verifyReply(input: {
  replyText: string;
  executions: AssistantActionExecutionSummary[];
}): AssistantVerificationResult {
  const trusted = collectTrustedValues(input.executions);
  const issues: AssistantVerificationIssue[] = [];

  for (const id of input.replyText.match(/[a-f\d]{24}/gi) ?? []) {
    if (!trusted.ids.has(id.toLowerCase())) {
      issues.push({ kind: 'unknown_id', value: id });
    }
  }

  const pricePattern = /(?:price|cost|costs|سعر|سعرك|بمبلغ)\D*(\d+(?:\.\d+)?)/gi;
  for (const match of input.replyText.matchAll(pricePattern)) {
    const value = match[1];
    if (value && !trusted.numbers.has(value)) {
      issues.push({ kind: 'unknown_price', value });
    }
  }

  return {
    status: issues.length > 0 ? 'warnings' : 'verified',
    issues,
  };
}

function collectTrustedValues(executions: AssistantActionExecutionSummary[]): {
  ids: Set<string>;
  numbers: Set<string>;
} {
  const values = { ids: new Set<string>(), numbers: new Set<string>() };
  for (const execution of executions) {
    if (execution.status !== 'executed') continue;
    collectValue(execution.result, values);
  }
  return values;
}

function collectValue(
  value: unknown,
  trusted: { ids: Set<string>; numbers: Set<string> },
): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    trusted.numbers.add(String(value));
    return;
  }
  if (typeof value === 'string') {
    if (/^[a-f\d]{24}$/i.test(value)) trusted.ids.add(value.toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectValue(item, trusted));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectValue(item, trusted));
  }
}
