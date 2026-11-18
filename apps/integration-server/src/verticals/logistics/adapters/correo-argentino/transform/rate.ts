/**
 * Correo Argentino MiCorreo API — rates response → canonical Rate.
 *
 * POST /rates accepts origin/destination postal codes, delivery type (home "D"
 * or agency "S"), and package dimensions (weight, length, width, height).
 * It returns an array of product rate objects with pricing and transit days.
 *
 * Documented endpoint: POST https://api.correoargentino.com.ar/micorreo/v1/rates
 * Source: Correo Argentino API MiCorreo documentation (apiMiCorreo.pdf, page 31)
 * SDK reference: https://github.com/YamilEzequiel/correo-argentino
 */
import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── Correo Argentino raw types ───────────────────────────────────────────

export interface CorreoArgentinoRateItem {
  /** Internal rate identifier */
  tarifa_id: string | null
  /** Product code (e.g. "CP" = Correo Paquete, "EP" = Encomienda Prioritaria) */
  producto: string | null
  /** Human-readable product/service name */
  producto_nombre: string | null
  /** Total cost in ARS */
  precio: number | null
  /** Currency (typically "ARS") */
  moneda: string | null
  /** Estimated transit days */
  dias_habiles: number | null
  /** Estimated delivery date */
  fecha_entrega: string | null
  /** Delivery type: "D" = home, "S" = agency */
  tipo_entrega: string | null
  created_at: string | null
  [key: string]: unknown
}

export interface CorreoArgentinoRatesResponse {
  tarifas: CorreoArgentinoRateItem[]
  [key: string]: unknown
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformRate(raw: CorreoArgentinoRateItem): Rate {
  return {
    id: raw.tarifa_id ?? undefined,
    carrierId: 'correo-argentino',
    serviceCode: raw.producto ?? undefined,
    serviceName: raw.producto_nombre ?? undefined,
    currency: raw.moneda ?? 'ARS',
    totalAmount: parseDecimal(raw.precio),
    transitDays: raw.dias_habiles ?? undefined,
    deliveryDays: raw.dias_habiles ?? undefined,
    estimatedDeliveryAt: toISODate(raw.fecha_entrega),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
