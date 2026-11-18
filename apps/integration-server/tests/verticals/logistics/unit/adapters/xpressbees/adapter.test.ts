/**
 * Xpressbees read methods against a fake of the documented Custom API
 * (https://documenter.getpostman.com/view/15188467/2s9YyzcxWT) that answers
 * only documented requests:
 *
 * - POST https://shipment.xpressbees.com/api/users/login {email, password}
 * - GET  https://shipment.xpressbees.com/api/courier ("No parameters are required")
 * - GET  https://shipment.xpressbees.com/api/shipments2/track/{AWB}
 *   ("No other body parameters are required")
 *
 * Every call after login sends Authorization: Bearer <token>.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { XpressbeesAdapter } from '../../../../../../src/verticals/logistics/adapters/xpressbees/index'
import { refreshCredentials } from '../../../../../../src/verticals/logistics/adapters/xpressbees/auth'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { docCourierList, docLogin, docLoginExpiresAt, docLoginRefused, docTrack } from './fixtures'

type Call = { method: 'GET' | 'POST'; path: string; params?: unknown; body?: unknown }
type Handler = (call: Call, auth: string | undefined) => unknown

let handler: Handler
let calls: Call[]
let configs: Array<{ baseURL?: string; headers?: Record<string, string> }>

const creds = { accessToken: 'tok-1' }

/** The documented routes; anything else is a 404, and extra params are refused. */
function documented(call: Call): unknown {
  if (call.params !== undefined && Object.keys(call.params as object).length > 0) {
    throw new Error(`undocumented params on ${call.path}: ${JSON.stringify(call.params)}`)
  }
  if (call.method === 'GET' && call.path === 'courier') return docCourierList
  if (call.method === 'GET' && call.path === 'shipments2/track/14344940342223') return docTrack
  throw Object.assign(new Error(`404 ${call.method} ${call.path}`), { response: { status: 404 } })
}

