/**
 * What the ecommerce sandbox serves.
 *
 * The largest vertical — 43 resource methods across eleven routers. Products,
 * variants, collections, customers and discounts are plain CRUD; locations is
 * read-only; orders and fulfillments carry ordinary record-scoped `cancel`
 * verbs.
 *
 * Inventory levels are worth stating precisely because adjust/set are the
 * only actions with **no record id**:
 *
 *   POST /inventory_levels/adjust   →  adjustInventoryLevel(credentials, body)
 *   POST /inventory_levels/set      →  setInventoryLevel(credentials, body)
 *
 * Every other action takes an id from the path. These name their target
 * inside the body — `{ variantId, locationId, … }` — so the manifest marks
 * them `scope: 'collection'` and declares `keyBy` to say which body fields
 * identify the record. Without `keyBy` there is no way to know: matching on
 * every body field that is also a schema field happens to work for `adjust`
 * only because `delta` is not one, and fails outright for `set`, whose
 * `available` is both a schema field and the value being written.
 *
 * `adjust` also carries `adds`, which no other action needs. The delta IS the
 * verb — an `adjust` that returns the record unchanged says nothing — so the
 * quantity is applied rather than named as a limitation.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and its adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  CollectionSchema,
  CustomerSchema,
  DiscountSchema,
  FulfillmentSchema,
  InventoryLevelSchema,
  LocationSchema,
  OrderSchema,
  ProductSchema,
  ProductVariantSchema,
  RefundSchema,
  TransactionSchema,
} from '../schema'

/** A variant's stock at a location is identified by the pair, not by an id. */
const BY_VARIANT_AND_LOCATION = ['variantId', 'locationId'] as const

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  {
    resourceType: 'products',
    schema: ProductSchema,
    list: 'listProducts',
    get: 'getProduct',
    create: 'createProduct',
    update: 'updateProduct',
    delete: 'deleteProduct',
    seed: 3,
  },
  {
    // The router file is `variants.ts` and the methods are `listVariants` /
    // `createVariant`, but the schema is `ProductVariantSchema`. Two
    // spellings of one concept, as usual.
    resourceType: 'variants',
    schema: ProductVariantSchema,
    list: 'listVariants',
    get: 'getVariant',
    create: 'createVariant',
    update: 'updateVariant',
    delete: 'deleteVariant',
    seed: 3,
  },
  {
    resourceType: 'collections',
    schema: CollectionSchema,
    list: 'listCollections',
    get: 'getCollection',
    create: 'createCollection',
    update: 'updateCollection',
    delete: 'deleteCollection',
    seed: 3,
  },
  {
    // Read-only: locations are configured in the platform's admin.
    resourceType: 'locations',
    schema: LocationSchema,
    list: 'listLocations',
    get: 'getLocation',
    seed: 2,
  },
  {
    resourceType: 'inventory_levels',
    schema: InventoryLevelSchema,
    list: 'listInventoryLevels',
    get: 'getInventoryLevel',
    actions: {
      adjust: {
        method: 'adjustInventoryLevel',
        scope: 'collection',
        keyBy: BY_VARIANT_AND_LOCATION,
        adds: { available: 'delta' },
      },
      set: {
        method: 'setInventoryLevel',
        scope: 'collection',
        keyBy: BY_VARIANT_AND_LOCATION,
        // No `sets` and no `adds`: the body's `available` is a schema field,
        // so merging the known fields already writes the absolute value the
        // verb is named for.
      },
    },
    // One, not the usual three. A stock level is identified by its (variant,
    // location) pair — the schema says so outright, telling adapters to
    // synthesize `${variantId}:${locationId}` when the platform has no id of
    // its own. Fixtures vary the `id` field per record but not the fields it
    // is derived from, so three of these seeded as three rows claiming the
    // same variant at the same location: data that cannot exist, and a keyed
    // lookup with three indistinguishable candidates. Seeding one is the
    // honest count. Making the fixture vary `variantId` per record would fix
    // it more deeply, but that is a change to how every vertical's fixtures
    // are generated, not a change to this manifest.
    seed: 1,
  },
  {
    resourceType: 'customers',
    schema: CustomerSchema,
    list: 'listCustomers',
    get: 'getCustomer',
    create: 'createCustomer',
    update: 'updateCustomer',
    delete: 'deleteCustomer',
    seed: 3,
  },
  {
    resourceType: 'orders',
    schema: OrderSchema,
    list: 'listOrders',
    get: 'getOrder',
    create: 'createOrder',
    update: 'updateOrder',
    actions: {
      cancel: { method: 'cancelOrder', sets: { financialStatus: 'VOIDED' } },
    },
    seed: 3,
  },
  {
    resourceType: 'fulfillments',
    schema: FulfillmentSchema,
    list: 'listFulfillments',
    get: 'getFulfillment',
    create: 'createFulfillment',
    update: 'updateFulfillment',
    actions: {
      cancel: { method: 'cancelFulfillment', sets: { status: 'CANCELLED' } },
    },
    seed: 3,
  },
  {
    resourceType: 'refunds',
    schema: RefundSchema,
    list: 'listRefunds',
    get: 'getRefund',
    create: 'createRefund',
    seed: 3,
  },
  {
    resourceType: 'transactions',
    schema: TransactionSchema,
    list: 'listTransactions',
    get: 'getTransaction',
    create: 'createTransaction',
    seed: 3,
  },
  {
    resourceType: 'discounts',
    schema: DiscountSchema,
    list: 'listDiscounts',
    get: 'getDiscount',
    create: 'createDiscount',
    update: 'updateDiscount',
    delete: 'deleteDiscount',
    seed: 3,
  },
]
