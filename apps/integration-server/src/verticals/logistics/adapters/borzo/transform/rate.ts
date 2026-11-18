import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// ─── Borzo raw types ───────────────────────────────────────────────────────

export interface BorzoCalculateResponse {
  is_successful: boolean
  order?: {
    payment_amount?: string | null
    delivery_fee_amount?: string | null
    weight_fee_amount?: string | null
    insurance_fee_amount?: string | null
    loading_fee_amount?: string | null
    vehicle_type_id?: number | null
    [key: string]: unknown
  } | null
  errors?: unknown[]
  [key: string]: unknown
}

// ─── Vehicle type label mapping ─────────────────────────────────────────────

function vehicleTypeLabel(vehicleTypeId: number | null | undefined): string {
  switch (vehicleTypeId) {
    case 7:  return 'Bicycle'
    case 8:  return 'Motorbike'
    case 9:  return 'Car'
    case 10: return 'Cargo Car'
    default: return 'Standard Delivery'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: BorzoCalculateResponse): Rate {
  const order = raw.order ?? {}
  const vehicleTypeId = order.vehicle_type_id ?? undefined
  const totalAmountStr = order.payment_amount ?? undefined
  const totalAmount = totalAmountStr !== undefined ? parseDecimal(totalAmountStr) : undefined

  return {
    carrierId: 'borzo',
    serviceCode: vehicleTypeId != null ? String(vehicleTypeId) : undefined,
    serviceName: vehicleTypeLabel(vehicleTypeId ?? null),
    currency: 'INR',
    totalAmount: totalAmount !== undefined && !isNaN(totalAmount) ? totalAmount : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
