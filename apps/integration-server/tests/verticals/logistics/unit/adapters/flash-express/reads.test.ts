/**
 * Flash Express read methods against a fake that honours only documented
 * parameters (https://open-docs.flashexpress.com/, fetched 2026-09-24).
 *
 * - "Production ENV: https://open-api.flashexpress.com"; "Training ENV:
 *   https://open-api-tra.flashexpress.com".
 * - "Request Method: POST"; "Request datas use the
 *   application/x-www-form-urlencoded format".
 * - Signature: non-empty parameters sorted by name "from small to large",
 *   joined as key=value&..., then `+"&key=<secret>"`, SHA256, upper case.
 * - listWarehouses: POST /open/v1/warehouses, parameters mchId, nonceStr,
 *   sign only. No paging.
 * - getTrackingEvents: POST /open/v1/orders/{pno}/routes, parameters mchId,
 *   nonceStr, sign; the path variable is "not involved in the signature".
 */
import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { FlashExpressAdapter } from '../../../../../../src/verticals/logistics/adapters/flash-express/index'
import { flashExpressSign } from '../../../../../../src/verticals/logistics/adapters/flash-express/auth'
import { FlashExpressClient } from '../../../../../../src/verticals/logistics/adapters/flash-express/client'
import { WarehouseSchema } from '../../../../../../src/verticals/logistics/schema/warehouse'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { docRoutes, docWarehouseRow, docWarehouses } from './fixtures'

const SECRET = 'dd807a8e18b40153888e5a9864e70080'

type Handler = (path: string, form: Record<string, string>) => unknown
type Call = { path: string; form: Record<string, string> }

let handler: Handler
let calls: Call[]
let created: Array<{ baseURL?: string; headers?: Record<string, unknown> }>
let credSeq = 0

function freshCreds() {
  // A fresh merchant per test: pager keys are per connection.
  credSeq += 1
  return { accessToken: SECRET, extra: { mchId: `AA${credSeq}X${Math.random()}` } }
}

/** The documented signature, written out independently of the adapter. */
function expectedSign(form: Record<string, string>): string {
  const stringA = Object.keys(form)
    .filter((k) => k !== 'sign' && form[k]!.trim() !== '')
    .sort()
    .map((k) => `${k}=${form[k]}`)
    .join('&')
  return createHash('sha256').update(`${stringA}&key=${SECRET}`).digest('hex').toUpperCase()
}

/** Rejects any parameter the endpoint does not document, and a bad signature. */
function documented(form: Record<string, string>, allowed: string[]): void {
  for (const k of Object.keys(form)) {
    if (![...allowed, 'mchId', 'nonceStr', 'sign'].includes(k)) throw new Error(`undocumented ${k}`)
  }
  if (!form['mchId'] || !form['nonceStr']) throw new Error('mchId and nonceStr are required')
  if (form['sign'] !== expectedSign(form)) throw new Error('invalid signature')
}

