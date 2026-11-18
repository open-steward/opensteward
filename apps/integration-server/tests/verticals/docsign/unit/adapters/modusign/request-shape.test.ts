/**
 * Modusign per-envelope lists: request shape, auth and paging.
 *
 * Documented (OpenAPI on developers.modusign.co.kr/reference/*.md):
 *   servers: [{ "url": "https://api.modusign.co.kr" }]  — no /v1 segment
 *   GET /documents/{documentId}            — only the path parameter
 *   GET /documents/{documentId}/histories  — only the path parameter,
 *                                            body `{ histories: HistoryDto[] }`
 *   security: Basic | Bearer; the API-key scheme is Basic with
 *   "ID는 사용자의 이메일을, 패스워드에 해당하는 부분은 발급 받은 API KEY로"
 *   (developers.modusign.co.kr/docs/api-key로-요청하기.md).
 *
 * Neither endpoint pages, so every list is served from the whole embedded
 * array and paged locally: each row once, `hasMore` exact.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { ModusignAdapter } from '../../../../../../src/verticals/docsign/adapters/modusign/index'
import type { RawModusignHistoryEntry } from '../../../../../../src/verticals/docsign/adapters/modusign/transform/audit-trail-entry'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { SIGNING_COMPLETED, documentDetail, participant } from './fixtures'

const EMAIL = 'owner@company.example'
const API_KEY = 'msk_test'
const CREDS = { accessToken: API_KEY, extra: { email: EMAIL } }
const EXPECTED_AUTH = `Basic ${Buffer.from(`${EMAIL}:${API_KEY}`).toString('base64')}`

const L = 3
const N = 2 * L + 1

function histories(n: number): RawModusignHistoryEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    ...SIGNING_COMPLETED,
    timestamp: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
    message: `entry ${i}`,
  }))
}

/**
 * A fake Modusign honouring only the documented surface: the documented
 * server, Basic auth, the two documented paths and NO query parameters.
 */
function fakeModusign(nParticipants: number, nHistories: number) {
  const doc = documentDetail({
    participants: Array.from({ length: nParticipants }, (_, i) => participant(i + 1)),
  })
  const created: Array<{ baseURL?: string; headers?: Record<string, string> }> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const cfgCreate = created[created.length - 1]!
    if (cfgCreate.baseURL !== 'https://api.modusign.co.kr') {
      throw new Error(`404: undocumented server ${String(cfgCreate.baseURL)}`)
    }
    if (cfgCreate.headers?.['Authorization'] !== EXPECTED_AUTH) {
      throw new Error('401: expected Basic <email:apiKey>')
    }
    const params = cfg?.params ?? {}
    if (Object.keys(params).length > 0) {
      throw new Error(`undocumented query parameters: ${JSON.stringify(params)}`)
    }
    if (path === '/documents/doc_1') return { data: doc }
    if (path === '/documents/doc_1/histories') return { data: { histories: histories(nHistories) } }
    // A document id containing ':' (ids are opaque strings), percent-encoded.
    if (path === '/documents/doc%3A1/histories') {
      return { data: { histories: histories(nHistories) } }
    }
    throw new Error(`404: undocumented path ${path}`)
  })
  vi.spyOn(axios, 'create').mockImplementation(((c: (typeof created)[number]) => {
    created.push(c)
    return { get, post: vi.fn() }
  }) as never)
  return { get, created }
}

const adapter = () => new ModusignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

const METHODS = [
  {
    name: 'listSigners',
    fake: () => fakeModusign(N, 0),
    call: (p: QueryParams) => adapter().listSigners(CREDS, 'doc_1', p),
    path: '/documents/doc_1',
    schema: SignerSchema,
    expectedIds: Array.from({ length: N }, (_, i) => `p${i + 1}`),
  },
  {
    name: 'listAuditTrailEntries',
    fake: () => fakeModusign(0, N),
    call: (p: QueryParams) => adapter().listAuditTrailEntries(CREDS, 'doc_1', p),
    path: '/documents/doc_1/histories',
    schema: AuditTrailEntrySchema,
    expectedIds: Array.from({ length: N }, (_, i) => `doc_1:${i}`),
  },
] as const

