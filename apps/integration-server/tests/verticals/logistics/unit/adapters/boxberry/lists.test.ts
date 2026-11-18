/**
 * Boxberry's list methods, rebuilt onto the first-party API docs
 * (https://yandex.ru/support/delivery-boxberry/ru/pages/*).
 *
 * - listShipments, listOrders, listLabels: `ParselStory`, whose only
 *   parameters are token, method, from and to (YYYYMMDD). "Если не указывать
 *   диапазоны дат, то будет возвращена последняя созданная посылка", and no
 *   retention limit is documented, so an unfiltered call is refused and a
 *   call with updatedAfter walks UTC calendar months newest-first.
 * - listWarehouses / getWarehouse: `ListPoints` (token, method, prepaid, and
 *   filters; no paging), paged locally.
 * - getTrackingEvents: `ListStatuses` with the required ImId.
 * - listTrackingEvents: refused, every status method is per parcel.
 *
 * The fakes honour only the documented parameters and refuse anything else.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { listPage, readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { BoxberryAdapter } from '../../../../../../src/verticals/logistics/adapters/boxberry/index'

const CALL_BUDGET = 40
let tokenSeq = 0
/** A fresh connection per test, so no row-pager memo is shared between tests. */
const creds = () => ({ accessToken: `boxberry_test_${++tokenSeq}` })

interface Parcel {
  track: string
  label: string
  date: string
  send: boolean
  barcode: string
  imid: string
}

function parcel(n: number, date: string, label = true): Parcel {
  return {
    track: `AAP${n}`,
    label: label ? `http://api.boxberry.ru/parcel-files/barcodes?parcel_id=${n}&token=X` : '',
    date,
    send: false,
    barcode: `000${n}`,
    imid: `IM${n}`,
  }
}

/** YYYYMMDD of a ParselStory `date` ("YYYY.MM.DD HH:MM:SS"). */
const dayOf = (date: string) => Number(date.slice(0, 10).replace(/\./g, ''))

type Handler = (params: Record<string, unknown>) => unknown

function fakeBoxberry(handlers: Record<string, { documented: string[]; handle: Handler }>) {
  let calls = 0
  const get = vi.fn(async (_path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    const params = cfg?.params ?? {}
    const h = handlers[String(params.method)]
    if (!h) throw new Error(`undocumented method ${String(params.method)}`)
    const allowed = new Set(['token', 'method', ...h.documented])
    const extra = Object.keys(params).filter((k) => !allowed.has(k))
    if (extra.length > 0) throw new Error(`undocumented params sent: ${extra.join(',')}`)
    return { data: h.handle(params) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(async () => {
      throw new Error('no POST expected')
    }),
    defaults: { headers: { common: {} } },
  } as never)
  return { get, sent: () => get.mock.calls.map((c) => c[1]?.params as Record<string, unknown>) }
}

/**
 * ParselStory as documented: without from/to, only the last created parcel;
 * with them, the parcels created in the range. `toInclusive` picks how `to`
 * reads, which the docs leave open.
 */
function parselStory(parcels: Parcel[], toInclusive = true) {
  return {
    documented: ['from', 'to'],
    handle: (p: Record<string, unknown>) => {
      if (p.from === undefined && p.to === undefined) return parcels.slice(-1)
      const from = Number(p.from)
      const to = Number(p.to)
      return parcels.filter((x) => {
        const d = dayOf(x.date)
        return d >= from && (toInclusive ? d <= to : d < to)
      })
    },
  }
}

const NOW = new Date('2026-03-15T12:00:00Z')
const AFTER = new Date('2026-01-10T00:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * Seven parcels, unevenly spread: March 3, February 1 (on the 1st, so an
 * inclusive `to` returns it to the January window too), January 3.
 */
const SEVEN = [
  parcel(1, '2026.01.12 10:00:00'),
  parcel(2, '2026.01.20 10:00:00'),
  parcel(3, '2026.01.31 23:59:59'),
  parcel(4, '2026.02.01 00:00:01'),
  parcel(5, '2026.03.01 09:00:00'),
  parcel(6, '2026.03.10 09:00:00'),
  parcel(7, '2026.03.14 09:00:00'),
]
/** Newest month first, response order within a month. */
const WALK_ORDER = ['AAP5', 'AAP6', 'AAP7', 'AAP4', 'AAP1', 'AAP2', 'AAP3']

async function walk<T>(
  list: (p: QueryParams) => Promise<T[]>,
  idOf: (row: T) => string | undefined,
  limit: number,
  pages: number,
  extra: QueryParams = { updatedAfter: AFTER },
) {
  const ids: (string | undefined)[] = []
  const hasMore: boolean[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit, ...extra })
    const env = listPage(await list(params), params, 'boxberry')
    ids.push(...env.data.map(idOf))
    hasMore.push(env.meta.hasMore as boolean)
    expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ pagedLocally: true }))
  }
  return { ids, hasMore }
}

