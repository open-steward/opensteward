import type { Customer } from '../../../schema/customer'
import { parseNmiDatetime, strMap, xmlTag } from './shared'

/**
 * A normalised NMI Customer Vault record, decoded from a Query API
 * `report_type=customer_vault` `<customer>` block.
 */
export interface RawNmiCustomer {
  customerVaultId?: string
  firstName?: string
  lastName?: string
  company?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  created?: string
  updated?: string
  raw?: unknown
}

export function transformCustomer(raw: RawNmiCustomer): Customer {
  const name = [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.customerVaultId ?? ''),
    externalId: String(raw.customerVaultId ?? ''),
    email: raw.email || undefined,
    name: name || raw.company || undefined,
    phone: raw.phone || undefined,
    gateway: 'nmi',
    metadata: strMap({
      company: raw.company,
      address: raw.address,
      city: raw.city,
      state: raw.state,
      postal_code: raw.postalCode,
      country: raw.country,
    }),
    createdAt: parseNmiDatetime(raw.created),
    updatedAt: parseNmiDatetime(raw.updated),
    raw: raw.raw ?? raw,
  }
}

/** Decode one Customer Vault `<customer>` XML block into `RawNmiCustomer`. */
export function customerFromVaultXml(block: string): RawNmiCustomer {
  return {
    customerVaultId: xmlTag(block, 'customer_vault_id') ?? xmlTag(block, 'id'),
    firstName: xmlTag(block, 'first_name'),
    lastName: xmlTag(block, 'last_name'),
    company: xmlTag(block, 'company'),
    email: xmlTag(block, 'email'),
    phone: xmlTag(block, 'phone'),
    address: xmlTag(block, 'address_1') ?? xmlTag(block, 'address'),
    city: xmlTag(block, 'city'),
    state: xmlTag(block, 'state'),
    postalCode: xmlTag(block, 'postal_code'),
    country: xmlTag(block, 'country'),
    created: xmlTag(block, 'created'),
    updated: xmlTag(block, 'updated'),
    raw: block,
  }
}
