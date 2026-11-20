import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { z } from 'zod';

import { type SttLanguageHint } from '../../src/modules/assistant/application/speech-to-text-provider';
import {
  runSttEvaluation,
  serializeSttEvalReport,
  STT_EVAL_CATEGORIES,
  type SttEvalCategory,
  type SttEvalReport,
  type SttEvalSample,
} from './wer';

const LANGUAGE_HINTS = ['auto', 'ar', 'en', 'mixed'] as const;
const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

const recordingSchema = z.object({
  id: z.string().trim().min(1),
  category: z.enum(STT_EVAL_CATEGORIES),
  audioPath: z.string().trim().min(1),
  reference: z.string(),
  expectedEntities: z.array(z.string().trim().min(1)).optional().default([]),
  languageHint: z.enum(LANGUAGE_HINTS).optional(),
  mimeType: z.string().trim().min(1).optional(),
  hypothesis: z.string().optional(),
});

const manifestSchema = z.object({
  version: z.literal(1),
  description: z.string().optional(),
  recordings: z.array(recordingSchema).min(1),
});

export type SttEvalManifestRecording = z.infer<typeof recordingSchema>;
export type SttEvalManifest = z.infer<typeof manifestSchema>;

export interface SttEvalTranscriberInput {
  audio: Buffer;
  mimeType: string;
  languageHint?: SttLanguageHint;
}

export type SttEvalTranscriber = (input: SttEvalTranscriberInput) => Promise<string>;

export interface RunSttEvalOptions {
  manifestPath: string;
  transcriber?: SttEvalTranscriber;
  generatedAt?: Date;
}

export interface SttEvalCliArgs {
  manifestPath: string;
  outPath?: string;
}

/**
 * Loads and validates a local evaluation manifest. `audioPath` values are
 * resolved relative to the manifest file, so a manifest can describe a folder
 * of local recordings without hard-coding machine-specific paths.
 */
export async function loadSttEvalManifest(manifestPath: string): Promise<SttEvalManifest> {
  const absolutePath = resolve(manifestPath);
  let contents: string;

  try {
    contents = await readFile(absolutePath, 'utf8');
  } catch {
    throw new Error(`Could not read STT evaluation manifest: ${absolutePath}`);
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(contents.replace(/^\uFEFF/, '')) as unknown;
  } catch {
    throw new Error(`Invalid STT evaluation manifest: ${absolutePath} is not valid JSON`);
  }

  const parsed = manifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    throw new Error(`Invalid STT evaluation manifest: ${formatManifestIssues(parsed.error)}`);
  }

  assertUniqueRecordingIds(parsed.data.recordings);

  const manifestDirectory = dirname(absolutePath);
  return {
    ...parsed.data,
    recordings: parsed.data.recordings.map((recording) => ({
      ...recording,
      audioPath: resolve(manifestDirectory, recording.audioPath),
    })),
  };
}

/**
 * Runs every manifest recording through the transcriber (or uses its
 * precomputed `hypothesis`) and returns a timestamped, diffable report.
 */
export async function runSttEvalFromManifest(options: RunSttEvalOptions): Promise<SttEvalReport> {
  const manifest = await loadSttEvalManifest(options.manifestPath);
  const samples: SttEvalSample[] = [];
  let transcriber = options.transcriber;

  for (const recording of manifest.recordings) {
    let hypothesis = recording.hypothesis;

    if (hypothesis === undefined) {
      transcriber ??= await createDefaultTranscriber();
      const audio = await readRecordingAudio(recording);
      hypothesis = await transcribeRecording(transcriber, recording, audio);
    }

    samples.push({
      id: recording.id,
      category: recording.category,
      reference: recording.reference,
      hypothesis,
      expectedEntities: recording.expectedEntities,
    });
  }

  return runSttEvaluation({
    samples,
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
  });
}

export async function writeSttEvalReport(report: SttEvalReport, reportPath: string): Promise<void> {
  const absolutePath = resolve(reportPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, serializeSttEvalReport(report), 'utf8');
}

export function sttEvalReportFileName(generatedAt: Date): string {
  return `stt-eval-${generatedAt.toISOString().replace(/[-:.]/g, '')}.json`;
}

