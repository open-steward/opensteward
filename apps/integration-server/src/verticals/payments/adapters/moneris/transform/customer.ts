import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { customDataToMetadata, required, type MonerisCustomData } from './shared'

/**
 * `customer` (Moneris API 2.15.1,
 * https://developer.moneris.com/moneris-api/reference/getcustomers.md):
 * `"required": ["customerId", "merchantId", "createdAt"]`.
 */
export interface RawMonerisCustomer {
  customerId: string
  merchantId: string
  createdAt: string
  modifiedAt?: string | null
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  companyName?: string | null
  phoneNumber?: string | null
  email?: string | null
  customData?: MonerisCustomData
}

function displayName(raw: RawMonerisCustomer): string | undefined {
  const person = [raw.firstName, raw.middleName, raw.lastName].filter((p) => !!p).join(' ')
  return person || raw.companyName || undefined
}

export function transformCustomer(raw: RawMonerisCustomer): Customer {
  const id = required(raw.customerId, 'customer.customerId')
  return {
    id,
    externalId: id,
    email: raw.email ?? undefined,
    name: displayName(raw),
    phone: raw.phoneNumber ?? undefined,
    gateway: 'moneris',
    metadata: customDataToMetadata(raw.customData),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.modifiedAt),
    raw,
  }
}
