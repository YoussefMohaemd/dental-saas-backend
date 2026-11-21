export interface SttEvalFixture {
  bucket: 'ar' | 'en' | 'mixed';
  referenceText: string;
  hypothesisText: string;
  expectedEntities?: string[];
  detectedEntities?: string[];
}

export const STT_EVAL_FIXTURES: SttEvalFixture[] = [
  {
    bucket: 'ar',
    referenceText: 'مرحبا يا دكتور',
    hypothesisText: 'مرحبا يا دكتور',
    expectedEntities: ['دكتور أحمد'],
    detectedEntities: ['دكتور أحمد'],
  },
  {
    bucket: 'en',
    referenceText: 'hello doctor',
    hypothesisText: 'hello',
    expectedEntities: ['Crown'],
    detectedEntities: [],
  },
  {
    bucket: 'mixed',
    referenceText: 'hello دكتور',
    hypothesisText: 'hello doctor',
    expectedEntities: ['Clinic A'],
    detectedEntities: ['Clinic A'],
  },
];
