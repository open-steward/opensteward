/**
 * Parcel2Go list methods, against the public Swagger 2.0 document
 * https://www.parcel2go.com/api/swagger/docs/v1 (host www.parcel2go.com,
 * basePath /api).
 *
 * listCarriers / getCarrier — the Swagger has no path containing "couriers".
 * Carriers come from the service catalogue:
 *   GET /services  "Get a list of active services"
 *     take  "Number of services to get (default 50)."
 *     skip  "Number of services to skip (default 0)."
 *   ServiceResults.Take: "There may be less services returned than the
 *   requested amount. Use this to page your results."
 * Each ExtendedQuoteService names its courier (CourierSlug, CourierName). The
 * adapter walks the whole catalogue, groups by CourierSlug and pages locally.
 *
 * listShipments / listOrders — the only order listing is
 *   GET /me/orders/detail  "Gets the currently logged in user's 25 most recent orders."
 * with no parameters at all: a capped window, so both refuse with 501.
 * getOrder — GET /orders "Gets an order." needs orderId AND hash ("required
 * when the client doesn't have explicit user permissions"); refuses with 501.
 * getShipment — no GET for an order line exists; refuses with 501.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { Parcel2GoAdapter } from '../../../../../../src/verticals/logistics/adapters/parcel2go/index'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'

const CREDS = { accessToken: 'p2g_test_token' }
const DOCUMENTED_SERVICES_QUERY = ['take', 'skip']
const CALL_BUDGET = 50

interface FakeService {
  CourierSlug: string
  CourierName: string
  Slug: string
  Name: string
}

/**
 * A catalogue of `couriers` couriers whose services are interleaved and uneven
 * in number, so courier rows straddle GET /services page boundaries and a
 * courier reappears on later pages.
 */
function catalogue(couriers: number): FakeService[] {
  const rows: FakeService[] = []
  const counts = Array.from({ length: couriers }, (_, i) => 3 + ((i * 7) % 11))
  for (let round = 0; round < Math.max(...counts); round++) {
    for (let c = 0; c < couriers; c++) {
      if (round < counts[c]!) {
        rows.push({
          CourierSlug: `courier-${c + 1}`,
          CourierName: `Courier ${c + 1}`,
          Slug: `courier-${c + 1}-svc-${round + 1}`,
          Name: `Courier ${c + 1} service ${round + 1}`,
        })
      }
    }
  }
  return rows
}

/**
 * A fake Parcel2Go that honours ONLY the documented GET /services request:
 * `take` (default 50) and `skip` (default 0) as a row offset, answering with a
 * `ServiceResults` body. Any other path or query parameter is a 400/404.
 */
function fakeParcel2Go(rows: FakeService[]) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'services') throw Object.assign(new Error(`404 ${path}`), { status: 404 })
    const params = cfg?.params ?? {}
    const bad = Object.keys(params).filter((k) => !DOCUMENTED_SERVICES_QUERY.includes(k))
    if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
    const take = (params.take as number | undefined) ?? 50
    const skip = (params.skip as number | undefined) ?? 0
    return { data: { Results: rows.slice(skip, skip + take), Take: take, Skip: skip } }
  })
  const post = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { get, post, create }
}

afterEach(() => vi.restoreAllMocks())

describe('parcel2go listCarriers', () => {
  const L = 5
  const N = 2 * L + 1

  it('N = 2L+1 couriers: pages 1..3 at limit L serve every courier once, hasMore exact', async () => {
    const rows = catalogue(N)
    expect(rows.length).toBeGreaterThan(50) // the walk crosses 50-row upstream pages
    fakeParcel2Go(rows)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const carriers = await new Parcel2GoAdapter().listCarriers(CREDS, params)
      seen.push(...carriers.map((c) => CarrierSchema.parse(c).id as string))
      const meta = readUpstreamPage(params)
      expect(meta).toEqual(expect.objectContaining({ totalCount: N, pagedLocally: true }))
      more.push(meta?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `courier-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('a courier whose services span several upstream pages is one carrier with all of them', async () => {
    const rows = catalogue(N)
    fakeParcel2Go(rows)
    const carriers = await new Parcel2GoAdapter().listCarriers(
      CREDS,
      withPageSink({ page: 1, limit: 50 }),
    )
    const c3 = carriers.find((c) => c.id === 'courier-3')!
    const expected = rows.filter((r) => r.CourierSlug === 'courier-3').map((r) => r.Slug)
    expect(c3.services?.map((s) => s.code)).toEqual(expected)
    expect(new Set(carriers.map((c) => c.id)).size).toBe(carriers.length)
  })

  it('walks GET /services with documented take/skip until an empty page', async () => {
    const rows = catalogue(N)
    const { get } = fakeParcel2Go(rows)
    await new Parcel2GoAdapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    const pages = Math.ceil(rows.length / 50)
    expect(get.mock.calls.map((c) => [c[0], c[1]?.params])).toEqual(
      Array.from({ length: pages + 1 }, (_, i) => ['services', { take: 50, skip: i * 50 }]),
    )
  })

  it('an empty catalogue is an empty, complete list', async () => {
    fakeParcel2Go([])
    const params = withPageSink({ page: 1, limit: L })
    expect(await new Parcel2GoAdapter().listCarriers(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ totalCount: 0, hasMore: false }),
    )
  })

  it('throws rather than serve a truncated list when the catalogue never ends', async () => {
    const get = vi.fn(async () => ({
      data: { Results: [{ CourierSlug: 'x', Slug: 'x-1' }] },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    await expect(
      new Parcel2GoAdapter().listCarriers(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/truncated carrier list/)
  })
})

describe('parcel2go getCarrier', () => {
  it('reads a courier back by the id listCarriers returned', async () => {
    const rows = catalogue(4)
    fakeParcel2Go(rows)
    const c = CarrierSchema.parse(await new Parcel2GoAdapter().getCarrier(CREDS, 'courier-2'))
    expect(c.id).toBe('courier-2')
    expect(c.name).toBe('Courier 2')
    expect(c.services?.map((s) => s.code)).toEqual(
      rows.filter((r) => r.CourierSlug === 'courier-2').map((r) => r.Slug),
    )
  })

  it('404s for a courier with no active service', async () => {
    fakeParcel2Go(catalogue(2))
    await expect(new Parcel2GoAdapter().getCarrier(CREDS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe.each([
  ['listShipments', 'Parcel2Go cannot list shipments'],
  ['listOrders', 'Parcel2Go cannot list orders'],
] as const)('parcel2go %s', (method, prefix) => {
  it.each([
    { page: 1, limit: 20 },
    { page: 2, limit: 5, updatedAfter: new Date('2026-09-01T00:00:00Z') },
  ])('throws 501 NOT_SUPPORTED and sends no request (%o)', async (p) => {
    const { get, post, create } = fakeParcel2Go([])
    await expect(
      new Parcel2GoAdapter()[method](CREDS, withPageSink({ ...p })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining(prefix),
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('names the 25-most-recent cap', async () => {
    fakeParcel2Go([])
    await expect(new Parcel2GoAdapter()[method](CREDS, { page: 1, limit: 5 })).rejects.toThrow(
      /25 most recent orders/,
    )
  })
})

describe.each(['getShipment', 'getOrder'] as const)('parcel2go %s', (method) => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, post, create } = fakeParcel2Go([])
    await expect(new Parcel2GoAdapter()[method](CREDS, '12345')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
