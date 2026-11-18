/**
 * DocSpring list paging and request shapes, against fakes that honour only
 * documented parameters (https://docspring.com/api-docs/v1/swagger.json):
 *
 *   GET /submissions — query `cursor`, `limit`, `created_after`, `created_before`,
 *     `type`, `include_data`; response `{ submissions, limit, next_cursor }`,
 *     `next_cursor` "x-nullable". "Supports cursor-based pagination".
 *   GET /submissions/{submission_id} — embeds `data_requests`; no paging params.
 *   GET /data_requests/{data_request_id} — one data request, with `submission_id`.
 *   GET /templates — `page` ("Default: 1"), `per_page` ("maximum": 50,
 *     "Default: 50"); response is a bare array.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DocSpringClient } from '../../../../../../src/verticals/docsign/adapters/docspring/client'
import { DocSpringAdapter } from '../../../../../../src/verticals/docsign/adapters/docspring'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import {
  LIST_SUBMISSION_EXAMPLE,
  DATA_REQUEST_EXAMPLE,
  DATA_REQUEST_SUBMISSION_EXAMPLE,
  TEMPLATE_EXAMPLE,
} from './fixtures'

const adapter = new DocSpringAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
let CREDS: Credentials
let OTHER: Credentials
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50

beforeEach(async () => {
  _resetCursorPager()
  CREDS = await adapter.exchangeCredentials({ tokenId: 'api_test_id', tokenSecret: 'secret_a' })
  OTHER = await adapter.exchangeCredentials({ tokenId: 'api_test_id', tokenSecret: 'secret_b' })
})
afterEach(() => vi.restoreAllMocks())

const SUBMISSION_KEYS = new Set([
  'cursor',
  'limit',
  'created_after',
  'created_before',
  'type',
  'include_data',
])

/** Fake GET /submissions: rows newest first, `next_cursor` null on the last page. */
function fakeSubmissions(total: number, opts: { upstreamDefault?: number; cap?: number } = {}) {
  const def = opts.upstreamDefault ?? 50
  const ids = Array.from({ length: total }, (_, i) => `sub_${String(total - i).padStart(3, '0')}`)
  let calls = 0
  const get = vi
    .spyOn(DocSpringClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
      if (path !== '/submissions') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params ?? {})) {
        if (!SUBMISSION_KEYS.has(k)) throw new Error(`${k} is not a documented query key`)
      }
      const asked = params?.['limit'] !== undefined ? Number(params['limit']) : def
      const limit = opts.cap !== undefined ? Math.min(asked, opts.cap) : asked
      const cursor = params?.['cursor'] as string | undefined
      const start = cursor === undefined ? 0 : ids.indexOf(cursor) + 1
      if (cursor !== undefined && start === 0) throw new Error(`unknown cursor ${cursor}`)
      const page = ids.slice(start, start + limit)
      const end = start + page.length
      return {
        submissions: page.map((id) => ({ ...LIST_SUBMISSION_EXAMPLE, id })),
        limit,
        next_cursor: end < ids.length ? page[page.length - 1] : null,
      } as never
    })
  return { get, ids }
}

