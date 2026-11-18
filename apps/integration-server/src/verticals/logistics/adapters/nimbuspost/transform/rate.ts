/**
 * NimbusPost — rate transform
 *
 * POST /courier/serviceability — returns freight rate options between
 * origin and destination pincodes, filtered by weight.
 *
 * Confirmed endpoint:
 * https://github.com/tech-nimbuspost/nimbuspost-api/blob/main/src/Module/V2/CourierModule.php
 * Postman docs: https://documenter.getpostman.com/view/9692837/TW6wHnoz#4dc571fd-6edb-4e59-a1c4-7ed39e9cc2f0
 */
import type { Rate } from '../../../schema/rate'
import { toISODate, parseDecimal } from '../../shared/transform'

export interface NimbusPostRateRaw {
  id?: string | number | null
  courier_id?: string | number | null
  courier_code?: string | null
  courier_name?: string | null
  service_code?: string | null
  service_name?: string | null
  name?: string | null
  code?: string | null
  currency?: string | null
  total?: number | string | null
  amount?: number | string | null
  freight?: number | string | null
  retail_amount?: number | string | null
  transit_days?: number | string | null
  estimated_delivery?: string | null
  is_guaranteed?: boolean | null
  [key: string]: unknown
}

export function transformRate(raw: NimbusPostRateRaw): Rate {
  const totalAmount = parseDecimal(raw.total ?? raw.amount ?? raw.freight)
  const retailAmount = parseDecimal(raw.retail_amount)

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    carrierId: raw.courier_code ?? (raw.courier_id != null ? String(raw.courier_id) : 'nimbuspost'),
    serviceCode: raw.service_code ?? raw.code ?? undefined,
    serviceName: raw.service_name ?? raw.courier_name ?? raw.name ?? undefined,
    currency: raw.currency ?? 'INR',
    totalAmount,
    retailAmount,
    transitDays: raw.transit_days != null ? Number(raw.transit_days) : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    isGuaranteedDelivery: raw.is_guaranteed ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
