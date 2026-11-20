import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadSttEvalManifest,
  parseSttEvalCliArgs,
  runSttEvalFromManifest,
  sttEvalReportFileName,
  writeSttEvalReport,
  type SttEvalTranscriberInput,
} from './run-eval';
import { runSttEvaluation, type SttEvalSample } from './wer';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'stt-eval-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeManifest(directory: string, manifest: unknown): Promise<string> {
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
  return manifestPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadSttEvalManifest', () => {
  it('resolves audio paths relative to the manifest and defaults expected entities', async () => {
    const directory = await createTemporaryDirectory();
    const manifestPath = await writeManifest(directory, {
      version: 1,
      recordings: [
        {
          id: 'en-1',
          category: 'en',
          audioPath: 'audio/en-1.wav',
          reference: 'hello world',
          hypothesis: 'hello world',
        },
      ],
    });

    const manifest = await loadSttEvalManifest(manifestPath);
    const [recording] = manifest.recordings;

    expect(recording?.audioPath).toBe(resolve(directory, 'audio', 'en-1.wav'));
    expect(recording?.expectedEntities).toEqual([]);
  });

  it('rejects duplicate recording ids', async () => {
    const directory = await createTemporaryDirectory();
    const manifestPath = await writeManifest(directory, {
      version: 1,
      recordings: [
        { id: 'en-1', category: 'en', audioPath: 'a.wav', reference: 'hello' },
        { id: 'en-1', category: 'en', audioPath: 'b.wav', reference: 'world' },
      ],
    });

    await expect(loadSttEvalManifest(manifestPath)).rejects.toThrow(/duplicate/i);
  });

  it('rejects categories outside the evaluation dataset', async () => {
    const directory = await createTemporaryDirectory();
    const manifestPath = await writeManifest(directory, {
      version: 1,
      recordings: [{ id: 'xx-1', category: 'french', audioPath: 'a.wav', reference: 'bonjour' }],
    });

    await expect(loadSttEvalManifest(manifestPath)).rejects.toThrow(/category/i);
  });

  it('rejects unknown manifest versions', async () => {
    const directory = await createTemporaryDirectory();
    const manifestPath = await writeManifest(directory, { version: 2, recordings: [] });

    await expect(loadSttEvalManifest(manifestPath)).rejects.toThrow(/version/i);
  });

  it('rejects malformed JSON as an invalid manifest', async () => {
    const directory = await createTemporaryDirectory();
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(manifestPath, '{ not json', 'utf8');

    await expect(loadSttEvalManifest(manifestPath)).rejects.toThrow(/invalid.*manifest/i);
  });

  it('accepts a UTF-8 byte order mark', async () => {
    const directory = await createTemporaryDirectory();
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(
      manifestPath,
      `\uFEFF${JSON.stringify({
        version: 1,
        recordings: [
          {
            id: 'en-1',
            category: 'en',
            audioPath: 'audio/en-1.wav',
            reference: 'hello',
            hypothesis: 'hello',
          },
        ],
      })}`,
      'utf8',
    );

    const manifest = await loadSttEvalManifest(manifestPath);

    expect(manifest.recordings).toHaveLength(1);
  });
});

describe('runSttEvalFromManifest', () => {
  it('scores precomputed hypotheses without transcribing audio', async () => {
    const directory = await createTemporaryDirectory();
    const manifestPath = await writeManifest(directory, {
      version: 1,
      recordings: [
        {
          id: 'en-1',
          category: 'en',
          audioPath: 'audio/missing.wav',
          reference: 'hello world',
          hypothesis: 'hello word',
        },
      ],
    });
    const transcriber = vi.fn(() => Promise.resolve('unused'));

    const report = await runSttEvalFromManifest({
      manifestPath,
      transcriber,
      generatedAt: new Date('2026-11-20T15:10:20.123Z'),
    });

    expect(transcriber).not.toHaveBeenCalled();
    expect(report.categories.en.wer).toBe(0.5);
    expect(report.generatedAt).toBe('2026-11-20T15:10:20.123Z');
  });

  it('transcribes audio when the manifest has no hypothesis', async () => {
    const directory = await createTemporaryDirectory();
    const audioPath = join(directory, 'audio', 'en-1.wav');
    await mkdir(join(directory, 'audio'), { recursive: true });
    await writeFile(audioPath, Buffer.from('synthetic audio bytes'), 'utf8');
    const manifestPath = await writeManifest(directory, {
      version: 1,
      recordings: [
        {
          id: 'en-1',
          category: 'en',
          audioPath: 'audio/en-1.wav',
          reference: 'hello world',
        },
      ],
    });
    const transcriber = vi.fn((input: SttEvalTranscriberInput) => {
      expect(input.mimeType).toBe('audio/wav');
      expect(input.languageHint).toBe('en');
      return Promise.resolve('hello world');
    });

    const report = await runSttEvalFromManifest({ manifestPath, transcriber });

    expect(transcriber).toHaveBeenCalledTimes(1);
    expect(report.categories.en.wer).toBe(0);
  });

  it('prefers an explicit language hint over the category default', async () => {
    const directory = await createTemporaryDirectory();
    const audioPath = join(directory, 'audio', 'mixed-1.m4a');
    await mkdir(join(directory, 'audio'), { recursive: true });
    await writeFile(audioPath, Buffer.from('synthetic audio bytes'), 'utf8');
    const manifestPath = await writeManifest(directory, {
      version: 1,
      recordings: [
        {
          id: 'mixed-1',
          category: 'mixed',
          audioPath: 'audio/mixed-1.m4a',
          reference: 'موعد checkup اليوم',
          languageHint: 'auto',
        },
      ],
    });
    const transcriber = vi.fn((input: SttEvalTranscriberInput) => {
      expect(input.mimeType).toBe('audio/mp4');
      expect(input.languageHint).toBe('auto');
      return Promise.resolve('موعد checkup اليوم');
    });

    await runSttEvalFromManifest({ manifestPath, transcriber });

    expect(transcriber).toHaveBeenCalledTimes(1);
  });
});

describe('report output', () => {
  it('names reports with a sortable timestamp', () => {
    expect(sttEvalReportFileName(new Date('2026-11-20T15:10:20.123Z'))).toBe(
      'stt-eval-20261120T151020123Z.json',
    );
  });

  it('writes a deterministic report file, creating parent directories', async () => {
    const directory = await createTemporaryDirectory();
    const samples: SttEvalSample[] = [
      {
        id: 'en-1',
        category: 'en',
        reference: 'hello world',
        hypothesis: 'hello word',
        expectedEntities: [],
      },
    ];
    const report = runSttEvaluation({
      samples,
      generatedAt: new Date('2026-11-20T15:10:20.123Z'),
    });
    const reportPath = join(directory, 'reports', 'baseline.json');

    await writeSttEvalReport(report, reportPath);

    const written = await readFile(reportPath, 'utf8');

    expect(written.endsWith('\n')).toBe(true);
    expect(JSON.parse(written)).toEqual(report);
  });
});

describe('parseSttEvalCliArgs', () => {
  it('parses the manifest and optional report path', () => {
    expect(
      parseSttEvalCliArgs(['--manifest', 'local/manifest.json', '--out', 'reports/base.json']),
    ).toEqual({ manifestPath: 'local/manifest.json', outPath: 'reports/base.json' });
  });

  it('requires a manifest path', () => {
    expect(() => parseSttEvalCliArgs([])).toThrow(/--manifest/);
  });

  it('rejects unknown arguments', () => {
    expect(() => parseSttEvalCliArgs(['--manifest', 'a.json', '--wat'])).toThrow(/unknown/i);
  });
});
