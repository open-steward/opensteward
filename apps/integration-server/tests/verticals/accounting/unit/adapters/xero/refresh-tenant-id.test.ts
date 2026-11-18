/**
 * Every Xero connection stopped working about an hour after it was made.
 *
 * `Xero-tenant-id` is sent on every API call — the whole accounting API is
 * scoped by it. `exchangeCode` resolves it from `/connections` at connect time,
 * but `refreshAccessToken` returned the new tokens and nothing else: it neither
 * re-resolved the tenant nor carried the existing one forward. So the first
 * keep-alive refresh dropped it, and every subsequent call came back
 * `403 AuthenticationUnsuccessful` — with a perfectly valid access token and a
 * refresh the store had recorded as `ok`, which is what made it look like a
 * credential problem rather than a missing header.
 *
 * Observed on a live connection: a sync at 08:18 returned 78 invoices, the
 * refresher ran at 08:35 reporting success, and a sync at 08:38 failed every
 * resource with 403 while `/connections` still showed the grant healthy.
 *
 * Re-resolved rather than merely carried forward, because a tenant is not
 * immutable — an owner can disconnect an org and connect another against the
 * same grant, which leaves a carried-forward id pointing at an org this token
 * can no longer read. Re-resolution is self-healing; carry-forward is the
 * fallback when the connections call itself fails, so a transient outage
 * cannot cost us a refresh.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { refreshAccessToken } from '../../../../../../src/verticals/accounting/adapters/xero/auth'

afterEach(() => vi.restoreAllMocks())

const TOKENS = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expires_in: 1800,
}

function mockToken() {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: TOKENS } as never)
}

describe('refreshAccessToken keeps the connection usable', () => {
  it('re-resolves the tenant id, so the next call carries the header', async () => {
    mockToken()
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: [{ tenantId: 'tenant-live', tenantType: 'ORGANISATION' }],
    } as never)

    const creds = await refreshAccessToken('old-refresh', 'id', 'secret', 'tenant-stale')
    expect(creds.tenantId).toBe('tenant-live')
  })

  it('prefers the live tenant over a stale stored one', async () => {
    // An owner can disconnect one org and connect another against the same
    // grant. Carrying the old id forward would keep 403ing forever.
    mockToken()
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: [{ tenantId: 'tenant-new', tenantType: 'ORGANISATION' }],
    } as never)

    const creds = await refreshAccessToken('old-refresh', 'id', 'secret', 'tenant-old')
    expect(creds.tenantId).not.toBe('tenant-old')
  })

  it('falls back to the known tenant when /connections is unreachable', async () => {
    // A transient outage must not cost us the refresh — losing the tenant is
    // exactly the failure this fixes.
    mockToken()
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('ECONNRESET'))

    const creds = await refreshAccessToken('old-refresh', 'id', 'secret', 'tenant-known')
    expect(creds.tenantId).toBe('tenant-known')
    expect(creds.accessToken).toBe('new-access')
  })

  it('still keeps the rotated refresh token', async () => {
    mockToken()
    vi.spyOn(axios, 'get').mockResolvedValue({ data: [] } as never)
    const creds = await refreshAccessToken('old-refresh', 'id', 'secret', 'ten')
    expect(creds.refreshToken).toBe('new-refresh')
  })

  it('reuses the previous refresh token when Xero omits a new one', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'a', expires_in: 1800 },
    } as never)
    vi.spyOn(axios, 'get').mockResolvedValue({ data: [] } as never)
    const creds = await refreshAccessToken('old-refresh', 'id', 'secret', 'ten')
    expect(creds.refreshToken).toBe('old-refresh')
  })
})
