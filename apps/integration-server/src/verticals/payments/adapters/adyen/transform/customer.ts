import type { Customer } from '../../../schema/customer'
import { pickCurrency, strMap } from './shared'

export interface RawAdyenShopper {
  shopperReference?: string
  shopperEmail?: string
  shopperName?: { firstName?: string; lastName?: string }
  telephoneNumber?: string
  billingAddress?: Record<string, string>
  shopperLocale?: string
  countryCode?: string
}

export function transformCustomer(raw: RawAdyenShopper): Customer {
  const fullName = [raw.shopperName?.firstName, raw.shopperName?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  const id = raw.shopperReference ?? raw.shopperEmail ?? ''
  return {
    id,
    externalId: id,
    email: raw.shopperEmail,
    name: fullName || undefined,
    phone: raw.telephoneNumber,
    currency: raw.shopperLocale ? pickCurrency(raw.shopperLocale.split('_')[1]) : undefined,
    gateway: 'adyen',
    metadata: strMap(raw.billingAddress),
    raw,
  }
}
