/**
 * Loja Integrada adapter for the ecommerce vertical.
 *
 * Source of truth: Loja Integrada's OpenAPI 3.1.0 specification,
 * https://api-docs.lojaintegrada.com.br/openapi/API-Loja-Integrada.json
 * (the docs site https://api-docs.lojaintegrada.com.br/ renders it; its
 * configuration.json points at that file). Host https://api.awsli.com.br,
 * `Authorization: Basic <Personal Token>` (see ./client.ts).
 *
 * Read methods are built on the documented `/v1/...` resources:
 *   products     GET /v1/produto, GET /v1/produto/{produto_id}
 *   collections  GET /v1/categoria, GET /v1/categoria/{categoria_id}
 *   customers    GET /v1/cliente, GET /v1/cliente/{cliente_id}
 *   orders       GET /v1/pedido/search, GET /v1/pedido/{pedido_id}
 *   fulfillments `envios` of GET /v1/pedido/{pedido_id}
 *   transactions `pagamentos` of GET /v1/pedido/{pedido_id}
 *   discounts    GET /v1/cupom, GET /v1/cupom/{cupom_id}
 * and refuse (501 NOT_SUPPORTED, before any request) where the specification
 * documents no source: locations, inventory levels (which need a location),
 * refunds, and variants (a price currency is never stated).
 *
 * The write methods are out of this rebuild's scope and still send the paths
 * and bodies of the adapter this one was copied from; none of those paths
 * exists on api.awsli.com.br.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { LojaIntegradaClient } from './client'
import { DEFAULT_PAGE_SIZE, ORDER_SEARCH_MAX_LIMIT } from './constants'
import { verifyShopifyWebhook, parseShopifyWebhookEvents } from './webhook'

import {
  isVariationChild,
  transformProduto,
  type RawLojaIntegradaProduto,
} from './transform/produto'
import { transformCategoria, type RawLojaIntegradaCategoria } from './transform/categoria'
import { transformCliente, type RawLojaIntegradaCliente } from './transform/cliente'
import { transformPedido, type RawLojaIntegradaPedido } from './transform/pedido'
import { transformEnvio, type RawLojaIntegradaEnvio } from './transform/envio'
import { transformPagamento, type RawLojaIntegradaPagamento } from './transform/pagamento'
import { transformCupom, type RawLojaIntegradaCupom } from './transform/cupom'

// Write-method transforms (out of this rebuild's scope; see the header).
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from './transform/collection'
import { transformInventoryLevel, type RawShopifyInventoryLevel } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawShopifyOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawShopifyRefund } from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from './transform/discount'

/**
 * The connection's one secret: the store's Personal Token. The specification
 * ("Autenticação") documents `Authorization: Basic <Personal Token>` — "o
 * Personal Token identifica o lojista — é único e exclusivo por loja." — and
 * links "Como gerar o Personal Token?" to the help article below.
 */
const PERSONAL_TOKEN_FORM = simpleApiKey({
  fieldName: 'personalToken',
  label: 'Loja Integrada Personal Token',
  helpText:
    'How to generate it: https://ajuda.lojaintegrada.com.br/pt-BR/articles/5360466-como-o-integrador-gera-a-chave-de-aplicacao',
})

/** Rows this account's pagers are keyed under (see `connectionScope`). */
const ACCOUNT = 'loja-integrada'

/**
 * The widest gap between a wall-clock time and UTC among real zones: UTC−12
 * is the westernmost offset. See `wallClockFloor`.
 */
const MAX_WEST_OFFSET_MS = 12 * 60 * 60 * 1000

