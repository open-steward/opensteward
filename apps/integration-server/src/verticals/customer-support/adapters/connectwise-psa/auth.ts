/**
 * ConnectWise PSA auth — API-key (Basic) model.
 *
 * Credentials required:
 *   companyId  — ConnectWise company identifier (e.g. "mycompany")
 *   publicKey  — API member public key
 *   privateKey — API member private key
 *   clientId   — OAuth client ID registered at developer.connectwise.com
 *   siteUrl    — optional; defaults to https://api-na.myconnectwise.net
 *
 * Wire format:
 *   Authorization: Basic base64("{companyId}+{publicKey}:{privateKey}")
 *   clientId: {clientId}
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('connectwise-psa uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'companyId',
      label: 'Company ID',
      type: 'text',
      required: true,
      helpText: 'The ConnectWise company identifier used to log in (e.g. "mycompany").',
    },
    {
      name: 'publicKey',
      label: 'API Public Key',
      type: 'text',
      required: true,
      helpText: 'Public key from the ConnectWise API member (Setup > Members > API Keys).',
    },
    {
      name: 'privateKey',
      label: 'API Private Key',
      type: 'password',
      required: true,
      helpText: 'Private key paired with the public key above.',
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'OAuth client ID registered at developer.connectwise.com for your integration.',
    },
    {
      name: 'siteUrl',
      label: 'Site URL',
      type: 'text',
      required: false,
      helpText:
        'Base URL for your ConnectWise instance. Cloud default: https://api-na.myconnectwise.net. ' +
        'EU cloud: https://api-eu.myconnectwise.net. On-premise: https://your-server.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const companyId = fields['companyId']
  const publicKey = fields['publicKey']
  const privateKey = fields['privateKey']
  const clientId = fields['clientId']

  if (!companyId) throw new Error('connectwise-psa credentialFields require companyId')
  if (!publicKey) throw new Error('connectwise-psa credentialFields require publicKey')
  if (!privateKey) throw new Error('connectwise-psa credentialFields require privateKey')
  if (!clientId) throw new Error('connectwise-psa credentialFields require clientId')

  // accessToken carries the base64-encoded Basic auth value
  const raw = `${companyId}+${publicKey}:${privateKey}`
  const accessToken = Buffer.from(raw, 'utf8').toString('base64')

  return {
    accessToken,
    extra: {
      clientId,
      siteUrl: fields['siteUrl'] ?? '',
    },
  }
}
