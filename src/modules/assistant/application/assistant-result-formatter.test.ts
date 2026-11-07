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

  it('renders service prices as price-only list', () => {
    const text = formatExecutionsAsMarkdown([
      {
        actionId: 'a1',
        tool: 'list_service_prices',
        status: 'executed',
        result: {
          services: [
            {
              serviceId: 'sg',
              name: 'Surgical Guide',
              description: 'Desc',
              basePrice: 420,
              turnaroundDays: 8,
              scanRequirements: ['CT'],
            },
          ],
        },
      },
    ]);

    expect(text).toContain('Service pricing');
    expect(text).toContain('Surgical Guide: $420');
    expect(text).not.toContain('Scan requirements');
  });

  it('renders submission standards only', () => {
    const text = formatExecutionsAsMarkdown([
      {
        actionId: 'a1',
        tool: 'get_submission_standards',
        status: 'executed',
        result: { standards: ['Rule 1', 'Rule 2'] },
      },
    ]);

    expect(text).toContain('Submission standards');
    expect(text).toContain('Rule 1');
    expect(text).not.toContain('Address:');
  });

  it('renders explicit price fallback when catalog data is malformed', () => {
    const text = formatExecutionsAsMarkdown([
      {
        actionId: 'a1',
        tool: 'list_services',
        status: 'executed',
        result: {
          services: [
            {
              serviceId: 'svc',
              name: 'Custom Case',
              description: 'Needs manual quote',
              basePrice: Number.NaN,
              turnaroundDays: 0,
              scanRequirements: [],
            },
          ],
        },
      },
    ]);

    expect(text).toContain('Custom Case — Price unavailable');
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
