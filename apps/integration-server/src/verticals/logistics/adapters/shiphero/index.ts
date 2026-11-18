// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier       — ShipHero confirmed no public GraphQL query for carriers; UI-only (community.shiphero.com/t/how-to-query-a-list-of-shipping-options-carrier-method/1587)
// Unavailable: rate          — No native rate-shopping endpoint; rates are handled by external webhooks, not the public API
// Unavailable: manifest      — No manifest/end-of-day query exists in the public GraphQL API
// Unavailable: trackingevent — No tracking query, mutation or type in the GraphQL schema; tracking is scalar fields on ShippingLabel
// Lists: `orders` / `shipments` are Relay connections; `first` / `after` live on the nested `data` field, not the root (see ORDERS_QUERY)

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { ShipheroClient } from './client'

import { transformShipment, type ShipheroShipment } from './transform/shipment'
import { transformOrder, type ShipheroOrder } from './transform/order'
import { transformWarehouse, type ShipheroWarehouse } from './transform/warehouse'
import { transformLabel, type ShipheroLabelNested } from './transform/label'

interface ShipheroAdapterConfig {
  sandbox?: boolean
}

/**
 * Every ShipHero list is a Relay connection under the query result's `data`
 * field. The root field (`orders`, `shipments`) takes filters only — `first`,
 * `after`, `last`, `before` and `sort` are arguments of `data`, so
 * `orders(first: 10)` is a schema error while `orders { data(first: 10) … }`
 * is the documented form. `endCursor` is the `after` for the next page.
 * Source: https://developer.shiphero.com/getting-started/#pagination
 */
