import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../app';

describe('API integration', () => {
  it('returns health snapshot', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data.status', 'ok');
  });

  it('returns OpenAPI document JSON', async () => {
    const response = await request(app).get('/api/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('openapi');
    expect(response.body).toHaveProperty('paths');
  });

  it('rejects protected v1 endpoints without bearer token', async () => {
    const response = await request(app).get('/api/v1/clinics');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error.code', 'UNAUTHORIZED');
  });

  it('rewrites legacy /api/order route to v1 orders surface', async () => {
    const response = await request(app).get('/api/order');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error.code', 'UNAUTHORIZED');
  });

  it('rejects login when tenantId is not an ObjectId', async () => {
    const response = await request(app).post('/api/auth/login').send({
      tenantId: 'string',
      email: 'dev-admin@example.test',
      password: 'ChangeMe123!',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error.code', 'VALIDATION_ERROR');
  });
});
