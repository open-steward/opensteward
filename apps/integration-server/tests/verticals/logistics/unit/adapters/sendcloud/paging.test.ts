/**
 * Sendcloud v2 list endpoints the adapter calls return the whole collection in
 * one response, so the adapter pages them locally.
 *
 * - listCarriers → GET /shipping_methods
 *   (https://sendcloud.dev/api/v2/shipping-methods/retrieve-a-list-of-shipping-methods.md):
 *   `limit` "Sets amount of results to be returned per page, if not set all
 *   results are returned." The adapter sends no limit, so it receives every
 *   method, groups them by carrier, and slices the grouped carriers. Paging
 *   upstream would split a carrier's methods across pages.
 * - listWarehouses → GET /user/addresses/sender
 *   (https://sendcloud.dev/api/v2/sender-addresses/retrieve-a-list-of-sender-addresses.md):
 *   "Returns a list of all the sender addresses which have been saved to your
 *   account." No query parameters are documented.
 *
 * Before this, every caller page returned the same rows: page 2 repeated
 * page 1 and a sync never saw an end.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { SendcloudAdapter } from '../../../../../../src/verticals/logistics/adapters/sendcloud/index'

const CREDS = { accessToken: 'sendcloud_test' }
const CALL_BUDGET = 20
const METHODS_DOCUMENTED = new Set([
  'sender_address',
  'service_point_id',
  'is_return',
  'from_postal_code',
  'to_postal_code',
  'to_country',
  'cursor',
  'limit',
])

/**
 * Carrier i owns (i % 3) + 1 shipping methods, listed carrier by carrier, so a
 * slice of methods and a slice of carriers disagree after the first carrier.
 */
function multiMethods(carriers: number) {
  let id = 1000
  return Array.from({ length: carriers }, (_, i) =>
    Array.from({ length: (i % 3) + 1 }, (_, j) => ({
      id: ++id,
      name: `Method ${i + 1}.${j + 1}`,
      carrier: `carrier-${String(i + 1).padStart(3, '0')}`,
    })),
  ).flat()
}

/** One shipping method per carrier, so carrier i is `carrier-i`. */
function methods(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i + 1,
    name: `Method ${i + 1}`,
    carrier: `carrier-${String(i + 1).padStart(3, '0')}`,
  }))
}

function senderAddresses(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    company_name: `Company ${i + 1}`,
    contact_name: 'Jane Doe',
    street: 'Bogert',
    house_number: '10',
    postal_code: '5611 EM',
    city: 'Eindhoven',
    country: 'NL',
  }))
}

/**
 * A fake Sendcloud that honours ONLY what the v2 docs define. shipping_methods:
 * without `limit` every method comes back; with `limit` a page of that size
 * plus `next`. user/addresses/sender takes no parameters and returns all.
 */
function fakeSendcloud(opts: {
  methods?: number
  methodList?: ReturnType<typeof methods>
  addresses?: number
}) {
  const allMethods = opts.methodList ?? methods(opts.methods ?? 0)
  const allAddresses = senderAddresses(opts.addresses ?? 0)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const params = cfg?.params ?? {}
    if (path === 'shipping_methods') {
      const extra = Object.keys(params).filter((k) => !METHODS_DOCUMENTED.has(k))
      if (extra.length > 0) throw new Error(`undocumented params sent: ${extra.join(',')}`)
      if (params.limit === undefined) {
        return { data: { next: null, previous: null, shipping_methods: allMethods } }
      }
      const limit = Number(params.limit)
      const start = Number(params.cursor ?? 0)
      const slice = allMethods.slice(start, start + limit)
      const next = start + limit < allMethods.length ? `?cursor=${start + limit}` : null
      return { data: { next, previous: null, shipping_methods: slice } }
    }
    if (path === 'user/addresses/sender') {
      if (Object.keys(params).length > 0) {
        throw new Error(`undocumented params sent: ${Object.keys(params).join(',')}`)
      }
      return { data: { sender_addresses: allAddresses } }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { get }
}

const carrierCodes = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => `carrier-${String(start + i).padStart(3, '0')}`)
const addressIds = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(start + i))

