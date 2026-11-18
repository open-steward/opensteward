/**
 * Shared server bootstrap — creates a Fastify instance with common plugins pre-wired.
 *
 * Each app calls this, then registers its own routes and adapters on top.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { timingSafeEqual } from 'node:crypto'

/**
 * Pino redact paths applied to every request/response log line. Covers
 * authentication headers (operator + tenant) and Set-Cookie to keep
 * session tokens out of stdout, log shippers, and SIEMs.
 *
 * Exported so unit tests and downstream apps can extend the list.
 */
export const LOG_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-admin-secret"]',
  'req.headers["x-api-key"]',
  'req.headers["x-bootstrap-token"]',
  'res.headers["set-cookie"]',
  // Outbound credentials, via a logged error. Every adapter client bakes the
  // connection's live token into its axios instance
  // (`axios.create({ headers: { Authorization: ... } })`), so every AxiosError
  // it throws carries that token on `err.config.headers`. Fastify's default
  // error handler logs `{ req, res, err }` whole and pino's err serializer
  // copies an error's own enumerable properties — `config`, `request`,
  // `response` — onto the line verbatim. Redacting here rather than in an
  // error handler covers every log site in every service, including the sync
  // and refresh workers, whose errors never touch the request lifecycle.
  //
  // Scoped to the sub-fields that carry secrets so the fields worth reading
  // survive: `config.url`, `config.method` and `response.status` still log.
  'err.config.headers',
  'err.config.auth',
  'err.config.params',
  'err.config.data',
  'err.request',
  'err.response.config',
  'err.response.request',
  'err.response.headers',
  // Same error, one level down: axios wraps a retried/underlying failure in
  // `cause`, and pino's serializer walks it.
  'err.cause.config',
  'err.cause.request',
  'err.cause.response',
  // Email addresses are PII (console users carry one since admin_store v7,
  // copied from the identity provider or typed by an admin). No request body
  // is logged, and the admin UI's upstream bodies are covered by
  // `err.config.data` above; these catch a log line that names one directly —
  // `{ email }` or `{ user: { email } }` — in any service.
  'email',
  '*.email',
]

/**
 * True when the request carries an `X-Admin-Secret` matching the deployment's.
 * Compared in constant time and length-guarded (`timingSafeEqual` throws on
 * unequal lengths). No configured secret means no match — never falls open.
 */
