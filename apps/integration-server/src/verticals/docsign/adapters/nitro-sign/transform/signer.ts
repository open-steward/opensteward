/**
 * Nitro Sign `Participant` → canonical Signer.
 *
 * `Participant` (https://api.gonitro.dev/openapi.json) declares exactly
 * `ID` ("The unique identifier of the participant"), `email` ("The email
 * address of the participant"), `role` ("The role of the participant") and
 * `authentication` (oneOf `AccessCode` {accessCode, type: "AccessCode"} |
 * `SMS` {countryCode, phoneNumber, type: "SMS"}). Roles are documented as
 * `signer` / `cc` (ParticipantCreate enum; the tutorial sends `"signer"`,
 * the spec's examples send `"SIGNER"`), so they are matched case-blind.
 *
 * A participant documents no name and no status, so `name` is '' (the
 * canonical field is a required string and nothing is derived for it) and
 * `status` is `unknown`. No routing order or timestamps are invented.
 *
 * The access code and phone number are secrets / PII the canonical schema has
 * no use for; `raw` keeps only the authentication `type`.
 */
import type { Signer, SignerRole } from '../../../schema/signer'
import { pickStr, strMap } from './shared'

export interface RawNitroSignParticipant {
  ID?: string
  email?: string
  role?: string
  authentication?: {
    type?: string
    accessCode?: string
    countryCode?: string
    phoneNumber?: string
  }
}

function mapRole(role: string | undefined): SignerRole {
  const r = (role ?? '').toLowerCase()
  if (r === 'signer') return 'signer'
  if (r === 'cc') return 'cc'
  return 'unknown'
}

export function transformSigner(raw: RawNitroSignParticipant, envelopeId: string): Signer {
  const externalId = pickStr(raw.ID)
  if (!externalId) throw new Error(`Nitro Sign participant on envelope ${envelopeId} has no ID`)
  const email = pickStr(raw.email)
  const authenticationType = pickStr(raw.authentication?.type)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    ...(email !== undefined ? { email } : {}),
    name: '',
    role: mapRole(raw.role),
    status: 'unknown',
    platform: 'nitro-sign',
    metadata: strMap({ role: raw.role, authenticationType }),
    raw: {
      ID: raw.ID,
      email: raw.email,
      role: raw.role,
      ...(authenticationType !== undefined ? { authentication: { type: authenticationType } } : {}),
    },
  }
}
