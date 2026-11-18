/**
 * Octopus authentication helpers.
 *
 * Octopus uses a dossier-scoped bearer token.  For the api_key adapter auth
 * model the customer supplies their dossier token directly (obtained via the
 * Octopus UI or the /connect-dossier REST endpoint).  That token is stored
 * as credentials.accessToken and sent as "Authorization: Bearer <token>" on
 * every request.
 *
 * The simpleApiKey helper wires the Connect Link form so users can paste the
 * dossier token into a single password field.
 */
import { simpleApiKey } from '@opensteward/shared'

export const OCTOPUS_API_KEY_FORM = simpleApiKey({
  fieldName: 'dossierToken',
  label: 'Dossier token',
  placeholder: 'Paste your Octopus dossier token here',
  helpText:
    'Obtain this from Octopus → Settings → API or via the connectDossier REST endpoint. The token is scoped to a single dossier.',
})
