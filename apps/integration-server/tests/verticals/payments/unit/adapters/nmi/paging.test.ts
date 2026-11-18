/**
 * NMI Query API paging, against a fake upstream that honours only the
 * documented parameters.
 *
 * https://docs.nmi.com/reference/query, requestBody property page_number:
 *   "Determines which "page" of results are returned. For example,
 *   `result_limit=100&page_number=0` will return the first 100 results. Using
 *   `page_number=1` will return the next 100 results. Default - `0`."
 * result_limit: "Determines the maximum number of results that may return for
 *   the current query." No maximum is documented, and the XML carries no total
 *   or has-more field.
 *
 * listCharges, listSubscriptions and listInvoices used to send `page_number=1`
 * whatever the caller asked for. page_number is 0-based, so every caller page
 * was upstream rows limit+1..2*limit: the first `limit` rows were never served
 * and page 2 repeated page 1. They also clamped result_limit to an undocumented
 * 200, so a limit above 200 got 200 rows that read as the last page.
 *
 * The fake answers POST /api/query.php at the seam the client uses (the axios
 * instance `axios.create` returns): a form-encoded body in, XML text out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { NmiAdapter } from '../../../../../../src/verticals/payments/adapters/nmi/index'

const creds = { accessToken: 'sec-key', extra: { environment: 'sandbox' } }

const DOCUMENTED = new Set(['security_key', 'report_type', 'result_limit', 'page_number'])

/** report_type → the XML element each row is wrapped in, and its id tag. */
const REPORTS = {
  transaction: { tag: 'transaction', id: 'transaction_id' },
  recurring: { tag: 'subscription', id: 'subscription_id' },
  invoicing: { tag: 'invoice', id: 'invoice_id' },
} as const
type Report = keyof typeof REPORTS

let requests: Record<string, string>[] = []

class UpstreamError extends Error {}

function row(report: Report, id: string): string {
  const { tag, id: idTag } = REPORTS[report]
  const extra =
    report === 'transaction'
      ? '<condition>complete</condition><amount>1.00</amount><currency>USD</currency>'
      : report === 'recurring'
        ? '<plan_amount>1.00</plan_amount><day_frequency>30</day_frequency>'
        : '<status>open</status><amount>1.00</amount><currency>USD</currency>'
  return `<${tag}><${idTag}>${id}</${idTag}>${extra}</${tag}>`
}

/** Serves `n` rows (ids 1..n) for `report`. */
function serve(report: Report, n: number) {
  const ids = Array.from({ length: n }, (_, i) => String(i + 1))
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    post: vi.fn(async (url: string, body: string) => {
      if (url !== '/api/query.php') throw new UpstreamError(`unexpected url ${url}`)
      const form = Object.fromEntries(new URLSearchParams(body).entries())
      requests.push(form)
      for (const k of Object.keys(form)) {
        if (!DOCUMENTED.has(k)) throw new UpstreamError(`undocumented parameter ${k}`)
      }
      if (form['security_key'] !== 'sec-key') throw new UpstreamError('bad key')
      if (form['report_type'] !== report) {
        throw new UpstreamError(`report_type ${String(form['report_type'])}`)
      }
      const pageNumber = form['page_number'] === undefined ? 0 : Number(form['page_number'])
      if (!Number.isInteger(pageNumber) || pageNumber < 0) {
        throw new UpstreamError(`page_number ${form['page_number']}`)
      }
      const limit = form['result_limit'] === undefined ? n : Number(form['result_limit'])
      if (!Number.isInteger(limit) || limit < 1) {
        throw new UpstreamError(`result_limit ${form['result_limit']}`)
      }
      const start = pageNumber * limit
      const xml = ids
        .slice(start, start + limit)
        .map((id) => row(report, id))
        .join('')
      return { data: `<?xml version="1.0"?><nm_response>${xml}</nm_response>` }
    }),
  })) as unknown as typeof axios.create)
}

