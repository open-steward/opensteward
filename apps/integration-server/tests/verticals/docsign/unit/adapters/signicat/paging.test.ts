/**
 * Paging for Signicat's session-child list methods.
 *
 * `GET /signing-sessions/{sessionId}` ("Returns the signing session with the
 * given ID.", https://developer.signicat.com/apis/sign-openapi.json) takes
 * only the path id and returns the whole `SigningSession`, whose required
 * `documents` array has `"maxItems": 100` and `signingSetup` array has
 * `"maxItems": 1`. Nothing upstream pages either array, so signers
 * (synthesised from `signingSetup[]`) and documents are paged locally.
 * Before this, both methods ignored `page` and page 2 repeated page 1.
 *
 * The signer fake carries more setups than the documented maximum of 1 only
 * to exercise the pager; a spec-shaped single-setup session is pinned too.
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
import { SignicatClient } from '../../../../../../src/verticals/docsign/adapters/signicat/client'
import { SignicatAdapter } from '../../../../../../src/verticals/docsign/adapters/signicat'

const CREDS = { accessToken: 'tok' } as Credentials
const adapter = new SignicatAdapter({ clientId: 'c', clientSecret: 's' })
const SID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /signing-sessions/{sessionId}` with `setups` signing setups and
 * `docs` documents. It honours only the documented path id and rejects any
 * query parameter, since the endpoint documents none.
 */
function mockSession(setups: number, docs: number) {
  return vi
    .spyOn(SignicatClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/signing-sessions/${SID}`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) {
        throw new Error('GET /signing-sessions/{sessionId} documents no query params')
      }
      return {
        id: SID,
        title: 'Session',
        lifecycle: { state: 'READY' },
        signingSetup: Array.from({ length: setups }, () => ({ signingFlow: 'REDIRECT' })),
        documents: Array.from({ length: docs }, (_, i) => ({
          documentId: `doc-${i}`,
          action: 'SIGN',
        })),
      } as never
    })
}

const L = 2
const N = 2 * L + 1
const sids = (n: number) => Array.from({ length: n }, (_, i) => `${SID}:${i}`)
const dids = (n: number) => Array.from({ length: n }, (_, i) => `doc-${i}`)

describe('SignicatAdapter.listSigners pages the session signing setups locally', () => {
  it('with N = 2L+1 setups, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockSession(N, 0)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, SID, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(sids(N))
    expect(more).toEqual([true, true, false])
    // Every request is the bare documented path: no paging key exists upstream.
    for (const c of get.mock.calls) expect(c).toEqual([`/signing-sessions/${SID}`])
  })

  it('page 2 is not page 1', async () => {
    mockSession(N, 0)
    const p1 = await adapter.listSigners(CREDS, SID, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, SID, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(sids(N).slice(0, 2))
    expect(p2.map((r) => r.id)).toEqual(sids(N).slice(2, 4))
  })

  it('a spec-shaped session (one setup) fits on page 1 and page 2 is empty', async () => {
    mockSession(1, 1)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listSigners(CREDS, SID, p1)).map((r) => r.id)).toEqual(sids(1))
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listSigners(CREDS, SID, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('without a limit returns every setup (getSigner relies on this)', async () => {
    mockSession(N, 0)
    expect(await adapter.listSigners(CREDS, SID, {})).toHaveLength(N)
    expect((await adapter.getSigner(CREDS, `${SID}:4`)).id).toBe(`${SID}:4`)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSession(N, 0)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, SID, params)
    const env = listPage(rows, params, 'signicat')
    expect(env.data.map((r) => r.id)).toEqual(sids(N).slice(2, 4))
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('SignicatAdapter.listDocuments pages the session documents locally', () => {
  it('with N = 2L+1 documents, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockSession(1, N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listDocuments(CREDS, SID, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(dids(N))
    expect(more).toEqual([true, true, false])
    for (const c of get.mock.calls) expect(c).toEqual([`/signing-sessions/${SID}`])
  })

  it('a limit above the 100-document maximum returns the whole session and ends', async () => {
    mockSession(1, 100)
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await adapter.listDocuments(CREDS, SID, params)
    expect(rows.map((r) => r.id)).toEqual(dids(100))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns every document (getDocument relies on this)', async () => {
    mockSession(1, N)
    expect(await adapter.listDocuments(CREDS, SID, {})).toHaveLength(N)
    expect((await adapter.getDocument(CREDS, `${SID}:doc-4`)).id).toBe('doc-4')
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSession(1, N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listDocuments(CREDS, SID, params)
    const env = listPage(rows, params, 'signicat')
    expect(env.data.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})
