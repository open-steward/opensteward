/**
 * Folk's documented example records, taken from the published OpenAPI spec
 * (https://developer.folk.app/schemas/2025-06-09.json,
 * `components.schemas.<Name>.example`, fetched 2026-09-25). documentedNote is
 * the spec example unchanged. documentedPerson and documentedCompany are
 * trimmed: documentedPerson drops `strongestConnection`, and both keep only
 * part of `customFieldValues`. No transform reads a trimmed field, and every
 * field a transform reads keeps its example value. The list and get
 * pages (api-reference/people/list-people.md, companies/list-companies.md,
 * notes/list-notes.md and the matching get-a-* pages) render the same
 * schemas.
 */
import type { RawFolkContact } from '../../../../../../../src/verticals/crm/adapters/folk/transform/contact'
import type { RawFolkCompany } from '../../../../../../../src/verticals/crm/adapters/folk/transform/company'
import type { RawFolkNote } from '../../../../../../../src/verticals/crm/adapters/folk/transform/note'

export function documentedPerson(): RawFolkContact {
  return {
    id: 'per_183ed5cc-3182-45de-84d1-d520f2604810',
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    description: 'John Doe is a software engineer at Tech Corp.',
    birthday: '1980-06-15',
    gender: 'Female',
    jobTitle: 'Software Engineer',
    createdAt: '2021-01-01T00:00:00.000Z',
    createdBy: {
      id: 'usr_bc984b3f-0386-434d-82d7-a91eb6badd71',
      fullName: 'John Doe',
      email: 'john.doe@example.com',
    },
    groups: [{ id: 'grp_5fa60242-0756-4e31-8cca-30c2c5ff1ac2', name: 'Engineering' }],
    companies: [{ id: 'com_92346499-30bf-4278-ae8e-4aa3ae2ace2c', name: 'Tech Corp' }],
    addresses: ['123 Main St, Springfield, USA', '456 Main St, Springfield, USA'],
    emails: ['john@example.com', 'john@techcorp.com'],
    phones: ['+1234567890', '+0987654321'],
    urls: ['https://example.com'],
    customFieldValues: {
      'grp_5fa60242-0756-4e31-8cca-30c2c5ff1ac2': {
        Status: 'Active',
        'Programming languages': ['Javascript', 'Python'],
        'Join date': '2021-01-01',
      },
    },
    interactionMetadata: {
      user: { approximateCount: 21, lastInteractedAt: '2025-05-01T00:00:00Z' },
      workspace: {
        approximateCount: 21,
        lastInteractedAt: '2025-05-01T00:00:00Z',
        lastInteractedBy: [
          {
            id: 'usr_bc984b3f-0386-434d-82d7-a91eb6badd71',
            fullName: 'John Doe',
            email: 'john.doe@example.com',
          },
        ],
      },
    },
  }
}

export function documentedCompany(): RawFolkCompany {
  return {
    id: 'com_183ed5cc-3182-45de-84d1-d520f2604810',
    name: 'Tech Corp',
    description: 'A leading technology company.',
    fundingRaised: '5000000',
    lastFundingDate: '1990-01-01',
    industry: 'Technology',
    foundationYear: '1990',
    employeeRange: '51-200',
    groups: [{ id: 'grp_5fa60242-0756-4e31-8cca-30c2c5ff1ac2', name: 'Engineering' }],
    addresses: ['123 Main St, Springfield, USA', '456 Main St, Springfield, USA'],
    emails: ['john@example.com', 'john@techcorp.com'],
    phones: ['+1234567890', '+0987654321'],
    urls: ['https://example.com'],
    createdAt: '2021-01-01T00:00:00.000Z',
    createdBy: {
      id: 'usr_bc984b3f-0386-434d-82d7-a91eb6badd71',
      fullName: 'John Doe',
      email: 'john.doe@example.com',
    },
    customFieldValues: {
      'grp_5fa60242-0756-4e31-8cca-30c2c5ff1ac2': { Status: 'Active', 'Join date': '2021-01-01' },
    },
  }
}

export function documentedNote(): RawFolkNote {
  return {
    id: 'nte_91118b73-5a75-480b-b8e3-a33671c35cdc',
    entity: {
      id: 'per_55175e81-9a52-4ac3-930e-82792c23499b',
      entityType: 'person',
      fullName: 'John Doe',
    },
    visibility: 'public',
    content: 'This is a note about John Doe',
    author: {
      type: 'user',
      id: 'usr_14c18444-a0c7-459a-86b0-ccd70ebcd65c',
      fullName: 'John Doe',
      email: 'john.doe@example.com',
      deleted: false,
    },
    createdAt: '2021-01-01T00:00:00.000Z',
    parentNote: {
      id: 'nte_14c18444-a0c7-459a-86b0-ccd70ebcd65c',
      entity: {
        id: 'per_55175e81-9a52-4ac3-930e-82792c23499b',
        entityType: 'person',
        fullName: 'John Doe',
      },
      content: 'This is a parent note about John Doe',
      visibility: 'public',
      author: {
        type: 'user',
        id: 'usr_14c18444-a0c7-459a-86b0-ccd70ebcd65c',
        fullName: 'John Doe',
        email: 'john.doe@example.com',
        deleted: false,
      },
      createdAt: '2021-01-01T00:00:00.000Z',
      deleted: false,
    },
  }
}
