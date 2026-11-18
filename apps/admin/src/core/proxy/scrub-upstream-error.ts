/**
 * Strip credentials off a failed admin-API call before anything logs it.
 *
 * Fastify's error serializer writes an error's own enumerable properties, and
 * an AxiosError's include `config` — the request it just sent. For the
 * credentials form that request body is the operator's `clientId` +
 * plaintext `clientSecret`, and `config.headers.Authorization` is the
 * session's JWT. A single 400 from `PUT .../platforms/:slug/config` therefore
 * wrote both to `docker logs` in the clear.
 *
 * Handlers downstream only ever read `response.status` (404-sniffing) and
 * `requestId` (shown on the error page), so those survive. Everything that
 * echoes the request goes.
 */

interface UpstreamErrorLike {
  message?: string
  requestId?: string
  config?: unknown
  request?: unknown
  response?: {
    status?: number
    data?: unknown
    headers?: Record<string, string>
    config?: unknown
    request?: unknown
  }
}

export function scrubUpstreamError<T>(err: T): T {
  if (!err || typeof err !== 'object') return err
  const e = err as UpstreamErrorLike

  // The request echo — body, headers, socket state — in three places.
  delete e.config
  delete e.request
  if (e.response && typeof e.response === 'object') {
    delete e.response.config
    delete e.response.request
  }

  // Correlation id, from the body field admin-api enriches every error with
  // or the header it mirrors it into. Lifted here rather than at the call site
  // so normalising an upstream error is one operation, not two that can drift.
  const headers = e.response?.headers
  // 'Request failed with status code 400' names no cause. The upstream body's
  // `error` does, and it is what the platform page already renders to the
  // operator, so surface it as the message too.
  const data = e.response?.data
  if (data && typeof data === 'object') {
    const body = data as { error?: unknown; requestId?: unknown }
    if (typeof body.requestId === 'string') e.requestId = body.requestId
    if (typeof body.error === 'string' && body.error.length > 0) e.message = body.error
  }
  if (!e.requestId && headers?.['x-request-id']) e.requestId = headers['x-request-id']

  return err
}
