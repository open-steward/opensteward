/**
 * Stripe end-to-end integration test — the payments vertical's validation run.
 *
 * Exercises the full HTTP stack — auth middleware, routes, adapter, transforms
 * — against a real Stripe TEST-MODE account, and parses every row that comes
 * back through the canonical Zod schema. The routers do not parse adapter
 * output themselves, so this is the only place a transform that emits a
 * schema-invalid row on real data is caught.
 *
 * Requires STRIPE_TEST_KEY (an `sk_test_…` secret key). Skipped silently if
 * unset so `pnpm test` and PRs from forks remain green. Never use a live key.
 *
 *   STRIPE_TEST_KEY=sk_test_… pnpm --filter integration-server exec vitest run tests/integration/stripe.test.ts
 *
 * Seed the account first (Stripe CLI): `stripe trigger customer.created`,
 * `payment_intent.succeeded`, `invoice.paid`, `product.created`, … — an empty
 * resource still proves the call, but not the transform.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { ZodType } from 'zod'
import { buildTestServer, type TestServer } from './helpers'
import { CustomerSchema } from '../../src/verticals/payments/schema/customer'
import { PaymentMethodSchema } from '../../src/verticals/payments/schema/payment-method'
import { ChargeSchema } from '../../src/verticals/payments/schema/charge'
import { RefundSchema } from '../../src/verticals/payments/schema/refund'
import { SubscriptionSchema } from '../../src/verticals/payments/schema/subscription'
import { InvoiceSchema } from '../../src/verticals/payments/schema/invoice'
import { PayoutSchema } from '../../src/verticals/payments/schema/payout'
import { DisputeSchema } from '../../src/verticals/payments/schema/dispute'
import { PlanSchema, PriceSchema, ProductSchema } from '../../src/verticals/payments/schema/plan'
import { BalanceTransactionSchema } from '../../src/verticals/payments/schema/balance-transaction'

const apiKey = process.env['STRIPE_TEST_KEY']
const PLATFORM = 'stripe'
const VERTICAL = 'payments'
const TENANT = 'test-tenant'
let connectionId = ''
let devKey = ''

/** Every list route the payments vertical serves, with its canonical schema. */
const RESOURCES: Array<{ path: string; schema: ZodType }> = [
  { path: 'customers', schema: CustomerSchema },
  { path: 'payment_methods', schema: PaymentMethodSchema },
  { path: 'charges', schema: ChargeSchema },
  { path: 'refunds', schema: RefundSchema },
  { path: 'subscriptions', schema: SubscriptionSchema },
  { path: 'invoices', schema: InvoiceSchema },
  { path: 'payouts', schema: PayoutSchema },
  { path: 'disputes', schema: DisputeSchema },
  { path: 'plans', schema: PlanSchema },
  { path: 'prices', schema: PriceSchema },
  { path: 'products', schema: ProductSchema },
  { path: 'balance_transactions', schema: BalanceTransactionSchema },
]

describe.skipIf(!apiKey)('Stripe integration (test mode)', () => {
  let server: TestServer
  const counts: Record<string, number> = {}

  beforeAll(async () => {
    if (!apiKey!.startsWith('sk_test_') && !apiKey!.startsWith('rk_test_')) {
      throw new Error('STRIPE_TEST_KEY must be a test-mode key (sk_test_… / rk_test_…)')
    }
    server = await buildTestServer()
    // Connect OAuth config is unused on the key path but the constructor reads
    // it, so give the registry an object to hydrate the adapter from.
    const enabled = await server.fastify.inject({
      method: 'POST',
      url: `/admin/platforms/${VERTICAL}/${PLATFORM}/enable`,
      payload: {
        config: {
          clientId: 'ca_placeholder',
          clientSecret: 'placeholder',
          redirectUri: 'http://localhost:3010/auth/payments/stripe/callback',
        },
      },
    })
    if (enabled.statusCode !== 200) throw new Error(`enable failed: ${enabled.body}`)
    // Connect the way an operator does: the headless static-credential route,
    // with a developer key that then reads the data back. The key's tenant
    // owns the connection it mints, so the same key is what a real caller
    // would hold for the /v1 reads below.
    devKey = (
      await server.apiKeys.mint({
        tenantId: TENANT,
        scopes: ['connections:write', 'vertical:payments'],
      })
    ).plaintext
    const connected = await server.fastify.inject({
      method: 'POST',
      url: `/auth/${VERTICAL}/${PLATFORM}/connect`,
      payload: { api_key: apiKey, label: 'Stripe test mode' },
      headers: { authorization: `Bearer ${devKey}` },
    })
    if (connected.statusCode !== 200) throw new Error(`connect failed: ${connected.body}`)
    connectionId = (connected.json() as { data: { id: string } }).data.id
  })

  afterAll(async () => {
    await server?.cleanup()
  })

  const list = (path: string, query = '') =>
    server.fastify.inject({
      method: 'GET',
      url: `/v1/${VERTICAL}/${path}?connection_id=${connectionId}${query}`,
      headers: { authorization: `Bearer ${devKey}` },
    })

  for (const { path, schema } of RESOURCES) {
    it(`lists ${path}, and every row is canonical`, async () => {
      const res = await list(path)
      expect(res.statusCode, res.body).toBe(200)
      const { data } = res.json() as { data: Array<Record<string, unknown>> }
      expect(Array.isArray(data)).toBe(true)
      counts[path] = data.length

      // Report every failing row at once, with the issue paths, rather than
      // stopping at the first — a transform bug usually hits every row.
      const failures = data.flatMap((row) => {
        const parsed = schema.safeParse(row)
        if (parsed.success) return []
        return [
          {
            id: row['id'],
            issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
          },
        ]
      })
      expect(failures).toEqual([])
    })
  }

  it('reaches a second page through Stripe cursors with page/limit', async () => {
    // Any resource with at least two rows will do; the paging helper is
    // shared by all of them.
    const multi = RESOURCES.find((r) => (counts[r.path] ?? 0) >= 2)
    if (!multi) return
    const first = (await list(multi.path, '&limit=1&page=1')).json() as {
      data: Array<{ id: string }>
    }
    const second = (await list(multi.path, '&limit=1&page=2')).json() as {
      data: Array<{ id: string }>
    }
    expect(first.data).toHaveLength(1)
    expect(second.data).toHaveLength(1)
    expect(second.data[0]!.id).not.toBe(first.data[0]!.id)
  })

  it('reports what the account held, so an empty resource is visible', () => {
    // Not an assertion: an empty resource still proves the call and the
    // version pin. The numbers land in the test name output for the reader.
    const summary = Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
    expect(summary.length).toBeGreaterThan(0)
    console.info(`[stripe] ${summary}`)
  })
})
