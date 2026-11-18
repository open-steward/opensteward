import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface InvoiceqOrganization {
  id?: string
  name?: string
  email?: string
  phone?: string
  address?: string
  tax_number?: string
  currency_code?: string
  [key: string]: unknown
}

export function transformOrganization(raw: InvoiceqOrganization): Organization {
  return {
    id: raw.id ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_number || undefined,
    currency: raw.currency_code || undefined,
    address: toAddress({ address1: raw.address }),
    metadata: raw as Record<string, unknown>,
  }
}
