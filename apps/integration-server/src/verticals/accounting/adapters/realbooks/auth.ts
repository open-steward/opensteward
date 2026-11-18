/**
 * RealBooks authentication.
 *
 * RealBooks does NOT use OAuth2. Every API call is authenticated by embedding
 * three fields in the POST request body:
 *   - secretKey  — primary API secret
 *   - accessKey  — secondary API key (often the same value as secretKey)
 *   - emailid    — registered admin e-mail for the company account
 *
 * Additionally, the company ID (cid) and segment ID (segid) are required as
 * path parameters on most write endpoints, and as body parameters on report
 * endpoints.
 *
 * We store these in Credentials as:
 *   accessToken  = secretKey
 *   extra.accessKey  = accessKey
 *   extra.emailid    = emailid
 *   extra.cid        = company id
 *   extra.segid      = segment id
 *   extra.accountName = domain / account name (used in request headers)
 *
 * The Connect Link credential form (simpleApiKey) passes a single opaque
 * value; we accept a JSON-encoded object so operators can supply all fields.
 */

import type { Credentials } from '../../adapter/interface'

export function getAuthUrl(_state: string): string {
  // No OAuth redirect for RealBooks — credentials are entered directly
  return '#'
}

/**
 * Accepts the credential payload as either:
 *   a) a JSON string: `{"secretKey":"...","accessKey":"...","emailid":"...",
 *                       "cid":"...","segid":"...","accountName":"..."}`
 *   b) a colon-separated shorthand: `secretKey:accessKey:emailid:cid:segid:accountName`
 *   c) a bare secretKey (all other fields will be empty — minimal use)
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  // Try JSON first
  try {
    const parsed = JSON.parse(code) as Record<string, string>
    return credentialsFromObject(parsed)
  } catch {
    // fall through
  }

  // Colon-separated shorthand
  const parts = code.split(':')
  if (parts.length >= 2) {
    return {
      accessToken: parts[0] ?? '',
      extra: {
        accessKey: parts[1] ?? parts[0] ?? '',
        emailid: parts[2] ?? '',
        cid: parts[3] ?? '',
        segid: parts[4] ?? '',
        accountName: parts[5] ?? '',
      },
    }
  }

  // Bare secretKey
  return {
    accessToken: code,
    extra: {
      accessKey: code,
      emailid: '',
      cid: '',
      segid: '',
      accountName: '',
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is
  return credentials
}

function credentialsFromObject(obj: Record<string, string>): Credentials {
  const secretKey = obj['secretKey'] ?? obj['secret_key'] ?? ''
  return {
    accessToken: secretKey,
    extra: {
      accessKey: obj['accessKey'] ?? obj['access_key'] ?? secretKey,
      emailid: obj['emailid'] ?? obj['email'] ?? '',
      cid: obj['cid'] ?? '',
      segid: obj['segid'] ?? '',
      accountName: obj['accountName'] ?? obj['account_name'] ?? '',
    },
  }
}
