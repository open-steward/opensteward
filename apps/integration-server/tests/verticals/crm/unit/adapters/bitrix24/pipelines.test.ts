/**
 * Bitrix24 deal pipelines are deal funnels.
 *
 * - List: crm.category.list with `entityTypeId` 2; rows in `result.categories`,
 *   the default funnel (`id` 0) included
 *   (https://apidocs.bitrix24.com/api-reference/crm/universal/category/crm-category-list.html).
 *   Paged like every list method: "Bitrix24 returns no more than 50 items per
 *   page", "If the response contains the next field, pass its value in the
 *   start parameter of the next request"
 *   (https://apidocs.bitrix24.com/settings/how-to-call-rest-api/list-methods-pecularities.html).
 * - One: crm.category.get with `entityTypeId`* and `id`*, answering
 *   `{ result: { category } }`
 *   (https://apidocs.bitrix24.com/api-reference/crm/universal/category/crm-category-get.html).
 * - Stages: crm.dealcategory.stage.list with `id`; "If id = 0 or nothing is
 *   specified, it will return the statuses of the "default" direction"
 *   (https://apidocs.bitrix24.com/api-reference/crm/outdated/category-old/crm-deal-category-stage-list.html).
 *
 * The adapter used to ask for stages with `crm.dealcategory.stages`, which no
 * Bitrix24 page documents. The fake answers only the documented methods and
 * parameters, and 404s ERROR_METHOD_NOT_FOUND for anything else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { Bitrix24Adapter } from '../../../../../../src/verticals/crm/adapters/bitrix24'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'

const ENDPOINT = 'https://portal.example.test/rest/'
const CREDS: Credentials = {
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  extra: { baseUrl: ENDPOINT },
}
const UPSTREAM = 50

interface Sent {
  method: string
  body: Record<string, unknown>
  authorization: string | null
}

let sent: Sent[] = []
let funnelCount = 0
/** When set, the start=0 page carries only this many funnels but still sends `next`. */
let shortFirstPage: number | undefined
/** When set, each funnel's stages come back over two pages, split at this row. */
let stagePageSplit: number | undefined
/** When set, every stage page names the same `next`, as a broken portal might. */
let stageNextRepeats = false
/** Stage requests in flight right now, and the most seen at once. */
let stagesInFlight = 0
let maxStagesInFlight = 0

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Funnel ids 0 (the default, "General") .. funnelCount - 1. */
function funnel(id: number): Record<string, unknown> {
  return id === 0
    ? { id: 0, name: 'General', sort: 300, entityTypeId: 2, isDefault: 'Y' }
    : {
        id,
        name: `Funnel ${id}`,
        sort: 200,
        entityTypeId: 2,
        isDefault: 'N',
        originId: '',
        originatorId: '',
      }
}

function stagesFor(id: number): Array<Record<string, unknown>> {
  const prefix = id === 0 ? '' : `C${id}:`
  return [
    {
      ID: `${id}01`,
      ENTITY_ID: id === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${id}`,
      STATUS_ID: `${prefix}NEW`,
      NAME: 'New',
      SORT: '10',
      CATEGORY_ID: id === 0 ? null : String(id),
      SEMANTICS: null,
    },
    {
      ID: `${id}02`,
      ENTITY_ID: id === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${id}`,
      STATUS_ID: `${prefix}WON`,
      NAME: 'Deal won',
      SORT: '60',
      CATEGORY_ID: id === 0 ? null : String(id),
      SEMANTICS: 'S',
    },
  ]
}

