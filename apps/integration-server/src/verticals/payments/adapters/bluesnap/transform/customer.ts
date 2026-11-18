import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { pickCurrency } from './shared'

/**
 * BlueSnap "vaulted shopper" — the closest analogue to a canonical customer.
 * BlueSnap nests contact details under `shopperInfo` on retrieve, but echoes
 * them at the top level on create, so we read both.
 *
 * Docs: https://developers.bluesnap.com/v8976-JSON/reference/retrieve-vaulted-shopper
 */
export interface RawBluesnapShopperContact {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  companyName?: string
  country?: string
  state?: string
  city?: string
  address?: string
  address2?: string
  zip?: string
}

export interface RawBluesnapVaultedShopper extends RawBluesnapShopperContact {
  vaultedShopperId?: string | number
  shopperCurrency?: string
  shopperInfo?: RawBluesnapShopperContact & {
    shopperContactInfo?: RawBluesnapShopperContact
  }
  [k: string]: unknown
}

function contact(raw: RawBluesnapVaultedShopper): RawBluesnapShopperContact {
  // Retrieve nests under shopperInfo.shopperContactInfo; create returns flat.
  return {
    ...raw,
    ...raw.shopperInfo,
    ...raw.shopperInfo?.shopperContactInfo,
  }
}

function billingAddress(c: RawBluesnapShopperContact): Address | undefined {
  const country = c.country ? c.country.toUpperCase() : undefined
  const out: Address = {
    line1: c.address,
    line2: c.address2,
    city: c.city,
    region: c.state,
    postalCode: c.zip,
    country: country && country.length === 2 ? country : undefined,
  }
  const hasAny = Object.values(out).some((v) => v != null && v !== '')
  return hasAny ? out : undefined
}

export function transformCustomer(raw: RawBluesnapVaultedShopper): Customer {
  const c = contact(raw)
  const id = String(raw.vaultedShopperId ?? '')
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  return {
    id,
    externalId: id,
    email: c.email,
    name: name || undefined,
    phone: c.phone,
    billingAddress: billingAddress(c),
    currency: raw.shopperCurrency ? pickCurrency(raw.shopperCurrency) : undefined,
    gateway: 'bluesnap',
    metadata: c.companyName ? { companyName: c.companyName } : {},
    raw,
  }
}
