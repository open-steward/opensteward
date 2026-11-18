/**
 * Tray Customer → canonical.
 *
 * Verified with curl against developers.tray.com.br (see `client.ts`
 * header):
 *
 *   - LIST (`#listagem-de-clientes-get`): `GET /customers?access_token=`,
 *     filters `email, attrs, limit, page, sort`. Response:
 *     `{paging:{...}, sort, availableFilters, appliedFilters,
 *     Customers:[{Customer:{id, name, cpf, birth_date, gender, email,
 *     cnpj, last_visit, city, state, newsletter, created,
 *     registration_date, modified, CustomerAddress:[{id},...]}}]}` —
 *     `CustomerAddress` in the LIST/GET response is only ever a list of
 *     bare `{id}` objects, never the full address, so it is not mapped to
 *     `Customer.addresses`.
 *   - GET (`#consultar-dados-do-cliente-get`): `GET /customers/:id
 *     ?access_token=` → `{"Customer": {...same fields, plus phone,
 *     cellphone, rg, token, total_orders, observation, type, cnpj,
 *     company_name, state_inscription, reseller, discount, blocked,
 *     credit_limit, indicator_id, profile_customer_id,
 *     last_sending_newsletter, last_purchase, last_modification, address,
 *     zip_code, number, complement, neighborhood, ...}}`.
 *   - CREATE (`#cadastrar-cliente-post`): `POST /customers?access_token=`,
 *     bracket-form body: name, rg, cpf, phone, cellphone, birth_date,
 *     gender, email, nickname, observation, type, company_name, cnpj,
 *     state_inscription, reseller, discount, blocked, credit_limit,
 *     indicator_id, profile_customer_id, address, zip_code, number,
 *     complement, neighborhood, city, state, newsletter, plus nested
 *     `CustomerAddress[i]{recipient, address, number, complement,
 *     neighborhood, city, state, zip_code, country, type, active,
 *     description}` — response `{"message":"Created","id":...,"code":201}`.
 *   - UPDATE (`#atualizar-dados-do-cliente-put`): `PUT /customers/:id
 *     ?access_token=`, same body shape, response `{"message":"Saved",...}`.
 *   - DELETE (`#excluir-cliente-delete`): `DELETE /customers/:id
 *     ?access_token=` → `{"message":"Deleted",...}`.
 */
import type { Customer } from '../../../schema/customer'

export interface RawTrayCustomer {
  id: number | string
  name?: string
  email?: string
  phone?: string
  cellphone?: string
  created?: string
  modified?: string
  [key: string]: unknown
}

function splitName(name: string | undefined): { firstName?: string; lastName?: string } {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return {}
  const idx = trimmed.indexOf(' ')
  if (idx === -1) return { firstName: trimmed }
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) }
}

export function transformCustomer(raw: RawTrayCustomer): Customer {
  const { firstName, lastName } = splitName(raw.name)
  return {
    id: String(raw.id),
    email: raw.email || undefined,
    firstName,
    lastName,
    phone: raw.phone ?? raw.cellphone ?? undefined,
    // `created`/`modified` are documented but space-separated with no
    // timezone, which canonical `IsoDatetime` rejects and Tray's docs never
    // resolve — left unmapped rather than guessing an offset (see
    // transform/product.ts header for why). Raw strings survive in `metadata`.
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Tray customer body (bracket-form POST/PUT `/customers`, wrapped as `Customer` by the caller). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
  const body: Record<string, unknown> = {
    email: customer.email,
  }
  if (name) body.name = name
  if (customer.phone) body.phone = customer.phone
  return body
}
