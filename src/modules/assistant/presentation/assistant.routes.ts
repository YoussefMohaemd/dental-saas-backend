import express, { Router } from 'express';

import { assistantRateLimit } from '../../../middleware/assistant-rate-limit';
import { requireAnyCapability } from '../../auth/presentation/auth.middleware';
import {
  createAssistantLookupService,
  createAssistantService,
  createTranscriptionService,
} from '../application/assistant-service-factory';
import { AssistantController } from './assistant.controller';

const assistantRouter = Router();
const assistantService = createAssistantService();
const assistantController = new AssistantController(
  assistantService,
  createAssistantLookupService(),
  createTranscriptionService(),
);
const transcribeRawBodyParser = express.raw({
  type: ['audio/*', 'video/webm'],
  limit: '5mb',
});

assistantRouter.use('/assistant', assistantRateLimit);
assistantRouter.use('/ai', assistantRateLimit);
assistantRouter.get('/assistant/suggestions', assistantController.getSuggestions);
assistantRouter.get('/assistant/lookup/:kind', assistantController.lookup);
assistantRouter.get('/assistant/conversations', assistantController.listConversations);
assistantRouter.post('/assistant/conversations', assistantController.createConversation);
assistantRouter.get('/assistant/conversations/:conversationId', assistantController.getConversation);
assistantRouter.post('/assistant/conversations/:conversationId/messages', assistantController.postMessage);
assistantRouter.post('/assistant/actions/:actionId/confirm', assistantController.confirmAction);
assistantRouter.post('/assistant/transcribe', transcribeRawBodyParser, assistantController.transcribe);
assistantRouter.get(
  '/assistant/admin/llm-calls',
  requireAnyCapability(['assistant.audit.read']),
  assistantController.listLlmCalls,
);
assistantRouter.get('/ai/suggestions', assistantController.getSuggestions);
assistantRouter.get('/ai/lookup/:kind', assistantController.lookup);
assistantRouter.get('/ai/conversations', assistantController.listConversations);
assistantRouter.post('/ai/conversations', assistantController.createConversation);
assistantRouter.get('/ai/conversations/:conversationId', assistantController.getConversation);
assistantRouter.post('/ai/conversations/:conversationId/messages', assistantController.postMessage);
assistantRouter.post('/ai/actions/:actionId/confirm', assistantController.confirmAction);
assistantRouter.post('/ai/transcribe', transcribeRawBodyParser, assistantController.transcribe);
assistantRouter.get(
  '/ai/admin/llm-calls',
  requireAnyCapability(['assistant.audit.read']),
  assistantController.listLlmCalls,
);

export { assistantRouter };
