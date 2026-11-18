import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface InvoiceXpressOrganization {
  name: string
  tax_id: string
  email: string
  phone: string
  address: string
  [key: string]: unknown
}

export function transformOrganization(raw: InvoiceXpressOrganization): Organization {
  return {
    name: raw.name || undefined,
    taxNumber: raw.tax_id || undefined,
    address: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
