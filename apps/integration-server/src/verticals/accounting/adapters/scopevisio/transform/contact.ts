/**
 * Scopevisio contact → canonical Contact transform.
 *
 * Scopevisio contacts are unified (both customers and suppliers share one
 * endpoint, GET /contact/{id} / POST /contacts).  The contact object uses
 * camelCase field names matching the KontaktForm SDK model:
 *
 *  - `id`          : numeric master ID (masterId)
 *  - `lastname`    : company name (Person=false) or last name (Person=true)
 *  - `firstname`   : first name when Person=true
 *  - `customerNumber` : customer contact number
 *  - `legacyNumber`   : ID from predecessor system
 *  - `email`, `email2` … : business, work email addresses
 *  - `phone`, `phone2` …  : phone numbers
 *  - `mobile`             : mobile number
 *  - `fax`                : fax number
 *  - `street1`, `city1`, `postcode1`, `country1` : main address [Hauptadresse]
 *  - `street2`, `city2`, `postcode2`, `country2` : billing address [Rechnungsadresse]
 *  - `street3`, `city3`, `postcode3`, `country3` : delivery address [Lieferadresse]
 *  - `debitorNumber`  : personal account number when contact is a debitor (customer)
 *  - `kreditorNumber` : personal account number when contact is a creditor (supplier)
 *  - `vatId`          : VAT registration number
 *  - `person`         : true = natural person; false = company
 *
 * List endpoint: POST /contacts
 * Detail endpoint: GET /contact/{id}
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, composeName } from '../../shared/transform'

export interface ScopevisioContact {
  id?: number
  person?: boolean
  salutation?: string
  title?: string
  lastname?: string
  firstname?: string
  customerNumber?: string
  legacyNumber?: string
  debitorNumber?: string
  kreditorNumber?: string
  vatId?: string
  email?: string
  email2?: string
  email3?: string
  phone?: string
  phone2?: string
  mobile?: string
  fax?: string
  // Main address [Hauptadresse]
  street1?: string
  city1?: string
  postcode1?: string
  country1?: string
  // Billing address [Rechnungsadresse]
  street2?: string
  city2?: string
  postcode2?: string
  country2?: string
  // Delivery address [Lieferadresse]
  street3?: string
  city3?: string
  postcode3?: string
  country3?: string
  [key: string]: unknown
}

export function transformContact(raw: ScopevisioContact): Contact {
  const emails = [
    ...toWorkEmail(raw.email),
    ...toWorkEmail(raw.email2),
    ...toWorkEmail(raw.email3),
  ]

  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.phone2) telephones.push({ telephone: raw.phone2, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  const isPerson = raw.person === true
  const name = composeName(
    isPerson ? undefined : raw.lastname,
    isPerson ? raw.firstname : undefined,
    isPerson ? raw.lastname : undefined,
  ) || raw.lastname || undefined

  const isCustomer = !!raw.debitorNumber
  const isSupplier = !!raw.kreditorNumber

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name,
    firstName: isPerson ? raw.firstname || undefined : undefined,
    lastName: isPerson ? raw.lastname || undefined : undefined,
    companyName: !isPerson ? raw.lastname || undefined : undefined,
    identification: raw.customerNumber || raw.legacyNumber || undefined,
    taxNumber: raw.vatId || undefined,
    isCustomer: isCustomer || undefined,
    isSupplier: isSupplier || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street2 || raw.street1,
      city: raw.city2 || raw.city1,
      postalCode: raw.postcode2 || raw.postcode1,
      country: raw.country2 || raw.country1,
    }),
    shippingAddress: toAddress({
      address1: raw.street3,
      city: raw.city3,
      postalCode: raw.postcode3,
      country: raw.country3,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
