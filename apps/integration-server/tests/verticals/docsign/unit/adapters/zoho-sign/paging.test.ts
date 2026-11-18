import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { ZohoSignClient } from '../../../../../../src/verticals/docsign/adapters/zoho-sign/client'
import { ZohoSignAdapter } from '../../../../../../src/verticals/docsign/adapters/zoho-sign'

/**
 * Zoho Sign pages its lists by a JSON `data` query parameter, never by
 * page/per_page:
 *   https://www.zoho.com/sign/api/document-managment/get-document-list.html
 *     "row_count * Int No of rows to be retrieved Integers [1,2,...,n]
 *      start_index * Int Start Index Integers [1,2,...,n]"
 *   https://www.zoho.com/sign/api/template-managment/get-template-list.html
 *     "row_count * Int No of rows to be retrieved [10,25,50,100]"
 *     data={"page_context":{"row_count":10,"start_index":1,...}}
 * and both reply with page_context { has_more_rows, start_index, total_count }.
 *
 * The fakes below honour ONLY that documented shape: anything else (a
 * top-level page or per_page) is ignored, exactly as the upstream would, so
 * an adapter that sends the old parameters gets page 1 again.
 */

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new ZohoSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

interface PageContext {
  row_count: number
  start_index: number
  sort_column: string
  sort_order: string
}

function readPageContext(params?: Record<string, unknown>): PageContext {
  const raw = params?.['data']
  if (typeof raw !== 'string')
    return { row_count: 10, start_index: 1, sort_column: '', sort_order: '' }
  return (JSON.parse(raw) as { page_context: PageContext }).page_context
}

function slice(n: number, ctx: PageContext) {
  const start = ctx.start_index - 1
  const end = Math.min(start + ctx.row_count, n)
  return {
    rows: Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i),
    page_context: {
      has_more_rows: end < n,
      start_index: ctx.start_index,
      total_count: n,
      row_count: ctx.row_count,
    },
  }
}

function mockRequests(n: number) {
  return vi
    .spyOn(ZohoSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/requests') throw new Error(`unexpected path ${path}`)
      const { rows, page_context } = slice(n, readPageContext(params))
      return {
        requests: rows.map((i) => ({ request_id: `req_${i}`, request_status: 'inprogress' })),
        page_context,
      } as never
    })
}

function mockTemplates(n: number) {
  return vi
    .spyOn(ZohoSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/templates') throw new Error(`unexpected path ${path}`)
      const ctx = readPageContext(params)
      if (![10, 25, 50, 100].includes(ctx.row_count))
        throw new Error(`row_count ${ctx.row_count} is not one of 10/25/50/100`)
      const { rows, page_context } = slice(n, ctx)
      return {
        templates: rows.map((i) => ({ template_id: `tpl_${i}`, template_name: `T${i}` })),
        page_context,
      } as never
    })
}

describe('ZohoSignAdapter.listEnvelopes pages by page_context', () => {
  const L = 4
  const N = 2 * L + 1

  it('pages 1..3 return every request once, with the reported hasMore and total', async () => {
    const get = mockRequests(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listEnvelopes(CREDS, params)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `req_${i}`))
    expect(more).toEqual([true, true, false])
    // start_index is 1-based: 1, L + 1, 2L + 1. row_count is the caller's limit.
    expect(get.mock.calls.map(([, p]) => readPageContext(p))).toEqual(
      [1, L + 1, 2 * L + 1].map((start_index) => ({
        row_count: L,
        start_index,
        sort_column: 'created_time',
        sort_order: 'DESC',
      })),
    )
    for (const [, p] of get.mock.calls) {
      expect(p).not.toHaveProperty('page')
      expect(p).not.toHaveProperty('per_page')
    }
  })

  it('keeps the status filter beside the page_context', async () => {
    const get = mockRequests(N)
    await adapter.listEnvelopes(CREDS, { page: 1, limit: L, status: 'completed' } as QueryParams)
    expect(get.mock.calls[0]![1]).toMatchObject({ status: 'completed' })
  })
})

describe('ZohoSignAdapter.listTemplates cuts caller pages from 10/25/50/100-row pages', () => {
  it.each([
    [7, 10],
    [10, 10],
    [30, 50],
  ])('limit %i serves every template once from row_count %i pages', async (L, rowCount) => {
    const N = 2 * L + 3
    const get = mockTemplates(N)
    const seen: string[] = []
    const more: boolean[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTemplates(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(L)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)!.hasMore!)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `tpl_${i}`))
    expect(more).toEqual([true, true, false])
    for (const [, p] of get.mock.calls) expect(readPageContext(p).row_count).toBe(rowCount)
  })

  it('page 2 is not page 1 on a cold walk', async () => {
    mockTemplates(25)
    const p2 = await adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(p2.map((r) => r.externalId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `tpl_${10 + i}`),
    )
  })

  it('a limit past 100 is served from 100-row pages', async () => {
    const get = mockTemplates(250)
    const rows = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 150 }))
    expect(rows.map((r) => r.externalId)).toEqual(Array.from({ length: 150 }, (_, i) => `tpl_${i}`))
    expect(get.mock.calls.map(([, p]) => readPageContext(p).start_index)).toEqual([1, 101])
  })
})

describe('ZohoSignAdapter signers and documents page the whole request locally', () => {
  const REQ = 'req_1'
  const L = 2
  const N = 2 * L + 1

  function mockRequest() {
    return vi.spyOn(ZohoSignClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path !== `/requests/${REQ}`) throw new Error(`unexpected path ${path}`)
      return {
        requests: {
          request_id: REQ,
          actions: Array.from({ length: N }, (_, i) => ({
            action_id: `act_${i}`,
            recipient_email: `s${i}@example.com`,
            recipient_name: `Signer ${i}`,
            action_status: 'UNOPENED',
          })),
          document_ids: Array.from({ length: N }, (_, i) => ({
            document_id: `doc_${i}`,
            document_name: `d${i}.pdf`,
          })),
        },
      } as never
    })
  }

  type Lister = (c: Credentials, id: string, p: QueryParams) => Promise<Array<{ id: string }>>
  const METHODS: Array<[string, Lister]> = [
    ['listSigners', (c, id, p) => adapter.listSigners(c, id, p)],
    ['listDocuments', (c, id, p) => adapter.listDocuments(c, id, p)],
  ]

  it.each(METHODS)('%s serves every row once across pages', async (_name, list) => {
    mockRequest()
    const all = (await list(CREDS, REQ, {})).map((r) => r.id)
    expect(all).toHaveLength(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(CREDS, REQ, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(all)
    expect(more).toEqual([true, true, false])
  })

  it('getSigner and getDocument still see the last row', async () => {
    mockRequest()
    const signers = await adapter.listSigners(CREDS, REQ, {})
    const last = signers[N - 1]!
    expect((await adapter.getSigner(CREDS, `${REQ}:${last.externalId}`)).id).toBe(last.id)
    const docs = await adapter.listDocuments(CREDS, REQ, {})
    const lastDoc = docs[N - 1]!
    expect((await adapter.getDocument(CREDS, `${REQ}:${lastDoc.externalId}`)).id).toBe(lastDoc.id)
  })
})
