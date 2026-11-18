import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { VendastaAdapter } from '../../../../../../src/verticals/crm/adapters/vendasta/index'
import { DEFAULT_VENDASTA_SCOPES } from '../../../../../../src/verticals/crm/adapters/vendasta/constants'
import { ActivitySchema } from '../../../../../../src/verticals/crm/schema/activity'

/**
 * Vendasta activities live on the CRM External API (/org), not on the /grpc
 * CRM spec, which has no /v1/crm/activity/* path.
 * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/crm/crm.json
 *
 * ListCrmRecords: POST /list/{namespace}/{resourceTypeCode}. "The
 * resourceTypeCode, here contacts, companies or activities." Body
 * page: {cursor, limit} ("Parameters for pagination of results"). Response
 * {objects[], next_cursor, total_objects, has_more}. Servers:
 * https://prod.apigateway.co/org, https://demo.apigateway.co/org.
 */

const ORG = 'https://org.example.test/org'
const creds = { accessToken: 'tok', refreshToken: 'ref', extra: { namespace: 'AG-1' } }
let bodies: Array<Record<string, unknown>> = []
let urls: string[] = []
let headers: Array<Record<string, string>> = []

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Honours only the documented `page.cursor` and `page.limit`. Cursors are
 * opaque: the fake mints them, so an adapter that computes one instead of
 * carrying `next_cursor` forward fails.
 */
function serve(n: number, opts: { cursorOnLastPage?: boolean } = {}) {
  const fetchMock = vi.fn(
    async (input: string, init: { body: string; headers: Record<string, string> }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>
      bodies.push(body)
      urls.push(String(input))
      headers.push(init.headers)
      if (String(input) !== `${ORG}/list/AG-1/activities`) {
        return new Response('not found', { status: 404 })
      }
      const page = (body['page'] ?? {}) as { cursor?: string; limit?: number }
      const start = page.cursor ? Number(Buffer.from(page.cursor, 'base64').toString()) : 0
      const size = page.limit ?? 20
      const all = Array.from({ length: n }, (_, i) => ({
        id: `A-${i + 1}`,
        fields: [{ id: 'standard__activity_name', value: `Activity ${i + 1}` }],
      }))
      const objects = all.slice(start, start + size)
      const end = start + objects.length
      const has_more = end < n
      return json({
        objects,
        ...(has_more || opts.cursorOnLastPage
          ? { next_cursor: Buffer.from(String(end)).toString('base64') }
          : {}),
        has_more,
        total_objects: n,
      })
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function adapter() {
  return new VendastaAdapter({ baseUrl: 'https://grpc.example.test', orgBaseUrl: ORG })
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `A-${i + 1}`)

beforeEach(() => {
  bodies = []
  urls = []
  headers = []
  _resetCursorPager()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vendasta listActivities (ListCrmRecords on /org)', () => {
  it('POSTs the documented list URL with only page.{limit} on page 1, Bearer auth', async () => {
    serve(2)
    const rows = await adapter().listActivities(creds, withPageSink({ page: 1, limit: 5 }))
    expect(urls).toEqual([`${ORG}/list/AG-1/activities`])
    expect(bodies).toEqual([{ page: { limit: 5 } }])
    expect(headers[0]!['Authorization']).toBe('Bearer tok')
    expect(rows.map((r) => ActivitySchema.parse(r).id)).toEqual(['A-1', 'A-2'])
  })

  it('defaults to the production /org server', async () => {
    const fetchMock = vi.fn(async (_url: string) => json({ objects: [], has_more: false }))
    vi.stubGlobal('fetch', fetchMock)
    await new VendastaAdapter().listActivities(creds, withPageSink({ page: 1, limit: 5 }))
    expect(fetchMock.mock.calls[0]![0]).toBe('https://prod.apigateway.co/org/list/AG-1/activities')
  })

  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter().listActivities(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(7))
    expect(hasMore).toEqual([true, true, false])
  })

  it('carries next_cursor from page 1 into page.cursor on page 2', async () => {
    serve(7)
    await adapter().listActivities(creds, withPageSink({ page: 1, limit: 3 }))
    await adapter().listActivities(creds, withPageSink({ page: 2, limit: 3 }))
    expect(bodies.at(-1)).toEqual({
      page: { limit: 3, cursor: Buffer.from('3').toString('base64') },
    })
  })

  it('reaches page 2 on a cold cache by walking from page 1', async () => {
    serve(7)
    const rows = await adapter().listActivities(creds, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['A-4', 'A-5', 'A-6'])
    expect(bodies.map((b) => (b['page'] as { cursor?: string }).cursor)).toEqual([
      undefined,
      Buffer.from('3').toString('base64'),
    ])
  })

  it('stops on has_more:false even when the last page carries a next_cursor', async () => {
    serve(7, { cursorOnLastPage: true })
    for (const page of [1, 2])
      await adapter().listActivities(creds, withPageSink({ page, limit: 3 }))
    const params = withPageSink({ page: 3, limit: 3 })
    const rows = await adapter().listActivities(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['A-7'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves every row at a large limit (no documented maximum to clamp to)', async () => {
    const N = 1205
    serve(N)
    const seen: string[] = []
    for (let page = 1; page <= 5; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter().listActivities(creds, params)
      seen.push(...rows.map((r) => r.id))
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(N))
  })

  it('does not share cursors between connections or page sizes (warm cache)', async () => {
    serve(20)
    await adapter().listActivities(creds, withPageSink({ page: 1, limit: 3 }))
    bodies = []
    const other = { accessToken: 'tok-2', refreshToken: 'ref-2', extra: { namespace: 'AG-1' } }
    await adapter().listActivities(other, withPageSink({ page: 2, limit: 3 }))
    expect((bodies[0]!['page'] as { cursor?: string }).cursor).toBeUndefined()
    bodies = []
    const rows = await adapter().listActivities(creds, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['A-6', 'A-7', 'A-8', 'A-9', 'A-10'])
    expect((bodies[0]!['page'] as { cursor?: string }).cursor).toBeUndefined()
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const p2 = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await adapter().listActivities(creds, p2 as QueryParams), p2, 'vendasta')
    expect(out.data.map((r) => r.id)).toEqual(['A-4', 'A-5', 'A-6'])
    expect(out.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await adapter().listActivities(creds, p3 as QueryParams), p3, 'vendasta')
    expect(tail.data.map((r) => r.id)).toEqual(['A-7'])
    expect(tail.meta.hasMore).toBe(false)
  })

  it('refuses with 501 and sends nothing when the connection has no namespace', async () => {
    const fetchMock = serve(3)
    const noNs = { accessToken: 'tok', refreshToken: 'ref', extra: {} }
    await expect(
      adapter().listActivities(noNs, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('vendasta activity/note reads with no documented endpoint', () => {
  it.each(['listNotes'] as const)('%s throws 501 NOT_SUPPORTED and sends no request', async (m) => {
    const fetchMock = serve(3)
    await expect(adapter()[m](creds, withPageSink({ page: 1, limit: 3 }))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['getActivity', 'getNote'] as const)(
    '%s throws 501 NOT_SUPPORTED and sends no request',
    async (m) => {
      const fetchMock = serve(3)
      await expect(adapter()[m](creds, 'A-1')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
})

describe('vendasta scopes', () => {
  it("requests the /org CRM API's documented 'customers' scope by default", () => {
    expect(DEFAULT_VENDASTA_SCOPES).toContain('customers')
    const url = new URL(
      new VendastaAdapter({
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'https://r',
      }).getAuthUrl('st'),
    )
    expect(url.searchParams.get('scope')!.split(' ')).toContain('customers')
  })
})
