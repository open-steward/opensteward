import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ViafirmaClient } from '../../../../../../src/verticals/docsign/adapters/viafirma/client'
import { ViafirmaAdapter } from '../../../../../../src/verticals/docsign/adapters/viafirma'

/**
 * Signers and documents both come from `GET /documents/api/v3/set/summary/{setCode}`,
 * whose only input is the SET code ("Input parameters: setCode"): the summary
 * carries the SET's whole `links` and `messages` arrays
 * (https://doc.viafirma.com/documents/api/latest/en/set_summary.html). There
 * is no upstream page to ask for, so the adapter must page the collection
 * itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const SET = 'SET-1'
const L = 2
const N = 2 * L + 1

function fakeSet(n: number) {
  const links = Array.from({ length: n }, (_, i) => ({
    key: `key-${i}`,
    messageCode: `msg-${i}`,
    status: 'RECEIVED',
    mail: `s${i}@example.com`,
    name: `Signer ${i}`,
  }))
  const messages = Array.from({ length: n }, (_, i) => ({ code: `msg-${i}` }))
  return { code: SET, status: 'RECEIVED', links, messages }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGetSet(n: number) {
  return vi
    .spyOn(ViafirmaClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/set/summary/${SET}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('set/summary takes no paging params')
      return fakeSet(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new ViafirmaAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const idsFor = (n: number) => Array.from({ length: n }, (_, i) => `${SET}:msg-${i}`)
const METHODS: Array<[string, Lister]> = [
  ['listSigners', (c, id, p) => adapter.listSigners(c, id, p)],
  ['listDocuments', (c, id, p) => adapter.listDocuments(c, id, p)],
]

describe.each(METHODS)('ViafirmaAdapter.%s pages the whole SET summary locally', (_name, list) => {
  const ids = idsFor(N)

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGetSet(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, SET, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameter; every page asks for the summary.
    for (const call of get.mock.calls) expect(call).toEqual([`/set/summary/${SET}`])
  })

  it('page 2 is not page 1', async () => {
    mockGetSet(N)
    const p1 = await list(CREDS, SET, withPageSink({ page: 1, limit: L }))
    const p2 = await list(CREDS, SET, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('a limit above the collection size serves everything once, with no next page', async () => {
    mockGetSet(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await list(CREDS, SET, params)
    expect(rows.map((r) => r.id)).toEqual(ids)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns the whole collection (used by the get* lookups)', async () => {
    mockGetSet(N)
    const rows = await list(CREDS, SET, {})
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGetSet(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, SET, params)
    const env = listPage(rows, params, 'viafirma')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('ViafirmaAdapter get* lookups still see the whole SET', () => {
  it('getSigner finds the last link and getDocument the last message', async () => {
    mockGetSet(N)
    const s = await adapter.getSigner(CREDS, `${SET}:msg-${N - 1}`)
    expect(s.externalId).toBe(`msg-${N - 1}`)
    const d = await adapter.getDocument(CREDS, `${SET}:msg-${N - 1}`)
    expect(d.externalId).toBe(`msg-${N - 1}`)
  })
})
