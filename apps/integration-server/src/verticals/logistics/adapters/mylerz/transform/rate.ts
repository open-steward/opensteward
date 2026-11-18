import type { Rate } from '../../../schema/rate'

/**
 * Raw shape returned by POST /Packages/GetExpectedCharges
 * Confirmed via Mylerz API v1.3.1 documentation.
 * Fields: TransferValue, ShippingFees, Charges, FulfillmentFees, VAT, TotalTransfer
 */
export interface MylerzRateRaw {
  TransferValue?: number | null
  ShippingFees?: number | null
  Charges?: number | null
  FulfillmentFees?: number | null
  VAT?: number | null
  TotalTransfer?: number | null
  ServiceCode?: string | null
  service_code?: string | null
  [key: string]: unknown
}

export function transformRate(raw: MylerzRateRaw): Rate {
  const totalAmount = raw.TotalTransfer ?? raw.ShippingFees ?? undefined
  const retailAmount = raw.TransferValue ?? undefined

  return {
    carrierId: 'mylerz',
    serviceCode: raw.ServiceCode ?? raw.service_code ?? 'mylerz_standard',
    serviceName: 'Mylerz Delivery',
    currency: 'EGP',
    totalAmount: totalAmount != null ? totalAmount : undefined,
    retailAmount: retailAmount != null ? retailAmount : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
