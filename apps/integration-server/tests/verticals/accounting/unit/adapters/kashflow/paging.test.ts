import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import { KashflowAdapter } from '../../../../../../src/verticals/accounting/adapters/kashflow'
import type { KashflowTax } from '../../../../../../src/verticals/accounting/adapters/kashflow/transform/taxrate'
import { TaxRateSchema } from '../../../../../../src/verticals/accounting/schema/taxrate'
import type {
  AccountingAdapter,
  QueryParams,
} from '../../../../../../src/verticals/accounting/adapter/interface'

/**
 * listTaxRates pages the whole tax list locally.
 *
 * https://www.kashflow.com/developers/rest-api/tax-list/ documents
 * `GET https://api.kashflow.com/v2/taxes` with one optional query parameter,
 * `type`: "'supply' or 'purchase' to indicate whether the taxes to be fetched
 * are associated with supply or purchase respectively", default 'supply'.
 * There is no page or perpage. "GET of taxes returns list of all taxes setup
 * for user account", wrapped under a `Tax` key.
 *
 * The adapter used to drop `page` and `limit`, so page 2 repeated page 1. It
 * also sent no `type`, so only the supply-side taxes were ever listed. Every
 * tax is fetched now, supply then purchase, once each by the id it is served
 * under (Code, else Id), and the caller's page is cut from that.
 *
 * The fake upstream below serves the documented endpoint and honours only
 * `type`: any other parameter changes nothing, as on the real API.
 */

const CREDS = { accessToken: 'kf-session-token' }

type TaxType = 'supply' | 'purchase'

interface Recorded {
  url: string
  params: Record<string, unknown> | undefined
}

interface FakeTax extends KashflowTax {
  on: readonly TaxType[]
}

/** Tax i: Code `T{i}`, Id i + 1, on the given lists. */
function tax(i: number, on: readonly TaxType[]): FakeTax {
  return { Code: `T${i}`, Description: `Tax ${i}`, Id: i + 1, Rate: i, on }
}

/** What each `type` answers: its rows, or an error the request fails with. */
type Lists = Record<TaxType, readonly KashflowTax[] | Error>

/**
 * Stand in for axios.create: every request lands here. `type` picks the list,
 * and it defaults to 'supply' as the docs say.
 */
function serve(lists: Lists): Recorded[] {
  const requests: Recorded[] = []
  const create = (): unknown => ({
    get: async (url: string, config?: { params?: Record<string, unknown> }) => {
      requests.push({ url, params: config?.params })
      if (url !== 'taxes') throw new Error(`fake upstream: no route for ${url}`)
      const type = config?.params?.['type'] ?? 'supply'
      if (type !== 'supply' && type !== 'purchase') {
        throw new Error(`fake upstream: undocumented type ${String(type)}`)
      }
      const list = lists[type]
      if (list instanceof Error) throw list
      return { data: { Tax: list } }
    },
  })
  vi.spyOn(axios, 'create').mockImplementation(create as unknown as typeof axios.create)
  return requests
}

/** Serve taxes that each say which lists they are on. */
function fakeUpstream(taxes: readonly FakeTax[]): Recorded[] {
  const on = (type: TaxType) =>
    taxes.filter((t) => t.on.includes(type)).map(({ on: _on, ...rest }) => rest as KashflowTax)
  return serve({ supply: on('supply'), purchase: on('purchase') })
}

/** An upstream row as JSON may carry it, nulls included. */
const row = (fields: Record<string, unknown>) => fields as KashflowTax

/** The error axios raises for a 404, which withRetry does not retry. */
const notFound = () =>
  Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } })

/**
 * N taxes, in the order the adapter lists them: supply taxes first, one of
 * them on both lists, then purchase-only taxes.
 */
