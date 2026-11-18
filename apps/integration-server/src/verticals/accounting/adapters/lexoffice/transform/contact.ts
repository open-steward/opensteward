import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

export interface LexofficePerson {
  salutation: string
  firstName: string
  lastName: string
}

export interface LexofficeCompany {
  name: string
  taxNumber: string
  vatRegistrationId: string
  contactPersons: Array<{ firstName: string; lastName: string; emailAddress: string }>
}

export interface LexofficeContact {
  id: string
  version: number
  roles: {
    customer?: { number: number }
    vendor?: { number: number }
  }
  person?: LexofficePerson
  company?: LexofficeCompany
  addresses?: {
    billing?: Array<{ street: string; zip: string; city: string; countryCode: string }>
    shipping?: Array<{ street: string; zip: string; city: string; countryCode: string }>
  }
  emailAddresses?: { business?: string[]; private?: string[] }
  phoneNumbers?: { business?: string[]; mobile?: string[] }
  archived: boolean
  [key: string]: unknown
}

export function transformContact(raw: LexofficeContact): Contact {
  const emails: Email[] = []
  for (const e of raw.emailAddresses?.business ?? []) {
    emails.push({ email: e, type: 'WORK' })
  }

  const telephones: Telephone[] = []
  for (const t of raw.phoneNumbers?.business ?? []) {
    telephones.push({ telephone: t, type: 'WORK' })
  }
  for (const t of raw.phoneNumbers?.mobile ?? []) {
    telephones.push({ telephone: t, type: 'MOBILE' })
  }

  const billAddr = raw.addresses?.billing?.[0]
  const shipAddr = raw.addresses?.shipping?.[0]

  const toAddr = (a: typeof billAddr): Address | undefined =>
    a ? { address1: a.street || undefined, city: a.city || undefined, postalCode: a.zip || undefined, country: a.countryCode || undefined } : undefined

  const isCustomer = !!raw.roles?.customer
  const isSupplier = !!raw.roles?.vendor
  const name = raw.company?.name ?? [raw.person?.firstName, raw.person?.lastName].filter(Boolean).join(' ')

  return {
    id: raw.id,
    name: name || undefined,
    firstName: raw.person?.firstName || undefined,
    lastName: raw.person?.lastName || undefined,
    companyName: raw.company?.name || undefined,
    taxNumber: raw.company?.vatRegistrationId || raw.company?.taxNumber || undefined,
    identification: raw.roles?.customer?.number
      ? String(raw.roles.customer.number)
      : undefined,
    isCustomer,
    isSupplier,
    isActive: !raw.archived,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: toAddr(billAddr),
    shippingAddress: toAddr(shipAddr),
    metadata: raw as Record<string, unknown>,
  }
}
