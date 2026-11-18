import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformAddress, type VenipakAddress } from './address'

/**
 * Venipak shipment as returned by the API (XML parsed to JSON/object).
 *
 * Venipak returns shipments embedded in a manifest response. The fields
 * below reflect the parsed XML structure.
 */
export interface VenipakPack {
  pack_no?: string | null        // tracking number assigned by Venipak
  weight?: string | number | null
  quantity?: string | number | null
  type?: string | null           // parcel type code
  [key: string]: unknown
}

export interface VenipakShipment {
  id?: string | null
  reference?: string | null
  status?: string | null
  tracking_no?: string | null
  label_url?: string | null
  consignor?: VenipakAddress | null
  sender?: VenipakAddress | null
  consignee?: VenipakAddress | null
  return_consignee?: VenipakAddress | null
  pack?: VenipakPack | VenipakPack[] | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case '0':
    case 'created':
    case 'pending':       return 'LABEL_CREATED'
    case '1':
    case 'in_transit':
    case 'transit':       return 'IN_TRANSIT'
    case '2':
    case 'out_for_delivery':
    case 'delivery':      return 'OUT_FOR_DELIVERY'
    case '3':
    case 'delivered':     return 'DELIVERED'
    case '4':
    case 'return':
    case 'returned':      return 'RETURNED'
    case '5':
    case 'exception':
    case 'error':         return 'EXCEPTION'
    case '6':
    case 'cancelled':     return 'CANCELLED'
    default:              return 'UNKNOWN'
  }
}

/**
 * Aggregate weight across all packs in a shipment.
 */
function aggregateWeight(pack: VenipakPack | VenipakPack[] | null | undefined): number | undefined {
  if (!pack) return undefined
  const packs = Array.isArray(pack) ? pack : [pack]
  let total = 0
  for (const p of packs) {
    const w = parseDecimal(p.weight)
    if (w !== undefined) total += w
  }
  return total > 0 ? total : undefined
}

/**
 * Extract the primary tracking number from pack(s).
 */
function extractTrackingNumber(
  raw: VenipakShipment,
): string | undefined {
  if (raw.tracking_no) return String(raw.tracking_no)
  const pack = raw.pack
  if (!pack) return undefined
  const first = Array.isArray(pack) ? pack[0] : pack
  return first?.pack_no ?? undefined
}

export function transformShipment(raw: VenipakShipment): Shipment {
  const weightKg = aggregateWeight(raw.pack)

  return {
    id: raw.id ?? raw.reference ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: extractTrackingNumber(raw),
    carrierId: 'venipak',
    originAddress: raw.sender
      ? transformAddress(raw.sender)
      : raw.consignor
        ? transformAddress(raw.consignor)
        : undefined,
    destinationAddress: raw.consignee ? transformAddress(raw.consignee) : undefined,
    returnAddress: raw.return_consignee ? transformAddress(raw.return_consignee) : undefined,
    totalWeight: weightKg !== undefined ? toWeight(weightKg, 'kg') : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Build the XML body for a Venipak shipment creation request.
 *
 * Venipak requires XML POSTed as `xml_text` form field to `import/send.php`.
 * Bold fields in Venipak docs are required; we use fallbacks for optional ones.
 */
export function buildShipmentXml(data: Partial<Shipment>, manifestId?: string): string {
  const ref = data.reference ?? `ref-${Date.now()}`
  const mId = manifestId ?? ref
  const dest = data.destinationAddress
  const orig = data.originAddress

  const consigneeName = dest?.company ?? dest?.name ?? ''
  const consigneeAddr = dest?.street1 ?? ''
  const consigneeCity = dest?.city ?? ''
  const consigneePostcode = dest?.postalCode ?? ''
  const consigneeCountry = dest?.country ?? 'LT'
  const consigneePhone = dest?.phone ?? ''
  const consigneeEmail = dest?.email ?? ''

  const senderName = orig?.company ?? orig?.name ?? ''
  const senderAddr = orig?.street1 ?? ''
  const senderCity = orig?.city ?? ''
  const senderPostcode = orig?.postalCode ?? ''
  const senderCountry = orig?.country ?? 'LT'
  const senderPhone = orig?.phone ?? ''

  const weightKg = data.totalWeight?.value != null
    ? (data.totalWeight.unit === 'kg'
        ? data.totalWeight.value
        : data.totalWeight.unit === 'g'
          ? data.totalWeight.value / 1000
          : data.totalWeight.value)
    : 1

  return `<?xml version="1.0" encoding="utf-8"?>
<description>
  <manifest manifest_id="${esc(mId)}">
    <shipment>
      <sender>
        <name>${esc(senderName)}</name>
        <address>${esc(senderAddr)}</address>
        <city>${esc(senderCity)}</city>
        <postcode>${esc(senderPostcode)}</postcode>
        <country>${esc(senderCountry)}</country>
        <phone>${esc(senderPhone)}</phone>
      </sender>
      <consignee>
        <name>${esc(consigneeName)}</name>
        <address>${esc(consigneeAddr)}</address>
        <city>${esc(consigneeCity)}</city>
        <postcode>${esc(consigneePostcode)}</postcode>
        <country>${esc(consigneeCountry)}</country>
        <phone>${esc(consigneePhone)}</phone>
        <email>${esc(consigneeEmail)}</email>
      </consignee>
      <pack>
        <weight>${weightKg}</weight>
        <quantity>1</quantity>
      </pack>
    </shipment>
  </manifest>
</description>`
}

function esc(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
