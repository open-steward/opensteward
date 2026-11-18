/**
 * Trustly authentication.
 *
 * Trustly does not use OAuth or a bearer token. Instead every JSON-RPC request
 * is signed with the merchant's RSA *private key*, and Trustly verifies it with
 * the matching public key registered for the processing account. The request
 * `Data` additionally carries the processing-account `Username` + `Password`.
 *
 * In this system that maps to the `api_key` auth model: the merchant submits
 * three fields through the Connect Link form — `username`, `password`, and the
 * PEM-encoded `privateKey` — which we persist on `credentials.extra`. There is
 * no token to exchange or refresh, so `exchangeCredentials` is a pure
 * validation + pack step.
 *
 * Docs: https://docs.trustly.com/api/authentication
 */
import { createSign } from 'node:crypto'
import type { Credentials, CredentialField } from '@opensteward/shared'

export interface TrustlyAuth {
  username: string
  password: string
  privateKey: string
}

/** Connect Link form fields for the Trustly `api_key` flow. */
export function trustlyCredentialFields(): CredentialField[] {
  return [
    {
      name: 'username',
      label: 'Processing account username',
      type: 'text',
      required: true,
      helpText: 'The API username issued for your Trustly processing account.',
    },
    {
      name: 'password',
      label: 'Processing account password',
      type: 'password',
      required: true,
      helpText: 'The API password issued for your Trustly processing account.',
    },
    {
      name: 'privateKey',
      label: 'RSA private key (PEM)',
      type: 'password',
      required: true,
      helpText:
        'The PEM-encoded RSA private key whose public half is registered with Trustly. Used to sign every request.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'test', label: 'Test (test.trustly.com)' },
        { value: 'production', label: 'Production (api.trustly.com)' },
      ],
      helpText: 'Pick the Trustly environment your processing account belongs to.',
    },
  ]
}

/** Validate + pack the submitted form fields into stored credentials. */
export async function buildCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = (fields.username ?? '').trim()
  const password = fields.password ?? ''
  const privateKey = (fields.privateKey ?? '').trim()
  const environment = (fields.environment ?? 'test').trim() === 'production' ? 'production' : 'test'

  if (!username) throw new Error('Trustly processing account username is required.')
  if (!password) throw new Error('Trustly processing account password is required.')
  if (!privateKey.includes('PRIVATE KEY')) {
    throw new Error('Trustly requires a PEM-encoded RSA private key.')
  }

  return {
    // There is no bearer token; keep `accessToken` non-empty so generic
    // credential-presence checks pass, and carry the real material on `extra`.
    accessToken: username,
    extra: { username, password, privateKey, environment },
  }
}

/** Pull the strongly-typed auth material back off stored credentials. */
export function readAuth(credentials: Credentials): TrustlyAuth {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return {
    username: String(extra.username ?? credentials.accessToken ?? ''),
    password: String(extra.password ?? ''),
    privateKey: String(extra.privateKey ?? ''),
  }
}

/** Read the selected environment ('test' | 'production') from credentials. */
export function readEnvironment(credentials: Credentials): 'test' | 'production' {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return extra.environment === 'production' ? 'production' : 'test'
}

/**
 * Deterministically serialise a Trustly `Data` object: keys sorted
 * alphabetically (recursively), values concatenated. This is the exact string
 * Trustly signs/verifies — see the official clients.
 */
export function serializeData(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(serializeData).join('')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.keys(obj)
      .sort()
      .map((k) => k + serializeData(obj[k]))
      .join('')
  }
  return String(value)
}

/**
 * Sign an outgoing request. The plaintext is `method + uuid + serializeData`,
 * signed RSA-SHA1 with the merchant private key, base64-encoded.
 *
 * Docs: https://docs.trustly.com/api/authentication
 */
export function signRequest(
  method: string,
  uuid: string,
  data: Record<string, unknown>,
  privateKey: string,
): string {
  const plaintext = method + uuid + serializeData(data)
  const signer = createSign('RSA-SHA1')
  signer.update(plaintext, 'utf8')
  return signer.sign(privateKey, 'base64')
}
