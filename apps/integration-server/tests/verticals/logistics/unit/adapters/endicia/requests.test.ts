/**
 * Endicia (SERA) read requests: host, paths and parameters, and listCarriers
 * paging.
 *
 * First-party reference: https://developer.stamps.com/rest-api/reference/serav1.html
 *
 *   "SERA
 *    Staging: https://api.testing.stampsendicia.com/sera
 *    Production: https://api.stampsendicia.com/sera"
 *
 *   GET /v1/carrier-services  "Get All Available Carrier Services"
 *     query: ship_date ("An optional query parameter to customize the response
 *     to the services and rules available on a specific date"); 200 body:
 *     { shipping_options: [...] }. No page, offset, limit or cursor.
 *
 *   GET /v1/tracking  "Track a Package"
 *     query: carrier, tracking_number.
 *
 *   "The application can begin calling SERA using the access_token value in
 *    the Authorization header preceded by the word Bearer"
 *
 * The adapter used to call https://api.endicia.com/v1/, a host that does not
 * resolve, and GET tracking/{number}, a path SERA does not have.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { EndiciaAdapter } from '../../../../../../src/verticals/logistics/adapters/endicia/index'

const CREDS = { accessToken: 'sera-access-token' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

const DOCUMENTED_QUERY: Record<string, string[]> = {
  'carrier-services': ['ship_date'],
  tracking: ['carrier', 'tracking_number'],
}

const carriers = (count: number) =>
  Array.from({ length: count }, (_, i) => `carrier_${String(i + 1).padStart(2, '0')}`)

/**
 * A fake SERA that answers only the documented read paths, rejects any query
 * parameter the reference does not list, and returns every shipping option in
 * one response, as the real endpoint does.
 */
function fakeSera(total = N) {
  let calls = 0
  const create = vi.spyOn(axios, 'create')
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const allowed = DOCUMENTED_QUERY[path]
    if (!allowed) throw new Error(`404: undocumented path ${path}`)
    const bad = Object.keys(config?.params ?? {}).filter((k) => !allowed.includes(k))
    if (bad.length) throw new Error(`400: undocumented query parameters ${bad.join(',')}`)
    if (path === 'carrier-services') {
      return {
        data: {
          shipping_options: carriers(total).map((carrier) => ({
            carrier,
            services: [{ service_type: `${carrier}_ground`, service_name: 'Ground' }],
          })),
        },
      }
    }
    return {
      data: {
        tracking_number: config?.params?.tracking_number,
        status_code: 'in_transit',
        tracking_events: [{ occurred_at: '2026-09-23T14:05:00Z', event_description: 'Departed' }],
      },
    }
  })
  create.mockReturnValue({ get, post: vi.fn(), delete: vi.fn() } as never)
  return { get, create }
}

afterEach(() => vi.restoreAllMocks())

describe('Endicia SERA client', () => {
  it('targets the documented production SERA base with a Bearer access token', async () => {
    const { create } = fakeSera()
    await new EndiciaAdapter().listCarriers(CREDS, { page: 1, limit: L })
    const config = create.mock.calls[0][0] as { baseURL: string; headers: Record<string, string> }
    expect(config.baseURL).toBe('https://api.stampsendicia.com/sera/v1/')
    expect(config.headers.Authorization).toBe('Bearer sera-access-token')
  })

  it('targets the documented staging SERA base when the adapter is configured for sandbox', async () => {
    const { create } = fakeSera()
    await new EndiciaAdapter({ sandbox: true }).listCarriers(CREDS, { page: 1, limit: L })
    const config = create.mock.calls[0][0] as { baseURL: string }
    expect(config.baseURL).toBe('https://api.testing.stampsendicia.com/sera/v1/')
  })
})

describe('Endicia listCarriers paging', () => {
  it('N = 2L+1 carriers: pages 1..3 at limit L return every id once, with exact hasMore', async () => {
    const { get } = fakeSera(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await new EndiciaAdapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore)
      expect(meta).toMatchObject({ totalCount: N, pagedLocally: true })
    }
    expect(seen).toEqual(carriers(N))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
    for (const call of get.mock.calls) {
      expect(call[0]).toBe('carrier-services')
      expect(call[1]?.params).toBeUndefined()
    }
  })

  it('a page past the end is empty and reports no more', async () => {
    fakeSera(N)
    const params = withPageSink({ page: 4, limit: L })
    expect(await new EndiciaAdapter().listCarriers(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('Endicia getTrackingEvents', () => {
  it('calls GET /v1/tracking with the tracking_number query parameter', async () => {
    const { get } = fakeSera()
    const events = await new EndiciaAdapter().getTrackingEvents(CREDS, '9400111899223197428490')
    expect(get).toHaveBeenCalledWith('tracking', {
      params: { tracking_number: '9400111899223197428490' },
    })
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('9400111899223197428490')
  })

  it('forwards the documented carrier parameter when the caller names one', async () => {
    const { get } = fakeSera()
    const events = await new EndiciaAdapter().getTrackingEvents(CREDS, '1Z999', 'ups')
    expect(get).toHaveBeenCalledWith('tracking', {
      params: { tracking_number: '1Z999', carrier: 'ups' },
    })
    expect(events[0].carrierId).toBe('ups')
  })
})
