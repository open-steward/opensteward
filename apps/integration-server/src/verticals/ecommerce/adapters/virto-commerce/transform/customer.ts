/**
 * Virto Commerce Contact → canonical Customer.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Customer/swagger.json` →
 * `components.schemas.Contact` / `CustomerAddress`. `emails`/`phones` are
 * plain string arrays (no primary flag), so the first entry is used.
 */
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawVirtoCustomerAddress {
  line1?: string
  line2?: string
  city?: string
  regionName?: string
  postalCode?: string
  countryCode?: string
  isDefault?: boolean
  [key: string]: unknown
}

export interface RawVirtoContact {
  id: string
  firstName?: string
  lastName?: string
  fullName?: string
  emails?: string[]
  phones?: string[]
  addresses?: RawVirtoCustomerAddress[]
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function toAddress(raw: RawVirtoCustomerAddress): Address {
  return {
    line1: raw.line1,
    line2: raw.line2,
    city: raw.city,
    region: raw.regionName,
    postalCode: raw.postalCode,
    country: raw.countryCode,
  }
}

export function transformCustomer(raw: RawVirtoContact): Customer {
  const addresses = raw.addresses?.map(toAddress)
  const defaultRaw = raw.addresses?.find((a) => a.isDefault) ?? raw.addresses?.[0]
  return {
    id: raw.id,
    email: raw.emails?.[0],
    firstName: raw.firstName,
    lastName: raw.lastName,
    phone: raw.phones?.[0],
    defaultAddress: defaultRaw ? toAddress(defaultRaw) : undefined,
    addresses,
    createdAt: raw.createdDate,
    updatedAt: raw.modifiedDate,
    metadata: { ...raw },
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (customer.firstName != null) body['firstName'] = customer.firstName
  if (customer.lastName != null) body['lastName'] = customer.lastName
  if (customer.email != null) body['emails'] = [customer.email]
  if (customer.phone != null) body['phones'] = [customer.phone]
  return body
}
