/**
 * Dooca Commerce authentication helpers.
 *
 * Dooca Commerce does NOT use an OAuth2 authorization-code flow. Credentials
 * are static Bearer tokens generated from the Dooca admin panel under
 * Aplicativos → API. The token is passed in every request as:
 *
 *   Authorization: Bearer {TOKEN}
 *
 * The adapter therefore uses the `simpleApiKey` Connect Link template so
 * operators can paste their token through the normal credential form.
 *
 * Docs: https://docs.dooca.com.br/introducao/api
 */

import { simpleApiKey } from '@opensteward/shared'

export const DOOCA_CREDENTIAL_FORM = simpleApiKey({
  label: 'API Token',
  helpText:
    'Generate a token in your Dooca Commerce admin under Aplicativos → API.',
  placeholder: 'Paste your Dooca API token here',
})
