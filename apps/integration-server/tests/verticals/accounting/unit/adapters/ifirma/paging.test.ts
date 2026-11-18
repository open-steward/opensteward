import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import { IfirmaAdapter } from '../../../../../../src/verticals/accounting/adapters/ifirma'
import { encodeCredentials } from '../../../../../../src/verticals/accounting/adapters/ifirma/auth'
import { TaxRateSchema } from '../../../../../../src/verticals/accounting/schema/taxrate'
import type {
  AccountingAdapter,
  QueryParams,
} from '../../../../../../src/verticals/accounting/adapter/interface'

/**
 * listTaxRates pages the whole VAT-rate list locally.
 *
 * https://api.ifirma.pl/stawki-vat-w-krajach-unii-europejskiej/ documents
 * `GET https://www.ifirma.pl/iapi/slownik/stawki_vat/{kod_kraju}.json` with
 * one optional query parameter, `data` (a date). There is no strona or
 * iloscNaStronie. The response is every rate for the country, in the object
 * `response` itself:
 *
 *   {"response":{"KodKraju":"lt","NazwaKraju":"Litwa","StawkiVat":[...]}}
 *
 * The adapter used to drop `page` and `limit`, so page 2 repeated page 1. It
 * also read the rates from `response.Wynik`, a wrapper this page does not
 * show, so the documented shape listed no rates at all.
 *
 * The fake upstream below serves the documented endpoint and reads no query
 * parameter at all: the adapter sends none, and the one the page documents
 * (`data`) would only pick the day the rates apply on.
 */

const CREDS = encodeCredentials('user@example.pl', 'EAB0D8ACF3308F3B')
const TAX_RATES_PATH = '/slownik/stawki_vat/PL.json'

interface Recorded {
  url: string
  params: Record<string, unknown> | undefined
}

type Shape = 'documented' | 'wynik'

interface FakeOptions {
  /** The documented envelope, or the Kod/Informacja/Wynik wrapper the invoice
   *  and contractor endpoints use. */
  shape?: Shape
  /** What `KodKraju` holds; `undefined` leaves the key out. Default 'pl'. */
  kodKraju?: string | undefined
  /** Served as `StawkiVat` in place of the generated R0..R(n-1) list. */
  stawkiVat?: unknown
  /** Answer with iFirma's error envelope instead: Kod and Informacja only. */
  error?: { Kod: number; Informacja: string }
}

/** Stand in for axios.create: every request lands here. */
function fakeUpstream(n: number, opts: FakeOptions = {}): Recorded[] {
  const requests: Recorded[] = []
  const stawki =
    'stawkiVat' in opts
      ? opts.stawkiVat
      : Array.from({ length: n }, (_, i) => ({ Rodzaj: `R${i}`, Wartosc: i }))
  const body: Record<string, unknown> = { NazwaKraju: 'Polska', StawkiVat: stawki }
  const kodKraju = 'kodKraju' in opts ? opts.kodKraju : 'pl'
  if (kodKraju !== undefined) body['KodKraju'] = kodKraju
  const create = (): unknown => ({
    get: async (url: string, config?: { params?: Record<string, unknown> }) => {
      requests.push({ url, params: config?.params })
      if (url !== TAX_RATES_PATH) throw new Error(`fake upstream: no route for ${url}`)
      if (opts.error) return { data: { response: { ...opts.error } } }
      return {
        data:
          (opts.shape ?? 'documented') === 'documented'
            ? { response: body }
            : { response: { Kod: 0, Informacja: '', Wynik: body } },
      }
    },
  })
  vi.spyOn(axios, 'create').mockImplementation(create as unknown as typeof axios.create)
  return requests
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `PL_R${i}`)

/** Poland's rate kinds, as the transform names them. */
const POLISH_RATES = [
  { Rodzaj: 'POD', Wartosc: 23 }, // PL Standard
  { Rodzaj: 'PR1', Wartosc: 8 }, //  PL Reduced (1)
  { Rodzaj: 'PR2', Wartosc: 5 }, //  PL Reduced (2)
  { Rodzaj: 'ZW', Wartosc: 0 }, //   PL Exempt
  { Rodzaj: 'NP', Wartosc: 0 }, //   PL Not subject to VAT
]

afterEach(() => vi.restoreAllMocks())

const adapter = new IfirmaAdapter()
/** The adapter as the router holds it, which is what parseListQuery reads. */
const routed: AccountingAdapter = adapter

