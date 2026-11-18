/**
 * Yuki contact transform.
 *
 * Contacts come from SearchContacts (Contact.asmx) which returns XML.
 * The SearchContactsResult inner XML contains <Contacts> with <Contact> elements.
 *
 * Field reference: Yuki Sales XML field docs + Contact.asmx WSDL
 *   ContactCode     — unique identifier (used as ContactCode in Sales XML)
 *   FullName        — company / person full name
 *   FirstName       — given name
 *   MiddleName      — middle name
 *   LastName        — family name
 *   Gender          — Male / Female
 *   CountryCode     — ISO 3166-1 alpha-2
 *   City            — city
 *   Zipcode         — postal code
 *   AddressLine_1   — street address line 1
 *   AddressLine_2   — street address line 2
 *   Website         — website URL
 *   CoCNumber       — Chamber of Commerce number
 *   VATNumber       — VAT identification number
 *   ContactType     — Company / Person
 *   BankAccount     — IBAN
 *   BIC             — BIC/SWIFT
 *   PhoneHome       — phone number
 *   MobileHome      — mobile number
 *   EmailAddress    — email (from ContactPerson sub-element)
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'
import { extractFirst, extractBlocks, unescapeXml } from '../client'

// ── Yuki raw type (parsed from SOAP XML) ─────────────────────────────────────

export interface YukiContact {
  ContactCode: string
  FullName: string
  FirstName: string
  MiddleName: string
  LastName: string
  Gender: string
  CountryCode: string
  City: string
  Zipcode: string
  AddressLine_1: string
  AddressLine_2: string
  Website: string
  CoCNumber: string
  VATNumber: string
  ContactType: string
  PhoneHome: string
  MobileHome: string
  EmailAddress: string
  [key: string]: unknown
}

// ── XML → YukiContact[] ───────────────────────────────────────────────────────

/**
 * Parse the inner XML from SearchContactsResult into an array of YukiContact.
 * Yuki wraps results in <Contacts><Contact>...</Contact></Contacts>.
 */
export function parseContactsXml(innerXml: string): YukiContact[] {
  const blocks = extractBlocks(innerXml, 'Contact')
  return blocks.map((block) => ({
    ContactCode: unescapeXml(extractFirst(block, 'ContactCode')),
    FullName: unescapeXml(extractFirst(block, 'FullName')),
    FirstName: unescapeXml(extractFirst(block, 'FirstName')),
    MiddleName: unescapeXml(extractFirst(block, 'MiddleName')),
    LastName: unescapeXml(extractFirst(block, 'LastName')),
    Gender: unescapeXml(extractFirst(block, 'Gender')),
    CountryCode: unescapeXml(extractFirst(block, 'CountryCode')),
    City: unescapeXml(extractFirst(block, 'City')),
    Zipcode: unescapeXml(extractFirst(block, 'Zipcode')),
    AddressLine_1: unescapeXml(extractFirst(block, 'AddressLine_1')),
    AddressLine_2: unescapeXml(extractFirst(block, 'AddressLine_2')),
    Website: unescapeXml(extractFirst(block, 'Website')),
    CoCNumber: unescapeXml(extractFirst(block, 'CoCNumber')),
    VATNumber: unescapeXml(extractFirst(block, 'VATNumber')),
    ContactType: unescapeXml(extractFirst(block, 'ContactType')),
    PhoneHome: unescapeXml(extractFirst(block, 'PhoneHome')),
    MobileHome: unescapeXml(extractFirst(block, 'MobileHome')),
    EmailAddress: unescapeXml(extractFirst(block, 'EmailAddress')),
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformContact(raw: YukiContact): Contact {
  const name = composeName(
    raw.FullName,
    raw.FirstName ? [raw.FirstName, raw.MiddleName].filter(Boolean).join(' ') : undefined,
    raw.LastName,
  )

  const emails = toWorkEmail(raw.EmailAddress)
  const telephones: Telephone[] = []
  if (raw.PhoneHome) telephones.push({ telephone: raw.PhoneHome, type: 'WORK' })
  if (raw.MobileHome) telephones.push({ telephone: raw.MobileHome, type: 'MOBILE' })

  const billingAddress = toAddress({
    address1: raw.AddressLine_1,
    address2: raw.AddressLine_2,
    city: raw.City,
    postalCode: raw.Zipcode,
    country: raw.CountryCode,
  })

  return {
    id: raw.ContactCode || undefined,
    name: name || undefined,
    firstName: raw.FirstName || undefined,
    lastName: raw.LastName || undefined,
    companyName: raw.ContactType === 'Company' ? (raw.FullName || undefined) : undefined,
    identification: raw.CoCNumber || undefined,
    taxNumber: raw.VATNumber || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → Yuki UpdateContact XML) ─────────────────────────

function escXml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function untransformContact(contact: Partial<Contact>, administrationId: string): string {
  const code = contact.id ?? ''
  const fullName = contact.name ?? contact.companyName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
  const email = contact.emails?.[0]?.email ?? ''
  const phone = contact.telephones?.find((t) => t.type === 'WORK' || t.type === 'HOME')?.telephone ?? ''
  const addr = contact.billingAddress

  return `<?xml version="1.0" encoding="utf-8"?>
<Contacts xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns="urn:xmlns:http://www.theyukicompany.com:contact"
          xsi:schemaLocation="urn:xmlns:http://www.theyukicompany.com:contact contact.xsd">
  <Contact>
    <AdministrationID>${escXml(administrationId)}</AdministrationID>
    <ContactCode>${escXml(code)}</ContactCode>
    <FullName>${escXml(fullName)}</FullName>
    <FirstName>${escXml(contact.firstName ?? '')}</FirstName>
    <LastName>${escXml(contact.lastName ?? '')}</LastName>
    <ContactType>${contact.companyName ? 'Company' : 'Person'}</ContactType>
    <EmailAddress>${escXml(email)}</EmailAddress>
    <PhoneHome>${escXml(phone)}</PhoneHome>
    <AddressLine_1>${escXml(addr?.address1 ?? '')}</AddressLine_1>
    <AddressLine_2>${escXml(addr?.address2 ?? '')}</AddressLine_2>
    <City>${escXml(addr?.city ?? '')}</City>
    <Zipcode>${escXml(addr?.postalCode ?? '')}</Zipcode>
    <CountryCode>${escXml(addr?.country ?? '')}</CountryCode>
    <VATNumber>${escXml(contact.taxNumber ?? '')}</VATNumber>
    <CoCNumber>${escXml(contact.identification ?? '')}</CoCNumber>
  </Contact>
</Contacts>`
}
