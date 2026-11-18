/**
 * WiseAdapter against a fake of Wise's documented HTTP surface.
 *
 * - GET /v1/transfers (https://docs.wise.com/api-reference/legacy/standard-transfer/transferlist):
 *   "Get the list of transfers for a given user's profile (defaults to user's
 *   personal profile)." Query params include profile ("User profile ID. If
 *   parameter is omitted, defaults to user's personal profile"), limit
 *   ("Maximum number of records to be returned in response") and offset
 *   ("Starting record number"); the 200 response "Returns an array of transfer
 *   objects". No maximum limit and no total or cursor are documented.
 * - GET /v2/profiles (https://docs.wise.com/api-reference/legacy/profile/profilelist):
 *   "List of all profiles belonging to user." 200: "Array of profile objects.
 *   Note that there might be more than one business profile returned in the
 *   response." Each profile carries `id` ("Unique identifier for the
 *   profile.") and `type` ("Type of profile.", PERSONAL or BUSINESS).
 * - GET /v1/transfers/{transferId}: "Get transfer info by ID."
 * - POST /oauth/token (https://docs.wise.com/api-reference/oauth-token): BasicAuth,
 *   "Basic Authentication using your Client ID and Client Secret as the
 *   username and password"; authorization-code-grant body grant_type,
 *   client_id, code, redirect_uri; refresh-token-grant body grant_type,
 *   refresh_token.
 *
 * The fake honours only `profile`, `limit` and `offset`, and rejects any other
 * query key. Transfers belong to one profile; an omitted `profile` serves the
 * personal profile's transfers, as Wise documents.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'

const { getMock, postMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  const postMock = vi.fn()
  const createMock = vi.fn((_cfg?: unknown) => ({ get: getMock }))
  return { getMock, postMock, createMock }
})

vi.mock('axios', () => ({
  default: { create: createMock, post: postMock },
}))

import { WiseAdapter } from '../../../../../../src/verticals/payments/adapters/wise'

const adapter = new WiseAdapter({
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'https://app/cb',
})
const CREDS: Credentials = { accessToken: 'user-token', refreshToken: 'rt' }
const DOCUMENTED = new Set(['profile', 'limit', 'offset'])

const PERSONAL = 14575282
const BUSINESS = 14599371
const BUSINESS_2 = 14599372

/**
 * A profile as GET /v2/profiles documents it (trimmed from the example).
 * `currentState` is optional in the schema (only `type` is required), with
 * enum HIDDEN / VISIBLE / DEACTIVATED; the example is "VISIBLE".
 */
function profile(
  type: 'PERSONAL' | 'BUSINESS',
  id: number,
  currentState: 'HIDDEN' | 'VISIBLE' | 'DEACTIVATED' | 'absent' = 'VISIBLE',
): Record<string, unknown> {
  const state = currentState === 'absent' ? {} : { currentState }
  return type === 'PERSONAL'
    ? {
        type,
        id,
        ...state,
        userId: 9889627,
        firstName: 'Sarah',
        lastName: 'Jenkins',
        fullName: 'Sarah Jenkins',
      }
    : {
        type,
        id,
        ...state,
        userId: 9889627,
        businessName: 'Innovate Solutions Ltd',
        fullName: 'Innovate Solutions Ltd',
      }
}

let profiles: Record<string, unknown>[] = []
let profileCalls = 0

function transfer(i: number, profileId = BUSINESS) {
  return {
    id: 16521000 + i,
    profile: profileId,
    user: 4342275,
    targetAccount: 8692237,
    status: 'outgoing_payment_sent',
    created: '2017-11-24 10:47:49',
    details: { reference: `ref ${i}` },
    sourceCurrency: 'EUR',
    sourceValue: 100,
    targetCurrency: 'GBP',
    targetValue: 89,
  }
}

/**
 * Serve `n` transfers of the business profile, plus `personal` transfers of
 * the personal profile, at GET /v1/transfers, and `profiles` at GET /v2/profiles.
 */
