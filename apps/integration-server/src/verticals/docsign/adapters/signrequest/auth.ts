/**
 * SignRequest authentication.
 *
 * SignRequest does not implement OAuth. Each account (or team) issues a
 * static API token from the dashboard ("API token" under Team settings),
 * supplied to the customer once and sent verbatim on every request as:
 *
 *   Authorization: Token <token>
 *
 * The token never expires and there is no refresh flow, so the adapter
 * opts into the Connect Link credential-form path: a single API-key field
 * whose value is stored as `credentials.accessToken`. The OAuth methods on
 * `BaseAdapter` are therefore unsupported and throw.
 *
 * Docs: https://signrequest.com/api/v1/docs/ (Authentication)
 */

import { simpleApiKey } from '@opensteward/shared'

/** Single API-token credential form for Connect Link. */
export const SIGNREQUEST_API_KEY_FORM = simpleApiKey({
  label: 'API token',
  placeholder: 'your-signrequest-api-token',
  helpText:
    'Create one in the SignRequest dashboard under Team → API → "Create new token". Sent as "Authorization: Token <token>".',
})
