/**
 * emSigner authentication.
 *
 * The vendor's Swagger (https://api.emsigner.com/swagger/docs/v1, `info.description`):
 * "For every request you have to pass an Auth token in header as basic
 * authentication which is generated using either validatelogin API or
 * AuthorizeApp API. If you are using AuthorizeApp API to generate the
 * Authtoken an additional UserName header is required where UserName is the
 * emailid of the user consuming the api. For validatelogin you need to pass
 * AppName and SecretKey in request header and in request body for
 * AuthorizeApp." AppName and SecretKey come from "Settings → API Settings →
 * Manage Apps" in the emSigner web app (same description).
 *
 * So a connection holds the AppName, the SecretKey and the user's email.
 * The SecretKey is the secret and rides in `accessToken`; the client trades
 * it for an AuthToken with POST /api/AuthorizeApp before it reads anything.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('emsigner uses AppName + SecretKey auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'appName',
      label: 'App Name',
      type: 'text',
      required: true,
      helpText:
        'emSigner → Settings → API Settings → Manage Apps: the name of the app you created.',
    },
    {
      name: 'secretKey',
      label: 'Secret Key',
      type: 'password',
      required: true,
      helpText: 'The Secret Key of that app (Settings → API Settings → Manage Apps).',
    },
    {
      name: 'userName',
      label: 'User email',
      type: 'text',
      required: true,
      helpText: 'Email address of the emSigner user the API acts as (sent as the UserName header).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appName = fields['appName']
  const secretKey = fields['secretKey']
  const userName = fields['userName']
  if (!appName || !secretKey || !userName) {
    throw new Error('emsigner credentialFields require appName + secretKey + userName')
  }
  return { accessToken: secretKey, extra: { appName, userName } }
}
