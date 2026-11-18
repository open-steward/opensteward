/**
 * Stitch adapter: GraphQL request shape, client-credentials auth, and paging.
 *
 *   POST https://api.stitch.money/graphql  { query, variables }
 *   client.paymentInitiationRequests(first, after, filter) — "up to a maximum of
 *     2000 payment requests" (https://docs.stitch.money/api/objects/client)
 *   client.disbursements(first, after, filter)
 *   Relay paging: "So long as the value of hasNextPage is true, then you can continue
 *   requesting more records from the API, with the next page starting at the cursor
 *   value returned for endCursor." (https://docs.stitch.money/graphql/pagination)
 *   node(id:) for single reads (documented GetDisbursementStatus / GetPaymentRequestStatus).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { StitchAdapter } from '../../../../../../src/verticals/payments/adapters/stitch/index'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'

const CREDS: Credentials = {
  accessToken: 'tok_a',
  extra: { clientId: 'test-client-a', clientSecret: 'secret-a' },
}

interface Sent {
  url: string
  query: string
  variables: Record<string, unknown>
  auth: string
}

const ids = (p: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${p}_${String(i + 1).padStart(4, '0')}`)

function gqlError(message: string) {
  return { data: { errors: [{ message }] } }
}

/** Opaque cursors bound to the walk (token, first, filter) that minted them. */
const enc = (s: object) => Buffer.from(JSON.stringify(s)).toString('base64')
const dec = (c: string) =>
  JSON.parse(Buffer.from(c, 'base64').toString()) as Record<string, unknown>

