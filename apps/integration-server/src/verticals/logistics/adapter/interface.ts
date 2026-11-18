import type { WebhookEvent } from '../schema/webhook'
import type { Shipment } from '../schema/shipment'
import type { Order } from '../schema/order'
import type { Carrier } from '../schema/carrier'
import type { Warehouse } from '../schema/warehouse'
import type { TrackingEvent } from '../schema/trackingevent'
import type { Rate } from '../schema/rate'
import type { Label } from '../schema/label'
import type { Manifest } from '../schema/manifest'
import type { Pickup } from '../schema/pickup'
import type { Address, Package } from '../schema/shared'

export type { Credentials } from '@opensteward/shared'
export type { QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

export type RateRequestParams = {
  originAddress: Address
  destinationAddress: Address
  packages: Package[]
  serviceCodes?: string[]
  [key: string]: unknown
}

/**
 * Body of `POST /pickups`. The named keys are what every carrier asks for;
 * account numbers, `carrierCode`, `serviceCode` and other platform specifics
 * ride on the index signature, as they do on `RateRequestParams`.
 */
export type PickupRequestParams = {
  address: Address
  readyAt: Date
  closeAt?: Date
  carrierId?: string
  shipmentIds?: string[]
  packages?: Package[]
  instructions?: string
  [key: string]: unknown
}

/**
 * Body of `POST /pickups/:id/cancel`. Most carriers cancel by id alone; FedEx
 * needs `carrierCode` + `scheduledDate` + `location` and DHL `requestorName` +
 * `reason`, which arrive through the index signature.
 */
export type PickupCancelParams = {
  reason?: string
  [key: string]: unknown
}

/**
 * LogisticsAdapter — extends BaseAdapter with logistics-specific resource methods.
 * Auth and webhook methods are inherited from BaseAdapter.
 */
export interface LogisticsAdapter extends BaseAdapter {
  // Webhooks (refined return type)
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // Shipments
  listShipments?(credentials: Credentials, params: QueryParams): Promise<Shipment[]>
  getShipment?(credentials: Credentials, id: string): Promise<Shipment>
  createShipment?(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment>
  cancelShipment?(credentials: Credentials, id: string): Promise<void>

  // Orders
  listOrders?(credentials: Credentials, params: QueryParams): Promise<Order[]>
  getOrder?(credentials: Credentials, id: string): Promise<Order>
  createOrder?(credentials: Credentials, data: Partial<Order>): Promise<Order>
  updateOrder?(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order>
  cancelOrder?(credentials: Credentials, id: string): Promise<void>

  // Carriers
  listCarriers?(credentials: Credentials, params: QueryParams): Promise<Carrier[]>
  getCarrier?(credentials: Credentials, id: string): Promise<Carrier>

  // Warehouses
  listWarehouses?(credentials: Credentials, params: QueryParams): Promise<Warehouse[]>
  getWarehouse?(credentials: Credentials, id: string): Promise<Warehouse>

  // Tracking Events
  listTrackingEvents?(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]>
  /**
   * @param carrier Optional carrier hint, to disambiguate a tracking number
   *   that collides across carriers. Optional on purpose: an implementation
   *   that ignores it stays structurally compatible, so the 300-odd adapters
   *   with no use for it are untouched.
   */
  getTrackingEvents?(
    credentials: Credentials,
    trackingNumber: string,
    carrier?: string,
  ): Promise<TrackingEvent[]>

  // Rates
  getRates?(credentials: Credentials, params: RateRequestParams): Promise<Rate[]>

  // Labels
  listLabels?(credentials: Credentials, params: QueryParams): Promise<Label[]>
  getLabel?(credentials: Credentials, id: string): Promise<Label>
  createLabel?(credentials: Credentials, data: Partial<Label>): Promise<Label>
  voidLabel?(credentials: Credentials, id: string): Promise<void>

  // Manifests
  listManifests?(credentials: Credentials, params: QueryParams): Promise<Manifest[]>
  getManifest?(credentials: Credentials, id: string): Promise<Manifest>
  createManifest?(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest>

  // Pickups
  listPickups?(credentials: Credentials, params: QueryParams): Promise<Pickup[]>
  getPickup?(credentials: Credentials, id: string): Promise<Pickup>
  createPickup?(credentials: Credentials, data: PickupRequestParams): Promise<Pickup>
  cancelPickup?(credentials: Credentials, id: string, data?: PickupCancelParams): Promise<Pickup>
}
