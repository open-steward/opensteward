/**
 * AFAS Profit_Debtors / Profit_Creditors GetConnector → canonical Contact transform.
 *
 * Debtor (customer) fields (Profit_Debtors):
 *   DbId, DbName, DbAddress, DbPostalCode, DbCity, DbCountryIso, DbEmail,
 *   DbPhone, DbVatNr, DbCurrency, DbIsActive
 *
 * Creditor (supplier) fields (Profit_Creditors):
 *   CrId, CrName, CrAddress, CrPostalCode, CrCity, CrCountryIso, CrEmail,
 *   CrPhone, CrVatNr, CrCurrency, CrIsActive
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

/** Row returned by Profit_Debtors */
export interface AfasDebtor {
  DbId: string
  DbName: string
  DbAddress: string
  DbPostalCode: string
  DbCity: string
  DbCountryIso: string
  DbEmail: string
  DbPhone: string
  DbVatNr: string
  DbCurrency: string
  DbIsActive: boolean
  [key: string]: unknown
}

/** Row returned by Profit_Creditors */
export interface AfasCreditor {
  CrId: string
  CrName: string
  CrAddress: string
  CrPostalCode: string
  CrCity: string
  CrCountryIso: string
  CrEmail: string
  CrPhone: string
  CrVatNr: string
  CrCurrency: string
  CrIsActive: boolean
  [key: string]: unknown
}

export function transformDebtor(raw: AfasDebtor): Contact {
  const emails = toWorkEmail(raw.DbEmail)
  const telephones: Telephone[] = []
  if (raw.DbPhone) telephones.push({ telephone: raw.DbPhone, type: 'WORK' })

  return {
    id: `deb_${raw.DbId}`,
    name: raw.DbName || undefined,
    taxNumber: raw.DbVatNr || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.DbIsActive ?? undefined,
    currency: raw.DbCurrency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.DbAddress,
      city: raw.DbCity,
      postalCode: raw.DbPostalCode,
      country: raw.DbCountryIso,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformCreditor(raw: AfasCreditor): Contact {
  const emails = toWorkEmail(raw.CrEmail)
  const telephones: Telephone[] = []
  if (raw.CrPhone) telephones.push({ telephone: raw.CrPhone, type: 'WORK' })

  return {
    id: `crd_${raw.CrId}`,
    name: raw.CrName || undefined,
    taxNumber: raw.CrVatNr || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.CrIsActive ?? undefined,
    currency: raw.CrCurrency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.CrAddress,
      city: raw.CrCity,
      postalCode: raw.CrPostalCode,
      country: raw.CrCountryIso,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
