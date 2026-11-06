import { z } from 'zod';

export const assistantConversationIdParamSchema = z.object({
  conversationId: z.string().uuid(),
});

export const assistantActionIdParamSchema = z.object({
  actionId: z.string().uuid(),
});

export const assistantCreateConversationBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const assistantListConversationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export const assistantMessageBodySchema = z
  .object({
    content: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const assistantConfirmBodySchema = z
  .object({
    confirmationToken: z.string().trim().min(16).max(256),
  })
  .strict();