function serve(n: number, personal = 0) {
  const all = Array.from({ length: n }, (_, i) => transfer(i + 1))
  const mine = Array.from({ length: personal }, (_, i) => transfer(1000 + i, PERSONAL))
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(
    async (path: string, cfg: { params?: Record<string, unknown> } = {}) => {
      if (path === '/v2/profiles') {
        if (cfg.params && Object.keys(cfg.params).length)
          throw new Error('GET /v2/profiles takes no query')
        profileCalls++
        return { data: profiles }
      }
      const one = /^\/v1\/transfers\/(\d+)$/.exec(path)
      if (one) {
        const found = all.find((t) => String(t.id) === one[1])
        if (!found) throw Object.assign(new Error('404'), { response: { status: 404 } })
        return { data: found }
      }
      if (path !== '/v1/transfers') throw new Error(`unexpected path ${path}`)
      const params = cfg.params ?? {}
      calls.push({ ...params })
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED.has(k)) throw new Error(`undocumented query param ${k}`)
      }
      const limit = Number(params['limit'])
      const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
      const owner = params['profile'] === undefined ? PERSONAL : Number(params['profile'])
      const rows = [...all, ...mine].filter((t) => t.profile === owner)
      return { data: rows.slice(offset, offset + limit) }
    },
  )
  return { calls, all }
}

function pageParams(page: number, limit: number): QueryParams {
  return withPageSink({ page, limit } as QueryParams)
}

let seq = 0
/** A fresh connection each test, so the per-connection profile cache starts empty. */
function creds(): Credentials {
  seq++
  return { accessToken: `user-token-${seq}`, refreshToken: `rt-${seq}` }
}

beforeEach(() => {
  profiles = [profile('PERSONAL', PERSONAL), profile('BUSINESS', BUSINESS)]
  profileCalls = 0
  getMock.mockReset()
  postMock.mockReset()
  createMock.mockClear()
})