describe('DocSpringAdapter.listEnvelopes pages GET /submissions by next_cursor', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const { ids } = fakeSubmissions(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('sends the caller limit and carries next_cursor forward', async () => {
    const { get } = fakeSubmissions(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['/submissions', { limit: L }],
      ['/submissions', { limit: L, cursor: 'sub_004' }],
    ])
  })

  it('page 2 with a cold cache walks from page 1', async () => {
    const { ids, get } = fakeSubmissions(N)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('another connection does not reuse a cursor walked under the first', async () => {
    const { get } = fakeSubmissions(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listEnvelopes(OTHER, withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('an exactly full last page followed by nothing ends the walk', async () => {
    fakeSubmissions(2 * L)
    const p2 = withPageSink({ page: 2, limit: L })
    await adapter.listEnvelopes(CREDS, p2)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a page shorter than the response limit is the last even with a next_cursor', async () => {
    vi.spyOn(DocSpringClient.prototype, 'get').mockResolvedValue({
      submissions: [LIST_SUBMISSION_EXAMPLE],
      limit: 3,
      next_cursor: 'sub_1234567890abcdef01',
    } as never)
    const params = withPageSink({ page: 1, limit: 3 })
    await adapter.listEnvelopes(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a different limit does not reuse a cursor minted at the old page size', async () => {
    const { ids, get } = fakeSubmissions(N + 2)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L + 1 }))
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L + 1, 2 * (L + 1)))
    expect(get.mock.calls.slice(1).map((c) => c[1])).toEqual([
      { limit: L + 1 },
      { limit: L + 1, cursor: ids[L] },
    ])
  })

  it('reports the smaller page size the response limit says was served', async () => {
    const { ids } = fakeSubmissions(N, { cap: L })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter.listEnvelopes(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids.slice(0, L))
    expect(readUpstreamPage(params)).toEqual({ pageSize: L, hasMore: true })
  })

  it('reports no page size when the response limit is the one sent', async () => {
    fakeSubmissions(N)
    const params = withPageSink({ page: 1, limit: L })
    await adapter.listEnvelopes(CREDS, params)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('throws when the response carries no submissions array', async () => {
    vi.spyOn(DocSpringClient.prototype, 'get').mockResolvedValue({
      limit: L,
      next_cursor: null,
    } as never)
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /no submissions array/,
    )
  })

  it('with no limit, sends none and lets the platform default apply', async () => {
    const { get } = fakeSubmissions(3)
    await adapter.listEnvelopes(CREDS, withPageSink({}))
    expect(get.mock.calls[0]![1]).toEqual({})
  })
})

describe('DocSpringAdapter envelope and signer reads', () => {
  it('getEnvelope reads GET /submissions/{submission_id}', async () => {
    const get = vi
      .spyOn(DocSpringClient.prototype, 'get')
      .mockResolvedValue(DATA_REQUEST_SUBMISSION_EXAMPLE as never)
    const env = await adapter.getEnvelope(CREDS, 'sub_1234567890abcdef01')
    expect(get.mock.calls[0]![0]).toBe('/submissions/sub_1234567890abcdef01')
    expect(env.signerIds).toEqual(['drq_1234567890abcdef01'])
  })

  it('getEnvelope encodes the id into the path', async () => {
    const get = vi
      .spyOn(DocSpringClient.prototype, 'get')
      .mockResolvedValue(DATA_REQUEST_SUBMISSION_EXAMPLE as never)
    await adapter.getEnvelope(CREDS, 'sub/1?x')
    expect(get.mock.calls[0]![0]).toBe('/submissions/sub%2F1%3Fx')
  })

  it('getSigner reads GET /data_requests/{id} and takes the envelope from submission_id', async () => {
    const get = vi
      .spyOn(DocSpringClient.prototype, 'get')
      .mockResolvedValue(DATA_REQUEST_EXAMPLE as never)
    const s = SignerSchema.parse(await adapter.getSigner(CREDS, 'drq_1234567890abcdef01'))
    expect(get.mock.calls[0]![0]).toBe('/data_requests/drq_1234567890abcdef01')
    expect(s.envelopeId).toBe('sub_1234567890abcdef01')
  })

  it('listSigners pages the embedded data_requests locally, every id once', async () => {
    const drqs = Array.from({ length: N }, (_, i) => ({
      ...DATA_REQUEST_SUBMISSION_EXAMPLE.data_requests[0],
      id: `drq_${i + 1}`,
    }))
    const get = vi
      .spyOn(DocSpringClient.prototype, 'get')
      .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
        if (path !== '/submissions/sub_1') throw new Error(`unexpected path ${path}`)
        if (params !== undefined) throw new Error('GET /submissions/{id} takes no paging params')
        return { ...DATA_REQUEST_SUBMISSION_EXAMPLE, id: 'sub_1', data_requests: drqs } as never
      })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSigners(CREDS, 'sub_1', params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(rows.every((r) => r.envelopeId === 'sub_1')).toBe(true)
    }
    expect(seen).toEqual(drqs.map((d) => d.id))
    expect(more).toEqual([true, true, false])
    expect(get).toHaveBeenCalledTimes(3)
  })
})

