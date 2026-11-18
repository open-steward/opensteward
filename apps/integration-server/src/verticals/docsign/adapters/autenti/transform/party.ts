/**
 * Autenti party shapes, from the Document Process API v2 OpenAPI
 * (https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/111e9353643f4):
 * `DocumentProcessParty` ({ party, role, participationStatus, constraints,
 * currentUser, events }), `Party` (Person | Organization | PartyGroup, each
 * with `id` and `name`) and `Contact` ({ type, attributes }). The e-mail sits
 * in a contact of type 'CONTACT-TYPE:EMAIL' as `attributes.email`, as every
 * documented example shows:
 * `{"type": "CONTACT-TYPE:EMAIL", "attributes": {"email": "john.doe@example.com"}}`.
 */
export interface RawAutentiContact {
  type?: string
  attributes?: Record<string, unknown>
}

export interface RawAutentiParty {
  id?: string | null
  type?: string
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  contacts?: RawAutentiContact[] | null
  [key: string]: unknown
}

export interface RawAutentiConstraint {
  constrainedActions?: string[]
  classifiers?: string[]
  attributes?: Record<string, unknown>
}

export interface RawAutentiProcessParty {
  party: RawAutentiParty
  role?: string
  participationStatus?: string
  constraints?: RawAutentiConstraint[]
  currentUser?: boolean
  [key: string]: unknown
}

export const SENDER_ROLE = 'SENDER'
const EMAIL_CONTACT = 'CONTACT-TYPE:EMAIL'
const PRIORITY_CLASSIFIER = 'CONSTRAINT-UNIQUE_TYPE:PARTICIPATION_PRIORITY'

/** The e-mail of the party's 'CONTACT-TYPE:EMAIL' contact, when it has one. */
export function partyEmail(party: RawAutentiParty | null | undefined): string | undefined {
  const contact = (party?.contacts ?? []).find((c) => c.type === EMAIL_CONTACT)
  const email = contact?.attributes?.['email']
  return typeof email === 'string' && email.length > 0 ? email : undefined
}

/**
 * The participation priority: a constraint classified
 * 'CONSTRAINT-UNIQUE_TYPE:PARTICIPATION_PRIORITY' with `attributes.priority`
 * ("Creation of a document with an agreed signing order", node vayd4ugingeof:
 * `"classifiers": ["CONSTRAINT-UNIQUE_TYPE:PARTICIPATION_PRIORITY"], "attributes": {"priority": 1}`).
 */
export function participationPriority(p: RawAutentiProcessParty): number | undefined {
  for (const c of p.constraints ?? []) {
    if (!(c.classifiers ?? []).includes(PRIORITY_CLASSIFIER)) continue
    const priority = c.attributes?.['priority']
    if (typeof priority === 'number' && Number.isInteger(priority) && priority >= 1) return priority
  }
  return undefined
}
