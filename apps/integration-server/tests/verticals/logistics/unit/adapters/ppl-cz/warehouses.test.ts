/**
 * PPL CZ (CPL API) warehouses: GET /customer/address.
 *
 * From the first-party spec (https://ppl-cpl-api-en.apidog.io/customer-addresess-13601472e0.md):
 * the method takes no query parameters at all (only the Accept-Language,
 * X-Correlation-ID and X-LogLevel headers), and a 200 is "type: array" of
 * AddressModel { code, name, name2, street, city, zipCode, country, default }.
 * There is no Limit/Offset, so every call returns every address, and the
 * adapter pages that whole list locally.
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
import { PplCzAdapter } from '../../../../../../src/verticals/logistics/adapters/ppl-cz/index'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'

const CREDS = { accessToken: 'ppl_test', extra: { clientId: 'client-1', clientSecret: 's' } }

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

/** An address in the documented AddressModel shape, and nothing else. */
const address = (i: number) => ({
  code: `A${String(i).padStart(3, '0')}`,
  name: `Branch ${i}`,
  name2: `Company ${i}`,
  street: `Street ${i}`,
  city: 'Praha',
  zipCode: '11000',
  country: 'CZ',
  default: i === 1,
})

/**
 * A fake CPL API honouring only what the spec documents for
 * GET /customer/address: no query parameters, the whole list as a JSON array.
 */
function fakePpl(body: unknown) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params })
    if (path !== 'customer/address') throw new Error(`unexpected path ${path}`)
    const sent = Object.keys(cfg?.params ?? {})
    if (sent.length) throw new Error(`undocumented params sent: ${sent.join(',')}`)
    return { data: body, headers: {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { calls }
}

const adapter = () => new PplCzAdapter()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ppl-cz listWarehouses (GET /customer/address, unpaginated)', () => {
  const list = (p: QueryParams) => adapter().listWarehouses(CREDS, p)

  it('walks 2L+1 addresses in pages of L, every id once, hasMore exact', async () => {
    const L = 2
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => address(i + 1))
    const { calls } = fakePpl(all)
    const seen: string[] = []
    const more: boolean[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const result = await list(params)
      const report = readUpstreamPage(params)
      for (const w of result) {
        WarehouseSchema.parse(w)
        seen.push(w.id as string)
      }
      expect(report?.totalCount).toBe(2 * L + 1)
      more.push(report?.hasMore as boolean)
    }
    expect(seen).toEqual(all.map((a) => a.code))
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
    expect(calls.every((c) => c.path === 'customer/address')).toBe(true)
  })

  it('reports the list as paged locally, and a page past the end is empty', async () => {
    fakePpl([address(1), address(2)])
    const params = withPageSink({ page: 2, limit: 2 })
    const result = await list(params)
    const page = readUpstreamPage(params)
    expect(result).toEqual([])
    expect(page?.pagedLocally).toBe(true)
    expect(page?.hasMore).toBe(false)
    expect(page?.totalCount).toBe(2)
  })

  it('sends no query parameters (the spec documents none)', async () => {
    const { calls } = fakePpl([address(1)])
    await list({ page: 1, limit: 50 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.params ?? {}).toEqual({})
  })

  it('refuses a body that is not the documented array instead of reporting an empty, complete list', async () => {
    fakePpl({ unexpected: true })
    await expect(list(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/array/)
  })

  it('serves page 2 through the router path (parseListQuery + listPage)', async () => {
    const all = Array.from({ length: 5 }, (_, i) => address(i + 1))
    fakePpl(all)
    const params = parseListQuery({ page: '2', limit: '2' })
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'ppl-cz')
    expect(env.data.map((w) => w.id)).toEqual(['A003', 'A004'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(5)
  })
})

describe('ppl-cz getWarehouse', () => {
  it('reads one address back by the code listWarehouses returns as id', async () => {
    fakePpl([address(1), address(2), address(3)])
    const w = await adapter().getWarehouse(CREDS, 'A002')
    expect(WarehouseSchema.parse(w).id).toBe('A002')
    expect(w.name).toBe('Branch 2')
  })

  it('throws when no address has that code', async () => {
    fakePpl([address(1)])
    await expect(adapter().getWarehouse(CREDS, 'NOPE')).rejects.toThrow(/not found/)
  })
})
