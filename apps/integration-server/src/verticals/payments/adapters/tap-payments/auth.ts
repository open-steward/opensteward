/**
 * Tap Payments uses static secret-key auth (api_key model). The merchant
 * pastes a secret key into the Connect Link form; we carry it as the
 * `accessToken` and send it as a Bearer token on every request.
 *
 * Test keys start `sk_test_…`; live keys start `sk_live_…`. Mode is implied
 * by the key prefix, so there is no OAuth handshake and no token refresh.
 *
 * Docs: https://developers.tap.company/docs/authentication
 */
import { simpleApiKey } from '@opensteward/shared'

export const TAP_CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'secretKey',
  label: 'Secret API key',
  placeholder: 'sk_live_…',
  helpText:
    'Find it under Tap Dashboard → Developers → API Credentials. Live keys start sk_live_…; test keys start sk_test_….',
})
