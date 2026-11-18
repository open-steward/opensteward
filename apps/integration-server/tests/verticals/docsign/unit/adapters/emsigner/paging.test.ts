/**
 * emSigner list paging, request shape and auth.
 *
 * The fake answers at the axios layer and honours ONLY what the vendor's
 * Swagger (https://api.emsigner.com/swagger/docs/v1) documents; an
 * undocumented path, body property or query parameter throws.
 *
 *   - POST /api/AuthorizeApp, body AuthorizeAppRequest { AppName, SecretKey }
 *     (both required) -> ReturnObject[AuthorizeAppResp { AuthToken }].
 *   - Every data path: header `Authorization` (required) carrying the token
 *     "as basic authentication", and `UserName` ("User EmailId").
 *   - POST /api/GetAllDocuments, body WorkflowSearchViewModel
 *     { TabStatusType, Status, pagenumber, PageSize, DocName, DocOwner,
 *     StartDate, EndDate, ExpiryFromDate, ExpiryToDate, TemplateName,
 *     DocumentNumber, Referenceno } -> ReturnObject[List[FilesView]].
 *   - POST /api/GetWorkflowInfo, body WorkflowInfoInput { WorkflowId,
 *     ReferenceNo, ParentDocumentId } -> ReturnObject[WorkflowInfo].
 *   - GET /api/GetDocumentLog, query workflowId, documentId, ReferenceNo,
 *     SelectedYear -> ReturnObject[List[DocumentLogView]].
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { EmSignerAdapter } from '../../../../../../src/verticals/docsign/adapters/emsigner'
import { _resetEmSignerTokens } from '../../../../../../src/verticals/docsign/adapters/emsigner/client'
import type { RawEmSignerFilesView } from '../../../../../../src/verticals/docsign/adapters/emsigner/types'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import {
  DOCUMENT_LOG_EXAMPLE,
  FILES_VIEW_EXAMPLE,
  WORKFLOW_INFO_EXAMPLE,
  ok,
} from './transform/fixtures'

const EMAIL = 'api.user@example.com'
const CREDS: Credentials = { accessToken: 'secret-1', extra: { appName: 'app-1', userName: EMAIL } }
const TOKEN = 'token-1'
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 60

const adapter = new EmSignerAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

const SEARCH_KEYS = new Set([
  'TabStatusType',
  'Status',
  'pagenumber',
  'PageSize',
  'DocName',
  'DocOwner',
  'StartDate',
  'EndDate',
  'ExpiryFromDate',
  'ExpiryToDate',
  'TemplateName',
  'DocumentNumber',
  'Referenceno',
])
const INFO_KEYS = new Set(['WorkflowId', 'ReferenceNo', 'ParentDocumentId'])
const LOG_KEYS = new Set(['workflowId', 'documentId', 'ReferenceNo', 'SelectedYear'])

interface Sent {
  method: string
  url: string
  baseURL: string | undefined
  headers: Record<string, unknown>
  params: Record<string, unknown> | undefined
  body: Record<string, unknown> | undefined
}

function only(keys: Set<string>, obj: Record<string, unknown> | undefined, what: string): void {
  for (const k of Object.keys(obj ?? {})) {
    if (!keys.has(k)) throw new Error(`fake: ${what} does not document "${k}"`)
  }
}

/**
 * What the live API answered a Basic token it did not recognise when probed
 * on 2026-09-24: HTTP 500 with an empty body.
 */
function serverError(): never {
  throw Object.assign(new Error('Request failed with status code 500'), {
    isAxiosError: true,
    response: { status: 500, data: '' },
  })
}

function unauthorized(): never {
  throw Object.assign(new Error('Request failed with status code 401'), {
    isAxiosError: true,
    response: { status: 401, data: 'You are unauthorized to access this resource' },
  })
}

