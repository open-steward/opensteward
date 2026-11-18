import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

/**
 * Raw tariff item from CDEK POST /calculator/tarifflist response.
 */
export interface CdekTariff {
  tariff_code?: number | null
  tariff_name?: string | null
  tariff_description?: string | null
  delivery_mode?: number | null
  delivery_sum?: number | null
  currency_code?: string | null
  period_min?: number | null
  period_max?: number | null
  calendar_min?: number | null
  calendar_max?: number | null
  [key: string]: unknown
}

/**
 * Raw response from POST /calculator/tariff (single tariff calculation).
 */
export interface CdekTariffCalcResponse {
  delivery_sum?: number | null
  currency_code?: string | null
  period_min?: number | null
  period_max?: number | null
  calendar_min?: number | null
  calendar_max?: number | null
  errors?: Array<{ code: string; message: string }> | null
  [key: string]: unknown
}

export function transformTariff(raw: CdekTariff): Rate {
  return {
    id: raw.tariff_code != null ? String(raw.tariff_code) : undefined,
    carrierId: 'cdek',
    serviceCode: raw.tariff_code != null ? String(raw.tariff_code) : undefined,
    serviceName: raw.tariff_name ?? undefined,
    currency: (raw.currency_code as string) ?? undefined,
    totalAmount: raw.delivery_sum ?? undefined,
    transitDays: raw.period_min ?? undefined,
    deliveryDays: raw.period_max ?? undefined,
    isGuaranteedDelivery: false,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformTariffCalc(raw: CdekTariffCalcResponse, tariffCode?: number): Rate {
  return {
    id: tariffCode != null ? String(tariffCode) : undefined,
    carrierId: 'cdek',
    serviceCode: tariffCode != null ? String(tariffCode) : undefined,
    currency: (raw.currency_code as string) ?? undefined,
    totalAmount: raw.delivery_sum ?? undefined,
    transitDays: raw.period_min ?? undefined,
    deliveryDays: raw.period_max ?? undefined,
    isGuaranteedDelivery: false,
    // CDEK does not return a date for rate responses; toISODate guards against undefined
    estimatedDeliveryAt: toISODate(undefined),
    metadata: raw as Record<string, unknown>,
  }
}
