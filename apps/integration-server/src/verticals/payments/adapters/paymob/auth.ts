/**
 * Paymob authenticates with a merchant Secret Key (api_key model). The modern
 * Accept / Intention APIs take the Secret Key directly in the Authorization
 * header as `Token <secret_key>` — there is no OAuth and no token exchange.
 *
 * Secret Keys are environment-scoped: test keys look like `egy_sk_test_…`,
 * live keys `egy_sk_live_…`. We store the key verbatim as `accessToken`; the
 * client attaches it as `Authorization: Token …` on every request.
 *
 * Docs: https://developers.paymob.com/paymob-docs/integration-paths/apis
 */
import { simpleApiKey } from '@opensteward/shared'

export const PaymobCredentialForm = simpleApiKey({
  fieldName: 'secretKey',
  label: 'Secret key',
  helpText:
    'Paymob dashboard → Settings → Account Info → API Keys. Live keys start egy_sk_live_…; test keys start egy_sk_test_….',
})
