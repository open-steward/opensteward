/**
 * Turning a refresh failure into something an operator can act on.
 *
 * `refreshWithRotationGuard` catches the error, maps it to a status, persists
 * the status, and drops the error. So when a connection sits at
 * `lastRefreshStatus: 'failed'` the only trace is a log line reading
 * "transient error refreshing <uuid> (retry next tick)" — which does not say
 * whether the platform is down, the network is out, or the classifier simply
 * did not recognise a real OAuth rejection. A deployment can retry and fail for
 * hours with nobody able to tell which.
 *
 * The reason is stored on the connection row and shown in the admin UI, so it
 * has the same rule as anything else that leaves the process: it carries the
 * OAuth `error` / `error_description` and the HTTP status, and nothing else.
 * Quoting a whole response body here would put credentials in the database —
 * the same class of leak as credentials in logs (see
 * server/error-log-redaction.test.ts), one layer down.
 */
import { describe, it, expect } from 'vitest'
import { describeRefreshError } from '../../src/auth/refresh-error'

describe('describeRefreshError', () => {
  it('reports the OAuth code and description a token endpoint returned', () => {
    const err = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: { error: 'invalid_grant', error_description: 'Refresh token has expired' },
      },
    })
    const reason = describeRefreshError(err)
    expect(reason).toContain('invalid_grant')
    expect(reason).toContain('Refresh token has expired')
    expect(reason).toContain('400')
  })

  it('reports the status alone when the body carries no OAuth fields', () => {
    const err = Object.assign(new Error('Request failed with status code 503'), {
      response: { status: 503, data: '<html>Service Unavailable</html>' },
    })
    expect(describeRefreshError(err)).toContain('503')
  })

  it('reports a network failure, which has no response at all', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT 104.16.7.34:443'), {
      code: 'ETIMEDOUT',
    })
    const reason = describeRefreshError(err)
    expect(reason).toMatch(/ETIMEDOUT/)
  })

  it('never includes the response body', () => {
    const err = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          error: 'invalid_grant',
          error_description: 'expired',
          access_token: 'SECRET-TOKEN-DO-NOT-STORE',
          refresh_token: 'SECRET-REFRESH-DO-NOT-STORE',
        },
      },
    })
    const reason = describeRefreshError(err)
    expect(reason).not.toContain('DO-NOT-STORE')
  })

  it('never includes request headers or the axios config', () => {
    const err = Object.assign(new Error('Request failed with status code 401'), {
      config: {
        headers: { Authorization: 'Basic SECRET-CLIENT-CREDS' },
        data: 'grant_type=refresh_token&refresh_token=SECRET-REFRESH',
      },
      response: { status: 401, data: { error: 'invalid_client' } },
    })
    const reason = describeRefreshError(err)
    expect(reason).not.toContain('SECRET')
  })

  it('caps the length, so a chatty provider cannot bloat the row', () => {
    const err = Object.assign(new Error('boom'), {
      response: {
        status: 400,
        data: { error: 'invalid_grant', error_description: 'x'.repeat(5000) },
      },
    })
    expect(describeRefreshError(err).length).toBeLessThanOrEqual(300)
  })

  it('degrades to something rather than nothing for an unrecognised shape', () => {
    expect(describeRefreshError({ weird: true })).toBeTruthy()
    expect(describeRefreshError(null)).toBeTruthy()
    expect(describeRefreshError(undefined)).toBeTruthy()
  })

  it('reads a cause-wrapped error, which some adapters throw', () => {
    const inner = Object.assign(new Error('inner'), {
      response: { status: 400, data: { error: 'invalid_client' } },
    })
    const outer = new Error('refresh failed', { cause: inner })
    expect(describeRefreshError(outer)).toContain('invalid_client')
  })
})
