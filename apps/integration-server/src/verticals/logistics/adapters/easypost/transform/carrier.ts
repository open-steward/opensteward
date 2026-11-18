import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface EasyPostCarrierAccount {
  id: string
  object: 'CarrierAccount'
  type: string                        // e.g. "UpsAccount", "UspsAccount"
  readable: string | null             // human-readable carrier name
  description: string | null          // user-supplied label
  billing_type: string | null
  credentials: Record<string, unknown> | null
  test_credentials: Record<string, unknown> | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

/**
 * Derive a tracking URL template from a well-known carrier type string.
 * Returns undefined for unrecognised carriers.
 */
function trackingUrlTemplate(type: string): string | undefined {
  const t = type.toLowerCase()
  if (t.includes('ups'))   return 'https://www.ups.com/track?tracknum={trackingNumber}'
  if (t.includes('usps'))  return 'https://tools.usps.com/go/TrackConfirmAction?tLabels={trackingNumber}'
  if (t.includes('fedex')) return 'https://www.fedex.com/apps/fedextrack/?tracknumbers={trackingNumber}'
  if (t.includes('dhl'))   return 'https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}'
  if (t.includes('ontrac'))return 'https://www.ontrac.com/tracking/?number={trackingNumber}'
  return undefined
}

export function transformCarrier(raw: EasyPostCarrierAccount): Carrier {
  return {
    id: raw.id,
    name: raw.readable ?? raw.type,
    code: raw.type,
    trackingUrlTemplate: trackingUrlTemplate(raw.type),
    isActive: true,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
