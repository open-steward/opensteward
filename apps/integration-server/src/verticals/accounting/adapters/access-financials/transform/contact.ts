/**
 * Access Financials customer and supplier records → canonical Contact.
 *
 * Customers come from `debtors.masterRecords.customers.records`, suppliers
 * from `creditors.masterRecords.suppliers.records`. The documented list
 * queries select `customerDetails { primaryKey uniqueId code name onStop
 * notes contactDetails { title firstName surname salute jobTitle initials
 * contact } addressDetails { primaryKey address town county country
 * postCode email telephone mobile website fax ... } }` and the same under
 * `supplierDetails`
 * (https://developer.erp.accessacloud.com/docs/financials/business-entities/records/customer,
 * .../records/supplier).
 *
 * The id is `cust_<code>` / `supp_<code>`. The account code is what the
 * transaction enquiries carry (`accountCode`), so an invoice's `contactId`
 * and a bill's `contactId` name the contact this returns. `getContact`
 * reads it back with the documented `code` filter.
 *
 * `country` is left out: the docs give no example or format for it, and the
 * canonical address takes an ISO 3166 alpha-2 code only. `onStop` is not
 * mapped to `isActive`: a customer on stop is on credit hold, not inactive.
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toAddress, toPhone, toWorkEmail } from '../../shared/transform'

export interface AFContactDetails {
  title?: string | null
  firstName?: string | null
  surname?: string | null
  jobTitle?: string | null
}

export interface AFAddressDetails {
  address?: string | null
  town?: string | null
  county?: string | null
  country?: string | null
  postCode?: string | null
  email?: string | null
  telephone?: string | null
  mobile?: string | null
}

/** `CustomerDetails` / `SuppliersDetails`: the fields this adapter selects. */
export interface AFRecordDetails {
  primaryKey: number
  code?: string | null
  name?: string | null
  onStop?: boolean | null
  contactDetails?: AFContactDetails | null
  addressDetails?: AFAddressDetails | null
}

export interface AFCustomer {
  customerDetails: AFRecordDetails
}

export interface AFSupplier {
  supplierDetails: AFRecordDetails
}

function toContact(
  d: AFRecordDetails,
  prefix: 'cust' | 'supp',
  raw: Record<string, unknown>,
): Contact {
  if (!d.code) {
    throw new Error(
      `Access Financials: ${prefix === 'cust' ? 'customer' : 'supplier'} ${d.primaryKey} has no code`,
    )
  }
  const addr = d.addressDetails ?? undefined
  const telephones = [toPhone(addr?.telephone), toPhone(addr?.mobile, 'MOBILE')].filter(
    (t): t is Telephone => t !== undefined,
  )
  const emails = toWorkEmail(addr?.email)
  return {
    id: `${prefix}_${d.code}`,
    name: d.name || undefined,
    firstName: d.contactDetails?.firstName || undefined,
    lastName: d.contactDetails?.surname || undefined,
    isCustomer: prefix === 'cust',
    isSupplier: prefix === 'supp',
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: toAddress({
      address1: addr?.address,
      city: addr?.town,
      region: addr?.county,
      postalCode: addr?.postCode,
    }),
    metadata: raw,
  }
}

export function transformCustomer(raw: AFCustomer): Contact {
  return toContact(raw.customerDetails, 'cust', { ...raw })
}

export function transformSupplier(raw: AFSupplier): Contact {
  return toContact(raw.supplierDetails, 'supp', { ...raw })
}
