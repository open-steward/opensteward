/**
 * Sertifi list paging.
 *
 * The Sertifi API reference (https://sertifi.readme.io/reference/getfolder)
 * defines GET /v1.1/folders/{folderId} with a single path parameter and no
 * query parameters. The Folder schema carries
 *   participants: { type: array, description: "List of participants" }
 *   documents:    { type: array, description: "List of documents" }
 * inline, so one call returns the whole collection. listSigners and
 * listDocuments therefore slice locally and report their own end.
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
import { SertifiAdapter } from '../../../../../../src/verticals/docsign/adapters/sertifi/index'

const CREDS = { accessToken: 'sertifi_test' }
const FOLDER = 'f1'

/** A fake Sertifi honouring ONLY GET /folders/{folderId}, which takes no query params. */
function fakeSertifi(total: number) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    if (Object.keys(params).length > 0) throw new Error(`400: ${path} takes no query params`)
    if (path !== `/folders/${FOLDER}`) throw new Error(`unexpected path ${path}`)
    return {
      data: {
        folderId: FOLDER,
        participants: Array.from({ length: total }, (_, i) => ({
          userId: `u${i + 1}`,
          email: `u${i + 1}@example.com`,
        })),
        documents: Array.from({ length: total }, (_, i) => ({
          documentId: `d${i + 1}`,
          name: `Doc ${i + 1}`,
        })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), patch: vi.fn() } as never)
  return { get }
}

const adapter = () => new SertifiAdapter()

const LOCAL_METHODS = [
  {
    name: 'listSigners',
    id: (i: number) => `${FOLDER}:u${i + 1}`,
    call: (a: SertifiAdapter, p: QueryParams) => a.listSigners(CREDS, FOLDER, p),
  },
  {
    name: 'listDocuments',
    id: (i: number) => `${FOLDER}:d${i + 1}`,
    call: (a: SertifiAdapter, p: QueryParams) => a.listDocuments(CREDS, FOLDER, p),
  },
] as const

afterEach(() => vi.restoreAllMocks())

describe('sertifi capabilities', () => {
  it('declares no maxPageSize: GetFolder documents no paging parameters', () => {
    const caps = (adapter() as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})

describe.each(LOCAL_METHODS)('sertifi $name local paging', ({ call, id }) => {
  const L = 3
  const N = 2 * L + 1
  const expected = Array.from({ length: N }, (_, i) => id(i))

  it('pages 1..3 at limit L return every row once, in order, with exact hasMore', async () => {
    fakeSertifi(N)
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

  it('page 2 sends no query params (GetFolder documents none) and slices locally', async () => {
    const { get } = fakeSertifi(N)
    const rows = await call(adapter(), withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]?.[0]).toBe(`/folders/${FOLDER}`)
    expect(rows.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
  })

  it('a large limit returns the whole collection with hasMore false', async () => {
    fakeSertifi(N)
    const params = parseListQuery({ limit: '500' })
    const rows = await call(adapter(), params)
    expect(rows.map((r) => r.id)).toEqual(expected)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('the API path: parseListQuery + listPage serves page 2 with meta.hasMore', async () => {
    fakeSertifi(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage<{ id: string }>(await call(adapter(), params), params, 'sertifi')
    expect(env.data.map((r) => r.id)).toEqual(expected.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('with no limit, every row is returned', async () => {
    fakeSertifi(N)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(expected)
  })
})

describe('sertifi single-row lookups still see the whole folder', () => {
  it('getSigner and getDocument find a row past the first page', async () => {
    fakeSertifi(7)
    const a = adapter()
    expect((await a.getSigner(CREDS, `${FOLDER}:u7`)).externalId).toBe('u7')
    expect((await a.getDocument(CREDS, `${FOLDER}:d7`)).externalId).toBe('d7')
  })
})