const listCarriers = (p: QueryParams) => new SendcloudAdapter().listCarriers(CREDS, p)
const listWarehouses = (p: QueryParams) => new SendcloudAdapter().listWarehouses(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('sendcloud listCarriers paging (all shipping methods, grouped, paged locally)', () => {
  it('with 2L+1 carriers, pages 1..3 at limit L return every carrier once, in order, hasMore exact', async () => {
    const L = 4
    fakeSendcloud({ methods: 2 * L + 1 })
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await listCarriers(params), params, 'sendcloud')
      seen.push(...env.data.map((c) => c.code as string))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(carrierCodes(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('carriers with several methods: each lands on one page with all its services, and paging counts carriers', async () => {
    const L = 4
    const all = multiMethods(2 * L + 1)
    expect(all.length).toBeGreaterThan(2 * L + 1)
    fakeSendcloud({ methodList: all })
    const servicesOf = (code: string) =>
      all.filter((m) => m.carrier === code).map((m) => String(m.id))
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await listCarriers(params), params, 'sendcloud')
      for (const c of env.data) {
        seen.push(c.code as string)
        expect((c.services ?? []).map((s) => s.code)).toEqual(servicesOf(c.code as string))
      }
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(carrierCodes(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is the second slice, and the request sends no limit so every method comes back', async () => {
    const { get } = fakeSendcloud({ methods: 10 })
    const page1 = (await listCarriers(parseListQuery({ page: '1', limit: '3' }))).map((c) => c.code)
    const page2 = (await listCarriers(parseListQuery({ page: '2', limit: '3' }))).map((c) => c.code)
    expect(page1).toEqual(carrierCodes(1, 3))
    expect(page2).toEqual(carrierCodes(4, 3))
    const page2Params = (get.mock.calls[1]?.[1]?.params ?? {}) as Record<string, unknown>
    expect(page2Params.limit).toBeUndefined()
    expect(page2Params.cursor).toBeUndefined()
  })

  it('a limit above the collection is not clamped below it: 501 carriers at 500 end on page 2', async () => {
    fakeSendcloud({ methods: 501 })
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await listCarriers(p1), p1, 'sendcloud')
    expect(env1.data).toHaveLength(500)
    expect(env1.meta.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 500 })
    const env2 = listPage(await listCarriers(p2), p2, 'sendcloud')
    expect(env2.data.map((c) => c.code)).toEqual(['carrier-501'])
    expect(env2.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeSendcloud({ methods: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await listCarriers(params), params, 'sendcloud')
    expect(env.data.map((c) => c.code)).toEqual(carrierCodes(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('sendcloud listWarehouses paging (all sender addresses, paged locally)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every address once, in order, hasMore exact', async () => {
    const L = 3
    fakeSendcloud({ addresses: 2 * L + 1 })
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await listWarehouses(params), params, 'sendcloud')
      seen.push(...env.data.map((w) => w.id as string))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ pagedLocally: true, totalCount: 2 * L + 1 }),
      )
    }
    expect(seen).toEqual(addressIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is the second slice, and the request carries no parameters', async () => {
    const { get } = fakeSendcloud({ addresses: 10 })
    const page1 = (await listWarehouses(parseListQuery({ page: '1', limit: '3' }))).map((w) => w.id)
    const page2 = (await listWarehouses(parseListQuery({ page: '2', limit: '3' }))).map((w) => w.id)
    expect(page1).toEqual(addressIds(1, 3))
    expect(page2).toEqual(addressIds(4, 3))
    expect(get.mock.calls[1]?.[0]).toBe('user/addresses/sender')
    expect(get.mock.calls[1]?.[1]?.params).toBeUndefined()
  })

  it('a limit above the collection returns it all with hasMore false', async () => {
    fakeSendcloud({ addresses: 150 })
    const params = withPageSink({ page: 1, limit: 500 })
    const env = listPage(await listWarehouses(params), params, 'sendcloud')
    expect(env.data.map((w) => w.id)).toEqual(addressIds(1, 150))
    expect(env.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 3 as the last page', async () => {
    fakeSendcloud({ addresses: 7 })
    const params = parseListQuery({ page: '3', limit: '3' })
    const env = listPage(await listWarehouses(params), params, 'sendcloud')
    expect(env.data.map((w) => w.id)).toEqual(['7'])
    expect(env.meta.hasMore).toBe(false)
  })
})
