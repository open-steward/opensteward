/**
 * Shared validator / serializer / error-handler wiring for the admin-api
 * Fastify instance. Used by both the production server bootstrap
 * (`core/server.ts`) and the unit tests so they exercise the same
 * runtime path.
 *
 * Pure plumbing — every Zod schema attached to a route's `schema:`
 * option is validated through `fastify-zod-openapi`, and Zod validation
 * failures get normalised back into the legacy admin-api error envelope
 * (`{ error: '<path>: <message>' }`) so existing consumers + tests don't
 * have to learn a second shape.
 */
import type { FastifyInstance } from 'fastify'
import { fastifyZodOpenApiPlugin, serializerCompiler, validatorCompiler } from 'fastify-zod-openapi'

/**
 * Register the validator compiler, the serializer compiler, the
 * `fastify-zod-openapi` plugin, and the legacy-shape error handler on
 * an existing Fastify instance.
 *
 * Safe to call before any routes are registered.
 */
export async function registerOpenApiBridge(fastify: FastifyInstance): Promise<void> {
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)
  await fastify.register(fastifyZodOpenApiPlugin)

  // Translate Zod / Fastify validation failures into the existing
  // `{ error: '<path>: <message>' }` envelope. Tests assert on this
  // shape (e.g. routes.test.ts expects `.error` to contain "website"
  // when a malformed URL is POSTed), so a stricter "Bad Request" wrap
  // would break them. Non-validation errors keep their `{ error }`
  // shape with the original status code.
  // Note: `type` + `requestId` are added to EVERY error body (including the
  // many handlers that `reply.send({ error })` directly and bypass this
  // handler) by the `enrichErrorBody` preSerialization hook in `core/server.ts`.
  // This handler only normalises the body shape.
  fastify.setErrorHandler((err, _request, reply) => {
    const validation = (err as { validation?: Array<{ instancePath?: string; message?: string }> })
      .validation
    const statusCode = (err as { statusCode?: number }).statusCode
    if (validation && Array.isArray(validation) && validation.length > 0) {
      const first = validation[0]!
      const rawPath = (first.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.')
      const path = rawPath || 'body'
      const message = first.message ?? 'validation failed'
      return reply.status(statusCode ?? 400).send({
        error: `${path}: ${message}`,
        issues: validation,
      })
    }
    // An upstream failure keeps its own status. admin-api proxies most of its
    // surface to integration-server with axios, and an AxiosError carries the
    // upstream status on `status` / `response.status` — never on `statusCode`.
    // Reading only `statusCode` reported every proxied failure as a 500: a
    // rate-limit 429 reached the admin UI as `500 "Request failed with status
    // code 429"`, so callers could not tell a throttle from a server fault and
    // had no Retry-After to back off with.
    const upstream = err as {
      response?: { status?: number; headers?: Record<string, unknown>; data?: unknown }
      status?: number
    }
    const upstreamStatus = upstream.response?.status ?? upstream.status
    // An upstream call that never got a response — DNS, refused connection,
    // socket hang up — is a gateway failure. Reporting 500 blames this service
    // for something one hop away.
    const isUpstreamCall = (err as { isAxiosError?: boolean }).isAxiosError === true
    const unreachableUpstream = isUpstreamCall && upstream.response === undefined
    const code =
      upstreamStatus && upstreamStatus >= 400
        ? upstreamStatus
        : unreachableUpstream
          ? 502
          : statusCode && statusCode >= 400
            ? statusCode
            : 500

    // Hand back the upstream's own explanation when it sent one; `err.message`
    // for a proxied call is only ever the axios "Request failed with status
    // code N" string, which names neither the cause nor the origin.
    const upstreamBody = upstream.response?.data
    const rawUpstreamError =
      upstreamBody && typeof upstreamBody === 'object' && 'error' in upstreamBody
        ? (upstreamBody as { error?: unknown }).error
        : undefined
    // Two envelope shapes reach us. admin-api's own routes send
    // `{ error: '<string>' }`; integration-server sends
    // `{ error: { code, message } }`. Reading only the string form meant every
    // integration-server refusal — SYNC_IN_PROGRESS, CONNECTION_NOT_FOUND —
    // arrived as "Request failed with status code 409", which tells the
    // operator the status they can already see and nothing about the cause.
    const upstreamMessage =
      typeof rawUpstreamError === 'string'
        ? rawUpstreamError
        : rawUpstreamError && typeof rawUpstreamError === 'object'
          ? ((rawUpstreamError as { message?: unknown }).message as string | undefined)
          : undefined
    // A 404 from a route that does not exist upstream carries Fastify's own
    // `{ message }` rather than an `error` envelope.
    const routeMessage =
      !upstreamMessage && upstreamBody && typeof upstreamBody === 'object'
        ? ((upstreamBody as { message?: unknown }).message as string | undefined)
        : undefined
    const message =
      typeof upstreamMessage === 'string' && upstreamMessage.length > 0
        ? upstreamMessage
        : typeof routeMessage === 'string' && routeMessage.length > 0
          ? routeMessage
          : err instanceof Error
            ? err.message
            : String(err)

    // Retry-After is the actionable half of a 429/503; dropping it turns a
    // "wait 10 seconds" into an opaque failure.
    const retryAfter = upstream.response?.headers?.['retry-after']
    if (typeof retryAfter === 'string' || typeof retryAfter === 'number') {
      reply.header('retry-after', String(retryAfter))
    }

    return reply.status(code).send({ error: message || 'Internal Server Error' })
  })
}