async function fakeBitrix24(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const m = /^\/rest\/([a-z.]+)$/.exec(url.pathname)
  if (!m || init?.method !== 'POST') return json(404, { error: 'ERROR_METHOD_NOT_FOUND' })
  const body =
    typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
  const headers = new Headers(init.headers)
  sent.push({ method: m[1] as string, body, authorization: headers.get('authorization') })
  if (body['auth'] !== CREDS.accessToken) return json(401, { error: 'NO_AUTH_FOUND' })

  switch (m[1]) {
    case 'crm.category.list': {
      if (body['entityTypeId'] !== 2) return json(400, { error: 'NOT_FOUND' })
      const start = Number(body['start'] ?? 0)
      if (!Number.isInteger(start) || start < 0 || start % UPSTREAM !== 0) {
        return json(400, { error: 'INVALID_START' })
      }
      const end = start === 0 && shortFirstPage !== undefined ? shortFirstPage : start + UPSTREAM
      const ids = Array.from({ length: funnelCount }, (_, i) => i).slice(start, end)
      const out: Record<string, unknown> = {
        result: { categories: ids.map(funnel) },
        total: funnelCount,
      }
      if (start + UPSTREAM < funnelCount) out['next'] = start + UPSTREAM
      return json(200, out)
    }
    case 'crm.category.get': {
      // crm-category-get.html: "id* integer".
      const id = body['id']
      if (
        body['entityTypeId'] !== 2 ||
        typeof id !== 'number' ||
        !Number.isInteger(id) ||
        !(id >= 0 && id < funnelCount)
      ) {
        return json(400, { error: 'NOT_FOUND' })
      }
      return json(200, { result: { category: funnel(id) } })
    }
    case 'crm.dealcategory.stage.list': {
      stagesInFlight++
      maxStagesInFlight = Math.max(maxStagesInFlight, stagesInFlight)
      await new Promise((r) => setTimeout(r, 1))
      stagesInFlight--
      const id = Number(body['id'] ?? 0)
      const all = stagesFor(id)
      if (stageNextRepeats) return json(200, { result: all.slice(0, 1), next: 1, total: 99 })
      if (stagePageSplit === undefined) return json(200, { result: all, total: all.length })
      const start = Number(body['start'] ?? 0)
      const rows = start === 0 ? all.slice(0, stagePageSplit) : all.slice(start)
      const out: Record<string, unknown> = { result: rows, total: all.length }
      if (start === 0) out['next'] = stagePageSplit
      return json(200, out)
    }
    default:
      return json(404, { error: 'ERROR_METHOD_NOT_FOUND' })
  }
}

