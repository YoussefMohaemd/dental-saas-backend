import { describe, expect, it } from 'vitest';

import { AssistantLookupService } from './assistant-lookup-service';

describe('AssistantLookupService', () => {
  it('returns normalized scoped candidates instead of selecting a duplicate', async () => {
    const service = new AssistantLookupService({
      patients: async () => [
        { id: 'p1', name: 'يوسف', phone: '0100' },
        { id: 'p2', name: 'يُوسُف', phone: '0111' },
      ],
    });

    await expect(
      service.lookup({
        kind: 'patients',
        query: 'يُوسُف',
        scope: { tenantId: 'tenant-1' } as never,
        limit: 20,
      }),
    ).resolves.toEqual({
      items: [
        { id: 'p1', label: 'يوسف', sublabel: '0100' },
        { id: 'p2', label: 'يُوسُف', sublabel: '0111' },
      ],
    });
  });

  it('returns a Latin record for an Arabic name query', async () => {
    const service = new AssistantLookupService({
      patients: async () => [{ id: 'p1', name: 'Saif', phone: '0100' }],
    });

    await expect(
      service.lookup({
        kind: 'patients',
        query: 'سيف',
        scope: { tenantId: 'tenant-1' } as never,
        limit: 20,
      }),
    ).resolves.toEqual({
      items: [{ id: 'p1', label: 'Saif', sublabel: '0100' }],
    });
  });
});
