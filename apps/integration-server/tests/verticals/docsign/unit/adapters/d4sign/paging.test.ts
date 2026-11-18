import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { D4SignClient } from '../../../../../../src/verticals/docsign/adapters/d4sign/client'
import { D4SignAdapter } from '../../../../../../src/verticals/docsign/adapters/d4sign'

/**
 * Signers come from `GET /documents/{UUID-DOCUMENT}/list`, which "retornará
 * todos os signatários de um documento" and takes no parameter but the UUID
 * (https://docapi.d4sign.com.br/docs/endpoints-1). Documents come from
 * `GET /documents/{UUID-DOCUMENT}`, which "retornará apenas o documento
 * solicitado" (https://docapi.d4sign.com.br/docs/endpoints-2): a collection
 * of one. Neither has an upstream page to ask for, so the adapter must page
 * the collection itself, or page 2 repeats page 1.
 */

const CREDS = { accessToken: 'tok', extra: { tokenAPI: 'tok', cryptKey: 'ck' } } as Credentials
const DOC = 'doc-uuid-1'
const L = 2
const N = 2 * L + 1

function fakeSignerList(n: number) {
  return {
    uuidDoc: DOC,
    nameDoc: 'teste.pdf',
    statusId: '3',
    list: Array.from({ length: n }, (_, i) => ({
      key_signer: `key-${i}`,
      user_name: `Signatario ${i}`,
      email: `s${i}@example.com`,
      signed: '0',
    })),
  }
}

/** Honours only the documented path; any query parameter is a bug here. */
function mockGet(n: number) {
  return vi
    .spyOn(D4SignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (params !== undefined) throw new Error(`${path} takes no paging params`)
      if (path === `/documents/${DOC}/list`) return fakeSignerList(n) as never
      if (path === `/documents/${DOC}`) {
        return { uuid: DOC, uuidDoc: DOC, nameDoc: 'teste.pdf', statusId: '3' } as never
      }
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new D4SignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
const listSigners: Lister = (c, id, p) => adapter.listSigners(c, id, p)
const listDocuments: Lister = (c, id, p) => adapter.listDocuments(c, id, p)
const signerIds = (n: number) => Array.from({ length: n }, (_, i) => `${DOC}:s${i}@example.com`)

describe('D4SignAdapter.listSigners pages the whole signer list locally', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const get = mockGet(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await listSigners(CREDS, DOC, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(signerIds(N))
    expect(more).toEqual([true, true, false])
    // The endpoint takes no paging parameter; every page asks for the list.
    for (const call of get.mock.calls) expect(call).toEqual([`/documents/${DOC}/list`])
  })

  it('page 2 is not page 1', async () => {
    mockGet(N)
    const p1 = await listSigners(CREDS, DOC, withPageSink({ page: 1, limit: L }))
    const p2 = await listSigners(CREDS, DOC, withPageSink({ page: 2, limit: L }))
    expect(p2.map((r) => r.id)).toEqual(signerIds(N).slice(L, 2 * L))
    expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
  })

  it('a limit above the collection size serves everything once, with no next page', async () => {
    mockGet(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    const rows = await listSigners(CREDS, DOC, params)
    expect(rows.map((r) => r.id)).toEqual(signerIds(N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('pages a list larger than any plausible cap: the last page ends it', async () => {
    const BIG = 1001
    mockGet(BIG)
    const size = 250
    const last = Math.ceil(BIG / size)
    const params = withPageSink({ page: last, limit: size })
    const rows = await listSigners(CREDS, DOC, params)
    expect(rows.map((r) => r.id)).toEqual(signerIds(BIG).slice((last - 1) * size))
    expect(readUpstreamPage(params)?.totalCount).toBe(BIG)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockGet(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await listSigners(CREDS, DOC, params)
    const env = listPage(rows, params, 'd4sign')
    expect(env.data.map((r) => r.id)).toEqual(signerIds(N).slice(L, 2 * L))
    expect(env.meta.page).toBe(2)
    expect(env.meta.limit).toBe(L)
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('D4SignAdapter.listDocuments pages its one-document collection locally', () => {
  it('page 1 holds the document and ends the collection; page 2 is empty', async () => {
    const get = mockGet(0)
    const p1 = withPageSink({ page: 1, limit: L })
    const rows1 = await listDocuments(CREDS, DOC, p1)
    expect(rows1.map((r) => r.id)).toEqual([DOC])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.totalCount).toBe(1)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)

    const p2 = withPageSink({ page: 2, limit: L })
    expect(await listDocuments(CREDS, DOC, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    for (const call of get.mock.calls) expect(call).toEqual([`/documents/${DOC}`])
  })

  it('a missing document is an empty collection that reports its end', async () => {
    vi.spyOn(D4SignClient.prototype, 'get').mockResolvedValue([] as never)
    const params = withPageSink({ page: 1, limit: L })
    expect(await listDocuments(CREDS, DOC, params)).toEqual([])
    expect(readUpstreamPage(params)?.totalCount).toBe(0)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 on the API path through parseListQuery and listPage as empty', async () => {
    mockGet(0)
    const params = parseListQuery({ page: '2', limit: '1' })
    const rows = await listDocuments(CREDS, DOC, params)
    const env = listPage(rows, params, 'd4sign')
    expect(env.data).toEqual([])
    expect(env.meta.totalCount).toBe(1)
    expect(env.meta.hasMore).toBe(false)
  })
})
