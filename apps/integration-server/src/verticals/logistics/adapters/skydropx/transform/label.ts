import type { Label, LabelFormat, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import {
  isAbsoluteUrl,
  packageTrackingNumber,
  type SkydropxPackage,
  type SkydropxShipment,
} from './shipment'
import { parseZonedDate } from './tracking'

/**
 * Skydropx label JSON:API resource attributes.
 */
export interface SkydropxLabelAttributes {
  created_at?: string | null
  updated_at?: string | null
  status?: string | null
  tracking_number?: string | null
  tracking_status?: string | null
  label_url?: string | null
  tracking_url_provider?: string | null
  rate_id?: number | null
  [key: string]: unknown
}

/**
 * Full Skydropx label JSON:API resource.
 */
export interface SkydropxLabel {
  id?: string
  type?: string
  attributes?: SkydropxLabelAttributes
  [key: string]: unknown
}

/**
 * Single label response wrapper.
 */
export interface SkydropxLabelResponse {
  data?: SkydropxLabel
  [key: string]: unknown
}

function mapLabelStatus(status: string | null | undefined): LabelStatus | undefined {
  if (!status) return undefined
  switch (status.toUpperCase()) {
    case 'CREATED':   return 'CREATED'
    case 'USED':      return 'USED'
    case 'REFUNDED':  return 'REFUNDED'
    case 'VOIDED':    return 'VOIDED'
    default:          return undefined
  }
}

// Skydropx labels are always PDF format
function mapLabelFormat(_format: string | null | undefined): LabelFormat {
  return 'PDF'
}

export function transformLabel(raw: SkydropxLabel): Label {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id ?? undefined,
    trackingNumber: attrs.tracking_number ?? undefined,
    format: mapLabelFormat(null),
    status: mapLabelStatus(attrs.status) ?? 'CREATED',
    url: attrs.label_url ?? undefined,
    createdAt: toISODate(attrs.created_at),
    updatedAt: toISODate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * A label read out of the Skydropx PRO shipments list. The API has no label
 * collection and no label lookup; what it documents is the package resource
 * in a shipment's `included`, whose `label_url` is "URL de la guía" (the
 * shipping label). One package with a hosted label is one Label, keyed by the
 * package's UUID ("UUID del paquete"). A package without an absolute
 * `label_url` has no label yet and yields none. Format and status are not
 * documented on the package, so they are left out.
 */
export function transformPackageLabel(
  pkg: SkydropxPackage,
  shipment: SkydropxShipment,
): Label | undefined {
  const a = pkg.attributes ?? {}
  if (!pkg.id || !isAbsoluteUrl(a.label_url)) return undefined
  return {
    id: pkg.id,
    shipmentId: shipment.id,
    trackingNumber: packageTrackingNumber(pkg),
    carrierId: shipment.attributes?.carrier_name ?? undefined,
    url: a.label_url,
    createdAt: parseZonedDate(a.created_at),
    updatedAt: parseZonedDate(a.updated_at),
    metadata: pkg as Record<string, unknown>,
  }
}
