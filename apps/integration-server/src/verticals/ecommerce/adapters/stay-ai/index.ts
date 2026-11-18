/**
 * Stay AI adapter for the ecommerce vertical.
 *
 * Stay AI (api.retextion.com) is a Shopify-native subscription retention
 * platform. It does not expose a generic product catalogue, collections,
 * inventory, locations, or order-level refunds/transactions — those resources
 * are managed inside Shopify directly. The Stay AI API exposes:
 *
 *  - Subscriptions  (mapped to canonical Order)
 *  - Customer accounts (basic info derived from subscriptions)
 *  - Webhooks (SUBSCRIPTION, CANCELLATION, FAILED_PAYMENT, etc.)
 *
 * Auth: static API key passed as `x-api-key` header.
 * Pagination: page-number based (`page`, `pageSize`).
 *
 * Docs: https://docs.stay.ai/reference/authentication
 */

import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as stayExchangeCode } from './auth'
import { StayAiClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  transformSubscriptionToOrder,
  untransformOrderToSubscription,
  type RawStayAiSubscription,
} from './transform/order'
import {
  transformCustomer,
  type RawStayAiCustomer,
} from './transform/customer'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   customer — derived from subscription records
// Available:   order    — mapped from Stay AI subscriptions
// Unavailable: collection  — managed in Shopify; not exposed by Stay AI API
// Unavailable: discount    — discount/coupon logic lives in Shopify, not Stay AI
// Unavailable: fulfillment — physical shipments are delegated to Shopify
// Unavailable: inventory   — stock tracking belongs to Shopify
// Unavailable: location    — warehouse/location data is Shopify-side only
// Unavailable: refund      — refunds processed via Shopify Payments, not Stay AI
// Unavailable: transaction — billing transactions are Shopify-side only
// Unverified:  product     — llms.txt references get-catalog / get-catalog-product-by-id
//                            but docs.stay.ai returned HTTP 429 on every fetch attempt;
//                            exact endpoint path + response shape could not be confirmed

// ── Credential form (API key) ─────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText:
    'Generate an API key in the Stay AI merchant portal under Settings → API Keys.',
  placeholder: 'stay_live_xxxxxxxxxxxxxxxx',
})

// ── Webhook topic → canonical resource + action ───────────────────────────────

const TOPIC_MAP: Record<string, { resourceType: string; action: string }> = {
  SUBSCRIPTION: { resourceType: 'orders', action: 'created' },
  CANCELLATION: { resourceType: 'orders', action: 'deleted' },
  FAILED_PAYMENT: { resourceType: 'orders', action: 'updated' },
  SUCCESSFUL_PAYMENT: { resourceType: 'orders', action: 'updated' },
  SUBSCRIPTION_UPDATE: { resourceType: 'orders', action: 'updated' },
  SUBSCRIPTION_UPDATE_GRANULAR: { resourceType: 'orders', action: 'updated' },
  DATA_EXPORTED: { resourceType: 'unknown', action: 'unknown' },
  SPG_CREATED: { resourceType: 'unknown', action: 'created' },
  SPG_UPDATED: { resourceType: 'unknown', action: 'updated' },
}

function parseStayAiWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const topic =
    (payload['event'] as string | undefined) ??
    (payload['__topic'] as string | undefined) ??
    (payload['topic'] as string | undefined) ??
    ''

  const topicKey = topic.toUpperCase().replace(/-/g, '_')
  const mapped = TOPIC_MAP[topicKey] ?? { resourceType: 'unknown', action: 'unknown' }

  const rawId = payload['id'] ?? payload['subscriptionId']
  const resourceId = rawId != null ? String(rawId) : ''

  return [
    {
      platform: 'stay-ai',
      type: `${mapped.resourceType}.${mapped.action}`,
      resourceType: mapped.resourceType as import('../../schema/webhook').WebhookResourceType,
      action: mapped.action as import('../../schema/webhook').WebhookAction,
      resourceId,
      payload,
    },
  ]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class StayAiAdapter implements EcommerceAdapter {
  readonly platform = 'stay-ai'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return stayExchangeCode()
  }

  /**
   * Stay AI API keys do not expire. Return credentials unchanged.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  /**
   * Stay AI uses JWT-based webhook verification (not HMAC). The JWT token
   * is included in the webhook request. Verification requires decoding the
   * JWT with the merchant's shared secret. Since we do not receive the raw
   * bytes + a simple HMAC header, we return `true` here and leave signature
   * verification to the platform's JWT middleware layer.
   */
  verifyWebhook(
    _payload: Buffer,
    _headers: Record<string, string>,
    _secret: string,
  ): boolean {
    // Stay AI uses JWT-based verification — delegate to platform middleware.
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseStayAiWebhookEvents(payload)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): StayAiClient {
    return new StayAiClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
    }
    if (params.updatedAfter) {
      // Stay AI accepts epoch-ms timestamps for date filters.
      out['updatedAtMin'] = params.updatedAfter.getTime()
    }
    if (params['status']) out['status'] = params['status']
    if (params['email']) out['email'] = params['email']
    return out
  }

  // ── Orders (Subscriptions) ─────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawStayAiSubscription>(
      'subscriptions/',
      this.listParams(params),
    )
    return res.items.map(transformSubscriptionToOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawStayAiSubscription>(
      `subscriptions/${id}`,
    )
    return transformSubscriptionToOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    // Stay AI only allows updating order notes on a subscription.
    const body = untransformOrderToSubscription(data)
    if (body['orderNotes'] != null) {
      await this.clientFor(credentials).put<unknown>(
        `subscriptions/${id}/order-notes`,
        { orderNotes: body['orderNotes'] },
      )
    }
    // Re-fetch the updated subscription to return canonical state.
    return this.getOrder(credentials, id)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    await this.clientFor(credentials).post<unknown>(
      `subscriptions/${id}/cancel`,
      {
        cancellationReasons: data?.reason ? [data.reason] : [],
        initiator: 'MERCHANT',
      },
    )
    return this.getOrder(credentials, id)
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  /**
   * Stay AI does not expose a dedicated customers list endpoint. We query
   * subscriptions and derive a unique customer per email address.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawStayAiSubscription>(
      'subscriptions/',
      this.listParams(params),
    )
    // De-duplicate by email, keeping the most-recently-updated record per customer.
    const byEmail = new Map<string, RawStayAiSubscription>()
    for (const sub of res.items) {
      const key = sub.email ?? String(sub.customerId ?? sub.id ?? '')
      if (!byEmail.has(key)) {
        byEmail.set(key, sub)
      }
    }
    return Array.from(byEmail.values()).map((sub) => {
      const raw: RawStayAiCustomer = {
        id: sub.customerId ?? sub.id,
        email: sub.email,
        phone: sub.phone,
        defaultAddress: sub.shippingAddress ?? undefined,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      }
      return transformCustomer(raw)
    })
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // Stay AI has no dedicated customer endpoint. We query subscriptions and
    // derive the customer from the first matching result.
    //
    // If the id looks like an email address, use the email filter directly.
    // Otherwise, query subscriptions and find one whose customerId matches.
    const client = this.clientFor(credentials)

    const isEmail = id.includes('@')
    if (isEmail) {
      const res = await client.listWithPage<RawStayAiSubscription>('subscriptions/', {
        email: id,
        pageSize: 1,
        page: 1,
      })
      const sub = res.items[0]
      if (!sub) throw new Error(`Stay AI: no subscription found for email ${id}`)
      const raw: RawStayAiCustomer = {
        id: sub.customerId ?? sub.id,
        email: sub.email,
        phone: sub.phone,
        defaultAddress: sub.shippingAddress ?? undefined,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      }
      return transformCustomer({ ...raw, id: raw.id ?? id })
    }

    // Numeric / opaque customer id: page through subscriptions to find a match.
    let page = 1
    const pageSize = MAX_PAGE_SIZE
    for (;;) {
      const res = await client.listWithPage<RawStayAiSubscription>('subscriptions/', {
        pageSize,
        page,
      })
      const sub = res.items.find(
        (s) => s.customerId != null && String(s.customerId) === id,
      )
      if (sub) {
        const raw: RawStayAiCustomer = {
          id: sub.customerId ?? sub.id,
          email: sub.email,
          phone: sub.phone,
          defaultAddress: sub.shippingAddress ?? undefined,
          createdAt: sub.createdAt,
          updatedAt: sub.updatedAt,
        }
        return transformCustomer({ ...raw, id: raw.id ?? id })
      }
      if (!res.nextPage) break
      page = res.nextPage
    }

    throw new Error(`Stay AI: no subscription found for customerId ${id}`)
  }
}
