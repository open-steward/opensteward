/**
 * OpenAPI components for the logo-fetch job surface.
 *
 * Split out of `_openapi.ts` only to keep that barrel from growing another
 * three nested objects; these are ordinary components and are referenced the
 * same way. Every leaf carries `.meta({ description, example })` because
 * `pnpm check:openapi-examples` walks every property of every component.
 */
import { z } from 'zod'
import 'fastify-zod-openapi'
import { IsoTimestamp } from './_openapi'

const VerticalProgress = z
  .object({
    total: z
      .number()
      .meta({ description: 'Platforms in this vertical the job will consider.', example: 214 }),
    processed: z
      .number()
      .meta({ description: 'Platforms in this vertical already handled.', example: 180 }),
    fetched: z
      .number()
      .meta({ description: 'Logos downloaded and stored for this vertical.', example: 168 }),
    skipped: z
      .number()
      .meta({ description: 'Platforms skipped because a logo was already stored.', example: 4 }),
    notFound: z.number().meta({ description: 'Platforms Brandfetch has no logo for.', example: 8 }),
  })
  .meta({ id: 'LogoFetchVerticalProgress', description: 'Per-vertical breakdown of a logo fetch.' })

export const LogoFetchProgressSchema = z
  .object({
    total: z
      .number()
      .meta({ description: 'Platforms the job will consider in total.', example: 1545 }),
    processed: z.number().meta({ description: 'Platforms handled so far.', example: 902 }),
    fetched: z.number().meta({ description: 'Logos downloaded and stored.', example: 840 }),
    skipped: z
      .number()
      .meta({ description: 'Platforms skipped because a logo was already stored.', example: 20 }),
    notFound: z.number().meta({
      description:
        'Platforms Brandfetch has no logo for. Not a failure — roughly 70 of the catalog have none.',
      example: 42,
    }),
    throttled: z.number().meta({
      description:
        'Platforms abandoned to Brandfetch rate limiting. Counted separately from notFound so a later re-run picks up exactly these.',
      example: 0,
    }),
    currentSlug: z
      .string()
      .nullable()
      .meta({ description: 'Platform being fetched right now.', example: 'xero' }),
    currentVertical: z
      .string()
      .nullable()
      .meta({ description: 'Vertical being fetched right now.', example: 'accounting' }),
    etaMs: z
      .number()
      .nullable()
      .meta({
        description:
          'Estimated milliseconds remaining; null until enough platforms have completed to be meaningful.',
        example: 780000,
      }),
    byVertical: z
      .record(z.string(), VerticalProgress)
      .meta({
        description: 'Progress keyed by vertical.',
        example: {
          accounting: { total: 214, processed: 180, fetched: 168, skipped: 4, notFound: 8 },
        },
      }),
    lastError: z
      .string()
      .nullable()
      .meta({
        description: 'Most recent non-fatal problem, such as a rate-limit backoff.',
        example: 'Brandfetch is rate-limiting; backing off.',
      }),
  })
  .meta({
    id: 'LogoFetchProgress',
    description: 'Live counters for a running or finished logo fetch.',
  })

export const LogoFetchJobSchema = z
  .object({
    id: z.string().meta({ description: 'Job identifier.', example: 'lfj_01HQ8ZKX7M2P4R6T8V0W' }),
    status: z
      .enum(['pending', 'running', 'cancelling', 'completed', 'failed', 'cancelled'])
      .meta({ description: 'Job lifecycle state.', example: 'running' }),
    force: z
      .boolean()
      .meta({
        description: 'True when the job refetches logos that are already stored.',
        example: false,
      }),
    vertical: z
      .string()
      .nullable()
      .meta({
        description: 'Vertical the job is limited to, or null for all.',
        example: 'accounting',
      }),
    slug: z
      .string()
      .nullable()
      .meta({
        description: 'Single platform the job is limited to, or null for all.',
        example: 'xero',
      }),
    delayMs: z
      .number()
      .meta({
        description: 'Milliseconds between Brandfetch requests for this job.',
        example: 400,
      }),
    total: z.number().meta({ description: 'Platforms the job will consider.', example: 1545 }),
    progress: LogoFetchProgressSchema.nullable().meta({
      description: 'Live counters, or null before the job starts.',
    }),
    error: z
      .string()
      .nullable()
      .meta({ description: 'Failure reason when the job failed.', example: null }),
    workerId: z
      .string()
      .nullable()
      .meta({
        description: 'Identifier of the replica running the job.',
        example: 'admin-api-7d9f:1:3ab91c2e',
      }),
    attempts: z
      .number()
      .meta({
        description: 'How many times a worker has claimed this job; a crashed run is requeued.',
        example: 1,
      }),
    heartbeatAt: IsoTimestamp.nullable().meta({
      description: 'Last liveness ping from the owning replica (ISO 8601).',
      example: '2026-02-01T14:20:00.000Z',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the job was queued (ISO 8601).',
      example: '2026-02-01T14:18:00.000Z',
    }),
    createdBy: z
      .string()
      .nullable()
      .meta({ description: 'Admin user who started the job.', example: 'usr_olivia' }),
    startedAt: IsoTimestamp.nullable().meta({
      description: 'When a worker claimed the job (ISO 8601).',
      example: '2026-02-01T14:19:00.000Z',
    }),
    completedAt: IsoTimestamp.nullable().meta({
      description: 'When the job reached a terminal state (ISO 8601).',
      example: null,
    }),
  })
  .meta({ id: 'LogoFetchJob', description: 'A background platform-logo fetch and its progress.' })

export const LogoStatusSchema = z
  .object({
    count: z
      .number()
      .meta({ description: 'Platforms with at least one stored logo.', example: 1402 }),
    totalBytes: z
      .number()
      .meta({ description: 'Total size of all stored logo bytes.', example: 15728640 }),
    lastFetchedAt: IsoTimestamp.nullable().meta({
      description:
        'When the newest stored logo was fetched (ISO 8601), or null when none are stored.',
      example: '2026-02-01T14:20:00.000Z',
    }),
  })
  .meta({ id: 'LogoStatus', description: 'Summary of the logos this deployment has stored.' })
