/**
 * CashCtrl person (contact) transform.
 *
 * In CashCtrl, all contacts are "persons" (individuals or companies).
 * They may act as customers, suppliers, or both depending on the orders
 * they are associated with. CashCtrl does not expose a separate
 * isCustomer/isSupplier flag, so we default both to true.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#person
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

export interface CashCtrlAddress {
  type?: string | null
  address?: string | null
  zip?: string | null
  city?: string | null
  country?: string | null
  [key: string]: unknown
}

/**
 * CashCtrl person record as returned by GET /person/read.json
 * and listed via GET /person/list.json.
 */
export interface CashCtrlPerson {
  id: number
  /** For companies this contains the company name; individuals use firstName/lastName. */
  company?: string | null
  firstName?: string | null
  lastName?: string | null
  /** Comma-separated email address(es) — take the first. */
  email?: string | null
  phone?: string | null
  mobile?: string | null
  /** VAT / tax registration number. */
  vatUid?: string | null
  currencyCode?: string | null
  isInactive?: boolean | null
  /** Array of address objects. */
  addresses?: CashCtrlAddress[] | null
  [key: string]: unknown
}

function pickBillingAddress(addresses?: CashCtrlAddress[] | null) {
  if (!addresses?.length) return undefined
  // Prefer the first address tagged as "MAIN" or just use index 0.
  const main = addresses.find((a) => a.type?.toUpperCase() === 'MAIN') ?? addresses[0]
  if (!main) return undefined
  // CashCtrl stores the street in `address`; zip and city are separate fields.
  const streetParts = (main.address ?? '').split('\n')
  return toAddress({
    address1: streetParts[0] || undefined,
    address2: streetParts[1] || undefined,
    city: main.city || undefined,
    postalCode: main.zip || undefined,
    country: main.country || undefined,
  })
}

export function transformPerson(raw: CashCtrlPerson): Contact {
  const name = composeName(raw.company, raw.firstName, raw.lastName)
  const emails = toWorkEmail(raw.email?.split(',')[0]?.trim())
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })

  return {
    id: String(raw.id),
    name: name || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.company || undefined,
    taxNumber: raw.vatUid || undefined,
    // CashCtrl does not have an explicit customer/supplier flag on persons.
    // Persons appear across sales and purchase orders; expose both as true.
    isCustomer: true,
    isSupplier: true,
    isActive: !raw.isInactive,
    currency: raw.currencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: pickBillingAddress(raw.addresses),
    metadata: raw as Record<string, unknown>,
  }
}
