/**
 * Mylerz read methods against a fake of the merchant integration API
 * (https://integration.mylerz.net/Help) that honours only documented routes
 * and parameters:
 *
 * - GET api/Orders/GetWarehouses: "URI Parameters None." / "Body Parameters None."
 * - GET api/packages/GetPackageDetails?AWB={AWB}
 * - GET api/packages/GetPackageTrackingDetailsByBarCode?barcode={barcode}
 * - POST api/packages/GetAWB {Barcode}
 *
 * Every response is a DescriptiveResponseOf... envelope (Value, CoreValue,
 * IsErrorState, ErrorDescription, ErrorMetadata). Auth is the password grant
 * the official Mylerz WooCommerce plugin runs against /token.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { MylerzAdapter } from '../../../../../../src/verticals/logistics/adapters/mylerz/index'
import { refreshCredentials } from '../../../../../../src/verticals/logistics/adapters/mylerz/auth'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'
import { docPackageDetails, docTracking, docWarehouse, envelope } from './fixtures'

type Call = { method: 'GET' | 'POST'; path: string; params?: unknown; body?: unknown }
/** `auth` is the Authorization header of the axios instance the call went through. */
type Handler = (call: Call, auth: string | undefined) => unknown

let handler: Handler
let calls: Call[]
let configs: Array<{ baseURL?: string; headers?: Record<string, string> }>

const creds = { accessToken: 'tok-1' }

