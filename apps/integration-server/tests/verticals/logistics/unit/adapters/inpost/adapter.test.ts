/**
 * InPost on ShipX: host, auth, request shape and list paging.
 *
 * - Host "https://api-shipx-pl.easypack24.net", static `Authorization: Bearer
 *   <token>`, organization id in the path
 *   (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153477/).
 * - Collections carry count/page/per_page/items and page with `page` /
 *   `per_page` (same page).
 * - Dispatch orders: GET /v1/organizations/:organization_id/dispatch_orders,
 *   GET /v1/dispatch_orders/:id (page 18153482); sort_by / sort_order
 *   (page 18153497).
 * - GET /v1/services (page 18153486), GET /v1/tracking/:tracking_number
 *   (page 18153479).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { InPostAdapter } from '../../../../../../src/verticals/logistics/adapters/inpost/index'
import { SERVICES, dispatchOrder, tracking } from './fixtures'

const CREDS = { accessToken: 'shipx-token', extra: { organizationId: '1234' } }
const CALL_BUDGET = 50
const DOCUMENTED_LIST_PARAMS = ['page', 'per_page', 'sort_by', 'sort_order']

interface Call {
  path: string
  params: Record<string, unknown>
}

/**
 * A fake ShipX. The dispatch-order list honours only the documented
 * parameters, sorts only by the documented `sort_by=id` + `sort_order`, and
 * answers with a documented collection. `serverMax` models a server that
 * serves fewer rows per page than asked (none is documented; it proves the
 * adapter reads `per_page` back instead of assuming).
 */
