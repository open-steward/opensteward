import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { PandaDocClient } from '../../../../../../src/verticals/docsign/adapters/pandadoc/client'
import { PandaDocAdapter } from '../../../../../../src/verticals/docsign/adapters/pandadoc'

/**
 * Signers and documents both come from `GET /public/v1/documents/{id}/details`,
 * whose only parameter is the path `id`: the response carries the whole
 * `recipients` array
 * (https://developers.pandadoc.com/reference/document-details). There is no
 * upstream page to ask for, so the adapter must page the collection itself,
 * or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const DOC = 'doc-1'
const L = 2
const N = 2 * L + 1

function fakeDetails(n: number) {
  const recipients = Array.from({ length: n }, (_, i) => ({
    id: `rcp-${i}`,
    email: `s${i}@example.com`,
    first_name: 'S',
    last_name: String(i),
    signing_order: i + 1,
    has_completed: false,
    recipient_type: 'signer',
  }))
  return { id: DOC, name: 'Contract', status: 'document.sent', recipients }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGetDetails(n: number) {
  return vi
    .spyOn(PandaDocClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== `/documents/${DOC}/details`) throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('document details takes no paging params')
      return fakeDetails(n) as never
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new PandaDocAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>

describe('PandaDocAdapter.listSigners pages the recipients locally', () => {
  const list: Lister = (c, id, p) => adapter.listSigners(c, id, p)
  const ids = Array.from({ length: N }, (_, i) => `rcp-${i}`)

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGetDetails(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, DOC, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameter; every page asks for the details.
    for (const call of get.mock.calls) expect(call).toEqual([`/documents/${DOC}/details`])
  })

  it('page 2 is not page 1', async () => {
    mockGetDetails(N)
    const p1 = await list(CREDS, DOC, withPageSink({ page: 1, limit: L }))
    const p2 = await list(CREDS, DOC, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('a limit above the collection size serves everything once, with no next page', async () => {
    mockGetDetails(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await list(CREDS, DOC, params)
    expect(rows.map((r) => r.id)).toEqual(ids)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns the whole collection', async () => {
    mockGetDetails(N)
    const rows = await list(CREDS, DOC, {})
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGetDetails(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await list(CREDS, DOC, params)
    const env = listPage(rows, params, 'pandadoc')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('PandaDocAdapter.listDocuments serves its one document once', () => {
  const list: Lister = (c, id, p) => adapter.listDocuments(c, id, p)

  it('page 1 holds the document and page 2 is empty, with an exact hasMore', async () => {
    mockGetDetails(1)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await list(CREDS, DOC, p1)).map((r) => r.id)).toEqual([DOC])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.totalCount).toBe(1)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await list(CREDS, DOC, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage as empty', async () => {
    mockGetDetails(1)
    const params = parseListQuery({ page: '2', limit: '1' })
    const env = listPage(await list(CREDS, DOC, params), params, 'pandadoc')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})
