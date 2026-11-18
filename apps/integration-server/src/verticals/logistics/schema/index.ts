/**
 * Canonical schema barrel for the logistics vertical. The OpenAPI generator
 * walks every Zod schema exported from this file and registers it under
 * `components.schemas`. Always re-export new schemas here.
 */

// Shared primitives (Address, Weight, Dimensions, Package, Money)
export * from './shared'

// Connections (per-vertical view of the connection record)
export * from './connection'

// Carriers
export { CarrierSchema } from './carrier'
export type { Carrier } from './carrier'

// Labels
export { LabelFormatSchema, LabelStatusSchema, LabelSchema } from './label'
export type { LabelFormat, LabelStatus, Label } from './label'

// Manifests
export { ManifestStatusSchema, ManifestSchema } from './manifest'
export type { ManifestStatus, Manifest } from './manifest'

// Pickups (Class B, RPC-shaped like rates — no sync entry)
export { PickupStatusSchema, PickupSchema } from './pickup'
export type { PickupStatus, Pickup } from './pickup'

// Shipments
export {
  ShipmentStatusSchema,
  ShipmentModeSchema,
  OceanFieldsSchema,
  ShipmentSchema,
} from './shipment'
export type { ShipmentStatus, ShipmentMode, OceanFields, Shipment } from './shipment'

// Rates
export { RateSchema } from './rate'
export type { Rate } from './rate'

// Orders (logistics-side orders / dispatches)
export { OrderStatusSchema, OrderSchema } from './order'
export type { OrderStatus, Order } from './order'

// Tracking events
export * from './trackingevent'

// Warehouses
export * from './warehouse'

// Webhook envelope
export * from './webhook'
