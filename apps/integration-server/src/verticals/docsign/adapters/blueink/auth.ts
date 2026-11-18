/**
 * Blueink auth helpers — Private API key only.
 *
 * Blueink authenticates backend requests with a static Private API key sent
 * as `Authorization: Token <key>`. There is no OAuth Authorization-Code flow
 * for server-to-server use, so `getAuthUrl`/`exchangeCode` are unsupported
 * and the Connect Link form collects the key via the shared `simpleApiKey`
 * template. The key is stored as `credentials.accessToken`.
 *
 * Docs: https://developer.blueink.com/docs/esignature-api/authentication/
 */
import { simpleApiKey } from '@opensteward/shared'

export const FORM = simpleApiKey({
  label: 'Blueink Private API key',
  placeholder: 'Your Blueink Private API key',
  helpText:
    'In the Blueink Dashboard, open API → API Keys and generate a Private API key. The adapter sends it as the "Authorization: Token <key>" request header.',
})
