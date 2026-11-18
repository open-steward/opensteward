/**
 * Fluent Commerce InventoryPosition transform.
 *
 * Fluent GraphQL `inventoryPositions` returns nodes with:
 *   ref, productRef, locationRef, onHand, status, createdOn, updatedOn,
 *   quantities — an InventoryQuantityConnection, so the records sit under
 *   `quantities.edges[].node` ({ ref, type, quantity, status, updatedOn }).
 *
 * Schema reference, InventoryPosition
 * (https://api.production.shared-sydney-01.fluentcommerce.com/graphql/docs/object/inventoryposition/):
 *   "quantities ( InventoryQuantityConnection ) A connection to the Inventory
 *   Quantities associated with this Position"
 * InventoryQuantityConnection (…/graphql/docs/object/inventoryquantityconnection/):
 *   "edges ( [InventoryQuantityEdge] ) A list of edges that links to
 *   InventoryQuantity type node"
 * InventoryQuantityEdge (…/graphql/docs/object/inventoryquantityedge/):
 *   "node ( InventoryQuantity ) The item at the end of the InventoryQuantity edge"
 * Fluent's own example selects it that way
 * (https://docs.fluentcommerce.com/essential-knowledge/graphql-inventory-queries,
 * "Inventory Positions" example query, whitespace collapsed):
 *   `reserveQty:quantities(type:"RESERVED") { edges { node { quantity } } }`
 *
 * quantity types read (READ_QUANTITY_TYPES):
 *   LAST_ON_HAND  → on-hand snapshot, used when `onHand` is absent
 *   RESERVED      → committed/allocated
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickNum, strMap} from './shared'

/**
 * The InventoryQuantity types this transform reads. The list and get queries
 * filter `quantities` to exactly these (index.ts, QUANTITIES_SELECTION), so a
 * type added here is fetched too, and `findQuantity` accepts no other.
 */
export const READ_QUANTITY_TYPES = ['RESERVED', 'LAST_ON_HAND'] as const
type ReadQuantityType = (typeof READ_QUANTITY_TYPES)[number]

export interface RawFluentCommerceInventoryQuantity {
  ref?: string
  type?: string
  quantity?: number | null
  status?: string
  updatedOn?: string
}

export interface RawFluentCommerceInventoryPosition {
  ref: string
  productRef?: string
  locationRef?: string
  onHand?: number | null
  status?: string
  createdOn?: string
  updatedOn?: string
  quantities?: {
    edges?: Array<{ node?: RawFluentCommerceInventoryQuantity | null } | null> | null
  } | null
  [key: string]: unknown
}

function quantityNodes(raw: RawFluentCommerceInventoryPosition): RawFluentCommerceInventoryQuantity[] {
  return (raw.quantities?.edges ?? []).flatMap((e) => (e?.node ? [e.node] : []))
}

/**
 * The FIRST record of `type`. The queries select `quantities` with `type`
 * and `first`, so the nested connection's documented default of 10 records
 * no longer hides a RESERVED or LAST_ON_HAND record behind other ones
 * (index.ts, QUANTITIES_SELECTION).
 *
 * Known gap, not yet settled against Fluent's docs: a position can hold
 * several RESERVED records (a quantity carries an `associationType`, "A type
 * of association with an external entity (e.g. purchase order, in-transit
 * shipment, fulfilment)", on the InventoryPosition schema page). Whether the
 * committed figure is the first one, a sum, or a sum over some statuses
 * depends on which statuses count and whether `onHand` is already net. The
 * query now fetches up to 5,000 RESERVED records, so a sum here costs no
 * extra request. The server-side sum,
 * `quantitiesAggregate(type: ["RESERVED"]) { sum }` (output type
 * https://api.production.shared-sydney-01.fluentcommerce.com/graphql/docs/object/inventoryquantityaggregateoutput/:
 * "sum ( Int ) the sum of inventory position entries"), is weighted:
 * "If the Inventory Quantity Aggregation is encountered within the supplied
 * GraphQL query, then the resulting node complexity is multiplied by the
 * weight (x10)."
 * (https://docs.fluentcommerce.com/essential-knowledge/graphql-query-limits).
 * Nested once per position, that makes a page 1 + 10 × first queries: 50,001
 * at the declared maxPageSize of 5000, over the 11,111 limit on the same page.
 * It would fit only pages of at most 1,111 positions, which would break the
 * paging maximum.
 */
function findQuantity(
  quantities: RawFluentCommerceInventoryQuantity[],
  type: ReadQuantityType,
): number | undefined {
  const entry = quantities.find((q) => q.type === type)
  return entry?.quantity != null ? pickNum(entry.quantity) : undefined
}

export function transformStockLevel(raw: RawFluentCommerceInventoryPosition): StockLevel {
  const productId = raw.productRef ?? ''
  const locationId = raw.locationRef ?? ''
  const qtys = quantityNodes(raw)
  const reserved = findQuantity(qtys, 'RESERVED')

  return {
    id: raw.ref,
    productId,
    locationId,
    quantityOnHand: raw.onHand ?? findQuantity(qtys, 'LAST_ON_HAND') ?? 0,
    quantityAvailable:
      raw.onHand != null && reserved != null ? raw.onHand - reserved : undefined,
    quantityCommitted: reserved,
    platform: 'fluent-commerce',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
