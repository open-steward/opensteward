/**
 * Digits ledger `Party` → canonical Contact.
 *
 * GET /v1/ledger/parties returns `ListLedgerPartiesResponse` = `{ parties: Party[], next: Page }`
 * and GET /v1/ledger/party/{id} returns `GetLedgerPartyResponse` = `{ party: Party }`
 * (https://developer.digits.com/openapi/openapi.yaml). `Party` properties:
 * id (an `Identifier`), name, email, kind, description, createdAt, updatedAt, roles.
 *
 * `Identifier` is `{ issuer, id }`: "The issuer of this identifier, for example
 * \"digits.com\", \"plaid.com\"" and "The raw ID string from the issuer".
 *
 * `roles`: "Accounting roles derived from the party's ledger activity ...
 * Empty when no roles can be determined from ledger activity." The List
 * Parties `roles` filter adds: "Vendors span multiple accounting roles".
 */
import type { Contact } from '../../../schema/contact'

export interface DigitsIdentifier {
  issuer?: string
  id?: string
}

export interface DigitsParty {
  id?: DigitsIdentifier
  name?: string
  email?: string
  kind?: 'UnknownKind' | 'Person' | 'Business' | string
  description?: string
  createdAt?: string
  updatedAt?: string
  roles?: string[]
}

/** The spec's customer roles. */
const CUSTOMER_ROLES = new Set(['EntityCustomerRole', 'EntityUnpaidCustomerRole'])

/** The spec's vendor and supplier roles ("Vendors span multiple accounting roles"). */
const SUPPLIER_ROLES = new Set([
  'EntityVendorRole',
  'EntitySupplierRole',
  'EntityOwedVendorRole',
  'EntityPrepaidVendorRole',
  'EntityAssetVendorRole',
  'EntityAssetSupplierRole',
])

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function transformParty(raw: DigitsParty): Contact {
  const id = raw.id?.id
  if (!id) throw new Error('Digits party has no id.id')
  // No roles means Digits could not tell, not that the party is neither.
  const roles = raw.roles ?? []
  const known = roles.length > 0
  return {
    id,
    name: raw.name || undefined,
    companyName: raw.kind === 'Business' ? raw.name || undefined : undefined,
    isCustomer: known ? roles.some((r) => CUSTOMER_ROLES.has(r)) : undefined,
    isSupplier: known ? roles.some((r) => SUPPLIER_ROLES.has(r)) : undefined,
    emails: raw.email ? [{ email: raw.email }] : undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    metadata: { ...raw },
  }
}
