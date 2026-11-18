/**
 * Metapack read methods against the first-party specs at https://dev.metapack.com/.
 *
 * Shipping API 1.14.0: GET /carriers ("Retrieve all carriers associated with
 * your Metapack shipper account.") and GET /shippingLocations ("Retrieve all
 * warehouses associated with your Metapack shipper account.") declare no
 * parameters and return a bare JSON array, so each caller page is cut from the
 * whole list (pageLocally). GET /carriers/{carrierCode}/services returns a
 * carrier's services. Guide: "GET /shipping/v1/carriers HTTP/1.1 Host:
 * api.metapack.com". Sandbox: "https://api.sbx.metapack.com/shipping/v1".
 *
 * Tracking API 1.0.13: GET /parcel-journeys with `trackingIdentifier`, servers
 * "https://api.metapack.com/tracking/v1" (Production) and
 * "https://api.sbx.metapack.com/tracking/v1" (Sandbox).
 *
 * Both APIs: "The `Authorization` header comprises the prefix `Basic` followed
 * by a Base64-encoded `<username>:<password>` string."
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { MetapackAdapter } from '../../../../../../src/verticals/logistics/adapters/metapack/index'

const CREDS = { accessToken: 's3cret:pw', extra: { username: 'shipper-api' } }
const BASIC = `Basic ${Buffer.from('shipper-api:s3cret:pw').toString('base64')}`

/** The documented parameters of each GET path; anything else is rejected by the fake. */
const DOCUMENTED: Record<string, Set<string>> = {
  carriers: new Set(),
  shippingLocations: new Set(),
  'parcel-journeys': new Set(['orderRef', 'trackingIdentifier', 'customerRef', 'postcode']),
}

interface Call {
  baseURL: string | undefined
  headers: Record<string, string>
  path: string
  params: Record<string, unknown> | undefined
}

function fake(routes: Record<string, unknown>) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: {
    baseURL?: string
    headers?: Record<string, string>
  }) => ({
    get: vi.fn(async (path: string, opts?: { params?: Record<string, unknown> }) => {
      calls.push({ baseURL: cfg?.baseURL, headers: cfg?.headers ?? {}, path, params: opts?.params })
      const documented =
        DOCUMENTED[path] ?? (/^carriers\/[^/]+\/services$/.test(path) ? new Set() : undefined)
      if (!documented) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
      for (const k of Object.keys(opts?.params ?? {})) {
        if (!documented.has(k)) throw new Error(`undocumented param ${k} on ${path}`)
      }
      if (!(path in routes))
        throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
      return { data: routes[path] }
    }),
    post: vi.fn(),
    delete: vi.fn(),
  })) as unknown as typeof axios.create)
  return calls
}

afterEach(() => vi.restoreAllMocks())

const L = 5
const N = 2 * L + 1

function walk<T extends { id?: string }>(
  list: (p: QueryParams) => Promise<T[]>,
): Promise<{
  ids: string[]
  pages: Array<{ n: number; hasMore: boolean | undefined; total?: number }>
}> {
  return (async () => {
    const ids: string[] = []
    const pages: Array<{ n: number; hasMore: boolean | undefined; total?: number }> = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      const meta = readUpstreamPage(params)
      ids.push(...rows.map((r) => r.id!))
      pages.push({ n: rows.length, hasMore: meta?.hasMore, total: meta?.totalCount })
      if (!meta?.hasMore) break
    }
    return { ids, pages }
  })()
}

describe('metapack listCarriers — GET /shipping/v1/carriers', () => {
  const rows = Array.from({ length: N }, (_, i) => ({
    code: `C${i + 1}`,
    name: `Carrier ${i + 1}`,
  }))

  it('calls the documented path on the production host with Basic auth and no params', async () => {
    const calls = fake({ carriers: rows })
    await new MetapackAdapter().listCarriers(CREDS, { page: 1, limit: L })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.baseURL).toBe('https://api.metapack.com/shipping/v1/')
    expect(calls[0]!.path).toBe('carriers')
    expect(calls[0]!.params).toBeUndefined()
    expect(calls[0]!.headers.Authorization).toBe(BASIC)
  })

  it('walks N = 2L+1 carriers: every id once, hasMore exact', async () => {
    fake({ carriers: rows })
    const a = new MetapackAdapter()
    const { ids, pages } = await walk((p) => a.listCarriers(CREDS, p))
    expect(ids).toEqual(rows.map((r) => r.code))
    expect(pages).toEqual([
      { n: L, hasMore: true, total: N },
      { n: L, hasMore: true, total: N },
      { n: 1, hasMore: false, total: N },
    ])
  })

  it('reads the sandbox host when the adapter is configured for it', async () => {
    const calls = fake({ carriers: rows })
    await new MetapackAdapter({ sandbox: true }).listCarriers(CREDS, { page: 1, limit: L })
    expect(calls[0]!.baseURL).toBe('https://api.sbx.metapack.com/shipping/v1/')
  })
})

