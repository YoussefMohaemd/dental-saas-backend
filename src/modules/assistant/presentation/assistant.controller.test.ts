import { describe, expect, it, vi } from 'vitest';
import { type Request, type Response } from 'express';
import { Types } from 'mongoose';

import { AssistantController } from './assistant.controller';

describe('AssistantController.transcribe', () => {
  it('accepts language query and forwards hint to transcription service', async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: 'ok', provider: 'groq' });
    const controller = new AssistantController(
      {} as never,
      undefined,
      { transcribe } as never,
    );

    const req = createRequest({
      query: { language: 'mixed' },
      headers: {
        'content-type': 'audio/webm',
      },
    });
    const res = createResponse();

    await controller.transcribe(req, res);

    expect(transcribe).toHaveBeenCalledWith({
      audio: req.body,
      mimeType: 'audio/webm',
      language: 'mixed',
      scope: {
        tenantId: expect.any(Types.ObjectId),
        userId: expect.any(Types.ObjectId),
        roles: ['admin'],
        isAdmin: true,
      },
    });
  });

  it('falls back to x-language-hint header when query is absent', async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: 'ok', provider: 'groq' });
    const controller = new AssistantController(
      {} as never,
      undefined,
      { transcribe } as never,
    );

    const req = createRequest({
      query: {},
      headers: {
        'content-type': 'audio/webm',
        'x-language-hint': 'ar',
      },
    });
    const res = createResponse();

    await controller.transcribe(req, res);

    expect(transcribe).toHaveBeenCalledWith({
      audio: req.body,
      mimeType: 'audio/webm',
      language: 'ar',
      scope: {
        tenantId: expect.any(Types.ObjectId),
        userId: expect.any(Types.ObjectId),
        roles: ['admin'],
        isAdmin: true,
      },
    });
  });

  it('rejects unknown language query with validation error', async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: 'ok', provider: 'groq' });
    const controller = new AssistantController(
      {} as never,
      undefined,
      { transcribe } as never,
    );
    const req = createRequest({
      query: { language: 'fr' },
      headers: {
        'content-type': 'audio/webm',
      },
    });
    const res = createResponse();

    await expect(controller.transcribe(req, res)).rejects.toMatchObject({
      name: 'ZodError',
    });
    expect(transcribe).not.toHaveBeenCalled();
  });
});

function createRequest(input: {
  query: Record<string, unknown>;
  headers: Record<string, string>;
}): Request {
  const lowered = Object.fromEntries(
    Object.entries(input.headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    body: Buffer.alloc(2_048, 1),
    query: input.query,
    context: {
      principal: {
        tenantId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        roles: ['admin'],
      },
    },
    header: (name: string) => lowered[name.toLowerCase()],
  } as unknown as Request;
}

function createResponse(): Response {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response;
}
