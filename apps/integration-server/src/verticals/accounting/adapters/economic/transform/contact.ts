import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface EconomicCustomer {
  customerNumber: number
  name: string
  corporateIdentificationNumber: string
  vatNumber: string
  email: string
  telephoneAndFaxNumber: string
  mobilePhone: string
  address: string
  city: string
  zip: string
  country: string
  currency: string
  barred: boolean
  [key: string]: unknown
}

export interface EconomicSupplier {
  supplierNumber: number
  name: string
  corporateIdentificationNumber: string
  vatNumber: string
  email: string
  phone: string
  address: string
  city: string
  zip: string
  country: string
  currency: string
  barred: boolean
  [key: string]: unknown
}

export function transformCustomer(raw: EconomicCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [
    toPhone(raw.telephoneAndFaxNumber, 'WORK'),
    toPhone(raw.mobilePhone, 'MOBILE'),
  ].filter(Boolean) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: `cust_${raw.customerNumber}`,
    name: raw.name || undefined,
    identification: raw.corporateIdentificationNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: !raw.barred,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: EconomicSupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  return {
    id: `supp_${raw.supplierNumber}`,
    name: raw.name || undefined,
    identification: raw.corporateIdentificationNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: !raw.barred,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