beforeEach(() => {
  calls = []
  configs = []
  handler = () => {
    throw new Error('unexpected request')
  }
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    configs.push(cfg as (typeof configs)[number])
    const auth = (cfg as (typeof configs)[number]).headers?.['Authorization']
    const run = async (call: Call) => {
      calls.push(call)
      return { data: handler(call, auth) }
    }
    return {
      get: vi.fn((path: string, opts?: { params?: unknown }) =>
        run({ method: 'GET', path, params: opts?.params }),
      ),
      post: vi.fn((path: string, body: unknown) => run({ method: 'POST', path, body })),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ── Host and auth ───────────────────────────────────────────────────────────

describe('mylerz client', () => {
  it('calls the merchant integration host with the bearer token', async () => {
    handler = () => envelope([])
    await new MylerzAdapter().listWarehouses(creds, withPageSink({ page: 1, limit: 10 }))
    expect(configs[0]?.baseURL).toBe('https://integration.mylerz.net/api/')
    expect(configs[0]?.headers?.['Authorization']).toBe('bearer tok-1')
  })
})

describe('mylerz credentials', () => {
  it('asks for a username and password', () => {
    expect(new MylerzAdapter().credentialFields().map((f) => f.name)).toEqual([
      'username',
      'password',
    ])
  })

  it('exchanges them at /token with the password grant and keeps access_token', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'minted' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await new MylerzAdapter().exchangeCredentials({
      username: 'merchant',
      password: 'pw',
    })
    expect(out).toEqual({ accessToken: 'minted', extra: { username: 'merchant', password: 'pw' } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://integration.mylerz.net/token')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      username: 'merchant',
      password: 'pw',
      grant_type: 'password',
    })
  })

  it('fails on the platform error instead of storing an empty token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Login failed. Please try again.',
            }),
            { status: 400 },
          ),
      ),
    )
    await expect(
      new MylerzAdapter().exchangeCredentials({ username: 'merchant', password: 'bad' }),
    ).rejects.toThrow('Login failed. Please try again.')
  })

  it('refreshes by running the grant again from the stored pair', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 }),
    )
    const out = await refreshCredentials(
      { accessToken: 'old', extra: { username: 'merchant', password: 'pw' } },
      fetchMock as unknown as typeof fetch,
    )
    expect(out.accessToken).toBe('fresh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('the adapter refresh runs that grant', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await new MylerzAdapter().refreshCredentials({
      accessToken: 'old',
      extra: { username: 'merchant', password: 'pw' },
    })
    expect(out.accessToken).toBe('fresh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves a connection without a stored pair unchanged and sends nothing', async () => {
    const fetchMock = vi.fn()
    const legacy = { accessToken: 'old' }
    const out = await refreshCredentials(legacy, fetchMock as unknown as typeof fetch)
    expect(out).toBe(legacy)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ── Re-grant on 401 ─────────────────────────────────────────────────────────
// The token response carries no expiry, so nothing refreshes on a schedule.
// Like the official plugin, the client requests a new token from the stored
// pair when the platform refuses the old one, and sends the call again once.

function unauthorized(): Error {
  return Object.assign(new Error('Request failed with status code 401'), {
    response: { status: 401 },
  })
}

describe('mylerz re-grant on 401', () => {
  const stored = { accessToken: 'stale', extra: { username: 'merchant', password: 'pw' } }

  it('requests a new token and sends the call again with it', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    handler = (_call, auth) => {
      if (auth === 'bearer stale') throw unauthorized()
      return envelope([docWarehouse('Cairo')])
    }
    const out = await new MylerzAdapter().listWarehouses(
      stored,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(out.map((w) => w.id)).toEqual(['Cairo'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://integration.mylerz.net/token',
    )
    expect(calls).toHaveLength(2)
  })

  it('re-grants once: a second 401 surfaces', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'fresh' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    handler = () => {
      throw unauthorized()
    }
    await expect(
      new MylerzAdapter().listWarehouses(stored, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ response: { status: 401 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })

  it('surfaces the 401 when the connection has no stored pair', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    handler = () => {
      throw unauthorized()
    }
    await expect(
      new MylerzAdapter().listWarehouses(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ response: { status: 401 } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
  })

  it('does not re-grant on other errors', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    handler = () => {
      throw Object.assign(new Error('boom'), { response: { status: 500 } })
    }
    await expect(
      new MylerzAdapter().listWarehouses(stored, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow('boom')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ── Refused lists ───────────────────────────────────────────────────────────

describe('mylerz shipments', () => {
  it('listShipments refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(
      new MylerzAdapter().listShipments(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('getShipment refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(new MylerzAdapter().getShipment(creds, 'X')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})

// ── Warehouses ──────────────────────────────────────────────────────────────

/** GetWarehouses takes no URI or body parameters and returns every row under Value. */
function warehousesFake(names: string[]): Handler {
  return (call) => {
    if (call.method !== 'GET' || call.path !== 'Orders/GetWarehouses') {
      throw new Error(`unexpected ${call.method} ${call.path}`)
    }
    if (call.params !== undefined) throw new Error('GetWarehouses documents no parameters')
    return envelope(names.map((n) => docWarehouse(n)))
  }
}

describe('mylerz listWarehouses', () => {
  it('GETs Orders/GetWarehouses with no parameters and parses each row', async () => {
    handler = warehousesFake(['Cairo', 'Giza'])
    const out = await new MylerzAdapter().listWarehouses(
      creds,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(calls).toEqual([{ method: 'GET', path: 'Orders/GetWarehouses', params: undefined }])
    expect(out.map((w) => WarehouseSchema.parse(w).id)).toEqual(['Cairo', 'Giza'])
  })

  it('walks 2L+1 rows in pages of L, each row once, hasMore exact', async () => {
    const L = 2
    const names = ['w1', 'w2', 'w3', 'w4', 'w5']
    handler = warehousesFake(names)
    const adapter = new MylerzAdapter()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const got = await adapter.listWarehouses(creds, params)
      got.forEach((w) => seen.push(WarehouseSchema.parse(w).id!))
      hasMore.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(names)
    expect(hasMore).toEqual([true, true, false])
  })

  it('answers an empty page, and no more, when Value is null', async () => {
    handler = () => envelope(null)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new MylerzAdapter().listWarehouses(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws the platform error when IsErrorState is set', async () => {
    handler = () => ({
      ...envelope(null),
      IsErrorState: true,
      ErrorDescription: 'Invalid merchant',
    })
    await expect(
      new MylerzAdapter().listWarehouses(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow('Invalid merchant')
  })
})

// ── Single reads ────────────────────────────────────────────────────────────

describe('mylerz getOrder', () => {
  it('GETs packages/GetPackageDetails with AWB and maps the Value', async () => {
    handler = (call) => {
      if (call.path !== 'packages/GetPackageDetails') throw new Error(`unexpected ${call.path}`)
      expect(call.params).toEqual({ AWB: '12345678901234' })
      return envelope(docPackageDetails('12345678901234'))
    }
    const out = OrderSchema.parse(await new MylerzAdapter().getOrder(creds, '12345678901234'))
    expect(out.id).toBe('12345678901234')
    expect(out.orderNumber).toBe('sample string 22')
  })

  it('takes the id from the documented Barcode the Value returns', async () => {
    handler = () => envelope(docPackageDetails('99999999999999'))
    const out = await new MylerzAdapter().getOrder(creds, '12345678901234')
    expect(OrderSchema.parse(out).id).toBe('99999999999999')
  })

  it('answers 404 when the Value is empty', async () => {
    handler = () => envelope(null)
    await expect(new MylerzAdapter().getOrder(creds, 'X')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('mylerz getTrackingEvents', () => {
  it('GETs packages/GetPackageTrackingDetailsByBarCode with barcode and flattens PackageStatusLog', async () => {
    handler = (call) => {
      if (call.path !== 'packages/GetPackageTrackingDetailsByBarCode') {
        throw new Error(`unexpected ${call.path}`)
      }
      expect(call.params).toEqual({ barcode: '12345678901234' })
      return envelope(docTracking())
    }
    const out = await new MylerzAdapter().getTrackingEvents(creds, '12345678901234')
    expect(out.map((e) => TrackingEventSchema.parse(e).id)).toEqual([
      '12345678901234:1:2026-09-24T16:23:33.0342167+03:00',
      '12345678901234:2:2026-09-25T10:00:00+03:00',
    ])
  })
})

describe('mylerz getLabel', () => {
  it('POSTs packages/GetAWB with the Barcode and returns the base64 PDF', async () => {
    handler = (call) => {
      if (call.method !== 'POST' || call.path !== 'packages/GetAWB') {
        throw new Error(`unexpected ${call.method} ${call.path}`)
      }
      expect(call.body).toEqual({ Barcode: '12345678901234' })
      return envelope('QEA=')
    }
    const out = LabelSchema.parse(await new MylerzAdapter().getLabel(creds, '12345678901234'))
    expect(out.base64).toBe('QEA=')
    expect(out.format).toBe('PDF')
  })

  it('throws the platform error when IsErrorState is set', async () => {
    handler = () => ({ ...envelope(null), IsErrorState: true, ErrorDescription: 'Wrong barcode' })
    await expect(new MylerzAdapter().getLabel(creds, 'X')).rejects.toThrow('Wrong barcode')
  })
})
