/**
 * Patreon adapter for the ecommerce vertical.
 *
 * Maps the Patreon JSON:API REST surface to canonical ecommerce resources.
 * Notable Patreon-isms:
 *
 *  - **Subscription platform**: Patreon is a membership/patronage platform,
 *    not a traditional e-commerce store. Mapping is lossy by nature.
 *  - **Campaigns → Products**: A creator's campaign maps to a product.
 *    Tier levels within a campaign map to variants.
 *  - **Members → Customers**: Patrons (members) map to customers.
 *  - **Pledges → Orders/Transactions**: Active pledges map to orders.
 *    Charge events map to transactions.
 *  - **JSON:API format**: Responses use JSON:API envelopes with `included`
 *    for related resources (tiers, users).
 *  - **OAuth2 authorization code flow**: Standard OAuth2 with refresh tokens.
 *  - **Read-heavy**: Most Patreon resources are read-only or have limited
 *    write support via the API. Creates/updates return 501 where unsupported.
 *  - **No inventory/locations/fulfillments/refunds/collections/discounts**:
 *    These concepts don't exist in Patreon's model.
 *
 * Coverage: 15 of 42 interface methods implemented.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: collection   — Patreon has no collection concept; it is a membership platform with campaigns and tiers.
// Unavailable: discount     — Patreon has no discount or coupon system; tier pricing is fixed.
// Unavailable: fulfillment  — Patreon is a digital-content platform and does not ship physical goods.
// Unavailable: inventory    — Patreon sells digital memberships, not physical SKUs; no stock concept in the API.
// Unavailable: location     — Patreon is fully digital and has no warehouse or retail location in its API.
// Unavailable: refund       — Patreon processes refunds internally; the API exposes no refund resource.

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Transaction } from '../../schema/transaction'

import {
  buildAuthUrl,
  exchangeCode as patreonExchangeCode,
  refreshCredentials as patreonRefreshCredentials,
} from './auth'
import { PatreonClient, type FlatResource } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  transformTier,
  type RawPatreonCampaign,
  type RawPatreonTier,
} from './transform/product'
import {
  transformCustomer,
  type RawPatreonMember,
} from './transform/customer'
import {
  transformOrder,
  type RawPatreonPledge,
} from './transform/order'
import {
  transformTransaction,
  type RawPatreonChargeEvent,
} from './transform/transaction'

export interface PatreonAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/** Patreon campaign fields to include in API requests. */
const CAMPAIGN_FIELDS = [
  'created_at',
  'creation_name',
  'image_small_url',
  'image_url',
  'is_charged_immediately',
  'is_monthly',
  'is_nsfw',
  'one_liner',
  'patron_count',
  'pledge_url',
  'published_at',
  'summary',
  'url',
  'vanity',
].join(',')

/** Patreon tier fields to include in API requests. */
const TIER_FIELDS = [
  'amount_cents',
  'created_at',
  'description',
  'edited_at',
  'image_url',
  'patron_count',
  'published',
  'published_at',
  'title',
  'url',
].join(',')

/** Patreon member fields to include in API requests. */
const MEMBER_FIELDS = [
  'email',
  'full_name',
  'is_follower',
  'last_charge_date',
  'last_charge_status',
  'lifetime_support_cents',
  'currently_entitled_amount_cents',
  'note',
  'patron_status',
  'pledge_cadence',
  'pledge_relationship_start',
  'will_pay_amount_cents',
].join(',')

/** Patreon user fields to request via includes. */
const USER_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'full_name',
  'image_url',
  'thumb_url',
  'url',
  'vanity',
  'created',
].join(',')

export class PatreonAdapter implements EcommerceAdapter {
  readonly platform = 'patreon'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configRedirectUri: string | undefined

  constructor(config: PatreonAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configRedirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const clientId = this.configClientId
    if (!clientId) {
      throw new Error(
        'Patreon adapter is missing clientId — configure it in config or via environment.',
      )
    }
    const redirectUri = this.configRedirectUri ?? 'http://localhost:3010/auth/ecommerce/patreon/callback'
    return buildAuthUrl(clientId, redirectUri, state, overrideScopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'Patreon adapter requires clientId and clientSecret for exchangeCode.',
      )
    }
    return patreonExchangeCode(code, redirectUri, clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return patreonRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): PatreonClient {
    if (!credentials.accessToken) {
      throw new Error(
        'Patreon adapter requires an accessToken. Complete the OAuth2 flow first.',
      )
    }
    return new PatreonClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  /**
   * Get the first campaign ID for the authenticated user.
   * Patreon scopes resources under campaigns, so most calls need this.
   */
  private async getFirstCampaignId(client: PatreonClient): Promise<string> {
    const res = await client.list<FlatResource>('campaigns', {
      params: {
        'fields[campaign]': 'created_at',
      },
    })
    if (res.items.length === 0) {
      throw new Error('No Patreon campaigns found for this user.')
    }
    return res.items[0]!.id
  }

  // ── Products (Campaigns) ──────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    // Cursor paging (https://docs.patreon.com/#pagination): `page[count]` sets
    // the size, and `meta.pagination.cursors.next` goes back as `page[cursor]`
    // for the next page; it is null or absent on the last one. The client
    // caps `page[count]` at MAX_PAGE_SIZE, so the size sent is reported when
    // it is below the caller's limit.
    const requested = this.pageSize(params)
    const sent = Math.min(requested, MAX_PAGE_SIZE)
    const query = {
      'fields[campaign]': CAMPAIGN_FIELDS,
      'fields[tier]': TIER_FIELDS,
      include: 'tiers',
    }
    const key = cursorPagerKey(connectionScope('patreon', credentials), 'campaigns', {
      ...query,
      limit: sent,
    })
    const { items, hasMore } = await pageByCursor<FlatResource>(key, params.page, async (cursor) => {
      const res = await client.list<FlatResource>('campaigns', {
        pageSize: sent,
        cursor,
        params: query,
      })
      return { items: res.items, next: res.nextCursor }
    })
    reportUpstreamPage(params, { hasMore, ...(sent < requested ? { pageSize: sent } : {}) })
    return items.map((c) => transformProduct(c as unknown as RawPatreonCampaign))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<FlatResource>(`campaigns/${encodeURIComponent(id)}`, {
      'fields[campaign]': CAMPAIGN_FIELDS,
      'fields[tier]': TIER_FIELDS,
      include: 'tiers',
    })
    return transformProduct(raw as unknown as RawPatreonCampaign)
  }

