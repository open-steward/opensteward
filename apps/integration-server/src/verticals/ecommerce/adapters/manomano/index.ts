/**
 * ManoMano adapter for the ecommerce vertical.
 *
 * Maps the ManoMano Partners REST API (https://partnersapi.manomano.com) to
 * the canonical ecommerce resources.
 *
 * Auth model: API-key — sellers generate a key in the ManoMano Toolbox
 * (Settings → API keys) and pass it in the `x-api-key` header. There is no
 * OAuth code-exchange flow.
 *
 * Supported resources:
 *   - Products    → Offer Information API (/api/v1/offer-information/offers)
 *   - Collections → Categories API (/categories/v1/categories)
 *   - Orders      → Orders API    (/orders/v1/orders)
 *
 * Not supported (no public sub-resource API endpoints exist):
 *   - Fulfillments: ManoMano only exposes bulk shipment POST, no per-order
 *     shipment sub-resource endpoints are available.
 *   - Refunds: ManoMano only exposes bulk refund POST, no per-order refund
 *     sub-resource endpoints are available.
 *   - Inventory, Customers, Locations, Transactions, Discounts, Webhooks.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: customer     — ManoMano has no Customers API; buyer data is
 *                             embedded in order responses only (no list/get).
 * Unavailable: discount     — ManoMano has no Discounts/Promotions API for
 *                             sellers; confirmed absent from all public docs.
 * Unavailable: location     — ManoMano has no Locations/Warehouses API;
 *                             seller fulfilment locations are not exposed.
 * Unavailable: transaction  — ManoMano has no Transactions/Payments API;
 *                             payment data is not exposed to sellers.
 *
 * Docs: https://www.manomano.dev/
 */

import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'

import { getAuthUrl, exchangeCode as manomanoExchangeCode } from './auth'
import { ManomanoClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformOffer,
  type RawManomanoOffer,
} from './transform/product'
import {
  transformCategory,
  type RawManomanoCategory,
} from './transform/collection'
import {
  transformOrder,
  type RawManomanoOrder,
} from './transform/order'

// ── Connect Link — single API-key form ────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'ManoMano API key',
  helpText:
    'Generate your API key in the ManoMano Toolbox under Settings → API keys.',
  placeholder: 'mm_xxxxxxxxxx',
})

export interface ManomanoAdapterConfig {
  /** Seller contract ID — used to scope Orders API queries. */
  sellerContractId?: string
}

export class ManomanoAdapter implements EcommerceAdapter {
  readonly platform = 'manomano'
  readonly version = '0.1.0'

  // Connect Link support
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  private sellerContractId: string | undefined

  constructor(config: ManomanoAdapterConfig = {}) {
    this.sellerContractId = config.sellerContractId
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return getAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return manomanoExchangeCode()
  }

  /** ManoMano API keys do not expire; refreshCredentials is a no-op. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ManomanoClient {
    return new ManomanoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
    }
    if (params.updatedAfter) {
      out['updated_after'] = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products (Offer Information) ──────────────────────────────────────────

  /**
   * List seller offers via the Offer Information API.
   * Endpoint: GET /api/v1/offer-information/offers
   * Response wraps items in { content: [...], pagination: { items: N } }
   * Optionally filter by `seller_contract_id` (falls back to config value).
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const extra: Record<string, unknown> = { ...this.listParams(params) }
    const contractId =
      (params['seller_contract_id'] as string | undefined) ??
      (params['sellerContractId'] as string | undefined) ??
      this.sellerContractId
    if (contractId) extra['seller_contract_id'] = contractId

    // _resourceKey is ignored — listWithPage always reads from "content"
    const res = await this.client(credentials).listWithPage<RawManomanoOffer>(
      '/api/v1/offer-information/offers',
      'content',
      extra,
    )
    return res.items.map((o) => transformOffer(o))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawManomanoOffer>(
      `/api/v1/offer-information/offers/${id}`,
    )
    return transformOffer(res)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPage<RawManomanoCategory>(
      '/categories/v1/categories',
      'content',
      this.listParams(params),
    )
    return res.items.map((c) => transformCategory(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<RawManomanoCategory>(
      `/categories/v1/categories/${id}`,
    )
    return transformCategory(res)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const extra: Record<string, unknown> = { ...this.listParams(params) }
    const contractId =
      (params['seller_contract_id'] as string | undefined) ??
      (params['sellerContractId'] as string | undefined) ??
      this.sellerContractId
    if (contractId) extra['seller_contract_id'] = contractId
    if (params['status']) extra['status'] = params['status']
    if (params['updatedAfter']) extra['status_updated_at_start'] = (params.updatedAfter as Date).toISOString()

    const res = await this.client(credentials).listWithPage<RawManomanoOrder>(
      '/orders/v1/orders',
      'content',
      extra,
    )
    return res.items.map((o) => transformOrder(o))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<RawManomanoOrder>(
      `/orders/v1/orders/${id}`,
    )
    return transformOrder(res)
  }

  /**
   * Cancel an order on ManoMano. Sends a POST to the cancel endpoint.
   * The API returns the updated order object.
   */
  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<RawManomanoOrder>(
      `/orders/v1/orders/${id}/cancel`,
      { reason: data?.reason },
    )
    return transformOrder(res)
  }
}
