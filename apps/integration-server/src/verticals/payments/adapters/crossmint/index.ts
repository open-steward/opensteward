/**
 * Crossmint adapter — payments vertical (crypto + fiat checkout / onramp).
 *
 * Crossmint's checkout is order-centric: a headless **Order** carries the
 * amount, currency, payment method/status, recipient, and the quote → payment
 * → delivery lifecycle, so it maps onto the canonical **Charge**. The buyer is
 * the order's recipient (email and/or destination wallet) — Crossmint has no
 * standalone customer object — so customer/payment-method resources are left
 * off (they auto-501).
 *
 * Auth: a single server-side API key in the `X-API-KEY` header. The key prefix
 * (`sk_staging_…` vs `sk_production_…`) selects the environment, so the client
 * derives the base URL from it; there's no OAuth flow (getAuthUrl/exchangeCode
 * throw — the key is submitted via the Connect Link form).
 *
 * Webhooks: Svix-signed (`svix-*` headers, `whsec_` secret) — see webhook.ts.
 *
 * Methods deliberately left off (auto-501): list charges (Crossmint orders are
 * fetch-by-id only — there's no list endpoint), createCharge (creating a
 * Crossmint order needs line-items / a collection locator that the canonical
 * Charge doesn't model), refunds (no refund endpoint), customers, payment
 * methods, subscriptions, invoices, payouts, disputes, plans/prices/products,
 * and balance transactions — Crossmint does not expose them.
 *
 * Docs: https://docs.crossmint.com/api-reference/introduction
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   charge
// Unavailable: balance-transaction — no balance/ledger API; wallet transactions are on-chain execution records, not accounting entries
// Unavailable: customer — no standalone customer object; buyer identity is embedded per-order as recipient email/wallet
// Unavailable: dispute — no disputes API; blockchain payments are irreversible, chargebacks handled outside the platform
// Unavailable: invoice — no invoice API; checkout is order-centric with no separate invoicing surface
// Unavailable: payment-method — no stored payment-method objects; card/crypto details captured per-order only
// Unavailable: payout — stablecoin wallet transfers exist but are on-chain transactions, not canonical payout objects
// Unavailable: plan — no plan/price/product catalog; subscription pricing is per-NFT-collection, not reusable plan records
// Unavailable: refund — no refund endpoint; blockchain payments are irreversible
// Unavailable: subscription — only a cancel endpoint exists (PATCH /subscriptions/{locator}/cancel); no list or get endpoint

import type { BaseAdapter, Credentials } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { WebhookEvent } from '../../schema/webhook'

import { orderPath } from './constants'
import { CROSSMINT_CREDENTIAL_FORM } from './auth'
import { CrossmintClient } from './client'
import { parseCrossmintWebhookEvents, verifyCrossmintWebhook } from './webhook'

import { transformCharge, type RawCrossmintOrder } from './transform/charge'

export class CrossmintAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'crossmint'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form (X-API-KEY).
  credentialFields = CROSSMINT_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CROSSMINT_CREDENTIAL_FORM.exchangeCredentials

  getAuthUrl(): string {
    throw new Error('Crossmint uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Crossmint uses an API key; call exchangeCredentials instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Crossmint API keys don't expire — return as-is.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCrossmintWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCrossmintWebhookEvents(payload)
  }

  private client(credentials: Credentials): CrossmintClient {
    return new CrossmintClient(credentials)
  }

  // ── Charges (Crossmint Orders) ──────────────────────────────────────────────
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawCrossmintOrder>(orderPath(id))
    return transformCharge(res ?? {})
  }
}
