/**
 * Keap REST v2 pipelines (opportunity stages) and notes, against a fake that
 * honours only the documented parameters.
 *
 * From the v2 OpenAPI spec (https://crm.infusionsoft.com/app/v3/api-docs/V2):
 *
 *   "/rest/v2/opportunities/stages":{"get":{ ... "operationId":"listOpportunityStages"
 *     params: filter, page_token, order_by, page_size ("maximum":1000)
 *     "ListOpportunityStagesResponse": {stages, next_page_token}
 *   "/rest/v2/notes":{"get":{ ... "operationId":"listAllNotes"
 *   "/rest/v2/contacts/{contact_id}/notes":{"get":{ ... "operationId":"listNotes"
 *     params: filter, page_token, order_by, page_size ("maximum":1000), fields
 *     "ListNotesResponse": {notes, next_page_token}
 *   filter on notes: "(String) `id` — supports `==`, ..."
 *
 * The spec has no `/rest/v2/opportunityStages` and no `/rest/v2/notes/{id}`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { KeapAdapter } from '../../../../../../src/verticals/crm/adapters/keap/index'
import { PipelineSchema } from '../../../../../../src/verticals/crm/schema/pipeline'
import { NoteSchema } from '../../../../../../src/verticals/crm/schema/note'

const CREDS = { accessToken: 'keap_test' }
const BASE = '/crm/rest/v2'
const MAX = 1000

interface Sent {
  url: URL
  method: string
}

/**
 * A fake Keap v2. `stages` / `notes` hold the account's rows; each list
 * serves at most `serverCap` rows per page (a server may return fewer than
 * page_size) and chains pages by an opaque next_page_token.
 */
function fakeKeap(opts: {
  stages?: Record<string, unknown>[]
  notes?: Record<string, unknown>[]
  serverCap?: number
  loopToken?: boolean
  /** Serve every row regardless of `filter` (a server that ignores it). */
  ignoreFilter?: boolean
}) {
  const sent: Sent[] = []
  const cap = opts.serverCap ?? Number.POSITIVE_INFINITY
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    sent.push({ url, method })
    // A bounded server: a client that never stops fails fast instead of hanging.
    if (sent.length > 20) return new Response('too many requests', { status: 400 })
    const json = (b: unknown) =>
      new Response(JSON.stringify(b), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    if (method !== 'GET') return new Response('unexpected', { status: 405 })

    let key: 'stages' | 'notes'
    let rows: Record<string, unknown>[]
    let allowed: Set<string>
    const contactNotes = url.pathname.match(/^\/crm\/rest\/v2\/contacts\/([^/]+)\/notes$/)
    if (url.pathname === `${BASE}/opportunities/stages`) {
      key = 'stages'
      rows = opts.stages ?? []
      allowed = new Set(['filter', 'page_token', 'order_by', 'page_size'])
    } else if (url.pathname === `${BASE}/notes` || contactNotes) {
      key = 'notes'
      rows = (opts.notes ?? []).filter(
        (n) => !contactNotes || n['contact_id'] === decodeURIComponent(contactNotes[1]!),
      )
      allowed = new Set(['filter', 'page_token', 'order_by', 'page_size', 'fields'])
    } else {
      return new Response(`no such path ${url.pathname}`, { status: 404 })
    }
    for (const k of url.searchParams.keys()) {
      if (!allowed.has(k)) return new Response(`unknown param ${k}`, { status: 400 })
    }
    const filter = url.searchParams.get('filter')
    if (filter !== null && !opts.ignoreFilter) {
      const m = filter.match(/^id==(.+)$/)
      if (!m || key !== 'notes') return new Response(`bad filter ${filter}`, { status: 400 })
      rows = rows.filter((r) => r['id'] === m[1])
    }
    const rawSize = url.searchParams.get('page_size')
    const size = rawSize === null ? 50 : Number(rawSize)
    if (!Number.isInteger(size) || size < 0 || size > MAX) {
      return new Response('bad page_size', { status: 400 })
    }
    const tok = url.searchParams.get('page_token')
    const offset = tok === null ? 0 : Number(Buffer.from(tok, 'base64url').toString().split('|')[1])
    const n = Math.min(size, cap)
    const page = rows.slice(offset, offset + n)
    const body: Record<string, unknown> = { [key]: page }
    if (opts.loopToken)
      body['next_page_token'] = Buffer.from(`${url.pathname}|0`).toString('base64url')
    else if (offset + n < rows.length) {
      body['next_page_token'] = Buffer.from(`${url.pathname}|${offset + n}`).toString('base64url')
    }
    return json(body)
  })
  return { sent }
}

