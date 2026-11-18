/**
 * SaldeoSMART contractor → canonical Contact transform.
 *
 * contractor.list returns a flat list of CONTRACTOR elements. Each can be
 * a customer (CUSTOMER=true), a supplier (SUPPLIER=true), or both.
 *
 * XML field map (contractor.list / document_list_response embedded contractors):
 *   CONTRACTOR_ID         → id
 *   SHORT_NAME            → name (display name)
 *   FULL_NAME             → companyName
 *   SUPPLIER              → isSupplier
 *   CUSTOMER              → isCustomer
 *   VAT_NUMBER            → taxNumber (NIP)
 *   CITY                  → billingAddress.city
 *   POSTCODE              → billingAddress.postalCode
 *   STREET                → billingAddress.address1
 *   COUNTRY_ISO3166A2     → billingAddress.country
 *   TELEPHONE             → telephones[0].telephone
 *   EMAILS / EMAIL        → emails
 *   INACTIVE              → isActive (inverted)
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import { xmlTag, xmlBlocks } from '../client'

export interface SaldeoContractor {
  CONTRACTOR_ID: string
  SHORT_NAME?: string
  FULL_NAME?: string
  SUPPLIER?: string
  CUSTOMER?: string
  VAT_NUMBER?: string
  CITY?: string
  POSTCODE?: string
  STREET?: string
  COUNTRY_ISO3166A2?: string
  TELEPHONE?: string
  EMAILS?: string[]
  INACTIVE?: string
  _raw: string
}

export function parseSaldeoContractor(xml: string): SaldeoContractor {
  // Collect emails from <EMAILS><EMAIL>...</EMAIL></EMAILS>
  const emailsBlock = xmlTag(xml, 'EMAILS') ?? ''
  const emails = xmlBlocks(emailsBlock, 'EMAIL')
    .map((b) => xmlTag(b, 'EMAIL') ?? b.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)

  return {
    CONTRACTOR_ID: xmlTag(xml, 'CONTRACTOR_ID') ?? '',
    SHORT_NAME: xmlTag(xml, 'SHORT_NAME'),
    FULL_NAME: xmlTag(xml, 'FULL_NAME'),
    SUPPLIER: xmlTag(xml, 'SUPPLIER'),
    CUSTOMER: xmlTag(xml, 'CUSTOMER'),
    VAT_NUMBER: xmlTag(xml, 'VAT_NUMBER'),
    CITY: xmlTag(xml, 'CITY'),
    POSTCODE: xmlTag(xml, 'POSTCODE'),
    STREET: xmlTag(xml, 'STREET'),
    COUNTRY_ISO3166A2: xmlTag(xml, 'COUNTRY_ISO3166A2'),
    TELEPHONE: xmlTag(xml, 'TELEPHONE'),
    EMAILS: emails,
    INACTIVE: xmlTag(xml, 'INACTIVE'),
    _raw: xml,
  }
}

export function transformContractor(raw: SaldeoContractor): Contact {
  const isSupplier = raw.SUPPLIER === 'true'
  const isCustomer = raw.CUSTOMER === 'true'
  const isActive = raw.INACTIVE !== 'true'

  const emails = (raw.EMAILS ?? []).flatMap((e) => toWorkEmail(e))
  const telephones: Telephone[] = []
  if (raw.TELEPHONE) telephones.push({ telephone: raw.TELEPHONE, type: 'WORK' })

  return {
    id: raw.CONTRACTOR_ID || undefined,
    name: raw.SHORT_NAME || raw.FULL_NAME || undefined,
    companyName: raw.FULL_NAME || undefined,
    taxNumber: raw.VAT_NUMBER || undefined,
    isCustomer: isCustomer || (!isSupplier && !isCustomer) ? true : isCustomer,
    isSupplier,
    isActive,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.STREET,
      city: raw.CITY,
      postalCode: raw.POSTCODE,
      country: raw.COUNTRY_ISO3166A2,
    }),
    metadata: { _xml: raw._raw } as Record<string, unknown>,
  }
}