/**
 * A wall-clock lower bound for an "updated since" filter whose zone is not
 * documented: GET /v1/pedido/search's `since_atualizado` ("A data deve estar
 * no formato AAAA-MM-DDTHH:MM:SS") and GET /v1/produto's
 * `data_modificacao__gte` ("O formato da data é: 2022-01-01 10:20:00") name a
 * local time and never say in which zone. Whatever zone the server reads the
 * value in, `updatedAfter − 12 h` written as UTC wall-clock time names an
 * instant at or before `updatedAfter` (the westernmost zone, UTC−12, moves it
 * forward by at most those 12 h), so no row updated since `updatedAfter` is
 * filtered out. A few older rows may come back too; that is harmless.
 */
function wallClockFloor(updatedAfter: Date, separator: 'T' | ' '): string {
  return new Date(updatedAfter.getTime() - MAX_WEST_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', separator)
}

function notSupported(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 404 })
}

/** `<numero>:<child id>`, the id form of fulfillments and transactions. */
function splitChildId(id: string, what: string): [string, string] {
  const [orderId, childId, ...rest] = id.split(':')
  if (!orderId || !childId || rest.length > 0) {
    throw Object.assign(
      new Error(`Invalid ${what} id format: expected \`orderNumero:${what}Id\``),
      {
        statusCode: 400,
      },
    )
  }
  return [orderId, childId]
}

export class LojaIntegradaAdapter implements EcommerceAdapter {
  readonly platform = 'loja-integrada'
  readonly version = '0.2.0'

  // Connect Link: a single Personal Token field.
  credentialFields = PERSONAL_TOKEN_FORM.credentialFields
  exchangeCredentials = PERSONAL_TOKEN_FORM.exchangeCredentials

