import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface CorreosRateResponse {
  codigoServicio: string
  nombreServicio: string
  precio?: number
  moneda?: string
  fechaEntregaEstimada?: string
  [key: string]: unknown
}

export interface CorreosRatesResponse {
  tarifas: CorreosRateResponse[]
  [key: string]: unknown
}

export function transformRate(raw: CorreosRateResponse): Rate {
  return {
    id: undefined,
    carrierId: 'correos',
    serviceCode: raw.codigoServicio ?? undefined,
    serviceName: raw.nombreServicio ?? undefined,
    currency: raw.moneda ?? 'EUR',
    totalAmount: parseDecimal(raw.precio),
    estimatedDeliveryAt: toISODate(raw.fechaEntregaEstimada),
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
