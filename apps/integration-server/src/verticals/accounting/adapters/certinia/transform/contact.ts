import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface CertiniaContact {
  Id: string
  Name: string
  Type: string
  Email: string
  Phone: string
  BillingStreet: string
  BillingCity: string
  BillingState: string
  BillingPostalCode: string
  BillingCountry: string
  IsActive__c: boolean
  [key: string]: unknown
}

export function transformContact(raw: CertiniaContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const phone = toPhone(raw.Phone, 'WORK')
  const telephones = phone ? [phone] : []

  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    isCustomer: raw.Type === 'Customer',
    isSupplier: raw.Type === 'Vendor',
    isActive: raw.IsActive__c ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.BillingStreet,
      city: raw.BillingCity,
      region: raw.BillingState,
      postalCode: raw.BillingPostalCode,
      country: raw.BillingCountry,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
