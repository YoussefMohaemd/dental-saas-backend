import { describe, expect, it } from 'vitest';

import { formatExecutionsAsMarkdown } from './assistant-result-formatter';

describe('formatExecutionsAsMarkdown', () => {
  it('renders services with prices from the catalog result', () => {
    const text = formatExecutionsAsMarkdown([
      {
        actionId: 'a1',
        tool: 'list_services',
        status: 'executed',
        result: {
          services: [
            {
              serviceId: 'gfmr',
              name: 'GFMR',
              description: 'Full-mouth rehabilitation',
              basePrice: 580,
              turnaroundDays: 12,
              scanRequirements: [],
            },
          ],
        },
      },
    ]);

    expect(text).toContain('GFMR — $580');
    expect(text).not.toContain('Wax-up');
  });

  it('says so when the catalog or company profile is empty instead of inventing data', () => {
    const text = formatExecutionsAsMarkdown([
      { actionId: 'a1', tool: 'list_services', status: 'executed', result: { services: [] } },
      { actionId: 'a2', tool: 'get_company_info', status: 'executed', result: { profile: null } },
    ]);

    expect(text).toContain('No services are configured');
    expect(text).toContain('Company information has not been configured');
  });

  it('lists orders with a total and truncates long results', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      orderNumber: `ORD-${i}`,
      patientName: 'Sam',
      restoration: 'Crown',
      status: 'New',
      amount: 100,
      dueDate: '2026-11-20T00:00:00.000Z',
    }));
    const text = formatExecutionsAsMarkdown([
      { actionId: 'a1', tool: 'search_orders', status: 'executed', result: { items, meta: { totalItems: 12 } } },
    ]);

    expect(text).toContain('**Orders** (12)');
    expect(text).toContain('Showing 10 of 12');
    expect(text).not.toContain('ORD-11');
  });
});
