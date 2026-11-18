import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

// ─── Melhor Envio raw types ───────────────────────────────────────────────────

/**
 * Shape returned by POST /api/v2/me/shipment/calculate.
 * Each element in the array represents a carrier + service quote.
 */
export interface MelhorEnvioRate {
  id?: number | string | null
  name?: string | null
  company?: {
    id?: number | null
    name?: string | null
    picture?: string | null
    [key: string]: unknown
  } | null
  /** Service-level code within the carrier. */
  code?: string | null
  /** Total cost including additional fees. */
  price?: number | string | null
  /** Discounted price (custom_price). */
  custom_price?: number | string | null
  /** Retail (full) price before discounts. */
  retail_price?: number | string | null
  currency?: string | null
  /** Minimum transit days. */
  delivery_time?: number | null
  /** Maximum transit days. */
  delivery_max?: number | null
  custom_delivery_time?: number | null
  custom_delivery_range?: {
    min?: number | null
    max?: number | null
    [key: string]: unknown
  } | null
  delivery_range?: {
    min?: number | null
    max?: number | null
    [key: string]: unknown
  } | null
  error?: string | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformRate(raw: MelhorEnvioRate): Rate {
  const companyName = raw.company?.name ?? undefined
  const carrierId = companyName
    ? String(companyName).toLowerCase().replace(/\s+/g, '-')
    : 'melhor-envio'

  // Prefer custom_price (user-configured) over price (standard).
  const totalAmount =
    parseDecimal(raw.custom_price) ?? parseDecimal(raw.price) ?? undefined

  const retailAmount = parseDecimal(raw.retail_price) ?? undefined

  // Delivery days: prefer custom_delivery_time over delivery_time.
  const transitDays =
    (raw.custom_delivery_time ?? raw.delivery_range?.min ?? raw.delivery_time) != null
      ? Number(raw.custom_delivery_time ?? raw.delivery_range?.min ?? raw.delivery_time)
      : undefined

  const id = raw.id != null ? String(raw.id) : undefined

  return {
    id,
    carrierId,
    serviceCode: raw.code != null ? String(raw.code) : undefined,
    serviceName: raw.name ?? undefined,
    currency: raw.currency ?? 'BRL',
    totalAmount,
    retailAmount,
    transitDays,
    deliveryDays: transitDays,
    estimatedDeliveryAt: undefined,
    isGuaranteedDelivery: undefined,
    createdAt: undefined,
    metadata: raw as Record<string, unknown>,
  }
}
