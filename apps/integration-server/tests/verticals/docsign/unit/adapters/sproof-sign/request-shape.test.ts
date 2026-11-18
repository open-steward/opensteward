/**
 * sproof Sign request shape and paging, against a fake that honours only what
 * https://sign.sproof.com/api/v1/documentation/json documents:
 *
 *   Server: "https://sign.sproof.com/api/v1"
 *   GET /documents: `token` (query, required), `perPage` ("Number of entries
 *     per page", default 10), `page` ("Page number", default 1), `view`
 *     ("Document filter", enum incl. "allDocuments" and "templates").
 *     Reply `_DocumentListResponse` = { data: _Document[], pagination:
 *     { total, lastPage, perPage, currentPage, to } }.
 *   GET /documents/{memberId}: `token` (query, required). Reply `_Document`.
 *
 * The spec documents no maximum for `perPage`, so the caller's limit is sent
 * as is. There is no audit-trail JSON endpoint: GET
 * /documents/{memberId}/pdfAuditTrail returns "Binary PDF audit trail file"
 * and GET /documents/{memberId}/fda a "Base64 encoded PDF audit trail".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { SproofSignAdapter } from '../../../../../../src/verticals/docsign/adapters/sproof-sign/index'
import type { RawSproofDocument } from '../../../../../../src/verticals/docsign/adapters/sproof-sign/transform/shared'
import { documentRow, signerMember } from './fixtures'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'

const TOKEN = 'XXXXXXXX-XXXX-XXXX-XXXXXXXXXXXX'
const CREDS = { accessToken: TOKEN }
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 20
const DOC_PARAMS = new Set(['token', 'perPage', 'page', 'view'])
const VIEWS = new Set(['allDocuments', 'templates'])

/** One owner document whose GET /documents/{memberId} reply carries N members. */
function ownerDoc(): RawSproofDocument {
  return documentRow(0, {
    members: Array.from({ length: N }, (_, i) => signerMember(i + 1)),
  })
}

function fakeSproof(total: number) {
  const rows = Array.from({ length: total }, (_, i) => documentRow(i + 1))
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const params = cfg?.params ?? {}
    if (params['token'] !== TOKEN) throw new Error('401 User authentication failed')
    if (path === '/documents') {
      for (const k of Object.keys(params)) {
        if (!DOC_PARAMS.has(k)) throw new Error(`400 undocumented parameter ${k}`)
      }
      const view = params['view'] ?? 'allDocuments'
      if (!VIEWS.has(String(view))) throw new Error(`400 view ${String(view)}`)
      const page = (params['page'] as number | undefined) ?? 1
      const perPage = (params['perPage'] as number | undefined) ?? 10
      if (!Number.isInteger(page) || page < 1) throw new Error(`400 page ${String(page)}`)
      if (!Number.isInteger(perPage) || perPage < 1) throw new Error(`400 perPage ${perPage}`)
      const start = (page - 1) * perPage
      const data = rows.slice(start, start + perPage)
      return {
        data: {
          data,
          pagination: {
            total,
            lastPage: Math.max(1, Math.ceil(total / perPage)),
            perPage,
            currentPage: page,
            to: start + data.length,
          },
        },
      }
    }
    const m = /^\/documents\/([^/]+)$/.exec(path)
    if (m) {
      if (Object.keys(params).some((k) => k !== 'token')) throw new Error('400 undocumented param')
      if (m[1] !== 'owner0') throw new Error('404 Document not found for memberId')
      return { data: ownerDoc() }
    }
    throw new Error(`unexpected path ${path}`)
  })
  const post = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post, patch: vi.fn() } as never)
  return { get, post, create }
}

const adapter = () => new SproofSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

