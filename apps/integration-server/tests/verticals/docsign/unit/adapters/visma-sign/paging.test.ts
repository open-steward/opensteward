/**
 * Paging and paths for Visma Sign's list methods
 * (https://sign.visma.net/api/docs/v1/).
 *
 * "Search documents" is `GET /api/v1/document/?…`: "The category parameter is
 * not an optional parameter and at least category=all should be given", and
 * "offset: Response is paged. Start at this document number." There is no
 * page-size parameter; the response reports `{ "total": 78, "offset": 0,
 * "length": 20, "documents": [...] }`. The adapter used to call an
 * undocumented plural `/documents` with a `limit`.
 *
 * "Get document status" is `GET /api/v1/document/{uuid}` (singular), whose
 * `files` and `invitations` are paged locally. "Get invitation templates" is
 * `GET /api/v1/invitation-template`, a bare array; the adapter used to call a
 * `/templates` the API does not have and read a 404 as "no templates".
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
import { VismaSignClient } from '../../../../../../src/verticals/docsign/adapters/visma-sign/client'
import { VismaSignAdapter } from '../../../../../../src/verticals/docsign/adapters/visma-sign'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { documentStatus, invitationTemplate } from './fixtures'

/** The documented example signing pair ("not real"). */
const CREDS: Credentials = {
  accessToken: 'jp7SjOOr4czRTifCo30qx0sZAIw9PW+vVpsbP09pQaY=',
  extra: { clientIdentifier: 'ddf58116-6082-4bfc-a775-0c0bb2f945ce' },
}
/** The page length the documented example reports ("length": 20). */
const UPSTREAM = 20
const adapter = new VismaSignAdapter({})

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

const ids = (n: number) => Array.from({ length: n }, (_, i) => `doc-${i}`)

/**
 * A fake `GET /document/` holding `n` documents. It honours ONLY the
 * documented `category` (required) and `offset` parameters, answers at most
 * UPSTREAM rows a page, and rejects a request without `category`.
 */
function mockSearch(n: number) {
  const all = ids(n).map((uuid) => ({ ...documentStatus(), uuid, name: `Doc ${uuid}` }))
  return vi
    .spyOn(VismaSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/document/') throw new Error(`unexpected path ${path}`)
      if (params?.['category'] !== 'all') {
        throw Object.assign(new Error('category is required'), { response: { status: 400 } })
      }
      const asked = Number(params?.['offset'] ?? 0)
      const offset = Number.isInteger(asked) && asked >= 0 ? asked : 0
      const documents = all.slice(offset, offset + UPSTREAM)
      return { total: all.length, offset, length: documents.length, documents } as never
    })
}

