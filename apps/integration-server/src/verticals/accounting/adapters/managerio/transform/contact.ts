import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ManagerioBillingAddress {
  Line1?: string
  Line2?: string
  City?: string
  State?: string
  PostalCode?: string
  Country?: string
  [key: string]: unknown
}

export interface ManagerioContact {
  Key: string
  Name: string
  Email: string
  Phone: string
  BillingAddress: ManagerioBillingAddress
  CustomFields: Record<string, unknown>
  TaxCode: string
  [key: string]: unknown
}

export function transformContact(raw: ManagerioContact, isCustomer: boolean): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })

  const addr = raw.BillingAddress
  return {
    id: String(raw.Key),
    name: raw.Name || undefined,
    taxNumber: raw.TaxCode || undefined,
    isCustomer,
    isSupplier: !isCustomer,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: addr
      ? toAddress({
          address1: addr.Line1,
          address2: addr.Line2,
          city: addr.City,
          region: addr.State,
          postalCode: addr.PostalCode,
          country: addr.Country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