interface ShipheroConnection<T> {
  data: {
    edges: Array<{ node: T }>
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

/**
 * One caller page of a Relay connection: `params.limit` → `first`, and the
 * cursor that starts the page → `after`.
 *
 * An explicit `params.cursor` (a previous page's `endCursor`) is sent as-is.
 * Otherwise the 1-based `params.page` is resolved by walking `endCursor`s
 * (`pageByCursor`); the adapter used to drop `page`, so page 2 was page 1
 * again. `hasNextPage` is the end signal ("When paginating forwards, are there
 * more items?" — developer.shiphero.com/schema/types/page-info.html).
 */
async function pageConnection<T>(
  credentials: Credentials,
  params: QueryParams,
  collection: 'orders' | 'shipments',
  query: string,
): Promise<T[]> {
  const client = new ShipheroClient(credentials)
  const fetchPage = async (after: string | undefined) => {
    const variables: { first?: number; after?: string } = {}
    if (params.limit !== undefined) variables.first = params.limit
    if (after !== undefined) variables.after = after
    const res = await client.query<Record<string, ShipheroConnection<T>>>(query, variables)
    const { edges, pageInfo } = res[collection].data
    return {
      items: edges.map((edge) => edge.node),
      next: pageInfo?.hasNextPage && pageInfo.endCursor ? pageInfo.endCursor : undefined,
    }
  }

  if (typeof params.cursor === 'string') {
    const res = await fetchPage(params.cursor)
    reportUpstreamPage(params, { hasMore: res.next !== undefined })
    return res.items
  }

  // The client id is the connection's stable account; connectionScope adds a
  // token fingerprint so two connections never share a walk.
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const account = typeof extra.clientId === 'string' ? extra.clientId : ''
  const key = cursorPagerKey(connectionScope(`shiphero:${account}`, credentials), collection, {
    limit: params.limit,
  })
  const { items, hasMore } = await pageByCursor<T, string>(key, params.page, fetchPage)
  reportUpstreamPage(params, { hasMore })
  return items
}

const ORDER_QUERY = `query GetOrder($id: String!) { order(id: $id) { request_id data { id legacy_id order_number fulfillment_status shipping_address warehouse_address line_items { sku quantity product_name price } } } }`
const CREATE_ORDER_MUTATION = `mutation CreateOrder($data: CreateOrderInput!) { order_create(data: $data) { request_id order { id legacy_id order_number fulfillment_status } } }`
const SHIPMENT_QUERY = `query GetShipment($id: String!) { shipment(id: $id) { request_id data { id legacy_id order_id tracking_number status carrier shipping_method total_weight weight_unit shipping_address warehouse_address label_url created_at updated_at } } }`
const CREATE_SHIPMENT_MUTATION = `mutation CreateShipment($data: ShipmentInput!) { shipment_create(data: $data) { request_id shipment { id tracking_number status } } }`

// List queries. The node field lists mirror ORDER_QUERY / SHIPMENT_QUERY so
// transformOrder / transformShipment see the same shape from a page as from a
// single fetch.
const ORDERS_QUERY = `query ListOrders($first: Int, $after: String) { orders { request_id data(first: $first, after: $after) { edges { node { id legacy_id order_number fulfillment_status shipping_address warehouse_address line_items { sku quantity product_name price } } } pageInfo { hasNextPage endCursor } } } }`
const SHIPMENTS_QUERY = `query ListShipments($first: Int, $after: String) { shipments { request_id data(first: $first, after: $after) { edges { node { id legacy_id order_id tracking_number status carrier shipping_method total_weight weight_unit shipping_address warehouse_address label_url created_at updated_at } } pageInfo { hasNextPage endCursor } } } }`

// Warehouses are returned nested within the account query (account.data.warehouses[])
const ACCOUNT_WAREHOUSES_QUERY = `query AccountWarehouses { account { request_id data { warehouses { id legacy_id identifier address { name address1 address2 city state country zip phone } phone_number invoice_email dynamic_slotting profile } } } }`

// Labels are nested within the shipment query as shipping_labels[]
const SHIPMENT_LABELS_QUERY = `query GetShipmentLabels($id: String!) { shipment(id: $id) { request_id data { id shipping_labels { edges { node { id legacy_id shipment_id tracking_number carrier shipping_name shipping_method cost status refunded needs_refund tracking_url label { pdf_location paper_pdf_location thermal_pdf_location } created_date } } } } } }`

export class ShipheroAdapter implements LogisticsAdapter {
  readonly platform = 'shiphero'
  readonly version = '1'

  constructor(_config: ShipheroAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const [clientId, clientSecret] = code.split(':')
    return exchangeCredentials({ clientId, clientSecret })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await pageConnection<ShipheroOrder>(credentials, params, 'orders', ORDERS_QUERY)
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipheroClient(credentials)
    const res = await client.query<{ order: { data: ShipheroOrder } }>(ORDER_QUERY, { id })
    return transformOrder(res.order.data)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipheroClient(credentials)
    const res = await client.query<{ order_create: { order: ShipheroOrder } }>(
      CREATE_ORDER_MUTATION,
      {
        data: {
          order_number: data.orderNumber,
          shop_name: 'open-logistics',
          fulfillment_status: 'pending',
          shipping_address: data.destinationAddress,
          line_items: data.lineItems?.map((li) => ({
            sku: li.sku,
            quantity: li.quantity,
            product_name: li.description,
            price: li.unitAmount,
          })),
          required_ship_date: data.orderAt,
        },
      },
    )
    return transformOrder(res.order_create.order)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const rows = await pageConnection<ShipheroShipment>(
      credentials,
      params,
      'shipments',
      SHIPMENTS_QUERY,
    )
    return rows.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipheroClient(credentials)
    const res = await client.query<{ shipment: { data: ShipheroShipment } }>(SHIPMENT_QUERY, { id })
    return transformShipment(res.shipment.data)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipheroClient(credentials)
    const res = await client.query<{ shipment_create: { shipment: ShipheroShipment } }>(
      CREATE_SHIPMENT_MUTATION,
      {
        data: {
          shipping_address: data.destinationAddress,
          warehouse_address: data.originAddress,
          total_weight: data.totalWeight?.value,
          weight_unit: data.totalWeight?.unit,
          shipping_method: data.serviceCode,
          reference: data.reference,
        },
      },
    )
    return transformShipment(res.shipment_create.shipment)
  }

  // getTrackingEvents was removed: it queried `tracking(tracking_number:)`, which
  // does not exist — the public schema has no tracking query, mutation or type,
  // only scalar tracking fields on ShippingLabel (tracking_number, tracking_url)
  // and Shipment (tracking_status). transform/tracking.ts is kept, uncalled, with
  // its baselined test.

  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipheroClient(credentials)
    const res = await client.query<{ account: { data: { warehouses: ShipheroWarehouse[] } } }>(
      ACCOUNT_WAREHOUSES_QUERY,
    )
    return (res.account.data.warehouses ?? []).map(transformWarehouse)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // Labels are retrieved by fetching the shipment that contains them and finding the matching label
    const client = new ShipheroClient(credentials)
    const res = await client.query<{
      shipment: {
        data: {
          id: string
          shipping_labels: { edges: Array<{ node: ShipheroLabelNested }> }
        }
      }
    }>(SHIPMENT_LABELS_QUERY, { id })
    const edges = res.shipment.data.shipping_labels?.edges ?? []
    if (edges.length === 0) {
      throw new Error(`ShipHero: no shipping labels found for shipment ${id}`)
    }
    return transformLabel(edges[0].node, res.shipment.data.id)
  }

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    // ShipHero labels are accessed via a shipment ID; params.shipmentId is required
    const shipmentId = String((params as Record<string, unknown>).shipmentId ?? '')
    if (!shipmentId) {
      throw new Error('ShipHero listLabels requires params.shipmentId')
    }
    const client = new ShipheroClient(credentials)
    const res = await client.query<{
      shipment: {
        data: {
          id: string
          shipping_labels: { edges: Array<{ node: ShipheroLabelNested }> }
        }
      }
    }>(SHIPMENT_LABELS_QUERY, { id: shipmentId })
    const edges = res.shipment.data.shipping_labels?.edges ?? []
    return edges.map((e) => transformLabel(e.node, res.shipment.data.id))
  }
}
