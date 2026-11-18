/**
 * Hyperswitch authenticates server-side requests with a secret API key passed
 * in the `api-key` HTTP header (e.g. `snd_…` on sandbox). There is no OAuth
 * flow — the key is submitted through the Connect Link form via the shared
 * `simpleApiKey` credential template.
 *
 * Docs: https://api-reference.hyperswitch.io/introduction
 */
import { simpleApiKey } from '@opensteward/shared'

export const CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'API key',
  placeholder: 'snd_…',
  helpText:
    'Server-side secret key from the Hyperswitch dashboard (sandbox keys start snd_). Sent as the api-key header.',
})
