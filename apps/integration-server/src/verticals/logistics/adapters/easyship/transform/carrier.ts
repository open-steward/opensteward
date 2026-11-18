/**
 * Easyship courier → canonical Carrier.
 *
 * Easyship exposes connected couriers via `GET /couriers` (v2 API).
 * Each entry represents an activated courier account the merchant has
 * linked to Easyship.
 *
 * Docs: https://developers.easyship.com/reference/couriers
 */

import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface EasyshipCourier {
  id?: string
  name?: string | null
  code?: string | null
  tracking_url_template?: string | null
  is_active?: boolean | null
  services?: Array<{
    service_code?: string
    service_name?: string
    [key: string]: unknown
  }>
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: EasyshipCourier): Carrier {
  return {
    id: raw.id ?? undefined,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    trackingUrlTemplate: raw.tracking_url_template ?? undefined,
    services: (raw.services ?? []).map((s) => ({
      code: s.service_code ?? '',
      name: s.service_name ?? undefined,
    })),
    isActive: raw.is_active ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
