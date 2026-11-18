/**
 * Mondial Relay — rate quote → canonical Rate.
 *
 * Mondial Relay's WebService / REST API exposes relay point offers
 * (`WSI2_RecherchePointRelais`) and shipping rate calculations
 * (`WSI2_GetRelaisPickupPoint`). Rate quotes carry a `tarif` (price) block
 * plus a `delai` (transit-days estimate). Money is returned as a decimal
 * string in the specified currency (typically EUR).
 *
 * Docs: https://api.mondialrelay.com/Web_Services.aspx
 */
import type { Rate } from '../../../schema/rate'
import { toISODate } from '../../shared/transform'

export interface MondialRelayRateOffer {
  /** Relay service code, e.g. `"24R"` (24h Relay), `"HOM"` (Home). */
  serviceCode?: string | null
  /** Human-readable service label. */
  serviceName?: string | null
  /** Carrier identifier within the relay network. */
  carrierId?: string | null
  /** Price block. */
  tarif?: {
    TTC?: string | number | null
    HT?: string | number | null
    devise?: string | null
    currency?: string | null
  } | null
  /** Transit time in days. */
  delai?: number | string | null
  deliveryDays?: number | null
  /** Estimated delivery date (ISO-8601 or platform-local format). */
  estimatedDelivery?: string | null
  /** Unique offer identifier. */
  id?: string | null
  rateId?: string | null
  [key: string]: unknown
}

export interface MondialRelayRatesResponse {
  /**  Some endpoints wrap results in `offers`. */
  offers?: MondialRelayRateOffer[]
  /** Others use `rates`. */
  rates?: MondialRelayRateOffer[]
  /** Direct array shape. */
  [key: string]: unknown
}

function parseMoney(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : undefined
}

function parseTransitDays(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : undefined
}

export function transformRate(raw: MondialRelayRateOffer): Rate {
  const tarif = raw.tarif ?? {}
  const amount = parseMoney(tarif.TTC ?? tarif.HT)
  const currency =
    typeof tarif.devise === 'string' && tarif.devise.length === 3
      ? tarif.devise.toUpperCase()
      : typeof tarif.currency === 'string' && tarif.currency.length === 3
        ? tarif.currency.toUpperCase()
        : 'EUR'

  return {
    id: raw.rateId ?? raw.id ?? raw.serviceCode ?? undefined,
    carrierId: raw.carrierId ?? 'mondialrelay',
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? undefined,
    currency,
    totalAmount: amount,
    transitDays: parseTransitDays(raw.delai ?? raw.deliveryDays),
    estimatedDeliveryAt: toISODate(raw.estimatedDelivery),
    metadata: raw as Record<string, unknown>,
  }
}

export function extractRates(raw: MondialRelayRatesResponse): MondialRelayRateOffer[] {
  if (Array.isArray(raw)) return raw as MondialRelayRateOffer[]
  return raw.offers ?? raw.rates ?? []
}
