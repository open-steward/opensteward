/**
 * Stripe issues two credential shapes: a Connect OAuth grant, and a fixed
 * secret / restricted key (`sk_…` / `rk_…`). The second is how every Stripe
 * test-mode account is reached — there is no OAuth ceremony for your own
 * account — so the adapter has to offer a static-credential path alongside
 * OAuth, or `sk_test_` keys have no way in at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StripeAdapter } from '../../../../../../src/verticals/payments/adapters/stripe'

const adapter = new StripeAdapter({
  clientId: 'ca_test_client',
  clientSecret: 'sk_test_platform_secret',
  redirectUri: 'http://localhost:3010/auth/payments/stripe/callback',
})

describe('StripeAdapter — static secret-key connect', () => {
  it('declares a single password field for the secret key', () => {
    const fields = adapter.credentialFields()
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'apiKey', type: 'password', required: true })
  })

  it('exchanges a secret key into the bearer credential StripeClient sends', async () => {
    const creds = await adapter.exchangeCredentials({ apiKey: '  sk_test_51abc  ' })
    expect(creds.accessToken).toBe('sk_test_51abc')
    expect(creds.refreshToken).toBeUndefined()
  })

  it('rejects an empty key with a message naming the field', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: '' })).rejects.toThrow(/required/i)
  })

  it('keeps the Connect OAuth path — the two coexist', () => {
    const url = adapter.getAuthUrl('state-1')
    expect(url).toContain('connect.stripe.com/oauth/authorize')
    expect(url).toContain('client_id=ca_test_client')
    expect(url).toContain('state=state-1')
  })
})

// ── List paging against Stripe's cursor API ──────────────────────────────────
//
// Every caller speaks `{ page, limit }`; Stripe speaks `starting_after` and
// caps a request at 100 rows, silently. The sync worker asks for 500 and
// stops on a short page, so an adapter that forwards `limit` verbatim syncs
// exactly 100 rows of everything and calls it done.

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/stripe/client', () => ({
  StripeClient: class {
    list = listMock
    get = vi.fn()
    post = vi.fn()
    delete = vi.fn()
  },
}))

const creds = { accessToken: 'sk_test_x' }

/** `n` raw customers with ids cus_<from>…cus_<from+n-1>. */
function customers(from: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `cus_${from + i}`, object: 'customer' }))
}

/** A Stripe list body. */
function page<T>(data: T[], hasMore: boolean) {
  return { object: 'list', data, has_more: hasMore, url: '/v1/x' }
}

/**
 * Serve `total` customers in Stripe order, honouring `limit` (capped at 100)
 * and `starting_after`, the way the real API does.
 */
function serveCustomers(total: number) {
  listMock.mockImplementation(async (_path: string, params: Record<string, unknown>) => {
    const all = customers(1, total)
    const after = params['starting_after'] as string | undefined
    const start = after ? all.findIndex((c) => c.id === after) + 1 : 0
    const limit = Math.min(Number(params['limit']), 100)
    const data = all.slice(start, start + limit)
    return page(data, start + limit < total)
  })
}

describe('StripeAdapter list paging', () => {
  beforeEach(() => {
    listMock.mockReset()
  })

  it('walks 100-row Stripe pages to honour a larger limit', async () => {
    serveCustomers(250)
    const rows = await adapter.listCustomers(creds, { page: 1, limit: 250 })
    expect(rows).toHaveLength(250)
    expect(rows[0]!.id).toBe('cus_1')
    expect(rows[249]!.id).toBe('cus_250')
    expect(listMock).toHaveBeenCalledTimes(3)
    expect(listMock.mock.calls[0]![1]).toMatchObject({ limit: 100 })
    expect(listMock.mock.calls[0]![1]).not.toHaveProperty('starting_after')
    expect(listMock.mock.calls[1]![1]).toMatchObject({ limit: 100, starting_after: 'cus_100' })
    expect(listMock.mock.calls[2]![1]).toMatchObject({ limit: 50, starting_after: 'cus_200' })
  })

  it('reaches page N by skipping the rows before it', async () => {
    serveCustomers(250)
    const rows = await adapter.listCustomers(creds, { page: 2, limit: 100 })
    expect(rows.map((r) => r.id)).toEqual(customers(101, 100).map((c) => c.id))
    expect(listMock).toHaveBeenCalledTimes(2)
  })

  it('returns the tail on the last page and nothing past it', async () => {
    serveCustomers(250)
    expect(await adapter.listCustomers(creds, { page: 3, limit: 100 })).toHaveLength(50)
    expect(await adapter.listCustomers(creds, { page: 4, limit: 100 })).toHaveLength(0)
  })

  it('stops on a short page rather than asking again', async () => {
    serveCustomers(30)
    const rows = await adapter.listCustomers(creds, { page: 1, limit: 500 })
    expect(rows).toHaveLength(30)
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('coerces the strings the router passes through from the query', async () => {
    serveCustomers(5)
    const rows = await adapter.listCustomers(creds, { page: '2', limit: '2' } as never)
    expect(rows.map((r) => r.id)).toEqual(['cus_3', 'cus_4'])
  })

  it('passes an explicit cursor straight through as one Stripe page', async () => {
    serveCustomers(250)
    const rows = await adapter.listCustomers(creds, { cursor: 'cus_100', limit: 500 })
    expect(rows).toHaveLength(100)
    expect(rows[0]!.id).toBe('cus_101')
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(listMock.mock.calls[0]![1]).toMatchObject({ starting_after: 'cus_100', limit: 100 })
  })
})

// ── Payment methods hang off customers ──────────────────────────────────────

describe('StripeAdapter.listPaymentMethods', () => {
  beforeEach(() => {
    listMock.mockReset()
  })

  const pm = (id: string, customer: string) => ({
    id,
    object: 'payment_method',
    type: 'card',
    customer,
    card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
  })

  it('walks every customer when no customer is given, as the sync worker does', async () => {
    listMock.mockImplementation(async (path: string) => {
      if (path === '/customers') return page(customers(1, 2), false)
      if (path === '/customers/cus_1/payment_methods') {
        return page([pm('pm_a', 'cus_1'), pm('pm_b', 'cus_1')], false)
      }
      if (path === '/customers/cus_2/payment_methods') return page([], false)
      throw new Error(`unexpected path ${path}`)
    })
    const rows = await adapter.listPaymentMethods(creds, { page: 1, limit: 500 })
    expect(rows.map((r) => r.id)).toEqual(['pm_a', 'pm_b'])
    expect(rows[0]!.customerId).toBe('cus_1')
    expect(listMock.mock.calls.map((c) => c[0])).toEqual([
      '/customers',
      '/customers/cus_1/payment_methods',
      '/customers/cus_2/payment_methods',
    ])
  })

  it('lists one customer directly when asked for one', async () => {
    listMock.mockResolvedValueOnce(page([pm('pm_z', 'cus_9')], false))
    const rows = await adapter.listPaymentMethods(creds, { customer_id: 'cus_9' })
    expect(rows.map((r) => r.id)).toEqual(['pm_z'])
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(listMock.mock.calls[0]![0]).toBe('/customers/cus_9/payment_methods')
  })
})
