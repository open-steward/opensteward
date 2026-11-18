/**
 * SnapEngage list paging.
 *
 * From https://developer.snapengage.com/logs-api/ (Logs API, GET /api/v2/{orgId}/logs):
 *
 *   next: "If more than 100 results are returned, a value for linkToNextSetOfResults
 *          will be returned that can be used to access the next set of results.
 *          Otherwise, this parameter is not specified. Note that this capability only
 *          works when specifying a single widgetId, multiple widgetIds are not
 *          currently supported!"
 *
 * The batch is fixed at 100 cases and there is no page-size parameter, so tickets and
 * contacts are cut out of the stream of batches by pageByRows. Transcript entries are
 * nested inside each case ("transcripts": [ ... ] in the sample response), so a
 * ticket's messages are the whole collection and are paged locally.
 *
 * The fake honours ONLY the documented parameters: start, end, widgetId, timezone and
 * next. It serves 100 cases a batch and a linkToNextSetOfResults while more remain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SnapengageAdapter } from '../../../../../../src/verticals/customer-support/adapters/snapengage/index'

const creds: Credentials = { accessToken: 'se_test', extra: { orgId: 'org-1' } }

const BATCH = 100
const DOCUMENTED = new Set(['start', 'end', 'widgetId', 'timezone', 'next'])

let calls: Array<Record<string, unknown>> = []
let auths: string[] = []
let total = 0
let transcriptCount = 0
/** Return linkToNextSetOfResults as a full link carrying `next`, not a bare token. */
let linkAsUrl = false
/** Make the rows depend on `start`, so a walk over another window has other rows. */
let tagStart = false

const caseId = (n: number) => `case-${n}`

function parseNext(raw: unknown): number {
  if (raw === undefined) return 0
  const s = String(raw)
  const n = Number(linkAsUrl ? s.replace(/^tok/, '') : s)
  if (!Number.isInteger(n) || (linkAsUrl && !s.startsWith('tok'))) throw new Error(`bad next ${s}`)
  return n
}

function respond(path: string, params: Record<string, unknown>, auth: string): unknown {
  if (path !== '/org-1/logs') throw new Error(`unexpected path ${path}`)
  for (const k of Object.keys(params)) {
    if (!DOCUMENTED.has(k)) throw new Error(`undocumented param ${k}`)
  }
  if (!params['start'] || !params['end']) throw new Error('start and end are required')
  const offset = parseNext(params['next'])
  // Rows from another token, widget or (when tagged) window are visibly different.
  const tag =
    (auth === creds.accessToken ? '' : `${auth}-`) +
    (params['widgetId'] ? `${String(params['widgetId'])}-` : '') +
    (tagStart ? `${String(params['start'])}-` : '')
  const cases = Array.from({ length: Math.max(0, Math.min(BATCH, total - offset)) }, (_, i) => {
    const n = offset + i + 1
    return {
      id: tag + caseId(n),
      requested_by: `${tag}v${n}@example.test`,
      created_at_date: 1700000000000 + n,
      transcripts: Array.from({ length: transcriptCount }, (_, t) => ({
        id: `t${t + 1}`,
        date: 1700000000000 + t,
        alias: 'Visitor',
        message: `m${t + 1}`,
      })),
    }
  })
  const more = offset + BATCH < total
  const link = linkAsUrl
    ? `https://www.snapengage.com/api/v2/org-1/logs?start=x&end=y&next=tok${offset + BATCH}`
    : String(offset + BATCH)
  return { cases, linkToNextSetOfResults: more ? link : '' }
}

