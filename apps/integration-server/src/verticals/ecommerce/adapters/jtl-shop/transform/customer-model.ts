/**
 * JTL-Shop REST `CustomerModel` (table `tkunde`) → canonical Customer.
 *
 * From https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Models/CustomerModel.php:
 *
 *   "$attributes['id']                = DataAttribute::create('kKunde', 'int', null, false, true);"
 *   "$attributes['firstname']         = DataAttribute::create(" / "'cVorname',"
 *   "$attributes['surname']           = DataAttribute::create(" / "'cNachname',"
 *   "$attributes['street']            = DataAttribute::create(" / "'cStrasse',"
 *   "$attributes['streetNO']          = DataAttribute::create('cHausnummer', 'varchar', null, false);"
 *   "$attributes['additionalAddress'] = DataAttribute::create('cAdressZusatz', 'varchar');"
 *   "$attributes['zip']               = DataAttribute::create('cPLZ', 'varchar', self::cast('', 'varchar'), false);"
 *   "$attributes['city']              = DataAttribute::create('cOrt', 'varchar', self::cast('', 'varchar'), false);"
 *   "$attributes['state']             = DataAttribute::create(" / "'cBundesland',"
 *   "$attributes['tel']               = DataAttribute::create('cTel', 'varchar');"
 *   "$attributes['mail']              = DataAttribute::create('cMail', 'varchar', self::cast('', 'varchar'), false);"
 *
 * ENCRYPTED FIELDS. The shop stores surname, company, additional and street
 * XTEA-encrypted. CustomerController::index decrypts them
 * ("foreach ($res as $customer) { $this->decryptCustomerData($customer); }",
 * where decryptCustomerData calls "$customer->setSurname(\trim($cryptoService->decryptXTEA(...". )
 * but CustomerController::show does not: it answers
 * "return $this->respondWithModel($result);" straight from `init()`. So a
 * record from GET /customer/{id} carries ciphertext in those fields, and they
 * are mapped only when `decrypted` is true (rows from the list).
 *
 * `cLand` (country) is not documented as an ISO code, and `dErstellt` /
 * `dVeraendert` are zone-less shop-local dates: all three stay in `metadata`.
 */
import { z } from 'zod'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface JtlCustomerModel {
  id: number
  firstname?: string | null
  surname?: string | null
  street?: string | null
  streetNO?: string | null
  additionalAddress?: string | null
  zip?: string | null
  city?: string | null
  state?: string | null
  tel?: string | null
  mail?: string | null
  [key: string]: unknown
}

const Email = z.email()

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

export function transformCustomerModel(
  raw: JtlCustomerModel,
  opts: { decrypted: boolean },
): Customer {
  if (typeof raw.id !== 'number' || !Number.isInteger(raw.id) || raw.id <= 0) {
    throw new Error(`JTL-Shop customer has no usable id: ${JSON.stringify(raw.id)}`)
  }
  // The list blanks the password hash ("$customer->setPassword('');"); the
  // single-record route does not, so it is never copied into metadata.
  const { password: _password, ...rest } = raw
  const out: Customer = { id: String(raw.id), metadata: rest }

  const mail = text(raw.mail)
  if (mail && Email.safeParse(mail).success) out.email = mail
  const first = text(raw.firstname)
  if (first) out.firstName = first
  const phone = text(raw.tel)
  if (phone) out.phone = phone

  const address: Address = {}
  if (opts.decrypted) {
    const last = text(raw.surname)
    if (last) out.lastName = last
    const line1 = [text(raw.street), text(raw.streetNO)].filter(Boolean).join(' ')
    if (line1) address.line1 = line1
  } else {
    // Ciphertext from GET /customer/{id}; never surface it.
    delete rest['surname']
    delete rest['company']
    delete rest['additional']
    delete rest['street']
  }
  const line2 = text(raw.additionalAddress)
  if (line2) address.line2 = line2
  const city = text(raw.city)
  if (city) address.city = city
  const region = text(raw.state)
  if (region) address.region = region
  const postalCode = text(raw.zip)
  if (postalCode) address.postalCode = postalCode
  if (Object.keys(address).length > 0) {
    out.defaultAddress = address
    out.addresses = [address]
  }
  return out
}
