import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface NetvisorContact {
  NetvisorKey: number
  Name: string
  OrganisationIdentifier: string
  Email: string
  PhoneNumber: string
  StreetAddress: string
  City: string
  PostNumber: string
  Country: string
  IsActive: number
  CustomerGroupName: string
  [key: string]: unknown
}

export function transformContact(raw: NetvisorContact): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones = [toPhone(raw.PhoneNumber, 'WORK')].filter(
    Boolean,
  ) as NonNullable<ReturnType<typeof toPhone>>[]

  const groupLower = (raw.CustomerGroupName ?? '').toLowerCase()
  const isCustomer = groupLower.includes('customer') || groupLower.includes('asiakas')
  const isSupplier = groupLower.includes('supplier') || groupLower.includes('vendor') || groupLower.includes('toimittaja')

  return {
    id: String(raw.NetvisorKey),
    name: raw.Name || undefined,
    identification: raw.OrganisationIdentifier || undefined,
    isCustomer: isCustomer || undefined,
    isSupplier: isSupplier || undefined,
    isActive: raw.IsActive === 1,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.StreetAddress,
      city: raw.City,
      postalCode: raw.PostNumber,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
