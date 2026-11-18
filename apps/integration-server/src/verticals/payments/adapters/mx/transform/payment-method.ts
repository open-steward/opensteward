import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'

/**
 * AccountResponse, from https://docs.mx.com/openapi/platform-api/v20250224.yaml
 * (components.schemas.AccountResponse), returned by
 * GET /users/{user_identifier}/accounts and GET /users/{user_guid}/accounts/{account_guid}.
 * Only the fields read here are typed; the rest stay on `raw`.
 */
export interface RawMxAccount {
  guid?: string | null
  user_guid?: string | null
  type?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * An account is read back only under its user
 * (GET /users/{user_guid}/accounts/{account_guid}), so the canonical id
 * carries both: `userGuid:accountGuid`.
 */
export function paymentMethodId(userGuid: string, accountGuid: string): string {
  return `${userGuid}:${accountGuid}`
}

/**
 * `type`: "The type of account." The enum is ANY, CASH, CHECKING,
 * CHECKING_LINE_OF_CREDIT, CREDIT_CARD, LOAN, LINE_OF_CREDIT, SAVINGS,
 * INVESTMENT, MORTGAGE, INSURANCE, PREPAID, PROPERTY.
 */
function mapType(type: string | null | undefined): PaymentMethodType {
  switch (type) {
    case 'CHECKING':
    case 'SAVINGS':
      return 'bank_account'
    case 'CREDIT_CARD':
      return 'card'
    case 'ANY':
    case 'CASH':
    case 'CHECKING_LINE_OF_CREDIT':
    case 'LOAN':
    case 'LINE_OF_CREDIT':
    case 'INVESTMENT':
    case 'MORTGAGE':
    case 'INSURANCE':
    case 'PREPAID':
    case 'PROPERTY':
      return 'other'
    default:
      return 'unknown'
  }
}

function requireString(raw: RawMxAccount, field: 'guid' | 'user_guid'): string {
  const v = raw[field]
  if (typeof v !== 'string' || v === '') {
    throw new Error(`MX account has no ${field}; cannot identify the payment method`)
  }
  return v
}

export function transformPaymentMethod(raw: RawMxAccount): PaymentMethod {
  const guid = requireString(raw, 'guid')
  const userGuid = requireString(raw, 'user_guid')
  return {
    id: paymentMethodId(userGuid, guid),
    externalId: guid,
    customerId: userGuid,
    type: mapType(raw.type),
    gateway: 'mx',
    // `metadata` is a free-form string ("Additional information you stored
    // about the `account`"), not a map; it stays on `raw`.
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
