/**
 * Platform logo storage and the operator-triggered fetch job.
 *
 *   POST   /api/logo-fetch              — queue a fetch (202 + job row)
 *   GET    /api/logo-fetch              — recent jobs
 *   GET    /api/logo-fetch/:id          — one job
 *   POST   /api/logo-fetch/:id/cancel   — cooperative cancel
 *   GET    /api/logos/status            — how many logos are stored
 *   DELETE /api/logos                   — purge every stored logo
 *
 * Plus three endpoints that are deliberately unauthenticated and hidden from
 * the OpenAPI spec:
 *
 *   GET /data/platform-logos/manifest.json
 *   GET /data/platform-logos/:file
 *   GET /data/platform-logos/config
 *
 * Why `/data/` and not `/api/`:
 *   - `createBaseServer` already exempts `/data/` from the 600/min per-IP rate
 *     limit. One docs-server pod rendering the catalog issues 100+ logo
 *     requests from a single IP, which under `/api/` would exhaust the budget
 *     and start 429-ing that pod's real admin-api calls.
 *   - It matches the `/data/platforms/logos/` URL the two consumers proxy.
 *
 * Why unauthenticated: platform slugs are non-secret catalog data (shipped in
 * the open-source metadata and the published docs), and the bytes are
 * rendered on a public docs page. Same trust boundary as
 * `GET /api/company-info/public`. (`GET /v1/platforms` itself now requires a
 * credential — that gate protects the deployment's enable-state, not the
 * slugs.)
 *
 * Why hidden from the spec: a Buffer response cannot carry a Zod response
 * schema, and exposing them would grow a nonsense `os logos get-file` command
 * in the generated CLI.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { resolveLogoConfig, SETTING } from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import type { LogoStore, LogoHead, LogoExt } from '../db/logo-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import { isUniqueViolation } from '../db/sql-errors'
import { dataEnvelope, listEnvelope, errorBody } from './_openapi'
import { LogoFetchJobSchema, LogoStatusSchema } from './_logos-schema'

const TAG = 'logos'

/**
 * `<slug>.<ext>`. Every one of the 1,545 catalog slugs matches
 * `^[a-z0-9][a-z0-9-]*$`, so this doubles as the path-traversal guard: no
 * slash, no dot-dot and no absolute path can get through it.
 */
const LOGO_FILE = /^([a-z0-9][a-z0-9-]*)\.(svg|png)$/

const CreateFetchBody = z.object({
  force: z.boolean().optional().meta({
    description: 'Refetch logos that are already stored instead of skipping them.',
    example: false,
  }),
  vertical: z.string().optional().meta({
    description: 'Limit the fetch to one vertical.',
    example: 'accounting',
  }),
  slug: z.string().optional().meta({
    description: 'Limit the fetch to a single platform.',
    example: 'xero',
  }),
})

const JobIdParam = z.object({
  id: z.string().meta({ description: 'Logo-fetch job identifier.', example: 'lfj_01HQ8ZK' }),
})

/**
 * Explicit allow-list for what a public logo response may reveal. Deliberately
 * never spreads the row: `fetched_by` is an internal job id and `source_domain`
 * shows which upstream this deployment scrapes. Same discipline as
 * `toPublic()` in company-info.ts.
 */
function toPublicLogoHeaders(head: LogoHead): Record<string, string> {
  return {
    etag: `"${head.etag}"`,
    'content-type': head.contentType,
    'content-length': String(head.byteSize),
    'last-modified': new Date(head.fetchedAt).toUTCString(),
    // Not immutable: the URL is not content-addressed, so a re-fetch must not
    // be pinned behind a stale cache. Five minutes plus an ETag makes the
    // steady state a ~200 byte 304.
    'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
    'x-content-type-options': 'nosniff',
    vary: 'accept-encoding',
  }
}

function ifNoneMatchHits(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false
  const raw = Array.isArray(header) ? header.join(',') : header
  return raw.split(',').some((t) => {
    const tag = t.trim()
    return tag === etag || tag === `W/${etag}` || tag === '*'
  })
}