describe('VismaSignAdapter.listEnvelopes pages GET /document/ by offset', () => {
  it('with N = 2L+1, pages 1..3 return every id once with an exact hasMore', async () => {
    const L = 2
    const N = 2 * L + 1
    mockSearch(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      rows.forEach((r) => EnvelopeSchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
  })

  it('with L = 20 and N = 41, pages cross upstream pages and send only category and offset', async () => {
    const L = UPSTREAM
    const N = 2 * L + 1
    const get = mockSearch(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await adapter.listEnvelopes(CREDS, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    const sent = get.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(sent.map((p) => p['offset'])).toEqual([0, 20, 40])
    for (const p of sent) expect(Object.keys(p).sort()).toEqual(['category', 'offset'])
  })

  it('page 2 is not page 1', async () => {
    mockSearch(5)
    const p1 = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 2 }))
    const p2 = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(p1.map((r) => r.id)).toEqual(['doc-0', 'doc-1'])
    expect(p2.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
  })

  it('a limit above the upstream page length still returns exactly that many rows', async () => {
    const get = mockSearch(60)
    const params = withPageSink({ page: 1, limit: 50 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const c of get.mock.calls) expect(c[1]).not.toHaveProperty('limit')
  })

  it('an empty archive ends at once', async () => {
    const get = mockSearch(0)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listEnvelopes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('an empty page ends the walk even when total claims more rows', async () => {
    const get = vi
      .spyOn(VismaSignClient.prototype, 'get')
      .mockResolvedValue({ total: 78, offset: 0, length: 0, documents: [] } as never)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter.listEnvelopes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockSearch(5)
    const params = parseListQuery({ page: '2', limit: '2' })
    const env = listPage(await adapter.listEnvelopes(CREDS, params), params, 'visma-sign')
    expect(env.data.map((r) => r.id)).toEqual(['doc-2', 'doc-3'])
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('VismaSignAdapter reads one document at the singular /document/{uuid}', () => {
  const N = 5
  const L = 2
  function mockDocument() {
    const doc = documentStatus()
    doc.files = Array.from({ length: N }, (_, i) => ({ filename: `f-${i}.pdf` }))
    doc.invitations = Array.from({ length: N }, (_, i) => ({ uuid: `inv-${i}`, status: 'new' }))
    return vi
      .spyOn(VismaSignClient.prototype, 'get')
      .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
        if (path !== `/document/${doc.uuid}`) {
          throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
        }
        expect(params).toBeUndefined()
        return doc as never
      })
  }

  it('getEnvelope', async () => {
    const get = mockDocument()
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, documentStatus().uuid))
    expect(env.id).toBe(documentStatus().uuid)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'listSigners',
      (p: ReturnType<typeof withPageSink>) => adapter.listSigners(CREDS, documentStatus().uuid, p),
      (i: number) => `inv-${i}`,
    ],
    [
      'listDocuments',
      (p: ReturnType<typeof withPageSink>) =>
        adapter.listDocuments(CREDS, documentStatus().uuid, p),
      (i: number) => `${documentStatus().uuid}:${i}`,
    ],
  ] as const)('%s walks N = 2L+1 locally, every id once, exact hasMore', async (_n, list, id) => {
    mockDocument()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => id(i)))
    expect(more).toEqual([true, true, false])
  })

  it('listSigners carries the document uuid as every signer envelopeId', async () => {
    mockDocument()
    const rows = await adapter.listSigners(
      CREDS,
      documentStatus().uuid,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(rows).toHaveLength(N)
    for (const r of rows) expect(r.envelopeId).toBe(documentStatus().uuid)
  })

  it('getDocument reads a listed id back', async () => {
    mockDocument()
    const listed = await adapter.listDocuments(
      CREDS,
      documentStatus().uuid,
      withPageSink({ page: 2, limit: 2 }),
    )
    const got = await adapter.getDocument(CREDS, listed[0]!.id)
    expect(got).toEqual(listed[0])
    await expect(adapter.getDocument(CREDS, `${documentStatus().uuid}:9`)).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(adapter.getDocument(CREDS, 'no-index')).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('VismaSignAdapter.getSigner reads GET /invitation/{uuid}', () => {
  it('maps the documented authenticated invitation status response', async () => {
    const get = vi
      .spyOn(VismaSignClient.prototype, 'get')
      .mockImplementation(async (path: string) => {
        if (path !== '/invitation/2076243e-351d-4b29-86ad-c2b02d7f867d')
          throw new Error(`unexpected ${path}`)
        return {
          uuid: '2076243e-351d-4b29-86ad-c2b02d7f867d',
          status: 'new',
          document: { uuid: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a', name: 'Test document' },
        } as never
      })
    const s = await adapter.getSigner(CREDS, '2076243e-351d-4b29-86ad-c2b02d7f867d')
    expect(s).toMatchObject({
      id: '2076243e-351d-4b29-86ad-c2b02d7f867d',
      envelopeId: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a',
      status: 'sent',
    })
    expect(s.raw).not.toHaveProperty('document')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('throws 502 UPSTREAM_ERROR instead of inventing an envelope id when document is absent', async () => {
    vi.spyOn(VismaSignClient.prototype, 'get').mockResolvedValue({
      uuid: '2076243e-351d-4b29-86ad-c2b02d7f867d',
      status: 'new',
    } as never)
    await expect(
      adapter.getSigner(CREDS, '2076243e-351d-4b29-86ad-c2b02d7f867d'),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
  })
})

describe('VismaSignAdapter templates read GET /invitation-template', () => {
  const N = 5
  function mockTemplates(n = N) {
    const rows = Array.from({ length: n }, (_, i) => ({
      ...invitationTemplate(),
      uuid: `tpl-${i}`,
    }))
    return vi
      .spyOn(VismaSignClient.prototype, 'get')
      .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
        if (path !== '/invitation-template') {
          throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
        }
        expect(params).toBeUndefined()
        return rows as never
      })
  }

  it('listTemplates walks N = 2L+1 locally, every id once, exact hasMore', async () => {
    mockTemplates()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await adapter.listTemplates(CREDS, params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['tpl-0', 'tpl-1', 'tpl-2', 'tpl-3', 'tpl-4'])
    expect(more).toEqual([true, true, false])
  })

  it('an upstream 404 propagates instead of reading as "no templates"', async () => {
    vi.spyOn(VismaSignClient.prototype, 'get').mockRejectedValue(
      Object.assign(new Error('404'), { response: { status: 404 } }),
    )
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 2 }))).rejects.toThrow(
      '404',
    )
  })

  it('a non-array response throws 502 UPSTREAM_ERROR rather than reading as a list', async () => {
    vi.spyOn(VismaSignClient.prototype, 'get').mockResolvedValue({ templates: [] } as never)
    await expect(
      adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 2 })),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
    await expect(adapter.getTemplate(CREDS, 'tpl-0')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('getTemplate finds a listed id and 404s an unknown one', async () => {
    mockTemplates()
    expect((await adapter.getTemplate(CREDS, 'tpl-3')).id).toBe('tpl-3')
    await expect(adapter.getTemplate(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})
