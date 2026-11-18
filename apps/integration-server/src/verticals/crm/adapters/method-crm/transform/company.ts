import type { Company } from '../../../schema/company'

/**
 * Method CRM Customer table raw record shape.
 *
 * Table name : Customer
 * Key fields : RecordId, Name, CompanyName, Email, Phone, BillingLine1,
 *              BillingCity, BillingState, BillingPostalCode, BillingCountry,
 *              CreatedDate, ModifiedDate
 *
 * In Method CRM, companies/organisations are stored in the Customer table.
 * Individual contacts are in the Contact table.
 */
export interface RawMethodCustomer {
  RecordId: string | number
  Name?: string
  CompanyName?: string
  Email?: string
  Phone?: string
  BillingLine1?: string
  BillingLine2?: string
  BillingCity?: string
  BillingState?: string
  BillingPostalCode?: string
  BillingCountry?: string
  CreatedDate?: string
  ModifiedDate?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawMethodCustomer): Company {
  const displayName =
    (typeof raw.CompanyName === 'string' && raw.CompanyName.length > 0
      ? raw.CompanyName
      : undefined) ??
    (typeof raw.Name === 'string' && raw.Name.length > 0 ? raw.Name : undefined) ??
    ''

  const city = typeof raw.BillingCity === 'string' ? raw.BillingCity : undefined
  const state = typeof raw.BillingState === 'string' ? raw.BillingState : undefined
  const postalCode =
    typeof raw.BillingPostalCode === 'string' ? raw.BillingPostalCode : undefined
  const country = typeof raw.BillingCountry === 'string' ? raw.BillingCountry : undefined
  const line1 = typeof raw.BillingLine1 === 'string' ? raw.BillingLine1 : undefined

  const hasAddress = city ?? state ?? postalCode ?? country ?? line1

  return {
    id: String(raw.RecordId),
    name: displayName,
    phone: typeof raw.Phone === 'string' ? raw.Phone : undefined,
    address: hasAddress
      ? {
          line1: line1 ?? undefined,
          city: city ?? undefined,
          region: state ?? undefined,
          postalCode: postalCode ?? undefined,
          country: country ?? undefined,
        }
      : undefined,
    created_at: typeof raw.CreatedDate === 'string' ? raw.CreatedDate : undefined,
    updated_at: typeof raw.ModifiedDate === 'string' ? raw.ModifiedDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.CompanyName = data.name
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.address?.line1 !== undefined) out.BillingLine1 = data.address.line1
  if (data.address?.city !== undefined) out.BillingCity = data.address.city
  if (data.address?.region !== undefined) out.BillingState = data.address.region
  if (data.address?.postalCode !== undefined) out.BillingPostalCode = data.address.postalCode
  if (data.address?.country !== undefined) out.BillingCountry = data.address.country
  return out
}
