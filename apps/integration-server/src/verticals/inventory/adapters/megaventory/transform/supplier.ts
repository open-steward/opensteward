import type { Supplier } from '../../../schema/supplier'
import { pickStr, strMap } from './shared'

/**
 * `SupplierClientGet` → `mvSupplierClients[]`.
 *
 * Confirmed live 2026-09-18. **This one operation returns suppliers AND
 * customers**, discriminated by `SupplierClientType` ("Supplier" | "Client").
 * The adapter filters the request to Suppliers; without that filter a sync
 * imports every customer in the account as a supplier.
 */
export interface RawMegaventorySupplierClient {
  SupplierClientID?: number
  SupplierClientType?: string | null
  SupplierClientName?: string | null
  SupplierClientEmail?: string | null
  SupplierClientPhone1?: string | null
  SupplierClientPhone2?: string | null
  SupplierClientFax?: string | null
  SupplierClientTaxID?: string | null
  SupplierClientBillingAddress?: string | null
  SupplierClientShippingAddress1?: string | null
  SupplierClientComments?: string | null
  SupplierClientCreationDate?: string | null
  [key: string]: unknown
}

/**
 * Megaventory accepts several addresses in one string field and its email
 * field is free text, so an entry that is not a single address does not
 * satisfy the canonical `z.email()`. An unparseable value is dropped rather
 * than failing the whole record.
 */
function email(v: unknown): string | undefined {
  const s = pickStr(v)
  if (!s) return undefined
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s) ? s : undefined
}

export function transformSupplier(raw: RawMegaventorySupplierClient): Supplier {
  return {
    id: String(raw.SupplierClientID ?? ''),
    externalId: String(raw.SupplierClientID ?? ''),
    name: pickStr(raw.SupplierClientName) ?? '',
    email: email(raw.SupplierClientEmail),
    phone: pickStr(raw.SupplierClientPhone1) ?? pickStr(raw.SupplierClientPhone2),
    // No currency or lead time on the record — Megaventory carries currency on
    // locations and purchase orders, not on the supplier.
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    // No active flag; deletion is a separate operation and a default read
    // returns undeleted rows only.
    isActive: true,
    platform: 'megaventory',
    metadata: strMap({
      SupplierClientType: raw.SupplierClientType,
      SupplierClientTaxID: raw.SupplierClientTaxID,
      SupplierClientBillingAddress: raw.SupplierClientBillingAddress,
    }),
    raw: raw as unknown as Record<string, unknown>,
  }
}
