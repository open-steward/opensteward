/**
 * Xendit authenticates every request with a secret API key over HTTP Basic
 * auth — the key is the username and the password is empty. There is no OAuth
 * and no token refresh.
 *
 * Live keys start `xnd_production_…`; test keys start `xnd_development_…`. We
 * collect the key with the shared `simpleApiKey` Connect-Link template, which
 * stores it on `credentials.accessToken`. The client (`client.ts`) base64s it
 * into the `Authorization: Basic …` header.
 *
 * Docs: https://docs.xendit.co/docs/api-keys
 */
import { simpleApiKey } from '@opensteward/shared'

export const XenditCredentialForm = simpleApiKey({
  fieldName: 'secretKey',
  label: 'Secret API key',
  placeholder: 'xnd_production_…',
  helpText: 'Settings → API Keys in the Xendit dashboard. Live keys start xnd_production_…; test keys start xnd_development_….',
})
