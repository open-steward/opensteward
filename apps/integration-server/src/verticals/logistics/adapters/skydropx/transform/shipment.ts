import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Package } from '../../../schema/shared'
import { transformAddress, type SkydropxAddress } from './address'
import { isSkydropxTrackingStatus, parseZonedDate, type SkydropxTrackingStatus } from './tracking'

/**
 * Shapes of the Skydropx PRO shipment responses, GET /api/v1/shipments
 * ("Recupera todos los envíos") and GET /api/v1/shipments/{id} ("Recupera un
 * envío"), from the first-party OpenAPI at
 * https://pro.skydropx.com/es-MX/api-docs.json. Only documented fields are
 * declared.
 */
export interface SkydropxRef {
  id?: string
  type?: string
}

export interface SkydropxShipment {
  id?: string
  type?: string
  attributes?: {
    id?: string | null
    carrier_name?: string | null
    workflow_status?: string | null
    payment_status?: string | null
    total?: string | null
    source?: string | null
    carrier_id?: string | null
    service_id?: string | null
    master_tracking_number?: string | null
    original_shipment_id?: string | null
    created_at?: string | null
    updated_at?: string | null
    [key: string]: unknown
  }
  relationships?: {
    packages?: { data?: SkydropxRef[] | null }
    address_from?: { data?: SkydropxRef | null }
    address_to?: { data?: SkydropxRef | null }
  }
}

/**
 * A package resource in `included`: "UUID del paquete", `tracking_number`
 * ("Número de seguimiento"), `tracking_status` ("Estado de seguimiento"),
 * `label_url` ("URL de la guía"). Weight and dimensions are documented without
 * a unit, so they are not mapped.
 */
export interface SkydropxPackage {
  id?: string
  type?: string
  attributes?: {
    id?: string | null
    package_type?: string | null
    weight?: string | null
    length?: string | null
    width?: string | null
    height?: string | null
    consignment_note?: string | null
    package_content?: string | null
    tracking_url_provider?: string | null
    tracking_status?: string | null
    // The docs type it as a string but give numeric examples (123123123123).
    tracking_number?: string | number | null
    label_url?: string | null
    created_at?: string | null
    updated_at?: string | null
  }
  relationships?: { shipment?: { data?: SkydropxRef | null } }
}

export type SkydropxIncluded = SkydropxPackage | SkydropxAddress

export interface SkydropxShipmentResponse {
  data?: SkydropxShipment | null
  included?: SkydropxIncluded[] | null
}

/** "meta": current_page, next_page, prev_page, total_pages, total_count. */
export interface SkydropxPageMeta {
  current_page?: number | null
  next_page?: number | null
  prev_page?: number | null
  total_pages?: number | null
  total_count?: number | null
}

export interface SkydropxShipmentsListResponse {
  data?: SkydropxShipment[] | null
  included?: SkydropxIncluded[] | null
  meta?: SkydropxPageMeta | null
}

const SHIPMENT_STATUS: Record<SkydropxTrackingStatus, ShipmentStatus> = {
  created: 'LABEL_CREATED',
  picked_up: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  last_mile: 'OUT_FOR_DELIVERY',
  delivery_attempt: 'EXCEPTION',
  delivered_to_branch: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  exception: 'EXCEPTION',
  in_return: 'RETURNED',
  canceled: 'CANCELLED',
  destroyed: 'EXCEPTION',
  retained: 'EXCEPTION',
}

/** Resolve a JSON:API relationship against `included`, by its own id AND type. */
export function findIncluded<T extends { id?: string; type?: string }>(
  included: readonly SkydropxIncluded[] | null | undefined,
  ref: SkydropxRef | null | undefined,
): T | undefined {
  if (!included || !ref?.id) return undefined
  return included.find((r) => r.id === ref.id && r.type === ref.type) as T | undefined
}

/** The shipment's packages, in the order its `relationships.packages` lists them. */
export function shipmentPackages(
  raw: SkydropxShipment,
  included: readonly SkydropxIncluded[] | null | undefined,
): SkydropxPackage[] {
  const refs = raw.relationships?.packages?.data ?? []
  return refs
    .map((ref) => findIncluded<SkydropxPackage>(included, ref))
    .filter((p): p is SkydropxPackage => p !== undefined)
}

export function packageTrackingNumber(p: SkydropxPackage): string | undefined {
  const t = p.attributes?.tracking_number
  if (typeof t === 'number') return String(t)
  return typeof t === 'string' && t !== '' ? t : undefined
}

export function isAbsoluteUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * The shipment status from its packages' `tracking_status`: the package that
 * carries the master tracking number, else the only package. A shipment with
 * several packages and no master match has no single status.
 */
function shipmentStatus(raw: SkydropxShipment, packages: SkydropxPackage[]): ShipmentStatus {
  const master = raw.attributes?.master_tracking_number
  const pkg =
    (master ? packages.find((p) => packageTrackingNumber(p) === master) : undefined) ??
    (packages.length === 1 ? packages[0] : undefined)
  const s = pkg?.attributes?.tracking_status
  return isSkydropxTrackingStatus(s) ? SHIPMENT_STATUS[s] : 'UNKNOWN'
}

export function transformShipment(
  raw: SkydropxShipment,
  included?: readonly SkydropxIncluded[] | null,
): Shipment {
  const attrs = raw.attributes ?? {}
  const rels = raw.relationships ?? {}
  const packages = shipmentPackages(raw, included)
  const from = findIncluded<SkydropxAddress>(included, rels.address_from?.data)
  const to = findIncluded<SkydropxAddress>(included, rels.address_to?.data)
  const onlyLabel = packages.length === 1 ? packages[0]!.attributes?.label_url : undefined

  const canonicalPackages: Package[] = packages.map((p) => ({
    id: p.id,
    trackingNumber: packageTrackingNumber(p),
  }))

  return {
    id: raw.id,
    status: shipmentStatus(raw, packages),
    trackingNumber: attrs.master_tracking_number ?? undefined,
    carrierId: attrs.carrier_name ?? undefined,
    originAddress: from ? transformAddress(from) : undefined,
    destinationAddress: to ? transformAddress(to) : undefined,
    packages: canonicalPackages.length > 0 ? canonicalPackages : undefined,
    labelUrl: isAbsoluteUrl(onlyLabel) ? onlyLabel : undefined,
    createdAt: parseZonedDate(attrs.created_at),
    updatedAt: parseZonedDate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
