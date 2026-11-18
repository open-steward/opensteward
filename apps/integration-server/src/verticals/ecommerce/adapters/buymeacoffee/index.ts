import { simpleApiKey } from '@opensteward/shared'
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: collection   — no collection concept; creator-tip platform has no product grouping API.
// Unavailable: discount     — no discount or promo-code API.
// Unavailable: fulfillment  — instant digital delivery; no fulfillment-tracking endpoint.
// Unavailable: inventory    — digital goods only; no stock level or inventory endpoint.
// Unavailable: location     — digital platform; no physical warehouse or location concept.
// Unavailable: refund       — no public refund API; is_refunded flag is the only signal.
// Unavailable: transaction  — no separate transaction resource; data embedded in supporter/subscription records.
/**
 * Buy Me a Coffee adapter for the ecommerce vertical.
 *
 * Buy Me a Coffee is a creator monetization platform. Creators receive
 * one-time tips ("coffees"), recurring memberships, and sell digital shop
 * items ("extras").
 *
 * Slug: `buymeacoffee` (both directory and platform identifier).
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 * Buy Me a Coffee uses a personal access token — no OAuth2 flow. Set
 * `credentials.accessToken` to the token from Settings → API in the
 * Buy Me a Coffee dashboard. The token is long-lived; no refresh is needed.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented (9):
 *
 *   Products:     listProducts, getProduct        (Extras API)
 *   Orders:       listOrders, getOrder            (Supporters + Subscriptions APIs)
 *   Customers:    listCustomers, getCustomer      (derived from supporters/subscribers)
 *   Auth stubs:   getAuthUrl, exchangeCode, refreshCredentials
 *
 * Omitted (33) — the registry returns HTTP 501 automatically:
 *
 *   Product CUD (3)       — no write API for extras.
 *   Variants (5)          — digital items have no SKU variants.
 *   Collections (5)       — no collection concept.
 *   Locations (2)         — digital delivery; no warehouses.
 *   Inventory (4)         — no stock levels for digital goods.
 *   Fulfillments (5)      — instant digital delivery; no fulfillment tracking.
 *   Customer CUD (3)      — supporters/subscribers are read-only.
 *   Order CUD/Cancel (4)  — no order write API.
 *   Refunds (3)           — no public refund API.
 *   Transactions (3)      — no separate transaction resource.
 *   Discounts (5)         — no discount/promo-code API.
 *   Webhooks (2)          — not implemented (no public webhook signing).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'
import type { Customer } from '../../schema/customer'

import { BmacClient } from './client'
import { transformExtra, type BmacExtra } from './transform/product'
import {
  transformSupporter,
  transformSubscription,
  type BmacSupporter,
  type BmacSubscription,
} from './transform/order'
import {
  transformSupporterAsCustomer,
  transformSubscriptionAsCustomer,
} from './transform/customer'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BuyMeACoffeeAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'buymeacoffee'
  readonly version = '0.1.0'

  // ── Auth stubs ─────────────────────────────────────────────────────────────
  // Buy Me a Coffee uses a personal access token — no OAuth2 flows needed.

  getAuthUrl(_state: string): string {
    throw new Error(
      'Buy Me a Coffee uses a personal access token — no OAuth URL. ' +
        'Copy your token from Settings → API in the BMAC dashboard.',
    )
  }

  async exchangeCode(
    _code: string,
    _redirectUri: string,
  ): Promise<Credentials> {
    throw new Error(
      'Buy Me a Coffee uses a personal access token — no code exchange. ' +
        'Set credentials.accessToken directly.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Personal access tokens are long-lived — return credentials unchanged.
    return credentials
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): BmacClient {
    return new BmacClient(credentials)
  }

  // ── Products (Extras API) ──────────────────────────────────────────────────

  /**
   * List all Buy Me a Coffee shop items (extras) as canonical Products.
   *
   * Supports `params.page` (default 1) for pagination.
   */
  async listProducts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const page = typeof params.page === 'number' ? params.page : 1
    const extras = await client.listItems<BmacExtra>('/extras', { page })
    return extras.map(transformExtra)
  }

  /**
   * Get a single extra by its numeric id (stringified).
   *
   * Buy Me a Coffee has no single-item GET endpoint — we fetch the page that
   * would contain the id and find it by linear scan.
   *
   * Implementation note: we fetch page 1 and search. For large catalogues,
   * callers should use `listProducts` and search client-side.
   */
  async getProduct(
    credentials: Credentials,
    id: string,
    params: QueryParams = {},
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const page = typeof params.page === 'number' ? params.page : 1
    const envelope = await client.getList<BmacExtra>('/extras', { page })
    const allExtras = envelope.data ?? []

    const found = allExtras.find((e) => String(e.extra_id) === id)
    if (!found) {
      throw new Error(
        `BuyMeACoffeeAdapter getProduct: no extra with id="${id}" found on page ${page}. ` +
          'Try a different page value via params.page.',
      )
    }
    return transformExtra(found)
  }

  // ── Orders (Supporters + Subscriptions APIs) ───────────────────────────────

  /**
   * List orders from both the supporters and subscriptions APIs.
   *
   * Supporters (one-time tips) and subscriptions (memberships) are both
   * surfaced as canonical Orders for a unified revenue view.
   *
   * Supports `params.page` (default 1).
   */
  async listOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const page = typeof params.page === 'number' ? params.page : 1

    const [supporters, subscriptions] = await Promise.all([
      client.listItems<BmacSupporter>('/supporters', { page }),
      client.listItems<BmacSubscription>('/subscriptions', { page }),
    ])

    const supporterOrders: Order[] = supporters.map(transformSupporter)
    const subscriptionOrders: Order[] = subscriptions.map(transformSubscription)

    return [...supporterOrders, ...subscriptionOrders]
  }

  /**
   * Get a single order by its id.
   *
   * BMAC has no single-item GET for supporters or subscriptions. We search
   * the first page of each list. Prefix the id with `sub_` to indicate a
   * subscription; otherwise we search supporters first.
   *
   * Convention: subscription ids are stored as `String(subscription_id)`,
   * supporter ids as `String(support_id)`. Both are plain integers — the
   * caller differentiates via params.type = 'subscription' | 'supporter'.
   */
  async getOrder(
    credentials: Credentials,
    id: string,
    params: QueryParams = {},
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const page = typeof params.page === 'number' ? params.page : 1
    const type = params['type'] as string | undefined

    if (type === 'subscription') {
      const subs = await client.listItems<BmacSubscription>('/subscriptions', {
        page,
      })
      const found = subs.find((s) => String(s.subscription_id) === id)
      if (!found) {
        throw new Error(
          `BuyMeACoffeeAdapter getOrder: no subscription with id="${id}" on page ${page}.`,
        )
      }
      return transformSubscription(found)
    }

    // Default: search supporters
    const supporters = await client.listItems<BmacSupporter>('/supporters', {
      page,
    })
    const found = supporters.find((s) => String(s.support_id) === id)
    if (!found) {
      throw new Error(
        `BuyMeACoffeeAdapter getOrder: no supporter with id="${id}" on page ${page}. ` +
          'Pass params.type = "subscription" to search subscriptions instead.',
      )
    }
    return transformSupporter(found)
  }

  // ── Customers (derived from supporters + subscribers) ─────────────────────

  /**
   * List unique customers derived from supporters and subscribers.
   *
   * Deduplication key: email address (if present), otherwise the raw record id.
   * Supporters appear before subscribers in the output.
   *
   * Supports `params.page` (default 1).
   */
  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const page = typeof params.page === 'number' ? params.page : 1

    const [supporters, subscriptions] = await Promise.all([
      client.listItems<BmacSupporter>('/supporters', { page }),
      client.listItems<BmacSubscription>('/subscriptions', { page }),
    ])

    const seen = new Set<string>()
    const customers: Customer[] = []

    for (const s of supporters) {
      const key =
        s.payer_email ??
        s.supporter_email ??
        s.support_email ??
        String(s.support_id)
      if (seen.has(key)) continue
      seen.add(key)
      customers.push(transformSupporterAsCustomer(s))
    }

    for (const s of subscriptions) {
      const key = s.subscriber_email ?? String(s.subscription_id)
      if (seen.has(key)) continue
      seen.add(key)
      customers.push(transformSubscriptionAsCustomer(s))
    }

    return customers
  }

  /**
   * Get a single customer by email or record id.
   *
   * Searches supporters first (by payer_email), then subscriptions (by
   * subscriber_email). Falls back to matching by stringified record id.
   */
  async getCustomer(
    credentials: Credentials,
    id: string,
    params: QueryParams = {},
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const page = typeof params.page === 'number' ? params.page : 1

    const [supporters, subscriptions] = await Promise.all([
      client.listItems<BmacSupporter>('/supporters', { page }),
      client.listItems<BmacSubscription>('/subscriptions', { page }),
    ])

    // Search supporters by email or id
    const supporterMatch = supporters.find(
      (s) =>
        s.payer_email === id ||
        s.supporter_email === id ||
        s.support_email === id ||
        String(s.support_id) === id,
    )
    if (supporterMatch) return transformSupporterAsCustomer(supporterMatch)

    // Search subscriptions by email or id
    const subscriptionMatch = subscriptions.find(
      (s) => s.subscriber_email === id || String(s.subscription_id) === id,
    )
    if (subscriptionMatch)
      return transformSubscriptionAsCustomer(subscriptionMatch)

    throw new Error(
      `BuyMeACoffeeAdapter getCustomer: no supporter or subscriber with id="${id}" on page ${page}.`,
    )
  }
}