interface World {
  rows: RawEmSignerFilesView[]
  /** Tokens AuthorizeApp hands out, in order. */
  tokens?: string[]
  /** Tokens the data paths accept. */
  valid?: Set<string>
  /** How the data paths answer a token they do not accept (default 401). */
  staleStatus?: 401 | 500
  /** Every data path answers 500 whatever the token. */
  down?: boolean
  /** AuthorizeApp answers IsSuccess false this many times first. */
  authFailures?: number
  /** Number of DocumentInfo entries GetWorkflowInfo answers (default: the sample's). */
  documents?: number
  /** ReferenceNo GetWorkflowInfo answers instead of the row's own. */
  infoReferenceNo?: string
}

function fakeAxios(world: World) {
  const sent: Sent[] = []
  const tokens = [...(world.tokens ?? [TOKEN])]
  const valid = world.valid ?? new Set([TOKEN])
  let calls = 0
  let authFailures = world.authFailures ?? 0
  vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const method = String(cfg.method).toUpperCase()
    const url = String(cfg.url)
    const headers = {
      ...(this.defaults.headers as unknown as Record<string, unknown>),
      ...(cfg.headers as Record<string, unknown>),
    }
    const body = cfg.data as Record<string, unknown> | undefined
    const params = cfg.params as Record<string, unknown> | undefined
    sent.push({ method, url, baseURL: this.defaults.baseURL, headers, params, body })
    const reply = (data: unknown) => ({ data, status: 200, headers: {}, config: cfg }) as never

    if (method === 'POST' && url === '/api/AuthorizeApp') {
      only(new Set(['AppName', 'SecretKey']), body, 'AuthorizeAppRequest')
      if (
        body?.['AppName'] !== 'app-1' ||
        body?.['SecretKey'] !== 'secret-1' ||
        authFailures-- > 0
      ) {
        return reply({
          IsSuccess: false,
          Messages: ['Please enter a valid AppName and  SecretKey!'],
          ErrorCode: 0,
          Response: null,
        })
      }
      return reply(ok({ AuthToken: tokens.shift() ?? TOKEN }))
    }

    const auth = String(headers['Authorization'] ?? '')
    if (!auth.startsWith('Basic ')) unauthorized()
    if (!valid.has(auth.slice('Basic '.length))) {
      if (world.staleStatus === 500) serverError()
      unauthorized()
    }
    if (world.down) serverError()
    if (headers['UserName'] !== EMAIL) throw new Error('fake: UserName header missing')

    if (method === 'POST' && url === '/api/GetAllDocuments') {
      only(SEARCH_KEYS, body, 'WorkflowSearchViewModel')
      const page = body?.['pagenumber']
      const size = body?.['PageSize']
      if (!Number.isInteger(page) || !Number.isInteger(size))
        throw new Error('fake: pagenumber/PageSize')
      const ref = body?.['Referenceno']
      const rows = ref === undefined ? world.rows : world.rows.filter((r) => r.Referenceno === ref)
      const p = page as number
      const s = size as number
      return reply(ok(rows.slice((p - 1) * s, p * s)))
    }
    if (method === 'POST' && url === '/api/GetWorkflowInfo') {
      only(INFO_KEYS, body, 'WorkflowInfoInput')
      const id = body?.['WorkflowId'] as number
      const row = world.rows.find((r) => r.WorkFlowId === id)
      if (!row) return reply(ok(null))
      const docs =
        world.documents === undefined
          ? WORKFLOW_INFO_EXAMPLE.DocumentInfo
          : Array.from({ length: world.documents }, (_, i) => ({
              ...WORKFLOW_INFO_EXAMPLE.DocumentInfo![0]!,
              DocumentId: 3 + i,
            }))
      return reply(
        ok({
          ...WORKFLOW_INFO_EXAMPLE,
          WorkflowId: id,
          ReferenceNo: world.infoReferenceNo ?? row.Referenceno,
          DocumentInfo: docs,
        }),
      )
    }
    if (method === 'GET' && url === '/api/GetDocumentLog') {
      only(LOG_KEYS, params, 'GetDocumentLog')
      return reply(ok(DOCUMENT_LOG_EXAMPLE))
    }
    throw new Error(`fake: undocumented ${method} ${url}`)
  })
  return sent
}

