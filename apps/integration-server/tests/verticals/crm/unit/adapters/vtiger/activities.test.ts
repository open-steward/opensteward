import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { VtigerAdapter } from '../../../../../../src/verticals/crm/adapters/vtiger/index'

/**
 * Vtiger activities live in two webservice modules, not in one called
 * "Activities".
 *
 * - The vtap relatedtypes example (https://vtap.vtiger.com/platform/rest-apis.html)
 *   names the module behind the "Activities" label:
 *     "name": "Calendar",
 *     "label": "Activities",
 * - The query operation takes a module name
 *   (https://community.vtiger.com/help/vtigercrm/developers/third-party-app-integration.html):
 *     "<object> Type or Module Name."
 * - vtiger's own VTQL parser (code.vtiger.com, include/Webservices/VTQL_Parser.php)
 *   narrows each of the two activity modules:
 *     if(strcasecmp('calendar',$this->out['moduleName'])===0){ ... activitytype='Task' AND
 *     }elseif(strcasecmp('events',$this->out['moduleName'])===0){ ... activitytype!='Emails' AND activitytype!='Task' AND
 *   so tasks come from Calendar and calls/meetings from Events.
 * - Paging is the documented "[LIMIT [<m>, ] <n>]" clause, and "Query always
 *   limits its output to 100 records".
 */

const INSTANCE = 'https://acme.example.test'
const creds = {
  accessToken: 'key',
  extra: { instanceUrl: INSTANCE, username: 'u', session: 'sess' },
}
const UPSTREAM_MAX = 100

let queries: string[] = []

/**
 * Storage order is not id order: a table that has seen deletes and inserts
 * returns rows in whatever order MySQL picks. Reversing each pair is enough
 * to tell an ordered walk from an unordered one.
 */
function storageOrder<T>(rows: T[]): T[] {
  const out = [...rows]
  for (let i = 0; i + 1 < out.length; i += 2) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!]
  return out
}

/**
 * A fake webservice that knows only the two documented activity modules and
 * honours only `SELECT * FROM <module> [ORDER BY id] [LIMIT [<m>, ] <n>];`
 * (the documented "[ORDER BY <column_list>]" and "[LIMIT [<m>, ] <n>]"
 * clauses), with n capped at 100 (and 100 when LIMIT is absent). Without
 * ORDER BY it returns rows in storage order. Anything else is an error.
 * `tag` marks each row's subject, so tests can tell two connections apart.
 */
