import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// Payhawk supplier object
// Docs: webhook event supplier.created / supplier.updated; expense.supplier sub-object
export interface PayhawkSupplier {
  id: string
  name?: string
  vatNumber?: string
  registrationNumber?: string
  externalId?: string
  email?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  postCode?: string
  countryCode?: string
  currency?: string
  bankAccount?: {
    iban?: string
    bic?: string
    accountNumber?: string
    bankName?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformSupplier(raw: PayhawkSupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.registrationNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.addressLine1,
      address2: raw.addressLine2,
      city: raw.city,
      postalCode: raw.postCode,
      country: raw.countryCode,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
