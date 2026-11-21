import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { SttVocabularyService } from './stt-vocabulary-service';

describe('SttVocabularyService', () => {
  const scope = {
    tenantId: new Types.ObjectId('507f191e810c19729de860ea'),
    userId: new Types.ObjectId('507f191e810c19729de860eb'),
    isAdmin: true,
  };

  it('caches vocabulary snapshot for five minutes', async () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1000 + 4 * 60 * 1000);
    const loadDoctors = vi.fn().mockResolvedValue([{ id: 'd1', label: 'Ahmed' }]);
    const service = new SttVocabularyService({
      loadDoctors,
      loadClinics: vi.fn().mockResolvedValue([]),
      loadServices: vi.fn().mockResolvedValue([]),
      loadPatients: vi.fn().mockResolvedValue([{ id: 'p1', label: 'Youssef' }]),
      now,
    });

    await service.getVocabulary({ scope });
    await service.getVocabulary({ scope });

    expect(loadDoctors).toHaveBeenCalledTimes(1);
  });

  it('refreshes cache after ttl expiration', async () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1000 + 6 * 60 * 1000);
    const loadDoctors = vi.fn().mockResolvedValue([{ id: 'd1', label: 'Ahmed' }]);
    const service = new SttVocabularyService({
      loadDoctors,
      loadClinics: vi.fn().mockResolvedValue([]),
      loadServices: vi.fn().mockResolvedValue([]),
      loadPatients: vi.fn().mockResolvedValue([]),
      now,
    });

    await service.getVocabulary({ scope });
    await service.getVocabulary({ scope });

    expect(loadDoctors).toHaveBeenCalledTimes(2);
  });
});
