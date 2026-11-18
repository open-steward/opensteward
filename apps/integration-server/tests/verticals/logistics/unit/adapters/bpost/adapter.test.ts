/**
 * bpost: host, auth, request shape and list paging, per the bpack integration
 * manual v3.3.35 (https://bpost.freshdesk.com/helpdesk/attachments/4176380323).
 *
 * - §C.3.2.3 "ServiceEndPoint is: https://shm-rest.bpost.cloud/services/shm";
 *   §C.3.2.6 "Authorization: Basic External-Id:passphrase", with the worked
 *   example Etailer1 / QuiteLongPassPhrase -> "Basic RXRhaWxlcjE6UXVpdGVMb25nUGFzc1BocmFzZQ==".
 * - §C.3.6 GET /{accountId}/productconfig, "Accept:
 *   application/vnd.bpost.shm-productConfiguration-v3.1+XML"; no paging parameters.
 * - §C.3.5 GET /{accountId}/orders/{reference}; Accept
 *   application/vnd.bpost.shm-order-v3.5+XML (SHM API v5 examples).
 * - §E.3.4 GET https://api.parcel.bpost.cloud/services/trackedmail/item/{item_nb}/trackingInfo,
 *   Basic auth "The username is the Account ID. The password can be requested
 *   by sending an e-mail to esolutions@bpost.be".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { BpostAdapter } from '../../../../../../src/verticals/logistics/adapters/bpost/index'
import {
  ITEM_CODE,
  ITEM_TRACKING,
  ORDER_INFO,
  ORDER_REFERENCE,
  PRODUCT_CONFIGURATION,
} from './fixtures'

const CREDS = { accessToken: 'QuiteLongPassPhrase', extra: { accountId: 'Etailer1' } }
const TRACKING_CREDS = {
  accessToken: 'QuiteLongPassPhrase',
  extra: { accountId: 'Etailer1', trackingPassword: 'track-secret' },
}
const CALL_BUDGET = 50

interface Call {
  baseURL?: string
  path: string
  accept?: string
  params?: unknown
}

/**
 * A fake bpost. It answers only the documented paths, and only with the
 * documented media type in Accept; any query parameter is an error, since
 * none of these GETs documents one.
 */
function fakeBpost() {
  const calls: Call[] = []
  const created: Array<{ baseURL?: string; headers?: Record<string, string> }> = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, string>
  }) => {
    created.push(cfg)
    const get = vi.fn(
      async (path: string, opts?: { params?: unknown; headers?: Record<string, string> }) => {
        if (calls.length >= CALL_BUDGET) throw new Error('call budget exceeded')
        const accept = opts?.headers?.['Accept']
        calls.push({ baseURL: cfg.baseURL, path, accept, params: opts?.params })
        if (opts?.params !== undefined) throw new Error('undocumented query parameters sent')
        const url = `${cfg.baseURL}${path}`
        if (url === 'https://shm-rest.bpost.cloud/services/shm/Etailer1/productconfig') {
          if (accept !== 'application/vnd.bpost.shm-productConfiguration-v3.1+XML') {
            throw Object.assign(new Error('406 Not Acceptable'), { status: 406 })
          }
          return { data: PRODUCT_CONFIGURATION }
        }
        if (
          url ===
          `https://shm-rest.bpost.cloud/services/shm/Etailer1/orders/${encodeURIComponent(ORDER_REFERENCE)}`
        ) {
          if (accept !== 'application/vnd.bpost.shm-order-v3.5+XML') {
            throw Object.assign(new Error('406 Not Acceptable'), { status: 406 })
          }
          return { data: ORDER_INFO }
        }
        if (
          url ===
          `https://api.parcel.bpost.cloud/services/trackedmail/item/${ITEM_CODE}/trackingInfo`
        ) {
          return { data: ITEM_TRACKING }
        }
        throw new Error(`unexpected url ${url}`)
      },
    )
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

const adapter = () => new BpostAdapter()

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bpost Shipping Manager host and auth', () => {
  it('sends the documented Basic header to the account-scoped Shipping Manager endpoint', async () => {
    const { created } = fakeBpost()
    await adapter().listCarriers(CREDS, { page: 1, limit: 10 })
    expect(created[0]?.baseURL).toBe('https://shm-rest.bpost.cloud/services/shm/Etailer1')
    // The manual's own worked example.
    expect(created[0]?.headers?.['Authorization']).toBe(
      'Basic RXRhaWxlcjE6UXVpdGVMb25nUGFzc1BocmFzZQ==',
    )
  })

  it('collects the account id, passphrase and optional tracking password', async () => {
    const a = adapter()
    expect(a.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['accountId', true],
      ['passphrase', true],
      ['trackingPassword', false],
    ])
    await expect(
      a.exchangeCredentials({ accountId: ' 123456 ', passphrase: ' pass ' }),
    ).resolves.toEqual({ accessToken: 'pass', extra: { accountId: '123456' } })
    await expect(
      a.exchangeCredentials({ accountId: '1', passphrase: 'p', trackingPassword: 't' }),
    ).resolves.toEqual({ accessToken: 'p', extra: { accountId: '1', trackingPassword: 't' } })
    await expect(a.exchangeCredentials({ accountId: '', passphrase: 'p' })).rejects.toThrow(
      /account ID is required/,
    )
    await expect(a.exchangeCredentials({ accountId: '1', passphrase: '' })).rejects.toThrow(
      /passphrase is required/,
    )
  })

  it('has no OAuth flow: refresh keeps the static credentials', async () => {
    const a = adapter()
    expect(() => a.getAuthUrl('state')).toThrow(/Basic auth/)
    await expect(a.exchangeCode('c', 'r')).rejects.toThrow(/Basic auth/)
    await expect(a.refreshCredentials(CREDS)).resolves.toBe(CREDS)
  })

  it('encodes the account id in the base URL', async () => {
    const { created } = fakeBpost()
    await adapter()
      .listCarriers({ accessToken: 'p', extra: { accountId: 'a/b c' } }, { page: 1, limit: 10 })
      .catch(() => undefined)
    expect(created[0]?.baseURL).toBe('https://shm-rest.bpost.cloud/services/shm/a%2Fb%20c')
  })

  it('refuses a connection without an account id before sending anything', async () => {
    const { calls, created } = fakeBpost()
    await expect(
      adapter().listCarriers({ accessToken: 'old-oauth-token' }, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
    expect(created).toHaveLength(0)
  })
})