/** Drive the method the way the sync worker does: page k at limit L. */
async function drive(limit: number, pages: number, extra: QueryParams = {}) {
  const served: Array<Array<string | undefined>> = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ ...extra, page, limit })
    const rows = await adapter.listTaxRates(CREDS, params)
    served.push(rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    // The paging-contract gate passes a local slice on this report alone.
    expect(meta?.pagedLocally).toBe(true)
    hasMore.push(meta?.hasMore)
    totals.push(meta?.totalCount)
  }
  return { served, hasMore, totals }
}

describe('IfirmaAdapter.listTaxRates pages the whole list locally', () => {
  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    const L = 2
    const N = 2 * L + 1
    fakeUpstream(N)
    const { served, hasMore, totals } = await drive(L, 3)
    expect(served).toEqual([['PL_R0', 'PL_R1'], ['PL_R2', 'PL_R3'], ['PL_R4']])
    expect(served.flat()).toEqual(ids(N))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
  })

  it('serves 2L + 1 rows at a page size above 100, which no document caps', async () => {
    const L = 150
    const N = 2 * L + 1
    fakeUpstream(N)
    const { served, hasMore, totals } = await drive(L, 3)
    expect(served.map((p) => p.length)).toEqual([150, 150, 1])
    expect(served.flat()).toEqual(ids(N))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
  })

  it('asks for the documented endpoint on page 2, with no paging parameter it would ignore', async () => {
    const requests = fakeUpstream(5)
    await adapter.listTaxRates(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe(TAX_RATES_PATH)
    // `data` is the only documented parameter, and the adapter has no date to send.
    expect(requests[0]!.params ?? {}).toEqual({})
  })

  it('ends on page 2 when N = 2L, and serves nothing past the end', async () => {
    const L = 3
    fakeUpstream(2 * L)
    const { served, hasMore } = await drive(L, 3)
    expect(served.flat()).toEqual(ids(2 * L))
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves every row on one page at a limit above anything the upstream holds', async () => {
    // No maximum page size is documented, so none is declared: a limit of 500
    // (the worker's size and the router's ceiling) takes the whole list.
    fakeUpstream(7)
    const { served, hasMore } = await drive(500, 2)
    expect(served[0]).toEqual(ids(7))
    expect(served[1]).toEqual([])
    expect(hasMore).toEqual([false, false])
  })

  it('serves 250 rows on one page at the worker size of 500', async () => {
    // A clamp to the adapter's undocumented MAX_PAGE_SIZE (100) would serve
    // 100 here and still report the end.
    fakeUpstream(250)
    const { served, hasMore, totals } = await drive(500, 1)
    expect(served[0]).toEqual(ids(250))
    expect(hasMore).toEqual([false])
    expect(totals).toEqual([250])
  })

  it('reads the rates from the documented envelope', async () => {
    fakeUpstream(3, { shape: 'documented' })
    const rows = await adapter.listTaxRates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids(3))
    expect(rows[0]!.name).toBe('PL R0')
    // The country iFirma confirmed, as it sent it.
    expect(rows.map((r) => r.metadata?.['KodKraju'])).toEqual(['pl', 'pl', 'pl'])
    for (const row of rows) expect(() => TaxRateSchema.parse(row)).not.toThrow()
  })

  it('still reads the rates, and the country, from a Wynik wrapper', async () => {
    fakeUpstream(3, { shape: 'wynik' })
    const { served, hasMore } = await drive(2, 2)
    expect(served.flat()).toEqual(ids(3))
    expect(hasMore).toEqual([true, false])
    const rows = await adapter.listTaxRates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.metadata?.['KodKraju'])).toEqual(['pl', 'pl', 'pl'])
  })

  it.each([
    ['empty', ''],
    ['absent', undefined],
  ])('falls back to PL when KodKraju is %s', async (_label, kodKraju) => {
    fakeUpstream(2, { kodKraju })
    const rows = await adapter.listTaxRates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['PL_R0', 'PL_R1'])
    expect(rows.map((r) => r.metadata?.['KodKraju'])).toEqual(['PL', 'PL'])
  })

  it('lists nothing, rather than crashing, when StawkiVat is not a list', async () => {
    fakeUpstream(0, { stawkiVat: { Rodzaj: 'POD', Wartosc: 23 } })
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter.listTaxRates(CREDS, params)).resolves.toEqual([])
  })

  it('pages at the limit parseListQuery delivers', async () => {
    fakeUpstream(5)
    const params = parseListQuery({ limit: '2', page: '2' }, routed)
    expect(params.limit).toBe(2)
    const rows = await adapter.listTaxRates(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['PL_R2', 'PL_R3'])
  })
})

