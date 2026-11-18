import type { Rate } from '../../../schema/rate'

export interface USPSRate {
  description: string
  priceType: string
  price: number
  weight: number
  dimWeight: number
  mailClass: string
  zone: string
  SKU: string
  startDate: string
  endDate: string
  fees: unknown[]
  [key: string]: unknown
}

export interface USPSRateOption {
  totalBasePrice: number
  totalPrice: number
  rates: USPSRate[]
  extraServices: unknown[]
  [key: string]: unknown
}

export interface USPSRateResponse {
  rateOptions: USPSRateOption[]
  [key: string]: unknown
}

function mapMailClassToServiceCode(mailClass: string): string {
  return mailClass.toLowerCase().replace(/_/g, '-')
}

function mapMailClassToName(mailClass: string): string {
  const names: Record<string, string> = {
    PRIORITY_MAIL: 'Priority Mail',
    PRIORITY_MAIL_EXPRESS: 'Priority Mail Express',
    FIRST_CLASS_MAIL: 'First-Class Mail',
    PARCEL_SELECT: 'Parcel Select',
    GROUND_ADVANTAGE: 'USPS Ground Advantage',
    LIBRARY_MAIL: 'Library Mail',
    MEDIA_MAIL: 'Media Mail',
  }
  return names[mailClass] ?? mailClass
}

export function transformRate(option: USPSRateOption, rate: USPSRate, response: USPSRateResponse): Rate {
  return {
    id: rate.SKU || undefined,
    carrierId: 'usps',
    serviceCode: mapMailClassToServiceCode(rate.mailClass),
    serviceName: mapMailClassToName(rate.mailClass),
    currency: 'USD',
    totalAmount: option.totalPrice,
    retailAmount: rate.price,
    metadata: response as Record<string, unknown>,
  }
}

export function transformRateResponse(raw: USPSRateResponse): Rate[] {
  return (raw.rateOptions ?? []).flatMap((option) =>
    (option.rates ?? []).map((rate) => transformRate(option, rate, raw)),
  )
}
