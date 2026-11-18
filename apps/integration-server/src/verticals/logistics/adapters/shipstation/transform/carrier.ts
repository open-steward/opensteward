import type { Carrier } from '../../../schema/carrier'

export interface SSCarrier {
  name: string
  code: string
  accountNumber: string
  requiresFundedAccount: boolean
  balance: number
  nickname: string | null
  shippingProviderId: number
  primary: boolean
  [key: string]: unknown
}

export interface SSCarrierService {
  carrierCode: string
  code: string
  name: string
  domestic: boolean
  international: boolean
}

export function transformCarrier(raw: SSCarrier, services?: SSCarrierService[]): Carrier {
  return {
    id: raw.code,
    name: raw.name || undefined,
    code: raw.code || undefined,
    isActive: true,
    services: services
      ? services.map((svc) => ({
          code: svc.code,
          name: svc.name || undefined,
        }))
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
