import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { FpSignClient } from '../../../../../../src/verticals/docsign/adapters/fp-sign/client'
import { FpSignAdapter } from '../../../../../../src/verticals/docsign/adapters/fp-sign'

/**
 * FP Sign's list endpoints take no paging parameter. Per the FP Sign REST
 * API swagger (https://github.com/vneri/FPSignAPI), `GET /workflows`
 * "Fetches a list of Workflow Ids" (query: `email`, `status` only),
 * `GET /workflows/{id}/jobs` and `/attachments` fetch "a list of Job Ids" /
 * "a list of Attachment Ids", `GET /trace-logs` "Returns all trace log
 * entries for a given tenant", and `GET /intents/workflowtemplates`
 * "Fetches a list of WorkflowTemplateInfo". Each returns the whole
 * collection, so the adapter must page it itself or page 2 repeats page 1.
 *
 * The id lists are paged before hydration, so only the caller's page of ids
 * is fetched from the comma-joined detail endpoint.
 */

const CREDS = { accessToken: 'tok', extra: { tenant: 't1' } } as Credentials
const WF = '77'
const L = 2
const N = 2 * L + 1

const ids = (n: number, base = 100) => Array.from({ length: n }, (_, i) => base + i)

/** Honours only the documented paths; any query parameter but email/status is a bug. */
function mockGet(n: number) {
  return vi
    .spyOn(FpSignClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      for (const k of Object.keys(params ?? {})) {
        if (k !== 'email' && k !== 'status') throw new Error(`${path} takes no ${k} param`)
      }
      if (path === '/workflows') return ids(n) as never
      if (path === `/workflows/${WF}/jobs`) return ids(n) as never
      if (path === `/workflows/${WF}/attachments`) return ids(n) as never
      let m = /^\/workflows\/([\d,]+)$/.exec(path)
      if (m) return m[1]!.split(',').map((id) => ({ id: Number(id), name: `wf ${id}` })) as never
      m = /^\/workflows\/\d+\/jobs\/([\d,]+)$/.exec(path)
      if (m) return m[1]!.split(',').map((id) => ({ id: Number(id) })) as never
      m = /^\/workflows\/\d+\/attachments\/([\d,]+)$/.exec(path)
      if (m) return m[1]!.split(',').map((id) => ({ id: Number(id), name: `d${id}` })) as never
      if (path === '/trace-logs') {
        return Array.from({ length: n }, (_, i) => ({
          domain: 'workflow',
          dateCreated: `2026-01-01T00:00:0${i % 10}Z`,
          message: `event ${i}`,
          target: WF,
        })).concat([
          { domain: 'x', dateCreated: '2026-01-01T00:00:00Z', message: 'm', target: '999' },
        ]) as never
      }
      if (path === '/intents/workflowtemplates') {
        return ids(n).map((id) => ({ id, name: `tpl ${id}` })) as never
      }
      throw new Error(`unexpected path ${path}`)
    })
}

afterEach(() => vi.restoreAllMocks())

const adapter = new FpSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

type Lister = (p: QueryParams) => Promise<Array<{ id: string }>>
const LISTERS: Array<{ name: string; list: Lister; expected: (n: number) => string[] }> = [
  {
    name: 'listEnvelopes',
    list: (p) => adapter.listEnvelopes(CREDS, p),
    expected: (n) => ids(n).map(String),
  },
  {
    name: 'listSigners',
    list: (p) => adapter.listSigners(CREDS, WF, p),
    expected: (n) => ids(n).map(String),
  },
  {
    name: 'listDocuments',
    list: (p) => adapter.listDocuments(CREDS, WF, p),
    expected: (n) => ids(n).map(String),
  },
  {
    name: 'listAuditTrailEntries',
    list: (p) => adapter.listAuditTrailEntries(CREDS, WF, p),
    expected: (n) =>
      Array.from(
        { length: n },
        (_, i) => `audit:${WF}:${new Date(`2026-01-01T00:00:0${i % 10}Z`).toISOString()}:${i}`,
      ),
  },
  {
    name: 'listTemplates',
    list: (p) => adapter.listTemplates(CREDS, p),
    expected: (n) => ids(n).map(String),
  },
]