describe('IfirmaAdapter.listTaxRates on an iFirma error envelope', () => {
  // https://api.ifirma.pl/faq/: Kod 0 is "poprawne przetworzenie", and every
  // other code is an error (100 technical problem, 400-403 authorisation,
  // 500 "brak uprawnień do danego zasobu", ...). An error body has no rates:
  // cut locally, it would report an empty, complete collection.
  it('throws the upstream error instead of reporting an empty collection', async () => {
    fakeUpstream(0, { error: { Kod: 500, Informacja: 'brak uprawnień do danego zasobu' } })
    const params = withPageSink({ page: 1, limit: 10 })
    const err = await adapter.listTaxRates(CREDS, params).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(err).toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
    expect((err as Error).message).toContain('Kod 500')
    expect((err as Error).message).toContain('brak uprawnień do danego zasobu')
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('reads a Wynik wrapper whose Kod is 0 as a success', async () => {
    fakeUpstream(2, { shape: 'wynik' })
    const rows = await adapter.listTaxRates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['PL_R0', 'PL_R1'])
  })
})

describe('IfirmaAdapter.listTaxRates honours search over the whole list', () => {
  // The adapter declares `search` for every resource, so the router lets the
  // term through. The rates are filtered before the local cut: the reported
  // total is then the number that match, not the number that exist.
  it('pages only the matching rates, ignoring case, and totals the matches', async () => {
    fakeUpstream(0, { stawkiVat: POLISH_RATES })
    const { served, hasMore, totals } = await drive(1, 3, { search: 'reduced' })
    expect(served).toEqual([['PL_PR1'], ['PL_PR2'], []])
    expect(hasMore).toEqual([true, false, false])
    expect(totals).toEqual([2, 2, 2])
  })

  it('matches the rate kind in the id', async () => {
    fakeUpstream(0, { stawkiVat: POLISH_RATES })
    const rows = await adapter.listTaxRates(
      CREDS,
      withPageSink({ page: 1, limit: 10, search: 'pl_zw' }),
    )
    expect(rows.map((r) => r.id)).toEqual(['PL_ZW'])
  })

  it('reports no rows and a total of 0 when nothing matches', async () => {
    fakeUpstream(0, { stawkiVat: POLISH_RATES })
    const { served, hasMore, totals } = await drive(10, 1, { search: 'zero-rated' })
    expect(served).toEqual([[]])
    expect(hasMore).toEqual([false])
    expect(totals).toEqual([0])
  })

  it('treats a blank term as no filter, as the router does', async () => {
    fakeUpstream(0, { stawkiVat: POLISH_RATES })
    const { served, totals } = await drive(10, 1, { search: '   ' })
    expect(served[0]).toEqual(['PL_POD', 'PL_PR1', 'PL_PR2', 'PL_ZW', 'PL_NP'])
    expect(totals).toEqual([5])
  })
})

describe('API path: parseListQuery + listPage', () => {
  async function apiPage(query: Record<string, string>) {
    const params = parseListQuery(query, routed)
    const items = await adapter.listTaxRates(CREDS, params)
    return listPage(items, params, adapter.platform)
  }

  it('reports hasMore and the total from the whole list', async () => {
    fakeUpstream(5)
    const pages = [
      await apiPage({ limit: '2', page: '1' }),
      await apiPage({ limit: '2', page: '2' }),
      await apiPage({ limit: '2', page: '3' }),
    ]
    expect(pages.flatMap((p) => p.data.map((r) => r.id))).toEqual(ids(5))
    expect(pages.map((p) => p.meta.hasMore)).toEqual([true, true, false])
    expect(pages.map((p) => p.meta.totalCount)).toEqual([5, 5, 5])
  })

  it('says there is no more after a full last page', async () => {
    fakeUpstream(4)
    const last = await apiPage({ limit: '2', page: '2' })
    expect(last.data.map((r) => r.id)).toEqual(['PL_R2', 'PL_R3'])
    expect(last.meta.hasMore).toBe(false)
  })

  it('serves 150 rows at limit=500 on one page', async () => {
    fakeUpstream(150)
    const page = await apiPage({ limit: '500', page: '1' })
    expect(page.data.map((r) => r.id)).toEqual(ids(150))
    expect(page.meta.hasMore).toBe(false)
    expect(page.meta.totalCount).toBe(150)
  })

  it('totals only the rates that match ?search', async () => {
    fakeUpstream(0, { stawkiVat: POLISH_RATES })
    const first = await apiPage({ search: 'Reduced', limit: '1', page: '1' })
    expect(first.data.map((r) => r.id)).toEqual(['PL_PR1'])
    expect(first.meta.hasMore).toBe(true)
    expect(first.meta.totalCount).toBe(2)
  })
})
