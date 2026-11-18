/**
 * Packlink PRO list paging. listWarehouses ignored the caller's `page`, so
 * page 2 repeated page 1.
 *
 * listWarehouses — GET v1/clients/warehouses is not paged. Packlink's own
 * integration core (packlink-dev/ecommerce_module_core,
 * src/BusinessLogic/Http/Proxy.php) calls it with no query parameters and
 * treats the decoded body as the whole batch:
 *   $response = $this->call(HttpClient::HTTP_METHOD_GET, 'clients/warehouses');
 *   $data = $response->decodeBodyToArray() ?: array();
 * So one response is the whole collection and it is paged locally.
 *
 * listCarriers is deliberately NOT fixed here: GET v1/services is a quote
 * search that requires from/to/package parameters (the same Proxy.php throws
 * 'Missing required search parameter(s).' without them), and the adapter
 * calls it with none. Paging a call the upstream rejects would be vacuous.
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
import { PacklinkProAdapter } from '../../../../../../src/verticals/logistics/adapters/packlink-pro/index'

const CREDS = { accessToken: 'packlink_test_key' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

/**
 * A fake Packlink honouring only what the first-party client sends to
 * clients/warehouses: no query parameters at all. Any paging param is a 400.
 */
function fakePacklink(count: number) {
  let calls = 0
  const log: Array<{ path: string; params: Record<string, unknown> | undefined }> = []
  const warehouses = Array.from({ length: count }, (_, i) => ({
    id: `wh-${(i * 13 + 7).toString(36)}-${i}`,
    alias: `Warehouse ${i + 1}`,
    city: 'Madrid',
    country: 'ES',
    postal_code: '28001',
  }))
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    log.push({ path, params: config?.params })
    if (path !== 'clients/warehouses') throw new Error(`unexpected path ${path}`)
    const sent = Object.keys(config?.params ?? {}).filter((k) => config?.params?.[k] !== undefined)
    if (sent.length) throw new Error(`400: undocumented params ${sent.join(',')}`)
    return { data: warehouses }
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get,
    post: vi.fn(),
    delete: vi.fn(),
  })) as never)
  return { log, warehouses }
}

const adapter = () => new PacklinkProAdapter()
const sink = (page: number, limit: number): QueryParams => withPageSink({ page, limit })

afterEach(() => vi.restoreAllMocks())

describe('packlink-pro listWarehouses paging (unpaged upstream, paged locally)', () => {
  it('serves every warehouse once across pages 1..3 with exact hasMore', async () => {
    const { warehouses } = fakePacklink(N)
    const seen: Array<string | undefined> = []
    const more: Array<boolean | undefined> = []
    for (const k of [1, 2, 3]) {
      const params = sink(k, L)
      const rows = await adapter().listWarehouses(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(L)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(warehouses.map((w) => w.id))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 sends no paging params (the endpoint documents none) and returns rows L+1..2L', async () => {
    const { log, warehouses } = fakePacklink(N)
    const rows = await adapter().listWarehouses(CREDS, sink(2, L))
    expect(rows.map((r) => r.id)).toEqual(warehouses.slice(L, 2 * L).map((w) => w.id))
    expect(log).toHaveLength(1)
    expect(log[0]!.path).toBe('clients/warehouses')
    expect(log[0]!.params).toBeUndefined()
  })

  it('a page past the end is empty with hasMore false', async () => {
    fakePacklink(N)
    const params = sink(4, L)
    expect(await adapter().listWarehouses(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a limit larger than the collection returns everything once, hasMore false', async () => {
    const { warehouses } = fakePacklink(3)
    const params = sink(1, 1000)
    const rows = await adapter().listWarehouses(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(warehouses.map((w) => w.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const { warehouses } = fakePacklink(N)
    const params = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env = listPage(await adapter().listWarehouses(CREDS, params), params, 'packlink-pro')
    expect(env.data.map((w) => w.id)).toEqual(warehouses.slice(L, 2 * L).map((w) => w.id))
    expect(env.meta.page).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})