describe('WiseAdapter.listPayouts', () => {
  it('calls GET /v1/transfers on api.wise.com with a bearer token', async () => {
    serve(1)
    const c = creds()
    await adapter.listPayouts(c, pageParams(1, 10))
    const cfg = createMock.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://api.wise.com')
    expect(cfg.headers['Authorization']).toBe(`Bearer ${c.accessToken}`)
    expect(getMock.mock.calls.map((call) => call[0])).toEqual(['/v2/profiles', '/v1/transfers'])
  })

  it('sends the caller limit and a 0-based offset of the 1-based page', async () => {
    const { calls } = serve(20)
    const c = creds()
    await adapter.listPayouts(c, pageParams(1, 5))
    await adapter.listPayouts(c, pageParams(3, 5))
    expect(calls).toEqual([
      { profile: BUSINESS, limit: 5, offset: 0 },
      { profile: BUSINESS, limit: 5, offset: 10 },
    ])
  })

  it('walks 2L+1 transfers, serving every id once, hasMore exact', async () => {
    const L = 4
    // Personal transfers exist too; the walk must read the business profile's.
    const { all } = serve(2 * L + 1, 2)
    const c = creds()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = pageParams(page, L)
      const rows = await adapter.listPayouts(c, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(all.map((t) => String(t.id)))
    expect(new Set(seen).size).toBe(seen.length)
    // A full page says nothing about the end; the short third page is the end.
    expect(hasMore).toEqual([undefined, undefined, false])
  })

  it('reports the end on the empty page after an exact multiple', async () => {
    serve(4)
    const c = creds()
    const p2 = pageParams(2, 4)
    expect(await adapter.listPayouts(c, pageParams(1, 4))).toHaveLength(4)
    expect(await adapter.listPayouts(c, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('throws on a response that is not the documented array', async () => {
    getMock.mockImplementation(async (path: string) =>
      path === '/v2/profiles' ? { data: profiles } : { data: { data: [] } },
    )
    await expect(adapter.listPayouts(creds(), pageParams(1, 5))).rejects.toThrow(/array/)
  })
})

describe('WiseAdapter.listPayouts profile resolution', () => {
  it('reads the one business profile, not the personal default', async () => {
    const { calls, all } = serve(3, 5)
    const rows = await adapter.listPayouts(creds(), pageParams(1, 10))
    expect(rows.map((r) => r.id)).toEqual(all.map((t) => String(t.id)))
    expect(calls).toEqual([{ profile: BUSINESS, limit: 10, offset: 0 }])
  })

  it('reads the personal profile when there is no business profile', async () => {
    profiles = [profile('PERSONAL', PERSONAL)]
    const { calls } = serve(3, 2)
    const rows = await adapter.listPayouts(creds(), pageParams(1, 10))
    expect(rows.map((r) => r.id)).toEqual(['16522000', '16522001'])
    expect(calls).toEqual([{ profile: PERSONAL, limit: 10, offset: 0 }])
  })

  it('refuses 501 naming the choice when there are two business profiles, before any transfer read', async () => {
    profiles = [
      profile('PERSONAL', PERSONAL),
      profile('BUSINESS', BUSINESS),
      profile('BUSINESS', BUSINESS_2),
    ]
    const { calls } = serve(3)
    await expect(adapter.listPayouts(creds(), pageParams(1, 10))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(
        new RegExp(
          `^Wise cannot list payouts: .*${BUSINESS}.*${BUSINESS_2}.*which business profile`,
        ),
      ),
    })
    expect(calls).toEqual([])
    expect(getMock.mock.calls.map((call) => call[0])).toEqual(['/v2/profiles'])
  })

  it('throws, reading no transfers, when Wise returns no personal profile to fall back to', async () => {
    profiles = []
    const { calls } = serve(3)
    await expect(adapter.listPayouts(creds(), pageParams(1, 10))).rejects.toThrow(
      /no BUSINESS profile and 0 PERSONAL profiles/,
    )
    expect(calls).toEqual([])
  })

  it('reads a business profile that carries no currentState (the field is optional)', async () => {
    profiles = [profile('PERSONAL', PERSONAL), profile('BUSINESS', BUSINESS, 'absent')]
    const { calls } = serve(3, 2)
    expect(await adapter.listPayouts(creds(), pageParams(1, 10))).toHaveLength(3)
    expect(calls).toEqual([{ profile: BUSINESS, limit: 10, offset: 0 }])
  })

  for (const state of ['DEACTIVATED', 'HIDDEN'] as const) {
    it(`refuses 501, reading no transfers, when the only business profile is ${state}`, async () => {
      profiles = [profile('PERSONAL', PERSONAL), profile('BUSINESS', BUSINESS, state)]
      const { calls } = serve(3, 2)
      await expect(adapter.listPayouts(creds(), pageParams(1, 10))).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(
          new RegExp(`^Wise cannot list payouts: .*${BUSINESS}.*currentState ${state}`),
        ),
      })
      expect(calls).toEqual([])
      expect(getMock.mock.calls.map((call) => call[0])).toEqual(['/v2/profiles'])
    })
  }

  it('still refuses two business profiles when one of them is DEACTIVATED', async () => {
    profiles = [
      profile('PERSONAL', PERSONAL),
      profile('BUSINESS', BUSINESS),
      profile('BUSINESS', BUSINESS_2, 'DEACTIVATED'),
    ]
    const { calls } = serve(3)
    await expect(adapter.listPayouts(creds(), pageParams(1, 10))).rejects.toMatchObject({
      statusCode: 501,
      message: expect.stringMatching(/which business profile/),
    })
    expect(calls).toEqual([])
  })

  it('reads the personal profile whatever its currentState when there is no business profile', async () => {
    profiles = [profile('PERSONAL', PERSONAL, 'HIDDEN')]
    const { calls } = serve(3, 2)
    expect(await adapter.listPayouts(creds(), pageParams(1, 10))).toHaveLength(2)
    expect(calls).toEqual([{ profile: PERSONAL, limit: 10, offset: 0 }])
  })

  it('throws, reading no transfers, on two PERSONAL profiles and no business profile', async () => {
    profiles = [profile('PERSONAL', PERSONAL), profile('PERSONAL', PERSONAL + 1)]
    const { calls } = serve(3, 2)
    await expect(adapter.listPayouts(creds(), pageParams(1, 10))).rejects.toThrow(
      /no BUSINESS profile and 2 PERSONAL profiles/,
    )
    expect(calls).toEqual([])
  })

  it('throws, reading no transfers, on a profile type outside the documented enum', async () => {
    profiles = [profile('PERSONAL', PERSONAL), { type: 'SHARED', id: BUSINESS }]
    const { calls } = serve(3, 2)
    await expect(adapter.listPayouts(creds(), pageParams(1, 10))).rejects.toThrow(
      /undocumented profile type SHARED/,
    )
    expect(calls).toEqual([])
  })

  it('throws, reading no transfers, when the chosen profile has no numeric id', async () => {
    profiles = [profile('PERSONAL', PERSONAL), { type: 'BUSINESS', currentState: 'VISIBLE' }]
    const { calls } = serve(3, 2)
    await expect(adapter.listPayouts(creds(), pageParams(1, 10))).rejects.toThrow(
      /BUSINESS profile without its numeric id/,
    )
    expect(calls).toEqual([])
  })

  it('throws when GET /v2/profiles is not the documented array', async () => {
    getMock.mockResolvedValue({ data: { profiles: [] } })
    await expect(adapter.listPayouts(creds(), pageParams(1, 5))).rejects.toThrow(
      /array of profiles/,
    )
  })

  it('resolves the profile once per connection', async () => {
    serve(10)
    const a = creds()
    const b = creds()
    await adapter.listPayouts(a, pageParams(1, 2))
    await adapter.listPayouts(a, pageParams(2, 2))
    expect(profileCalls).toBe(1)
    await adapter.listPayouts(b, pageParams(1, 2))
    expect(profileCalls).toBe(2)
  })

  it('does not cache a failed resolution', async () => {
    profiles = [profile('BUSINESS', BUSINESS), profile('BUSINESS', BUSINESS_2)]
    const { calls } = serve(3)
    const c = creds()
    await expect(adapter.listPayouts(c, pageParams(1, 10))).rejects.toMatchObject({
      statusCode: 501,
    })
    profiles = [profile('BUSINESS', BUSINESS)]
    expect(await adapter.listPayouts(c, pageParams(1, 10))).toHaveLength(3)
    expect(calls).toEqual([{ profile: BUSINESS, limit: 10, offset: 0 }])
  })
})

describe('WiseAdapter.getPayout', () => {
  it('reads GET /v1/transfers/{transferId} and maps it', async () => {
    serve(3)
    const p = await adapter.getPayout(CREDS, '16521002')
    // GET /v1/transfers/{transferId} documents only the path id: no profile read.
    expect(getMock.mock.calls.map((call) => call[0])).toEqual(['/v1/transfers/16521002'])
    expect(p.id).toBe('16521002')
    expect(p.amount).toBe(8900)
    expect(p.status).toBe('paid')
  })
})

describe('WiseAdapter refusals', () => {
  it.each([
    ['listCustomers', /Wise cannot list customers/],
    ['listCharges', /Wise cannot list charges/],
    ['listRefunds', /Wise cannot list refunds/],
  ] as const)('%s throws 501 NOT_SUPPORTED without a request', async (method, msg) => {
    await expect(adapter[method](CREDS, pageParams(1, 10))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(msg),
    })
    expect(getMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it.each([
    ['getCustomer', /Wise cannot read customers/],
    ['getCharge', /Wise cannot read charges/],
    ['getRefund', /Wise cannot read refunds/],
  ] as const)('%s throws 501 NOT_SUPPORTED without a request', async (method, msg) => {
    await expect(adapter[method](CREDS, 'x')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(msg),
    })
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('Wise token exchange', () => {
  const basic = `Basic ${Buffer.from('cid:csecret').toString('base64')}`

  it('exchanges a code with Basic client auth and the documented body', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'at', refresh_token: 'r1', token_type: 'bearer' },
    })
    const creds = await adapter.exchangeCode('the-code', 'https://app/cb')
    const [url, body, cfg] = postMock.mock.calls[0]! as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(url).toBe('https://api.wise.com/oauth/token')
    expect(cfg.headers['Authorization']).toBe(basic)
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({
      grant_type: 'authorization_code',
      client_id: 'cid',
      code: 'the-code',
      redirect_uri: 'https://app/cb',
    })
    expect(creds).toMatchObject({ accessToken: 'at', refreshToken: 'r1' })
  })

  it('refreshes with Basic client auth and only grant_type + refresh_token', async () => {
    postMock.mockResolvedValue({ data: { access_token: 'at2', token_type: 'bearer' } })
    const creds = await adapter.refreshCredentials(CREDS)
    const [, body, cfg] = postMock.mock.calls[0]! as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(cfg.headers['Authorization']).toBe(basic)
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
    })
    expect(creds).toMatchObject({ accessToken: 'at2', refreshToken: 'rt' })
  })
})
