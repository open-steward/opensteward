/**
 * Paging for Legalesign's list methods.
 *
 * Legalesign's v1 lists are Tastypie lists paged by `limit` + `offset`
 * (https://github.com/legalesign/Legalesign-V1-OpenAPI3, legalesign-api-v1.yaml:
 * `offset` is "Offset from start of dataset. Use with the limit query to
 * iterate through dataset.", `limit` is "Length of dataset to return. Use with
 * offset query to iterate through results." with default 20), and answer with
 * `meta: { limit, next, offset, previous, total_count }` where `total_count` is
 * "total number of objects". The adapter sent `offset=0` whatever page it was
 * asked for, so page 2 repeated page 1.
 *
 * `GET /document/{docId}/` returns one `DocumentResponseDetail` with every
 * `signer_objects` entry, so signers and documents are paged locally.
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
import { LegalesignClient } from '../../../../../../src/verticals/docsign/adapters/legalesign/client'
import { LegalesignAdapter } from '../../../../../../src/verticals/docsign/adapters/legalesign'

const CREDS = { accessToken: 'user:secret', extra: { region: 'eu', group: 'g1' } } as Credentials
const MAX = 100
const adapter = new LegalesignAdapter()

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

/**
 * A Tastypie list over `rows`, honouring ONLY the documented `limit` (default
 * 20) and `offset` (default 0), with the documented `meta` block.
 */
