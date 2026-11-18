/**
 * Octopus → canonical Contact transform.
 *
 * Octopus REST API endpoint: GET /relations, GET /relations/{id}
 *
 * Relations in Octopus are unified: a single record can be a customer,
 * a supplier, or both.  The `isCustomer` / `isSupplier` flags distinguish
 * the role(s).
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

export interface OctopusRelation {
  relationId?: number
  externalRelationId?: string
  name?: string
  firstName?: string
  lastName?: string
  companyName?: string
  vatNumber?: string
  enterpriseNumber?: string
  isCustomer?: boolean
  isSupplier?: boolean
  active?: boolean
  currency?: string
  email?: string
  phone?: string
  mobile?: string
  fax?: string
  address?: string
  address2?: string
  city?: string
  postalCode?: string
  country?: string
  countryCode?: string
  deliveryAddress?: string
  deliveryAddress2?: string
  deliveryCity?: string
  deliveryPostalCode?: string
  deliveryCountry?: string
  deliveryCountryCode?: string
  [key: string]: unknown
}

export function transformRelation(raw: OctopusRelation): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  const name = composeName(raw.companyName, raw.firstName, raw.lastName) ?? raw.name

  return {
    id: raw.relationId !== undefined ? String(raw.relationId) : undefined,
    name: name || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.companyName || undefined,
    identification: raw.enterpriseNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: raw.isCustomer ?? false,
    isSupplier: raw.isSupplier ?? false,
    isActive: raw.active,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      address2: raw.address2,
      city: raw.city,
      postalCode: raw.postalCode,
      country: raw.countryCode || raw.country,
    }),
    shippingAddress: toAddress({
      address1: raw.deliveryAddress,
      address2: raw.deliveryAddress2,
      city: raw.deliveryCity,
      postalCode: raw.deliveryPostalCode,
      country: raw.deliveryCountryCode || raw.deliveryCountry,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
