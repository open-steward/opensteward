import type { Address } from '../../../schema/shared'

/**
 * A Transportify location object, as returned inside delivery responses.
 * Locations are used as both pickup and dropoff points.
 */
export interface TransportifyLocation {
  address: string | null
  latitude: number | null
  longitude: number | null
  recipient_name: string | null
  recipient_phone: string | null
  note: string | null
  is_payer: boolean | null
  need_cod: boolean | null
  need_pod: boolean | null
  cod_invoice_fees: number | null
  [key: string]: unknown
}

/**
 * Transform a Transportify location into a canonical Address.
 * Returns undefined when the location is absent or has no address data.
 */
export function transformLocation(raw: TransportifyLocation | null | undefined): Address | undefined {
  if (!raw) return undefined
  if (!raw.address && !raw.recipient_name && !raw.recipient_phone) return undefined

  return {
    name: raw.recipient_name ?? undefined,
    street1: raw.address ?? undefined,
    phone: raw.recipient_phone ?? undefined,
  }
}