describe.each(METHODS)('modusign $name', ({ fake, call, path, schema, expectedIds }) => {
  it('asks the documented path on the documented server with Basic auth and no query', async () => {
    const { get, created } = fake()
    await call(withPageSink({ page: 1, limit: L }))
    expect(created[0]).toMatchObject({
      baseURL: 'https://api.modusign.co.kr',
      headers: { Authorization: EXPECTED_AUTH },
    })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(path)
    expect(get.mock.calls[0]![1]?.params).toBeUndefined()
  })

  it(`walks N = 2L+1 = ${N} rows at limit ${L}: every id once, hasMore exact`, async () => {
    fake()
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
      expect(meta?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(expectedIds)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('a page past the end is empty with hasMore false', async () => {
    fake()
    const params = withPageSink({ page: 4, limit: L })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a connection with no account email refuses before sending anything', async () => {
    const { get } = fake()
    await expect(
      adapter().listSigners({ accessToken: API_KEY, extra: {} }, 'doc_1', { page: 1, limit: L }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('modusign listDocuments', () => {
  it('serves the one document of GET /documents/{id}; page 2 is empty; hasMore exact', async () => {
    const { get } = fakeModusign(2, 0)
    const p1 = withPageSink({ page: 1, limit: 1 })
    const docs = await adapter().listDocuments(CREDS, 'doc_1', p1)
    for (const d of docs) expect(() => DocumentSchema.parse(d)).not.toThrow()
    expect(docs.map((d) => d.id)).toEqual(['doc_1'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: false, totalCount: 1 })
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter().listDocuments(CREDS, 'doc_1', p2)).toEqual([])
    expect(get.mock.calls.every((c) => c[0] === '/documents/doc_1')).toBe(true)
  })

  it('getDocument reads the same documented path', async () => {
    const { get } = fakeModusign(1, 0)
    expect((await adapter().getDocument(CREDS, 'doc_1')).name).toBe('근로계약서')
    expect(get).toHaveBeenCalledWith('/documents/doc_1', { params: undefined })
  })
})

describe('modusign document ids are path-encoded', () => {
  it('listSigners encodes the document id into /documents/{documentId}', async () => {
    const { get } = fakeModusign(1, 0)
    await expect(adapter().listSigners(CREDS, 'doc/1', { page: 1, limit: L })).rejects.toThrow(
      /404/,
    )
    expect(get.mock.calls[0]![0]).toBe('/documents/doc%2F1')
  })

  it('listAuditTrailEntries encodes the document id into /documents/{documentId}/histories', async () => {
    const { get } = fakeModusign(0, 1)
    await expect(
      adapter().listAuditTrailEntries(CREDS, 'doc/1', { page: 1, limit: L }),
    ).rejects.toThrow(/404/)
    expect(get.mock.calls[0]![0]).toBe('/documents/doc%2F1/histories')
  })
})

describe('modusign Basic auth', () => {
  it('a connection with an email but an empty API key refuses with 401 before sending', async () => {
    const { get } = fakeModusign(1, 0)
    await expect(
      adapter().listSigners({ accessToken: '', extra: { email: EMAIL } }, 'doc_1', {
        page: 1,
        limit: L,
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('modusign getAuditTrailEntry', () => {
  it('reads back an entry of a document whose id contains ":"', async () => {
    const { get } = fakeModusign(0, N)
    const back = await adapter().getAuditTrailEntry(CREDS, 'doc:1:4')
    expect(get.mock.calls[0]![0]).toBe(`/documents/${encodeURIComponent('doc:1')}/histories`)
    expect(back.id).toBe('doc:1:4')
    expect(back.description).toBe('entry 4')
  })

  it('reads back an id listAuditTrailEntries returned', async () => {
    fakeModusign(0, N)
    const listed = await adapter().listAuditTrailEntries(CREDS, 'doc_1', { page: 2, limit: L })
    const back = await adapter().getAuditTrailEntry(CREDS, listed[0]!.id)
    expect(back.id).toBe(listed[0]!.id)
    expect(back.description).toBe(listed[0]!.description)
  })
})

describe('modusign exchangeCredentials', () => {
  it('stores the API key and the account email Basic auth needs', async () => {
    expect(await adapter().exchangeCredentials({ apiKey: API_KEY, email: EMAIL })).toEqual({
      accessToken: API_KEY,
      extra: { email: EMAIL },
    })
  })

  it('requires the email', async () => {
    await expect(adapter().exchangeCredentials({ apiKey: API_KEY })).rejects.toThrow(/email/)
  })
})
