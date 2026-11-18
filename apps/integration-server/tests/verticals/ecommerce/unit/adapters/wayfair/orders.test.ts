/**
 * Wayfair listOrders / getOrder on the Dropship Orders API (v2).
 *
 * Reference: https://developer.wayfair.io/posts/docs/dropship-orders-api/reference/GraphQL/v2.0.0
 *   "Production: https://api.wayfair.io/2026-09/dropship-orders/graphql
 *    Sandbox: https://api.wayfair.io/sandbox/2026-09/dropship-orders/graphql"
 *   dropshipOrders(filter, first, after, last, before, sort)
 *   first: "Orders per page when paging forward, 1 to 250; omit for the default of 50."
 *   after: "Cursor to page forward from ( pageInfo.endCursor ); omit for the first page."
 *   hasNextPage: "True when another page follows this one."
 *   413 REQUEST_TOO_LARGE: "first or last above 250."
 *
 * The fake upstream is one GraphQL endpoint per environment. It accepts only
 * the six documented arguments as variables, rejects `first` outside 1..250,
 * honours `filter.purchaseOrderNumbers` (unknown numbers become NOT_FOUND
 * issue nodes), mints cursors bound to the page size and sort, and — like a
 * real cursor API — returns an endCursor on the last page too, so only
 * hasNextPage says whether there is more.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { WayfairAdapter } from '../../../../../../src/verticals/ecommerce/adapters/wayfair/index'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'

const CREDS: Credentials = { accessToken: 'wf-token' }
const PROD = 'https://api.wayfair.io/2026-09/dropship-orders/graphql'
const SANDBOX = 'https://api.wayfair.io/sandbox/2026-09/dropship-orders/graphql'
const V1 = 'https://api.wayfair.com/v1/graphql'
const MAX = 250
const DOCUMENTED_ARGS = new Set(['filter', 'first', 'after', 'last', 'before', 'sort'])

type Node = Record<string, unknown>

interface Call {
  baseURL: string
  headers: Record<string, string>
  query: string
  variables: Record<string, unknown>
}

function orderNode(po: string): Node {
  return {
    __typename: 'SupplierDropshipOrder',
    purchaseOrderNumber: po,
    createdAt: '2026-09-11T14:32:00Z',
    customerOrderId: '710000001',
    orderType: 'B2C',
    status: 'NEW',
    mustShipByDate: '2026-09-13T00:00:00Z',
    storeName: 'Wayfair',
    lineItems: [
      {
        supplierPartNumber: 'SBX-PART-0001',
        quantity: 2,
        unitPrice: { amount: '64.99', currencyCode: 'USD' },
        status: 'NEW',
        name: 'Sandbox Accent Chair',
      },
    ],
  }
}

function issueNode(po: string, code = 'NOT_FOUND'): Node {
  return {
    __typename: 'SupplierDropshipOrderIssue',
    purchaseOrderNumber: po,
    code,
    message:
      'The requested purchase order could not be found, or it does not belong to your account.',
    remediation:
      'Verify the purchase order number and that the order belongs to your supplier account, then retry without it.',
  }
}

function gqlError(code: string, message: string) {
  return { data: { errors: [{ message, extensions: { code } }], data: null } }
}

/** A fake Dropship Orders endpoint over `rows` (orders and issue nodes, in sort order). */
function fake(rows: Node[]) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((config: {
    baseURL: string
    headers: Record<string, string>
  }) => ({
    defaults: {},
    post: vi.fn(
      async (_path: string, body: { query: string; variables: Record<string, unknown> }) => {
        calls.push({ baseURL: config.baseURL, headers: config.headers, ...body })
        if (config.baseURL !== PROD && config.baseURL !== SANDBOX) {
          throw Object.assign(new Error('404 no Route matched'), { response: { status: 404 } })
        }
        const v = body.variables
        for (const k of Object.keys(v)) {
          if (!DOCUMENTED_ARGS.has(k)) return gqlError('BAD_USER_INPUT', `unknown argument ${k}`)
        }
        if (!/dropshipOrders\(/.test(body.query))
          return gqlError('BAD_USER_INPUT', 'no dropshipOrders')
        const first = v['first'] === undefined ? 50 : Number(v['first'])
        if (!Number.isInteger(first) || first < 1) return gqlError('BAD_USER_INPUT', 'first')
        if (first > MAX) return gqlError('REQUEST_TOO_LARGE', 'first cannot exceed 250.')

        const filter = v['filter'] as { purchaseOrderNumbers?: string[] } | undefined
        let list = rows
        if (filter?.purchaseOrderNumbers) {
          list = filter.purchaseOrderNumbers.map(
            (po) => rows.find((r) => r['purchaseOrderNumber'] === po) ?? issueNode(po),
          )
        }
        const scope = `${first}|${JSON.stringify(v['sort'] ?? null)}|${JSON.stringify(filter ?? null)}`
        let start = 0
        if (v['after'] !== undefined) {
          const m = /^(.*)@(\d+)$/.exec(Buffer.from(String(v['after']), 'base64').toString())
          if (!m || m[1] !== scope) return gqlError('BAD_USER_INPUT', 'bad cursor')
          start = Number(m[2])
        }
        const page = list.slice(start, start + first)
        const end = start + page.length
        return {
          data: {
            data: {
              dropshipOrders: {
                pageInfo: {
                  hasNextPage: end < list.length,
                  endCursor: Buffer.from(`${scope}@${end}`).toString('base64'),
                },
                edges: page.map((node) => ({ node })),
              },
            },
          },
        }
      },
    ),
  })) as never)
  return calls
}

