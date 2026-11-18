import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Servientrega raw types ───────────────────────────────────────────────

export interface ServientregaRate {
  cotizacion_id: string | null
  servicio: string | null
  servicio_nombre: string | null
  total: number | null
  moneda: string | null
  dias_transito: number | null
  fecha_entrega: string | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformRate(raw: ServientregaRate): Rate {
  return {
    id: raw.cotizacion_id ?? undefined,
    carrierId: 'servientrega',
    serviceCode: raw.servicio ?? undefined,
    serviceName: raw.servicio_nombre ?? undefined,
    currency: raw.moneda ?? 'COP',
    totalAmount: parseDecimal(raw.total),
    transitDays: raw.dias_transito ?? undefined,
    deliveryDays: raw.dias_transito ?? undefined,
    estimatedDeliveryAt: toISODate(raw.fecha_entrega),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