describe('boxberry ParselStory lists refuse a call with no date bound', () => {
  for (const method of ['listShipments', 'listOrders', 'listLabels'] as const) {
    it(`${method} without updatedAfter throws 501 NOT_SUPPORTED and sends nothing`, async () => {
      const { get } = fakeBoxberry({ ParselStory: parselStory(SEVEN) })
      const adapter = new BoxberryAdapter()
      const err = await adapter[method](creds(), { page: 1, limit: 10 }).catch((e: unknown) => e)
      expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(String((err as Error).message)).toContain('ParselStory')
      expect(String((err as Error).message)).toContain('updatedAfter')
      expect(get).not.toHaveBeenCalled()
    })
  }
})

describe('boxberry listShipments walks ParselStory by UTC month, newest first', () => {
  it('sends only token, method, from and to, one UTC month per request back to updatedAfter', async () => {
    const c = creds()
    const { sent } = fakeBoxberry({ ParselStory: parselStory(SEVEN) })
    await new BoxberryAdapter().listShipments(c, { page: 1, limit: 100, updatedAfter: AFTER })
    expect(sent()).toEqual([
      { token: c.accessToken, method: 'ParselStory', from: 20260301, to: 20260401 },
      { token: c.accessToken, method: 'ParselStory', from: 20260201, to: 20260301 },
      { token: c.accessToken, method: 'ParselStory', from: 20260101, to: 20260201 },
    ])
  })

  it('with 2L+1 rows over uneven months, pages 1..3 at limit L serve every parcel once, hasMore exact', async () => {
    const L = 3
    const c = creds()
    fakeBoxberry({ ParselStory: parselStory(SEVEN) })
    const adapter = new BoxberryAdapter()
    const { ids, hasMore } = await walk(
      (p) => adapter.listShipments(c, p),
      (s) => s.id,
      L,
      3,
    )
    expect(ids).toEqual(WALK_ORDER)
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves each parcel once whether `to` reads inclusive or exclusive', async () => {
    const L = 3
    const c = creds()
    fakeBoxberry({ ParselStory: parselStory(SEVEN, false) })
    const adapter = new BoxberryAdapter()
    const { ids, hasMore } = await walk(
      (p) => adapter.listShipments(c, p),
      (s) => s.id,
      L,
      3,
    )
    expect(ids).toEqual(WALK_ORDER)
    expect(hasMore).toEqual([true, true, false])
  })

  it('the newest window is the UTC month holding tomorrow, so a parcel dated ahead of UTC is reached', async () => {
    vi.setSystemTime(new Date('2026-03-31T22:00:00Z'))
    const c = creds()
    const early = parcel(9, '2026.04.01 01:00:00')
    const { sent } = fakeBoxberry({ ParselStory: parselStory([early]) })
    const out = await new BoxberryAdapter().listShipments(c, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-03-20T00:00:00Z'),
    })
    expect(out.map((s) => s.id)).toEqual(['AAP9'])
    expect(sent()[0]).toMatchObject({ from: 20260401, to: 20260501 })
  })

  it('a Boxberry error body is thrown, not read as an empty month', async () => {
    fakeBoxberry({
      ParselStory: {
        documented: ['from', 'to'],
        handle: () => ({ err: 'Слишком много запросов' }),
      },
    })
    await expect(
      new BoxberryAdapter().listShipments(creds(), { page: 1, limit: 5, updatedAfter: AFTER }),
    ).rejects.toThrow(/ParselStory.*Слишком много запросов/)
  })
})

