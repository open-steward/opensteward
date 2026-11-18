/**
 * GET /documents and GET /templates: offset paging.
 *
 * Documented parameters (both endpoints):
 *   offset — "건너 뛸 아이템 개수", default 0
 *   limit  — "한번에 불러 올 아이템 개수", minimum 1, maximum 100, default 10
 * Response: `{ count, documents }` / `{ count, templates }`, count = the total.
 * (https://developers.modusign.co.kr/reference/documentcontroller_getdocuments.md,
 *  https://developers.modusign.co.kr/reference/templatecontroller_gettemplates.md)
 *
 * The fake honours ONLY offset and limit: any other query parameter (the old
 * page/size) is rejected, and an omitted offset/limit falls back to the
 * documented defaults 0/10, as Modusign would.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { ModusignAdapter } from '../../../../../../src/verticals/docsign/adapters/modusign/index'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'
import { listedDocument, listedTemplate } from './fixtures'

const EMAIL = 'owner@company.example'
const CREDS = { accessToken: 'msk_test', extra: { email: EMAIL } }
const L = 3
const N = 2 * L + 1

function fakeModusign(total: number) {
  const docs = Array.from({ length: total }, (_, i) => listedDocument(i + 1))
  const tpls = Array.from({ length: total }, (_, i) => listedTemplate(i + 1))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => k !== 'offset' && k !== 'limit')
    if (extra.length > 0) throw new Error(`undocumented query parameters: ${extra.join(',')}`)
    const offset = (params['offset'] as number | undefined) ?? 0
    const limit = (params['limit'] as number | undefined) ?? 10
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error(`400: limit ${String(limit)} outside 1..100`)
    }
    if (path === '/documents') {
      return { data: { count: docs.length, documents: docs.slice(offset, offset + limit) } }
    }
    if (path === '/templates') {
      return { data: { count: tpls.length, templates: tpls.slice(offset, offset + limit) } }
    }
    if (path.startsWith('/documents/')) {
      const id = decodeURIComponent(path.slice('/documents/'.length))
      return { data: { ...listedDocument(1), id } }
    }
    if (path.startsWith('/templates/')) {
      const id = decodeURIComponent(path.slice('/templates/'.length))
      return { data: { ...listedTemplate(1), id } }
    }
    throw new Error(`404: undocumented path ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post: vi.fn() })) as never)
  return { get }
}

const adapter = () => new ModusignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

const METHODS = [
  {
    name: 'listEnvelopes',
    path: '/documents',
    call: (p: QueryParams) => adapter().listEnvelopes(CREDS, p),
    schema: EnvelopeSchema,
    ids: (n: number) => Array.from({ length: n }, (_, i) => `doc_${i + 1}`),
  },
  {
    name: 'listTemplates',
    path: '/templates',
    call: (p: QueryParams) => adapter().listTemplates(CREDS, p),
    schema: TemplateSchema,
    ids: (n: number) => Array.from({ length: n }, (_, i) => `tpl_${i + 1}`),
  },
] as const

describe('modusign adapter capabilities', () => {
  it('declares the documented limit maximum of 100', () => {
    expect(adapter().capabilities.maxPageSize).toBe(100)
  })
})

describe.each(METHODS)('modusign $name', ({ path, call, schema, ids }) => {
  it('sends offset = (page-1)*limit and the caller limit, nothing else', async () => {
    const { get } = fakeModusign(N)
    await call(withPageSink({ page: 3, limit: L }))
    expect(get).toHaveBeenCalledWith(path, { params: { offset: 2 * L, limit: L } })
  })

  it(`walks N = 2L+1 = ${N} rows at limit ${L}: every id once, hasMore exact`, async () => {
    fakeModusign(N)
    const seen: string[] = []
    const more: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(params)
      for (const r of rows) expect(() => schema.parse(r)).not.toThrow()
      seen.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore === true)
      expect(meta?.totalCount).toBe(N)
      expect(meta?.pageSize).toBeUndefined()
    }
    expect(seen).toEqual(ids(N))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('a total that is an exact multiple of the limit ends on the full last page (hasMore from count)', async () => {
    fakeModusign(2 * L)
    const p2 = withPageSink({ page: 2, limit: L })
    expect(await call(p2)).toHaveLength(L)
    expect(readUpstreamPage(p2)).toMatchObject({ totalCount: 2 * L, hasMore: false })
  })

  it('a limit past 100 is clamped to 100, strides by 100 and reports pageSize 100', async () => {
    const { get } = fakeModusign(250)
    const p1 = withPageSink({ page: 1, limit: 500 })
    const rows1 = await call(p1)
    expect(rows1).toHaveLength(100)
    expect(readUpstreamPage(p1)).toMatchObject({ pageSize: 100, totalCount: 250, hasMore: true })
    const p3 = withPageSink({ page: 3, limit: 500 })
    const rows3 = await call(p3)
    expect(rows3.map((r) => r.id)).toEqual(ids(250).slice(200))
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false })
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { offset: 0, limit: 100 } },
      { params: { offset: 200, limit: 100 } },
    ])
  })
})

describe('modusign get-by-id encodes the id into the documented path', () => {
  it('getEnvelope', async () => {
    const { get } = fakeModusign(1)
    const out = await adapter().getEnvelope(CREDS, 'a/b?c')
    expect(get).toHaveBeenCalledWith('/documents/a%2Fb%3Fc', { params: undefined })
    expect(EnvelopeSchema.parse(out).id).toBe('a/b?c')
  })

  it('getTemplate', async () => {
    const { get } = fakeModusign(1)
    const out = await adapter().getTemplate(CREDS, 'a/b?c')
    expect(get).toHaveBeenCalledWith('/templates/a%2Fb%3Fc', { params: undefined })
    expect(TemplateSchema.parse(out).id).toBe('a/b?c')
  })
})