describe('sproof-sign client', () => {
  it('targets the documented server and sends the key as the token query parameter', async () => {
    const { create, get } = fakeSproof(1)
    await adapter().listEnvelopes(CREDS, parseListQuery({ page: '1', limit: '10' }))
    const cfg = create.mock.calls[0]?.[0] as { baseURL?: string; headers?: Record<string, string> }
    expect(cfg.baseURL).toBe('https://sign.sproof.com/api/v1')
    expect(cfg.headers?.['X-Api-Key']).toBeUndefined()
    expect(get.mock.calls[0]?.[1]?.params?.['token']).toBe(TOKEN)
  })

  it('refuses before sending anything when the credentials carry no key', async () => {
    const { get } = fakeSproof(1)
    await expect(adapter().listEnvelopes({ accessToken: '' }, parseListQuery({}))).rejects.toThrow(
      /no API key/,
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('sends the documented default perPage of 10 when the caller gives no limit', async () => {
    const { get } = fakeSproof(1)
    await adapter().listEnvelopes(CREDS, {})
    expect(get.mock.calls[0]).toEqual([
      '/documents',
      { params: { token: TOKEN, page: 1, perPage: 10 } },
    ])
  })

  it('encodes the member id into the GET /documents/{memberId} path', async () => {
    const { get } = fakeSproof(1)
    await expect(adapter().getEnvelope(CREDS, 'a/b')).rejects.toThrow(/404/)
    expect(get.mock.calls[0]?.[0]).toBe('/documents/a%2Fb')
  })
})

const LISTERS = [
  {
    name: 'listEnvelopes',
    call: (p: QueryParams) => adapter().listEnvelopes(CREDS, p),
    view: undefined,
  },
  {
    name: 'listTemplates',
    call: (p: QueryParams) => adapter().listTemplates(CREDS, p),
    view: 'templates',
  },
] as const

describe.each(LISTERS)('sproof-sign $name pages GET /documents', ({ call, view }) => {
  const ids = Array.from({ length: N }, (_, i) => `owner${i + 1}`)

  it('sends the caller page and exact limit as page/perPage, and only documented params', async () => {
    const { get } = fakeSproof(N)
    await call(parseListQuery({ page: '2', limit: '7' }))
    const expected: Record<string, unknown> = { token: TOKEN, page: 2, perPage: 7 }
    if (view) expected['view'] = view
    expect(get.mock.calls[0]).toEqual(['/documents', { params: expected }])
  })

  it('walks N = 2L+1 rows: every id once, hasMore exact from pagination.lastPage', async () => {
    fakeSproof(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('serves page 2 through parseListQuery and listPage', async () => {
    fakeSproof(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows: Array<{ id: string }> = await call(params)
    const env = listPage(rows, params, 'sproof-sign')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('sproof-sign getEnvelope / getTemplate read GET /documents/{memberId}', () => {
  it('reads back an id that listEnvelopes returned', async () => {
    const { get } = fakeSproof(1)
    const env = await adapter().getEnvelope(CREDS, 'owner0')
    expect(EnvelopeSchema.parse(env).id).toBe('owner0')
    expect(get.mock.calls[0]).toEqual(['/documents/owner0', { params: { token: TOKEN } }])
    const tpl = await adapter().getTemplate(CREDS, 'owner0')
    expect(TemplateSchema.parse(tpl).id).toBe('owner0')
  })
})

const CHILDREN = [
  {
    name: 'listSigners',
    call: (p: QueryParams) => adapter().listSigners(CREDS, 'owner0', p),
    ids: Array.from({ length: N }, (_, i) => `owner0:member${i + 1}`),
  },
] as const

describe.each(CHILDREN)('sproof-sign $name pages _Document.members locally', ({ call, ids }) => {
  it('walks N = 2L+1 rows: every id once, hasMore exact', async () => {
    const { get } = fakeSproof(1)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
    for (const c of get.mock.calls) {
      expect(c).toEqual(['/documents/owner0', { params: { token: TOKEN } }])
    }
  })
})

describe('sproof-sign getSigner', () => {
  it('reads back the last signer id listSigners returned', async () => {
    fakeSproof(1)
    const s = await adapter().getSigner(CREDS, `owner0:member${N}`)
    expect(SignerSchema.parse(s).id).toBe(`owner0:member${N}`)
    expect(s.email).toBe(`signer${N}@sproof.com`)
  })

  it('404s a member id the document does not carry', async () => {
    fakeSproof(1)
    await expect(adapter().getSigner(CREDS, 'owner0:nobody')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it.each(['owner0', ':member1', 'owner0:'])(
    'rejects the malformed id %j with 400 and sends no request',
    async (id) => {
      const { get } = fakeSproof(1)
      await expect(adapter().getSigner(CREDS, id)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION',
      })
      await expect(adapter().getDocument(CREDS, id)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION',
      })
      expect(get).not.toHaveBeenCalled()
    },
  )
})

describe('sproof-sign listDocuments / getDocument', () => {
  it('returns the one file of the document, paged locally', async () => {
    fakeSproof(1)
    const p1 = withPageSink({ page: 1, limit: 1 })
    const rows = await adapter().listDocuments(CREDS, 'owner0', p1)
    expect(rows.map((r) => r.id)).toEqual(['owner0:doc0'])
    expect(readUpstreamPage(p1)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 1, pagedLocally: true }),
    )
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter().listDocuments(CREDS, 'owner0', p2)).toEqual([])
    const doc = await adapter().getDocument(CREDS, 'owner0:doc0')
    expect(DocumentSchema.parse(doc).name).toBe('contract_0')
  })

  it('404s a document id that is not the file of that envelope', async () => {
    fakeSproof(1)
    await expect(adapter().getDocument(CREDS, 'owner0:otherdoc')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

describe('sproof-sign audit trail is refused (PDF only)', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, post } = fakeSproof(1)
    await expect(
      adapter().listAuditTrailEntries(CREDS, 'owner0', parseListQuery({ page: '1', limit: '10' })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get } = fakeSproof(1)
    await expect(adapter().getAuditTrailEntry(CREDS, 'owner0:0')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})
