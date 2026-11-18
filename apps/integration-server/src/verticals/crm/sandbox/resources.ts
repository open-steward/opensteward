/**
 * What the CRM sandbox serves.
 *
 * Six resources, every list a plain `list*(credentials, params)`, every
 * getter a plain `get*(credentials, id)`. The only asymmetry is that
 * pipelines are read-only because pipeline configuration is admin-managed on
 * every platform.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and its adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  ActivitySchema,
  CompanySchema,
  ContactSchema,
  DealSchema,
  NoteSchema,
  PipelineSchema,
} from '../schema'

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  {
    resourceType: 'contacts',
    schema: ContactSchema,
    list: 'listContacts',
    get: 'getContact',
    create: 'createContact',
    update: 'updateContact',
    delete: 'deleteContact',
    seed: 3,
  },
  {
    resourceType: 'companies',
    schema: CompanySchema,
    list: 'listCompanies',
    get: 'getCompany',
    create: 'createCompany',
    update: 'updateCompany',
    delete: 'deleteCompany',
    seed: 3,
  },
  {
    resourceType: 'deals',
    schema: DealSchema,
    list: 'listDeals',
    get: 'getDeal',
    create: 'createDeal',
    update: 'updateDeal',
    delete: 'deleteDeal',
    seed: 3,
  },
  {
    // Read-only on the interface too: pipeline config is admin-managed, so
    // there is no createPipeline to declare. Note the failure mode differs
    // from an unimplemented method — `router/pipelines.ts` registers only the
    // two GETs, so `POST /pipelines` is 404 (no route) rather than 501 (route
    // exists, adapter lacks the method). The sandbox matches the live surface
    // here because it is the same router; there is nothing to declare.
    resourceType: 'pipelines',
    schema: PipelineSchema,
    list: 'listPipelines',
    get: 'getPipeline',
    seed: 2,
  },
  {
    resourceType: 'activities',
    schema: ActivitySchema,
    list: 'listActivities',
    get: 'getActivity',
    create: 'createActivity',
    update: 'updateActivity',
    delete: 'deleteActivity',
    seed: 3,
  },
  {
    resourceType: 'notes',
    schema: NoteSchema,
    list: 'listNotes',
    get: 'getNote',
    create: 'createNote',
    update: 'updateNote',
    delete: 'deleteNote',
    seed: 3,
  },
]
