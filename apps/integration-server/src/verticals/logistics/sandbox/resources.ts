/**
 * What the logistics sandbox serves.
 *
 * This vertical breaks three assumptions the other eight manifests share.
 *
 * **1. The route segment is not the resource type.** Tracking events declare
 * `RESOURCE = 'trackingevents'` and route `/tracking-events`. Everywhere else
 * the two strings are the same, so `resourceType` serves as both the storage
 * key and the URL. Here they genuinely differ, hence `path`.
 *
 * **2. A getter that returns a list.** `getTrackingEvents(credentials,
 * trackingNumber)` returns `TrackingEvent[]` — a `get*` name, a key that is
 * not an id, and an array coming back. It is a filtered list wearing a
 * getter's name; `getReturnsList` says which field it filters on, and the
 * sandbox returns the parcel's whole history rather than one event.
 *
 * **3. A list served by POST.** Rate shopping is `POST /rates` with the query
 * in the body, because an origin, a destination and a package list do not fit
 * in a URL. `getRates` still returns `Rate[]`, so it is declared as this
 * resource's `list` with `listMethod: 'POST'`.
 *
 * The rates the sandbox returns are the seeded ones, not quotes computed from
 * the body. Nothing here could price a shipment, and returning schema-valid
 * `Rate[]` is what a caller integrating against the endpoint needs.
 *
 * Three verbs are bound to DELETE and return `void` — `cancelShipment`,
 * `cancelOrder`, `voidLabel` — so they sit in the `delete` slot rather than
 * in `actions`, for the reason payments' `detachPaymentMethod` does: the
 * route's verb decides the slot, not the method's name.
 *
 * By the same rule `cancelPickup` is an ACTION, not a delete: the live route is
 * `POST /pickups/:id/cancel` and it answers 200 with the record, because FedEx
 * and DHL cannot cancel by id alone — their cancels carry a body a DELETE has
 * nowhere to put. `every-endpoint.test.ts` holds an action to a 200 with a
 * schema-valid record whose `sets` fields flipped, so the sandbox flips
 * `status` to `CANCELLED` rather than returning the record unchanged.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and its adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  CarrierSchema,
  LabelSchema,
  ManifestSchema,
  OrderSchema,
  PickupSchema,
  RateSchema,
  ShipmentSchema,
  TrackingEventSchema,
  WarehouseSchema,
} from '../schema'

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  {
    resourceType: 'shipments',
    schema: ShipmentSchema,
    list: 'listShipments',
    get: 'getShipment',
    create: 'createShipment',
    delete: 'cancelShipment',
    seed: 3,
  },
  {
    resourceType: 'orders',
    schema: OrderSchema,
    list: 'listOrders',
    get: 'getOrder',
    create: 'createOrder',
    update: 'updateOrder',
    delete: 'cancelOrder',
    seed: 3,
  },
  {
    resourceType: 'carriers',
    schema: CarrierSchema,
    list: 'listCarriers',
    get: 'getCarrier',
    seed: 2,
  },
  {
    resourceType: 'warehouses',
    schema: WarehouseSchema,
    list: 'listWarehouses',
    get: 'getWarehouse',
    seed: 2,
  },
  {
    // The constant is `trackingevents`; the route is `/tracking-events`.
    resourceType: 'trackingevents',
    path: 'tracking-events',
    schema: TrackingEventSchema,
    list: 'listTrackingEvents',
    get: 'getTrackingEvents',
    getReturnsList: { keyField: 'trackingNumber' },
    seed: 3,
  },
  {
    // No collection GET and no getter: the only route is POST /rates.
    resourceType: 'rates',
    schema: RateSchema,
    list: 'getRates',
    listMethod: 'POST',
    seed: 3,
  },
  {
    resourceType: 'labels',
    schema: LabelSchema,
    list: 'listLabels',
    get: 'getLabel',
    create: 'createLabel',
    delete: 'voidLabel',
    seed: 3,
  },
  {
    resourceType: 'manifests',
    schema: ManifestSchema,
    list: 'listManifests',
    get: 'getManifest',
    create: 'createManifest',
    seed: 3,
  },
  {
    // Cancel is an action returning 200 with the record, not the `delete`
    // slot — see the header. No sync entry: pickups are Class B, like rates.
    resourceType: 'pickups',
    schema: PickupSchema,
    list: 'listPickups',
    get: 'getPickup',
    create: 'createPickup',
    actions: { cancel: { method: 'cancelPickup', sets: { status: 'CANCELLED' } } },
    seed: 3,
  },
]