function presentsAllowedSecret(
  request: { headers: Record<string, unknown> },
  expected: string | undefined,
): boolean {
  if (!expected) return false
  const provided = request.headers['x-admin-secret']
  if (typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface ServerConfig {
  /** Fastify logger config. Default: true */
  logger?: boolean | { level: string }
  /** CORS origin. Default: false (disabled). Pass origins or true only for browser-facing APIs. */
  corsOrigin?: boolean | string | string[]
  /** Rate limit: max requests per window. Default: 600 */
  rateLimitMax?: number
  /** Rate limit: time window in ms. Default: 60000 */
  rateLimitWindow?: number
  /**
   * Path prefixes excluded from the global IP rate limit. Static assets
   * (CSS, logos, fonts, OpenAPI spec downloads) burn through a per-IP
   * budget very fast — a single `/providers` page load can fan out to
   * 50+ logo requests, and a few page navigations would 429 a real user.
   * Default: `['/design/', '/specs/', '/data/', '/public/', '/health']`
   * — paths matching any prefix are counted as zero against the bucket.
   */
  rateLimitSkipPrefixes?: string[]
  /** Content Security Policy overrides for helmet. Pass false to disable CSP entirely. */
  contentSecurityPolicy?: Record<string, unknown> | false
  /** Max request body size in bytes. Default: 1 MB */
  bodyLimit?: number
  /**
   * Honour `X-Forwarded-Proto` / `X-Forwarded-Host` when behind a reverse
   * proxy that terminates TLS (Caddy, Traefik, nginx, etc.). Required for
   * `request.protocol` / `request.hostname` to reflect the public URL the
   * customer actually used. Default: false. Accepts a trusted IP/CIDR list
   * too — see Fastify's `trustProxy`. No hop count: Fastify 5.12.1 removed the
   * numeric form (GHSA-3m5p-2c4r-xxw2) and fails closed on one at runtime.
   */
  trustProxy?: boolean | string
  /**
   * The deployment's ADMIN_SECRET. When set, requests presenting a matching
   * `X-Admin-Secret` skip the per-IP rate-limit bucket.
   *
   * The limiter keys on `req.ip`, and sibling services (admin-api → this
   * service) all arrive from one container IP without an X-Forwarded-For, so
   * every operator's every page view shares a single bucket — the stack
   * throttles its own admin UI long before any outside caller is affected.
   * Traffic holding the deployment secret is the operator's own control
   * plane, already authenticated by `adminGuard`; the per-IP limit exists for
   * anonymous abuse, which stays limited. Unset means no
   * exemption, so the guard cannot fall open on a missing value.
   */
  rateLimitAllowSecret?: string

  /**
   * Optional ioredis-compatible client. When supplied, the global per-IP
   * rate-limit bucket lives in Redis instead of process memory, so a
   * multi-replica deployment shares one budget per source IP. Without
   * this, each replica counts in isolation and an attacker can multiply
   * their effective budget by the replica count.
   *
   * Caller owns the lifecycle of the client. Pass `undefined` (the
   * default) for single-process / localhost deploys — the in-memory
   * bucket is fine there.
   */
  rateLimitRedis?: RateLimitRedisClient

  /**
   * Hard ceiling on how long a request handler may run before the caller is
   * answered `504 REQUEST_TIMEOUT`. Off when unset.
   *
   * This is NOT Fastify's `requestTimeout`, which bounds the time spent
   * RECEIVING a request from the client and does nothing about a handler
   * awaiting a socket that never answers. That distinction is the whole
   * reason this exists: a hung upstream presented as a silent multi-minute
   * void with no status, no error and no log line, twice, at two different
   * endpoints. Diagnosing each one individually does not stop the third.
   *
   * A bounded failure is required regardless of cause. The timeout does not
   * cancel the in-flight work — Node cannot — it stops the CALLER waiting on
   * it, and logs the fact so the stall is visible rather than invisible.
   */
  handlerTimeoutMs?: number
}

/**
 * Minimal subset of the ioredis interface `@fastify/rate-limit` calls.
 * Declared here so this package stays dep-free of ioredis; apps that
 * want Redis-backed limits bring their own client.
 */
export interface RateLimitRedisClient {
  defineCommand?(...args: unknown[]): void
  call?(...args: unknown[]): Promise<unknown>
  eval?(...args: unknown[]): Promise<unknown>
  evalsha?(...args: unknown[]): Promise<unknown>
  pttl?(...args: unknown[]): Promise<unknown>
}

/**
 * Creates a Fastify instance with security headers, CORS, and rate limiting pre-configured.
 *
 * Usage:
 *   const fastify = await createBaseServer({ rateLimitMax: 200 })
 *   // register your routes...
 *   await fastify.listen({ port: 3010 })
 */
export async function createBaseServer(config?: ServerConfig): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: buildLoggerConfig(config?.logger),
    bodyLimit: config?.bodyLimit ?? 1_048_576, // 1 MB default
    trustProxy: config?.trustProxy ?? false,
    // Honour inbound X-Request-Id when present so clients/proxies can stitch
    // their own traces; otherwise fall back to the Fastify-generated id.
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  })

  // Handler timeout budget. Registered before everything else so it also
  // covers time spent inside other plugins' hooks.
  const handlerTimeoutMs = config?.handlerTimeoutMs
  if (typeof handlerTimeoutMs === 'number' && handlerTimeoutMs > 0) {
    const answered = new WeakSet<object>()

    fastify.addHook('onRequest', async (request, reply) => {
      const timer = setTimeout(() => {
        if (answered.has(request)) return
        answered.add(request)
        // WARN, not ERROR: a stalled upstream is an operational fact about
        // someone else's service. The point is that it appears at all — this
        // log line is the diagnostic that a silent hang never produced.
        request.log.warn(
          { url: request.url, method: request.method, timeout_ms: handlerTimeoutMs },
          'handler exceeded the timeout budget; answering 504',
        )
        void reply.status(504).send({
          error: {
            code: 'REQUEST_TIMEOUT',
            message:
              `This request timed out after ${handlerTimeoutMs}ms. The upstream platform ` +
              'did not answer in time; this is not a problem with your request. Retry, ' +
              'or narrow the query with a smaller `limit`.',
            timeoutMs: handlerTimeoutMs,
          },
        })
      }, handlerTimeoutMs)
      // Never hold the event loop open for a timer whose request is done.
      timer.unref?.()

      // Both paths clear it: `onSend` for a normal reply, `onResponse` as the
      // backstop for anything that bypasses onSend.
      ;(request as unknown as Record<string, unknown>)['__handlerTimer'] = timer
    })

    const clear = (request: unknown): void => {
      const r = request as Record<string, unknown>
      const t = r['__handlerTimer'] as NodeJS.Timeout | undefined
      if (t) {
        clearTimeout(t)
        r['__handlerTimer'] = undefined
      }
    }

    // Marks the request answered so a timer firing in the same tick as a
    // completing handler cannot send a second reply — that race is what turns
    // a timeout into an ERR_HTTP_HEADERS_SENT 500.
    fastify.addHook('onSend', async (request, _reply, payload) => {
      answered.add(request)
      clear(request)
      return payload
    })
    fastify.addHook('onResponse', async (request) => clear(request))
  }

  // Echo the request id back on every response so callers can quote it in
  // bug reports and correlate it against server-side logs (each log line
  // includes `requestId`).
  fastify.addHook('onSend', async (request, reply) => {
    if (!reply.getHeader('x-request-id')) {
      reply.header('x-request-id', request.id)
    }
  })

  // Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
  await fastify.register(helmet, {
    contentSecurityPolicy: config?.contentSecurityPolicy ?? false,
  })

  // CORS. Three things are deliberate here, each found by probing the running
  // server rather than by reading the library docs:
  //
  //   * `methods` is set explicitly. @fastify/cors defaults to GET,HEAD,POST,
  //     and a browser refuses to send PATCH/PUT/DELETE unless the preflight
  //     response names them — so with the default, every update and delete
  //     from a cross-origin API console fails as a CORS error even though the
  //     server answered the preflight 204.
  //   * `/admin/*` is excluded. Those routes are the operator's own
  //     server-to-server surface, gated by X-Admin-Secret; nothing in a
  //     browser is supposed to call them. Leaving them inside the boundary
  //     would let script on an allowed origin read admin JSON — including in
  //     local dev, where adminGuard falls through open when ADMIN_SECRET is
  //     unset and NODE_ENV is not production.
  //   * `credentials` stays off. The API authenticates with a Bearer key, so
  //     no cookie should ever ride along on a cross-origin request.
  const corsOrigin = config?.corsOrigin ?? false
  await fastify.register(cors, {
    delegator: (req, cb) => {
      if (req.url?.startsWith('/admin/')) {
        cb(null, { origin: false })
        return
      }
      cb(null, {
        origin: corsOrigin,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      })
    },
  })

  const skipPrefixes = config?.rateLimitSkipPrefixes ?? [
    '/design/',
    '/specs/',
    '/data/',
    '/public/',
    '/health',
  ]
  await fastify.register(rateLimit, {
    max: config?.rateLimitMax ?? 600,
    timeWindow: config?.rateLimitWindow ?? 60_000,
    // Static assets (CSS, logos, OpenAPI spec downloads, etc.) shouldn't
    // count against the per-IP budget — one page load can fire 50+ asset
    // requests on a logo grid. The page renders themselves still count.
    allowList: (request) => {
      const url = request.url.split('?')[0]
      if (skipPrefixes.some((p) => url.startsWith(p))) return true
      return presentsAllowedSecret(request, config?.rateLimitAllowSecret)
    },
    // Multi-replica deployments need a shared bucket; single-process /
    // localhost deploys stay on the default in-memory bucket.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(config?.rateLimitRedis ? { redis: config.rateLimitRedis as any } : {}),
  })

  return fastify
}

/**
 * Build the Fastify logger config, always layering in `redact` so
 * sensitive headers never reach stdout. `false` disables logging
 * entirely (test mode); `true` enables default-level logging with
 * redaction; a config object merges with the redaction defaults.
 */
export function buildLoggerConfig(
  input: ServerConfig['logger'],
): boolean | { level?: string; redact: { paths: string[]; censor: string } } {
  if (input === false) return false
  const redact = { paths: LOG_REDACT_PATHS, censor: '[Redacted]' }
  if (input === undefined || input === true) return { redact }
  return { ...input, redact }
}
