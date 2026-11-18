import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

/**
 * ShipBob fulfilment estimate → canonical Rate.
 *
 * `POST /2026-01/order:estimate` ("Estimate Fulfillment Cost For Order") is
 * the only pricing endpoint ShipBob has, and it is not a carrier rate-shop.
 * ShipBob is a 3PL: it picks the carrier itself at fulfilment time, and what
 * it quotes is ONE all-in fulfilment price per shipping method — its "ship
 * option", the same string `createOrder` sends as `shipping_method` — plus
 * the fulfilment centre it would ship from:
 *
 *     { "estimates": [ { "shipping_method": "Standard",
 *                        "estimated_price": 8.42,
 *                        "estimated_currency_code": "USD",
 *                        "fulfillment_center": { "id": 8, "name": "Cicero (IL)" },
 *                        "total_weight_oz": 12.5 } ] }
 *
 * So one estimate is one Rate row keyed on the shipping method. That string
 * is what a caller passes back as `requestedServiceCode`, and — ShipBob
 * naming no carrier before a label exists — it is the nearest thing to a
 * carrier as well. Note it is the ship-option NAME, not the numeric
 * shipping-method id that `listCarriers` exposes. The fulfilment centre and
 * the packed weight have no canonical field and stay in `metadata`.
 */
export interface ShipBobEstimate {
  /** Ship option name, e.g. "Standard". Maps to `shipping_method` on an order. */
  shipping_method?: string | null
  /** Decimal major units — the spec says "in dollars" — e.g. 8.42. */
  estimated_price?: number | null
  /** "Estimated local currency code"; nullable upstream. */
  estimated_currency_code?: string | null
  fulfillment_center?: { id?: number | null; name?: string | null } | null
  /** Items plus packaging, in ounces. */
  total_weight_oz?: number | null
  [key: string]: unknown
}

/** The `order:estimate` response envelope. `estimates` is nullable upstream. */
export interface ShipBobEstimateResponse {
  estimates?: ShipBobEstimate[] | null
  [key: string]: unknown
}

export function transformRate(raw: ShipBobEstimate): Rate {
  const method = raw.shipping_method ?? undefined
  const price = parseDecimal(raw.estimated_price)

  return {
    carrierId: method,
    serviceCode: method,
    serviceName: method,
    // Only what the response says. The spec's one hint at a default is the
    // word "dollars" on `estimated_price`, which is not an ISO code — and
    // ShipBob fulfils from CA, AU, UK and EU centres too — so an absent code
    // stays absent rather than becoming a guessed USD.
    currency: raw.estimated_currency_code ?? undefined,
    // Amount is integer minor units; ShipBob quotes decimal major units.
    totalAmount: price === undefined ? undefined : Math.round(price * 100),
    metadata: raw,
  }
}