const pad = (i: number): string => `CS${String(10000001 + i)}`
const orders = (n: number): Node[] => Array.from({ length: n }, (_, i) => orderNode(pad(i)))

async function ids(a: WayfairAdapter, params: QueryParams): Promise<string[]> {
  return (await a.listOrders(CREDS, params)).map((o) => o.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Wayfair listOrders (dropshipOrders, v2)', () => {
  it('serves 2L+1 orders once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 17]) {
      _resetCursorPager()
      vi.restoreAllMocks()
      const rows = orders(2 * L + 1)
      fake(rows)
      const a = new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await ids(a, params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(rows.map((r) => r['purchaseOrderNumber']))
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('leaves NOT_FOUND issue nodes out of the page and keeps paging past a page they shortened', async () => {
    const rows = [...orders(2), issueNode('CS20000000', 'NOT_FOUND'), ...orders(5).slice(2)]
    fake(rows)
    const a = new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' })
    const p1 = withPageSink({ page: 1, limit: 3 } as QueryParams)
    expect(await ids(a, p1)).toEqual([pad(0), pad(1)])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 3 } as QueryParams)
    expect(await ids(a, p2)).toEqual([pad(2), pad(3), pad(4)])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('fails the page on an INTERNAL issue node instead of serving it without that order', async () => {
    const rows = [...orders(2), issueNode('CS20000000', 'INTERNAL'), ...orders(5).slice(2)]
    fake(rows)
    const a = new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' })
    const p1 = withPageSink({ page: 1, limit: 3 } as QueryParams)
    await expect(a.listOrders(CREDS, p1)).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_INCOMPLETE',
      message: expect.stringMatching(/CS20000000.*INTERNAL/),
    })
    expect(readUpstreamPage(p1)).toBeUndefined()
    // The page before it is unaffected.
    const p0 = withPageSink({ page: 1, limit: 2 } as QueryParams)
    expect(await ids(a, p0)).toEqual([pad(0), pad(1)])
  })

  it('sends first = 1 for a limit below the documented minimum', async () => {
    const calls = fake(orders(3))
    const params = withPageSink({ page: 1, limit: 0 } as QueryParams)
    expect(
      await ids(new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }), params),
    ).toEqual([pad(0)])
    expect(calls[0]!.variables['first']).toBe(1)
  })

  it('does not share cursors between suppliers or environments on one token', async () => {
    fake(orders(7))
    const s1 = new WayfairAdapter({ clientId: 'id', clientSecret: 'secret', supplierId: 1 })
    await ids(s1, withPageSink({ page: 1, limit: 3 } as QueryParams))
    for (const other of [
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret', supplierId: 2 }),
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret', supplierId: 1, sandbox: true }),
    ]) {
      const calls = fake(orders(7))
      await ids(other, withPageSink({ page: 2, limit: 3 } as QueryParams))
      // No remembered cursor: page 2 walks from page 1 again.
      expect(calls).toHaveLength(2)
      expect(calls[0]!.variables['after']).toBeUndefined()
    }
  })

  it('sends only documented arguments: first = limit, after = the previous endCursor, a CREATED_AT sort', async () => {
    const L = 7
    const calls = fake(orders(2 * L + 1))
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    expect(
      await ids(new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }), params),
    ).toEqual(
      orders(2 * L + 1)
        .slice(L, 2 * L)
        .map((r) => r['purchaseOrderNumber']),
    )
    expect(calls).toHaveLength(2)
    expect(calls[0]!.variables['after']).toBeUndefined()
    expect(calls[1]!.variables['after']).toEqual(expect.any(String))
    for (const c of calls) {
      expect(c.baseURL).toBe(PROD)
      expect(c.variables['first']).toBe(L)
      expect(c.variables['sort']).toEqual({ field: 'CREATED_AT', direction: 'ASC' })
      expect(c.variables['filter']).toBeUndefined()
      expect(c.query).toMatch(/query GetDropshipOrders\(/)
      expect(c.headers['Authorization']).toBe('Bearer wf-token')
    }
  })

  it('does not forward v1 arguments or updatedAfter', async () => {
    const calls = fake(orders(3))
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: '2026-09-01T00:00:00Z',
      hasResponse: false,
      sortOrder: 'DESC',
    } as unknown as QueryParams)
    expect(
      await ids(new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }), params),
    ).toHaveLength(3)
    expect(Object.keys(calls[0]!.variables).sort()).toEqual(['first', 'sort'])
  })

  it('clamps a limit above 250, reports the size sent, and still serves every order', async () => {
    const rows = orders(2 * MAX + 1)
    const calls = fake(rows)
    const a = new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' })
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink({ page, limit: 500 } as QueryParams)
      seen.push(...(await ids(a, params)))
      const meta = readUpstreamPage(params)
      expect(meta?.pageSize).toBe(MAX)
      if (!meta?.hasMore) break
    }
    expect(seen).toEqual(rows.map((r) => r['purchaseOrderNumber']))
    for (const c of calls) expect(c.variables['first']).toBe(MAX)
  })

  it('does not report a pageSize when the limit fits', async () => {
    fake(orders(3))
    const params = withPageSink({ page: 1, limit: 250 } as QueryParams)
    await ids(new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }), params)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('declares the documented maximum so the router asks for at most 250', async () => {
    const rows = orders(260)
    fake(rows)
    const a = new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' })
    expect(a.capabilities.maxPageSize).toBe(MAX)
    const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
    const r1 = listPage(await a.listOrders(CREDS, p1), p1, 'wayfair')
    expect(r1.data.map((d) => d.id)).toEqual(rows.slice(0, 10).map((r) => r['purchaseOrderNumber']))
    expect(r1.meta.hasMore).toBe(true)
  })

  it('uses the sandbox endpoint and sends WF-Supplier-Id when a supplier is configured', async () => {
    const calls = fake(orders(2))
    const a = new WayfairAdapter({
      clientId: 'id',
      clientSecret: 'secret',
      sandbox: true,
      supplierId: 1234,
    })
    await ids(a, withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(calls[0]!.baseURL).toBe(SANDBOX)
    expect(calls[0]!.headers['WF-Supplier-Id']).toBe('1234')
  })

  it('sends no WF-Supplier-Id when none is configured', async () => {
    const calls = fake(orders(2))
    await ids(
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }),
      withPageSink({ page: 1, limit: 5 } as QueryParams),
    )
    expect('WF-Supplier-Id' in calls[0]!.headers).toBe(false)
  })

  it('returns orders that parse against the canonical OrderSchema', async () => {
    fake(orders(2))
    const out = await new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 5 } as QueryParams),
    )
    for (const o of out) expect(() => OrderSchema.parse(o)).not.toThrow()
  })

  it('does not share cursors between connections', async () => {
    fake(orders(7))
    const a = new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' })
    await ids(a, withPageSink({ page: 1, limit: 3 } as QueryParams))
    const calls = fake(orders(7))
    await ids(a, withPageSink({ page: 2, limit: 3 } as QueryParams))
    // Same connection: page 2 is one request from the remembered cursor.
    expect(calls).toHaveLength(1)
    const other = fake(orders(7))
    await a.listOrders(
      { accessToken: 'another-token' },
      withPageSink({ page: 2, limit: 3 } as QueryParams),
    )
    expect(other).toHaveLength(2)
  })
})

