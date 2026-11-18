import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'
import { NOVA_POSHTA_CARRIER_ID } from '../constants'

/**
 * Nova Poshta does not expose a GET /carriers endpoint.
 * The carrier is Nova Poshta itself — a single carrier with known identity.
 * This transform derives a canonical Carrier record from static metadata
 * and any runtime hints embedded in a raw response object.
 */
export interface NovaPoshtaCarrierRaw {
  id?: string | null
  name?: string | null
  code?: string | null
  trackingUrlTemplate?: string | null
  isActive?: boolean | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

/**
 * Build the static Nova Poshta carrier record.
 * Pass an empty object `{}` when there is no API response to map from.
 */
export function transformCarrier(raw: NovaPoshtaCarrierRaw = {}): Carrier {
  return {
    id: raw.id ?? NOVA_POSHTA_CARRIER_ID,
    name: raw.name ?? 'Nova Poshta',
    code: raw.code ?? NOVA_POSHTA_CARRIER_ID,
    trackingUrlTemplate:
      raw.trackingUrlTemplate ??
      'https://novaposhta.ua/tracking/?cargo_number={trackingNumber}',
    services: [
      { code: 'standard', name: 'Standard Delivery' },
      { code: 'economy', name: 'Economy Delivery' },
      { code: 'express', name: 'Express Delivery' },
    ],
    isActive: raw.isActive ?? true,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
