/**
 * Documenso list paging for the per-document sub-collections.
 *
 * The v1 spec (https://app.documenso.com/api/v1/openapi.json) gives
 * GET /api/v1/documents/{id} ("Get a single document") only an `id` path
 * param and an `authorization` header: no query params at all. Its response
 * embeds `recipients` and `fields`, and v1 has no GET on
 * /documents/{id}/recipients (POST only). So listSigners, listAuditTrailEntries
 * (synthesised from the document and recipient timestamps) and listDocuments
 * (a document IS the envelope) get the whole collection in one call, and the
 * adapter slices it locally.
 *
 * listEnvelopes and listTemplates already forward `page` + `perPage` and are
 * not covered here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { DocumensoAdapter } from '../../../../../../src/verticals/docsign/adapters/documenso/index'

const CREDS = { accessToken: 'api_test' }
const CALL_BUDGET = 20

/**
 * A fake Documenso v1 honouring ONLY what the spec documents for
 * GET /documents/{id}: no query params. Any query param is refused.
 * `recipients` recipients, each signed at a distinct time.
 */
function fakeDocumenso(recipients: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = cfg?.params ?? {}
    if (path !== '/documents/1') throw new Error(`unexpected path ${path}`)
    if (Object.keys(params).length > 0) throw new Error(`400: ${path} takes no query params`)
    return {
      data: {
        id: 1,
        userId: 9,
        title: 'Doc 1',
        status: 'PENDING',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        completedAt: null,
        recipients: Array.from({ length: recipients }, (_, i) => ({
          id: i + 1,
          documentId: 1,
          email: `r${i + 1}@example.com`,
          name: `R${i + 1}`,
          role: 'SIGNER',
          signingStatus: 'SIGNED',
          signedAt: `2025-01-02T00:00:${String(i).padStart(2, '0')}.000Z`,
        })),
        fields: [],
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
  return { get }
}

const adapter = () => new DocumensoAdapter()

afterEach(() => vi.restoreAllMocks())

const L = 3
const N = 2 * L + 1

const LOCAL_METHODS = [
  {
    name: 'listSigners',
    // N recipients -> N signers
    recipients: N,
    id: (i: number) => `${i + 1}`,
    call: (a: DocumensoAdapter, p: QueryParams) => a.listSigners(CREDS, '1', p),
  },
  {
    name: 'listAuditTrailEntries',
    // created + (N - 1) signed events = N entries (no completedAt)
    recipients: N - 1,
    id: (i: number) => `1:${i}`,
    call: (a: DocumensoAdapter, p: QueryParams) => a.listAuditTrailEntries(CREDS, '1', p),
  },
] as const

describe('documenso capabilities', () => {
  it('declares no maxPageSize: the v1 spec documents no perPage maximum', () => {
    const caps = (adapter() as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

describe.each(LOCAL_METHODS)('documenso $name local paging', ({ call, id, recipients }) => {
  const expected = Array.from({ length: N }, (_, i) => id(i))

  it('pages 1..3 at limit L return every row once, in order, with exact hasMore', async () => {
    fakeDocumenso(recipients)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const page = await call(adapter(), params)
      expect(page.length).toBeLessThanOrEqual(L)
      seen.push(...page.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
  })

  it('every page requests GET /documents/{id} with no query params', async () => {
    const { get } = fakeDocumenso(recipients)
    await call(adapter(), withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/documents/1', { params: undefined })
  })

  it('a limit above the row count returns every row with hasMore false', async () => {
    fakeDocumenso(recipients)
    const params = parseListQuery({ limit: '500' })
    const rows = await call(adapter(), params)
    expect(rows.map((r) => r.id)).toEqual(expected)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('the API path: parseListQuery + listPage serves page 2 with meta.hasMore', async () => {
    fakeDocumenso(recipients)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage<{ id: string }>(await call(adapter(), params), params, 'documenso')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('with no limit, every row is returned', async () => {
    fakeDocumenso(recipients)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(expected)
  })
})

describe('documenso listDocuments(envelopeId) local paging', () => {
  it('the one-document collection is served on page 1 only, with hasMore false', async () => {
    fakeDocumenso(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter().listDocuments(CREDS, '1', p1)).map((d) => d.id)).toEqual(['1'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    expect(readUpstreamPage(p1)?.pagedLocally).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter().listDocuments(CREDS, '1', p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('the API path: parseListQuery + listPage serves an empty page 2', async () => {
    fakeDocumenso(0)
    const params = parseListQuery({ page: '2', limit: '1' })
    const env = listPage<{ id: string }>(
      await adapter().listDocuments(CREDS, '1', params),
      params,
      'documenso',
    )
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('documenso single-row lookups still see the whole collection', () => {
  it('getSigner finds the last recipient', async () => {
    fakeDocumenso(N)
    expect((await adapter().getSigner(CREDS, `1:${N}`)).id).toBe(`${N}`)
  })

  it('getAuditTrailEntry finds the last entry', async () => {
    fakeDocumenso(N - 1)
    expect((await adapter().getAuditTrailEntry(CREDS, `1:${N - 1}`)).id).toBe(`1:${N - 1}`)
  })
})
