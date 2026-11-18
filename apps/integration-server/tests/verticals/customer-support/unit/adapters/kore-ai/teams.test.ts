/**
 * Kore.ai teams (queues): transform and list paging.
 *
 * From https://koreai.mintlify.site/ai-for-service/apis/contact-center/get-a-list-of-queues
 * (Get a List of Queues):
 *
 *   Endpoint: "https://{{host}}/agentassist/api/v1/public/{{streamId}}/queues"
 *   The page lists only the `host` and `streamId` path parameters: no query
 *   parameter, so no paging knob.
 *   Sample response envelope: "page": 1, "limit": 10, "hasMore": true,
 *   "totalPages": 1, "totalResults": 1  (with one queue in `results`)
 *
 * The envelope fields are described on the sibling contact-center pages, e.g.
 * https://koreai.mintlify.site/ai-for-service/apis/contact-center/get-all-contacts:
 *
 *   hasMore:      "Indicates whether more records are available beyond the current result set."
 *   totalResults: "Total number of records available across all pages."
 *
 * So the one request is the whole list only when the envelope says so; a page
 * that reaches rows the endpoint did not return is refused, never served empty.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { KoreAiAdapter } from '../../../../../../src/verticals/customer-support/adapters/kore-ai/index'
import {
  transformTeam,
  type RawKoreAiQueue,
} from '../../../../../../src/verticals/customer-support/adapters/kore-ai/transform/team'
import { TeamSchema } from '../../../../../../src/verticals/customer-support/schema/team'

const PREFIX = '/agentassist/api/v1/public/st-1'
const CREDS = {
  accessToken: 'jwt-test',
  extra: { streamId: 'st-1', accountId: 'acc-1' },
}

/** The first queue of the documented sample response, verbatim fields. */
const SAMPLE_QUEUE: RawKoreAiQueue = {
  isActive: true,
  isDefault: true,
  name: 'Queue1',
  isAdvancedRoutingEnabled: true,
  description: 'queue description',
  orgId: 'o-cff7fba7-ebf6-5b01-81a3-42bd24faxxxx',
  createdBy: 'u-f9e37b9c-66d5-5525-9df1-da0edbeaxxxx',
  id: 'qu-268eda9-ba47-4b03-ab29-d1909c38xxxx',
  hoursOfOperation: { id: 'h-e8e22e03-fe32-5748-b830-02d161a3xxxx', name: 'US West Coast' },
  agents: [{ userId: 'u-e8e22e03-fe32-5748-b830-02d161a3xxxx', name: 'Charlie Abraham' }],
  agentGroups: [{ id: 'ag-ec83505-5152-494d-8071-3b68513cxxxx', name: 'Default Queue' }],
}

/** The documented sample response, envelope verbatim. */
const SAMPLE_RESPONSE = {
  results: [SAMPLE_QUEUE],
  page: 1,
  limit: 10,
  hasMore: true,
  totalPages: 1,
  totalResults: 1,
}

type Call = { path: string; params: Record<string, unknown> }

/** A fake honouring only what the page documents: GET /queues with no query parameter. */
function fakeQueues(envelope: Record<string, unknown>) {
  const calls: Call[] = []
  const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    if (!url.startsWith(PREFIX)) throw new Error(`unexpected GET ${url}`)
    const path = url.slice(PREFIX.length)
    calls.push({ path, params })
    if (path !== '/queues') throw new Error(`unexpected GET ${url}`)
    const keys = Object.keys(params)
    if (keys.length > 0) throw new Error(`undocumented param ${keys.join(',')} on /queues`)
    return { data: envelope }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return calls
}

const queues = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `qu-${i + 1}`, name: `Queue ${i + 1}` }))

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('Kore.ai transformTeam (documented queue sample)', () => {
  it('parses as a canonical Team', () => {
    const team = TeamSchema.parse(transformTeam(SAMPLE_QUEUE))
    expect(team.id).toBe('qu-268eda9-ba47-4b03-ab29-d1909c38xxxx')
    expect(team.externalId).toBe(team.id)
    expect(team.name).toBe('Queue1')
    expect(team.platform).toBe('kore-ai')
    expect(team.metadata).toEqual({
      description: 'queue description',
      isActive: 'true',
      isDefault: 'true',
      orgId: 'o-cff7fba7-ebf6-5b01-81a3-42bd24faxxxx',
      hoursOfOperation: 'US West Coast',
    })
    expect(team.raw).toBe(SAMPLE_QUEUE)
  })

  it('refuses a queue without the documented `id` instead of inventing one', () => {
    expect(() => transformTeam({ name: 'Queue1' })).toThrow(/id/)
  })

  it('refuses a queue without the documented `name` instead of inventing one', () => {
    expect(() => transformTeam({ id: 'qu-1' })).toThrow(/name/)
  })
})

