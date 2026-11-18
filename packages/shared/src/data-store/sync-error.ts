/**
 * What a failed sync writes into its job record.
 *
 * The worker used `String(err)`, which for an axios rejection yields
 * "AxiosError: Request failed with status code 400". That is not a diagnosis:
 * the upstream status is present only incidentally, and the platform's own
 * explanation — the part that says WHY — is discarded before it reaches the
 * job, the admin UI, or the API.
 *
 * A real job made the cost concrete. `purchaseorders` failed with that exact
 * string, while Fortnox had actually replied
 * `{"message":"No such route.(method: GET, path: 3/purchaseorders)"}`. The
 * whole answer was thrown away, and recovering it took a hand-rolled request
 * against the REST surface with the deployment's admin secret.
 *
 * Shares `redactUpstreamBody` with the HTTP error handler rather than
 * re-implementing it: a job's progress is rendered in the admin UI and returned
 * by the API, and upstream bodies sometimes echo the request's Authorization
 * header.
 */
import { redactUpstreamBody } from '../control-plane/adapter-error-handler'

interface Axiosish {
  isAxiosError?: boolean
  config?: unknown
  response?: { status?: number; data?: unknown }
  message?: string
}

/** Same structural test the HTTP handler uses — no axios dependency needed. */
function isUpstream(err: Axiosish): boolean {
  return err.isAxiosError === true || (err.response !== undefined && err.config !== undefined)
}

export function describeSyncError(err: unknown): string {
  const e = err as Axiosish
  if (e && typeof e === 'object' && isUpstream(e)) {
    const status = e.response?.status
    if (status === undefined) {
      return `Upstream platform unreachable: ${e.message ?? 'no response'}`
    }
    const body = redactUpstreamBody(e.response?.data)
    return body
      ? `Upstream platform returned ${status}: ${body}`
      : `Upstream platform returned ${status}.`
  }
  return String(err)
}

/**
 * An adapter's refusal of a list its platform cannot serve, thrown BEFORE any
 * request: `statusCode: 501, code: 'NOT_SUPPORTED'` (see `maxPageSize` in
 * AdapterCapabilities). Not an upstream fault, so it neither charges the
 * circuit breaker nor fails the sync; the resource is skipped. The code is the
 * mark: a bare 501 is an ordinary failure.
 */
export function isRefusal(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'NOT_SUPPORTED' &&
    (err as { statusCode?: unknown }).statusCode === 501
  )
}
