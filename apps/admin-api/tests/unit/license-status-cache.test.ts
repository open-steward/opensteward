/**
 * admin-api's cache of integration-server's license verdict: lazy, 60 s TTL,
 * 15 s back-off after an outage, never backing off a 401/403 (configuration,
 * not an outage), last good answer served stale, transitions logged without the
 * request (its headers carry X-Admin-Secret).
 */
import { describe, it, expect } from 'vitest'
import {
  LicenseStatusCache,
  describeFetchFailure,
  unavailableReason,
} from '../../src/core/license/status-cache'
import { LicenseStatusUpstream } from '../../src/core/routes/_openapi'
import { licenseStatusFixture } from '../journeys/license-fixtures'

const SECRET = 'never-log-this-admin-secret'
function upstreamError(status: number, code?: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    config: { headers: { 'X-Admin-Secret': SECRET } },
    response: { status, data: code ? { error: { code, message: 'x' } } : {} },
  })
}

function harness() {
  let now = 1_000_000
  let calls = 0
  let next: Error | null = null
  const warn: unknown[] = []
  const info: unknown[] = []
  const cache = new LicenseStatusCache(
    async () => {
      calls++
      if (next) throw next
      return licenseStatusFixture({ daysRemaining: calls })
    },
    {
      ttlMs: 60_000,
      retryAfterMs: 15_000,
      now: () => now,
      log: {
        warn: (o: object, m: string) => warn.push([o, m]),
        info: (o: object, m: string) => info.push([o, m]),
      },
    },
  )
  return {
    cache,
    tick: (ms: number) => {
      now += ms
    },
    calls: () => calls,
    fail: (e: Error | null) => {
      next = e
    },
    warn,
    info,
  }
}

describe('LicenseStatusCache', () => {
  it('serves one upstream read for the whole TTL', async () => {
    const h = harness()
    await h.cache.get()
    h.tick(59_999)
    const { snapshot } = await h.cache.get()
    expect(snapshot).toMatchObject({ stale: false, status: { daysRemaining: 1 } })
    expect(h.calls()).toBe(1)
  })

  it('reads again once the TTL is over', async () => {
    const h = harness()
    await h.cache.get()
    h.tick(60_000)
    expect((await h.cache.get()).snapshot?.status.daysRemaining).toBe(2)
  })

  it('no snapshot before any answer, and the failure says why [L7:N04]', async () => {
    const h = harness()
    h.fail(upstreamError(502))
    expect(await h.cache.get()).toEqual({
      snapshot: null,
      failure: { status: 502, message: 'Request failed with status code 502' },
    })
  })

  it('serves the last good answer, stale, when a refresh fails [L7:N04]', async () => {
    const h = harness()
    await h.cache.get()
    h.fail(upstreamError(502))
    h.tick(60_000)
    const lookup = await h.cache.get()
    expect(lookup.snapshot).toMatchObject({
      stale: true,
      fetchedAt: 1_000_000,
      status: { daysRemaining: 1 },
    })
    expect(lookup.failure?.status).toBe(502)
  })

  it('backs off for 15 s after an outage', async () => {
    const h = harness()
    await h.cache.get()
    h.fail(new Error('connect ECONNREFUSED 127.0.0.1:3010'))
    h.tick(60_000)
    await h.cache.get()
    await h.cache.get()
    h.tick(14_999)
    await h.cache.get()
    expect(h.calls()).toBe(2)
    h.tick(1)
    await h.cache.get()
    expect(h.calls()).toBe(3)
  })

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'ADMIN_DISABLED'],
  ])(
    'never backs off a %i: that is configuration, asked again on the next request',
    async (status, code) => {
      const h = harness()
      h.fail(upstreamError(status, code))
      expect((await h.cache.get()).failure).toMatchObject({ status, code })
      await h.cache.get()
      expect(h.calls()).toBe(2)
    },
  )

  it('one upstream read for concurrent callers', async () => {
    const h = harness()
    await Promise.all([h.cache.get(), h.cache.get(), h.cache.get()])
    expect(h.calls()).toBe(1)
  })

  it('an upstream body that does not parse is UNEXPECTED_RESPONSE, and the last good answer is served stale', async () => {
    const h = harness()
    await h.cache.get()
    let zodError: Error | undefined
    try {
      LicenseStatusUpstream.parse({ state: 'VALID' })
    } catch (e) {
      zodError = e as Error
    }
    expect(zodError).toBeDefined()
    h.fail(zodError!)
    h.tick(60_000)
    const lookup = await h.cache.get()
    expect(lookup.failure).toEqual({
      code: 'UNEXPECTED_RESPONSE',
      message:
        'integration-server answered GET /admin/license with a body this admin-api does not understand',
    })
    expect(lookup.snapshot).toMatchObject({ stale: true, status: { daysRemaining: 1 } })
    expect(unavailableReason(lookup.failure)).toContain('Run the same OpenSteward release on both')
  })

  it('recovery clears stale and the failure', async () => {
    const h = harness()
    await h.cache.get()
    h.fail(upstreamError(502))
    h.tick(60_000)
    await h.cache.get()
    h.fail(null)
    h.tick(15_000)
    const lookup = await h.cache.get()
    expect(lookup.snapshot?.stale).toBe(false)
    expect(lookup).not.toHaveProperty('failure')
  })

  it('logs transitions only, and never the request (its headers carry X-Admin-Secret)', async () => {
    const h = harness()
    await h.cache.get()
    h.fail(upstreamError(500))
    for (let i = 0; i < 3; i++) {
      h.tick(60_000)
      await h.cache.get()
    }
    expect(h.warn).toHaveLength(1)
    expect(JSON.stringify(h.warn)).not.toContain(SECRET)
    expect((h.warn[0] as [object, string])[1]).toMatch(/; serving the last known status$/)
    h.fail(null)
    h.tick(60_000)
    await h.cache.get()
    expect(h.info).toHaveLength(1)
  })

  it('a failure before any answer never claims to serve a last known status', async () => {
    // The common first boot: Helm's includeAdminSecret: false, so nothing has ever been read.
    const h = harness()
    h.fail(upstreamError(403, 'ADMIN_DISABLED'))
    await h.cache.get()
    expect(h.warn).toHaveLength(1)
    const msg = (h.warn[0] as [object, string])[1]
    expect(msg).toContain('has no ADMIN_SECRET')
    expect(msg).not.toContain('serving the last known status')
    expect(msg).toContain('no license status to serve yet')
  })
})

describe('describeFetchFailure / unavailableReason', () => {
  it('reads the status and code of an upstream refusal', () => {
    expect(describeFetchFailure(upstreamError(403, 'FORBIDDEN'))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Request failed with status code 403',
    })
  })

  it('names ADMIN_SECRET for ADMIN_DISABLED and for FORBIDDEN', () => {
    expect(unavailableReason({ status: 403, code: 'ADMIN_DISABLED', message: 'x' })).toContain(
      'has no ADMIN_SECRET',
    )
    expect(unavailableReason({ status: 403, code: 'FORBIDDEN', message: 'x' })).toContain(
      'same ADMIN_SECRET',
    )
  })

  it('says integration-server has not answered when it has not', () => {
    expect(unavailableReason({ message: 'connect ECONNREFUSED 127.0.0.1:3010' })).toContain(
      'has not answered',
    )
    expect(unavailableReason(undefined)).toContain('has not answered')
  })
})
