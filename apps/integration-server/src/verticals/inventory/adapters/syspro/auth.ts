/**
 * SYSPRO authentication.
 *
 * Auth: HTTP Basic (operator:password encoded as Base64).
 * The OData username format for ISV/runtime:
 *   [operator]#RunTimeProductCode#[productCode]
 *
 * Required credential fields:
 *   - host        — base URL of the SYSPRO OData service, e.g. https://erp.acme.com
 *   - companyId   — SYSPRO company ID, e.g. EDU1
 *   - operator    — SYSPRO operator code
 *   - password    — operator password (SQL credential for OData)
 *
 * Optional:
 *   - productCode — runtime product code for ISV licensing
 *
 * accessToken in Credentials holds Base64(username:password).
 * extra.host and extra.companyId are preserved for the client.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('syspro uses Basic auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'host',        label: 'OData Service URL',  type: 'text',     required: true  },
    { name: 'companyId',   label: 'Company ID',         type: 'text',     required: true  },
    { name: 'operator',    label: 'Operator Code',      type: 'text',     required: true  },
    { name: 'password',    label: 'Operator Password',  type: 'password', required: true  },
    { name: 'productCode', label: 'Runtime Product Code (ISV)', type: 'text', required: false },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const host        = (fields['host'] ?? '').replace(/\/$/, '')
  const companyId   = fields['companyId'] ?? ''
  const operator    = fields['operator'] ?? ''
  const password    = fields['password'] ?? ''
  const productCode = fields['productCode'] ?? ''

  if (!host)      throw new Error('syspro: host is required')
  if (!companyId) throw new Error('syspro: companyId is required')
  if (!operator)  throw new Error('syspro: operator is required')
  if (!password)  throw new Error('syspro: password is required')

  // Build OData username — ISV suffix only when productCode is provided.
  const username = productCode
    ? `${operator}#RunTimeProductCode#${productCode}`
    : operator

  const accessToken = Buffer.from(`${username}:${password}`).toString('base64')

  return {
    accessToken,
    extra: { host, companyId },
  }
}
