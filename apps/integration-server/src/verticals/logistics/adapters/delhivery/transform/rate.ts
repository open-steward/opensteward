import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// ─── Delhivery raw types ───────────────────────────────────────────────────
// Source: GET https://track.delhivery.com/api/kinko/v1/invoice/charges/.json
// Params:  md (E=Express/S=Surface), cgm (weight grams), o_pin, d_pin, ss (status)
// Response returns approximate shipping charges.

export interface DelhiveryRateResponse {
  total_amount: number | null
  gross_amount: number | null
  tax_amount: number | null
  shipment_mode: string | null
  cod_charges: number | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: DelhiveryRateResponse, params: { md?: string }): Rate {
  const modeCode = params.md ?? raw.shipment_mode ?? undefined
  const serviceCode = modeCode === 'E' ? 'express' : modeCode === 'S' ? 'surface' : modeCode ?? undefined
  const serviceName = modeCode === 'E' ? 'Delhivery Express' : modeCode === 'S' ? 'Delhivery Surface' : 'Delhivery'

  // Delhivery returns amounts in INR; total_amount is in whole rupees (no paise conversion needed
  // since the platform does not subdivide — treat as minor units per canonical convention)
  const totalAmount = parseDecimal(raw.total_amount)

  return {
    carrierId: 'delhivery',
    serviceCode,
    serviceName,
    currency: 'INR',
    totalAmount: totalAmount != null ? Math.round(totalAmount * 100) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
