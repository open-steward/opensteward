/**
 * Amazon Payment Services (APS / PayFort) does not use OAuth or a bearer
 * token. Each request is authenticated by an `access_code` +
 * `merchant_identifier` pair plus a per-request SHA `signature` computed from
 * the request body and the merchant's SHA request phrase. Responses (and
 * feedback notifications) are verified with a separate SHA response phrase.
 *
 * None of these are sent as HTTP headers — they ride in the JSON body — so
 * we stash them on `Credentials`. The response phrase is kept as the primary
 * `accessToken` because the webhook layer receives it as the `secret`.
 *
 * Docs: https://paymentservices.amazon.com/docs/api
 */
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_LANGUAGE,
  DEFAULT_SHA_TYPE,
  HOSTS,
  type ApsEnvironment,
} from './constants'

function pickEnvironment(value: string | undefined): ApsEnvironment {
  return value && value in HOSTS ? (value as ApsEnvironment) : DEFAULT_ENVIRONMENT
}

function pickShaType(value: string | undefined): 'sha256' | 'sha512' {
  return value === 'sha512' ? 'sha512' : DEFAULT_SHA_TYPE
}

export interface ApsExtra {
  accessCode: string
  merchantIdentifier: string
  requestPhrase: string
  environment: ApsEnvironment
  language: string
  shaType: 'sha256' | 'sha512'
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const accessCode = (fields.accessCode ?? '').trim()
  const merchantIdentifier = (fields.merchantIdentifier ?? '').trim()
  const requestPhrase = fields.requestPhrase ?? ''
  const responsePhrase = fields.responsePhrase ?? ''
  if (!accessCode) throw new Error('Access code is required.')
  if (!merchantIdentifier) throw new Error('Merchant identifier is required.')
  if (!requestPhrase) throw new Error('SHA request phrase is required.')
  if (!responsePhrase) throw new Error('SHA response phrase is required.')

  const extra: ApsExtra = {
    accessCode,
    merchantIdentifier,
    requestPhrase,
    environment: pickEnvironment(fields.environment),
    language: (fields.language ?? '').trim() || DEFAULT_LANGUAGE,
    shaType: pickShaType(fields.shaType),
  }
  return {
    // The response phrase doubles as the feedback-signature key handed to the
    // webhook layer as `secret`.
    accessToken: responsePhrase,
    extra: extra as unknown as Record<string, unknown>,
  }
}

/** Read the typed APS config off a Credentials object. */
export function readExtra(credentials: Credentials): ApsExtra {
  const extra = (credentials.extra as Partial<ApsExtra> | undefined) ?? {}
  return {
    accessCode: String(extra.accessCode ?? ''),
    merchantIdentifier: String(extra.merchantIdentifier ?? ''),
    requestPhrase: String(extra.requestPhrase ?? ''),
    environment: pickEnvironment(extra.environment),
    language: String(extra.language ?? DEFAULT_LANGUAGE),
    shaType: pickShaType(extra.shaType),
  }
}