describe('bpost listCarriers (GET /{accountId}/productconfig, one carrier paged locally)', () => {
  it('asks for the documented productConfiguration media type with no query parameters', async () => {
    const { calls } = fakeBpost()
    const [carrier] = await adapter().listCarriers(CREDS, { page: 1, limit: 10 })
    expect(calls).toEqual([
      {
        baseURL: 'https://shm-rest.bpost.cloud/services/shm/Etailer1',
        path: '/productconfig',
        accept: 'application/vnd.bpost.shm-productConfiguration-v3.1+XML',
        params: undefined,
      },
    ])
    expect(carrier?.id).toBe('bpost')
    expect(carrier?.services).toHaveLength(8)
  })

  it('serves the single carrier once across pages, with hasMore exact', async () => {
    fakeBpost()
    const seen: string[] = []
    const reports = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 1 } as QueryParams)
      const rows = await adapter().listCarriers(CREDS, params)
      seen.push(...rows.map((c) => c.id!))
      reports.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(['bpost'])
    expect(reports[0]).toMatchObject({ totalCount: 1, hasMore: false, pagedLocally: true })
    expect(reports[1]).toMatchObject({ totalCount: 1, hasMore: false })
  })

  it('getCarrier answers only for the bpost id', async () => {
    const { calls } = fakeBpost()
    expect((await adapter().getCarrier(CREDS, 'bpost')).services).toHaveLength(8)
    await expect(adapter().getCarrier(CREDS, 'dhl')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toHaveLength(1)
  })

  it('getRates reads the same documented product configuration', async () => {
    const { calls } = fakeBpost()
    const rates = await adapter().getRates(CREDS, {
      originAddress: {},
      destinationAddress: {},
      packages: [{ weight: { value: 1, unit: 'kg' } }],
    })
    expect(calls.map((c) => c.path)).toEqual(['/productconfig'])
    expect(rates.find((r) => r.serviceName === 'bpack@bpost')?.totalAmount).toBe(400)
  })
})

describe('bpost getOrder (GET /{accountId}/orders/{reference})', () => {
  it('fetches the order by its encoded reference with the order media type', async () => {
    const { calls } = fakeBpost()
    const order = await adapter().getOrder(CREDS, ORDER_REFERENCE)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.path).toBe(`/orders/${encodeURIComponent(ORDER_REFERENCE)}`)
    expect(calls[0]?.accept).toBe('application/vnd.bpost.shm-order-v3.5+XML')
    expect(order.id).toBe(ORDER_REFERENCE)
    expect(order.status).toBe('PENDING')
  })
})

describe('bpost getTrackingEvents (GET trackedmail/item/{item_nb}/trackingInfo)', () => {
  it('calls the trackingInfo host with the account id and the tracking password', async () => {
    const { calls, created } = fakeBpost()
    const events = await adapter().getTrackingEvents(TRACKING_CREDS, ITEM_CODE)
    expect(created[0]?.baseURL).toBe('https://api.parcel.bpost.cloud/services/trackedmail')
    expect(created[0]?.headers?.['Authorization']).toBe(
      `Basic ${Buffer.from('Etailer1:track-secret').toString('base64')}`,
    )
    expect(calls.map((c) => c.path)).toEqual([`/item/${ITEM_CODE}/trackingInfo`])
    expect(events.map((e) => e.status)).toEqual(['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'])
  })

  it('encodes the item number in the path', async () => {
    const { calls } = fakeBpost()
    await adapter()
      .getTrackingEvents(TRACKING_CREDS, '32/32 1')
      .catch(() => undefined)
    expect(calls[0]?.path).toBe('/item/32%2F32%201/trackingInfo')
  })

  it('refuses without the tracking password, before sending anything', async () => {
    const { calls, created } = fakeBpost()
    const err = await adapter()
      .getTrackingEvents(CREDS, ITEM_CODE)
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toContain('esolutions@bpost.be')
    expect(calls).toHaveLength(0)
    expect(created).toHaveLength(0)
  })
})
