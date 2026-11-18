/**
 * CTT listShipments and listCarriers, rebuilt onto the documented API.
 *
 * listShipments used GET https://api.ctt.pt/v1/shipments/newsince?since=, a
 * host that answers 404 for every path. The documented list is
 *
 *   GET /shipments/newsince/:startNumber/:iso3339Date
 *   "Each request will return 25 shipments at most ... If the list is longer
 *    than 25 items, a second request is done and the start item is set to 26,
 *    etc. at a rate of 1 request per second at most. ... The maximum time back
 *    in time is 2 days." "If ShipmentCount is less than 25, it means this is
 *    the last possible shipment list, further requests are not needed."
 *   (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/shipments/newsince/GET)
 *
 * listCarriers read `res.Carriers`, but GET /carriers/ answers under
 * `Carrier` (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/carriers/GET).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import {
  CttAdapter,
  _newsinceFrom,
} from '../../../../../../src/verticals/logistics/adapters/ctt/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'
import { carrier } from './fixtures'
import { credsFor, fakeCtt, keysFor } from './fake'

const adapter = () => new CttAdapter({ newsinceIntervalMs: 0 })
let seq = 0
/** A fresh connection per test, so the row pager and the pacing map never carry over. */
const freshKeys = () => keysFor(`PUB-${++seq}`)

beforeEach(() => _resetRowPager())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function walk(
  fn: (params: ReturnType<typeof withPageSink>) => Promise<Array<{ id?: string }>>,
  limit: number,
  pages: number,
) {
  const ids: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await fn(params)
    ids.push(...rows.map((r) => r.id as string))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, more }
}

