/**
 * Packlink PRO read methods rebuilt from Packlink's own open-source
 * integration core (packlink-dev/ecommerce_module_core,
 * src/BusinessLogic/Http/Proxy.php):
 *
 *  - auth: `'token' => 'Authorization: ' . $this->configService->getAuthorizationToken()`,
 *    and UserAccountService::login($apiKey) stores the API key as that token.
 *  - listCarriers refuses: the only services call is a quote search,
 *    `'services?' . http_build_query($params->toArray())`, guarded by
 *    ShippingServiceSearch::isValid() (from/to country and zip, packages).
 *  - getWarehouse reads the documented collection `clients/warehouses`
 *    (no get-by-id path is documented).
 *  - getTrackingEvents reads `shipments/{reference}/track`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { PacklinkProAdapter } from '../../../../../../src/verticals/logistics/adapters/packlink-pro/index'

const CREDS = { accessToken: 'packlink_test_key' }

function fake(routes: Record<string, unknown>) {
  const created: Array<Record<string, unknown>> = []
  const log: Array<{ path: string; params: unknown }> = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    log.push({ path, params: config?.params })
    if (config?.params && Object.values(config.params).some((v) => v !== undefined)) {
      throw new Error(`400: undocumented params on ${path}`)
    }
    if (!(path in routes)) throw Object.assign(new Error(`404 ${path}`), { statusCode: 404 })
    return { data: routes[path] }
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: Record<string, unknown>) => {
    created.push(cfg)
    return { get, post: vi.fn(), delete: vi.fn() }
  }) as never)
  return { created, log, get }
}

const WAREHOUSES = [
  {
    city: 'El Piquillo 2',
    surname: 'MyLastname2',
    name: 'MyName2',
    phone: '1234567',
    country: 'ES',
    company: 'MyCompanyName2',
    default_selection: true,
    email: 'example2@email.com',
    alias: 'MyWarehouse2',
    postal_code: '28041',
    address: 'MyAddress2',
    created_at: '2018-11-08 15:44:21',
    id: '222459d5e4b0ed5488fe91544',
  },
  {
    city: 'El Piquillo 1',
    surname: 'MyLastname1',
    name: 'MyName1',
    phone: '1234567',
    country: 'ES',
    company: 'MyCompanyName1',
    default_selection: false,
    email: 'example1@email.com',
    alias: 'MyWarehouse1',
    postal_code: '28049',
    address: 'MyAddress1',
    created_at: '2018-11-08 15:44:21',
    id: '5be459d5e4b0ed5488fe9159',
  },
]

afterEach(() => vi.restoreAllMocks())

describe('packlink-pro client auth', () => {
  it('sends the API key raw in Authorization, as the first-party core does, on the v1 host', async () => {
    const { created } = fake({ 'clients/warehouses': WAREHOUSES })
    await new PacklinkProAdapter().listWarehouses(CREDS, { page: 1, limit: 5 })
    expect(created).toHaveLength(1)
    expect(created[0]!.baseURL).toBe('https://api.packlink.com/v1/')
    const headers = created[0]!.headers as Record<string, string>
    expect(headers.Authorization).toBe('packlink_test_key')
    expect(headers['X-API-Key']).toBeUndefined()
  })
})

describe('packlink-pro listCarriers (refused: only a quote search exists)', () => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, created } = fake({})
    const err = await new PacklinkProAdapter()
      .listCarriers(CREDS, { page: 1, limit: 5 })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/Packlink PRO cannot list carriers/)
    expect(get).not.toHaveBeenCalled()
    expect(created).toHaveLength(0)
  })
})

describe('packlink-pro getWarehouse (read back from the documented collection)', () => {
  it('returns the row whose id matches, via GET clients/warehouses with no params', async () => {
    const { log } = fake({ 'clients/warehouses': WAREHOUSES })
    const w = await new PacklinkProAdapter().getWarehouse(CREDS, '5be459d5e4b0ed5488fe9159')
    expect(w.id).toBe('5be459d5e4b0ed5488fe9159')
    expect(w.name).toBe('MyWarehouse1')
    expect(log).toEqual([{ path: 'clients/warehouses', params: undefined }])
  })

  it('throws 404 NOT_FOUND for an id the collection does not hold', async () => {
    fake({ 'clients/warehouses': WAREHOUSES })
    await expect(new PacklinkProAdapter().getWarehouse(CREDS, 'nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

describe('packlink-pro getTrackingEvents (shipments/{reference}/track)', () => {
  it('reads the documented path and maps history', async () => {
    const { log } = fake({
      'shipments/DE00019732CF/track': {
        history: [
          { timestamp: 14242322, description: 'DELIVERED', city: 'MIAMI' },
          { timestamp: 14124132, description: 'DESTINATION SCAN', city: 'MIAMI' },
        ],
      },
    })
    const events = await new PacklinkProAdapter().getTrackingEvents(CREDS, 'DE00019732CF')
    expect(log).toEqual([{ path: 'shipments/DE00019732CF/track', params: undefined }])
    expect(events.map((e) => e.description)).toEqual(['DELIVERED', 'DESTINATION SCAN'])
    expect(events.every((e) => e.shipmentId === 'DE00019732CF')).toBe(true)
  })

  it('url-encodes the reference', async () => {
    const { log } = fake({ 'shipments/A%2FB/track': { history: [] } })
    expect(await new PacklinkProAdapter().getTrackingEvents(CREDS, 'A/B')).toEqual([])
    expect(log[0]!.path).toBe('shipments/A%2FB/track')
  })

  it('returns no events for an empty (null) body, as Tracking::fromBatch does without history', async () => {
    fake({ 'shipments/REF1/track': null })
    expect(await new PacklinkProAdapter().getTrackingEvents(CREDS, 'REF1')).toEqual([])
  })
})

describe('packlink-pro empty warehouses body', () => {
  it('lists nothing for a null body, as getUsersWarehouses does via `decodeBodyToArray() ?: array()`', async () => {
    fake({ 'clients/warehouses': null })
    expect(await new PacklinkProAdapter().listWarehouses(CREDS, { page: 1, limit: 5 })).toEqual([])
  })
})
