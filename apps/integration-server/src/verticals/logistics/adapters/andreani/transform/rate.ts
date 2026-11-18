import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Andreani raw types ────────────────────────────────────────────────────

export interface AndreaniRate {
  tarifa_id: string | null
  servicio: string | null
  servicio_nombre: string | null
  total: number | null
  moneda: string | null
  dias_transito: number | null
  fecha_entrega: string | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformRate(raw: AndreaniRate): Rate {
  return {
    id: raw.tarifa_id ?? undefined,
    carrierId: 'andreani',
    serviceCode: raw.servicio ?? undefined,
    serviceName: raw.servicio_nombre ?? undefined,
    currency: raw.moneda ?? 'ARS',
    totalAmount: parseDecimal(raw.total),
    transitDays: raw.dias_transito ?? undefined,
    deliveryDays: raw.dias_transito ?? undefined,
    estimatedDeliveryAt: toISODate(raw.fecha_entrega),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