function mixed(n: number): FakeTax[] {
  const supply = Math.ceil(n / 2)
  return Array.from({ length: n }, (_, i) =>
    i < supply ? tax(i, i === 0 ? ['supply', 'purchase'] : ['supply']) : tax(i, ['purchase']),
  )
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`)

afterEach(() => vi.restoreAllMocks())

const adapter = new KashflowAdapter()
/** The adapter as the router holds it, which is what parseListQuery reads. */
const routed: AccountingAdapter = adapter

/** Drive the method the way the sync worker does: page k at limit L. */
async function drive(limit: number, pages: number) {
  const served: Array<Array<string | undefined>> = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit })
    const rows = await adapter.listTaxRates(CREDS, params)
    served.push(rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    totals.push(meta?.totalCount)
  }
  return { served, hasMore, totals }
}

describe('KashflowAdapter.listTaxRates pages the whole list locally', () => {
  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    const L = 2
    const N = 2 * L + 1
    fakeUpstream(mixed(N))
    const { served, hasMore, totals } = await drive(L, 3)
    expect(served).toEqual([['T0', 'T1'], ['T2', 'T3'], ['T4']])
    expect(served.flat()).toEqual(ids(N))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
  })

  it('asks for both documented types on page 2, and no paging parameter it would ignore', async () => {
    const requests = fakeUpstream(mixed(5))
    await adapter.listTaxRates(CREDS, withPageSink({ page: 2, limit: 2 }))
    const sorted = [...requests].sort((a, b) =>
      String(a.params?.['type']).localeCompare(String(b.params?.['type'])),
    )
    expect(sorted).toEqual([
      { url: 'taxes', params: { type: 'purchase' } },
      { url: 'taxes', params: { type: 'supply' } },
    ])
  })

  it('lists the purchase-side taxes the default type leaves out', async () => {
    fakeUpstream([tax(0, ['supply']), tax(1, ['purchase']), tax(2, ['purchase'])])
    const rows = await adapter.listTaxRates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['T0', 'T1', 'T2'])
    for (const r of rows) expect(() => TaxRateSchema.parse(r)).not.toThrow()
    // The upstream row has no type, so the list it came from is recorded.
    expect(rows.map((r) => r.metadata?.['kashflowTypes'])).toEqual([
      ['supply'],
      ['purchase'],
      ['purchase'],
    ])
  })

  it('serves a tax on both lists once, and counts it once', async () => {
    fakeUpstream([
      tax(0, ['supply', 'purchase']),
      tax(1, ['supply']),
      tax(2, ['supply', 'purchase']),
      tax(3, ['purchase']),
    ])
    const { served, hasMore, totals } = await drive(2, 2)
    expect(served.flat()).toEqual(['T0', 'T1', 'T2', 'T3'])
    expect(hasMore).toEqual([true, false])
    expect(totals).toEqual([4, 4])
    const rows = await adapter.listTaxRates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.metadata?.['kashflowTypes'])).toEqual([
      ['supply', 'purchase'],
      ['supply'],
      ['supply', 'purchase'],
      ['purchase'],
    ])
  })

  it('ends on page 2 when N = 2L, and serves nothing past the end', async () => {
    const L = 3
    fakeUpstream(mixed(2 * L))
    const { served, hasMore } = await drive(L, 3)
    expect(served.flat()).toEqual(ids(2 * L))
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves every row on one page at a limit above anything the upstream holds', async () => {
    // No maximum page size is documented for /taxes, so a limit of 500 (the
    // worker's size and the router's ceiling) takes the whole list. 500 rows,
    // so that a hidden local cap below 500 would show as a short first page.
    fakeUpstream(mixed(500))
    const { served, hasMore, totals } = await drive(500, 2)
    expect(served[0]).toEqual(ids(500))
    expect(served[1]).toEqual([])
    expect(hasMore).toEqual([false, false])
    expect(totals).toEqual([500, 500])
  })

  it('pages at the limit parseListQuery delivers', async () => {
    fakeUpstream(mixed(5))
    const params = parseListQuery({ limit: '2', page: '2' }, routed)
    expect(params.limit).toBe(2)
    const rows = await adapter.listTaxRates(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['T2', 'T3'])
  })
})

describe('KashflowAdapter.getTaxRate resolves every listed tax', () => {
  it('finds a purchase-only tax by code and by id', async () => {
    fakeUpstream([tax(0, ['supply']), tax(1, ['purchase'])])
    const byCode = await adapter.getTaxRate(CREDS, 'T1')
    expect(byCode.id).toBe('T1')
    expect(byCode.metadata?.['kashflowTypes']).toEqual(['purchase'])
    expect((await adapter.getTaxRate(CREDS, '2')).id).toBe('T1')
  })

  it('still throws for a tax on neither list', async () => {
    fakeUpstream([tax(0, ['supply']), tax(1, ['purchase'])])
    await expect(adapter.getTaxRate(CREDS, 'T9')).rejects.toThrow(/not found/)
  })
})

describe('KashflowAdapter merges the two lists by the id it serves', () => {
  // The docs call both Id and Code "unique" without saying across what, and
  // their example lists the purchase codes TX7 and IM at Ids 1 and 2. So each
  // list may number its own Ids: a supply tax and a purchase tax can share one.
  const perTypeIds: Lists = {
    supply: [
      { Code: 'SR', Description: 'Standard-rated supplies', Id: 1, Rate: 7 },
      { Code: 'ZR', Description: 'Zero-rated supplies', Id: 2, Rate: 0 },
    ],
    purchase: [
      { Code: 'TX7', Description: 'Purchases with GST incurred at 7% and', Id: 1, Rate: 7 },
      { Code: 'IM', Description: 'GST incurred for import of goods', Id: 2, Rate: 7 },
    ],
  }

  it('keeps purchase taxes whose Ids repeat supply Ids', async () => {
    serve(perTypeIds)
    const { served, hasMore, totals } = await drive(2, 2)
    expect(served).toEqual([
      ['SR', 'ZR'],
      ['TX7', 'IM'],
    ])
    expect(hasMore).toEqual([true, false])
    expect(totals).toEqual([4, 4])
    const tx7 = await adapter.getTaxRate(CREDS, 'TX7')
    expect(tx7.description).toBe('Purchases with GST incurred at 7% and')
    expect(tx7.metadata?.['kashflowTypes']).toEqual(['purchase'])
  })

  it('serves a Code on both lists once, whatever its Ids, tagged with both types', async () => {
    serve({
      supply: [{ Code: 'T1', Description: 'Tax 1', Id: 1, Rate: 20 }],
      purchase: [{ Code: 'T1', Description: 'Tax 1', Id: 7, Rate: 20 }],
    })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter.listTaxRates(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['T1'])
    expect(rows[0]?.metadata?.['kashflowTypes']).toEqual(['supply', 'purchase'])
    expect(readUpstreamPage(params)?.totalCount).toBe(1)
  })

  it('tags a tax once per list even if a list repeats it', async () => {
    serve({
      supply: [row({ Code: 'T0', Id: 1 }), row({ Code: 'T0', Id: 1 })],
      purchase: [],
    })
    const rows = await adapter.listTaxRates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['T0'])
    expect(rows[0]?.metadata?.['kashflowTypes']).toEqual(['supply'])
  })

  it('keeps a tax with no Code once by its Id, and every tax with neither', async () => {
    serve({
      supply: [
        row({ Description: 'A', Id: 9, Rate: 5 }),
        row({ Description: 'N1', Id: null, Rate: 1 }),
      ],
      purchase: [
        row({ Description: 'A', Id: 9, Rate: 5 }),
        row({ Description: 'K2', Rate: 2 }),
        row({ Code: null, Description: 'N3', Id: null, Rate: 3 }),
      ],
    })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter.listTaxRates(CREDS, params)
    expect(rows.map((r) => [r.id, r.description])).toEqual([
      ['9', 'A'],
      [undefined, 'N1'],
      [undefined, 'K2'],
      [undefined, 'N3'],
    ])
    expect(rows[0]?.metadata?.['kashflowTypes']).toEqual(['supply', 'purchase'])
    expect(readUpstreamPage(params)?.totalCount).toBe(4)
    for (const r of rows) expect(() => TaxRateSchema.parse(r)).not.toThrow()
  })
})

describe('KashflowAdapter fails the call when either list request fails', () => {
  // Serving one list as the whole collection would have it cached as complete.
  it.each(['supply', 'purchase'] as const)(
    'rejects when the %s request fails, rather than serving the other list',
    async (failing) => {
      const lists: Lists = {
        supply: [row({ Code: 'T0', Id: 1 })],
        purchase: [row({ Code: 'T1', Id: 2 })],
      }
      lists[failing] = notFound()
      serve(lists)
      const params = withPageSink({ page: 1, limit: 10 })
      await expect(adapter.listTaxRates(CREDS, params)).rejects.toThrow(/404/)
      expect(readUpstreamPage(params)).toBeUndefined()
      // Even a tax the other list holds is not looked up from half the data.
      const other = failing === 'supply' ? 'T1' : 'T0'
      await expect(adapter.getTaxRate(CREDS, other)).rejects.toThrow(/404/)
    },
  )
})

describe('API path: parseListQuery + listPage', () => {
  async function apiPage(query: Record<string, string>) {
    const params = parseListQuery(query, routed)
    const items = await adapter.listTaxRates(CREDS, params)
    return listPage(items, params, adapter.platform)
  }

  it('reports hasMore and the total from the whole list', async () => {
    fakeUpstream(mixed(5))
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
    fakeUpstream(mixed(4))
    const last = await apiPage({ limit: '2', page: '2' })
    expect(last.data.map((r) => r.id)).toEqual(['T2', 'T3'])
    expect(last.meta.hasMore).toBe(false)
  })
})