const METHODS = [
  ['listCharges', 'transaction'],
  ['listSubscriptions', 'recurring'],
  ['listInvoices', 'invoicing'],
] as const

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(METHODS)('nmi %s paging', (method, report) => {
  function list(params: QueryParams): Promise<{ id: string }[]> {
    return new NmiAdapter()[method](creds, params)
  }
  // NmiAdapter declares no capabilities, so it shares no property with the
  // weak type parseListQuery reads; the router passes it the same way.
  const routed = new NmiAdapter() as PageMaxBearing

  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(report, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(listPage(rows, params, 'nmi').meta.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends page_number = page - 1 and result_limit = limit on page 2', async () => {
    serve(report, 7)
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(requests[0]).toEqual({
      security_key: 'sec-key',
      report_type: report,
      result_limit: '3',
      page_number: '1',
    })
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serve(report, 6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await list(params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(listPage(rows, params, 'nmi').meta.hasMore).toBe(false)
  })

  it('answers an empty collection with hasMore false and no probe', async () => {
    serve(report, 0)
    const params = withPageSink({ page: 1, limit: 3 })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it('sends a limit above the old 200 clamp unchanged and still serves every row', async () => {
    const L = 500
    const N = 2 * L + 5
    serve(report, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      expect(requests[0]!['result_limit']).toBe(String(L))
      seen.push(...rows.map((r) => r.id))
      requests = []
      if (listPage(rows, params, 'nmi').meta.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(report, 7)
    const params = parseListQuery({ page: '2', limit: '3' }, routed)
    const out = listPage(await list(params), params, 'nmi')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' }, routed)
    const tail = listPage(await list(last), last, 'nmi')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })

  it('serves the first page when the router sends no page (GET with no ?page)', async () => {
    serve(report, 7)
    const params = parseListQuery({ limit: '3' }, routed)
    expect(params.page).toBeUndefined()
    const out = listPage(await list(params), params, 'nmi')
    expect(requests[0]!['page_number']).toBe('0')
    expect(out.data.map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(out.meta.hasMore).toBe(true)
  })

  it.each([
    [0, '0', ['1', '2', '3']],
    [-4, '0', ['1', '2', '3']],
    [Number.NaN, '0', ['1', '2', '3']],
    [2.5, '1', ['4', '5', '6']],
  ])('normalises a direct caller page of %s to page_number %s', async (page, pageNumber, ids) => {
    serve(report, 7)
    const rows = await list(withPageSink({ page, limit: 3 }))
    expect(requests[0]!['page_number']).toBe(pageNumber)
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('sends the adapter default page size when no limit is given', async () => {
    serve(report, 0)
    await list(withPageSink({ page: 1 }))
    expect(requests[0]!['result_limit']).toBe('100')
  })

  it('sends a direct caller limit above 1000 unchanged', async () => {
    const L = 1500
    serve(report, L + 1)
    const params = withPageSink({ page: 1, limit: L })
    const rows = await list(params)
    expect(requests[0]!['result_limit']).toBe(String(L))
    expect(rows).toHaveLength(L)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('clamps a limit above the router maximum on the API path and still serves every row', async () => {
    const first = parseListQuery({ page: '1', limit: '100000' }, routed)
    const L = first.limit!
    expect(L).toBeLessThan(100000)
    const N = L + 2
    serve(report, N)
    const seen: string[] = []
    for (let page = 1; page <= 5; page++) {
      const params = parseListQuery({ page: String(page), limit: '100000' }, routed)
      const out = listPage(await list(params), params, 'nmi')
      expect(requests[0]!['result_limit']).toBe(String(L))
      seen.push(...out.data.map((r) => r.id))
      requests = []
      if (out.meta.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })
})

describe('nmi capabilities', () => {
  it('declares no maxPageSize: result_limit has no documented maximum', () => {
    expect((new NmiAdapter() as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })
})