  // ── Variants (Tiers) ─────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const campaignId = (params['productId'] ?? params['product_id'] ?? params['campaignId']) as string | undefined
    const client = this.clientFor(credentials)
    const targetCampaignId = campaignId ?? await this.getFirstCampaignId(client)

    const raw = await client.get<FlatResource>(
      `campaigns/${encodeURIComponent(targetCampaignId)}`,
      {
        'fields[campaign]': 'created_at',
        'fields[tier]': TIER_FIELDS,
        include: 'tiers',
      },
    )
    const included = (raw as unknown as RawPatreonCampaign)._included ?? []
    const tiers = included.filter((r) => r._type === 'tier') as unknown as RawPatreonTier[]
    return tiers.map((t) => transformTier(t, targetCampaignId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Patreon doesn't have a direct tier-by-id endpoint in v2.
    // We need to list campaigns and find the tier in included.
    const client = this.clientFor(credentials)
    const res = await client.list<FlatResource>('campaigns', {
      params: {
        'fields[campaign]': 'created_at',
        'fields[tier]': TIER_FIELDS,
        include: 'tiers',
      },
    })

    for (const campaign of res.items) {
      const included = (campaign as unknown as RawPatreonCampaign)._included ?? []
      const tier = included.find(
        (r) => r._type === 'tier' && r.id === id,
      ) as unknown as RawPatreonTier | undefined
      if (tier) {
        return transformTier(tier, campaign.id)
      }
    }
    throw new Error(`Patreon tier ${id} not found in any campaign.`)
  }

  // ── Customers (Members) ───────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const campaignId = (params['campaignId'] ?? params['campaign_id']) as string | undefined
    const client = this.clientFor(credentials)
    const targetCampaignId = campaignId ?? await this.getFirstCampaignId(client)

    const res = await client.list<FlatResource>(
      `campaigns/${encodeURIComponent(targetCampaignId)}/members`,
      {
        pageSize: this.pageSize(params),
        params: {
          'fields[member]': MEMBER_FIELDS,
          'fields[user]': USER_FIELDS,
          include: 'user',
        },
      },
    )
    return res.items.map((m) => transformCustomer(m as unknown as RawPatreonMember))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const raw = await client.get<FlatResource>(`members/${encodeURIComponent(id)}`, {
      'fields[member]': MEMBER_FIELDS,
      'fields[user]': USER_FIELDS,
      include: 'user',
    })
    return transformCustomer(raw as unknown as RawPatreonMember)
  }

  // ── Orders (Pledges/Members) ──────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const campaignId = (params['campaignId'] ?? params['campaign_id']) as string | undefined
    const client = this.clientFor(credentials)
    const targetCampaignId = campaignId ?? await this.getFirstCampaignId(client)

    const res = await client.list<FlatResource>(
      `campaigns/${encodeURIComponent(targetCampaignId)}/members`,
      {
        pageSize: this.pageSize(params),
        params: {
          'fields[member]': MEMBER_FIELDS,
          'fields[tier]': TIER_FIELDS,
          include: 'currently_entitled_tiers',
        },
      },
    )
    return res.items.map((m) => transformOrder(m as unknown as RawPatreonPledge))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const raw = await client.get<FlatResource>(`members/${encodeURIComponent(id)}`, {
      'fields[member]': MEMBER_FIELDS,
      'fields[tier]': TIER_FIELDS,
      include: 'currently_entitled_tiers',
    })
    return transformOrder(raw as unknown as RawPatreonPledge)
  }

  // ── Transactions (Charge Events) ──────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const campaignId = (params['campaignId'] ?? params['campaign_id']) as string | undefined
    const client = this.clientFor(credentials)
    const targetCampaignId = campaignId ?? await this.getFirstCampaignId(client)

    const res = await client.list<FlatResource>(
      `campaigns/${encodeURIComponent(targetCampaignId)}/members`,
      {
        pageSize: this.pageSize(params),
        params: {
          'fields[member]': MEMBER_FIELDS,
        },
      },
    )
    // Only include members that have charge data
    return res.items
      .filter((m) => (m as unknown as RawPatreonChargeEvent).last_charge_date)
      .map((m) => transformTransaction(m as unknown as RawPatreonChargeEvent))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Transaction IDs are prefixed with 'txn-' — strip to get member ID
    const memberId = id.startsWith('txn-') ? id.slice(4) : id
    const client = this.clientFor(credentials)
    const raw = await client.get<FlatResource>(
      `members/${encodeURIComponent(memberId)}`,
      {
        'fields[member]': MEMBER_FIELDS,
      },
    )
    return transformTransaction(raw as unknown as RawPatreonChargeEvent)
  }
}
