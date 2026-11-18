/**
 * Asaas Customer ↔ canonical Customer.
 *
 * Asaas customers carry a single name field, a `cpfCnpj` document number
 * (Brazilian tax id), and a flat set of address fields. There is no per-
 * customer default currency or balance, so those canonical fields stay
 * absent.
 *
 * Refs:
 *   https://docs.asaas.com/reference/list-customers
 *   https://docs.asaas.com/reference/create-new-customer
 */
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { strMap, toIsoDatetime } from './shared'

export interface RawAsaasCustomer {
  object?: string
  id?: string
  dateCreated?: string
  name?: string
  email?: string
  phone?: string
  mobilePhone?: string
  cpfCnpj?: string
  personType?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
  city?: number | string
  cityName?: string
  state?: string
  country?: string
  postalCode?: string
  externalReference?: string
  notificationDisabled?: boolean
  observations?: string
  deleted?: boolean
  [k: string]: unknown
}

function mapAddress(raw: RawAsaasCustomer): Address | undefined {
  const line1 = [raw.address, raw.addressNumber].filter(Boolean).join(', ').trim() || undefined
  const city = raw.cityName ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postalCode ?? undefined
  if (!line1 && !city && !region && !postalCode) return undefined
  return {
    line1,
    line2: raw.complement ?? undefined,
    city,
    region,
    postalCode,
    // Asaas customers are Brazilian unless explicitly flagged foreign.
    country: raw.country ? raw.country.toUpperCase() : 'BR',
  }
}

export function transformCustomer(raw: RawAsaasCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email ?? undefined,
    name: raw.name ?? undefined,
    phone: raw.mobilePhone ?? raw.phone ?? undefined,
    billingAddress: mapAddress(raw),
    gateway: 'asaas',
    metadata: strMap({
      cpfCnpj: raw.cpfCnpj,
      personType: raw.personType,
      externalReference: raw.externalReference,
    }),
    createdAt: toIsoDatetime(raw.dateCreated),
    raw,
  }
}

/** Map a canonical Customer patch onto an Asaas create/update body. */
export function untransformCustomer(c: Partial<Customer>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.name !== undefined) out.name = c.name
  if (c.email !== undefined) out.email = c.email
  if (c.phone !== undefined) out.mobilePhone = c.phone
  // cpfCnpj is required on create; pull it from metadata when supplied.
  const cpfCnpj = c.metadata?.cpfCnpj
  if (cpfCnpj) out.cpfCnpj = cpfCnpj
  const externalReference = c.metadata?.externalReference
  if (externalReference) out.externalReference = externalReference
  if (c.billingAddress?.line1) out.address = c.billingAddress.line1
  if (c.billingAddress?.postalCode) out.postalCode = c.billingAddress.postalCode
  return out
}
