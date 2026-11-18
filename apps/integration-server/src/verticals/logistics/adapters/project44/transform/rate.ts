import type { Rate } from '../../../schema/rate'
import { parseDecimal, toISODate } from '../../shared/transform'

export interface Project44RateQuoteCharge {
  amount?: number
  currencyCode?: string
  [key: string]: unknown
}

export interface Project44RateQuoteCarrier {
  name?: string
  code?: string
  scac?: string
  capacityProviderIdentifiers?: Array<{ type: string; value: string }>
  [key: string]: unknown
}

export interface Project44RateQuote {
  id?: string
  carrier?: Project44RateQuoteCarrier
  carrierCode?: string
  serviceCode?: string
  serviceName?: string
  totalCharge?: Project44RateQuoteCharge
  netCharge?: Project44RateQuoteCharge
  currency?: string
  currencyCode?: string
  transitDays?: number
  estimatedDeliveryDate?: string
  guaranteedDelivery?: boolean
  createdDateTime?: string
  [key: string]: unknown
}

export interface Project44RateQuotesResponse {
  rateQuotes?: Project44RateQuote[]
  [key: string]: unknown
}

function extractCarrierId(raw: Project44RateQuote): string | undefined {
  if (raw.carrierCode) return raw.carrierCode
  if (raw.carrier?.scac) return raw.carrier.scac
  if (raw.carrier?.code) return raw.carrier.code
  const identifiers = raw.carrier?.capacityProviderIdentifiers ?? []
  const scac = identifiers.find((i) => i.type === 'SCAC')
  return scac?.value ?? raw.carrier?.name ?? undefined
}

function extractCurrency(raw: Project44RateQuote): string | undefined {
  return raw.currencyCode
    ?? raw.currency
    ?? raw.totalCharge?.currencyCode
    ?? raw.netCharge?.currencyCode
    ?? undefined
}

function extractTotal(raw: Project44RateQuote): number | undefined {
  const total = raw.totalCharge?.amount ?? raw.netCharge?.amount
  return parseDecimal(total)
}

export function transformRate(raw: Project44RateQuote): Rate {
  return {
    id: raw.id ?? undefined,
    carrierId: extractCarrierId(raw),
    serviceCode: raw.serviceCode ?? undefined,
    serviceName: raw.serviceName ?? raw.carrier?.name ?? undefined,
    currency: extractCurrency(raw),
    totalAmount: extractTotal(raw),
    retailAmount: undefined,
    transitDays: raw.transitDays ?? undefined,
    deliveryDays: raw.transitDays ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    isGuaranteedDelivery: raw.guaranteedDelivery ?? undefined,
    createdAt: toISODate(raw.createdDateTime),
    metadata: raw as Record<string, unknown>,
  }
}
