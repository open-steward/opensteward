/**
 * Bokio `companyInformation` (+ fiscal years) → canonical Organization.
 *
 * GET /companies/{companyId}/company-information
 * (https://docs.bokio.se/reference/get-company-information-with-id.md): id
 * (uuid), companyType, name, organizationNumber, phone, email, hasBBA,
 * address { line1, line2, city, postalCode, country }. No currency is
 * documented, so none is set.
 *
 * `fiscalYearEndMonth` comes from GET /companies/{companyId}/fiscal-years
 * (https://docs.bokio.se/reference/get-fiscal-years.md, scope
 * `fiscal-years:read`): each `fiscalYear` has id, startDate, endDate (date),
 * accountingMethod ("cash" | "accrual") and status ("open" | "closed"). The
 * month is the one the latest `endDate` falls in: the list's order is not
 * documented, so the latest is chosen by date, not by position. A company's
 * first fiscal year may be shortened or extended, so an earlier year's end is
 * not the rule the company books by now. No fiscal year, no month.
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface BokioCompanyInfo {
  id?: string
  companyType?: string
  name?: string
  organizationNumber?: string
  phone?: string
  email?: string
  hasBBA?: boolean
  address?: {
    line1?: string
    line2?: string | null
    city?: string
    postalCode?: string
    country?: string
  } | null
  [key: string]: unknown
}

/** `fiscalYear` (title "Fiscal Year"). */
export interface BokioFiscalYear {
  id: string
  /** date, e.g. "2023-01-01". */
  startDate?: string
  /** date, e.g. "2023-12-31". */
  endDate?: string
  accountingMethod?: 'cash' | 'accrual' | string
  status?: 'open' | 'closed' | string
  [key: string]: unknown
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The month (1–12) of the latest documented `endDate`, or undefined. */
export function fiscalYearEndMonth(years: readonly BokioFiscalYear[]): number | undefined {
  let latest: string | undefined
  for (const y of years) {
    const end = y?.endDate
    if (typeof end !== 'string' || !DATE.test(end)) continue
    if (latest === undefined || end > latest) latest = end
  }
  if (latest === undefined) return undefined
  const month = Number(DATE.exec(latest)![2])
  return month >= 1 && month <= 12 ? month : undefined
}

export function transformOrganization(
  raw: BokioCompanyInfo,
  fiscalYears: readonly BokioFiscalYear[] = [],
): Organization {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    organizationCode: raw.organizationNumber || undefined,
    fiscalYearEndMonth: fiscalYearEndMonth(fiscalYears),
    address: toAddress({
      address1: raw.address?.line1,
      address2: raw.address?.line2,
      city: raw.address?.city,
      postalCode: raw.address?.postalCode,
      country: raw.address?.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