function fakeShipX(opts: { orders?: number; serverMax?: number; servicesBody?: unknown } = {}) {
  const orders = Array.from({ length: opts.orders ?? 0 }, (_, i) =>
    dispatchOrder({
      id: 1000 + i,
      created_at: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00+01:00`,
    }),
  )
  const calls: Call[] = []
  const created: Array<{ baseURL?: string; headers?: Record<string, string> }> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (calls.length >= CALL_BUDGET) throw new Error('call budget exceeded')
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    if (path === '/services') return { data: 'servicesBody' in opts ? opts.servicesBody : SERVICES }
    if (path === '/organizations/1234/dispatch_orders') {
      const extra = Object.keys(params).filter((k) => !DOCUMENTED_LIST_PARAMS.includes(k))
      if (extra.length) throw new Error(`undocumented params sent: ${extra.join(',')}`)
      // Default order is created_at descending; only the documented sort by id is honoured.
      const sorted =
        params['sort_by'] === 'id'
          ? [...orders].sort((a, b) =>
              params['sort_order'] === 'asc'
                ? Number(a.id) - Number(b.id)
                : Number(b.id) - Number(a.id),
            )
          : [...orders].reverse()
      const page = Number(params['page'] ?? 1)
      const asked = Number(params['per_page'] ?? 30)
      const perPage = Math.min(asked, opts.serverMax ?? Infinity)
      const start = (page - 1) * perPage
      return {
        data: {
          href: 'https://api-shipx-pl.easypack24.net/v1/organizations/1234/dispatch_orders',
          count: orders.length,
          page,
          per_page: perPage,
          items: sorted.slice(start, start + perPage),
        },
      }
    }
    if (path === '/dispatch_orders/3223738') return { data: dispatchOrder() }
    if (path === '/tracking/632085946340007012341234') return { data: tracking() }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, string>
  }) => {
    created.push(cfg)
    return {
      get,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      defaults: { headers: { common: {} } },
    }
  }) as never)
  return { calls, created }
}

const adapter = () => new InPostAdapter()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('inpost ShipX host and auth', () => {
  it('sends the static token as a Bearer header to the ShipX production host', async () => {
    const { created } = fakeShipX()
    await adapter().listCarriers(CREDS, { page: 1, limit: 10 })
    expect(created[0].baseURL).toBe('https://api-shipx-pl.easypack24.net/v1')
    expect(created[0].headers?.['Authorization']).toBe('Bearer shipx-token')
  })

  it('collects a token and an organization id, and stores the id on the connection', async () => {
    const a = adapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual(['apiToken', 'organizationId'])
    await expect(
      a.exchangeCredentials({ apiToken: ' tok ', organizationId: ' 42 ' }),
    ).resolves.toEqual({ accessToken: 'tok', extra: { organizationId: '42' } })
    await expect(a.exchangeCredentials({ apiToken: 'tok', organizationId: '' })).rejects.toThrow(
      /Organization ID is required/,
    )
    await expect(a.exchangeCredentials({ apiToken: '', organizationId: '1' })).rejects.toThrow(
      /token is required/,
    )
  })

  it('has no OAuth flow: refresh keeps the static token', async () => {
    const a = adapter()
    expect(() => a.getAuthUrl('state')).toThrow(/static API token/)
    await expect(a.exchangeCode('c', 'r')).rejects.toThrow(/static API token/)
    await expect(a.refreshCredentials(CREDS)).resolves.toBe(CREDS)
  })
})

describe('inpost listManifests (GET /v1/organizations/:organization_id/dispatch_orders)', () => {
  it('sends the caller page and limit as page/per_page, sorted by id ascending', async () => {
    const { calls } = fakeShipX({ orders: 5 })
    await adapter().listManifests(CREDS, { page: 2, limit: 2 })
    expect(calls).toEqual([
      {
        path: '/organizations/1234/dispatch_orders',
        params: { page: 2, per_page: 2, sort_by: 'id', sort_order: 'asc' },
      },
    ])
  })

  it('walks N = 2L+1 orders once each, with hasMore exact from count', async () => {
    const L = 3
    fakeShipX({ orders: 2 * L + 1 })
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 4; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter().listManifests(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      const meta = readUpstreamPage(params)
      hasMore.push(meta?.hasMore)
      expect(meta?.totalCount).toBe(2 * L + 1)
      expect(meta?.pageSize).toBeUndefined()
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(1000 + i)))
    expect(hasMore).toEqual([true, true, false, false])
  })

  it('ends exactly when the total is a multiple of the page size', async () => {
    fakeShipX({ orders: 4 })
    const params = withPageSink({ page: 2, limit: 2 } as QueryParams)
    expect(await adapter().listManifests(CREDS, params)).toHaveLength(2)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reports the per_page the server served when it is below the ask', async () => {
    fakeShipX({ orders: 7, serverMax: 2 })
    const params = withPageSink({ page: 1, limit: 5 } as QueryParams)
    const rows = await adapter().listManifests(CREDS, params)
    expect(rows).toHaveLength(2)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 2, hasMore: true, totalCount: 7 })
  })

  it('refuses with 501 and sends nothing when the connection has no organization id', async () => {
    const { calls } = fakeShipX({ orders: 3 })
    await expect(
      adapter().listManifests({ accessToken: 'shipx-token' }, { page: 1, limit: 2 }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })

  it('reads one dispatch order back by id at GET /v1/dispatch_orders/:id', async () => {
    const { calls } = fakeShipX()
    const m = await adapter().getManifest(CREDS, '3223738')
    expect(calls.map((c) => c.path)).toEqual(['/dispatch_orders/3223738'])
    expect(m.id).toBe('3223738')
  })
})

describe('inpost listCarriers (GET /v1/services, one carrier paged locally)', () => {
  it('serves the single carrier once across pages, with hasMore exact', async () => {
    const { calls } = fakeShipX()
    const p1 = withPageSink({ page: 1, limit: 1 } as QueryParams)
    const p2 = withPageSink({ page: 2, limit: 1 } as QueryParams)
    const first = await adapter().listCarriers(CREDS, p1)
    const second = await adapter().listCarriers(CREDS, p2)
    expect(first.map((c) => c.id)).toEqual(['inpost'])
    expect(second).toEqual([])
    expect(readUpstreamPage(p1)).toMatchObject({ totalCount: 1, hasMore: false })
    expect(calls.every((c) => c.path === '/services' && Object.keys(c.params).length === 0)).toBe(
      true,
    )
  })

  it('a /services body that is not the documented array yields the carrier with no services', async () => {
    fakeShipX({ servicesBody: { error: 'unexpected' } })
    const [carrier] = await adapter().listCarriers(CREDS, { page: 1, limit: 10 })
    expect(carrier?.id).toBe('inpost')
    expect(carrier?.services).toEqual([])
  })

  it('getCarrier answers only for the inpost id', async () => {
    const { calls } = fakeShipX()
    expect((await adapter().getCarrier(CREDS, 'inpost')).services).toHaveLength(2)
    await expect(adapter().getCarrier(CREDS, 'dhl')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toHaveLength(1)
  })
})

describe('inpost warehouses (dispatch points) are refused', () => {
  it('listWarehouses throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { calls, created } = fakeShipX()
    await expect(adapter().listWarehouses(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
    expect(created).toHaveLength(0)
  })

  it('the refusal names the archived dispatch-point page, not an unproven claim', async () => {
    fakeShipX()
    const err = await adapter()
      .listWarehouses(CREDS, { page: 1, limit: 10 })
      .catch((e: unknown) => e)
    expect((err as Error).message).toContain('[1.2.5] Dispatch points')
    expect((err as Error).message).not.toContain('only created implicitly')
  })

  it('getWarehouse throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { calls } = fakeShipX()
    await expect(adapter().getWarehouse(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })
})

describe('inpost getTrackingEvents (GET /v1/tracking/:tracking_number)', () => {
  it('reads the documented tracking path and returns its history', async () => {
    const { calls } = fakeShipX()
    const events = await adapter().getTrackingEvents(CREDS, '632085946340007012341234')
    expect(calls.map((c) => c.path)).toEqual(['/tracking/632085946340007012341234'])
    expect(events.map((e) => e.status)).toEqual([
      'DELIVERED',
      'AVAILABLE_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
    ])
  })
})
