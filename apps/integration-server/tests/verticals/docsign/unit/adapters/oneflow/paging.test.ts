/**
 * Paging for Oneflow's contract-child list methods.
 *
 * `GET /contracts/{contract_id}` takes only the path id (plus auth headers)
 * and returns the whole contract, `parties[]` and each party's
 * `participants[]` included
 * (https://developer.oneflow.com/reference/get-a-contract-by-id.md: "The
 * parties involved in this contract." / "The maximum number of participants
 * per contract across all parties is 40."). Nothing upstream pages it, so
 * signers (participants flattened across parties) and the one contract
 * document are paged locally. Before this, both methods ignored `page` and
 * page 2 repeated page 1.
 *
 * `listAuditTrailEntries` refuses with 501 before any request; that is pinned
 * in audit-trail.test.ts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { OneflowClient } from '../../../../../../src/verticals/docsign/adapters/oneflow/client'
import { OneflowAdapter } from '../../../../../../src/verticals/docsign/adapters/oneflow'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new OneflowAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
const ENV = '10001'

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /contracts/{id}` with `n` participants split over two parties
 * (the first party gets the first half, rounded up). It honours only the
 * documented path id and rejects any query parameter, since the endpoint
 * documents none.
 */
function mockContract(n: number) {
  const ps = Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    email: `p${i}@example.com`,
    name: `P${i}`,
  }))
  const cut = Math.ceil(n / 2)
  return vi
    .spyOn(OneflowClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/contracts/${ENV}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /contracts/{id} documents no query params')
      return {
        id: Number(ENV),
        name: 'Contract',
        parties: [{ participants: ps.slice(0, cut) }, { participants: ps.slice(cut) }],
      } as never
    })
}

const pids = (n: number) => Array.from({ length: n }, (_, i) => String(100 + i))

describe('OneflowAdapter.listSigners pages the contract participants locally', () => {
  const L = 2
  const N = 2 * L + 1

  it('with N = 2L+1 participants, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockContract(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, ENV, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(pids(N))
    expect(more).toEqual([true, true, false])
    // Every request is the bare documented path: no paging key exists upstream.
    for (const c of get.mock.calls) expect(c).toEqual([`/contracts/${ENV}`])
  })

  it('page 2 is not page 1', async () => {
    mockContract(N)
    const p1 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, ENV, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(['100', '101'])
    expect(p2.map((r) => r.id)).toEqual(['102', '103'])
  })

  it('a limit above the 40-participant maximum returns the whole contract and ends', async () => {
    mockContract(40)
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    expect(rows.map((r) => r.id)).toEqual(pids(40))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns every participant', async () => {
    mockContract(N)
    expect(await adapter.listSigners(CREDS, ENV, {})).toHaveLength(N)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockContract(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, ENV, params)
    const env = listPage(rows, params, 'oneflow')
    expect(env.data.map((r) => r.id)).toEqual(['102', '103'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('OneflowAdapter.listDocuments pages the one contract document locally', () => {
  it('page 1 holds the contract document and page 2 is empty', async () => {
    mockContract(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, ENV, p1)).map((d) => d.id)).toEqual([ENV])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, ENV, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockContract(0)
    const params = parseListQuery({ page: '2', limit: '1' })
    const rows = await adapter.listDocuments(CREDS, ENV, params)
    const env = listPage(rows, params, 'oneflow')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})
