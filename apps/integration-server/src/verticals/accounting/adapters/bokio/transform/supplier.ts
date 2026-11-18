/**
 * Bokio `supplier` ↔ canonical Contact.
 *
 * Shape: the `supplier` schema of the [Preview] suppliers API. GET
 * /companies/{companyId}/suppliers/{supplierId}
 * (https://docs.bokio.se/reference/get-supplier-by-id.md) answers it bare,
 * GET /companies/{companyId}/suppliers
 * (https://docs.bokio.se/reference/get-suppliers.md) as the `items` of the
 * paged envelope, and POST / PUT (post-supplier.md, put-supplier.md) take and
 * return the same schema: id (uuid, readOnly), name (required), orgNumber,
 * vatNumber, currency (ISO 4217, "Defaults to SEK if not provided"), address
 * { line1, line2, city, postalCode, country } (`supplierAddress`, no
 * countrySubdivision) and paymentDetails (bankgiro | plusgiro | transfer |
 * internationalPayment).
 *
 * A supplier is a contact that is a supplier and not a customer: Bokio keeps
 * customers (GET customers) and suppliers apart, each with its own uuid. Its
 * `id` is the one a supplier invoice names as `supplierRef.id`, so a Bill's
 * `contactId` resolves to it.
 *
 * `paymentDetails` has no canonical counterpart (the canonical payment-method
 * types are ACH, CARD, CHECK, WIRE, PAYPAL, OTHER; a Swedish bankgiro number is
 * none of them), so it stays in `metadata` and is sent back unchanged on an
 * update. A supplier documents no contact details, active flag or timestamp.
 */
import type { Contact } from '../../../schema/contact'
import { toAddress } from '../../shared/transform'

export interface BokioSupplierAddress {
  line1?: string
  line2?: string | null
  city?: string
  postalCode?: string
  /** ISO 3166-1 alpha-2, "Defaults to SE if not provided". */
  country?: string
}

export interface BokioSupplier {
  id: string
  name?: string
  orgNumber?: string
  vatNumber?: string
  currency?: string
  address?: BokioSupplierAddress | null
  paymentDetails?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformSupplier(raw: BokioSupplier): Contact {
  return {
    id: raw.id,
    name: raw.name || undefined,
    identification: raw.orgNumber || undefined,
    taxNumber: raw.vatNumber || undefined,
    isCustomer: false,
    isSupplier: true,
    currency: raw.currency || undefined,
    billingAddress: toAddress({
      address1: raw.address?.line1,
      address2: raw.address?.line2,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' })
}

/**
 * Canonical Contact → the `supplier` body of POST suppliers, or, laid over
 * the current supplier, of PUT suppliers/{id}.
 *
 * Only the fields the `supplier` schema declares are written: name,
 * identification → orgNumber, taxNumber → vatNumber, currency, billingAddress
 * → address. A supplier has no contact details and no second address, so a
 * request that sets emails, telephones or a shippingAddress is refused before
 * any call rather than silently dropped. A canonical address that names only
 * some fields is laid over the current one field by field.
 */
export function untransformSupplier(
  data: Partial<Contact>,
  current?: BokioSupplier,
): Omit<BokioSupplier, 'id'> {
  if (data.emails !== undefined || data.telephones !== undefined) {
    throw validationError(
      'A Bokio supplier has no contact details (https://docs.bokio.se/reference/post-supplier.md); ' +
        'omit emails and telephones.',
    )
  }
  if (data.shippingAddress != null) {
    throw validationError(
      'A Bokio supplier has one address, written from billingAddress; omit shippingAddress.',
    )
  }
  const { id: _id, ...base } = current ?? ({} as BokioSupplier)
  const name = data.name ?? current?.name
  if (!name) {
    throw validationError(
      'A Bokio supplier requires a name (https://docs.bokio.se/reference/post-supplier.md).',
    )
  }
  const addr = data.billingAddress
  const cur = current?.address ?? undefined
  return {
    ...base,
    name,
    ...(data.identification != null && { orgNumber: data.identification }),
    ...(data.taxNumber != null && { vatNumber: data.taxNumber }),
    ...(data.currency != null && { currency: data.currency }),
    ...(addr && {
      address: {
        line1: addr.address1 ?? cur?.line1,
        line2: addr.address2 === undefined ? (cur?.line2 ?? null) : addr.address2,
        city: addr.city ?? cur?.city,
        postalCode: addr.postalCode ?? cur?.postalCode,
        country: addr.country ?? cur?.country,
      },
    }),
  }
}