describe('metapack listWarehouses — GET /shipping/v1/shippingLocations', () => {
  const rows = Array.from({ length: N }, (_, i) => ({
    code: `W${i + 1}`,
    name: `Warehouse ${i + 1}`,
  }))

  it('calls the documented path on the production host with Basic auth and no params', async () => {
    const calls = fake({ shippingLocations: rows })
    await new MetapackAdapter().listWarehouses(CREDS, { page: 2, limit: L })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.baseURL).toBe('https://api.metapack.com/shipping/v1/')
    expect(calls[0]!.path).toBe('shippingLocations')
    expect(calls[0]!.params).toBeUndefined()
    expect(calls[0]!.headers.Authorization).toBe(BASIC)
  })

  it('walks N = 2L+1 warehouses: every id once, hasMore exact', async () => {
    fake({ shippingLocations: rows })
    const a = new MetapackAdapter()
    const { ids, pages } = await walk((p) => a.listWarehouses(CREDS, p))
    expect(ids).toEqual(rows.map((r) => r.code))
    expect(new Set(ids).size).toBe(N)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.map((p) => p.n)).toEqual([L, L, 1])
  })

  it('pins the branch convention: a non-array 200 reads as an empty last page', async () => {
    fake({ shippingLocations: { unexpected: true } })
    const params = withPageSink({ page: 1, limit: L })
    expect(await new MetapackAdapter().listWarehouses(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty account is one empty last page', async () => {
    fake({ shippingLocations: [] })
    const params = withPageSink({ page: 1, limit: L })
    expect(await new MetapackAdapter().listWarehouses(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('metapack getCarrier — GET /carriers + GET /carriers/{carrierCode}/services', () => {
  const carriers = [
    { code: 'DP05', name: 'Deutsche Post International' },
    { code: 'ROYALMAIL', name: 'Royal Mail' },
  ]
  const services = [
    { code: 'DP05PACKETPLUS', name: 'Packet Plus' },
    { code: 'DP05PACKETPRIORITY', name: 'Packet Priority' },
  ]

  it('reads back a listed carrier by its code, with its services', async () => {
    const calls = fake({ carriers, 'carriers/DP05/services': services })
    const c = await new MetapackAdapter().getCarrier(CREDS, 'DP05')
    expect(calls.map((c) => c.path)).toEqual(['carriers', 'carriers/DP05/services'])
    expect(c.id).toBe('DP05')
    expect(c.name).toBe('Deutsche Post International')
    expect(c.services?.map((s) => s.code)).toEqual(['DP05PACKETPLUS', 'DP05PACKETPRIORITY'])
  })

  it('URL-encodes the carrier code in the services path', async () => {
    const calls = fake({
      carriers: [{ code: 'A B', name: 'Spaced' }],
      'carriers/A%20B/services': [],
    })
    await new MetapackAdapter().getCarrier(CREDS, 'A B')
    expect(calls.map((c) => c.path)).toEqual(['carriers', 'carriers/A%20B/services'])
  })

  it('404s a code the account does not have, without asking for its services', async () => {
    const calls = fake({ carriers })
    await expect(new MetapackAdapter().getCarrier(CREDS, 'NOPE')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    expect(calls.map((c) => c.path)).toEqual(['carriers'])
  })
})

describe('metapack getTrackingEvents — GET /tracking/v1/parcel-journeys', () => {
  const journeys = [
    {
      parcel: { deliveryLegs: [{ carrierCode: 'DPD_UK', trackingIdentifier: 'TRK1' }] },
      trackingEvents: [
        {
          trackingIdentifier: 'TRK1',
          eventCode: 'IN_TRANSIT',
          eventDate: '2024-05-10T08:00:00Z',
          statusCode: 'IN_TRANSIT',
        },
        {
          trackingIdentifier: 'TRK1',
          eventCode: 'DELIVERED',
          eventDate: '2024-05-12T08:00:00Z',
          statusCode: 'DELIVERED',
        },
      ],
    },
  ]

  it('asks the Tracking API by trackingIdentifier with Basic auth', async () => {
    const calls = fake({ 'parcel-journeys': journeys })
    const events = await new MetapackAdapter().getTrackingEvents!(CREDS, 'TRK1')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.baseURL).toBe('https://api.metapack.com/tracking/v1/')
    expect(calls[0]!.path).toBe('parcel-journeys')
    expect(calls[0]!.params).toEqual({ trackingIdentifier: 'TRK1' })
    expect(calls[0]!.headers.Authorization).toBe(BASIC)
    expect(events.map((e) => e.status)).toEqual(['IN_TRANSIT', 'DELIVERED'])
    expect(events.every((e) => e.carrierId === 'DPD_UK')).toBe(true)
  })

  it('uses the sandbox tracking host when configured for it', async () => {
    const calls = fake({ 'parcel-journeys': [] })
    expect(await new MetapackAdapter({ sandbox: true }).getTrackingEvents!(CREDS, 'TRK1')).toEqual(
      [],
    )
    expect(calls[0]!.baseURL).toBe('https://api.sbx.metapack.com/tracking/v1/')
  })
})

describe('metapack credentials — HTTP Basic username + password', () => {
  it('the Connect form asks for the username and password', () => {
    const a = new MetapackAdapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual(['username', 'password'])
  })

  it('stores the username in extra and the password as the token', async () => {
    const c = await new MetapackAdapter().exchangeCredentials({
      username: ' shipper-api ',
      password: 's3cret:pw',
    })
    expect(c).toEqual(CREDS)
  })

  it('exchangeCode accepts "username:password", the password keeping its colons', async () => {
    expect(await new MetapackAdapter().exchangeCode('shipper-api:s3cret:pw', '')).toEqual(CREDS)
  })

  it('refuses a missing username or password', async () => {
    const a = new MetapackAdapter()
    await expect(a.exchangeCredentials({ username: '', password: 'x' })).rejects.toThrow(/username/)
    await expect(a.exchangeCredentials({ username: 'u', password: '' })).rejects.toThrow(/password/)
  })

  it('a connection without a username fails before any request', async () => {
    const calls = fake({ carriers: [] })
    await expect(
      new MetapackAdapter().listCarriers({ accessToken: 'pw' }, { page: 1, limit: L }),
    ).rejects.toThrow(/username/)
    expect(calls).toHaveLength(0)
  })
})
