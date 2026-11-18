/**
 * TASK_SOQL selected no WhatId/AccountId, and Event had no query at all — so
 * meetings never came back from listActivities, and deal/company links were
 * dropped even for Tasks. getActivity/updateActivity/deleteActivity also
 * hardcoded 'Task', so an Event id returned from the list would 404 on
 * lookup. This file pins: Task and Event are listed as one stream, every Task
 * then every Event, cut into pages of exactly the caller's limit (see the
 * comment on `listActivities`); Events map to canonical Activity correctly;
 * and CRUD-by-id routes on the id's key prefix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import { SalesforceAdapter } from '../../../../../../src/verticals/crm/adapters/salesforce/index'
import {
  TASK_ID_PREFIX,
  EVENT_ID_PREFIX,
} from '../../../../../../src/verticals/crm/adapters/salesforce/constants'
import type { Credentials } from '../../../../../../src/verticals/crm/adapter/interface'

const CREDS = {
  accessToken: 'tok',
  extra: { instanceUrl: 'https://na1.salesforce.com' },
} as unknown as Credentials

function taskId(n: number): string {
  return `${TASK_ID_PREFIX}${String(n).padStart(15, '0')}`
}
function eventId(n: number): string {
  return `${EVENT_ID_PREFIX}${String(n).padStart(15, '0')}`
}

interface Call {
  kind: 'query' | 'queryNext'
  object: 'task' | 'event'
  soql?: string
  batchSize?: number
}

/**
 * Two independent SOQL collections behind one fake client — Task and Event
 * each get their own batch size and their own `nextRecordsUrl` chain, routed
 * by which sObject the SOQL text names.
 */
function fakeActivitySource(taskTotal: number, eventTotal: number, calls: Call[] = []) {
  let taskBatch = taskTotal
  let eventBatch = eventTotal

  function page(object: 'task' | 'event', start: number) {
    const total = object === 'task' ? taskTotal : eventTotal
    const batch = object === 'task' ? taskBatch : eventBatch
    const count = Math.max(0, Math.min(batch, total - start))
    const records = Array.from({ length: count }, (_, i) => {
      const n = start + i
      return object === 'task'
        ? { Id: taskId(n), Subject: `Task ${n}`, Status: 'Open' }
        : {
            Id: eventId(n),
            Subject: `Event ${n}`,
            StartDateTime: '2026-01-01T00:00:00.000Z',
            EndDateTime: '2026-01-01T01:00:00.000Z',
          }
    })
    const end = start + records.length
    const done = end >= total
    return {
      totalSize: total,
      done,
      nextRecordsUrl: done ? undefined : `/query/${object}-${end}`,
      records,
    }
  }

  const query = vi.fn(async (soql: string, batchSize?: number) => {
    const object: 'task' | 'event' = soql.includes('FROM Task') ? 'task' : 'event'
    calls.push({ kind: 'query', object, soql, batchSize })
    if (object === 'task') taskBatch = batchSize ?? taskTotal
    else eventBatch = batchSize ?? eventTotal
    return page(object, 0)
  })
  const queryNext = vi.fn(async (cursor: string) => {
    const [object, startStr] = cursor.replace('/query/', '').split('-') as ['task' | 'event', string]
    calls.push({ kind: 'queryNext', object })
    return page(object, Number(startStr))
  })
  return { query, queryNext, calls }
}

