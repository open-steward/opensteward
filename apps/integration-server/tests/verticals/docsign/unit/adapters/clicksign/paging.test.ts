/**
 * Clicksign audit-trail listing.
 *
 * Clicksign v1 documents no events endpoint of its own: the events of a
 * document come embedded in `GET /api/v1/documents/:key`
 * (https://developers.clicksign.com/v1.0/docs/visualizar-documento.md), which
 * lists "Events" among the blocks of its response and shows them at
 * `document.events` ("Events: atributos dos eventos" — `name`, `data`,
 * `occurred_at`). That request takes no query parameter but `access_token`,
 * so the events are returned whole and paged locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, PageMaxBearing } from '@opensteward/shared'
import { ClicksignClient } from '../../../../../../src/verticals/docsign/adapters/clicksign/client'
import { ClicksignAdapter } from '../../../../../../src/verticals/docsign/adapters/clicksign'

const CREDS = { accessToken: 'tok_test' } as Credentials
const DOC = '55fea7c2-0e5b-40dc-bacf-50fb8529f866'
const L = 2
const N = 2 * L + 1

afterEach(() => vi.restoreAllMocks())

const adapter = new ClicksignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

/**
 * A fake `GET /documents/:key` that answers only that documented path, with
 * no query parameters of its own (the client adds `access_token`), and puts
 * the events where the docs do: inside `document`.
 */
function fakeDocument(total: number) {
  const events = Array.from({ length: total }, (_, i) => ({
    name: 'upload',
    data: { user: { email: `u${i}@example.com`, name: `U${i}` } },
    occurred_at: new Date(Date.UTC(2018, 5, 21, 16, 47, i)).toISOString(),
  }))
  const get = vi
    .spyOn(ClicksignClient.prototype, 'get')
    .mockImplementation(async (p: string, params?: Record<string, unknown>) => {
      if (p !== `/documents/${DOC}`) throw new Error(`unexpected path ${p}`)
      if (params !== undefined) throw new Error('GET /documents/:key takes no query params')
      return { document: { key: DOC, status: 'running', events } } as never
    })
  return { get, ids: events.map((e) => `${DOC}:${e.occurred_at}:upload`) }
}

describe('ClicksignAdapter.listAuditTrailEntries reads document.events', () => {
  it('GETs the documented /documents/:key, never the undocumented /events path', async () => {
    const { get } = fakeDocument(N)
    await adapter.listAuditTrailEntries(CREDS, DOC, withPageSink({ page: 1, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(`/documents/${DOC}`)
  })

  it('pages 1..3 return every id once, in order, with an exact hasMore', async () => {
    const { ids } = fakeDocument(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('reports the total and that the page was cut locally', async () => {
    fakeDocument(N)
    const params = withPageSink({ page: 1, limit: L })
    await adapter.listAuditTrailEntries(CREDS, DOC, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    const { ids } = fakeDocument(N)
    const params = withPageSink(
      parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing),
    )
    const rows = await adapter.listAuditTrailEntries(CREDS, DOC, params)
    const env = listPage(rows, params, 'clicksign')
    expect(env.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env.meta.hasMore).toBe(true)
  })

  it('throws, rather than serving a complete empty trail, when document.events is absent', async () => {
    const get = vi.spyOn(ClicksignClient.prototype, 'get').mockResolvedValue({
      document: { key: DOC },
    } as never)
    const params = withPageSink({ page: 1, limit: L })
    await expect(adapter.listAuditTrailEntries(CREDS, DOC, params)).rejects.toThrow(
      /document\.events/,
    )
    expect(get).toHaveBeenCalledTimes(1)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('an empty documented events array is an empty, complete page', async () => {
    vi.spyOn(ClicksignClient.prototype, 'get').mockResolvedValue({
      document: { key: DOC, events: [] },
    } as never)
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listAuditTrailEntries(CREDS, DOC, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws when the document is not returned', async () => {
    vi.spyOn(ClicksignClient.prototype, 'get').mockResolvedValue({} as never)
    await expect(
      adapter.listAuditTrailEntries(CREDS, DOC, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/not found/)
  })
})

describe('ClicksignAdapter.getAuditTrailEntry reads back a listed id', () => {
  it('returns the entry a list returned, from the same documented path', async () => {
    const { get, ids } = fakeDocument(N)
    const listed = await adapter.listAuditTrailEntries(
      CREDS,
      DOC,
      withPageSink({ page: 2, limit: L }),
    )
    const one = await adapter.getAuditTrailEntry(CREDS, ids[L + 1]!)
    expect(one).toEqual(listed[1])
    expect(get.mock.calls.every((c) => c[0] === `/documents/${DOC}`)).toBe(true)
  })

  it('throws for an id no listed event has', async () => {
    fakeDocument(N)
    await expect(adapter.getAuditTrailEntry(CREDS, `${DOC}:${N}`)).rejects.toThrow(/not found/)
  })
})

describe('Clicksign audit-trail ids survive a newly added event', () => {
  /** The two newest events of the "Events" section example (visualizar-documento.md). */
  const SIGN = {
    name: 'sign',
    data: { signer: { key: '935be7d1-b181-444f-8adc-bbff0b9ba48b', email: 'fulano@example.com' } },
    occurred_at: '2018-06-22T02:32:45.156Z',
  }
  const AUTO_CLOSE = { name: 'auto_close', data: null, occurred_at: '2018-06-22T02:32:45.375Z' }

  it('an id saved before an event is prepended still reads the same event', async () => {
    const get = vi.spyOn(ClicksignClient.prototype, 'get')
    get.mockResolvedValueOnce({ document: { key: DOC, events: [SIGN] } } as never)
    const [before] = await adapter.listAuditTrailEntries(
      CREDS,
      DOC,
      withPageSink({ page: 1, limit: L }),
    )
    // Documented order is newest-first: the auto_close lands in front.
    get.mockResolvedValueOnce({ document: { key: DOC, events: [AUTO_CLOSE, SIGN] } } as never)
    const after = await adapter.getAuditTrailEntry(CREDS, before!.id)
    expect(before!.id).toBe(`${DOC}:2018-06-22T02:32:45.156Z:sign`)
    expect(after.eventType).toBe('signed')
    expect(after.occurredAt).toBe(SIGN.occurred_at)
  })

  it('exact duplicates get distinct ids, counted from the oldest end', async () => {
    vi.spyOn(ClicksignClient.prototype, 'get').mockResolvedValue({
      document: { key: DOC, events: [AUTO_CLOSE, SIGN, SIGN] },
    } as never)
    const rows = await adapter.listAuditTrailEntries(
      CREDS,
      DOC,
      withPageSink({ page: 1, limit: 3 }),
    )
    const base = `${DOC}:2018-06-22T02:32:45.156Z:sign`
    expect(rows.map((r) => r.id)).toEqual([
      `${DOC}:2018-06-22T02:32:45.375Z:auto_close`,
      `${base}#1`,
      base,
    ])
    expect(rows.map((r) => r.externalId)).toEqual(rows.map((r) => r.id))
  })
})
