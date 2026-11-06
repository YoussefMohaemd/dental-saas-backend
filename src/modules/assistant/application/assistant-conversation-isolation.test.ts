import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { AssistantService } from './assistant-service';

const TENANT = '66f100000000000000000001';
const ADMIN_ID = '66f1000000000000000000aa';
const DOCTOR_ID = '66f1000000000000000000bb';

function principal(userId: string, roles: string[]) {
  return {
    tenantId: TENANT,
    userId,
    roles,
    scope: {
      tenantId: new Types.ObjectId(TENANT),
      userId: new Types.ObjectId(userId),
      roles,
      isAdmin: roles.includes('admin'),
      isDoctor: roles.includes('doctor'),
    },
  };
}

describe('assistant conversation isolation', () => {
  it('never lists or opens another user conversations, even inside the same tenant', async () => {
    const service = AssistantService.createForTests();
    const doctor = principal(DOCTOR_ID, ['doctor']);
    const admin = principal(ADMIN_ID, ['admin']);

    const doctorChat = await service.createConversation({
      tenantId: TENANT,
      userId: DOCTOR_ID,
      roles: doctor.roles,
      title: 'Doctor private chat',
    });
    await service.postMessage(doctor, { conversationId: doctorChat.id, content: 'hello' });

    expect(await service.listConversations(admin)).toHaveLength(0);
    await expect(service.getConversation(admin, doctorChat.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.postMessage(admin, { conversationId: doctorChat.id, content: 'peek' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await service.listConversations(doctor)).toHaveLength(1);
  });
});
