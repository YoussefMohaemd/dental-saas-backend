import { afterEach, describe, expect, it, vi } from 'vitest';

const TRACKED_ENV_KEYS = [
  'AI_ASSISTANT_CREATE_TOOLS_ENABLED',
  'AI_ASSISTANT_MAX_OUTPUT_TOKENS',
  'AI_ASSISTANT_PROVIDER',
  'AI_ASSISTANT_GEMINI_MODEL',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_API_TOKEN',
  'STT_PROVIDER',
  'DEEPGRAM_STT_API_KEY',
  'DEEPGRAM_STT_MODEL',
  'STT_GEMINI_MODEL',
  'STT_TIMEOUT_MS',
  'STT_TOTAL_DEADLINE_MS',
  'STT_ESCALATION_CONFIDENCE',
  'STT_SEND_PATIENT_NAMES',
  'STT_ENTITY_CORRECTION',
] as const;

const originalEnv = Object.fromEntries(
  TRACKED_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>;

afterEach(() => {
  for (const key of TRACKED_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
});

describe('env defaults', () => {
  it('enables assistant create tools by default when no env override is provided', async () => {
    delete process.env.AI_ASSISTANT_CREATE_TOOLS_ENABLED;

    const { env } = await import('./env.js');

    expect(env.AI_ASSISTANT_CREATE_TOOLS_ENABLED).toBe(true);
  });

  it('applies assistant speed-oriented defaults', async () => {
    delete process.env.AI_ASSISTANT_TIMEOUT_MS;
    delete process.env.AI_ASSISTANT_MAX_OUTPUT_TOKENS;

    const { env } = await import('./env.js');

    expect(env.AI_ASSISTANT_TIMEOUT_MS).toBe(15_000);
    expect(env.AI_ASSISTANT_MAX_OUTPUT_TOKENS).toBe(450);
  });

  it('applies stt defaults with supported gemini stt model', async () => {
    delete process.env.STT_PROVIDER;
    delete process.env.DEEPGRAM_STT_MODEL;
    delete process.env.STT_GEMINI_MODEL;
    delete process.env.STT_TIMEOUT_MS;
    delete process.env.STT_TOTAL_DEADLINE_MS;
    delete process.env.STT_ESCALATION_CONFIDENCE;
    delete process.env.STT_SEND_PATIENT_NAMES;
    delete process.env.STT_ENTITY_CORRECTION;

    const { env } = await import('./env.js');

    expect(env.STT_PROVIDER).toBe('groq');
    expect(env.DEEPGRAM_STT_MODEL).toBe('nova-3');
    expect(env.STT_GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(env.STT_TIMEOUT_MS).toBe(15_000);
    expect(env.STT_TOTAL_DEADLINE_MS).toBe(40_000);
    expect(env.STT_ESCALATION_CONFIDENCE).toBe(0.8);
    expect(env.STT_SEND_PATIENT_NAMES).toBe(false);
    expect(env.STT_ENTITY_CORRECTION).toBe(false);
  });

  it('accepts explicit stt overrides', async () => {
    process.env.STT_GEMINI_MODEL = 'gemini-stt-custom';
    process.env.STT_TIMEOUT_MS = '55000';
    process.env.STT_TOTAL_DEADLINE_MS = '110000';
    process.env.STT_ESCALATION_CONFIDENCE = '0.65';
    process.env.STT_SEND_PATIENT_NAMES = 'true';
    process.env.STT_ENTITY_CORRECTION = 'true';

    const { env } = await import('./env.js');

    expect(env.STT_GEMINI_MODEL).toBe('gemini-stt-custom');
    expect(env.STT_TIMEOUT_MS).toBe(55_000);
    expect(env.STT_TOTAL_DEADLINE_MS).toBe(110_000);
    expect(env.STT_ESCALATION_CONFIDENCE).toBe(0.65);
    expect(env.STT_SEND_PATIENT_NAMES).toBe(true);
    expect(env.STT_ENTITY_CORRECTION).toBe(true);
  });

  it('falls back to supported stt default when STT_GEMINI_MODEL is blank', async () => {
    process.env.STT_GEMINI_MODEL = '   ';

    const { env } = await import('./env.js');

    expect(env.STT_GEMINI_MODEL).toBe('gemini-3.8-flash');
  });

  it('rejects deprecated stt gemini model value', async () => {
    process.env.STT_GEMINI_MODEL = 'gemini-2.5-flash';

    await expect(import('./env.js')).rejects.toThrow(/STT_GEMINI_MODEL/);
  });

  it('rejects an escalation confidence outside 0..1', async () => {
    process.env.STT_ESCALATION_CONFIDENCE = '1.5';

    await expect(import('./env.js')).rejects.toThrow(/STT_ESCALATION_CONFIDENCE/);
  });

  it('requires Cloudflare credentials when Cloudflare assistant provider is selected', async () => {
    process.env.AI_ASSISTANT_PROVIDER = 'cloudflare';
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_API_TOKEN;

    await expect(import('./env.js')).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/);
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow(/CLOUDFLARE_AI_API_TOKEN/);
  });

  it('requires Deepgram api key when deepgram stt provider is selected', async () => {
    process.env.STT_PROVIDER = 'deepgram';
    delete process.env.DEEPGRAM_STT_API_KEY;

    await expect(import('./env.js')).rejects.toThrow(/DEEPGRAM_STT_API_KEY/);
  });
});
