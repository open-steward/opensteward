import { simpleApiKey } from '@opensteward/shared'
/**
 * IONOS adapter for the ecommerce vertical.
 *
 * Maps the IONOS ecommerce REST API to the canonical ecommerce resources.
 * IONOS is a European hosting and website-builder platform (formerly 1&1)
 * offering integrated online-store functionality.
 *
 * Notable limitations:
 *  - No OAuth2 — API key auth only (no getAuthUrl / exchangeCode flow).
 *  - Limited ecommerce API surface: products and orders only.
 *  - No webhooks, fulfillments, refunds, transactions, discounts, or customers.
 *  - No inventory or location resources.
 *
 * Auth: API key via `Authorization: Bearer <api-key>` header.
 * Base URL: https://api.ionos.com/ecommerce/v1 (configurable via credentials.extra.baseUrl)
 *
 * Docs: https://developer.hosting.ionos.com/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   product, order
// Unavailable: collection  — IONOS native ecommerce API exposes only products and orders; no category/collection endpoint exists
// Unavailable: customer    — IONOS native ecommerce API exposes only products and orders; no customer endpoint exists
// Unavailable: discount    — IONOS native ecommerce API exposes only products and orders; no discount/coupon endpoint exists
// Unavailable: fulfillment — IONOS native ecommerce API exposes only products and orders; no fulfillment endpoint exists
// Unavailable: inventory   — IONOS native ecommerce API exposes only products and orders; no inventory endpoint exists
// Unavailable: location    — IONOS native ecommerce API exposes only products and orders; no location endpoint exists
// Unavailable: refund      — IONOS native ecommerce API exposes only products and orders; no refund endpoint exists
// Unavailable: transaction — IONOS native ecommerce API exposes only products and orders; no transaction endpoint exists

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'

import {
  getAuthUrl as ionosGetAuthUrl,
  exchangeCode as ionosExchangeCode,
  refreshCredentials as ionosRefreshCredentials,
} from './auth'
import { IonosClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformProduct, type RawIonosProduct } from './transform/product'
import { transformOrder, type RawIonosOrder } from './transform/order'

export interface IonosAdapterConfig {
  /** API key (optional — may come from per-connection credentials instead). */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class IonosAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ionos'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configApiKey: string | undefined

  constructor(config: IonosAdapterConfig = {}) {
    this.configApiKey = config.apiKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return ionosGetAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return ionosExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return ionosRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): IonosClient {
    const apiKey =
      (credentials.accessToken && credentials.accessToken.length > 0
        ? credentials.accessToken
        : undefined) ?? this.configApiKey

    if (!apiKey) {
      throw new Error(
        'IONOS adapter is missing an API key — ' +
          'either configure it in apps/integration-server/config/config.yml under adapters.ionos, ' +
          'or POST it to /v1/connections with credentials: { accessToken: "<api-key>" }.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
    }
    return new IonosClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['offset'] = ((params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE))
    if (params.search) out['q'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawIonosProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawIonosProduct>(`/products/${id}`)
    return transformProduct(res)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawIonosOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map((o) => transformOrder(o))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawIonosOrder>(`/orders/${id}`)
    return transformOrder(res)
  }
}
