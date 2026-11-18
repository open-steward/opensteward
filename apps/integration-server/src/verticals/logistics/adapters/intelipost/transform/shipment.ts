import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ─── Intelipost raw types ────────────────────────────────────────────────────
//
// Every field below is read from the documented 200 response of
// `GET /shipment_order/{pedido_de_entrega}` ("Consultar pedido de entrega") in
// Intelipost's TMS Embarcador OpenAPI export:
// https://stoplight.io/api/v1/projects/intelipost/tms-embarcador/nodes/reference/openapi.json?fromExportButton=true&snapshotType=http_service
// `GET /shipment_order/tracking_code/{codigo_rastreamento}` returns the same
// object shape, as an array under `content`.

export interface IntelipostEndCustomer {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  shipping_address?: string | null
  shipping_number?: string | null
  shipping_additional?: string | null
  shipping_quarter?: string | null
  shipping_city?: string | null
  shipping_zip_code?: string | null
  shipping_state_code?: string | null
  /** Documented example value is "Brasil" — a name, not ISO 3166; not mapped. */
  shipping_country?: string | null
  [key: string]: unknown
}

export interface IntelipostVolumeLocation {
  address?: string | null
  number?: string | null
  additional?: string | null
  city?: string | null
  state_code?: string | null
  quarter?: string | null
  zip_code?: string | null
  [key: string]: unknown
}

export interface IntelipostVolumeStateHistoryEntry {
  shipment_order_volume_id?: number | null
  shipment_order_volume_state?: string | null
  created_iso?: string | null
  location?: IntelipostVolumeLocation | null
  shipment_order_volume_state_localized?: string | null
  /** Numeric id of this history entry, e.g. 2301840269. */
  shipment_order_volume_state_history?: number | null
  event_date_iso?: string | null
  [key: string]: unknown
}

export interface IntelipostVolumeProduct {
  id?: number | null
  description?: string | null
  sku?: string | null
  quantity?: number | null
  [key: string]: unknown
}

export interface IntelipostShipmentOrderVolume {
  shipment_order_volume_number?: string | null
  shipment_order_volume_state?: string | null
  products?: IntelipostVolumeProduct[] | null
  shipment_order_volume_id?: number | null
  tracking_code?: string | null
  shipment_order_volume_state_history_array?: IntelipostVolumeStateHistoryEntry[] | null
  [key: string]: unknown
}

export interface IntelipostShipmentOrderRaw {
  created_iso?: string | null
  delivery_method_id?: number | null
  order_number?: string | null
  end_customer?: IntelipostEndCustomer | null
  warehouse_address_id?: number | null
  origin_zip_code?: string | null
  estimated_delivery_date_iso?: string | null
  origin_quarter?: string | null
  origin_city?: string | null
  origin_state_code?: string | null
  origin_street?: string | null
  origin_number?: string | null
  modified_iso?: string | null
  sales_order_number?: string | null
  shipped_date_iso?: string | null
  logistic_provider_name?: string | null
  origin_customer_phone?: string | null
  origin_customer_email?: string | null
  origin_name?: string | null
  shipment_order_volume_array?: IntelipostShipmentOrderVolume[] | null
  [key: string]: unknown
}

// ─── Helpers shared by the order and tracking transforms ─────────────────────

export function nonEmpty(val: string | null | undefined): string | undefined {
  return val === null || val === undefined || val === '' ? undefined : val
}

function joined(...parts: Array<string | null | undefined>): string | undefined {
  return nonEmpty(parts.filter((p) => nonEmpty(p) !== undefined).join(', '))
}

function compact(addr: Address): Address | undefined {
  const entries = Object.entries(addr).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as Address) : undefined
}

