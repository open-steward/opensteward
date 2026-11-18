/**
 * Admin-API call failures must not drag credentials into the log.
 *
 * A failed `PUT /api/verticals/accounting/platforms/fortnox/config` rejected
 * with a raw AxiosError, and Fastify's error serializer logs an error's own
 * enumerable properties. AxiosError carries `config.data` — the request body
 * it just sent — so a 400 from the credentials form wrote the operator's
 * plaintext `clientSecret` and the session's `Authorization: Bearer` JWT into
 * `docker logs`, where any log shipper picks them up.
 *
 * `scrubUpstreamError` keeps the parts handlers rely on (`response.status`,
 * `requestId`) and drops the parts that carry secrets.
 */
import { describe, it, expect } from 'vitest'
import { scrubUpstreamError } from '../../../src/core/proxy/scrub-upstream-error.js'

/** Shaped like the AxiosError that leaked, trimmed to the relevant fields. */
function axiosErrorWithSecret(): Record<string, unknown> {
  return {
    name: 'AxiosError',
    message: 'Request failed with status code 400',
    code: 'ERR_BAD_REQUEST',
    isAxiosError: true,
    config: {
      method: 'put',
      url: '/api/verticals/accounting/platforms/fortnox/config',
      data: '{"config":{"clientId":"LMTc1IGwN7Hz","clientSecret":"Ipnl669wb7bX"}}',
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' },
    },
    request: { _header: 'PUT /api/... \r\nAuthorization: Bearer eyJhbGciOi...' },
    response: {
      status: 400,
      data: { error: 'config.authType: Invalid discriminator value', requestId: 'req-8w2' },
      config: { data: '{"config":{"clientSecret":"Ipnl669wb7bX"}}' },
      request: { _header: 'Authorization: Bearer eyJhbGciOi...' },
    },
  }
}

describe('scrubUpstreamError', () => {
  it('leaves no trace of the request body or bearer token', () => {
    const scrubbed = scrubUpstreamError(axiosErrorWithSecret())
    const serialized = JSON.stringify(scrubbed)
    expect(serialized).not.toContain('Ipnl669wb7bX')
    expect(serialized).not.toContain('eyJhbGciOi')
  })

  it('keeps response.status so 404-sniffing callers still work', () => {
    const scrubbed = scrubUpstreamError(axiosErrorWithSecret()) as {
      response?: { status?: number }
    }
    expect(scrubbed.response?.status).toBe(400)
  })

  it('promotes the upstream reason to the error message', () => {
    const scrubbed = scrubUpstreamError(axiosErrorWithSecret()) as { message?: string }
    // 'Request failed with status code 400' tells an operator nothing.
    expect(scrubbed.message).toBe('config.authType: Invalid discriminator value')
  })

  it('keeps the correlation id for the error page', () => {
    const scrubbed = scrubUpstreamError(axiosErrorWithSecret()) as { requestId?: string }
    expect(scrubbed.requestId).toBe('req-8w2')
  })

  it('passes through an error that carries no axios internals', () => {
    const err = { name: 'Error', message: 'socket hang up' }
    expect(scrubUpstreamError(err)).toEqual({ name: 'Error', message: 'socket hang up' })
  })
})
