/**
 * Teamwork CRM API v2 entity models, built from the documented response
 * schemas in the vendor's archived API reference
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/…).
 * Every property name, type and enum value below appears in those schemas;
 * the values themselves are illustrative. Empty properties are `null`, `[]`
 * or `{}` as "Resource objects / entity models" says they always are.
 */

const audit = {
  createdAt: '2020-03-02T09:15:00Z',
  createdBy: { id: 7, type: 'users' },
  updatedAt: '2020-06-10T16:40:00Z',
  updatedBy: { id: 7, type: 'users' },
  deletedAt: null,
  deletedBy: null,
  updatedSourceId: 1,
}

export const CONTACT = {
  id: 101,
  firstName: 'Aoife',
  lastName: "O'Brien",
  title: 'Head of Finance',
  emailAddresses: [
    { address: 'aoife.personal@example.ie', isMain: false },
    { address: 'aoife@acme.example', isMain: true },
  ],
  phoneNumbers: [{ number: '21 432 1000', isMain: true, code: { id: 353, type: 'phone-codes' } }],
  addressLine1: '1 Albert Quay',
  addressLine2: 'Floor 3',
  city: 'Cork',
  stateOrCounty: 'Co. Cork',
  zipcode: 'T12 X8N6',
  country: { id: 105, type: 'countries' },
  company: { id: 55, type: 'companies' },
  owner: { id: 7, type: 'users' },
  avatar: null,
  timezone: null,
  duplicatedFrom: null,
  custom: {},
  ...audit,
}

export const COMPANY = {
  id: 55,
  name: 'Acme Industries',
  website: 'https://www.acme.example/about',
  emailAddresses: [{ address: 'info@acme.example', isMain: true }],
  phoneNumbers: [
    { number: '1 555 0100', isMain: false, code: { id: 1, type: 'phone-codes' } },
    { number: '21 432 1001', isMain: true, code: { id: 353, type: 'phone-codes' } },
  ],
  addressLine1: '1 Albert Quay',
  addressLine2: null,
  city: 'Cork',
  stateOrCounty: null,
  zipcode: 'T12 X8N6',
  country: { id: 105, type: 'countries' },
  contacts: [{ id: 101, type: 'contacts' }],
  contactsCount: 1,
  owner: { id: 7, type: 'users' },
  avatar: null,
  timezone: null,
  hubId: 3,
  duplicatedFrom: null,
  custom: [],
  ...audit,
}

export const DEAL = {
  id: 9001,
  title: 'Acme Q1 Expansion',
  state: 'open',
  stage: { id: 72, type: 'stages' },
  company: { id: 55, type: 'companies' },
  owner: { id: 7, type: 'users' },
  contacts: [
    { id: 101, type: 'contacts', meta: { isMain: true } },
    { id: 102, type: 'contacts', meta: { isMain: false } },
  ],
  contactsCount: 2,
  currency: { id: 2, type: 'currencies' },
  customValue: 120000,
  totalValue: 150000,
  products: [{ id: 4, type: 'products', meta: { price: 30000, quantity: 1, discount: 0 } }],
  expectedCloseDate: '2020-09-30T00:00:00Z',
  closedAt: null,
  qualifiedAt: '2020-03-05T10:00:00Z',
  qualifiedBy: { id: 7, type: 'users' },
  isQualified: true,
  rottingSince: null,
  lostReason: null,
  wonReason: null,
  nextIncompleteActivity: null,
  foreignItemLinks: {},
  teamworkProjects: {},
  duplicatedFrom: null,
  custom: {},
  ...audit,
}

export const ACTIVITY = {
  id: 3001,
  title: 'Discovery call',
  description: 'Walk through the Q1 expansion scope',
  activityType: { id: 1, type: 'activity-types' },
  deal: { id: 9001, type: 'deals' },
  contacts: [{ id: 101, type: 'contacts' }],
  contactsCount: 1,
  assignees: [{ id: 7, type: 'users' }],
  assigneesCount: 1,
  isAllDay: false,
  isComplete: true,
  completedAt: '2020-06-10T16:40:00Z',
  completedByUser: { id: 7, type: 'users' },
  startDate: '2020-06-10T15:00:00Z',
  dueDate: '2020-06-10T15:30:00Z',
  duration: 30,
  custom: {},
  ...audit,
}

export const NOTE = {
  id: 4001,
  description: 'Asked for a revised quote',
  isPinned: false,
  subject: { id: 9001, type: 'deals' },
  ...audit,
}

export const PIPELINE = {
  id: 12,
  name: 'Sales',
  isQualified: true,
  orderIndex: 1,
  totalValue: 150000,
  stages: [
    { id: 73, type: 'stages' },
    { id: 72, type: 'stages' },
  ],
  stagesCount: 2,
  ...audit,
}

/** Stage models side-loaded by `include=stages`, in `included.stages`. */
export const STAGES = [
  {
    id: 72,
    name: 'Qualified',
    orderIndex: 4,
    probability: 20,
    rottingDuration: 14,
    pipeline: { id: 12, type: 'pipelines' },
    deals: [],
    dealsCount: 0,
    ...audit,
  },
  {
    id: 73,
    name: 'Proposal sent',
    orderIndex: 5,
    probability: 60,
    rottingDuration: 14,
    pipeline: { id: 12, type: 'pipelines' },
    deals: [],
    dealsCount: 0,
    ...audit,
  },
]
