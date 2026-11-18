import type { Carrier } from '../../../schema/carrier'

export interface Ship24Courier {
  courierCode: string
  courierName: string
  courierUrl: string | null
  courierCountryCode: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: Ship24Courier): Carrier {
  return {
    id: raw.courierCode,
    name: raw.courierName,
    code: raw.courierCode,
    trackingUrlTemplate: raw.courierUrl ?? undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