beforeEach(() => {
  calls = []
  created = []
  handler = () => {
    throw new Error('unexpected request')
  }
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    created.push({ baseURL: cfg?.baseURL, headers: cfg?.headers as Record<string, unknown> })
    return {
      post: vi.fn(async (path: string, body: unknown) => {
        if (typeof body !== 'string') throw new Error('the body must be form-urlencoded text')
        const form = Object.fromEntries(new URLSearchParams(body))
        calls.push({ path, form })
        return { data: handler(path, form) }
      }),
      get: vi.fn(async () => {
        throw new Error('Flash Express documents POST only')
      }),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ok(data: unknown) {
  return { code: 1, message: 'success', data }
}

function warehousesFake(rows: unknown[]): Handler {
  return (path, form) => {
    if (path !== 'open/v1/warehouses') throw new Error(`unexpected path ${path}`)
    documented(form, [])
    return ok(rows)
  }
}

describe('flash-express signing', () => {
  it('signs the sorted non-empty parameters plus &key=, SHA256 upper case', () => {
    const form = { nonceStr: 'yyv6YJP436wCkdpNdghC', mchId: 'AAXXXX', body: 'test' }
    const want = createHash('sha256')
      .update(`body=test&mchId=AAXXXX&nonceStr=yyv6YJP436wCkdpNdghC&key=${SECRET}`)
      .digest('hex')
      .toUpperCase()
    expect(flashExpressSign(form, SECRET)).toBe(want)
  })

  it('leaves blank values and sign itself out of the signature', () => {
    const base = { mchId: 'AAXXXX', nonceStr: 'n1' }
    const sig = flashExpressSign(base, SECRET)
    expect(flashExpressSign({ ...base, body: ' \t\n' }, SECRET)).toBe(sig)
    expect(flashExpressSign({ ...base, body: '' }, SECRET)).toBe(sig)
    expect(flashExpressSign({ ...base, sign: 'X' }, SECRET)).toBe(sig)
  })
})

describe('flash-express listWarehouses', () => {
  it('POSTs the signed form to the documented production host and path', async () => {
    handler = warehousesFake(docWarehouses())
    const creds = freshCreds()
    const got = await new FlashExpressAdapter().listWarehouses(
      creds,
      withPageSink({ page: 1, limit: 10 }),
    )
    got.forEach((w) => WarehouseSchema.parse(w))
    expect(got.map((w) => w.id)).toEqual(['AAXXXX_001', 'AAXXXX_002'])
    expect(created).toEqual([
      {
        baseURL: 'https://open-api.flashexpress.com/',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('open/v1/warehouses')
    expect(Object.keys(calls[0]!.form).sort()).toEqual(['mchId', 'nonceStr', 'sign'])
    expect(calls[0]!.form['mchId']).toBe(creds.extra.mchId)
    expect(calls[0]!.form['nonceStr']).toMatch(/^[0-9a-f]{32}$/)
  })

  it('uses the documented Training ENV host when configured for sandbox', async () => {
    handler = warehousesFake([])
    await new FlashExpressAdapter({ sandbox: true }).listWarehouses(
      freshCreds(),
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(created.map((c) => c.baseURL)).toEqual(['https://open-api-tra.flashexpress.com/'])
  })

  it('sends a fresh nonceStr on every request', async () => {
    handler = warehousesFake([])
    const creds = freshCreds()
    const adapter = new FlashExpressAdapter()
    await adapter.listWarehouses(creds, withPageSink({ page: 1, limit: 10 }))
    await adapter.listWarehouses(creds, withPageSink({ page: 1, limit: 10 }))
    expect(calls[0]!.form['nonceStr']).not.toBe(calls[1]!.form['nonceStr'])
  })

  it('walks 2L+1 warehouses in pages of L: every id once, hasMore exact', async () => {
    const L = 2
    const rows = ['W1', 'W2', 'W3', 'W4', 'W5'].map(docWarehouseRow)
    handler = warehousesFake(rows)
    const adapter = new FlashExpressAdapter()
    const creds = freshCreds()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const got = await adapter.listWarehouses(creds, params)
      got.forEach((w) => WarehouseSchema.parse(w))
      expect(got.length).toBeLessThanOrEqual(L)
      seen.push(...got.map((w) => w.id!))
      hasMore.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(['W1', 'W2', 'W3', 'W4', 'W5'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('throws a response code other than 1 instead of reading it as empty', async () => {
    handler = () => ({ code: 1002, message: 'invalid signature', data: null })
    await expect(
      new FlashExpressAdapter().listWarehouses(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses a connection without mchId before sending anything', async () => {
    handler = warehousesFake([])
    await expect(
      new FlashExpressAdapter().listWarehouses(
        { accessToken: SECRET },
        withPageSink({ page: 1, limit: 10 }),
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' })
    await expect(
      new FlashExpressAdapter().listWarehouses(
        { accessToken: SECRET, extra: { mchId: '  ' } },
        withPageSink({ page: 1, limit: 10 }),
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' })
    expect(calls).toEqual([])
  })
})

describe('flash-express getTrackingEvents', () => {
  it('POSTs the signed form to /open/v1/orders/{pno}/routes and maps each route', async () => {
    handler = (path, form) => {
      if (path !== 'open/v1/orders/TH0112XXXXXX/routes') throw new Error(`unexpected path ${path}`)
      documented(form, [])
      return ok(docRoutes())
    }
    const events = await new FlashExpressAdapter().getTrackingEvents(freshCreds(), 'TH0112XXXXXX')
    events.forEach((e) => TrackingEventSchema.parse(e))
    expect(events.map((e) => e.id)).toEqual([
      'TH0112XXXXXX:1523357001:DELIVERY_CONFIRM',
      'TH0112XXXXXX:1523356924:DELIVERY_TICKET_CREATION_SCAN',
      'TH0112XXXXXX:1523356560:SHIPMENT_WAREHOUSE_SCAN',
      'TH0112XXXXXX:1523356029:RECEIVED',
    ])
    expect(Object.keys(calls[0]!.form).sort()).toEqual(['mchId', 'nonceStr', 'sign'])
  })

  it('answers "1006 order not found" with a 404', async () => {
    handler = () => ({ code: 1006, message: 'order not found', data: null })
    await expect(
      new FlashExpressAdapter().getTrackingEvents(freshCreds(), 'TH0000000000'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('flash-express credentials', () => {
  it('stores the secret key as accessToken and mchId on extra', async () => {
    const creds = await new FlashExpressAdapter().exchangeCredentials({
      mchId: ' AAXXXX ',
      secretKey: SECRET,
    })
    expect(creds).toEqual({ accessToken: SECRET, extra: { mchId: 'AAXXXX' } })
  })

  it('asks for both fields', async () => {
    const adapter = new FlashExpressAdapter()
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['mchId', 'secretKey'])
    await expect(adapter.exchangeCredentials({ secretKey: SECRET })).rejects.toThrow(/mchId/)
    await expect(adapter.exchangeCredentials({ mchId: 'AAXXXX' })).rejects.toThrow(/Secret key/)
    await expect(adapter.exchangeCode('x', 'y')).rejects.toThrow(/credential form/)
  })
})

describe('flash-express response codes', () => {
  // "Response Code" table: "1001 | customer not found", "1002 | invalid
  // signature", "1006 | order not found", "1007 | warehouse not found",
  // "1019 | pno and mchId not match".
  it.each([
    [1001, 401, 'FLASH_EXPRESS_1001'],
    [1002, 401, 'FLASH_EXPRESS_1002'],
    [1006, 404, 'FLASH_EXPRESS_1006'],
    [1007, 404, 'FLASH_EXPRESS_1007'],
    [1019, 404, 'FLASH_EXPRESS_1019'],
    [1003, 502, 'UPSTREAM_ERROR'],
  ])('maps code %i to %i %s', async (code, statusCode, errCode) => {
    handler = () => ({ code, message: 'm', data: null })
    await expect(
      new FlashExpressAdapter().getTrackingEvents(freshCreds(), 'TH0112XXXXXX'),
    ).rejects.toMatchObject({ statusCode, code: errCode })
  })

  it('names the Thailand-only host on a rejected merchant', async () => {
    handler = () => ({ code: 1001, message: 'customer not found', data: null })
    await expect(
      new FlashExpressAdapter().listWarehouses(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/Thailand host; Malaysia, Philippines and Laos/)
  })

  it('does not add the host hint to a missing record', async () => {
    handler = () => ({ code: 1006, message: 'order not found', data: null })
    await expect(
      new FlashExpressAdapter().getTrackingEvents(freshCreds(), 'TH0112XXXXXX'),
    ).rejects.toThrow(
      /^Flash Express open\/v1\/orders\/TH0112XXXXXX\/routes answered code 1006: order not found$/,
    )
  })
})

describe('flash-express edge cases', () => {
  it('throws, rather than serving a complete empty collection, when warehouses data is null', async () => {
    handler = () => ok(null)
    await expect(
      new FlashExpressAdapter().listWarehouses(freshCreds(), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
  })

  it('serves an empty warehouses array as an empty, complete page', async () => {
    handler = warehousesFake([])
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new FlashExpressAdapter().listWarehouses(freshCreds(), params)).toEqual([])
    expect(readUpstreamPage(params)!.hasMore).toBe(false)
  })

  it('encodes the tracking number as one path segment', async () => {
    handler = (path, form) => {
      documented(form, [])
      if (path !== 'open/v1/orders/TH%2F01%3F/routes') throw new Error(`unexpected path ${path}`)
      return ok({ ...docRoutes(), pno: 'TH/01?' })
    }
    await new FlashExpressAdapter().getTrackingEvents(freshCreds(), 'TH/01?')
    expect(calls.map((c) => c.path)).toEqual(['open/v1/orders/TH%2F01%3F/routes'])
  })

  it('answers code 1 with null data as a 404', async () => {
    handler = () => ok(null)
    await expect(
      new FlashExpressAdapter().getTrackingEvents(freshCreds(), 'TH0112XXXXXX'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('treats every documented blank character as blank when signing', () => {
    const base = { mchId: 'AAXXXX', nonceStr: 'n1' }
    const sig = flashExpressSign(base, SECRET)
    for (const ch of [
      '\t',
      '\n',
      '\u000B',
      '\u000C',
      '\r',
      '\u001C',
      '\u001D',
      '\u001E',
      '\u001F',
    ]) {
      expect(flashExpressSign({ ...base, body: ch }, SECRET)).toBe(sig)
    }
    expect(flashExpressSign({ ...base, body: 'a\u000B' }, SECRET)).not.toBe(sig)
  })

  it('refuses a nested field before sending and drops null or undefined fields', async () => {
    handler = (_path, form) => {
      documented(form, ['a'])
      return ok([])
    }
    const client = new FlashExpressClient(freshCreds())
    await expect(client.post('open/v1/x', { nested: { a: 1 } })).rejects.toThrow(TypeError)
    expect(calls).toEqual([])
    await client.post('open/v1/x', { a: 'v', b: undefined, c: null })
    expect(Object.keys(calls[0]!.form).sort()).toEqual(['a', 'mchId', 'nonceStr', 'sign'])
  })
})
