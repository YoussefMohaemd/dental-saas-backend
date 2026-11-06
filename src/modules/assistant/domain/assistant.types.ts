import { type DentalCapability } from '../../auth/application/authorization-policy';

export type AssistantIntent = 'single_action' | 'multiple_actions' | 'question' | 'clarification';
export type AssistantOperationType = 'read' | 'write' | 'delete';
export type CapabilityMatchMode = 'any' | 'all';

export interface AssistantPlanAction {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  dependsOn: string[];
}

export interface AssistantPlan {
  intent: AssistantIntent;
  actions: AssistantPlanAction[];
}

export interface AssistantToolDefinition {
  name: string;
  description: string;
  argumentsHint: string;
  operationType: AssistantOperationType;
  requiredCapabilities: DentalCapability[];
  capabilityMatchMode: CapabilityMatchMode;
  requiresConfirmation: boolean;
  timeoutMs: number;
  auditMetadata: {
    domain: string;
    action: string;
  };
}