function serve(counts: { Calendar: number; Events: number }, tag = 'a') {
  const numeric = (id: string) => Number(id.split('x')[1])
  const rows = {
    Calendar: Array.from({ length: counts.Calendar }, (_, i) => ({
      id: `9x${i + 1}`,
      activitytype: 'Task',
      subject: `${tag}-task-${i + 1}`,
    })),
    Events: Array.from({ length: counts.Events }, (_, i) => ({
      id: `18x${i + 1}`,
      activitytype: 'Meeting',
      subject: `${tag}-event-${i + 1}`,
    })),
  }
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input)
    const query = url.searchParams.get('query') ?? ''
    queries.push(query)
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const m =
      /^SELECT \* FROM (\w+)(\s+ORDER BY id)?(?:\s+LIMIT\s+(?:(\d+)\s*,\s*)?(\d+))?\s*;$/i.exec(
        query,
      )
    if (url.searchParams.get('operation') !== 'query' || !m) {
      return json({ success: false, error: { code: 'QUERY_SYNTAX_ERROR', message: query } })
    }
    const module = m[1] as keyof typeof rows
    if (!(module in rows)) {
      return json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: `Permission to perform the operation is denied for name : ${module}`,
        },
      })
    }
    const ordered = m[2]
      ? [...rows[module]].sort((a, b) => numeric(a.id) - numeric(b.id))
      : storageOrder(rows[module])
    const offset = m[3] === undefined ? 0 : Number(m[3])
    const limit = Math.min(m[4] === undefined ? UPSTREAM_MAX : Number(m[4]), UPSTREAM_MAX)
    return json({ success: true, result: ordered.slice(offset, offset + limit) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function list(params: QueryParams) {
  return new VtigerAdapter().listActivities(creds, params)
}

beforeEach(() => {
  queries = []
  _resetRowPager()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vtiger listActivities', () => {
  it('queries the Calendar and Events modules, never "Activities"', async () => {
    serve({ Calendar: 2, Events: 2 })
    const rows = await list(withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['9x1', '9x2', '18x1', '18x2'])
    expect(queries).toEqual([
      'SELECT * FROM Calendar ORDER BY id LIMIT 100;',
      'SELECT * FROM Events ORDER BY id LIMIT 100;',
    ])
    expect(queries.some((q) => q.includes('Activities'))).toBe(false)
  })

  it('walks 2L+1 rows across both modules, each id once, with exact hasMore', async () => {
    // L = 3; Calendar 4 rows then Events 3: the module boundary falls inside page 2.
    const L = 3
    serve({ Calendar: 4, Events: 2 * L + 1 - 4 })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['9x1', '9x2', '9x3', '9x4', '18x1', '18x2', '18x3'])
    expect(new Set(seen).size).toBe(7)
    expect(hasMore).toEqual([true, true, false])
  })

  it('pages each module by the documented LIMIT <offset>, 100 clause across uneven upstream pages', async () => {
    // Calendar: a full page of 100, then 50. Events: 30. Caller pages of 70.
    serve({ Calendar: 150, Events: 30 })
    const seen: string[] = []
    let last: boolean | undefined
    for (let page = 1; page <= 5; page++) {
      const params = withPageSink({ page, limit: 70 })
      seen.push(...(await list(params)).map((r) => r.id))
      last = readUpstreamPage(params)?.hasMore
      if (last === false) break
    }
    expect(last).toBe(false)
    expect(seen).toEqual([
      ...Array.from({ length: 150 }, (_, i) => `9x${i + 1}`),
      ...Array.from({ length: 30 }, (_, i) => `18x${i + 1}`),
    ])
    expect(queries).toContain('SELECT * FROM Calendar ORDER BY id LIMIT 100;')
    expect(queries).toContain('SELECT * FROM Calendar ORDER BY id LIMIT 100, 100;')
    expect(queries).toContain('SELECT * FROM Events ORDER BY id LIMIT 100;')
  })

  it('peeks past a full Calendar page that ends exactly at the collection end', async () => {
    serve({ Calendar: 100, Events: 0 })
    const params = withPageSink({ page: 1, limit: 100 })
    const rows = await list(params)
    expect(rows).toHaveLength(100)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(queries).toEqual([
      'SELECT * FROM Calendar ORDER BY id LIMIT 100;',
      'SELECT * FROM Calendar ORDER BY id LIMIT 100, 100;',
      'SELECT * FROM Events ORDER BY id LIMIT 100;',
    ])
  })

  it('reports paged-locally and gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve({ Calendar: 4, Events: 3 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await list(params), params, 'vtiger')
    expect(out.data.map((r) => r.id)).toEqual(['9x4', '18x1', '18x2'])
    expect(out.meta.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)

    const tail = parseListQuery({ page: '3', limit: '3' })
    const out3 = listPage(await list(tail), tail, 'vtiger')
    expect(out3.data.map((r) => r.id)).toEqual(['18x3'])
    expect(out3.meta.hasMore).toBe(false)
  })

  it('maps rows through the activity transform', async () => {
    serve({ Calendar: 1, Events: 1 })
    const rows = await list(withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => r.type)).toEqual(['Task', 'Meeting'])
  })

  it('serves the adapter default of 25 rows when the caller sends no limit', async () => {
    serve({ Calendar: 30, Events: 0 })
    const params = withPageSink({ page: 1 })
    const rows = await list(params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 25 }, (_, i) => `9x${i + 1}`))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('never serves one connection rows fetched under another token on the same account', async () => {
    serve({ Calendar: 4, Events: 0 }, 'a')
    await list(withPageSink({ page: 1, limit: 2 }))

    // Same instance and username, a different access key: its own walk.
    queries = []
    serve({ Calendar: 4, Events: 0 }, 'b')
    const other = {
      accessToken: 'other-key',
      extra: { instanceUrl: INSTANCE, username: 'u', session: 'sess-b' },
    }
    const rows = await new VtigerAdapter().listActivities(
      other,
      withPageSink({ page: 2, limit: 2 }),
    )
    expect(rows.map((r) => r.subject)).toEqual(['b-task-3', 'b-task-4'])
    expect(queries[0]).toBe('SELECT * FROM Calendar ORDER BY id LIMIT 100;')
  })

  it('never serves one instance rows fetched from another with the same key', async () => {
    serve({ Calendar: 4, Events: 0 }, 'a')
    await list(withPageSink({ page: 1, limit: 2 }))

    queries = []
    serve({ Calendar: 4, Events: 0 }, 'b')
    const other = {
      accessToken: 'key',
      extra: { instanceUrl: 'https://other.example.test', username: 'u', session: 'sess' },
    }
    const rows = await new VtigerAdapter().listActivities(
      other,
      withPageSink({ page: 2, limit: 2 }),
    )
    expect(rows.map((r) => r.subject)).toEqual(['b-task-3', 'b-task-4'])
    expect(queries).toHaveLength(2)
  })
})

describe('vtiger login', () => {
  it('reads the documented sessionName from the login response', async () => {
    const calls: Array<{ method: string; body: string; url: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? 'GET', body: String(init?.body ?? ''), url: input })
        const url = new URL(input)
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        if (url.searchParams.get('operation') === 'getchallenge') {
          return json({ success: true, result: { token: 'TOK', serverTime: 1, expireTime: 2 } })
        }
        if (init?.method === 'POST') {
          return json({
            success: true,
            result: { sessionName: 'S-123', userId: '19x1', version: '0.22', vtigerVersion: '8.0' },
          })
        }
        if (url.searchParams.get('operation') === 'query') {
          return json({ success: true, result: [] })
        }
        return json({ success: false, error: { code: 'X', message: 'unexpected' } })
      }),
    )
    const noSession = { accessToken: 'key', extra: { instanceUrl: INSTANCE, username: 'u' } }
    await new VtigerAdapter().listActivities(noSession, withPageSink({ page: 1, limit: 5 }))
    const query = calls.find((c) => new URL(c.url).searchParams.get('operation') === 'query')
    expect(new URL(query!.url).searchParams.get('sessionName')).toBe('S-123')

    const refreshed = await new VtigerAdapter().refreshCredentials(noSession)
    expect(refreshed.extra?.['session']).toBe('S-123')
  })
})
