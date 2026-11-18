/**
 * The error-mapping layer `/v1/*` never had.
 *
 * Before this, the only `setErrorHandler` in the service was scoped to the
 * sandbox mount. Anything a resource router did not catch reached Fastify's
 * default handler, which replies with `err.statusCode || err.status` — and
 * axios sets `.status` from the UPSTREAM response. The platform's answer
 * therefore became OpenSteward's answer, with two opposite failure shapes seen
 * in a single MCP sweep:
 *
 *   - `list_purchase_orders` → **400**, because Fortnox rejected the request.
 *     A 4xx tells the caller IT sent something wrong, so an integrator goes
 *     hunting for a bug in their own perfectly correct code.
 *   - `get_organization` → **500**, because that error carried no status at
 *     all and the default handler fell back.
 *
 * Both are the same missing layer. The taxonomy applied here:
 *
 * | Cause                                        | Status | Code                  |
 * |----------------------------------------------|--------|-----------------------|
 * | Platform answered with an error              | 502    | `UPSTREAM_ERROR`      |
 * | Platform could not be reached                | 502    | `UPSTREAM_UNREACHABLE`|
 * | Caller's request was malformed               | 400    | (Fastify validation)  |
 * | Deliberate status from our own code          | as set | as set                |
 * | Anything else                                | 500    | `INTERNAL`            |
 *
 * `501` never comes from the platform: this layer maps no upstream answer to
 * it. It comes only from our own code, meaning "this platform cannot do this",
 * and reaches the caller through the "deliberate status" row:
 *
 *   - the routers' own "in-vertical, but unmapped for this platform" guard,
 *     when the adapter has no such method. That guard replies itself, with the
 *     older body `{ error: "<method> not implemented by this adapter", code? }`
 *     (a string, not the `{ error: { code, message } }` object below);
 *   - an adapter method that exists but refuses before sending anything,
 *     `statusCode: 501, code: 'NOT_SUPPORTED'` (see `maxPageSize` in
 *     AdapterCapabilities), answered here as `{ error: { code: 'NOT_SUPPORTED', message } }`.
 *
 * Either way a client can tell it from a cross-vertical call
 * (`VERTICAL_MISMATCH`, refused in `attachDataStoreContext`) and from an
 * upstream fault (502).
 *
 * Upstream detail is surfaced rather than swallowed — an operator debugging a
 * customer's failing sync should not need server-log access to see that the
 * platform said "invalid date range". It is truncated and redacted first: the
 * body is the platform's, but the response is ours.
 */
import type { FastifyInstance } from 'fastify'

/** Largest upstream excerpt relayed to the caller. Enough to carry a real
 *  message, short enough that a verbose HTML error page cannot dominate. */
const MAX_EXCERPT = 500

/**
 * Anything that looks like a credential, whatever the platform chose to call
 * it. Upstream error bodies occasionally echo the request — including its
 * Authorization header — and relaying that would turn a diagnostic aid into a
 * token leak in the caller's logs.
 */
const SECRETISH =
  /("?(?:authorization|token|access[_-]?token|api[_-]?key|secret|password|refresh[_-]?token)"?\s*[:=]\s*)("?)([^",}\s]+)\2/gi

/** A bare `Bearer <token>` with no key name around it. */
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi

export function redactUpstreamBody(data: unknown): string {
  let text: string
  if (typeof data === 'string') text = data
  else {
    try {
      text = JSON.stringify(data)
    } catch {
      text = String(data)
    }
  }
  if (!text) return ''
  text = text.replace(SECRETISH, '$1$2[redacted]$2').replace(BEARER, '[redacted]')
  return text.length > MAX_EXCERPT ? `${text.slice(0, MAX_EXCERPT)}…` : text
}

interface Axiosish {
  isAxiosError?: boolean
  config?: unknown
  response?: { status?: number; data?: unknown }
  statusCode?: number
  status?: number
  validation?: unknown
  code?: string
  message?: string
}

/**
 * True when the throw came from an adapter's HTTP client rather than from our
 * own code. Checked structurally so this module needs no axios dependency, and
 * so a client built on something else can opt in by matching the same shape.
 */
function isUpstream(err: Axiosish): boolean {
  return err.isAxiosError === true || (err.response !== undefined && err.config !== undefined)
}

/**
 * Did the upstream call run out of time rather than fail outright?
 *
 * `ECONNABORTED` is what axios raises when its own `timeout` elapses;
 * `ETIMEDOUT` is the OS-level socket timeout. Both mean "connected, then
 * silence", which is a different fact from `ECONNREFUSED`/`ENOTFOUND`.
 */
function isTimeout(err: Axiosish): boolean {
  const code = (err as { code?: unknown }).code
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT'
}

export function attachAdapterErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (rawErr, request, reply) => {
    const err = rawErr as unknown as Axiosish

    if (isUpstream(err)) {
      const upstreamStatus = err.response?.status
      // Logged at warn, not error: the platform failing is an operational
      // fact about someone else's service, not a fault in this one.
      request.log.warn({ err, upstreamStatus }, 'upstream platform request failed')

      // A timeout is not the same operational fact as unreachable, and the
      // difference decides what the caller should do next. UNREACHABLE means
      // the platform is down and retrying now is pointless. TIMEOUT means it
      // accepted the connection and went quiet — the signature of rate
      // limiting, a slow report query, or an endpoint returning far more data
      // than was asked for. Those want opposite responses (back off vs narrow
      // the query), so they get different codes and different statuses.
      //
      // 504 rather than 502 so proxies and clients can apply their own
      // gateway-timeout handling without parsing the body.
      if (upstreamStatus === undefined && isTimeout(err)) {
        return reply.status(504).send({
          error: {
            code: 'UPSTREAM_TIMEOUT',
            message:
              'The upstream platform did not answer within the timeout budget. This is ' +
              'not a problem with your request. Retry, or narrow the query with a ' +
              'smaller `limit`.',
          },
        })
      }

      if (upstreamStatus === undefined) {
        return reply.status(502).send({
          error: {
            code: 'UPSTREAM_UNREACHABLE',
            message:
              'The upstream platform could not be reached. This is a connectivity or ' +
              'availability problem with the platform, not with your request.',
          },
        })
      }

      return reply.status(502).send({
        error: {
          code: 'UPSTREAM_ERROR',
          message:
            `The upstream platform returned ${upstreamStatus}. This is the platform's ` +
            `response to our request, not a problem with yours.`,
          upstreamStatus,
          upstreamBody: redactUpstreamBody(err.response?.data),
        },
      })
    }

    // Fastify's own schema validation — genuinely the caller's request.
    if (err.validation) {
      return reply
        .status(400)
        .send({ error: { code: 'VALIDATION', message: err.message ?? 'Invalid request.' } })
    }

    // A status our own code set deliberately (404 from a not-found guard, 501
    // from an adapter that refuses what its platform cannot do) is already the
    // right answer.
    const deliberate = err.statusCode
    if (typeof deliberate === 'number' && deliberate >= 400 && deliberate < 600) {
      return reply
        .status(deliberate)
        .send({ error: { code: err.code ?? 'ERROR', message: err.message ?? 'Request failed.' } })
    }

    // Anything left is a bug in this service. Log it in full; tell the caller
    // nothing, since the message may name internals.
    request.log.error({ err }, 'unhandled error on a vertical route')
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Internal Server Error' } })
  })
}
