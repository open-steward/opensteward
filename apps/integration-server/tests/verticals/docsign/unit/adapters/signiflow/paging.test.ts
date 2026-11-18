import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SigniFlowClient } from '../../../../../../src/verticals/docsign/adapters/signiflow/client'
import { SigniflowAdapter } from '../../../../../../src/verticals/docsign/adapters/signiflow'

/**
 * `POST /GetDocumentAudit` takes only `DocIDField` + `TokenField` and returns
 * the whole `ActivityField` array; `POST /GetPrepperTemplateList` takes only
 * `TemplateFolderField` + `TokenField` and returns the whole
 * `TemplateInformationValuesField` array (SigniFlow PowerFlow OpenAPI,
 * https://developers.signiflow.com/docs/signiflow-openapi). Neither has a page
 * to ask for, so the adapter must page the collection itself, or page 2
 * repeats page 1.
 */

const CREDS = { accessToken: 'tok' } as Credentials
const DOC = '2147483647'
const L = 2
const N = 2 * L + 1

function fakeActivities(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    ActionOrderField: String(i + 1),
    DocIDField: DOC,
    EmailField: `u${i}@example.com`,
    EventDateField: '/Date(928142400000+0200)/',
    EventField: 'Document signed',
    EventStatusField: 'Document Signed',
    UserFullNameField: `User ${i}`,
  }))
}

function fakeTemplates(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    PrepperTemplateIDField: 1000 + i,
    NameField: `Template ${i}`,
    TemplateDescriptionField: `Description ${i}`,
  }))
}

/** Honours only the documented body keys; any other key is a bug here. */
function mockPost(n: number) {
  return vi
    .spyOn(SigniFlowClient.prototype, 'post')
    .mockImplementation(async (path: string, body?: Record<string, unknown>) => {
      const keys = Object.keys(body ?? {}).sort()
      if (path === '/GetDocumentAudit') {
        if (keys.join(',') !== 'DocIDField') throw new Error(`undocumented keys ${keys}`)
        if (body?.['DocIDField'] !== DOC) throw new Error('wrong document')
        return { ActivityField: fakeActivities(n), ResultField: 'Success' } as never
      }
      if (path === '/GetPrepperTemplateList') {
        if (keys.join(',') !== 'TemplateFolderField') throw new Error(`undocumented keys ${keys}`)
        return {
          TemplateInformationValuesField: fakeTemplates(n),
          ResultField: 'Success',
        } as never
      }
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SigniflowAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>
const auditIds = (n: number) => Array.from({ length: n }, (_, i) => `${DOC}:${i}`)
const templateIds = (n: number) => Array.from({ length: n }, (_, i) => String(1000 + i))
const METHODS: Array<[string, Lister, (n: number) => string[], string]> = [
  [
    'listAuditTrailEntries',
    (c, p) => adapter.listAuditTrailEntries(c, DOC, p),
    auditIds,
    '/GetDocumentAudit',
  ],
  ['listTemplates', (c, p) => adapter.listTemplates(c, p), templateIds, '/GetPrepperTemplateList'],
]

describe.each(METHODS)(
  'SigniflowAdapter.%s pages the whole collection locally',
  (_n, list, idsOf, path) => {
    const ids = idsOf(N)

    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      const post = mockPost(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging key: every page sends the same documented body.
      for (const call of post.mock.calls) expect(call[0]).toBe(path)
      expect(new Set(post.mock.calls.map((c) => JSON.stringify(c[1]))).size).toBe(1)
    })

    it('page 2 is not page 1', async () => {
      mockPost(N)
      const p1 = await list(CREDS, withPageSink({ page: 1, limit: L }))
      const p2 = await list(CREDS, withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above the collection size serves everything once, with no next page', async () => {
      mockPost(N)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const rows = await list(CREDS, params)
      expect(rows.map((r) => r.id)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('without a limit returns the whole collection', async () => {
      mockPost(N)
      const rows = await list(CREDS, {})
      expect(rows.map((r) => r.id)).toEqual(ids)
    })

    it('pages a collection larger than any plausible cap: the last page ends it', async () => {
      const BIG = 1001
      mockPost(BIG)
      const size = 250
      const last = Math.ceil(BIG / size)
      const params = withPageSink({ page: last, limit: size })
      const rows = await list(CREDS, params)
      expect(rows.map((r) => r.id)).toEqual(idsOf(BIG).slice((last - 1) * size))
      expect(readUpstreamPage(params)?.totalCount).toBe(BIG)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockPost(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(CREDS, params)
      const env = listPage(rows, params, 'signiflow')
      expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('SigniflowAdapter.getAuditTrailEntry still sees the whole audit', () => {
  it('finds the last entry by its global index', async () => {
    mockPost(N)
    const e = await adapter.getAuditTrailEntry(CREDS, `${DOC}:${N - 1}`)
    expect(e.id).toBe(`${DOC}:${N - 1}`)
  })
})
