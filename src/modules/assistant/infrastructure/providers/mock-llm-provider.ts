import { type AssistantLlmCompletionRequest, type AssistantLlmProvider } from '../../application/llm-provider';

export class MockAssistantLlmProvider implements AssistantLlmProvider {
  public readonly name = 'mock' as const;

  public completePlan(
    request: AssistantLlmCompletionRequest,
  ): Promise<{
    reply: string;
    actions: [];
  }> {
    if (request.signal?.aborted) {
      request.signal.throwIfAborted();
    }

    const normalized = request.userMessage.trim();

    return Promise.resolve({
      reply: `Mock assistant response: ${normalized}`,
      actions: [],
    });
  }
}
