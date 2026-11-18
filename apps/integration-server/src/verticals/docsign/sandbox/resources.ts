/**
 * What the docsign sandbox serves.
 *
 * Shapes specific to this vertical's manifest:
 *
 *  - **Three of five resources live under an envelope**, and the parent id is a
 *    positional adapter argument rather than a path segment —
 *    `listSigners(credentials, envelopeId, params)`. The live routers read it
 *    from `?envelope_id=` and answer `400 MISSING_PARAM` without it.
 *  - **`voidEnvelope` is an action**, not a CRUD verb: `POST /envelopes/:id/void`
 *    mutates one record's state and returns it.
 *  - Docsign has **no create, update or delete anywhere** — five resources, all
 *    read-only apart from that one action.
 *
 * One resource is spelled four ways: file `audit-trail-entries.ts`, route
 * `/audit_trail_entries`, constant `'audit_trail_entries'`, methods
 * `listAuditTrailEntries`/`getAuditTrailEntry`. `resourceType` takes the
 * constant, because that is the storage key the router uses.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and 115 adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  AuditTrailEntrySchema,
  DocumentSchema,
  EnvelopeSchema,
  SignerSchema,
  TemplateSchema,
} from '../schema'

/** Every child resource hangs off an envelope, at the same argument position. */
const UNDER_ENVELOPE = {
  resourceType: 'envelopes',
  // Counting args after `credentials`: (envelopeId, params) → envelopeId is 0.
  argIndex: 0,
  foreignKey: 'envelopeId',
  queryParam: 'envelope_id',
} as const

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  {
    resourceType: 'envelopes',
    schema: EnvelopeSchema,
    list: 'listEnvelopes',
    get: 'getEnvelope',
    actions: { void: { method: 'voidEnvelope', sets: { status: 'voided' } } },
    seed: 3,
  },
  {
    resourceType: 'templates',
    schema: TemplateSchema,
    list: 'listTemplates',
    get: 'getTemplate',
    seed: 3,
  },
  {
    resourceType: 'signers',
    schema: SignerSchema,
    list: 'listSigners',
    get: 'getSigner',
    parent: UNDER_ENVELOPE,
    seed: 2,
  },
  {
    resourceType: 'documents',
    schema: DocumentSchema,
    list: 'listDocuments',
    get: 'getDocument',
    parent: UNDER_ENVELOPE,
    seed: 2,
  },
  {
    resourceType: 'audit_trail_entries',
    schema: AuditTrailEntrySchema,
    list: 'listAuditTrailEntries',
    get: 'getAuditTrailEntry',
    parent: UNDER_ENVELOPE,
    seed: 2,
  },
]
