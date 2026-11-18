import type { Customer } from '../../../schema/customer'
import { isIso3166Alpha2 } from '@opensteward/shared'
import { pickStr, strMap, toIso } from './shared'

/**
 * Computop customer-vault object. `id` is the Paygate-assigned vault id
 * (`cu_…`); `merchantCustomerId` is the merchant's own reference. Names and
 * contact details are only present when the merchant passed them during a
 * payment.
 */
export interface RawComputopCustomer {
  id?: string
  merchantCustomerId?: string
  firstName?: string
  lastName?: string
  companyName?: string
  email?: string
  phone?: { countryCode?: string; number?: string }
  scope?: string
  billingAddress?: {
    streetName?: string
    streetNumber?: string
    city?: string
    postalCode?: string
    state?: string
    country?: string
  }
  createdAt?: string
  updatedAt?: string
  lastUsedAt?: string
  [k: string]: unknown
}

function joinName(raw: RawComputopCustomer): string | undefined {
  const personal = [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim()
  return personal || raw.companyName?.trim() || undefined
}

function joinPhone(phone: RawComputopCustomer['phone']): string | undefined {
  if (!phone) return undefined
  const joined = [phone.countryCode, phone.number].filter(Boolean).join(' ').trim()
  return joined || undefined
}

/**
 * Only emit `country` when it is a real, officially assigned ISO 3166-1
 * alpha-2 code — validated by membership (`isIso3166Alpha2`), not shape.
 * A bare `/^[A-Z]{2}$/` check would let well-formed non-codes ('XK', 'ZZ')
 * through unchanged.
 */
function pickCountry(v: unknown): string | undefined {
  const s = pickStr(v)
  if (!s) return undefined
  const upper = s.toUpperCase()
  return isIso3166Alpha2(upper) ? upper : undefined
}

export function transformCustomer(raw: RawComputopCustomer): Customer {
  const id = pickStr(raw.id) ?? pickStr(raw.merchantCustomerId) ?? ''
  const addr = raw.billingAddress
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: joinName(raw),
    phone: joinPhone(raw.phone),
    billingAddress: addr
      ? {
          line1: [addr.streetName, addr.streetNumber].filter(Boolean).join(' ').trim() || undefined,
          city: pickStr(addr.city),
          postalCode: pickStr(addr.postalCode),
          region: pickStr(addr.state),
          country: pickCountry(addr.country),
        }
      : undefined,
    gateway: 'computop',
    metadata: strMap({
      merchantCustomerId: raw.merchantCustomerId,
      scope: raw.scope,
      lastUsedAt: raw.lastUsedAt,
    }),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    raw,
  }
}