function tastypie<T>(rows: T[], path: string, params?: Record<string, unknown>) {
  const limit = params?.['limit'] === undefined ? 20 : Number(params['limit'])
  const offset = params?.['offset'] === undefined ? 0 : Number(params['offset'])
  const objects = rows.slice(offset, offset + limit)
  const hasNext = offset + limit < rows.length
  return {
    meta: {
      limit,
      offset,
      total_count: rows.length,
      next: hasNext ? `/api/v1${path}?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `/api/v1${path}?offset=${Math.max(0, offset - limit)}` : null,
    },
    objects,
  }
}

function mockLists(opts: { documents?: number; text?: number; pdf?: number }) {
  const docs = Array.from({ length: opts.documents ?? 0 }, (_, i) => ({
    uuid: `doc-${i}`,
    name: `Doc ${i}`,
    status: 10,
  }))
  const text = Array.from({ length: opts.text ?? 0 }, (_, i) => ({
    uuid: `txt-${i}`,
    title: `Text ${i}`,
  }))
  const pdf = Array.from({ length: opts.pdf ?? 0 }, (_, i) => ({
    uuid: `pdf-${i}`,
    title: `Pdf ${i}`,
  }))
  return vi
    .spyOn(LegalesignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path === '/document/') return tastypie(docs, path, params) as never
      if (path === '/template/') return tastypie(text, path, params) as never
      if (path === '/templatepdf/') return tastypie(pdf, path, params) as never
      throw new Error(`unexpected path ${path}`)
    })
}

async function walk(
  list: (p: ReturnType<typeof withPageSink>) => Promise<Array<{ id: string }>>,
  limit: number,
) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await list(params)
    seen.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('LegalesignAdapter.listEnvelopes pages GET /document/ by offset', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `doc-${i}`)

  it('with N = 2L+1, pages 1..3 return every id once with an exact hasMore', async () => {
    const L = 2
    mockLists({ documents: 2 * L + 1 })
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), L)
    expect(seen).toEqual(ids(2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('page 2 sends offset = limit, with the group filter', async () => {
    const get = mockLists({ documents: 5 })
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(get.mock.calls[0]![1]).toMatchObject({ offset: 2, limit: 2, group: 'g1' })
  })

  it('a limit above the maximum is clamped, strides by the clamped size and reports it', async () => {
    const get = mockLists({ documents: 250 })
    const p1 = withPageSink({ page: 1, limit: 250 })
    const r1 = await adapter.listEnvelopes(CREDS, p1)
    const p2 = withPageSink({ page: 2, limit: 250 })
    const r2 = await adapter.listEnvelopes(CREDS, p2)
    expect(r1.map((r) => r.id)).toEqual(ids(MAX))
    expect(r2.map((r) => r.id)).toEqual(ids(2 * MAX).slice(MAX))
    expect(get.mock.calls.map((c) => (c[1] as Record<string, unknown>)['limit'])).toEqual([
      MAX,
      MAX,
    ])
    expect(get.mock.calls[1]![1]).toMatchObject({ offset: MAX })
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: MAX, totalCount: 250 })
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockLists({ documents: 5 })
    const params = parseListQuery({ page: '2', limit: '2' })
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'legalesign')
    expect(env.data.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
    expect(env.meta.page).toBe(2)
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('LegalesignAdapter.listTemplates pages /template/ then /templatepdf/ by offset', () => {
  const ids = (text: number, pdf: number) => [
    ...Array.from({ length: text }, (_, i) => `txt-${i}`),
    ...Array.from({ length: pdf }, (_, i) => `pdf-${i}`),
  ]

  it('with N = 2L+1 across both endpoints, pages 1..3 return every id once with an exact hasMore', async () => {
    const L = 2
    mockLists({ text: 3, pdf: 2 })
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p), L)
    expect(seen).toEqual(ids(3, 2))
    expect(more).toEqual([true, true, false])
  })

  it('crosses upstream pages: page 2 at L = 100 sends offset = 100', async () => {
    const L = MAX
    const get = mockLists({ text: 2 * L + 1, pdf: 0 })
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p), L)
    expect(seen).toEqual(ids(2 * L + 1, 0))
    expect(more).toEqual([true, true, false])
    const text = get.mock.calls
      .filter((c) => c[0] === '/template/')
      .map((c) => c[1] as Record<string, unknown>)
    expect(text.map((p) => p['offset'])).toEqual([0, MAX, 2 * MAX])
    for (const p of text) expect(p['limit']).toBe(MAX)
  })

  it('a limit above the maximum still returns exactly that many rows', async () => {
    const get = mockLists({ text: 150, pdf: 110 })
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await adapter.listTemplates(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(150, 110).slice(0, 250))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of get.mock.calls) expect((c[1] as Record<string, unknown>)['limit']).toBe(MAX)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockLists({ text: 3, pdf: 2 })
    const params = parseListQuery({ page: '2', limit: '2' })
    const rows = await adapter.listTemplates(CREDS, params)
    const env = listPage(rows, params, 'legalesign')
    expect(env.data.map((r) => r.id)).toEqual(['txt-2', 'pdf-0'])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('LegalesignAdapter child lists page GET /document/{id}/ locally', () => {
  function mockDetail(signers: number) {
    return vi.spyOn(LegalesignClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== '/document/env-1/') throw new Error(`unexpected path ${path}`)
      return {
        uuid: 'env-1',
        name: 'Env',
        signer_objects: Array.from({ length: signers }, (_, i) => ({
          uuid: `s-${i}`,
          firstname: `F${i}`,
          lastname: `L${i}`,
          email: `s${i}@example.com`,
        })),
      } as never
    })
  }

  it('listSigners: with N = 2L+1, pages 1..3 return every signer once', async () => {
    mockDetail(5)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, 'env-1', p), 2)
    expect(seen).toEqual(['s-0', 's-1', 's-2', 's-3', 's-4'])
    expect(more).toEqual([true, true, false])
  })

  it('listDocuments: the one composed document is on page 1 only', async () => {
    mockDetail(0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect((await adapter.listDocuments(CREDS, 'env-1', p1)).map((d) => d.id)).toEqual(['env-1'])
    expect(await adapter.listDocuments(CREDS, 'env-1', p2)).toEqual([])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
  })
})

describe('LegalesignAdapter paging: keys, filters and edge pages', () => {
  const B_CREDS = {
    accessToken: 'other:secret',
    extra: { region: 'eu', group: 'g1' },
  } as Credentials

  /** The API key the spied client was built with. */
  function apiKeyOf(client: unknown): string {
    const http = (client as { http: { defaults: { headers: Record<string, unknown> } } }).http
    return String(http.defaults.headers['Authorization'])
  }

  function rowsFor(prefix: string, n: number) {
    return Array.from({ length: n }, (_, i) => ({
      uuid: `${prefix}-${i}`,
      title: `${prefix} ${i}`,
    }))
  }

  it('templates: two API keys on one region never share a walk', async () => {
    vi.spyOn(LegalesignClient.prototype, 'get').mockImplementation(async function (
      this: unknown,
      path: string,
      params?: Record<string, unknown>,
    ) {
      const tenant = apiKeyOf(this).includes('other') ? 'b' : 'a'
      const rows = path === '/template/' ? rowsFor(`${tenant}txt`, 5) : []
      return tastypie(rows, path, params) as never
    })
    await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 2 }))
    const rows = await adapter.listTemplates(B_CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(rows.map((r) => r.id)).toEqual(['btxt-2', 'btxt-3'])
  })

  it('templates: the group filter is sent upstream and keys the walk', async () => {
    const get = vi
      .spyOn(LegalesignClient.prototype, 'get')
      .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
        const group = String(params?.['group'])
        const rows = path === '/template/' ? rowsFor(`${group}txt`, 5) : []
        return tastypie(rows, path, params) as never
      })
    await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 2, group: 'x' }))
    const rows = await adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: 2, group: 'y' }))
    expect(rows.map((r) => r.id)).toEqual(['ytxt-2', 'ytxt-3'])
    for (const c of get.mock.calls) expect(c[1]).toHaveProperty('group')
  })

  it('templates: an exactly-full last page ends on meta.next without an extra fetch', async () => {
    const get = mockLists({ text: MAX, pdf: 0 })
    const params = withPageSink({ page: 1, limit: MAX })
    const rows = await adapter.listTemplates(CREDS, params)
    expect(rows).toHaveLength(MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    const text = get.mock.calls.filter((c) => c[0] === '/template/')
    expect(text.map((c) => (c[1] as Record<string, unknown>)['offset'])).toEqual([0])
  })

  it('templates: a server that returns short pages is advanced by the rows it sent', async () => {
    const CAP = 30
    const text = rowsFor('txt', 70)
    vi.spyOn(LegalesignClient.prototype, 'get').mockImplementation(
      async (path: string, params?: Record<string, unknown>) => {
        const capped = { ...params, limit: Math.min(Number(params?.['limit'] ?? 20), CAP) }
        return tastypie(path === '/template/' ? text : [], path, capped) as never
      },
    )
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p), 25)
    expect(seen).toEqual(text.slice(0, 70).map((t) => t.uuid))
    expect(more).toEqual([true, true, false])
  })

  it('templates: without a limit the default page size of 20 is served', async () => {
    mockLists({ text: 50, pdf: 0 })
    const rows = await adapter.listTemplates(CREDS, withPageSink({ page: 1 }))
    expect(rows).toHaveLength(20)
  })

  it('templates: a failure past the first page is thrown, not cached as the end', async () => {
    const text = rowsFor('txt', 150)
    const pdf = rowsFor('pdf', 3)
    let failNext = true
    vi.spyOn(LegalesignClient.prototype, 'get').mockImplementation(
      async (path: string, params?: Record<string, unknown>) => {
        if (path === '/template/' && Number(params?.['offset']) === MAX && failNext) {
          failNext = false
          throw new Error('503')
        }
        return tastypie(path === '/template/' ? text : pdf, path, params) as never
      },
    )
    // Page 1 looks one upstream page ahead for hasMore, so that is where the
    // failure lands; a retry must then walk text 100.. rather than skip to pdf.
    await expect(
      adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: MAX })),
    ).rejects.toThrow('503')
    const p1 = withPageSink({ page: 1, limit: MAX })
    await adapter.listTemplates(CREDS, p1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const rows = await adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: MAX }))
    expect(rows.map((r) => r.id)).toEqual([
      ...text.slice(MAX).map((t) => t.uuid),
      ...pdf.map((t) => t.uuid),
    ])
  })

  it('templates: an endpoint that fails on its first page still reads as empty', async () => {
    vi.spyOn(LegalesignClient.prototype, 'get').mockImplementation(
      async (path: string, params?: Record<string, unknown>) => {
        if (path === '/template/') throw new Error('403')
        return tastypie(rowsFor('pdf', 3), path, params) as never
      },
    )
    const rows = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['pdf-0', 'pdf-1', 'pdf-2'])
  })

  it('envelopes: status, archived and updatedAfter reach the query', async () => {
    const get = mockLists({ documents: 1 })
    const updatedAfter = new Date('2026-01-02T03:04:05.000Z')
    await adapter.listEnvelopes(
      CREDS,
      withPageSink({ page: 1, limit: 2, status: 30, archived: false, updatedAfter }),
    )
    expect(get.mock.calls[0]![1]).toMatchObject({
      status: 30,
      archived: 'false',
      modified_gt: '2026-01-02T03:04:05.000Z',
    })
  })

  it('envelopes: an explicit offset wins over the page, and no limit sends 20', async () => {
    const get = mockLists({ documents: 30 })
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 5, offset: 7 }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1 }))
    expect(get.mock.calls[0]![1]).toMatchObject({ offset: 7, limit: 5 })
    expect(get.mock.calls[1]![1]).toMatchObject({ offset: 0, limit: 20 })
  })
})
