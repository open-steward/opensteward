import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { parseNmiDatetime, strMap, xmlTag } from './shared'

/**
 * A normalised NMI stored payment method, decoded from a Query API
 * `report_type=customer_vault` `<customer>` block.
 *
 * The Customer Vault response includes both customer PII fields (handled by
 * `customer.ts`) and the stored payment details for the card or ACH account
 * linked to each vault record. Field names confirmed from the ZNMI TypeScript
 * wrapper (`QueryCustomerVaultCustomerSchema`):
 *   cc_number (masked e.g. "4xxxxxxxxxxx4242"), cc_type, cc_exp (MMYY),
 *   cc_bin, cc_hash, check_account (masked), check_aba, check_name,
 *   account_holder_type, account_type.
 *
 * Each Customer Vault record stores ONE payment instrument; we map it to a
 * single PaymentMethod. This is a DERIVED resource — it reuses the
 * `report_type=customer_vault` query already used by `listCustomers`/
 * `getCustomer` but extracts the payment-method fields.
 */
export interface RawNmiVaultPaymentMethod {
  /** Customer Vault ID — doubles as the payment method external id. */
  customerVaultId?: string
  /** Masked credit card number e.g. "4xxxxxxxxxxx4242". */
  ccNumber?: string
  /** Card network: visa | mastercard | amex | discover | etc. */
  ccType?: string
  /** Expiry in MMYY format e.g. "1228". */
  ccExp?: string
  /** BIN (first 6 digits). */
  ccBin?: string
  /** Masked ACH account number. */
  checkAccount?: string
  /** ACH routing number. */
  checkAba?: string
  /** ACH account holder name. */
  checkName?: string
  /** ACH account holder type: "business" | "personal". */
  accountHolderType?: string
  /** ACH account type: "checking" | "savings". */
  accountType?: string
  firstName?: string
  lastName?: string
  created?: string
  updated?: string
  raw?: unknown
}

function detectType(raw: RawNmiVaultPaymentMethod): PaymentMethodType {
  if (raw.checkAccount || raw.checkAba) return 'bank_account'
  if (raw.ccNumber || raw.ccType) return 'card'
  return 'other'
}

/** Parse "MMYY" → { month, year } where year is 4-digit (20YY). */
function parseExpiry(ccExp: string | undefined): { month?: number; year?: number } {
  if (!ccExp) return {}
  const s = ccExp.replace(/\D/g, '')
  if (s.length === 4) {
    const month = parseInt(s.slice(0, 2), 10)
    const year = 2000 + parseInt(s.slice(2, 4), 10)
    if (month >= 1 && month <= 12) return { month, year }
  }
  return {}
}

function extractLast4(ccNumber: string | undefined): string | undefined {
  if (!ccNumber) return undefined
  const digits = ccNumber.replace(/\D/g, '')
  if (digits.length >= 4) return digits.slice(-4)
  // masked form e.g. "4xxxxxxxxxxx4242" — take last 4 chars if alphanumeric
  const clean = ccNumber.replace(/\s/g, '')
  if (clean.length >= 4) return clean.slice(-4).replace(/[^0-9]/g, '') || undefined
  return undefined
}

export function transformPaymentMethod(raw: RawNmiVaultPaymentMethod): PaymentMethod {
  const type = detectType(raw)
  const { month, year } = parseExpiry(raw.ccExp)
  const holderName =
    raw.checkName ||
    [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() ||
    undefined

  return {
    id: String(raw.customerVaultId ?? ''),
    externalId: String(raw.customerVaultId ?? ''),
    customerId: raw.customerVaultId || undefined,
    type,
    brand: raw.ccType?.toLowerCase() || undefined,
    last4: type === 'card' ? extractLast4(raw.ccNumber) : raw.checkAccount?.slice(-4) || undefined,
    expMonth: month,
    expYear: year,
    holderName: holderName || undefined,
    bankName: undefined,
    isDefault: undefined,
    fingerprint: raw.ccBin || undefined,
    gateway: 'nmi',
    metadata: strMap({
      cc_bin: raw.ccBin,
      check_aba: raw.checkAba,
      account_holder_type: raw.accountHolderType,
      account_type: raw.accountType,
    }),
    createdAt: parseNmiDatetime(raw.created),
    updatedAt: parseNmiDatetime(raw.updated),
    raw: raw.raw ?? raw,
  }
}

/**
 * Decode one Customer Vault `<customer>` XML block into a
 * `RawNmiVaultPaymentMethod` (payment instrument portion only).
 */
export function paymentMethodFromVaultXml(block: string): RawNmiVaultPaymentMethod {
  return {
    customerVaultId: xmlTag(block, 'customer_vault_id') ?? xmlTag(block, 'id'),
    ccNumber: xmlTag(block, 'cc_number'),
    ccType: xmlTag(block, 'cc_type'),
    ccExp: xmlTag(block, 'cc_exp'),
    ccBin: xmlTag(block, 'cc_bin'),
    checkAccount: xmlTag(block, 'check_account'),
    checkAba: xmlTag(block, 'check_aba'),
    checkName: xmlTag(block, 'check_name'),
    accountHolderType: xmlTag(block, 'account_holder_type'),
    accountType: xmlTag(block, 'account_type'),
    firstName: xmlTag(block, 'first_name'),
    lastName: xmlTag(block, 'last_name'),
    created: xmlTag(block, 'created'),
    updated: xmlTag(block, 'updated'),
    raw: block,
  }
}