function adapterWith(client: unknown) {
  const adapter = new SalesforceAdapter()
  vi.spyOn(adapter as unknown as { client: (c: Credentials) => unknown }, 'client').mockReturnValue(client)
  return adapter
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

// Rewritten when the merge became one stream. Page N used to be page N of
// Tasks concatenated with page N of Events: 400 rows on a page asked for 200,
// of which the router kept 200, so page 1 lost every Event it carried. Now
// the list is every Task, then every Event, cut into pages of exactly `limit`.
describe('listActivities streams every Task, then every Event', () => {
  it('lists Events (never returned before this fix), after the Tasks', async () => {
    const adapter = adapterWith(fakeActivitySource(3, 4))
    const page1 = await adapter.listActivities(CREDS, { page: 1, limit: 200 })
    expect(page1.map((a) => a.type)).toEqual([
      'task',
      'task',
      'task',
      'meeting',
      'meeting',
      'meeting',
      'meeting',
    ])
  })

  it('page 1 is exactly the limit, and hasMore is true because Events follow the last Task', async () => {
    // Task's only batch fills page 1 to the row; the pager peeks at the Event
    // query to learn that more remains.
    const adapter = adapterWith(fakeActivitySource(200, 300))
    const params = withPageSink({ page: 1, limit: 200 })
    const page1 = await adapter.listActivities(CREDS, params)
    expect(page1).toHaveLength(200)
    expect(page1.every((a) => a.type === 'task')).toBe(true)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('page 2 is Events 0-199 and page 3 is Events 200-299: nothing repeats', async () => {
    const adapter = adapterWith(fakeActivitySource(200, 300))
    await adapter.listActivities(CREDS, { page: 1, limit: 200 })
    const page2 = await adapter.listActivities(CREDS, { page: 2, limit: 200 })
    const page3 = await adapter.listActivities(CREDS, { page: 3, limit: 200 })
    expect(page2.map((a) => a.id)).toEqual(Array.from({ length: 200 }, (_, i) => eventId(i)))
    expect(page3.map((a) => a.id)).toEqual(Array.from({ length: 100 }, (_, i) => eventId(200 + i)))
  })

  it('hasMore is false once BOTH Task and Event are exhausted', async () => {
    const adapter = adapterWith(fakeActivitySource(200, 300))
    await adapter.listActivities(CREDS, { page: 1, limit: 200 })
    await adapter.listActivities(CREDS, { page: 2, limit: 200 })
    const params = withPageSink({ page: 3, limit: 200 })
    await adapter.listActivities(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a whole walk costs one request per batch — the peeked Event batch is not queried again', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(fakeActivitySource(200, 300, calls))
    for (let page = 1; page <= 3; page++) await adapter.listActivities(CREDS, { page, limit: 200 })
    expect(calls.map((c) => `${c.object}:${c.kind}`)).toEqual([
      'task:query',
      'event:query',
      'event:queryNext',
    ])
  })

  it('a walk at limit 25 serves every Task then every Event once, through the router envelope', async () => {
    const calls: Call[] = []
    const adapter = adapterWith(fakeActivitySource(230, 70, calls))
    const served: string[] = []
    for (let page = 1; page < 100; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await adapter.listActivities(CREDS, params), params, 'salesforce')
      expect(env.data.length).toBe(25)
      served.push(...env.data.map((a) => a.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual([
      ...Array.from({ length: 230 }, (_, i) => taskId(i)),
      ...Array.from({ length: 70 }, (_, i) => eventId(i)),
    ])
    expect(calls.map((c) => `${c.object}:${c.kind}`)).toEqual([
      'task:query',
      'task:queryNext',
      'event:query',
    ])
    expect(calls.filter((c) => c.kind === 'query').map((c) => c.batchSize)).toEqual([200, 200])
  })

  it("Event rows map correctly: type 'meeting', due_date from StartDateTime", async () => {
    const adapter = adapterWith(fakeActivitySource(1, 1))
    const [activity] = (await adapter.listActivities(CREDS, { page: 1, limit: 200 })).filter(
      (a) => a.type === 'meeting',
    )
    expect(activity?.type).toBe('meeting')
    expect(activity?.subject).toBe('Event 0')
    expect(activity?.due_date).toBe('2026-01-01T00:00:00.000Z')
    expect(activity?.id.startsWith(EVENT_ID_PREFIX)).toBe(true)
  })

  it('a query locator Salesforce refuses restarts the walk instead of failing the page', async () => {
    const calls: Call[] = []
    const source = fakeActivitySource(230, 70, calls)
    let refuse = false
    const queryNext = vi.fn(async (cursor: string) => {
      if (refuse) {
        refuse = false
        throw new Error(
          'Salesforce API error 400: [{"message":"invalid query locator","errorCode":"INVALID_QUERY_LOCATOR"}]',
        )
      }
      return source.queryNext(cursor)
    })
    const adapter = adapterWith({ query: source.query, queryNext })
    await adapter.listActivities(CREDS, { page: 9, limit: 25 })
    // Page 5 at 50 starts in the second Task batch, whose remembered locator is refused.
    refuse = true
    const page = await adapter.listActivities(CREDS, { page: 5, limit: 50 })
    expect(page.map((a) => a.id)).toEqual([
      ...Array.from({ length: 30 }, (_, i) => taskId(200 + i)),
      ...Array.from({ length: 20 }, (_, i) => eventId(i)),
    ])
  })
})

describe('activity CRUD-by-id routes on the id prefix', () => {
  function fakeCrudClient() {
    return {
      get: vi.fn(async (sobject: string, id: string) => {
        if (sobject === 'Event') {
          return { Id: id, Subject: 'A meeting', StartDateTime: '2026-01-01T00:00:00.000Z' }
        }
        return { Id: id, Subject: 'A task', Status: 'Open' }
      }),
      post: vi.fn(async (sobject: string, _body: unknown) => ({
        id: sobject === 'Event' ? eventId(999) : taskId(999),
      })),
      patch: vi.fn(async (_sobject: string, _id: string, _body: unknown) => undefined),
      delete: vi.fn(async (_sobject: string, _id: string) => undefined),
    }
  }

  it('getActivity reads Event for a 00U id and Task for a 00T id', async () => {
    const client = fakeCrudClient()
    const adapter = adapterWith(client)

    const task = await adapter.getActivity(CREDS, taskId(1))
    expect(client.get).toHaveBeenLastCalledWith('Task', taskId(1))
    expect(task.type).toBe('task')

    const event = await adapter.getActivity(CREDS, eventId(1))
    expect(client.get).toHaveBeenLastCalledWith('Event', eventId(1))
    expect(event.type).toBe('meeting')
  })

  it('updateActivity patches Event for a 00U id and Task for a 00T id', async () => {
    const client = fakeCrudClient()
    const adapter = adapterWith(client)

    await adapter.updateActivity(CREDS, eventId(2), { subject: 'Renamed' })
    expect(client.patch).toHaveBeenLastCalledWith('Event', eventId(2), expect.objectContaining({ Subject: 'Renamed' }))

    await adapter.updateActivity(CREDS, taskId(2), { subject: 'Renamed' })
    expect(client.patch).toHaveBeenLastCalledWith('Task', taskId(2), expect.objectContaining({ Subject: 'Renamed' }))
  })

  it('deleteActivity deletes Event for a 00U id and Task for a 00T id', async () => {
    const client = fakeCrudClient()
    const adapter = adapterWith(client)

    await adapter.deleteActivity(CREDS, eventId(3))
    expect(client.delete).toHaveBeenLastCalledWith('Event', eventId(3))

    await adapter.deleteActivity(CREDS, taskId(3))
    expect(client.delete).toHaveBeenLastCalledWith('Task', taskId(3))
  })

  it('createActivity posts to Event when type is meeting, Task otherwise', async () => {
    const client = fakeCrudClient()
    const adapter = adapterWith(client)

    const meeting = await adapter.createActivity(CREDS, { type: 'meeting', subject: 'Sync' })
    expect(client.post).toHaveBeenLastCalledWith('Event', expect.objectContaining({ Subject: 'Sync' }))
    expect(meeting.type).toBe('meeting')

    const task = await adapter.createActivity(CREDS, { subject: 'Follow up' })
    expect(client.post).toHaveBeenLastCalledWith('Task', expect.objectContaining({ Subject: 'Follow up' }))
    expect(task.type).toBe('task')
  })

  it('createActivity never writes AccountId — it is read-only', async () => {
    const client = fakeCrudClient()
    const adapter = adapterWith(client)
    await adapter.createActivity(CREDS, { type: 'meeting', company_id: '001XYZ' })
    const body = client.post.mock.calls[0]?.[1] as Record<string, unknown>
    expect(body.AccountId).toBeUndefined()
    expect(body.WhatId).toBe('001XYZ')
  })
})
