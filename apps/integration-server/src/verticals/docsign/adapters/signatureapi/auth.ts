/**
 * SignatureAPI auth helpers — static API key only.
 *
 * SignatureAPI authenticates every request with an account API key sent on
 * the `X-API-Key` header. The key prefix selects the mode (`key_test_…`
 * sandbox, `key_live_…` production). There is no OAuth Authorization-Code
 * flow, so `getAuthUrl`/`exchangeCode` are unsupported; the Connect Link
 * form collects the key via the shared `simpleApiKey` template and it is
 * stored as `credentials.accessToken`.
 *
 * Docs: https://signatureapi.com/docs/api/authentication
 */
import { simpleApiKey } from '@opensteward/shared'

export const FORM = simpleApiKey({
  label: 'SignatureAPI key',
  placeholder: 'key_live_xxxxxxxxxxxxxxxx',
  helpText:
    'In the SignatureAPI Dashboard, open Settings → API Keys and create a key. Use a key_test_ key for sandbox or key_live_ for production. The adapter sends it on the "X-API-Key" request header.',
})