beforeEach(() => {
  calls = []
  configs = []
  handler = (call) => documented(call)
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

function stubLogin(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// ── Host and auth ───────────────────────────────────────────────────────────

describe('xpressbees client', () => {
  it('calls shipment.xpressbees.com/api with the bearer token', async () => {
    await new XpressbeesAdapter().listCarriers(creds, withPageSink({ page: 1, limit: 10 }))
    expect(configs[0]?.baseURL).toBe('https://shipment.xpressbees.com/api/')
    expect(configs[0]?.headers?.['Authorization']).toBe('Bearer tok-1')
  })

  it('logs in again from the stored email and password when the token is refused', async () => {
    const fetchMock = stubLogin(200, docLogin)
    handler = (call, auth) => {
      if (auth === 'Bearer stale') {
        throw Object.assign(new Error('401'), { response: { status: 401 } })
      }
      return documented(call)
    }
    const out = await new XpressbeesAdapter().listCarriers(
      { accessToken: 'stale', extra: { email: 'a@b.c', password: 'pw' } },
      withPageSink({ page: 1, limit: 50 }),
    )
    expect(out).toHaveLength(9)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(configs.at(-1)?.headers?.['Authorization']).toBe(`Bearer ${docLogin.data}`)
  })

  for (const status of [403, 404, 500]) {
    it(`does not log in again on a ${status}, even with a stored login`, async () => {
      const fetchMock = stubLogin(200, docLogin)
      handler = () => {
        throw Object.assign(new Error(String(status)), { response: { status } })
      }
      await expect(
        new XpressbeesAdapter().listCarriers(
          { accessToken: 'tok', extra: { email: 'a@b.c', password: 'pw' } },
          { page: 1, limit: 5 },
        ),
      ).rejects.toThrow(String(status))
      expect(fetchMock).not.toHaveBeenCalled()
    })
  }

  it('surfaces a refused token when no login is stored', async () => {
    handler = () => {
      throw Object.assign(new Error('401'), { response: { status: 401 } })
    }
    await expect(
      new XpressbeesAdapter().listCarriers({ accessToken: 'old-key' }, { page: 1, limit: 5 }),
    ).rejects.toThrow('401')
  })
})

describe('xpressbees credentials', () => {
  it('asks for the email and password the documented login takes', () => {
    expect(new XpressbeesAdapter().credentialFields().map((f) => f.name)).toEqual([
      'email',
      'password',
    ])
  })

  it('exchanges them at POST users/login and keeps them for re-login', async () => {
    const fetchMock = stubLogin(200, docLogin)
    const out = await new XpressbeesAdapter().exchangeCredentials({
      email: ' demo@xpressbees.com ',
      password: 'demo@123',
    })
    expect(out).toEqual({
      accessToken: docLogin.data,
      expiresAt: docLoginExpiresAt,
      extra: { email: 'demo@xpressbees.com', password: 'demo@123' },
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://shipment.xpressbees.com/api/users/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'demo@xpressbees.com',
      password: 'demo@123',
    })
  })

  it('sets no expiresAt when the token is not a JWT with an exp claim', async () => {
    stubLogin(200, { status: true, data: 'opaque-token' })
    const out = await new XpressbeesAdapter().exchangeCredentials({ email: 'a@b.c', password: 'x' })
    expect(out).toEqual({ accessToken: 'opaque-token', extra: { email: 'a@b.c', password: 'x' } })
  })

  it('has no OAuth flow: getAuthUrl and exchangeCode refuse', async () => {
    const a = new XpressbeesAdapter()
    expect(() => a.getAuthUrl('state')).toThrow(/no OAuth flow/)
    await expect(a.exchangeCode('code', 'https://r')).rejects.toThrow(/no OAuth flow/)
  })

  it('reports the documented login refusal', async () => {
    stubLogin(401, docLoginRefused)
    await expect(
      new XpressbeesAdapter().exchangeCredentials({ email: 'a@b.c', password: 'x' }),
    ).rejects.toThrow('Invalid email or password')
  })

  it('refreshes from the stored pair, and leaves a legacy key-only connection unchanged', async () => {
    stubLogin(200, docLogin)
    const fresh = await refreshCredentials({
      accessToken: 'old',
      extra: { email: 'e', password: 'p' },
    })
    expect(fresh.accessToken).toBe(docLogin.data)
    expect(fresh.expiresAt).toEqual(docLoginExpiresAt)
    const legacy = { accessToken: 'old' }
    expect(await refreshCredentials(legacy)).toBe(legacy)
  })
})

// ── Carriers ────────────────────────────────────────────────────────────────

describe('xpressbees listCarriers', () => {
  it('reads GET courier with no parameters and parses every row', async () => {
    const out = await new XpressbeesAdapter().listCarriers(
      creds,
      withPageSink({ page: 1, limit: 50 }),
    )
    expect(calls).toEqual([{ method: 'GET', path: 'courier', params: undefined }])
    expect(out.map((c) => CarrierSchema.parse(c).id)).toEqual(docCourierList.data.map((r) => r.id))
  })

  it('walks the whole unpaged list: every id once, hasMore exact (N = 2L+1)', async () => {
    const L = 4
    const seen: string[] = []
    const more: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await new XpressbeesAdapter().listCarriers(creds, params)
      seen.push(...rows.map((c) => c.id!))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore ?? true)
      expect(meta?.totalCount).toBe(9)
      expect(meta?.pagedLocally).toBe(true)
    }
    expect(more).toEqual([true, true, false])
    expect(seen).toEqual(docCourierList.data.map((r) => r.id))
  })

  it('refuses an answer without status true and a data array', async () => {
    handler = () => ({ status: false, message: 'Missing or invalid Token in request' })
    await expect(
      new XpressbeesAdapter().listCarriers(creds, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow('Missing or invalid Token in request')
  })

  it('does not read status true without a data array as an empty account', async () => {
    for (const body of [
      { status: true },
      { status: true, data: null },
      { status: true, data: {} },
    ]) {
      handler = () => body
      await expect(
        new XpressbeesAdapter().listCarriers(creds, withPageSink({ page: 1, limit: 5 })),
      ).rejects.toThrow('response has no data array')
    }
  })

  it('does not read status false as an empty account, even with an empty data array', async () => {
    handler = () => ({ status: false, data: [], message: 'No record found' })
    await expect(
      new XpressbeesAdapter().listCarriers(creds, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow('No record found')
  })
})

describe('xpressbees getCarrier', () => {
  it('reads a courier back by the id listCarriers returns', async () => {
    const c = await new XpressbeesAdapter().getCarrier(creds, '12298')
    expect(CarrierSchema.parse(c)).toMatchObject({ id: '12298', name: 'Xpressbees 1 K.G' })
    expect(calls.map((c) => c.path)).toEqual(['courier'])
  })

  it('404s an unknown id', async () => {
    await expect(new XpressbeesAdapter().getCarrier(creds, '999')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

// ── Tracking ────────────────────────────────────────────────────────────────

describe('xpressbees getTrackingEvents', () => {
  it('reads GET shipments2/track/{AWB} and maps the documented history', async () => {
    const out = await new XpressbeesAdapter().getTrackingEvents(creds, '14344940342223')
    expect(calls).toEqual([
      { method: 'GET', path: 'shipments2/track/14344940342223', params: undefined },
    ])
    expect(out.map((e) => TrackingEventSchema.parse(e).description)).toEqual([
      'Out For Pickup',
      'Data Received',
    ])
  })

  it('refuses an answer without status true', async () => {
    handler = () => ({ status: false, message: 'No record found' })
    await expect(new XpressbeesAdapter().getTrackingEvents(creds, 'X')).rejects.toThrow(
      'No record found',
    )
  })
})

// ── Refused reads ───────────────────────────────────────────────────────────

describe('xpressbees undocumented reads', () => {
  const cases: Array<[string, (a: XpressbeesAdapter) => Promise<unknown>]> = [
    ['listOrders', (a) => a.listOrders(creds, withPageSink({ page: 1, limit: 10 }))],
    ['getOrder', (a) => a.getOrder(creds, '19177931')],
    ['getLabel', (a) => a.getLabel(creds, '14344940342223')],
  ]
  for (const [name, run] of cases) {
    it(`${name} refuses with 501 NOT_SUPPORTED and sends no request`, async () => {
      const fetchMock = stubLogin(200, docLogin)
      await expect(run(new XpressbeesAdapter())).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(calls).toEqual([])
      expect(configs).toEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    })
  }
})
