import { Router } from 'express';

import { createAssistantService } from '../application/assistant-service-factory';
import { AssistantController } from './assistant.controller';

const assistantRouter = Router();
const assistantService = createAssistantService();
const assistantController = new AssistantController(assistantService);

assistantRouter.get('/assistant/suggestions', assistantController.getSuggestions);
assistantRouter.post('/assistant/conversations', assistantController.createConversation);
assistantRouter.get('/assistant/conversations/:conversationId', assistantController.getConversation);
assistantRouter.post('/assistant/conversations/:conversationId/messages', assistantController.postMessage);
assistantRouter.post('/assistant/actions/:actionId/confirm', assistantController.confirmAction);

export { assistantRouter };