  // The factory passes the platform config; nothing in it is used.
  constructor(_config: unknown = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      "Loja Integrada has no OAuth authorize flow: connect with the store's Personal Token " +
        '(Authorization: Basic <Personal Token>).',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      "Loja Integrada has no OAuth code exchange: connect with the store's Personal Token.",
    )
  }

  /** A Personal Token does not expire or rotate through the API. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShopifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ?? (payload['topic'] as string | undefined)
    return parseShopifyWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): LojaIntegradaClient {
    return new LojaIntegradaClient(credentials)
  }

  /** The caller's page size: a whole number ≥ 1, else the default. */
  private pageSize(params: QueryParams): number {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    return Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
  }

  /**
   * One caller page of a documented `{ meta, objects }` list: rows
   * [(page − 1) × size, page × size) by `offset` + `limit`, the parameters of
   * the documented `meta.next` links. `maxLimit` is the path's documented
   * ceiling, if it has one; a smaller size than the caller asked for is then
   * reported as `pageSize`, so the router and the sync judge the page by it.
   * `meta.next` (null on the last page) is reported as `hasMore`, and
   * `meta.total_count` as `totalCount`.
   */
  private async offsetPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
    maxLimit?: number,
  ): Promise<T[]> {
    const asked = this.pageSize(params)
    const size = maxLimit !== undefined ? Math.min(asked, maxLimit) : asked
    const res = await this.client(credentials).page<T>(
      path,
      pageOffset(params, size),
      size,
      filters,
    )
    reportUpstreamPage(params, {
      ...(res.totalCount !== undefined ? { totalCount: res.totalCount } : {}),
      hasMore: res.next !== null,
      ...(size < asked ? { pageSize: size } : {}),
    })
    return res.items
  }

  /** GET /v1/pedido/{pedido_id}. */
  private async fetchPedido(
    credentials: Credentials,
    numero: string,
  ): Promise<RawLojaIntegradaPedido> {
    return this.client(credentials).get<RawLojaIntegradaPedido>(
      `/v1/pedido/${encodeURIComponent(numero)}`,
    )
  }

  private orderIdParam(params: QueryParams, method: string): string {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error(`${method} requires \`order_id\` in query params`)
    }
    return String(orderId)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * GET /v1/produto — "Lista todos produtos da loja de forma paginada." Its
   * documented filters include `data_modificacao__gte` (see `wallClockFloor`
   * for how `updatedAfter` is sent).
   *
   * The list holds variation children (`tipo: "atributo_opcao"`) beside the
   * products they belong to, and no documented parameter leaves them out. So
   * the children are dropped from each upstream page and the caller's pages
   * are cut from what remains with `pageByRows`. The upstream page is the
   * caller's size, so it is part of the pager key with the filter.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const size = this.pageSize(params)
    const filters: Record<string, unknown> = params.updatedAfter
      ? { data_modificacao__gte: wallClockFloor(params.updatedAfter, ' ') }
      : {}
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(ACCOUNT, credentials), 'produto', {
      ...filters,
      limit: size,
    })
    const { items } = await pageByRows<Product, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const res = await client.page<RawLojaIntegradaProduto>('/v1/produto', offset, size, filters)
      return {
        items: res.items.filter((p) => !isVariationChild(p)).map(transformProduto),
        next: res.next !== null ? offset + size : undefined,
      }
    })
    return items
  }

  /**
   * GET /v1/produto/{produto_id} — "Listar produto específico". The id of a
   * variation child (`tipo: "atributo_opcao"`) names a variant, not a
   * product, so it is not found as a product (listProducts never returns one).
   */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawLojaIntegradaProduto>(
      `/v1/produto/${encodeURIComponent(id)}`,
    )
    if (isVariationChild(raw)) {
      notFound(
        `Loja Integrada id ${id} is a product variation (tipo atributo_opcao), not a product`,
      )
    }
    return transformProduto(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawShopifyProduct }>(
      'products.json',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawShopifyProduct }>(
      `products/${id}.json`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /**
   * A variation is a child product on GET /v1/produto (`tipo:
   * "atributo_opcao"`), but a canonical variant needs `price` as money, and the
   * API states no currency anywhere: prices are bare decimals ("cheio":
   * "32.83" on GET /v1/produto_preco/{produto_id}; "preco_cheio": 100 on GET
   * /v1/produto/{produto_id}). A currency is never assumed.
   */
  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    return notSupported(
      'Loja Integrada cannot list variants: a canonical variant needs a price currency, and the ' +
        'Loja Integrada API states none (prices are bare decimals such as "cheio": "32.83").',
    )
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    return notSupported(
      'Loja Integrada cannot read a variant: a canonical variant needs a price currency, and the ' +
        'Loja Integrada API states none (prices are bare decimals such as "cheio": "32.83").',
    )
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.client(credentials).put<{ variant: RawShopifyVariant }>(
      `variants/${id}.json`,
      { variant: { id, ...untransformVariant(data) } },
    )
    return transformVariant(res.variant)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  /** GET /v1/categoria — "Lista todas as categorias cadastradas na loja, com paginação." */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const rows = await this.offsetPage<RawLojaIntegradaCategoria>(
      credentials,
      '/v1/categoria',
      params,
    )
    return rows.map(transformCategoria)
  }

  /** GET /v1/categoria/{categoria_id} — "Lista as informações de uma categoria específica." */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<RawLojaIntegradaCategoria>(
      `/v1/categoria/${encodeURIComponent(id)}`,
    )
    return transformCategoria(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    // Only manual (custom) collections are creatable via the REST API.
    const res = await this.client(credentials).post<{
      custom_collection: RawShopifyCollection
    }>('custom_collections.json', { custom_collection: untransformCollection(data) })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{
      custom_collection: RawShopifyCollection
    }>(`custom_collections/${id}.json`, {
      custom_collection: { id, ...untransformCollection(data) },
    })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`custom_collections/${id}.json`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * None of the specification's 76 paths is a location, warehouse or deposit:
   * stock is per product only (/v1/produto_estoque, /v1/produto_estoque/{produto_id}).
   */
  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return notSupported(
      'Loja Integrada cannot list locations: its API documents no location, warehouse or ' +
        'deposit resource (stock is per product only, at /v1/produto_estoque).',
    )
  }

  async getLocation(_credentials: Credentials, _id: string): Promise<Location> {
    return notSupported(
      'Loja Integrada cannot read a location: its API documents no location, warehouse or ' +
        'deposit resource (stock is per product only, at /v1/produto_estoque).',
    )
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * A canonical inventory level is per variant AND location, and Loja
   * Integrada has no locations (see listLocations). Inventing one would
   * fabricate an id.
   */
  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    return notSupported(
      'Loja Integrada cannot list inventory levels: a canonical level needs a location, and its ' +
        'API documents no location resource (stock is per product only, at /v1/produto_estoque).',
    )
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // `variantId` here is really the inventory_item_id — this matches the
    // transform layer which uses the item id in place of the variant id.
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/adjust.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available_adjustment: data.delta,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/set.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available: data.available,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * GET /v1/cliente — "Lista os clientes da loja" — whose only documented
   * filter is an ordering (`order_by=data_modificacao`).
   *
   * With `updatedAfter`, GET /v1/cliente/search instead: "**Data de
   * modificação:** _/v1/cliente/search?since_atualizado=2023-07-21_" ...
   * "_/v1/cliente/search?since_atualizado=2023-07-21T16:00:01&until_atualizado=2023-07-21T18:00:00_",
   * answered in the same `{ meta, objects }` envelope. The value is sent as
   * `wallClockFloor` explains, since its zone is not documented either.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = params.updatedAfter
      ? await this.offsetPage<RawLojaIntegradaCliente>(credentials, '/v1/cliente/search', params, {
          since_atualizado: wallClockFloor(params.updatedAfter, 'T'),
        })
      : await this.offsetPage<RawLojaIntegradaCliente>(credentials, '/v1/cliente', params)
    return rows.map(transformCliente)
  }

  /** GET /v1/cliente/{cliente_id} — "Lista os dados de um cliente específico." */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawLojaIntegradaCliente>(
      `/v1/cliente/${encodeURIComponent(id)}`,
    )
    return transformCliente(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawShopifyCustomer }>(
      'customers.json',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawShopifyCustomer }>(
      `customers/${id}.json`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * GET /v1/pedido/search — "**limit**: indica a quantidade de pedidos por
   * página (o máximo aceito é 50)"; "**offset**: indica a posição do primeiro
   * pedido, na ordem, para o resultado." `updatedAfter` is sent as
   * `since_atualizado` ("pedidos que foram atualizados a partir da data e hora
   * especificada"; see `wallClockFloor`).
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const filters: Record<string, unknown> = params.updatedAfter
      ? { since_atualizado: wallClockFloor(params.updatedAfter, 'T') }
      : {}
    const rows = await this.offsetPage<RawLojaIntegradaPedido>(
      credentials,
      '/v1/pedido/search',
      params,
      filters,
      ORDER_SEARCH_MAX_LIMIT,
    )
    return rows.map(transformPedido)
  }

  /** GET /v1/pedido/{pedido_id} — "Lista os detalhes de um pedido específico." */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    return transformPedido(await this.fetchPedido(credentials, id))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>('orders.json', {
      order: untransformOrder(data),
    })
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawShopifyOrder }>(
      `orders/${id}.json`,
      { order: { id, ...untransformOrder(data) } },
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>(
      `orders/${id}/cancel.json`,
      { reason: data?.reason },
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * One order's shipments: the `envios` array of GET /v1/pedido/{pedido_id}.
   * That array is every shipment of the order, so the caller's page is cut
   * from it with `pageLocally`.
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = this.orderIdParam(params, 'listFulfillments')
    const pedido = await this.fetchPedido(credentials, orderId)
    const numero = String(pedido.numero)
    const envios = (pedido.envios ?? []) as RawLojaIntegradaEnvio[]
    return pageLocally(
      envios.map((e) => transformEnvio(numero, e)),
      params,
    )
  }

  /** `<numero>:<envio id>`, read through GET /v1/pedido/{pedido_id}. */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, envioId] = splitChildId(id, 'fulfillment')
    const pedido = await this.fetchPedido(credentials, orderId)
    const envio = ((pedido.envios ?? []) as RawLojaIntegradaEnvio[]).find(
      (e) => String(e.id) === envioId,
    )
    if (!envio) notFound(`Loja Integrada order ${orderId} has no shipment ${envioId}`)
    return transformEnvio(String(pedido.numero), envio)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      'fulfillments.json',
      {
        fulfillment: {
          ...untransformFulfillment(data),
          line_items_by_fulfillment_order: [
            // The caller should provide platform-specific details in metadata
            // for nontrivial cases; this is a minimal default.
          ],
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/update_tracking.json`,
      {
        fulfillment: {
          notify_customer: data.notifyCustomer,
          tracking_info: {
            number: data.trackingNumber,
            url: data.trackingUrl,
            company: data.carrier,
          },
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/cancel.json`,
    )
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /** None of the specification's 76 paths is a refund (devolução/reembolso) resource. */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    return notSupported('Loja Integrada cannot list refunds: its API documents no refund resource.')
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    return notSupported(
      'Loja Integrada cannot read a refund: its API documents no refund resource.',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawShopifyRefund }>(
      `orders/${data.orderId}/refunds.json`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  /**
   * One order's payments: the `pagamentos` array of GET /v1/pedido/{pedido_id},
   * every payment of the order, so the caller's page is cut with `pageLocally`.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = this.orderIdParam(params, 'listTransactions')
    const pedido = await this.fetchPedido(credentials, orderId)
    const numero = String(pedido.numero)
    const pagamentos = (pedido.pagamentos ?? []) as RawLojaIntegradaPagamento[]
    return pageLocally(
      pagamentos.map((p) => transformPagamento(numero, p)),
      params,
    )
  }

  /** `<numero>:<pagamento id>`, read through GET /v1/pedido/{pedido_id}. */
  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, pagamentoId] = splitChildId(id, 'transaction')
    const pedido = await this.fetchPedido(credentials, orderId)
    const pagamento = ((pedido.pagamentos ?? []) as RawLojaIntegradaPagamento[]).find(
      (p) => String(p.id) === pagamentoId,
    )
    if (!pagamento) notFound(`Loja Integrada order ${orderId} has no payment ${pagamentoId}`)
    return transformPagamento(String(pedido.numero), pagamento)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const res = await this.client(credentials).post<{
      transaction: RawShopifyTransaction
    }>(`orders/${data.orderId}/transactions.json`, {
      transaction: untransformTransaction(data),
    })
    return transformTransaction(res.transaction)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  /** GET /v1/cupom — "Lista todos os cupons da loja." */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const rows = await this.offsetPage<RawLojaIntegradaCupom>(credentials, '/v1/cupom', params)
    return rows.map(transformCupom)
  }

  /** GET /v1/cupom/{cupom_id} — "Lista os detalhes de um cupom específico utilizando ID do cupom." */
  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawLojaIntegradaCupom>(
      `/v1/cupom/${encodeURIComponent(id)}`,
    )
    return transformCupom(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.post<{ price_rule: RawShopifyPriceRule }>('price_rules.json', {
      price_rule: untransformDiscount(data),
    })
    let code: RawShopifyDiscountCode | undefined
    if (data.code) {
      const cr = await client.post<{ discount_code: RawShopifyDiscountCode }>(
        `price_rules/${rule.price_rule.id}/discount_codes.json`,
        { discount_code: { code: data.code } },
      )
      code = cr.discount_code
    }
    return transformDiscount(rule.price_rule, code)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ price_rule: RawShopifyPriceRule }>(
      `price_rules/${id}.json`,
      { price_rule: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.price_rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`price_rules/${id}.json`)
  }
}
