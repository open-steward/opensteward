/**
 * `/admin/data/metrics` and `/admin/data/currencies` — the metric catalog,
 * one metric's values and the currencies to filter by, for the admin
 * dashboards (via admin-api). Registered inside the data-access router, so
 * the admin guard, the scope header and the error envelope are shared.
 *
 *   GET /admin/data/metrics              — the catalog visible to the scope
 *   GET /admin/data/metrics/:id          — one metric:
 *         from, to     days, inclusive (default the last 30, at most 366)
 *         currency     ISO 4217 code; money kinds keep only it, counts with a
 *                      `currencyField` count only it, others ignore it
 *         granularity  auto | day | week | month (auto: ≤ 62 days day,
 *                      ≤ 182 week, else month)
 *         compare      1 → `previous`, the prior equal-length range
 *         connection   one connection id: only it (when in scope; else no data)
 *         platform     one adapter slug: only connections of that adapter
 *         vertical     with connection or platform: only that vertical's
 *                      connections (a slug can be an adapter in several)
 *   GET /admin/data/currencies           — distinct currencies across the
 *                                          in-scope money fields (sorted,
 *                                          no null), cached 60 s per scope;
 *                                          takes connection, platform and
 *                                          vertical too
 *
 * `connection` and `platform` only narrow the connections the scope already
 * allows (both together: AND). A connection outside the scope is not an
 * error — it simply contributes nothing — so the routes cannot be used to
 * learn whether an id exists. Malformed values are `400 INVALID_QUERY`.
 */
import type { FastifyInstance } from 'fastify'
import { HttpError, parseScope } from '../scope'
import type { MetricsEngine } from './engine'

interface MetricQuery {
  from?: string
  to?: string
  currency?: string
  granularity?: string
  compare?: string
  connection?: string
  platform?: string
  vertical?: string
}

function parseCompare(raw: string | undefined): boolean {
  if (raw === undefined || raw === '' || raw === '0' || raw === 'false') return false
  if (raw === '1' || raw === 'true') return true
  throw new HttpError(400, 'INVALID_QUERY', '`compare` must be 1 or 0.')
}

export function registerMetricsRoutes(fastify: FastifyInstance, engine: MetricsEngine): void {
  fastify.get('/admin/data/metrics', async (request, reply) => {
    const scope = parseScope(request)
    return reply.send({ data: engine.catalog(scope) })
  })

  fastify.get<{ Params: { id: string }; Querystring: MetricQuery }>(
    '/admin/data/metrics/:id',
    async (request, reply) => {
      const scope = parseScope(request)
      const q = request.query ?? {}
      const result = await engine.run(request.params.id, scope, {
        from: q.from || undefined,
        to: q.to || undefined,
        currency: q.currency || null,
        granularity: q.granularity || undefined,
        compare: parseCompare(q.compare),
        connection: q.connection || null,
        platform: q.platform || null,
        vertical: q.vertical || null,
      })
      return reply.header('cache-control', 'no-store').send({ data: result })
    },
  )

  fastify.get<{ Querystring: Pick<MetricQuery, 'connection' | 'platform' | 'vertical'> }>(
    '/admin/data/currencies',
    async (request, reply) => {
      const scope = parseScope(request)
      const q = request.query ?? {}
      const data = await engine.currencies(scope, {
        connection: q.connection || null,
        platform: q.platform || null,
        vertical: q.vertical || null,
      })
      return reply.header('cache-control', 'no-store').send({ data })
    },
  )
}