describe('Wayfair getOrder (dropshipOrders filtered on purchaseOrderNumbers)', () => {
  it('reads one order by PO number', async () => {
    const calls = fake(orders(5))
    const o = await new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).getOrder(
      CREDS,
      pad(3),
    )
    expect(o.id).toBe(pad(3))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.baseURL).toBe(PROD)
    expect(calls[0]!.variables).toEqual({ filter: { purchaseOrderNumbers: [pad(3)] }, first: 1 })
  })

  it('turns a NOT_FOUND issue node into a 404', async () => {
    fake(orders(2))
    await expect(
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).getOrder(CREDS, 'CS99999999'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('surfaces any other issue code as an error naming it', async () => {
    fake([issueNode('CS30000000', 'INTERNAL')])
    await expect(
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).getOrder(CREDS, 'CS30000000'),
    ).rejects.toThrow(/INTERNAL/)
  })
})

describe('Wayfair GraphQL errors', () => {
  function respond(body: unknown) {
    vi.spyOn(axios, 'create').mockReturnValue({
      defaults: {},
      post: vi.fn(async () => ({ data: body })),
    } as never)
  }

  it('serves a page that carries only FORBIDDEN_SCOPE (PII fields nulled)', async () => {
    respond({
      data: {
        dropshipOrders: {
          pageInfo: { hasNextPage: false, endCursor: 'c' },
          edges: [{ node: orderNode('CS10000001') }],
        },
      },
      errors: [
        { message: 'Not entitled to address fields', extensions: { code: 'FORBIDDEN_SCOPE' } },
      ],
    })
    const out = await new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 5 } as QueryParams),
    )
    expect(out.map((o) => o.id)).toEqual(['CS10000001'])
  })

  it('throws on FORBIDDEN_SCOPE when no data came with it', async () => {
    respond({
      data: null,
      errors: [
        { message: 'Not entitled to address fields', extensions: { code: 'FORBIDDEN_SCOPE' } },
      ],
    })
    await expect(
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).listOrders(
        CREDS,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toThrow(/Wayfair GraphQL error: Not entitled/)
  })

  it('does not extend the FORBIDDEN_SCOPE tolerance to v1 writes, which do not document it', async () => {
    respond({
      data: { acceptOrder: { handle: 'h', submittedAt: 's', errors: [] } },
      errors: [{ message: 'forbidden', extensions: { code: 'FORBIDDEN_SCOPE' } }],
    })
    await expect(
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).updateOrder(CREDS, 'CS1', {}),
    ).rejects.toThrow(/Wayfair GraphQL error: forbidden/)
  })

  it('throws on any other error', async () => {
    respond({
      data: null,
      errors: [{ message: 'first cannot exceed 250.', extensions: { code: 'REQUEST_TOO_LARGE' } }],
    })
    await expect(
      new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).listOrders(
        CREDS,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toThrow(/first cannot exceed 250/)
  })
})

describe('Wayfair writes stay on the v1 Purchase Order API', () => {
  it('updateOrder posts to the v1 endpoint', async () => {
    const calls: string[] = []
    vi.spyOn(axios, 'create').mockImplementation(((config: { baseURL: string }) => ({
      defaults: {},
      post: vi.fn(async () => {
        calls.push(config.baseURL)
        return { data: { data: { acceptOrder: { handle: 'h', submittedAt: 's', errors: [] } } } }
      }),
    })) as never)
    await new WayfairAdapter({ clientId: 'id', clientSecret: 'secret' }).updateOrder(
      CREDS,
      'CS1',
      {},
    )
    expect(calls).toEqual([V1])
  })
})
