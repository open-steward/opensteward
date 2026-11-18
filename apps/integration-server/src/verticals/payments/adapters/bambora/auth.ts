/**
 * Bambora NA uses the Passcode auth scheme — not OAuth and not a plain token.
 *
 * The `Authorization` header value is:
 *
 *   Passcode <base64(merchantId + ":" + apiAccessPasscode)>
 *
 * `merchantId` is the 9-digit merchant number; `apiAccessPasscode` is the
 * "API access passcode" generated in the merchant portal under
 * Administration → Account Settings → Order Settings → Payment Gateway →
 * Security/Authentication. We pre-encode the pair here so the HTTP client can
 * attach the header verbatim, and stash the raw pieces on `extra` so they
 * survive a refresh round-trip.
 *
 * Docs: https://dev.na.bambora.com/docs/guides/merchant_quickstart/calling_APIs/
 */
import type { Credentials } from '@opensteward/shared'

export function encodePasscode(merchantId: string, passcode: string): string {
  return Buffer.from(`${merchantId}:${passcode}`).toString('base64')
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const merchantId = (fields.merchantId ?? '').trim()
  const passcode = (fields.passcode ?? '').trim()
  if (!merchantId) throw new Error('Bambora merchantId is required.')
  if (!passcode) throw new Error('Bambora API access passcode is required.')
  return {
    accessToken: encodePasscode(merchantId, passcode),
    extra: { merchantId, passcode },
  }
}
