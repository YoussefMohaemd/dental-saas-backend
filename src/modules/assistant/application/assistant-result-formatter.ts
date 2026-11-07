import { type AssistantActionExecutionSummary } from './assistant-action-executor';
import {
  type AssistantCompanyProfileRecord,
  type AssistantServiceRecord,
} from './assistant-catalog';

const MAX_ROWS = 10;

type Row = Record<string, unknown>;

/**
 * Turns tool results into markdown so the user sees the real data that came
 * from the backend, not a model-written summary that could be invented.
 */
export function formatExecutionsAsMarkdown(
  executions: readonly AssistantActionExecutionSummary[],
): string {
  return executions
    .map((execution) => formatExecution(execution))
    .filter((block) => block.length > 0)
    .join('\n\n');
}

function formatExecution(execution: AssistantActionExecutionSummary): string {
  if (execution.status === 'failed') {
    return `⚠️ \`${execution.tool}\` failed: ${execution.error ?? 'unknown error'}`;
  }

  const result = execution.result;
  switch (execution.tool) {
    case 'list_services':
      return formatServices((result as { services: AssistantServiceRecord[] }).services);
    case 'get_company_info':
      return formatCompany((result as { profile: AssistantCompanyProfileRecord | null }).profile);
    case 'search_orders':
      return formatList('Orders', result, (row) => {
        const due = shortDate(row.dueDate);
        const lines = [
          `**${text(row.orderNumber)}** (${text(row.status)})`,
          `  - Patient: ${text(row.patientName)}`,
          `  - Doctor: ${text(row.doctorName)}`,
          `  - Clinic: ${text(row.clinicName)}`,
          `  - Restoration: ${text(row.restoration)}`,
          `  - Amount: ${money(row.amount)}`,
        ];
        if (due) {
          lines.push(`  - Due: ${due}`);
        }
        if (text(row.id)) {
          lines.push(`  - ID: \`${text(row.id)}\``);
        }
        return lines.join('\n');
      });
    case 'search_patients':
      return formatList('Patients', result, (row) =>
        [
          `**${text(row.name)}** (${text(row.status)})`,
          `  - Phone: ${text(row.phone)}`,
          `  - Doctor: ${text(row.doctorName)}`,
          `  - Clinic: ${text(row.clinicName)}`,
          ...(text(row.id) ? [`  - ID: \`${text(row.id)}\``] : []),
        ].join('\n'),
      );
    case 'search_doctors':
      return formatList('Doctors', result, (row) =>
        `**${text(row.name)}** — ${text(row.specialty)}, ${text(row.clinicName)}, id \`${text(row.id)}\``,
      );
    case 'search_clinics':
      return formatList('Clinics', result, (row) =>
        `**${text(row.name)}** — ${text(row.city)}, ${text(row.phone)}, id \`${text(row.id)}\``,
      );
    case 'get_order_details':
      return formatRecord('Order', result as Row, [
        ['orderNumber', 'Order'],
        ['patientName', 'Patient'],
        ['doctorName', 'Doctor'],
        ['clinicName', 'Clinic'],
        ['status', 'Status'],
        ['priority', 'Priority'],
        ['restoration', 'Restoration'],
        ['units', 'Units'],
        ['amount', 'Amount'],
        ['dueDate', 'Due'],
      ]);
    case 'get_patient_details':
      return formatRecord('Patient', result as Row, [
        ['name', 'Name'],
        ['phone', 'Phone'],
        ['email', 'Email'],
        ['doctorName', 'Doctor'],
        ['clinicName', 'Clinic'],
        ['status', 'Status'],
        ['ordersCount', 'Orders'],
      ]);
    default:
      return '';
  }
}

function formatServices(services: readonly AssistantServiceRecord[]): string {
  if (services.length === 0) {
    return '_No services are configured for your company yet._';
  }

  return services
    .map((service) => {
      const header = `### ${service.name} — ${money(service.basePrice)}`;
      const meta = `${service.description}${
        service.turnaroundDays > 0 ? ` _(turnaround: ${service.turnaroundDays} days)_` : ''
      }`;
      const requirements =
        service.scanRequirements.length > 0
          ? ['**Scan requirements**', ...service.scanRequirements.map((item) => `- ${item}`)]
          : [];
      return [header, meta, ...requirements].join('\n');
    })
    .join('\n\n');
}

function formatCompany(profile: AssistantCompanyProfileRecord | null): string {
  if (!profile) {
    return '_Company information has not been configured yet._';
  }

  const lines = [`### ${profile.name}`, profile.about];
  if (profile.address) lines.push(`- **Address:** ${profile.address}`);
  if (profile.phone) lines.push(`- **Phone:** ${profile.phone}`);
  if (profile.email) lines.push(`- **Email:** ${profile.email}`);
  if (profile.workingHours) lines.push(`- **Working hours:** ${profile.workingHours}`);
  if (profile.submissionStandards.length > 0) {
    lines.push('', '**Submission standards**', ...profile.submissionStandards.map((s) => `- ${s}`));
  }
  return lines.filter((line) => line !== undefined).join('\n');
}

function formatList(title: string, result: unknown, line: (row: Row) => string): string {
  const { items, meta } = result as { items?: Row[]; meta?: { totalItems?: number } };
  const rows = items ?? [];
  if (rows.length === 0) {
    return `_No ${title.toLowerCase()} found._`;
  }

  const total = meta?.totalItems ?? rows.length;
  const shown = rows.slice(0, MAX_ROWS).map((row) => `- ${line(row)}`);
  const more = total > shown.length ? `\n_Showing ${shown.length} of ${total}._` : '';
  return `**${title}** (${total})\n${shown.join('\n')}${more}`;
}

function formatRecord(title: string, row: Row, fields: ReadonlyArray<[string, string]>): string {
  const lines = fields
    .filter(([key]) => row[key] !== undefined && row[key] !== null && row[key] !== '')
    .map(([key, label]) => `- **${label}:** ${key.endsWith('Date') ? shortDate(row[key]) : text(row[key])}`);
  return [`**${title}**`, ...lines].join('\n');
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function shortDate(value: unknown): string {
  const raw = text(value);
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function money(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toLocaleString('en-US')}` : '';
}
