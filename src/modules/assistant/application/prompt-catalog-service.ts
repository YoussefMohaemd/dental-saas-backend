import { type DentalCapability } from '../../auth/application/authorization-policy';

export type AssistantPromptResultType =
  | 'text'
  | 'order-list'
  | 'order-details'
  | 'order-report'
  | 'patient-list'
  | 'patient-details'
  | 'chart'
  | 'table'
  | 'confirmation'
  | 'permission-denied'
  | 'error';

export interface AssistantPromptSuggestion {
  id: string;
  title: string;
  description: string;
  category: 'orders' | 'reports' | 'patients' | 'dashboard' | 'cases';
  template: string;
  requiredCapabilities: DentalCapability[];
  resultType: AssistantPromptResultType;
  enabled: boolean;
}

const PROMPT_SUGGESTIONS: AssistantPromptSuggestion[] = [
  {
    id: 'assistant-search-orders',
    title: 'Find order by number',
    description: 'Search orders using order number, patient, or doctor',
    category: 'orders',
    template: 'Find order {{orderNumber}} and show a short status summary.',
    requiredCapabilities: ['orders.read'],
    resultType: 'order-list',
    enabled: true,
  },
  {
    id: 'assistant-production-orders',
    title: 'Show production orders',
    description: 'List active production orders',
    category: 'orders',
    template: 'Show production orders that are due this week.',
    requiredCapabilities: ['orders.read'],
    resultType: 'order-list',
    enabled: true,
  },
  {
    id: 'assistant-overdue-orders',
    title: 'Show overdue orders',
    description: 'List overdue orders with priority',
    category: 'orders',
    template: 'Show overdue orders sorted by priority and due date.',
    requiredCapabilities: ['orders.read'],
    resultType: 'order-list',
    enabled: true,
  },
  {
    id: 'assistant-order-report',
    title: 'Generate order report',
    description: 'Generate report for one order including sub-orders',
    category: 'reports',
    template: 'Generate a report for order {{orderNumber}} including related sub-orders.',
    requiredCapabilities: ['reports.read'],
    resultType: 'order-report',
    enabled: false,
  },
  {
    id: 'assistant-sub-orders-performance',
    title: 'Show sub-orders performance',
    description: 'Summarize sub-order throughput and completion',
    category: 'reports',
    template: 'Show sub-order performance for this month.',
    requiredCapabilities: ['reports.read'],
    resultType: 'table',
    enabled: false,
  },
  {
    id: 'assistant-dashboard-summary',
    title: 'Summarize dashboard',
    description: 'Get dashboard summary with top KPIs',
    category: 'dashboard',
    template: 'Summarize dashboard KPIs for this week.',
    requiredCapabilities: ['dashboard.read'],
    resultType: 'chart',
    enabled: false,
  },
  {
    id: 'assistant-search-patients',
    title: 'Search patients',
    description: 'Search patients by name or phone',
    category: 'patients',
    template: 'Search patients named {{patientName}} and show latest visit.',
    requiredCapabilities: ['patients.read'],
    resultType: 'patient-list',
    enabled: true,
  },
  {
    id: 'assistant-recent-cases',
    title: 'Show recent cases',
    description: 'List recently updated cases',
    category: 'cases',
    template: 'Show recently updated cases and their current status.',
    requiredCapabilities: ['cases.read'],
    resultType: 'table',
    enabled: false,
  },
  {
    id: 'assistant-create-order',
    title: 'Create order draft',
    description: 'Prepare an order draft for confirmation',
    category: 'orders',
    template: 'Create a new order draft for patient {{patientName}} with restoration {{restorationType}}.',
    requiredCapabilities: ['orders.create'],
    resultType: 'confirmation',
    enabled: true,
  },
];

export class PromptCatalogService {
  public listSuggestions(): AssistantPromptSuggestion[] {
    return [...PROMPT_SUGGESTIONS];
  }
}
