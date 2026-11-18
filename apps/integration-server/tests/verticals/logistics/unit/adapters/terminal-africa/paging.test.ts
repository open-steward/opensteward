/**
 * Terminal Africa list paging. listCarriers always asked for `page: 1`, so
 * page 2 repeated page 1 and nothing past the first page could be reached.
 *
 * First-party docs, https://docs.terminal.africa/tship/carrier/get-carriers.md
 * (GET https://api.terminal.africa/v1/carriers), query parameters:
 *   perPage: "Specify how many records will be included in a single response. Defaults to 100."
 *   page:    "Specify what page of records will be sent in response. Defaults to 1."
 *   active, type: filters.
 * The response carries `data.carriers` and `data.pagination`, whose
 * `hasNextPage` is the next-page signal (`nextPage`, `total`, `pageCount` too).
 *
 * No maximum perPage is documented. The adapter keeps its existing cap of 100
 * (the documented default) and reports it as the page size it served at.
 *
 * listShipments / listTrackingEvents are covered in ./shipments.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'

const { getMock, ClientCtor } = vi.hoisted(() => {
  const getMock = vi.fn()
  const ClientCtor = vi.fn().mockImplementation(function TerminalAfricaClientMock() {
    return { get: getMock }
  })
  return { getMock, ClientCtor }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/terminal-africa/client', () => ({
  TerminalAfricaClient: ClientCtor,
}))

import { TerminalAfricaAdapter } from '../../../../../../src/verticals/logistics/adapters/terminal-africa'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'

const CREDS = { accessToken: 'TEST_token' } as Credentials
const L = 5
const N = 2 * L + 1
const DEFAULT_PER_PAGE = 100
const ADAPTER_CAP = 100
const ADAPTER_DEFAULT = 50
const CALL_BUDGET = 40
const CARRIER_KEYS = new Set(['active', 'type', 'perPage', 'page'])

const ids = (n: number) => Array.from({ length: n }, (_, i) => `CA-${i + 1}`)

/**
 * A fake GET /v1/carriers honouring ONLY the documented query params:
 * `perPage` (default 100) and `page` (default 1), plus the `active` / `type`
 * filters. Anything else is a 400.
 */
function fakeCarriers(total: number) {
  let calls = 0
  const rows = ids(total).map((carrier_id) => ({ carrier_id, slug: carrier_id.toLowerCase() }))
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'carriers') throw new Error(`404: ${path}`)
    const q = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))
    const bad = Object.keys(q).filter((k) => !CARRIER_KEYS.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const page = q.page === undefined ? 1 : Number(q.page)
    const perPage = q.perPage === undefined ? DEFAULT_PER_PAGE : Number(q.perPage)
    if (!(Number.isInteger(page) && page >= 1)) throw new Error(`400: page ${page}`)
    if (!(Number.isInteger(perPage) && perPage >= 1)) throw new Error(`400: perPage ${perPage}`)
    const start = (page - 1) * perPage
    const hasNextPage = start + perPage < rows.length
    return {
      status: true,
      message: 'Carriers retrieved successfully',
      data: {
        carriers: rows.slice(start, start + perPage),
        pagination: {
          page,
          perPage,
          prevPage: page > 1 ? page - 1 : null,
          nextPage: hasNextPage ? page + 1 : null,
          currentPage: page,
          total: rows.length,
          pageCount: Math.ceil(rows.length / perPage),
          pagingCounter: start + 1,
          hasPrevPage: page > 1,
          hasNextPage,
        },
      },
    }
  })
  return rows.map((r) => r.carrier_id)
}

beforeEach(() => {
  ClientCtor.mockClear()
  getMock.mockReset()
})

describe('terminal-africa listCarriers paging', () => {
  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const expected = fakeCarriers(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new TerminalAfricaAdapter().listCarriers(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and perPage', async () => {
    fakeCarriers(N)
    await new TerminalAfricaAdapter().listCarriers(CREDS, withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    const [path, params] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('carriers')
    expect(params).toEqual({ page: 2, perPage: L })
  })

  it('a limit above the adapter cap is clamped to perPage 100 and reported as the page size', async () => {
    const expected = fakeCarriers(150)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new TerminalAfricaAdapter().listCarriers(CREDS, params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent.perPage).toBe(ADAPTER_CAP)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(0, ADAPTER_CAP))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: ADAPTER_CAP, totalCount: 150 }),
    )
  })

  it('with no page or limit, asks for page 1 at the adapter default page size', async () => {
    fakeCarriers(N)
    const params = withPageSink({})
    await new TerminalAfricaAdapter().listCarriers(CREDS, params)
    const sent = (getMock.mock.calls[0] as [string, Record<string, unknown>])[1]
    expect(sent).toEqual({ page: 1, perPage: ADAPTER_DEFAULT })
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, pageSize: ADAPTER_DEFAULT }),
    )
  })

  it('a response without pagination still reports the capped page size', async () => {
    getMock.mockResolvedValue({
      status: true,
      data: { carriers: ids(ADAPTER_CAP).map((carrier_id) => ({ carrier_id })) },
    })
    const params = withPageSink({ page: 1, limit: 500 })
    await new TerminalAfricaAdapter().listCarriers(CREDS, params)
    const reported = readUpstreamPage(params)
    expect(reported?.pageSize).toBe(ADAPTER_CAP)
    expect(reported?.hasMore).toBeUndefined()
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const expected = fakeCarriers(N)
    const adapter = new TerminalAfricaAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter.listCarriers(CREDS, params), params, 'terminal-africa')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})