export function createLogoRoutes(
  adminStore: AdminStore,
  logoStore: LogoStore,
  runtimeSettings: RuntimeSettingsStore,
): FastifyPluginAsync {
  return async function (fastify) {
    // ── Job control (authenticated, in the spec) ─────────────────────────

    fastify.post(
      '/api/logo-fetch',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Start a platform logo fetch',
          description:
            'Queue a background job that downloads platform logos from Brandfetch and stores them in the admin database. Returns 202 with the queued job. A full catalog run takes tens of minutes; poll the job for progress. Only one fetch may run at a time.',
          operationId: 'logo-fetch.start',
          body: CreateFetchBody,
          response: {
            202: dataEnvelope(LogoFetchJobSchema),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = CreateFetchBody.parse(request.body ?? {})

        const clientId = String(
          (await runtimeSettings.get(SETTING.LOGOS_BRANDFETCH_CLIENT_ID))?.value ?? '',
        ).trim()
        if (!clientId) {
          return reply.code(400).send({
            error:
              'No Brandfetch client ID is set. Add one under Platforms → Logos before starting a fetch. Free at https://brandfetch.com/developers.',
            code: 'BRANDFETCH_CLIENT_ID_MISSING',
          })
        }

        const active = await logoStore.findActive()
        if (active) {
          return reply.code(409).send({
            error: 'A logo fetch is already running.',
            code: 'LOGO_FETCH_IN_PROGRESS',
            data: active,
          })
        }

        const delaySetting = (await runtimeSettings.get(SETTING.LOGOS_FETCH_DELAY_MS))?.value
        const delayMs = typeof delaySetting === 'number' && delaySetting > 0 ? delaySetting : 400

        try {
          const job = await logoStore.createJob({
            id: `lfj_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
            force: body.force ?? false,
            vertical: body.vertical ?? null,
            slug: body.slug ?? null,
            delayMs,
            // The worker recomputes the real total from the catalog; this is
            // only a placeholder until it claims the job.
            total: 0,
            createdBy: request.jwtUser?.id ?? null,
          })

          await adminStore.writeAudit({
            userId: request.jwtUser!.id,
            action: 'logo_fetch.start',
            detail: {
              jobId: job.id,
              force: job.force,
              vertical: job.vertical,
              slug: job.slug,
              total: job.total,
            },
          })

          return reply.code(202).send({ data: job })
        } catch (err) {
          // The unique index on active_key is the real single-flight guarantee:
          // two admin-api replicas can both pass the findActive() check above.
          if (isUniqueViolation(err)) {
            const running = await logoStore.findActive()
            return reply.code(409).send({
              error: 'A logo fetch is already running.',
              code: 'LOGO_FETCH_IN_PROGRESS',
              data: running,
            })
          }
          throw err
        }
      },
    )

    fastify.get(
      '/api/logo-fetch',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'List logo-fetch jobs',
          description:
            'Recent logo-fetch jobs, newest first. Any authenticated operator may watch a running fetch.',
          operationId: 'logo-fetch.list',
          response: { 200: listEnvelope(LogoFetchJobSchema), 401: errorBody },
        },
      },
      async () => {
        const data = await logoStore.listJobs()
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get(
      '/api/logo-fetch/:id',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'Get a logo-fetch job',
          description: 'Fetch one logo-fetch job, including its per-vertical progress counters.',
          operationId: 'logo-fetch.get',
          params: JobIdParam,
          response: { 200: dataEnvelope(LogoFetchJobSchema), 401: errorBody, 404: errorBody },
        },
      },
      async (request, reply) => {
        const { id } = JobIdParam.parse(request.params)
        const job = await logoStore.getJob(id)
        if (!job) {
          return reply
            .code(404)
            .send({ error: 'Logo-fetch job not found.', code: 'LOGO_FETCH_NOT_FOUND' })
        }
        return { data: job }
      },
    )

    fastify.post(
      '/api/logo-fetch/:id/cancel',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Cancel a logo-fetch job',
          description:
            'Ask a logo-fetch job to stop. A queued job is cancelled immediately (200). A running job moves to `cancelling` and stops at its next checkpoint (202) — cancellation is cooperative because the request usually lands on a different replica than the one running the job. Logos already fetched are kept.',
          operationId: 'logo-fetch.cancel',
          params: JobIdParam,
          response: {
            200: dataEnvelope(LogoFetchJobSchema),
            202: dataEnvelope(LogoFetchJobSchema),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const { id } = JobIdParam.parse(request.params)
        const existing = await logoStore.getJob(id)
        if (!existing) {
          return reply
            .code(404)
            .send({ error: 'Logo-fetch job not found.', code: 'LOGO_FETCH_NOT_FOUND' })
        }
        if (!['pending', 'running'].includes(existing.status)) {
          return reply.code(409).send({
            error: `Job is ${existing.status} and cannot be cancelled.`,
            code: 'LOGO_FETCH_NOT_CANCELABLE',
          })
        }

        const job = await logoStore.requestCancel(id)
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'logo_fetch.cancel',
          detail: { jobId: id, processed: job?.progress?.processed ?? 0 },
        })
        return reply.code(job?.status === 'cancelled' ? 200 : 202).send({ data: job })
      },
    )

    fastify.get(
      '/api/logos/status',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'Stored logo statistics',
          description:
            'How many platform logos this deployment has stored, their total size, and when the newest was fetched.',
          operationId: 'logos.status',
          response: { 200: dataEnvelope(LogoStatusSchema), 401: errorBody },
        },
      },
      async () => ({ data: await logoStore.countLogos() }),
    )

    fastify.delete(
      '/api/logos',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Delete every stored logo',
          description:
            'Remove all stored platform logos. The catalog falls back to monogram tiles immediately. Provided because storing logos is caching under Brandfetch’s terms, so an operator needs a way to undo it.',
          operationId: 'logos.purge',
          response: {
            200: dataEnvelope(
              z
                .object({
                  deleted: z
                    .number()
                    .meta({ description: 'Number of logo rows removed.', example: 1402 }),
                })
                .meta({ id: 'LogoPurgeResult' }),
            ),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const deleted = await logoStore.deleteAllLogos()
        // Job rows are deliberately NOT cleared here. They are a log of what
        // ran — including runs that were cancelled or failed and stored
        // nothing — and that history is most useful precisely when the library
        // is empty. Clearing them would empty the "Recent fetches" list; stale
        // progress is handled where it belongs: the progress card only renders
        // for a job that is actually running, and the library card is the
        // single source of truth for what is stored now.
        // `logos.job_retention_days` bounds the growth.
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'logo_fetch.purge',
          detail: { deleted },
        })
        return { data: { deleted } }
      },
    )

    // ── Public byte surface (hidden from the spec) ───────────────────────

    fastify.get('/data/platform-logos/config', { schema: { hide: true } }, async () => {
      // Resolve server-side so the validated verdict crosses the wire: if an
      // operator somehow persists a bad mode, both consumers get `none`
      // rather than each deciding for themselves.
      const source = String((await runtimeSettings.get(SETTING.LOGOS_SOURCE))?.value ?? '')
      const brandfetchClientId = String(
        (await runtimeSettings.get(SETTING.LOGOS_BRANDFETCH_CLIENT_ID))?.value ?? '',
      )
      const config = resolveLogoConfig({ source, brandfetchClientId }, { warn: false })
      return {
        logoSource: config.logoSource,
        brandfetchClientId: config.brandfetchClientId ?? null,
      }
    })

    fastify.get(
      '/data/platform-logos/manifest.json',
      { schema: { hide: true } },
      async (_request, reply) => {
        const logos = await logoStore.manifest()
        return reply
          .header('cache-control', 'public, max-age=60')
          .send({ count: Object.keys(logos).length, logos })
      },
    )

    fastify.get<{ Params: { file: string } }>(
      '/data/platform-logos/:file',
      { schema: { hide: true } },
      async (request, reply): Promise<FastifyReply> => {
        const match = LOGO_FILE.exec(request.params.file)
        // 404 rather than 400 even for a malformed name: platforms-ui only
        // needs "no logo here" to run its .svg → .png → monogram fallback, and
        // refusing to distinguish the two tells a scanner nothing.
        if (!match) return reply.code(404).send()
        const [, slug, ext] = match

        const head = await logoStore.headLogo(slug, ext as LogoExt)
        if (!head) return reply.code(404).send()

        const headers = toPublicLogoHeaders(head)
        if (ifNoneMatchHits(request.headers['if-none-match'], headers.etag)) {
          // headLogo never selected the bytes, so the common warm-cache case
          // costs no blob read at all.
          for (const [k, v] of Object.entries(headers)) {
            if (k !== 'content-length' && k !== 'content-type') reply.header(k, v)
          }
          return reply.code(304).send()
        }

        const row = await logoStore.getLogo(slug, ext as LogoExt)
        if (!row) return reply.code(404).send() // raced a purge
        for (const [k, v] of Object.entries(headers)) reply.header(k, v)
        return reply.send(row.bytes)
      },
    )
  }
}
