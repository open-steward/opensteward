/**
 * Karrio is self-hosted. The API reference (https://docs.karrio.io/reference/openapi,
 * "Authentication") shows a per-instance host and the Token header:
 *   "$ curl https://instance.api.com/v1/shipments -u key_xxxxxx:"
 *   "use -H "Authorization: Token key_xxxxxx" instead"
 *   "All API requests must be made over HTTPS."
 * The adapter used to call a fixed https://api.karrio.io/v1/, which does not
 * resolve. Each connection now carries its instance URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver, withPageSink } from '@opensteward/shared'
import { KarrioAdapter } from '../../../../../../src/verticals/logistics/adapters/karrio/index'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '10.0.0.5' }]
const HOST = 'https://karrio.acme.example'
const CREDS = { accessToken: 'key_abc', extra: { baseUrl: HOST } }

/** Documented "Retrieves a package tracker" 200 body, placeholders filled in. */
const TRACKER = {
  id: 'trk_1f2e3d',
  carrier_name: 'ups',
  carrier_id: 'ups-main',
  tracking_number: '1Z 999/AA',
  events: [
    { date: '2024-03-02', description: 'Departed', location: 'X', code: 'DP', time: '10:15 AM' },
  ],
  delivered: false,
  test_mode: false,
  status: 'in_transit',
  object_type: 'tracker',
}

function fakeHttp(data: unknown = { count: 0, next: null, previous: null, results: [] }) {
  const http = {
    get: vi.fn().mockResolvedValue({ data }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn(),
    delete: vi.fn(),
  }
  const create = vi.spyOn(axios, 'create').mockReturnValue(http as never)
  return { http, create }
}

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(PUBLIC_DNS)
})
afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('karrio per-customer instance', () => {
  it('the Connect form asks for the API key and the instance URL', () => {
    expect(new KarrioAdapter().credentialFields()).toEqual([
      expect.objectContaining({ name: 'apiKey', type: 'password', required: true }),
      expect.objectContaining({ name: 'baseUrl', type: 'url', required: true }),
    ])
  })

  it('exchangeCredentials stores the normalised https instance on extra.baseUrl', async () => {
    const a = new KarrioAdapter()
    await expect(
      a.exchangeCredentials({ apiKey: ' key_abc ', baseUrl: 'karrio.acme.example/v1/' }),
    ).resolves.toEqual({ accessToken: 'key_abc', extra: { baseUrl: HOST } })
    await expect(
      a.exchangeCredentials({ apiKey: 'k', baseUrl: 'https://acme.example/karrio/' }),
    ).resolves.toEqual({ accessToken: 'k', extra: { baseUrl: 'https://acme.example/karrio' } })
  })

  it('exchangeCredentials refuses a missing, non-https or userinfo URL', async () => {
    const a = new KarrioAdapter()
    await expect(a.exchangeCredentials({ apiKey: 'k', baseUrl: '' })).rejects.toThrow(/required/)
    await expect(
      a.exchangeCredentials({ apiKey: 'k', baseUrl: 'http://karrio.acme.example' }),
    ).rejects.toThrow(/https/)
    await expect(
      a.exchangeCredentials({ apiKey: 'k', baseUrl: 'https://u:p@karrio.acme.example' }),
    ).rejects.toThrow(/credentials/)
    await expect(a.exchangeCredentials({ apiKey: 'k', baseUrl: 'https://karrio' })).rejects.toThrow(
      /not a valid URL/,
    )
  })

  it('requests go to <instance>/v1/ with the documented Token header', async () => {
    const { http, create } = fakeHttp()
    await new KarrioAdapter().listShipments(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: `${HOST}/v1/`,
        headers: expect.objectContaining({ Authorization: 'Token key_abc' }),
      }),
    )
    expect(http.get).toHaveBeenCalledWith('shipments', { params: { limit: 5, offset: 0 } })
  })

  it('falls back to the deployment baseUrl config when the connection has none', async () => {
    const { create } = fakeHttp()
    await new KarrioAdapter({ baseUrl: 'https://ops.example/' }).listOrders(
      { accessToken: 'key_abc' },
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://ops.example/v1/' }),
    )
  })

  it('with no instance at all, refuses before any request', async () => {
    const { http, create } = fakeHttp()
    await expect(
      new KarrioAdapter().listShipments({ accessToken: 'key_abc' }, { page: 1, limit: 5 }),
    ).rejects.toThrow(/no Karrio API URL/)
    expect(create).not.toHaveBeenCalled()
    expect(http.get).not.toHaveBeenCalled()
  })

  it('an instance resolving to a private address never receives the key', async () => {
    setDnsResolver(PRIVATE_DNS)
    const { http } = fakeHttp()
    await expect(new KarrioAdapter().listCarriers(CREDS, { page: 1, limit: 5 })).rejects.toThrow()
    expect(http.get).not.toHaveBeenCalled()
  })
})

describe('karrio getTrackingEvents', () => {
  it('reads GET /v1/trackers/{id_or_tracking_number}, sending nothing else', async () => {
    const { http } = fakeHttp(TRACKER)
    const events = await new KarrioAdapter().getTrackingEvents(CREDS, '1Z 999/AA')
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.get).toHaveBeenCalledWith('trackers/1Z%20999%2FAA', { params: undefined })
    expect(http.post).not.toHaveBeenCalled()
    expect(events.map((e) => TrackingEventSchema.parse(e).description)).toEqual(['Departed'])
  })
})

describe('karrio listCarriers', () => {
  it('reads the account carrier connections, GET /v1/connections', async () => {
    const { http } = fakeHttp({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 'car_1',
          object_type: 'carrier-connection',
          carrier_name: 'ups',
          display_name: 'UPS',
          carrier_id: 'ups-main',
          capabilities: ['shipping'],
          is_system: false,
          active: true,
          test_mode: false,
        },
      ],
    })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new KarrioAdapter().listCarriers(CREDS, params)
    expect(http.get).toHaveBeenCalledWith('connections', { params: { limit: 10, offset: 0 } })
    expect(rows.map((r) => r.id)).toEqual(['ups-main'])
  })
})
