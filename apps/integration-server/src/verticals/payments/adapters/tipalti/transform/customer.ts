import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap } from './shared'

/**
 * A Tipalti **payee** maps onto the canonical **Customer** — it is the
 * counterparty the payer transacts with. Contact details live under
 * `contactInformation`; the default settlement currency under
 * `paymentMethod.currency`.
 */
export interface RawTipaltiPayee {
  id?: string
  refCode?: string
  status?: string
  entityType?: string
  isPayable?: boolean
  isAccountClosed?: boolean
  statusReason?: string
  lastChangeDateTimeUTC?: string
  statusChangeDateTimeUTC?: string
  contactInformation?: {
    email?: string
    firstName?: string
    lastName?: string
    companyName?: string
    phone?: string
    phoneCountryCode?: string
    address?: string
    address2?: string
    city?: string
    zip?: string
    stateProvinceCode?: string
    beneficiaryCountryCode?: string
    paymentCountryCode?: string
  }
  paymentMethod?: {
    paymentMethodType?: string
    currency?: string
  }
  [k: string]: unknown
}

function payeeName(contact: RawTipaltiPayee['contactInformation']): string | undefined {
  if (!contact) return undefined
  if (contact.companyName) return contact.companyName
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
  return name || undefined
}

export function transformCustomer(raw: RawTipaltiPayee): Customer {
  const contact = raw.contactInformation
  return {
    id: String(raw.id ?? raw.refCode ?? ''),
    externalId: String(raw.refCode ?? raw.id ?? ''),
    email: contact?.email,
    name: payeeName(contact),
    phone: contact?.phone,
    currency: raw.paymentMethod?.currency ? pickCurrency(raw.paymentMethod.currency) : undefined,
    gateway: 'tipalti',
    metadata: strMap({
      status: raw.status,
      entity_type: raw.entityType,
      is_payable: raw.isPayable,
      is_account_closed: raw.isAccountClosed,
      status_reason: raw.statusReason,
      payment_method_type: raw.paymentMethod?.paymentMethodType,
      payment_country_code: contact?.paymentCountryCode,
      beneficiary_country_code: contact?.beneficiaryCountryCode,
    }),
    updatedAt: toIsoDatetime(raw.lastChangeDateTimeUTC),
    raw,
  }
}