const stage = (i: number) => ({ id: String(i), name: `S${i}`, order: i, probability: 10 })
const note = (i: number, contact = '1001') => ({
  id: String(i),
  title: `t${i}`,
  text: `x${i}`,
  contact_id: contact,
})

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('keap listPipelines', () => {
  it('walks every stage page of /opportunities/stages into one pipeline', async () => {
    const stages = [7, 3, 5, 1, 6, 2, 4].map(stage)
    const { sent } = fakeKeap({ stages, serverCap: 3 })
    const params = withPageSink({ page: 1, limit: 5 })
    const out = await new KeapAdapter().listPipelines(CREDS, params)
    expect(out).toHaveLength(1)
    const p = PipelineSchema.parse(out[0])
    expect(p.id).toBe('default')
    expect(p.stages?.map((s) => s.id)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(p.stages?.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(sent).toHaveLength(3)
    expect(sent.every((s) => s.url.pathname === `${BASE}/opportunities/stages`)).toBe(true)
    expect(sent.every((s) => s.url.searchParams.get('page_size') === String(MAX))).toBe(true)
    expect(sent[0]!.url.searchParams.get('page_token')).toBeNull()
    expect(sent[1]!.url.searchParams.get('page_token')).not.toBeNull()
  })

  it('page 2 is empty, not a repeat of the pipeline', async () => {
    fakeKeap({ stages: [stage(1)] })
    const params = withPageSink({ page: 2, limit: 1 })
    expect(await new KeapAdapter().listPipelines(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a repeating next_page_token fails instead of looping', async () => {
    const { sent } = fakeKeap({ stages: [stage(1)], loopToken: true })
    await expect(new KeapAdapter().listPipelines(CREDS, withPageSink({ page: 1 }))).rejects.toThrow(
      /repeated/,
    )
    expect(sent).toHaveLength(2)
  })
})

describe('keap getPipeline', () => {
  it('reads the default pipeline from /opportunities/stages', async () => {
    const { sent } = fakeKeap({ stages: [stage(2), stage(1)] })
    const p = PipelineSchema.parse(await new KeapAdapter().getPipeline(CREDS, 'default'))
    expect(p.stages?.map((s) => s.id)).toEqual(['1', '2'])
    expect(sent.map((s) => s.url.pathname)).toEqual([`${BASE}/opportunities/stages`])
  })

  it('any other id is 404 with no request', async () => {
    const { sent } = fakeKeap({})
    await expect(new KeapAdapter().getPipeline(CREDS, '42')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toHaveLength(0)
  })
})

describe('keap listNotes', () => {
  it('without contact_id pages every note of /notes: 2L+1 rows, every id once', async () => {
    const L = 5
    const notes = Array.from({ length: 2 * L + 1 }, (_, i) => note(i + 1, i % 2 ? '1' : '2'))
    const { sent } = fakeKeap({ notes })
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new KeapAdapter().listNotes(CREDS, params)
      rows.forEach((r) => NoteSchema.parse(r))
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(notes.map((n) => n.id))
    expect(more).toEqual([true, true, false])
    expect(sent.every((s) => s.url.pathname === `${BASE}/notes`)).toBe(true)
    expect(sent.every((s) => s.url.searchParams.get('page_size') === String(L))).toBe(true)
  })

  it('with contact_id pages /contacts/{contact_id}/notes', async () => {
    const notes = [note(1, '7'), note(2, '8'), note(3, '7'), note(4, '7')]
    const { sent } = fakeKeap({ notes })
    const p1 = withPageSink({ page: 1, limit: 2, contact_id: '7' })
    const p2 = withPageSink({ page: 2, limit: 2, contact_id: '7' })
    const a = await new KeapAdapter().listNotes(CREDS, p1)
    const b = await new KeapAdapter().listNotes(CREDS, p2)
    expect([...a, ...b].map((n) => [n.id, n.contact_id])).toEqual([
      ['1', '7'],
      ['3', '7'],
      ['4', '7'],
    ])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(sent.every((s) => s.url.pathname === `${BASE}/contacts/7/notes`)).toBe(true)
  })

  it('a limit above 1000 is clamped to page_size 1000', async () => {
    const { sent } = fakeKeap({ notes: [note(1)] })
    const params = withPageSink({ page: 1, limit: 5000 })
    await new KeapAdapter().listNotes(CREDS, params)
    expect(sent[0]!.url.searchParams.get('page_size')).toBe(String(MAX))
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
  })
})

describe('keap getNote', () => {
  it('reads a note by id through /notes?filter=id==<id>', async () => {
    const { sent } = fakeKeap({ notes: [note(1), note(12345)] })
    const n = NoteSchema.parse(await new KeapAdapter().getNote(CREDS, '12345'))
    expect(n.id).toBe('12345')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url.pathname).toBe(`${BASE}/notes`)
    expect(sent[0]!.url.searchParams.get('filter')).toBe('id==12345')
  })

  it('an id Keap does not return is 404', async () => {
    fakeKeap({ notes: [note(1)] })
    await expect(new KeapAdapter().getNote(CREDS, '99')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns only the row whose id matches, even when other rows come back', async () => {
    fakeKeap({ notes: [note(1), note(12345)], ignoreFilter: true })
    expect((await new KeapAdapter().getNote(CREDS, '12345')).id).toBe('12345')
    await expect(new KeapAdapter().getNote(CREDS, '99')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('an id carrying filter syntax is 404 with no request', async () => {
    const { sent } = fakeKeap({ notes: [note(1)] })
    await expect(new KeapAdapter().getNote(CREDS, '1;title==x')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent).toHaveLength(0)
  })
})
