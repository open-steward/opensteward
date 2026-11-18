/**
 * Bokio `customer` → canonical Contact.
 *
 * Shape: the `customer` schema of GET /companies/{companyId}/customers/{customerId}
 * (https://docs.bokio.se/reference/get-customers-customerid.md), also the row
 * of GET /companies/{companyId}/customers
 * (https://docs.bokio.se/reference/get-customer.md): id (uuid), name,
 * customerNumber, type ("company" | "private"), vatNumber, orgNumber,
 * paymentTerms, contactsDetails[] { id, name, email, phone, isDefault },
 * address { line1, line2, city, postalCode, country, countrySubdivision },
 * language, modifiedDateTime.
 *
 * Bokio's customers are the only contacts this adapter lists, so every one is
 * a customer and none a supplier. No active flag or currency is documented,
 * so neither is set. A contact detail documents no kind (work, home, mobile),
 * so emails and telephones carry no `type`.
 */
import type { Contact } from '../../../schema/contact'
import type { Email, Telephone } from '../../../schema/shared'
import { nonempty, toAddress, toUtcDate } from '../../shared/transform'

export interface BokioContactDetail {
  id?: string | null
  name?: string
  email?: string
  phone?: string
  isDefault?: boolean
}

export interface BokioAddress {
  line1?: string
  line2?: string | null
  city?: string
  postalCode?: string
  /** ISO 3166-1 alpha-2. */
  country?: string
  countrySubdivision?: string | null
}

export interface BokioCustomer {
  id: string
  name?: string
  customerNumber?: string | null
  type?: 'company' | 'private' | string
  vatNumber?: string
  orgNumber?: string
  paymentTerms?: string
  contactsDetails?: BokioContactDetail[]
  address?: BokioAddress | null
  language?: string
  modifiedDateTime?: string | null
  [key: string]: unknown
}

/** The default contact detail first, so `emails[0]` is the one Bokio marks default. */
function orderedDetails(raw: BokioCustomer): BokioContactDetail[] {
  const details = raw.contactsDetails ?? []
  return [...details.filter((d) => d.isDefault), ...details.filter((d) => !d.isDefault)]
}

export function transformContact(raw: BokioCustomer): Contact {
  const details = orderedDetails(raw)
  const emails: Email[] = details.filter((d) => d.email).map((d) => ({ email: d.email! }))
  const telephones: Telephone[] = details
    .filter((d) => d.phone)
    .map((d) => ({ telephone: d.phone! }))
  return {
    id: raw.id,
    name: raw.name || undefined,
    companyName: raw.type === 'company' ? raw.name || undefined : undefined,
    identification: raw.orgNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address?.line1,
      address2: raw.address?.line2,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      region: raw.address?.countrySubdivision,
      country: raw.address?.country,
    }),
    updatedAt: toUtcDate(raw.modifiedDateTime),
    metadata: raw as Record<string, unknown>,
  }
}
