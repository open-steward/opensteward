import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * Frenet shipping service quote item returned from POST /shipping/quote
 * (ShippingServices array) and POST /shipment-quote.
 */
export interface FrenetShippingService {
  /** Service name / carrier name (e.g. "SEDEX", "PAC") */
  ServiceDescription?: string | null
  /** Carrier code / CNPJ */
  Carrier?: string | null
  /** Carrier identifier (numeric string) */
  CarrierCode?: string | null
  /** Total price as decimal string (e.g. "19.50") */
  ShippingPrice?: number | string | null
  /** Original (list) price before discount */
  OriginalShippingPrice?: number | string | null
  /** Estimated delivery in business days */
  DeliveryTime?: number | null
  /** Delivery time including posting buffer */
  DeliveryInBusinessDays?: boolean | null
  /** Whether a home delivery is guaranteed */
  Home?: boolean | null
  /** Whether Saturday delivery is available */
  Saturday?: boolean | null
  /** Error message if this service is unavailable */
  Error?: string | null
  /** Whether the service returned an error */
  HasError?: boolean | null
  [key: string]: unknown
}

export function transformRate(raw: FrenetShippingService, createdAt?: Date): Rate {
  return {
    carrierId: raw.Carrier ?? undefined,
    serviceCode: raw.CarrierCode ?? undefined,
    serviceName: raw.ServiceDescription ?? undefined,
    currency: 'BRL',
    totalAmount: (() => {
      const v = parseDecimal(raw.ShippingPrice)
      return v != null ? Math.round(v * 100) : undefined
    })(),
    retailAmount: (() => {
      const v = parseDecimal(raw.OriginalShippingPrice ?? undefined)
      return v != null ? Math.round(v * 100) : undefined
    })(),
    transitDays: raw.DeliveryTime ?? undefined,
    deliveryDays: raw.DeliveryTime ?? undefined,
    estimatedDeliveryAt: (() => {
      if (!createdAt || raw.DeliveryTime == null) return undefined
      const d = new Date(createdAt.getTime() + raw.DeliveryTime * 24 * 60 * 60 * 1000)
      const s = toIsoDatetime(d)
      return s ? new Date(s) : undefined
    })(),
    isGuaranteedDelivery: raw.Home ?? undefined,
    createdAt,
    metadata: raw as Record<string, unknown>,
  }
}