describe('boxberry listOrders and listLabels read the same ParselStory windows', () => {
  it('listOrders: id is the track, orderNumber the imid; 2L+1 walk exact', async () => {
    const c = creds()
    fakeBoxberry({ ParselStory: parselStory(SEVEN) })
    const adapter = new BoxberryAdapter()
    const { ids, hasMore } = await walk(
      (p) => adapter.listOrders(c, p),
      (o) => o.id,
      3,
      3,
    )
    expect(ids).toEqual(WALK_ORDER)
    expect(hasMore).toEqual([true, true, false])
    const first = await adapter.listOrders(c, { page: 1, limit: 1, updatedAfter: AFTER })
    expect(first[0]).toMatchObject({ id: 'AAP5', orderNumber: 'IM5', shipmentIds: ['AAP5'] })
  })

  it('listLabels skips parcels with no label link and reports hasMore exactly', async () => {
    const c = creds()
    const parcels = [
      parcel(1, '2026.01.12 10:00:00'),
      parcel(2, '2026.01.20 10:00:00', false),
      parcel(3, '2026.02.03 10:00:00'),
      parcel(4, '2026.03.01 10:00:00', false),
      parcel(5, '2026.03.02 10:00:00'),
      parcel(6, '2026.03.03 10:00:00'),
      parcel(7, '2026.03.04 10:00:00'),
      parcel(8, '2026.03.05 10:00:00'),
      parcel(9, '2026.03.06 10:00:00'),
    ]
    fakeBoxberry({ ParselStory: parselStory(parcels) })
    const adapter = new BoxberryAdapter()
    // 7 labelled parcels = 2L+1 at L=3.
    const { ids, hasMore } = await walk(
      (p) => adapter.listLabels(c, p),
      (l) => l.id,
      3,
      3,
    )
    expect(ids).toEqual(['AAP5', 'AAP6', 'AAP7', 'AAP8', 'AAP9', 'AAP3', 'AAP1'])
    expect(hasMore).toEqual([true, true, false])
  })
})

describe('boxberry listTrackingEvents is refused', () => {
  it('throws 501 NOT_SUPPORTED naming the per-parcel status methods, and sends nothing', async () => {
    const { get } = fakeBoxberry({})
    const err = await new BoxberryAdapter()
      .listTrackingEvents(creds(), { page: 1, limit: 10, updatedAfter: AFTER })
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String((err as Error).message)).toContain('ListStatuses')
    expect(get).not.toHaveBeenCalled()
  })
})

describe('boxberry getTrackingEvents reads ListStatuses', () => {
  it('sends only the required ImId and maps the documented history', async () => {
    const c = creds()
    const { sent } = fakeBoxberry({
      ListStatuses: {
        documented: ['ImId'],
        handle: () => [
          { Date: '2024-02-07 13:38:13', Name: 'Загружен реестр ИМ' },
          { Date: '2024-02-07 13:54:31', Name: 'Выдано' },
        ],
      },
    })
    const events = await new BoxberryAdapter().getTrackingEvents(c, 'AAP298792807')
    expect(sent()).toEqual([{ token: c.accessToken, method: 'ListStatuses', ImId: 'AAP298792807' }])
    expect(events.map((e) => e.status)).toEqual(['PRE_TRANSIT', 'DELIVERED'])
  })

  it('throws on a Boxberry error body', async () => {
    fakeBoxberry({
      ListStatuses: { documented: ['ImId'], handle: () => ({ err: 'Посылка не найдена' }) },
    })
    await expect(new BoxberryAdapter().getTrackingEvents(creds(), 'X')).rejects.toThrow(
      /ListStatuses/,
    )
  })
})

