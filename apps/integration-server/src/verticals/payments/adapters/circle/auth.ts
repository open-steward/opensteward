/**
 * Circle Mint authenticates every request with a server-side API key passed as
 * an HTTP Bearer token (`Authorization: Bearer <API_KEY>`). There is no OAuth
 * flow — the key is generated in the Circle Mint console and submitted through
 * the Connect Link form via the shared `simpleApiKey` credential template.
 *
 * Sandbox keys are prefixed `TEST_API_KEY:` and production keys
 * `LIVE_API_KEY:`; both are used verbatim as the Bearer value.
 *
 * Docs: https://developers.circle.com/circle-mint/getting-started-with-the-circle-apis
 */
import { simpleApiKey } from '@opensteward/shared'

export const CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'API key',
  placeholder: 'TEST_API_KEY:…',
  helpText:
    'Server-side API key from the Circle Mint console. Sandbox keys start TEST_API_KEY:, production keys LIVE_API_KEY:. Sent as an Authorization: Bearer header.',
})
