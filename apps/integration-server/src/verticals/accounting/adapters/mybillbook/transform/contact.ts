/**
 * myBillBook → canonical Contact transform.
 *
 * myBillBook calls contacts "parties" — both customers and suppliers share
 * the same parties endpoint. The `party_type` field distinguishes them:
 *   "customer" | "supplier" | "both"
 *
 * Party fields (snake_case):
 *   id, name, party_type, gstin, pan, email, phone, address, city,
 *   state, pincode, country, is_active, created_at, updated_at
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface MybillbookParty {
  id: string
  name?: string
  party_type?: string   // "customer" | "supplier" | "both"
  gstin?: string        // GST identification number (India)
  pan?: string          // Permanent Account Number (India)
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformParty(raw: MybillbookParty): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const partyType = (raw.party_type ?? '').toLowerCase()
  const isCustomer = partyType === 'customer' || partyType === 'both'
  const isSupplier = partyType === 'supplier' || partyType === 'both'

  return {
    id: raw.id,
    name: raw.name || undefined,
    // GSTIN doubles as the tax number for Indian entities
    taxNumber: raw.gstin || undefined,
    identification: raw.pan || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.is_active,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.state,
      postalCode: raw.pincode,
      country: raw.country,
    }),
    createdAt: toIsoDatetime(raw.created_at) ? new Date(toIsoDatetime(raw.created_at)!) : undefined,
    updatedAt: toIsoDatetime(raw.updated_at) ? new Date(toIsoDatetime(raw.updated_at)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
