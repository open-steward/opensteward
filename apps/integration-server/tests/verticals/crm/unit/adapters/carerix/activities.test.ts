/**
 * Carerix activities live on the CRToDo entity (capital D).
 *
 * https://help.carerix.com/en/articles/9464648-carerix-rest-api (release
 * notes v0.8.2): "CRToDo and it's virtual entities like CRTask, CRNote,
 * CRMeeting, CRCampaign supports email resource". Carerix's own client names
 * the entity `ENTITY = 'CRToDo'` (cxrest-client AbstractCRToDo.php). The
 * adapter used to call /CRTodo, which is no documented entity.
 *
 * Listing is the generic "GET $object — List objects matching search
 * criteria." from https://help.carerix.com/en/articles/9470760-rest-api-methods,
 * paged by "start (string, optional, default: 0): Offset; number of objects to
 * skip from the beginning of the result." and "count (string, optional,
 * default: 10): Maximum number of objects to include in the result."
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CarerixAdapter } from '../../../../../../src/verticals/crm/adapters/carerix/index'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'

const CREDS = { accessToken: 'tok' }

/** A fake Carerix that serves only GET /CRToDo and GET /CRToDo/{id}, honouring only start/count. */
function fakeCarerix(total: number) {
  const store = Array.from({ length: total }, (_, i) => ({
    todoID: 1000 + i,
    subject: `todo ${i + 1}`,
    todoTypeKey: 0,
    creationDate: '2014-02-20 09:22:47',
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    sent.push(url)
    if ((init?.method ?? 'GET') !== 'GET') {
      return new Response('method not allowed', { status: 405 })
    }
    const byId = /^\/CRToDo\/(\d+)$/.exec(url.pathname)
    if (byId) {
      const row = store.find((r) => String(r.todoID) === byId[1])
      return row
        ? new Response(JSON.stringify(row), { status: 200 })
        : new Response('not found', { status: 404 })
    }
    if (url.pathname !== '/CRToDo') {
      return new Response(`no such entity ${url.pathname}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (k !== 'start' && k !== 'count') {
        return new Response(`undocumented parameter ${k}`, { status: 400 })
      }
    }
    const start = Number(url.searchParams.get('start') ?? '0')
    const count = Number(url.searchParams.get('count') ?? '10')
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1) {
      return new Response('bad start/count', { status: 400 })
    }
    return new Response(JSON.stringify(store.slice(start, start + count)), { status: 200 })
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('carerix listActivities', () => {
  it('calls GET /CRToDo (capital D) with the documented start/count only', async () => {
    const { sent } = fakeCarerix(9)
    await new CarerixAdapter().listActivities(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.pathname).toBe('/CRToDo')
    expect(sent[0]!.searchParams.get('start')).toBe('4')
    expect(sent[0]!.searchParams.get('count')).toBe('4')
  })

  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { store } = fakeCarerix(2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await new CarerixAdapter().listActivities(CREDS, params)
      rows.forEach((r) => ActivitySchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => String(r.todoID)))
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
  })

  it('reports hasMore false on an exactly empty page past the end', async () => {
    fakeCarerix(8)
    const params = withPageSink({ page: 3, limit: 4 })
    expect(await new CarerixAdapter().listActivities(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('carerix getActivity', () => {
  it('reads GET /CRToDo/{id} and returns the id the list served', async () => {
    const { sent } = fakeCarerix(3)
    const [first] = await new CarerixAdapter().listActivities(
      CREDS,
      withPageSink({ page: 1, limit: 1 }),
    )
    const got = await new CarerixAdapter().getActivity(CREDS, first!.id)
    expect(sent.at(-1)!.pathname).toBe(`/CRToDo/${first!.id}`)
    expect(got.id).toBe(first!.id)
    expect(got.subject).toBe('todo 1')
  })
})