/** The ship-to address, from the documented `end_customer.shipping_*` fields. */
export function destinationFromEndCustomer(
  c: IntelipostEndCustomer | null | undefined,
): Address | undefined {
  if (!c) return undefined
  return compact({
    name: nonEmpty([c.first_name, c.last_name].filter((p) => nonEmpty(p) !== undefined).join(' ')),
    street1: joined(c.shipping_address, c.shipping_number),
    street2: joined(c.shipping_additional, c.shipping_quarter),
    city: nonEmpty(c.shipping_city),
    state: nonEmpty(c.shipping_state_code),
    postalCode: nonEmpty(c.shipping_zip_code),
    phone: nonEmpty(c.phone),
    email: nonEmpty(c.email),
  })
}

/** The ship-from address, from the documented top-level `origin_*` fields. */
export function originFromOrder(raw: IntelipostShipmentOrderRaw): Address | undefined {
  return compact({
    name: nonEmpty(raw.origin_name),
    street1: joined(raw.origin_street, raw.origin_number),
    street2: nonEmpty(raw.origin_quarter),
    city: nonEmpty(raw.origin_city),
    state: nonEmpty(raw.origin_state_code),
    postalCode: nonEmpty(raw.origin_zip_code),
    phone: nonEmpty(raw.origin_customer_phone),
    email: nonEmpty(raw.origin_customer_email),
  })
}

/**
 * The response of GET /shipment_order/{pedido_de_entrega}, the one read this
 * adapter makes, carries state per volume only (`shipment_order_volume_state`)
 * and no order-level state field. The order state is documented, but on a
 * different endpoint: GET /shipment_order/read_status/{pedido_envio} returns
 * `content.shipment_order_state` ("Status atual do Pedido de Envio"). This
 * transform does not make that second request, so it returns the state every
 * volume shares, or undefined when the volumes disagree or there are none (a
 * mixed-state order therefore reads UNKNOWN/unknown).
 */
export function sharedVolumeState(raw: IntelipostShipmentOrderRaw): string | undefined {
  const states = new Set(
    (raw.shipment_order_volume_array ?? []).map((v) => v.shipment_order_volume_state ?? ''),
  )
  if (states.size !== 1) return undefined
  return nonEmpty([...states][0])
}

/** The single volume of a one-volume order, else undefined. */
export function onlyVolume(
  raw: IntelipostShipmentOrderRaw,
): IntelipostShipmentOrderVolume | undefined {
  const volumes = raw.shipment_order_volume_array ?? []
  return volumes.length === 1 ? volumes[0] : undefined
}

// ─── Status mapping ──────────────────────────────────────────────────────────
//
// The volume states are the documented `shipment_volume_state` values of
// `GET /tracking/micro_states` ("Buscar Micro Status").

function mapShipmentStatus(raw: string | undefined): ShipmentStatus {
  switch (raw) {
    case 'NEW':
    case 'CREATED_AT_LOGISTIC_PROVIDER':
      return 'PENDING'
    case 'LABEL_CREATED':
    case 'READY_FOR_SHIPPING':
    case 'WAITING_FOR_DROP_OFF':
      return 'LABEL_CREATED'
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'TO_BE_DELIVERED':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CLARIFY_ADDRESS':
    case 'CLARIFY_LABEL_FAIL':
    case 'CLARIFY_DELIVERY_FAIL':
    case 'DELIVERY_FAILED':
      return 'EXCEPTION'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformShipment(raw: IntelipostShipmentOrderRaw): Shipment {
  const single = onlyVolume(raw)
  return {
    id: nonEmpty(raw.order_number),
    reference: nonEmpty(raw.sales_order_number),
    status: mapShipmentStatus(sharedVolumeState(raw)),
    trackingNumber: nonEmpty(single?.tracking_code),
    carrierId: nonEmpty(raw.logistic_provider_name),
    serviceCode: raw.delivery_method_id != null ? String(raw.delivery_method_id) : undefined,
    warehouseId: raw.warehouse_address_id != null ? String(raw.warehouse_address_id) : undefined,
    originAddress: originFromOrder(raw),
    destinationAddress: destinationFromEndCustomer(raw.end_customer),
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date_iso),
    createdAt: toISODate(raw.created_iso),
    updatedAt: toISODate(raw.modified_iso),
    metadata: raw as Record<string, unknown>,
  }
}