beforeEach(() => {
  sent = []
  funnelCount = 0
  shortFirstPage = undefined
  stagePageSplit = undefined
  stageNextRepeats = false
  stagesInFlight = 0
  maxStagesInFlight = 0
  _resetRowPager()
  vi.stubGlobal('fetch', vi.fn(fakeBitrix24))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const adapter = new Bitrix24Adapter()

async function syncPage(
  page: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = await adapter.listPipelines(CREDS, params)
  for (const r of rows) PipelineSchema.parse(r)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

function range(from: number, to: number): string[] {
  return Array.from({ length: to - from }, (_, i) => String(from + i))
}

describe('bitrix24 listPipelines', () => {
  const L = 30

  it('serves 2L+1 funnels over pages 1, 2, 3, each once, with hasMore exact', async () => {
    funnelCount = 2 * L + 1
    expect(await syncPage(1, L)).toEqual({ ids: range(0, 30), hasMore: true })
    expect(await syncPage(2, L)).toEqual({ ids: range(30, 60), hasMore: true })
    expect(await syncPage(3, L)).toEqual({ ids: range(60, 61), hasMore: false })
  })

  it('asks crm.category.list for deal funnels by the documented start', async () => {
    funnelCount = 2 * L + 1
    await syncPage(2, L)
    const lists = sent.filter((s) => s.method === 'crm.category.list')
    expect(lists.map((s) => s.body)).toEqual([
      { entityTypeId: 2, start: 0, auth: 'at-1' },
      { entityTypeId: 2, start: UPSTREAM, auth: 'at-1' },
    ])
  })

  it('reports hasMore false when the funnels end exactly on a page', async () => {
    funnelCount = 2 * L
    expect(await syncPage(2, L)).toEqual({ ids: range(30, 60), hasMore: false })
  })

  it('follows `next` past a short upstream page', async () => {
    funnelCount = 101
    shortFirstPage = 20
    const expected = [...range(0, 20), ...range(50, 101)]
    expect(await syncPage(1, 60)).toEqual({ ids: expected.slice(0, 60), hasMore: true })
    expect(await syncPage(2, 60)).toEqual({ ids: expected.slice(60), hasMore: false })
  })

  it('includes the default funnel and reads each funnel’s stages by its id', async () => {
    funnelCount = 2
    const rows = await adapter.listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => [r.id, r.name])).toEqual([
      ['0', 'General'],
      ['1', 'Funnel 1'],
    ])
    expect(rows[0]?.stages).toEqual([
      { id: 'NEW', name: 'New', order: 0 },
      { id: 'WON', name: 'Deal won', order: 1 },
    ])
    expect(rows[1]?.stages?.map((s) => s.id)).toEqual(['C1:NEW', 'C1:WON'])
    const stageCalls = sent.filter((s) => s.method === 'crm.dealcategory.stage.list')
    expect(stageCalls.map((s) => s.body['id']).sort()).toEqual([0, 1])
  })

  it('reads every page of a funnel’s stages', async () => {
    funnelCount = 1
    stagePageSplit = 1
    const [row] = await adapter.listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(row?.stages?.map((s) => s.id)).toEqual(['NEW', 'WON'])
    expect(
      sent.filter((s) => s.method === 'crm.dealcategory.stage.list').map((s) => s.body['start']),
    ).toEqual([undefined, 1])
  })

  it('reads one funnel’s stages at a time, not all funnels at once', async () => {
    funnelCount = 5
    await adapter.listPipelines(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(sent.filter((s) => s.method === 'crm.dealcategory.stage.list')).toHaveLength(5)
    expect(maxStagesInFlight).toBe(1)
  })

  it('throws when a stage page names its own start as next, instead of looping', async () => {
    funnelCount = 1
    stageNextRepeats = true
    await expect(
      adapter.listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/named its own start as next/)
    expect(sent.filter((s) => s.method === 'crm.dealcategory.stage.list')).toHaveLength(2)
  })

  it('throws on an answer without `result.categories` instead of reading it as the end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { total: 0 })),
    )
    await expect(
      adapter.listPipelines(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/no rows/)
  })

  it('never calls an undocumented method', async () => {
    funnelCount = 3
    await adapter.listPipelines(CREDS, withPageSink({ page: 1, limit: 10 }))
    await adapter.getPipeline(CREDS, '2')
    expect(new Set(sent.map((s) => s.method))).toEqual(
      new Set(['crm.category.list', 'crm.category.get', 'crm.dealcategory.stage.list']),
    )
  })
})

describe('bitrix24 getPipeline', () => {
  it('reads crm.category.get with entityTypeId and id, then that funnel’s stages', async () => {
    funnelCount = 3
    const out = PipelineSchema.parse(await adapter.getPipeline(CREDS, '2'))
    expect(out).toMatchObject({ id: '2', name: 'Funnel 2' })
    expect(out.stages?.map((s) => s.id)).toEqual(['C2:NEW', 'C2:WON'])
    expect(sent.map((s) => [s.method, s.body])).toEqual([
      ['crm.category.get', { entityTypeId: 2, id: 2, auth: 'at-1' }],
      ['crm.dealcategory.stage.list', { id: 2, auth: 'at-1' }],
    ])
  })
})

describe('bitrix24 getPipeline id', () => {
  it('answers 404 for a non-integer id without sending anything', async () => {
    funnelCount = 3
    await expect(adapter.getPipeline(CREDS, 'abc')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getPipeline(CREDS, '1.5')).rejects.toMatchObject({ statusCode: 404 })
    expect(sent).toEqual([])
  })
})

describe('bitrix24 request envelope', () => {
  it('appends the method to client_endpoint once and sends the token as `auth`, not a header', async () => {
    funnelCount = 1
    await adapter.getPipeline(CREDS, '0')
    const calls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(calls).toEqual([
      'https://portal.example.test/rest/crm.category.get',
      'https://portal.example.test/rest/crm.dealcategory.stage.list',
    ])
    for (const s of sent) {
      expect(s.body['auth']).toBe('at-1')
      expect(s.authorization).toBeNull()
    }
  })

  it('adds /rest/ to a bare portal address', async () => {
    funnelCount = 1
    await adapter.getPipeline({ ...CREDS, extra: { baseUrl: 'https://portal.example.test' } }, '0')
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      'https://portal.example.test/rest/crm.category.get',
    )
  })
})