beforeEach(() => {
  calls = []
  auths = []
  total = 0
  transcriptCount = 0
  linkAsUrl = false
  tagStart = false
  _resetRowPager()
  vi.spyOn(axios, 'create').mockImplementation((config) => {
    const headers = (config?.headers ?? {}) as Record<string, unknown>
    const auth = String(headers['Authorization'] ?? '')
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push(params)
        auths.push(auth)
        return { data: respond(path, params, auth) }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const adapter = new SnapengageAdapter()

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, reported }
}

const streamed: {
  name: string
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
  idOf: (n: number) => string
}[] = [
  { name: 'listTickets', run: (p) => adapter.listTickets(creds, p), idOf: caseId },
  {
    name: 'listContacts',
    run: (p) => adapter.listContacts(creds, p),
    idOf: (n) => `v${n}@example.test`,
  },
]

for (const { name, run, idOf } of streamed) {
  describe(`snapengage ${name} follows linkToNextSetOfResults`, () => {
    it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact (L < batch)', async () => {
      const L = 4
      total = 2 * L + 1
      const { seen, reported } = await walk(run, L)
      expect(seen).toEqual(Array.from({ length: total }, (_, i) => idOf(i + 1)))
      expect(reported).toEqual([true, true, false])
    })

    it('serves 2L+1 rows once across upstream batches (L > batch)', async () => {
      const L = 150
      total = 2 * L + 1
      const { seen, reported } = await walk(run, L)
      expect(seen).toEqual(Array.from({ length: total }, (_, i) => idOf(i + 1)))
      expect(reported).toEqual([true, true, false])
    })

    it('the request for the second batch carries next from linkToNextSetOfResults', async () => {
      total = 250
      await run(withPageSink({ page: 2, limit: 100 }))
      // Page 2 = rows 100..199: batch 2, plus a peek at batch 3 for hasMore.
      expect(calls[0]).not.toHaveProperty('next')
      expect(calls[1]).toMatchObject({ next: '100' })
    })

    it('a limit above the router cap is clamped', async () => {
      total = 600
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      const rows = await run(params)
      expect(rows).toHaveLength(500)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      total = 9
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'snapengage')
      expect(env.data.map((r) => r.id)).toEqual([5, 6, 7, 8].map(idOf))
      expect(env.meta.hasMore).toBe(true)
    })

    it('a full linkToNextSetOfResults link sends only its next value', async () => {
      linkAsUrl = true
      total = 250
      const { seen } = await walk(run, 100)
      expect(seen).toEqual(Array.from({ length: total }, (_, i) => idOf(i + 1)))
      expect(calls[1]).toMatchObject({ next: 'tok100' })
      expect(calls[2]).toMatchObject({ next: 'tok200' })
    })

    it('a walk under another widgetId does not reuse the first walk rows', async () => {
      total = 9
      await run(withPageSink({ page: 1, limit: 4, widgetId: 'A' }))
      const rows = await run(withPageSink({ page: 2, limit: 4, widgetId: 'B' }))
      expect(rows.map((r) => r.id)).toEqual([5, 6, 7, 8].map((n) => `B-${idOf(n)}`))
      expect(calls.at(-1)).toMatchObject({ widgetId: 'B' })
    })

    it('a walk over another start date does not reuse the first walk rows', async () => {
      tagStart = true
      total = 9
      const s1 = '2026-01-01T00:00:00.000Z'
      const s2 = '2026-02-01T00:00:00.000Z'
      await run(withPageSink({ page: 1, limit: 4, start: s1 }))
      const rows = await run(withPageSink({ page: 2, limit: 4, start: s2 }))
      expect(rows.map((r) => r.id)).toEqual([5, 6, 7, 8].map((n) => `${s2}-${idOf(n)}`))
    })

    it('another connection on the same org does not reuse the first connection rows', async () => {
      total = 9
      const other: Credentials = { accessToken: 'se_other', extra: { orgId: 'org-1' } }
      await run(withPageSink({ page: 1, limit: 4 }))
      const otherRun =
        name === 'listTickets'
          ? (p: QueryParams) => adapter.listTickets(other, p)
          : (p: QueryParams) => adapter.listContacts(other, p)
      const rows = await otherRun(withPageSink({ page: 2, limit: 4 }))
      expect(rows.map((r) => r.id)).toEqual([5, 6, 7, 8].map((n) => `se_other-${idOf(n)}`))
      expect(auths.at(-1)).toBe('se_other')
    })

    it('an explicit cursor gets exactly that one upstream batch', async () => {
      total = 250
      const rows = await run({ cursor: '100', limit: 4 })
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ next: '100' })
      expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 100 }, (_, i) => idOf(101 + i)))
    })

    it('the default window holds steady within a minute, so pages do not re-walk', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-24T12:00:10.000Z'))
      total = 301
      const seen: string[] = []
      for (const page of [1, 2, 3]) {
        seen.push(...(await run(withPageSink({ page, limit: 150 }))).map((r) => r.id))
        vi.setSystemTime(Date.now() + 5)
      }
      expect(seen).toEqual(Array.from({ length: total }, (_, i) => idOf(i + 1)))
      // Four 100-case batches, each fetched once, all over one window.
      expect(calls).toHaveLength(4)
      expect(new Set(calls.map((c) => c['end']))).toEqual(new Set(['2026-09-24T12:01:00.000Z']))
    })
  })
}

describe('snapengage listMessages pages the case transcript locally', () => {
  const run = (p: QueryParams) => adapter.listMessages(creds, caseId(1), p)
  const ids = () => Array.from({ length: transcriptCount }, (_, i) => `t${i + 1}`)

  it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
    const L = 4
    total = 1
    transcriptCount = 2 * L + 1
    const { seen, reported } = await walk(run, L)
    expect(seen).toEqual(ids())
    expect(reported).toEqual([true, true, false])
  })

  it('sends no paging parameters for its page (the transcript is nested in the case)', async () => {
    total = 1
    transcriptCount = 9
    await run(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toHaveProperty('next')
  })

  it('a limit above the router cap is clamped', async () => {
    total = 1
    transcriptCount = 600
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    expect(await run(params)).toHaveLength(500)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 1
    transcriptCount = 9
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await run(params), params, 'snapengage')
    expect(env.data.map((r) => r.id)).toEqual(['t5', 't6', 't7', 't8'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(9)
  })
})