describe('Kore.ai listTeams', () => {
  it('sends GET /queues with no query parameter (none is documented)', async () => {
    const calls = fakeQueues({ results: queues(3), hasMore: false, totalResults: 3 })
    const rows = await new KoreAiAdapter().listTeams(CREDS, withPageSink({ page: 1, limit: 2 }))
    expect(rows.map((r) => r.id)).toEqual(['qu-1', 'qu-2'])
    expect(calls).toEqual([{ path: '/queues', params: {} }])
  })

  for (const L of [4, 12]) {
    it(`a complete list: 2L+1 rows over pages 1..3 at limit ${L}, each once, hasMore exact`, async () => {
      const all = queues(2 * L + 1)
      fakeQueues({ results: all, hasMore: false, totalResults: all.length })
      const adapter = new KoreAiAdapter()
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await adapter.listTeams(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(all.map((q) => q.id))
      expect(more).toEqual([true, true, false])
    })
  }

  it('the documented sample (hasMore true, totalResults equal to the rows) is the whole list', async () => {
    fakeQueues(SAMPLE_RESPONSE)
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new KoreAiAdapter().listTeams(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['qu-268eda9-ba47-4b03-ab29-d1909c38xxxx'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('more queues than returned: pages inside the returned rows are served, hasMore true', async () => {
    fakeQueues({ results: queues(10), page: 1, limit: 10, hasMore: true, totalResults: 25 })
    const adapter = new KoreAiAdapter()
    const p1 = withPageSink({ page: 1, limit: 4 })
    const p2 = withPageSink({ page: 2, limit: 4 })
    expect((await adapter.listTeams(CREDS, p1)).map((r) => r.id)).toEqual([
      'qu-1',
      'qu-2',
      'qu-3',
      'qu-4',
    ])
    expect((await adapter.listTeams(CREDS, p2)).map((r) => r.id)).toEqual([
      'qu-5',
      'qu-6',
      'qu-7',
      'qu-8',
    ])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
  })

  it('more queues than returned: a page reaching past the returned rows is refused (422 UPSTREAM_LIMIT)', async () => {
    fakeQueues({ results: queues(10), page: 1, limit: 10, hasMore: true, totalResults: 25 })
    const err = await new KoreAiAdapter()
      .listTeams(CREDS, withPageSink({ page: 3, limit: 4 }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
    expect(String((err as Error).message)).toMatch(/10 of 25/)
  })

  it('more queues than returned and a fractional limit: pages are whole-row sized (floored)', async () => {
    fakeQueues({ results: queues(10), page: 1, limit: 10, hasMore: true, totalResults: 25 })
    const params = withPageSink({ page: 2, limit: 2.5 })
    const rows = await new KoreAiAdapter().listTeams(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['qu-3', 'qu-4'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('more queues than returned and no limit: refused rather than claiming the list is whole', async () => {
    fakeQueues({ results: queues(10), hasMore: true, totalResults: 25 })
    await expect(new KoreAiAdapter().listTeams(CREDS, {})).rejects.toMatchObject({
      statusCode: 422,
      code: 'UPSTREAM_LIMIT',
    })
  })

  it('hasMore true with no totalResults: only rows inside the response are served', async () => {
    fakeQueues({ results: queues(3), hasMore: true })
    const adapter = new KoreAiAdapter()
    const p1 = withPageSink({ page: 1, limit: 2 })
    expect((await adapter.listTeams(CREDS, p1)).map((r) => r.id)).toEqual(['qu-1', 'qu-2'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    await expect(
      adapter.listTeams(CREDS, withPageSink({ page: 2, limit: 2 })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
  })

  it('hasMore absent ends the list, as it ends the skip and page walks of the other lists', async () => {
    fakeQueues({ results: queues(3) })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new KoreAiAdapter().listTeams(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['qu-1', 'qu-2', 'qu-3'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
