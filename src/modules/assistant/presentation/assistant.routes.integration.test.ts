import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../../../app';

describe('assistant routes integration', () => {
  it('rejects suggestions without bearer authentication', async () => {
    const response = await request(app).get('/api/v1/assistant/suggestions');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error.code', 'UNAUTHORIZED');
  });

  it('ignores spoofed tenant and user headers without bearer authentication', async () => {
    const response = await request(app)
      .post('/api/v1/assistant/conversations')
      .set('x-tenant-id', '507f191e810c19729de860ea')
      .set('x-user-id', '507f191e810c19729de860eb')
      .send({
        title: 'test',
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error.code', 'UNAUTHORIZED');
  });

  it('exposes ai alias routes with same authentication requirement', async () => {
    const response = await request(app).get('/api/v1/ai/suggestions');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error.code', 'UNAUTHORIZED');
  });
});