export function parseSttEvalCliArgs(argv: readonly string[]): SttEvalCliArgs {
  let manifestPath: string | undefined;
  let outPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--manifest') {
      manifestPath = argv[index + 1];
      index += 1;
      if (!manifestPath) {
        throw new Error('Missing value for --manifest <path>');
      }
    } else if (argument === '--out') {
      outPath = argv[index + 1];
      index += 1;
      if (!outPath) {
        throw new Error('Missing value for --out <path>');
      }
    } else {
      throw new Error(`Unknown argument: ${argument ?? ''}`);
    }
  }

  if (!manifestPath) {
    throw new Error('Missing required --manifest <path> argument');
  }

  return outPath === undefined ? { manifestPath } : { manifestPath, outPath };
}

export function formatSttEvalSummary(report: SttEvalReport): string {
  const lines = [`STT evaluation ${report.generatedAt}`];

  for (const category of STT_EVAL_CATEGORIES) {
    lines.push(formatCategoryLine(category, report.categories[category]));
  }
  lines.push(formatCategoryLine('overall', report.overall));

  return lines.join('\n');
}

async function createDefaultTranscriber(): Promise<SttEvalTranscriber> {
  const { createTranscriptionService } =
    await import('../../src/modules/assistant/application/assistant-service-factory.js');
  const service = createTranscriptionService();

  return async (input) => {
    const result = await service.transcribe({
      audio: input.audio,
      mimeType: input.mimeType,
      ...(input.languageHint ? { languageHint: input.languageHint } : {}),
    });
    return result.text;
  };
}

async function readRecordingAudio(recording: SttEvalManifestRecording): Promise<Buffer> {
  try {
    return await readFile(recording.audioPath);
  } catch {
    throw new Error(`Could not read audio for recording ${recording.id}`);
  }
}

async function transcribeRecording(
  transcriber: SttEvalTranscriber,
  recording: SttEvalManifestRecording,
  audio: Buffer,
): Promise<string> {
  const mimeType = recording.mimeType ?? inferAudioMimeType(recording.audioPath);

  try {
    return await transcriber({
      audio,
      mimeType,
      languageHint: recording.languageHint ?? defaultLanguageHint(recording.category),
    });
  } catch {
    throw new Error(`Transcription failed for recording ${recording.id}`);
  }
}

function inferAudioMimeType(audioPath: string): string {
  const extension = extname(audioPath).toLowerCase();
  const mimeType = MIME_TYPES_BY_EXTENSION[extension];

  if (!mimeType) {
    throw new Error(`Unsupported audio file extension for recording: ${extension || '<none>'}`);
  }

  return mimeType;
}

function defaultLanguageHint(category: SttEvalCategory): SttLanguageHint {
  return category === 'ar' || category === 'en' || category === 'mixed' ? category : 'auto';
}

function formatCategoryLine(label: string, report: SttEvalReport['overall']): string {
  return [
    label.padEnd(7),
    `samples=${report.sampleCount}`,
    `wer=${formatRate(report.wer)}`,
    `cer=${formatRate(report.cer)}`,
    `entity=${formatRate(report.entityAccuracy)}`,
    `hallucinations=${report.hallucinationCount}`,
  ].join(' ');
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(4);
}

function assertUniqueRecordingIds(recordings: readonly SttEvalManifestRecording[]): void {
  const ids = new Set<string>();

  for (const recording of recordings) {
    if (ids.has(recording.id)) {
      throw new Error(`Duplicate recording id in STT evaluation manifest: ${recording.id}`);
    }
    ids.add(recording.id);
  }
}

function formatManifestIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}

async function main(): Promise<void> {
  const args = parseSttEvalCliArgs(process.argv.slice(2));
  const generatedAt = new Date();
  const report = await runSttEvalFromManifest({
    manifestPath: resolve(args.manifestPath),
    generatedAt,
  });
  const reportPath = resolve(
    args.outPath ?? join('scripts', 'stt-eval', 'reports', sttEvalReportFileName(generatedAt)),
  );

  await writeSttEvalReport(report, reportPath);

  console.log(formatSttEvalSummary(report));
  console.log(`Report written to ${reportPath}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'STT evaluation failed');
    process.exitCode = 1;
  });
}
