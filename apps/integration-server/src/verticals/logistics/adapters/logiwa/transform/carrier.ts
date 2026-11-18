import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

// Response shape from POST /v3.1/PartnerCarrier/list/detail
export interface LogiwaPartnerCarrierShippingOption {
  code?: string | null
  name?: string | null
  [key: string]: unknown
}

export interface LogiwaPartnerCarrierDetail {
  carrierCode?: string | null
  carrierDisplayName?: string | null
  logoUrl?: string | null
  shippingOptionList?: LogiwaPartnerCarrierShippingOption[]
  billingTypeList?: string[]
  confirmationTypeList?: string[]
  insuranceTypeList?: string[]
  packageList?: Array<{ code?: string | null; name?: string | null }>
  [key: string]: unknown
}

export function transformCarrier(raw: LogiwaPartnerCarrierDetail): Carrier {
  const services: CarrierService[] | undefined =
    raw.shippingOptionList && raw.shippingOptionList.length > 0
      ? raw.shippingOptionList
          .filter((opt) => opt.code)
          .map((opt) => ({
            code: opt.code as string,
            name: opt.name ?? undefined,
          }))
      : undefined

  return {
    id: raw.carrierCode ?? undefined,
    name: raw.carrierDisplayName ?? undefined,
    code: raw.carrierCode ?? undefined,
    services: services && services.length > 0 ? services : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
