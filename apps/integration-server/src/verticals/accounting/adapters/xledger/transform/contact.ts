import type { Contact } from '../../../schema/contact'
import { prefixedId } from '../../shared/transform'

/**
 * A `customers` or `suppliers` node, with only the fields the first-party
 * articles select: `code description dbId companyDbId` for customers ("Create
 * or update customer",
 * https://xledgerukinternal.zendesk.com/hc/en-us/articles/8681708023698) and
 * `code description dbId` for suppliers ("Create or update supplier",
 * https://xledgerukinternal.zendesk.com/hc/en-us/articles/8674660344338).
 */
export interface XledgerContact {
  dbId: number
  code?: string | null
  description?: string | null
  companyDbId?: number | null
  [key: string]: unknown
}

export type XledgerContactKind = 'customer' | 'supplier'

/** Contact ids name the register they came from: `cust_<dbId>` or `supp_<dbId>`. */
export const CONTACT_ID_PREFIX: Record<XledgerContactKind, string> = {
  customer: 'cust',
  supplier: 'supp',
}

/**
 * Whether the contact is a customer or a supplier is which register it was
 * read from. `description` is the name the articles create it with
 * (`description: "test"`); `code` is Xledger's own customer or supplier code,
 * not an organisation number, so it stays in `metadata`.
 */
export function transformContact(raw: XledgerContact, kind: XledgerContactKind): Contact {
  return {
    id: prefixedId(CONTACT_ID_PREFIX[kind], raw.dbId),
    name: raw.description || undefined,
    isCustomer: kind === 'customer',
    isSupplier: kind === 'supplier',
    metadata: raw as Record<string, unknown>,
  }
}