function rows(n: number): RawEmSignerFilesView[] {
  return Array.from({ length: n }, (_, i) => ({
    ...FILES_VIEW_EXAMPLE,
    WorkFlowId: 101 + i,
    Referenceno: `ref-${101 + i}`,
  }))
}

beforeEach(() => {
  _resetCursorPager()
  _resetEmSignerTokens()
})
afterEach(() => vi.restoreAllMocks())

describe('emsigner auth', () => {
  it('trades AppName + SecretKey for an AuthToken and sends it as Basic with UserName', async () => {
    const sent = fakeAxios({ rows: rows(1) })
    await adapter.listEnvelopes(CREDS, { page: 1, limit: L })
    expect(sent[0]).toMatchObject({
      method: 'POST',
      url: '/api/AuthorizeApp',
      baseURL: 'https://api.emsigner.com',
      body: { AppName: 'app-1', SecretKey: 'secret-1' },
    })
    for (const s of sent.slice(1)) {
      expect(s.baseURL).toBe('https://api.emsigner.com')
      expect(s.headers['Authorization']).toBe(`Basic ${TOKEN}`)
      expect(s.headers['UserName']).toBe(EMAIL)
    }
  })

  it('reuses the token across calls on one connection', async () => {
    const sent = fakeAxios({ rows: rows(1) })
    await adapter.listEnvelopes(CREDS, { page: 1, limit: L })
    await adapter.listSigners(CREDS, '101', { page: 1, limit: L })
    expect(sent.filter((s) => s.url === '/api/AuthorizeApp')).toHaveLength(1)
  })

  it('fetches a fresh token once on a 401, then retries', async () => {
    const sent = fakeAxios({ rows: rows(1), tokens: ['stale', TOKEN] })
    const out = await adapter.listSigners(CREDS, '101', { page: 1, limit: L })
    expect(out).toHaveLength(2)
    expect(sent.filter((s) => s.url === '/api/AuthorizeApp')).toHaveLength(2)
  })

  it('fetches a fresh token once when a stale one gets the HTTP 500 the live API sends', async () => {
    const sent = fakeAxios({ rows: rows(1), tokens: ['stale', TOKEN], staleStatus: 500 })
    const started = Date.now()
    const out = await adapter.listSigners(CREDS, '101', { page: 1, limit: L })
    expect(out).toHaveLength(2)
    expect(sent.filter((s) => s.url === '/api/AuthorizeApp')).toHaveLength(2)
    expect(sent.filter((s) => s.url === '/api/GetWorkflowInfo')).toHaveLength(2)
    // No backoff was spent on the stale token.
    expect(Date.now() - started).toBeLessThan(900)
  })

  it('backs off on a 500 that a fresh token does not cure, then fails', async () => {
    vi.useFakeTimers()
    try {
      const sent = fakeAxios({ rows: rows(1), down: true })
      const call = adapter.listSigners(CREDS, '101', { page: 1, limit: L })
      const done = expect(call).rejects.toMatchObject({ response: { status: 500 } })
      await vi.runAllTimersAsync()
      await done
      expect(sent.filter((s) => s.url === '/api/AuthorizeApp')).toHaveLength(2)
      // One send on the first token, then 1 + 4 retries on the fresh one.
      expect(sent.filter((s) => s.url === '/api/GetWorkflowInfo')).toHaveLength(6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not keep a failed AuthorizeApp: the next call authorises again', async () => {
    const sent = fakeAxios({ rows: rows(1), authFailures: 1 })
    await expect(adapter.listSigners(CREDS, '101', { page: 1, limit: L })).rejects.toThrow(
      /AuthorizeApp failed/,
    )
    await expect(adapter.listSigners(CREDS, '101', { page: 1, limit: L })).resolves.toHaveLength(2)
    expect(sent.filter((s) => s.url === '/api/AuthorizeApp')).toHaveLength(2)
  })

  it('treats IsSuccess false as an error', async () => {
    fakeAxios({ rows: rows(1) })
    await expect(
      adapter.listEnvelopes({ ...CREDS, accessToken: 'wrong' }, { page: 1, limit: L }),
    ).rejects.toThrow(/AuthorizeApp failed: Please enter a valid AppName/)
  })

  it('exchangeCredentials keeps the SecretKey as the secret and the rest in extra', async () => {
    await expect(
      adapter.exchangeCredentials({ appName: 'app-1', secretKey: 'secret-1', userName: EMAIL }),
    ).resolves.toEqual(CREDS)
    await expect(
      adapter.exchangeCredentials({ appName: 'app-1', secretKey: 'secret-1' }),
    ).rejects.toThrow()
  })
})

describe('emsigner listEnvelopes', () => {
  it('sends the caller page number and exact size to GetAllDocuments', async () => {
    const sent = fakeAxios({ rows: rows(N) })
    await adapter.listEnvelopes(CREDS, { page: 2, limit: L })
    const lists = sent.filter((s) => s.url === '/api/GetAllDocuments')
    expect(lists[0]!.body).toEqual({ pagenumber: 1, PageSize: L })
    expect(lists.map((s) => s.body!['pagenumber'])).toContain(2)
    for (const s of lists) expect(s.body!['PageSize']).toBe(L)
  })

  it('walks N = 2L+1 rows: every id once, hasMore exact', async () => {
    const sent = fakeAxios({ rows: rows(N) })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params: QueryParams = withPageSink({ page, limit: L })
      const out = await adapter.listEnvelopes(CREDS, params)
      for (const e of out) seen.push(EnvelopeSchema.parse(e).id)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['101', '102', '103', '104', '105'])
    expect(more).toEqual([true, true, false])
    // Page 3 is short, so it ends the collection: nothing past it is asked for.
    const pages = sent
      .filter((s) => s.url === '/api/GetAllDocuments')
      .map((s) => s.body!['pagenumber'])
    expect(Math.max(...(pages as number[]))).toBe(3)
  })

  it('keeps pages of different sizes apart on one connection', async () => {
    const sent = fakeAxios({ rows: rows(8) })
    await adapter.listEnvelopes(CREDS, { page: 1, limit: 2 })
    const out = await adapter.listEnvelopes(CREDS, { page: 2, limit: 3 })
    expect(out.map((e) => e.id)).toEqual(['104', '105', '106'])
    const sizes = sent
      .filter((s) => s.url === '/api/GetAllDocuments')
      .map((s) => s.body!['PageSize'])
    expect(sizes).toContain(3)
  })

  it('completes each row from GetWorkflowInfo', async () => {
    const sent = fakeAxios({ rows: rows(N) })
    const out = await adapter.listEnvelopes(CREDS, { page: 1, limit: L })
    const infos = sent.filter((s) => s.url === '/api/GetWorkflowInfo').map((s) => s.body)
    expect(infos).toEqual([{ WorkflowId: 101 }, { WorkflowId: 102 }])
    expect(out[0]!.signerIds).toEqual(['101:0', '101:1'])
    expect(out[0]!.signingOrder).toBe('sequential')
  })
})

describe('emsigner getEnvelope', () => {
  it('reads the workflow from GetWorkflowInfo and its row by Referenceno', async () => {
    const sent = fakeAxios({ rows: rows(N) })
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, '103'))
    expect(env.id).toBe('103')
    expect(env.metadata['referenceNo']).toBe('ref-103')
    const list = sent.find((s) => s.url === '/api/GetAllDocuments')!
    expect(list.body).toEqual({ pagenumber: 1, PageSize: 100, Referenceno: 'ref-103' })
    // The filtered page is short, so the lookup stops there.
    expect(sent.filter((s) => s.url === '/api/GetAllDocuments')).toHaveLength(1)
  })

  it('is not found for an id that is not a workflow id, without a request', async () => {
    const sent = fakeAxios({ rows: rows(1) })
    await expect(adapter.getEnvelope(CREDS, 'env_1')).rejects.toMatchObject({ statusCode: 404 })
    expect(sent).toHaveLength(0)
  })

  it('stops the lookup at the first short page when the row is not on it', async () => {
    const sent = fakeAxios({ rows: rows(N), infoReferenceNo: 'ref-elsewhere' })
    await expect(adapter.getEnvelope(CREDS, '103')).rejects.toMatchObject({ statusCode: 404 })
    expect(sent.filter((s) => s.url === '/api/GetAllDocuments')).toHaveLength(1)
  })

  it('is not found when GetWorkflowInfo answers nothing', async () => {
    fakeAxios({ rows: rows(1) })
    await expect(adapter.getEnvelope(CREDS, '999')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('emsigner envelope children', () => {
  it('listSigners reads GetWorkflowInfo and pages its Signatories locally', async () => {
    const sent = fakeAxios({ rows: rows(1) })
    const p1 = withPageSink({ page: 1, limit: 1 })
    const p2 = withPageSink({ page: 2, limit: 1 })
    const a = await adapter.listSigners(CREDS, '101', p1)
    const b = await adapter.listSigners(CREDS, '101', p2)
    expect([...a, ...b].map((s) => SignerSchema.parse(s).id)).toEqual(['101:0', '101:1'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, totalCount: 2, pagedLocally: true })
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false })
    expect(sent.filter((s) => s.url === '/api/GetWorkflowInfo')[0]!.body).toEqual({
      WorkflowId: 101,
    })
  })

  it('listDocuments reads GetWorkflowInfo.DocumentInfo and pages it locally', async () => {
    fakeAxios({ rows: rows(1), documents: N })
    const ids: string[] = []
    const orders: number[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const out = await adapter.listDocuments(CREDS, '101', params)
      expect(out.length).toBeLessThanOrEqual(L)
      for (const d of out) {
        const doc = DocumentSchema.parse(d)
        ids.push(doc.id)
        orders.push(doc.order)
      }
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(['3', '4', '5', '6', '7'])
    expect(orders).toEqual([0, 1, 2, 3, 4])
    expect(more).toEqual([true, true, false])
  })

  it('listAuditTrailEntries reads GetDocumentLog by workflowId and flattens every log', async () => {
    const sent = fakeAxios({ rows: rows(1) })
    const seen: string[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      const out = await adapter.listAuditTrailEntries(CREDS, '101', params)
      for (const e of out) seen.push(AuditTrailEntrySchema.parse(e).id)
      expect(readUpstreamPage(params)?.hasMore).toBe(page < 2)
    }
    expect(seen).toEqual(['101:0', '101:1', '101:2', '101:3'])
    const log = sent.find((s) => s.url === '/api/GetDocumentLog')!
    expect(log.method).toBe('GET')
    expect(log.params).toEqual({ workflowId: 101 })
  })

  it('getAuditTrailEntry finds an entry by its position', async () => {
    fakeAxios({ rows: rows(1) })
    const e = await adapter.getAuditTrailEntry(CREDS, '101:2')
    expect(e.id).toBe('101:2')
  })

  it('does not swallow an upstream error', async () => {
    fakeAxios({ rows: rows(1), valid: new Set() })
    await expect(
      adapter.listAuditTrailEntries(CREDS, '101', { page: 1, limit: L }),
    ).rejects.toMatchObject({
      response: { status: 401 },
    })
  })
})

describe('emsigner templates', () => {
  it('listTemplates refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const sent = fakeAxios({ rows: rows(1) })
    await expect(adapter.listTemplates(CREDS, { page: 1, limit: L })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(0)
  })

  it('getTemplate refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const sent = fakeAxios({ rows: rows(1) })
    await expect(adapter.getTemplate(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(sent).toHaveLength(0)
  })
})
