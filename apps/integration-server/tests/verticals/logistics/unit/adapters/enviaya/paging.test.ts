/**
 * EnviaYa listCarriers.
 *
 * It used to call GET /api/v1/get_carriers and GET /api/v1/get_services,
 * neither of which appears anywhere in EnviaYa's first-party docs. The docs
 * (the Postman collection behind https://docs.enviaya.com.mx/) document one
 * carrier catalogue:
 *
 *   Services > Get all services
 *   GET https://enviaya.com.mx/api/v2/carrier_services/services_map?api_key=API_KEY
 *
 * with no paging parameter and a single saved 200 answer carrying every
 * carrier under `services`. It answers the whole catalogue, so the adapter
 * pages it locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { EnviaYaAdapter } from '../../../../../../src/verticals/logistics/adapters/enviaya/index'
import type { EnviaYaServicesMapResponse } from '../../../../../../src/verticals/logistics/adapters/enviaya/transform/carrier'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'
import { SERVICES_MAP_EXAMPLE } from './fixtures'

const CREDS = { accessToken: 'API_KEY' }
const CALL_BUDGET = 20
const L = 3
const N = 2 * L + 1
const SERVICES_MAP_URL = 'https://enviaya.com.mx/api/v2/carrier_services/services_map'
/** The only query parameter the documented request carries. */
const DOCUMENTED_QUERY = ['api_key']

/** The first N carriers of the documented example, in its order. */
const DOC_CARRIERS = Object.keys(SERVICES_MAP_EXAMPLE.services ?? {}).slice(0, N)
function exampleWith(count: number): EnviaYaServicesMapResponse {
  const services = SERVICES_MAP_EXAMPLE.services ?? {}
  return {
    services: Object.fromEntries(DOC_CARRIERS.slice(0, count).map((k) => [k, services[k]!])),
  }
}

/**
 * A fake EnviaYa that honours ONLY the documented request: GET services_map
 * with the api_key query parameter, answering the whole catalogue every time.
 */
function fakeEnviaYa(count: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== SERVICES_MAP_URL) throw new Error(`404: unexpected path ${path}`)
    const bad = Object.entries(cfg?.params ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k)
      .filter((k) => !DOCUMENTED_QUERY.includes(k))
    if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
    if (cfg?.params?.['api_key'] !== CREDS.accessToken) throw new Error('401: api_key missing')
    return { data: exampleWith(count) }
  })
  const post = vi.fn()
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, delete: vi.fn() } as never)
  return { get, post }
}

afterEach(() => vi.restoreAllMocks())

describe('enviaya listCarriers paging', () => {
  const adapter = () => new EnviaYaAdapter()

  it('has 2L+1 documented carriers to walk', () => {
    expect(DOC_CARRIERS).toHaveLength(N)
  })

  it('N = 2L+1 carriers: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeEnviaYa(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => CarrierSchema.parse(r).id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(DOC_CARRIERS)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('sends the one documented GET, with only api_key and no invented paging key', async () => {
    const { get, post } = fakeEnviaYa(N)
    await adapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(post).not.toHaveBeenCalled()
    expect(get.mock.calls[0]![0]).toBe(SERVICES_MAP_URL)
    const sent = Object.entries(get.mock.calls[0]![1]?.params ?? {}).filter(
      ([, v]) => v !== undefined,
    )
    expect(sent).toEqual([['api_key', 'API_KEY']])
  })

  it('a limit above the router maximum is clamped, and serves every carrier with hasMore false', async () => {
    fakeEnviaYa(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listCarriers(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(DOC_CARRIERS)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeEnviaYa(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'enviaya')
    expect(env.data.map((r) => r.id)).toEqual(DOC_CARRIERS.slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})
