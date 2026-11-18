import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickBool, strMap} from './shared'

/**
 * KORONA.cloud API v3 Supplier shape.
 * Contact info is nested in the `contact` object (email, phone, fax, website).
 * Address is `ProductTransferInvolvedPartyInformationData` which nests an
 * `AddressInformation` object at `address.address.*` (company at `address.company`).
 */
export interface RawKoronaPosSupplier {
  id: string
  number?: string
  name?: string
  active?: boolean
  contact?: {
    email?: string
    phone?: string
    fax?: string
    website?: string
  }
  /** ProductTransferInvolvedPartyInformationData: address.address is AddressInformation */
  address?: {
    company?: string
    address?: {
      addressLine1?: string
      addressLine2?: string
      city?: string
      state?: string
      country?: string
      zipCode?: string
      department?: string
    }
  }
  customerNumber?: string
  additionalInformation?: string
  [key: string]: unknown
}

export function transformSupplier(raw: RawKoronaPosSupplier): Supplier {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    email: pickStr(raw.contact?.email),
    phone: pickStr(raw.contact?.phone),
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    isActive: pickBool(raw.active) ?? true,
    platform: 'korona-pos',
    metadata: strMap({
      number: raw.number,
      customerNumber: raw.customerNumber,
      website: raw.contact?.website,
      fax: raw.contact?.fax,
      additionalInformation: raw.additionalInformation,
    }),
    raw,
  }
}
