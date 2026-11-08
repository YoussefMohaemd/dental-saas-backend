import { Router } from 'express';

import { assistantRateLimit } from '../../../middleware/assistant-rate-limit';
import { createAssistantService } from '../application/assistant-service-factory';
import { AssistantController } from './assistant.controller';

const assistantRouter = Router();
const assistantService = createAssistantService();
const assistantController = new AssistantController(assistantService);

assistantRouter.use('/assistant', assistantRateLimit);
assistantRouter.use('/ai', assistantRateLimit);
assistantRouter.get('/assistant/suggestions', assistantController.getSuggestions);
assistantRouter.get('/assistant/conversations', assistantController.listConversations);
assistantRouter.post('/assistant/conversations', assistantController.createConversation);
assistantRouter.get('/assistant/conversations/:conversationId', assistantController.getConversation);
assistantRouter.post('/assistant/conversations/:conversationId/messages', assistantController.postMessage);
assistantRouter.post('/assistant/actions/:actionId/confirm', assistantController.confirmAction);
assistantRouter.get('/ai/suggestions', assistantController.getSuggestions);
assistantRouter.get('/ai/conversations', assistantController.listConversations);
assistantRouter.post('/ai/conversations', assistantController.createConversation);
assistantRouter.get('/ai/conversations/:conversationId', assistantController.getConversation);
assistantRouter.post('/ai/conversations/:conversationId/messages', assistantController.postMessage);
assistantRouter.post('/ai/actions/:actionId/confirm', assistantController.confirmAction);

export { assistantRouter };
