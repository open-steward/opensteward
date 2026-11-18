/**
 * What the inventory sandbox serves.
 *
 * The most regular vertical in the repo: seven resources, `list` and `get` on
 * every one, no writes, no actions, no parents, no singletons. Fourteen
 * methods and nothing to say about any of them.
 *
 * One thing to get right: this vertical spells its multi-word resources with
 * HYPHENS, not underscores. The routers declare `RESOURCE = 'purchase-orders'`
 * and route `/purchase-orders`, where docsign has `audit_trail_entries`,
 * payments has `balance_transactions` and ecommerce has `inventory_levels`.
 * `resourceType` is both the storage key and the path segment, so it takes
 * the constant exactly as written.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and its adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  LocationSchema,
  ProductSchema,
  PurchaseOrderSchema,
  StockAdjustmentSchema,
  StockLevelSchema,
  StockTransferSchema,
  SupplierSchema,
} from '../schema'

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  {
    resourceType: 'products',
    schema: ProductSchema,
    list: 'listProducts',
    get: 'getProduct',
    seed: 3,
  },
  {
    // One, for the same reason ecommerce's inventory_levels is one: this
    // record's identity IS the pair it names. The schema says so — "Id is
    // synthetic `<productId>:<locationId>` for platforms that don't expose a
    // stable stock-level id (most don't)". Fixtures vary a record's `id` per
    // index but not the fields it is derived from, so three of these seeded
    // as three rows claiming the same product at the same location, with ids
    // that only differ by a suffix the schema does not sanction.
    //
    // These two are the only composite ids in the eight manifests; the rest
    // carry an identity of their own and seed three happily.
    resourceType: 'stock-levels',
    schema: StockLevelSchema,
    list: 'listStockLevels',
    get: 'getStockLevel',
    seed: 1,
  },
  {
    resourceType: 'locations',
    schema: LocationSchema,
    list: 'listLocations',
    get: 'getLocation',
    seed: 2,
  },
  {
    resourceType: 'suppliers',
    schema: SupplierSchema,
    list: 'listSuppliers',
    get: 'getSupplier',
    seed: 3,
  },
  {
    resourceType: 'purchase-orders',
    schema: PurchaseOrderSchema,
    list: 'listPurchaseOrders',
    get: 'getPurchaseOrder',
    seed: 3,
  },
  {
    resourceType: 'stock-transfers',
    schema: StockTransferSchema,
    list: 'listStockTransfers',
    get: 'getStockTransfer',
    seed: 3,
  },
  {
    resourceType: 'stock-adjustments',
    schema: StockAdjustmentSchema,
    list: 'listStockAdjustments',
    get: 'getStockAdjustment',
    seed: 3,
  },
]