/** Fake GET /templates: honours only page/per_page (max 50, default 50), bare array. */
function fakeTemplates(total: number) {
  const ids = Array.from({ length: total }, (_, i) => `tpl_${String(i + 1).padStart(3, '0')}`)
  let calls = 0
  const get = vi
    .spyOn(DocSpringClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
      if (path !== '/templates') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params ?? {})) {
        if (!['page', 'per_page', 'query', 'parent_folder_id'].includes(k)) {
          throw new Error(`${k} is not a documented query key`)
        }
      }
      const perPage = Number(params?.['per_page'] ?? 50)
      if (perPage < 1 || perPage > 50) throw new Error(`per_page ${perPage} is outside 1..50`)
      const page = Number(params?.['page'] ?? 1)
      return ids
        .slice((page - 1) * perPage, page * perPage)
        .map((id) => ({ ...TEMPLATE_EXAMPLE, id })) as never
    })
  return { get, ids }
}

describe('DocSpringAdapter.listTemplates pages GET /templates by page/per_page', () => {
  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const { ids } = fakeTemplates(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTemplates(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('sends the caller page and limit as page and per_page', async () => {
    const { get } = fakeTemplates(N)
    await adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls[0]![1]).toEqual({ page: 2, per_page: L })
  })

  it('clamps a limit above the documented maximum (50) and reports the size it sent', async () => {
    const { get } = fakeTemplates(120)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await adapter.listTemplates(CREDS, params)
    expect(get.mock.calls[0]![1]).toEqual({ page: 2, per_page: 50 })
    expect(rows.map((r) => r.id)[0]).toBe('tpl_051')
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 50 })
  })

  it('throws when the response is not the documented bare array', async () => {
    vi.spyOn(DocSpringClient.prototype, 'get').mockResolvedValue({ templates: [] } as never)
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /did not return an array/,
    )
  })

  it('propagates an upstream error instead of returning an empty list', async () => {
    vi.spyOn(DocSpringClient.prototype, 'get').mockRejectedValue(
      Object.assign(new Error('Not Found'), { response: { status: 404 } }),
    )
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      'Not Found',
    )
  })

  it('getTemplate reads GET /templates/{template_id}', async () => {
    const get = vi
      .spyOn(DocSpringClient.prototype, 'get')
      .mockResolvedValue(TEMPLATE_EXAMPLE as never)
    const t = await adapter.getTemplate(CREDS, 'tpl_1234567890abcdef01')
    expect(get.mock.calls[0]![0]).toBe('/templates/tpl_1234567890abcdef01')
    expect(t.name).toBe('Template 1')
  })
})

describe('DocSpringAdapter refuses what the API does not document', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['listDocuments', () => adapter.listDocuments(CREDS, 'sub_1', { page: 1, limit: L })],
    ['getDocument', () => adapter.getDocument(CREDS, 'doc_1')],
    [
      'listAuditTrailEntries',
      () => adapter.listAuditTrailEntries(CREDS, 'sub_1', { page: 1, limit: L }),
    ],
    ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, 'sub_1:0')],
  ]
  for (const [name, call] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const get = vi.spyOn(DocSpringClient.prototype, 'get')
      const post = vi.spyOn(DocSpringClient.prototype, 'post')
      const create = vi.spyOn(axios, 'create')
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })
  }
})

describe('DocSpring auth', () => {
  it('asks for the API token id and secret', () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['tokenId', 'tokenSecret'])
  })

  it('sends HTTP Basic base64(token_id:token_secret) to sync.api.docspring.com/api/v1', async () => {
    const create = vi.spyOn(axios, 'create')
    const creds = await adapter.exchangeCredentials({
      tokenId: 'API_TOKEN_ID',
      tokenSecret: 'API_TOKEN_SECRET',
    })
    new DocSpringClient(creds)
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://sync.api.docspring.com/api/v1')
    // The authentication guide's own example: echo -n "API_TOKEN_ID:API_TOKEN_SECRET" | base64
    expect((cfg.headers as Record<string, string>)['Authorization']).toBe(
      'Basic QVBJX1RPS0VOX0lEOkFQSV9UT0tFTl9TRUNSRVQ=',
    )
  })

  it('refuses credentials missing either half', async () => {
    await expect(adapter.exchangeCredentials({ tokenId: 'x' })).rejects.toThrow(/tokenSecret/)
    await expect(adapter.exchangeCredentials({ tokenSecret: 'x' })).rejects.toThrow(/tokenId/)
  })
})