describe('boxberry listWarehouses pages ListPoints locally', () => {
  const LIST_POINTS_DOCUMENTED = [
    'CountryCode',
    'CityCode',
    'prepaid',
    'is_include_postamat',
    'EnablePartialDelivery',
    'EnableFitting',
    'FittingType',
  ]
  const points = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ Code: `${i + 1}`, Name: `Point ${i + 1}` }))

  it('sends ListPoints with prepaid=1 only, and a 2L+1 walk is exact', async () => {
    const c = creds()
    const L = 2
    const { sent } = fakeBoxberry({
      ListPoints: { documented: LIST_POINTS_DOCUMENTED, handle: () => points(2 * L + 1) },
    })
    const adapter = new BoxberryAdapter()
    const { ids, hasMore } = await walk(
      (p) => adapter.listWarehouses(c, p),
      (w) => w.id,
      L,
      3,
      {},
    )
    expect(ids).toEqual(['1', '2', '3', '4', '5'])
    expect(hasMore).toEqual([true, true, false])
    for (const p of sent()) {
      expect(p).toEqual({ token: c.accessToken, method: 'ListPoints', prepaid: 1 })
    }
  })

  it('getWarehouse finds the point by Code, and 404s when it is absent', async () => {
    fakeBoxberry({ ListPoints: { documented: LIST_POINTS_DOCUMENTED, handle: () => points(3) } })
    const adapter = new BoxberryAdapter()
    expect((await adapter.getWarehouse(creds(), '2')).name).toBe('Point 2')
    await expect(adapter.getWarehouse(creds(), '99')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('boxberry ParselStory pager memo is scoped to the collection and the window', () => {
  /** March: 5, 6 (no label), 7. February: 4. January: 1, 2, 3. */
  const MIXED = [
    parcel(1, '2026.01.12 10:00:00'),
    parcel(2, '2026.01.20 10:00:00'),
    parcel(3, '2026.01.31 10:00:00'),
    parcel(4, '2026.02.03 10:00:00'),
    parcel(5, '2026.03.01 09:00:00'),
    parcel(6, '2026.03.10 09:00:00', false),
    parcel(7, '2026.03.14 09:00:00'),
  ]

  it('a listShipments walk does not feed listLabels on the same connection', async () => {
    const c = creds()
    fakeBoxberry({ ParselStory: parselStory(MIXED) })
    const adapter = new BoxberryAdapter()
    const shipments = await adapter.listShipments(c, { page: 1, limit: 3, updatedAfter: AFTER })
    expect(shipments.map((s) => s.id)).toEqual(['AAP5', 'AAP6', 'AAP7'])
    // Labels stream: 5, 7, 4, 1, 2, 3 — page 2 at limit 3 is 1, 2, 3.
    const labels = await adapter.listLabels(c, { page: 2, limit: 3, updatedAfter: AFTER })
    expect(labels.map((l) => l.id)).toEqual(['AAP1', 'AAP2', 'AAP3'])
    for (const l of labels) expect(l.url).toMatch(/^http:\/\/api\.boxberry\.ru\//)
  })

  it('a walk with a later updatedAfter does not reuse an earlier, wider walk', async () => {
    const c = creds()
    fakeBoxberry({ ParselStory: parselStory(SEVEN) })
    const adapter = new BoxberryAdapter()
    await adapter.listShipments(c, { page: 1, limit: 3, updatedAfter: AFTER })
    // From March 1 only the three March parcels exist, so page 2 is empty.
    const params = withPageSink({
      page: 2,
      limit: 3,
      updatedAfter: new Date('2026-03-01T00:00:00Z'),
    })
    const page2 = await adapter.listShipments(c, params)
    expect(page2.map((s) => s.id)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
  })
})

describe('boxberry ParselStory rows and bodies', () => {
  it('skips a row with no track, which carries no id', async () => {
    const c = creds()
    const noTrack = { ...parcel(8, '2026.03.12 09:00:00'), track: '' }
    fakeBoxberry({ ParselStory: parselStory([...SEVEN, noTrack]) })
    const adapter = new BoxberryAdapter()
    const params = { page: 1, limit: 100, updatedAfter: AFTER }
    const ids = [
      (await adapter.listShipments(c, params)).map((r) => r.id),
      (await adapter.listOrders(c, params)).map((r) => r.id),
      (await adapter.listLabels(c, params)).map((r) => r.id),
    ]
    expect(ids).toEqual([WALK_ORDER, WALK_ORDER, WALK_ORDER])
  })

  it("a body with err:false (Boxberry's documented success marker) is no rows, not an error", async () => {
    fakeBoxberry({ ListPoints: { documented: ['prepaid'], handle: () => ({ err: false }) } })
    await expect(
      new BoxberryAdapter().listWarehouses(creds(), { page: 1, limit: 5 }),
    ).resolves.toEqual([])
  })
})