describe.each(LISTERS)(
  'FpSignAdapter.$name pages the whole collection locally',
  ({ list, expected }) => {
    it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
      mockGet(N)
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(N)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(expected(N))
      expect(more).toEqual([true, true, false])
    })

    it('page 2 is not page 1', async () => {
      mockGet(N)
      const p1 = await list(withPageSink({ page: 1, limit: L }))
      const p2 = await list(withPageSink({ page: 2, limit: L }))
      expect(p2.map((r) => r.id)).toEqual(expected(N).slice(L, 2 * L))
      expect(p2.map((r) => r.id)).not.toEqual(p1.map((r) => r.id))
    })

    it('a limit above the collection size serves everything once, with no next page', async () => {
      mockGet(N)
      const params = parseListQuery({ page: '1', limit: '100000' })
      const rows = await list(params)
      expect(rows.map((r) => r.id)).toEqual(expected(N))
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('serves page 2 on the API path through parseListQuery and listPage', async () => {
      mockGet(N)
      const params = parseListQuery({ page: '2', limit: String(L) })
      const rows = await list(params)
      const env = listPage(rows, params, 'fp-sign')
      expect(env.data.map((r) => r.id)).toEqual(expected(N).slice(L, 2 * L))
      expect(env.meta.page).toBe(2)
      expect(env.meta.limit).toBe(L)
      expect(env.meta.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(true)
    })
  },
)

describe('FpSignAdapter id-list hydration', () => {
  it('hydrates only the caller page of workflow ids', async () => {
    const get = mockGet(N)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    const detail = get.mock.calls.map((c) => c[0]).filter((p) => p !== '/workflows')
    expect(detail).toEqual(['/workflows/102,103'])
  })

  it('hydrates only the caller page of job ids', async () => {
    const get = mockGet(N)
    await adapter.listSigners(CREDS, WF, withPageSink({ page: 2, limit: L }))
    const detail = get.mock.calls.map((c) => c[0]).filter((p) => p !== `/workflows/${WF}/jobs`)
    expect(detail).toEqual([`/workflows/${WF}/jobs/102,103`])
  })

  it('hydrates only the caller page of attachment ids', async () => {
    const get = mockGet(N)
    await adapter.listDocuments(CREDS, WF, withPageSink({ page: 2, limit: L }))
    const detail = get.mock.calls
      .map((c) => c[0])
      .filter((p) => p !== `/workflows/${WF}/attachments`)
    expect(detail).toEqual([`/workflows/${WF}/attachments/102,103`])
  })

  it('passes the email and status filters to the workflow id list', async () => {
    const get = mockGet(N)
    await adapter.listEnvelopes(
      CREDS,
      withPageSink({ page: 1, limit: L, email: 'a@b.c', status: 'ACTIVE' }),
    )
    const idCall = get.mock.calls.find((c) => c[0] === '/workflows')
    expect(idCall?.[1]).toEqual({ email: 'a@b.c', status: 'ACTIVE' })
  })

  it('splits a large page into detail requests of at most 200 ids', async () => {
    const get = mockGet(450)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 450 }))
    expect(rows.map((r) => r.id)).toEqual(ids(450).map(String))
    const detail = get.mock.calls.map((c) => c[0]).filter((p) => p !== '/workflows')
    expect(detail.map((p) => p.split(',').length)).toEqual([200, 200, 50])
  })

  it('keeps document order absolute across pages', async () => {
    mockGet(N)
    const rows = await adapter.listDocuments(CREDS, WF, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => (r as unknown as { order: number }).order)).toEqual([L, L + 1])
  })

  it('getAuditTrailEntry still resolves an entry past the first page', async () => {
    mockGet(N)
    const target = LISTERS[3]!.expected(N)[N - 1]!
    const entry = await adapter.getAuditTrailEntry(CREDS, target)
    expect(entry.id).toBe(target)
  })
})
