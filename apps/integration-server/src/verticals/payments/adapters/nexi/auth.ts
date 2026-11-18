/**
 * Nexi Checkout (Nets Easy) authenticates every API call with a secret API key
 * sent verbatim in the `Authorization` HTTP header — no `Bearer`/`Basic`
 * scheme prefix. Test keys and live keys are distinct values issued from the
 * respective back office; the key alone selects the environment.
 *
 * There is no OAuth flow, so the key is collected through the Connect Link form
 * via the shared `simpleApiKey` credential template.
 *
 * Docs: https://developer.nexigroup.com/nexi-checkout/en-EU/api/
 */
import { simpleApiKey } from '@opensteward/shared'

export const CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'secretApiKey',
  label: 'Secret API key',
  placeholder: 'live-secret-key-…',
  helpText:
    'Secret API key from the Nexi Checkout portal (Company → Integration → API keys). ' +
    'Sent verbatim in the Authorization header; the key value selects test vs live.',
})
