/**
 * Bolt uses static API-key auth (api_key model). The merchant pastes the
 * Bolt Account API Key into the Connect Link form; we carry it as the
 * `accessToken` and send it on every request in the `X-Api-Key` header
 * (Bolt's merchant API does NOT use a Bearer token).
 *
 * The key is created in the Bolt Merchant Dashboard under Developers → API
 * Keys. Sandbox and production each issue their own key, so the key implies
 * the environment — there is no OAuth handshake and no token refresh.
 *
 * Docs: https://help.bolt.com/developers/tools/api-keys/
 */
import { simpleApiKey } from '@opensteward/shared'

export const BOLT_CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'API key',
  placeholder: 'Bolt Account API Key',
  helpText:
    'Find it in the Bolt Merchant Dashboard under Developers → API Keys. Sandbox and production each issue their own key.',
})
