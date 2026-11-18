/**
 * Shapes shared by several Moskit v2 models.
 *
 * EntityId.v2.yaml: `{ id: number }` — how every model references another.
 * Phone.v2.yaml: id, number, type. E-mail.v2.yaml: id, address, type.
 * Contact and Company carry `primaryPhone` / `primaryEmail` as an EntityId
 * that names one entry of their `phones` / `emails` arrays.
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/EntityId.v2.yaml
 */
import { Email } from '@opensteward/shared'

export interface MoskitEntityId {
  id?: number
}
export interface MoskitPhone {
  id?: number
  number?: string
  type?: unknown
}
export interface MoskitEmail {
  id?: number
  address?: string
  type?: unknown
}

/** The id an EntityId names, as a string. */
export function refId(ref: MoskitEntityId | null | undefined): string | undefined {
  return ref?.id != null ? String(ref.id) : undefined
}

/** The only id in a list of references; none when the list holds zero or several. */
export function soleRefId(refs: MoskitEntityId[] | null | undefined): string | undefined {
  return refs?.length === 1 ? refId(refs[0]) : undefined
}

/** Every id in a list of references. */
export function refIds(refs: MoskitEntityId[] | null | undefined): string[] | undefined {
  if (!refs) return undefined
  return refs.map(refId).filter((id): id is string => id !== undefined)
}

/** The number of the phone `primaryPhone` names. */
export function primaryPhoneNumber(
  primary: MoskitEntityId | null | undefined,
  phones: MoskitPhone[] | null | undefined,
): string | undefined {
  if (primary?.id == null) return undefined
  return phones?.find((p) => p.id === primary.id)?.number || undefined
}

/** The address of the email `primaryEmail` names, when it is a valid address. */
export function primaryEmailAddress(
  primary: MoskitEntityId | null | undefined,
  emails: MoskitEmail[] | null | undefined,
): string | undefined {
  if (primary?.id == null) return undefined
  const address = emails?.find((e) => e.id === primary.id)?.address
  return address && Email.safeParse(address).success ? address : undefined
}