describe('ctt listShipments', () => {
  it('N = 2L+1 over uneven upstream pages (25 + 16): every id once, exact hasMore', async () => {
    const L = 20
    const N = 2 * L + 1
    const keys = freshKeys()
    const fake = fakeCtt(keys, { shipments: N })
    const { ids, more } = await walk(
      async (p) =>
        (await adapter().listShipments(credsFor(keys), p)).map((s) => ShipmentSchema.parse(s)),
      L,
      3,
    )
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => String(1001 + i)))
    expect(new Set(ids).size).toBe(N)
    expect(more).toEqual([true, true, false])
    // Start items 1 and 26, each fetched once across the walk.
    const starts = fake.sent.map((r) => r.url.split('/')[2])
    expect(new Set(starts)).toEqual(new Set(['1', '26']))
  })

  it('sends only the documented path: GET shipments/newsince/<start>/<RFC3339>, no query, no body', async () => {
    const keys = freshKeys()
    const fake = fakeCtt(keys, { shipments: 3 })
    const updatedAfter = new Date('2026-09-23T06:07:08.999Z')
    await adapter().listShipments(
      credsFor(keys),
      withPageSink({ page: 1, limit: 10, updatedAfter }),
    )
    expect(fake.sent).toEqual([
      { method: 'GET', url: 'shipments/newsince/1/2026-09-23T06:07:08Z', data: undefined },
    ])
  })

  it('stops on ShipmentCount < 25 and treats exactly 25 as "ask again"', async () => {
    const keys = freshKeys()
    const fake = fakeCtt(keys, { shipments: 25 })
    const params = withPageSink({ page: 1, limit: 25 })
    const rows = await adapter().listShipments(credsFor(keys), params)
    expect(rows).toHaveLength(25)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(fake.sent.map((r) => r.url.split('/')[2])).toEqual(['1', '26'])
  })

  it('an empty window is an empty page with hasMore false', async () => {
    const keys = freshKeys()
    fakeCtt(keys, { shipments: 0 })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter().listShipments(credsFor(keys), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a reply with neither ShipmentCount nor Shipments ends the walk', async () => {
    const keys = freshKeys()
    const fake = fakeCtt(keys, { bareNewsince: true })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter().listShipments(credsFor(keys), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(fake.sent).toHaveLength(1)
  })

  it('unfiltered: the window starts at the previous UTC midnight, inside the documented 2 days', () => {
    const now = Date.parse('2026-09-24T17:30:00Z')
    expect(_newsinceFrom({}, now)).toBe('2026-09-23T00:00:00Z')
    // Just after midnight: 24h back, still inside the 2 days.
    expect(_newsinceFrom({}, Date.parse('2026-09-24T00:00:01Z'))).toBe('2026-09-23T00:00:00Z')
    // Just before midnight: under 48h back.
    expect(_newsinceFrom({}, Date.parse('2026-09-24T23:59:59Z'))).toBe('2026-09-23T00:00:00Z')
  })

  it('unfiltered walk sends the previous UTC midnight on every page', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-24T17:30:00Z'))
    const keys = freshKeys()
    const fake = fakeCtt(keys, { shipments: 30 })
    await walk((p) => adapter().listShipments(credsFor(keys), p), 20, 2)
    expect(fake.sent.map((r) => r.url)).toEqual([
      'shipments/newsince/1/2026-09-23T00:00:00Z',
      'shipments/newsince/26/2026-09-23T00:00:00Z',
    ])
  })

  it('a different window on one connection is its own walk, not the rows of the last one', async () => {
    // Window A holds 5 shipments, window B holds 30. Page 1 of A ends A at 5
    // rows; page 2 of B must still fetch B, not answer "past the end of A".
    const keys = freshKeys()
    const A = '2026-09-23T00:00:00Z'
    const B = '2026-09-22T12:00:00Z'
    const fake = fakeCtt(keys, { shipmentsBySince: { [A]: 5, [B]: 30 } })
    const a = withPageSink({ page: 1, limit: 10, updatedAfter: new Date(A) })
    expect(await adapter().listShipments(credsFor(keys), a)).toHaveLength(5)
    expect(readUpstreamPage(a)?.hasMore).toBe(false)
    const b = withPageSink({ page: 2, limit: 10, updatedAfter: new Date(B) })
    const rows = await adapter().listShipments(credsFor(keys), b)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => String(1011 + i)))
    expect(readUpstreamPage(b)?.hasMore).toBe(true)
    expect(fake.sent.map((r) => r.url)).toEqual([
      `shipments/newsince/1/${A}`,
      `shipments/newsince/1/${B}`,
    ])
  })

  it('refuses a reply with Shipments but no ShipmentCount instead of asking forever', async () => {
    const keys = freshKeys()
    const fake = fakeCtt(keys, { shipments: 3, newsinceNoCount: true })
    await expect(
      adapter().listShipments(credsFor(keys), withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/no ShipmentCount/)
    expect(fake.sent).toHaveLength(1)
  })

  it('refuses an unparseable updatedAfter with a 400 before any request', async () => {
    const keys = freshKeys()
    const fake = fakeCtt(keys, { shipments: 3 })
    await expect(
      adapter().listShipments(
        credsFor(keys),
        withPageSink({ page: 1, limit: 10, updatedAfter: 'nope' as never }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(fake.sent).toEqual([])
  })

  it('spaces newsince requests of one connection by the documented second', async () => {
    const keys = freshKeys()
    const fake = fakeCtt(keys, { shipments: 30 })
    const at: number[] = []
    fake.request.mockImplementation(
      ((orig) => async (cfg: never) => {
        at.push(Date.now())
        return orig(cfg)
      })(fake.request.getMockImplementation()!) as never,
    )
    await new CttAdapter({ newsinceIntervalMs: 80 }).listShipments(
      credsFor(keys),
      withPageSink({ page: 1, limit: 30 }),
    )
    expect(at).toHaveLength(2)
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(75)
  })

  it('defaults to one request per second', () => {
    expect((new CttAdapter() as unknown as { newsinceIntervalMs: number }).newsinceIntervalMs).toBe(
      1000,
    )
  })
})

describe('ctt listCarriers', () => {
  it('N = 2L+1 carriers from the one `Carrier` reply: every id once, exact hasMore', async () => {
    const L = 3
    const N = 2 * L + 1
    const keys = freshKeys()
    const fake = fakeCtt(keys, { carriers: Array.from({ length: N }, (_, i) => carrier(i + 1)) })
    const { ids, more } = await walk(
      async (p) =>
        (await adapter().listCarriers(credsFor(keys), p)).map((c) => CarrierSchema.parse(c)),
      L,
      3,
    )
    expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(more).toEqual([true, true, false])
    expect(
      fake.sent.every((r) => r.method === 'GET' && r.url === 'carriers/' && r.data === undefined),
    ).toBe(true)
  })

  it('a reply that reports an error and no Carrier throws, not an empty complete list', async () => {
    const keys = freshKeys()
    fakeCtt(keys, { carriersReply: { Error: { Id: 12, Info: 'Not allowed' } } })
    await expect(
      adapter().listCarriers(credsFor(keys), withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/12 Not allowed/)
  })

  it('reads the error in the OpenAPI array shape too', async () => {
    const keys = freshKeys()
    fakeCtt(keys, { carriersReply: { Error: [{ Id: 7, Info: 'Bad key' }] } })
    await expect(
      adapter().listCarriers(credsFor(keys), withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/7 Bad key/)
  })

  it('reads the documented ErrorList (Id, Tekst) too', async () => {
    const keys = freshKeys()
    fakeCtt(keys, { carriersReply: { Error: { Id: 0 }, ErrorList: [{ Id: 9, Tekst: 'Invalid' }] } })
    await expect(
      adapter().listCarriers(credsFor(keys), withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/9 Invalid/)
  })

  it('a Carrier array is served even when the reply also carries an Error entry', async () => {
    const keys = freshKeys()
    fakeCtt(keys, { carriersReply: { Error: { Id: 3, Info: 'note' }, Carrier: [carrier(1)] } })
    const rows = await adapter().listCarriers(credsFor(keys), withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['1'])
  })

  it('an Error with Id 0 and no text, and no Carrier, is an empty list', async () => {
    const keys = freshKeys()
    fakeCtt(keys, { carriersReply: { Error: { Id: 0 } } })
    const params = withPageSink({ page: 1, limit: 5 })
    expect(await adapter().listCarriers(credsFor(keys), params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
