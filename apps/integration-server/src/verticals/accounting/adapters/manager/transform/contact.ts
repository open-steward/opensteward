/**
 * Manager customers / suppliers → canonical Contact transform.
 *
 * API endpoints:
 *   GET /api2/customers
 *   GET /api2/customers/{key}
 *   POST /api2/customer-form
 *   PUT  /api2/customer-form/{key}
 *   GET /api2/suppliers
 *   GET /api2/suppliers/{key}
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface ManagerCustomer {
  key?: string
  code?: string
  name?: string
  email?: string
  phone?: string
  address?: string
  billingAddress?: string
  deliveryAddress?: string
  customField1?: string
  customField2?: string
  /** "Active" | "Inactive" */
  status?: string
  [key: string]: unknown
}

export interface ManagerSupplier {
  key?: string
  code?: string
  name?: string
  email?: string
  phone?: string
  address?: string
  /** "Active" | "Inactive" */
  status?: string
  [key: string]: unknown
}

/** Manager stores the billing address as a single multiline string; parse it best-effort. */
function parseAddress(raw?: string) {
  if (!raw) return undefined
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return toAddress({
    address1: lines[0],
    address2: lines[1],
    city: lines[2],
    postalCode: lines[3],
    country: lines[4],
  })
}

export function transformCustomer(raw: ManagerCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: raw.key ? `cust_${raw.key}` : undefined,
    name: raw.name || undefined,
    identification: raw.code || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: !raw.status || raw.status.toLowerCase() !== 'inactive',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: parseAddress(raw.address ?? raw.billingAddress),
    shippingAddress: parseAddress(raw.deliveryAddress),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformSupplier(raw: ManagerSupplier): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id: raw.key ? `supp_${raw.key}` : undefined,
    name: raw.name || undefined,
    identification: raw.code || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: !raw.status || raw.status.toLowerCase() !== 'inactive',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: parseAddress(raw.address),
    metadata: raw as Record<string, unknown>,
  }
}