function fakeStitch(n: number) {
  const sent: Sent[] = []
  const paymentRequests = ids('pir', n).map((id, i) => ({
    id,
    created: `2026-01-${String((i % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
    updated: `2026-02-${String((i % 27) + 1).padStart(2, '0')}T10:00:00.000Z`,
    amount: { currency: 'ZAR', quantity: `${i + 1}.50` },
    beneficiaryReference: 'KombuchaFizz',
    state: { __typename: 'PaymentInitiationRequestPending' },
    _i: i,
  }))
  const disbursements = ids('dsb', n).map((id, i) => ({
    id,
    created: '2022-10-06T15:03:08.436Z',
    amount: { currency: 'ZAR', quantity: '1' },
    nonce: `nonce-${i}`,
    beneficiaryReference: 'example-ref',
    status: { __typename: 'DisbursementPending', date: '2022-10-06T15:03:08.694Z' },
  }))

  function connection<T extends { id: string }>(
    field: string,
    rows: T[],
    vars: Record<string, unknown>,
    auth: string,
    max: number | null,
  ) {
    const first = vars.first
    if (typeof first !== 'number' || !Number.isInteger(first) || first < 1)
      return gqlError(`${field}: bad first`)
    if (max !== null && first > max) return gqlError(`${field}: first exceeds ${max}`)
    const walk = { a: auth, f: first, q: JSON.stringify(vars.filter ?? null), field }
    let offset = 0
    if (vars.after !== undefined) {
      const c = dec(String(vars.after))
      if (c.a !== walk.a || c.f !== walk.f || c.q !== walk.q || c.field !== field)
        return gqlError('cursor from another walk')
      offset = Number(c.o)
    }
    const page = rows.slice(offset, offset + first)
    const end = offset + page.length
    return {
      data: {
        data: {
          client: {
            [field]: {
              edges: page.map((node) => ({
                node,
                cursor: enc({ ...walk, o: rows.indexOf(node) + 1 }),
              })),
              pageInfo: {
                hasNextPage: end < rows.length,
                endCursor: page.length ? enc({ ...walk, o: end }) : null,
              },
            },
          },
        },
      },
    }
  }

  const post = vi.fn(
    async (
      url: string,
      body: { query: string; variables: Record<string, unknown> },
      auth: string,
    ) => {
      const { query, variables } = body
      sent.push({ url, query, variables: { ...variables }, auth })
      if (
        /paymentInitiationRequests\(first: \$first, after: \$after, filter: \$filter\)/.test(query)
      ) {
        const allowed = new Set(['first', 'after', 'filter'])
        const extra = Object.keys(variables).filter((k) => !allowed.has(k))
        if (extra.length) return gqlError(`unknown variables ${extra.join(',')}`)
        let rows = paymentRequests
        const gte = (variables.filter as { updated?: { gte?: string } } | undefined)?.updated?.gte
        if (variables.filter !== undefined && gte === undefined)
          return gqlError('unsupported filter')
        if (gte !== undefined) rows = rows.filter((r) => r.updated >= gte)
        return connection(
          'paymentInitiationRequests',
          rows.map(({ _i, ...r }) => r),
          variables,
          auth,
          2000,
        )
      }
      if (/disbursements\(first: \$first, after: \$after\)/.test(query)) {
        const extra = Object.keys(variables).filter((k) => k !== 'first' && k !== 'after')
        if (extra.length) return gqlError(`unknown variables ${extra.join(',')}`)
        return connection('disbursements', disbursements, variables, auth, null)
      }
      if (/node\(id: \$id\)/.test(query)) {
        const id = String(variables.id)
        const pr = paymentRequests.find((r) => r.id === id)
        if (pr && /\.\.\. on PaymentInitiationRequest \{/.test(query)) {
          const { _i, ...rest } = pr
          return { data: { data: { node: { __typename: 'PaymentInitiationRequest', ...rest } } } }
        }
        const d = disbursements.find((r) => r.id === id)
        if (d && /\.\.\. on Disbursement \{/.test(query))
          return { data: { data: { node: { __typename: 'Disbursement', ...d } } } }
        if (pr) return { data: { data: { node: { __typename: 'PaymentInitiationRequest' } } } }
        if (d) return { data: { data: { node: { __typename: 'Disbursement' } } } }
        return { data: { data: { node: null } } }
      }
      return gqlError('unrecognised query')
    },
  )

  const create = vi.spyOn(axios, 'create').mockImplementation(((config?: {
    baseURL?: string
    headers?: Record<string, unknown>
  }) => {
    const auth = String(config?.headers?.Authorization ?? '')
    return {
      post: (path: string, body: { query: string; variables: Record<string, unknown> }) =>
        post(`${config?.baseURL ?? ''}${path}`, body, auth),
    }
  }) as never)
  return { sent, create }
}

async function callPage(
  adapter: StitchAdapter,
  method: 'listCharges' | 'listPayouts',
  page: number,
  limit: number,
  extra: Partial<QueryParams> = {},
  creds: Credentials = CREDS,
) {
  const params = withPageSink({ page, limit, ...extra } as QueryParams)
  const items = (await adapter[method](creds, params)) as Array<{ id: string }>
  return {
    ids: items.map((i) => i.id),
    hasMore: readUpstreamPage(params)?.hasMore,
    meta: readUpstreamPage(params),
    items,
  }
}

beforeEach(() => {
  _resetCursorPager()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Stitch GraphQL request shape', () => {
  it('POSTs a query document to https://api.stitch.money/graphql with the client token', async () => {
    const { sent } = fakeStitch(3)
    await callPage(new StitchAdapter(), 'listCharges', 1, 2)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('https://api.stitch.money/graphql')
    expect(sent[0]!.auth).toBe('Bearer tok_a')
    expect(sent[0]!.variables).toEqual({ first: 2 })
  })

  it('throws on a GraphQL errors envelope instead of returning an empty page', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      post: async () => gqlError('UNAUTHENTICATED'),
    })) as never)
    await expect(new StitchAdapter().listCharges(CREDS, { page: 1, limit: 5 })).rejects.toThrow(
      /UNAUTHENTICATED/,
    )
  })

  it('updatedAfter becomes the documented filter { updated: { gte } } on payment requests', async () => {
    const { sent } = fakeStitch(10)
    const since = new Date('2026-02-05T00:00:00.000Z')
    const r = await callPage(new StitchAdapter(), 'listCharges', 1, 50, { updatedAfter: since })
    expect(sent[0]!.variables).toEqual({
      first: 50,
      filter: { updated: { gte: since.toISOString() } },
    })
    expect(r.ids).toEqual(ids('pir', 10).slice(4))
  })

  it('a different updatedAfter starts a fresh walk instead of reusing a cursor minted under another filter', async () => {
    fakeStitch(10)
    const a = new StitchAdapter()
    await callPage(a, 'listCharges', 1, 2, { updatedAfter: new Date('2026-02-02T00:00:00.000Z') })
    const r = await callPage(a, 'listCharges', 2, 2, {
      updatedAfter: new Date('2026-02-05T00:00:00.000Z'),
    })
    expect(r.ids).toEqual(ids('pir', 10).slice(6, 8))
  })

  it('listPayouts sends only first/after (DisbursementFilterInput has no updated date)', async () => {
    const { sent } = fakeStitch(3)
    await callPage(new StitchAdapter(), 'listPayouts', 1, 5, {
      updatedAfter: new Date('2026-01-01T00:00:00Z'),
    })
    expect(sent[0]!.variables).toEqual({ first: 5 })
    expect(sent[0]!.query).toMatch(/client \{\s*disbursements\(first: \$first, after: \$after\)/)
  })

  it('clamps first to the documented maximum of 2000 and reports the size sent', async () => {
    const { sent } = fakeStitch(3)
    const r = await callPage(new StitchAdapter(), 'listCharges', 1, 5000)
    expect(sent[0]!.variables.first).toBe(2000)
    expect(r.meta?.pageSize).toBe(2000)
  })

  it('clamps disbursements first to the documented default page size of 500 and reports it', async () => {
    const { sent } = fakeStitch(3)
    const r = await callPage(new StitchAdapter(), 'listPayouts', 1, 2000)
    expect(sent[0]!.variables.first).toBe(500)
    expect(r.meta?.pageSize).toBe(500)
  })

  it('throws on a 200 body with neither data nor errors', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      post: async () => ({ data: {} }),
    })) as never)
    await expect(new StitchAdapter().listCharges(CREDS, { page: 1, limit: 5 })).rejects.toThrow(
      /no data/,
    )
  })

  it('a connection without the client pair is 401 REAUTH_REQUIRED on every read, before any request', async () => {
    const { sent } = fakeStitch(3)
    const old: Credentials = { accessToken: 'user_token' }
    const a = new StitchAdapter()
    for (const call of [
      () => a.listCharges(old, { page: 1, limit: 2 }),
      () => a.listPayouts(old, { page: 1, limit: 2 }),
      () => a.getCharge(old, 'pir_0001'),
      () => a.getPayout(old, 'dsb_0001'),
    ])
      await expect(call()).rejects.toMatchObject({ statusCode: 401, code: 'REAUTH_REQUIRED' })
    expect(sent).toHaveLength(0)
  })

  it('rows parse against the canonical schemas', async () => {
    fakeStitch(3)
    const c = await callPage(new StitchAdapter(), 'listCharges', 1, 3)
    for (const row of c.items) ChargeSchema.parse(row)
    expect((c.items[1] as unknown as { amount: number }).amount).toBe(250)
    const p = await callPage(new StitchAdapter(), 'listPayouts', 1, 3)
    for (const row of p.items) PayoutSchema.parse(row)
  })
})

describe.each([
  ['listCharges', 'pir'],
  ['listPayouts', 'dsb'],
] as const)('Stitch %s paging (Relay first/after)', (method, prefix) => {
  it('serves 2L+1 rows over three pages, each id once, with exact hasMore', async () => {
    const L = 3
    fakeStitch(2 * L + 1)
    const a = new StitchAdapter()
    const p1 = await callPage(a, method, 1, L)
    const p2 = await callPage(a, method, 2, L)
    const p3 = await callPage(a, method, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(ids(prefix, 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    const p4 = await callPage(a, method, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('page 2 sends after = page 1 endCursor; a cold page 3 walks from page 1', async () => {
    const L = 2
    const { sent } = fakeStitch(7)
    const p3 = await callPage(new StitchAdapter(), method, 3, L)
    expect(p3.ids).toEqual(ids(prefix, 7).slice(4, 6))
    expect(p3.hasMore).toBe(true)
    expect(sent.map((s) => s.variables.after === undefined)).toEqual([true, false, false])
    expect(sent.every((s) => s.variables.first === L)).toBe(true)
  })

  it('an exact multiple of L ends on hasNextPage=false, not a short page', async () => {
    const L = 3
    fakeStitch(2 * L)
    const a = new StitchAdapter()
    const p2 = await callPage(a, method, 2, L)
    expect(p2.ids).toEqual(ids(prefix, 2 * L).slice(L))
    expect(p2.hasMore).toBe(false)
  })

  it('a different limit starts a fresh walk instead of reusing a cursor minted under another first', async () => {
    fakeStitch(9)
    const a = new StitchAdapter()
    await callPage(a, method, 1, 2)
    const r = await callPage(a, method, 2, 3)
    expect(r.ids).toEqual(ids(prefix, 9).slice(3, 6))
  })

  it('keys walks per connection: another client_id does not reuse a cursor', async () => {
    const L = 2
    fakeStitch(5)
    const a = new StitchAdapter()
    await callPage(a, method, 1, L)
    const other: Credentials = {
      accessToken: 'tok_b',
      extra: { clientId: 'test-client-b', clientSecret: 's' },
    }
    const r = await callPage(a, method, 2, L, {}, other)
    expect(r.ids).toEqual(ids(prefix, 5).slice(2, 4))
  })
})

describe('Stitch single reads (node(id:))', () => {
  it('getCharge reads a PaymentInitiationRequest node', async () => {
    const { sent } = fakeStitch(3)
    const c = await new StitchAdapter().getCharge(CREDS, 'pir_0002')
    expect(sent[0]!.variables).toEqual({ id: 'pir_0002' })
    expect(ChargeSchema.parse(c).id).toBe('pir_0002')
  })

  it('getPayout reads a Disbursement node', async () => {
    fakeStitch(3)
    const p = await new StitchAdapter().getPayout(CREDS, 'dsb_0003')
    expect(PayoutSchema.parse(p).id).toBe('dsb_0003')
  })

  it('a missing node or a node of another type is 404', async () => {
    fakeStitch(3)
    const a = new StitchAdapter()
    await expect(a.getCharge(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getCharge(CREDS, 'dsb_0001')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getPayout(CREDS, 'pir_0001')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('Stitch client-credentials auth', () => {
  it('exchangeCredentials POSTs the documented form body to /connect/token', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        access_token: 'udfc_x',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'client_paymentrequest',
      },
    } as never)
    const creds = await new StitchAdapter().exchangeCredentials({
      clientId: ' cid ',
      clientSecret: 'sec',
    })
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, cfg] = post.mock.calls[0]!
    expect(url).toBe('https://secure.stitch.money/connect/token')
    expect(Object.fromEntries(new URLSearchParams(String(body)))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cid',
      scope: 'client_paymentrequest client_disbursement',
      audience: 'https://secure.stitch.money/connect/token',
      client_secret: 'sec',
    })
    expect((cfg as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(creds.accessToken).toBe('udfc_x')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec' })
    expect(creds.expiresAt).toBeInstanceOf(Date)
  })

  it('refreshCredentials re-mints from the stored pair', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'udfc_y', expires_in: 3600 } } as never)
    const next = await new StitchAdapter().refreshCredentials(CREDS)
    expect(next.accessToken).toBe('udfc_y')
    expect(new URLSearchParams(String(post.mock.calls[0]![1])).get('client_id')).toBe(
      'test-client-a',
    )
  })

  it('rejects a missing client id or secret without a request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(new StitchAdapter().exchangeCredentials({ clientId: 'x' })).rejects.toThrow(
      /required/,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuthUrl refuses: there is no authorization-code flow for client tokens', () => {
    expect(() => new StitchAdapter().getAuthUrl()).toThrow(/client credentials/)
  })
})
