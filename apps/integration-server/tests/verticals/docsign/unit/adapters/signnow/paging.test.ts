/**
 * Paging for SignNow's child list methods.
 *
 * `GET /document/{document_id}` takes only the path id and the optional
 * `include=integration_objects` / `include=document_attributes` query
 * parameters; it has no limit, offset or page parameter and returns the whole
 * document with its `field_invites` array inline
 * (https://docs.signnow.com/docs/document/operations/get-document: "This
 * endpoint returns details of a specific document."). Signers (field_invites)
 * and the single document row are therefore paged locally. They used to
 * ignore `page`, so page 2 repeated page 1.
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
import { SignNowClient } from '../../../../../../src/verticals/docsign/adapters/signnow/client'
import { SignNowAdapter } from '../../../../../../src/verticals/docsign/adapters/signnow'

const CREDS = { accessToken: 'sn_token' } as Credentials
const DOC = 'doc_1'
const adapter = new SignNowAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'http://x' })

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A fake `GET /document/{document_id}` holding `n` field_invites. It honours
 * ONLY the documented path id; every query parameter is ignored.
 */
function mockDocument(n: number) {
  return vi.spyOn(SignNowClient.prototype, 'get').mockImplementation(async (path: string) => {
    if (path !== `/document/${DOC}`) throw new Error(`unexpected path ${path}`)
    return {
      id: DOC,
      document_name: 'Contract',
      created: '1735689600',
      field_invites: Array.from({ length: n }, (_, i) => ({
        id: `fi_${i}`,
        email: `s${i}@example.com`,
        status: 'pending',
        order: i + 1,
        created: '1735689600',
      })),
    } as never
  })
}

describe('SignNowAdapter.listSigners pages GET /document/{id} field_invites locally', () => {
  const L = 2
  const N = 2 * L + 1
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `fi_${i}`)

  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockDocument(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, DOC, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    // The endpoint has no paging parameter: nothing but the path goes up.
    for (const c of get.mock.calls) expect(c).toEqual([`/document/${DOC}`])
  })

  it('page 2 is not page 1', async () => {
    mockDocument(N)
    const p1 = await adapter.listSigners(CREDS, DOC, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listSigners(CREDS, DOC, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.id)).toEqual(['fi_0', 'fi_1'])
    expect(p2.map((r) => r.id)).toEqual(['fi_2', 'fi_3'])
  })

  it('a large limit returns the whole list and ends', async () => {
    mockDocument(N)
    const params = withPageSink({ page: 1, limit: 1000 })
    expect((await adapter.listSigners(CREDS, DOC, params)).map((r) => r.id)).toEqual(ids(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without a limit returns every row', async () => {
    mockDocument(N)
    expect(await adapter.listSigners(CREDS, DOC, {})).toHaveLength(N)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockDocument(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listSigners(CREDS, DOC, params)
    const env = listPage(rows, params, 'signnow')
    expect(env.data.map((r) => r.id)).toEqual(['fi_2', 'fi_3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('SignNowAdapter.listDocuments pages its one-row collection locally', () => {
  it('page 1 holds the document and ends; page 2 is empty', async () => {
    const get = mockDocument(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listDocuments(CREDS, DOC, p1)).map((d) => d.id)).toEqual([DOC])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.totalCount).toBe(1)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listDocuments(CREDS, DOC, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    for (const c of get.mock.calls) expect(c).toEqual([`/document/${DOC}`])
  })

  it('serves page 2 on the API path as empty through parseListQuery and listPage', async () => {
    mockDocument(0)
    const params = parseListQuery({ page: '2', limit: '1' })
    const env = listPage(await adapter.listDocuments(CREDS, DOC, params), params, 'signnow')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})
