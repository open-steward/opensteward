/**
 * Fixture: the documented GET /v2/ProjectVersions example "Single workspace" in
 * https://apihub.document360.io/swagger/v2/swagger.json, its one `data[]` entry
 * (ProjectVersionCustomer) copied verbatim, including `"version_type": 0`. The
 * schema declares version_type as the string enum "knowledgeBase" |
 * "apiDocumentation"; a separate case covers that form.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawDocument360ProjectVersion,
} from '../../../../../../../src/verticals/customer-support/adapters/document360/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('document360 transformTeam', () => {
  const raw: RawDocument360ProjectVersion = {
    id: '46f48bc7-760f-4b07-b2d2-fce4aa8ba234',
    version_number: 1,
    base_version_number: 0,
    version_code_name: 'v1',
    is_main_version: true,
    is_beta: false,
    is_public: true,
    is_deprecated: false,
    created_at: '2024-06-13T14:30:00',
    modified_at: '2024-06-13T14:30:00',
    language_versions: [
      {
        id: 'lang-en-id',
        name: null,
        code: 'en',
        set_as_default: true,
        hidden: false,
        enable_rtl: false,
        site_protection_level: 0,
        is_inheritance_disabled: false,
        is_kb_inheritance_disabled: false,
        has_inheritance_disabled_categories_or_articles: false,
        has_kb_inheritance_disabled_categories_or_articles: false,
        country_flag_code: null,
        display_name: null,
        is_home_page_enabled: false,
        version_display_name: null,
      },
    ],
    slug: 'v1',
    order: 0,
    version_type: 0,
  }

  it('parses as a canonical Team', () => {
    const t = TeamSchema.parse(transformTeam(raw))
    expect(t).toMatchObject({
      id: '46f48bc7-760f-4b07-b2d2-fce4aa8ba234',
      externalId: '46f48bc7-760f-4b07-b2d2-fce4aa8ba234',
      name: 'v1',
      platform: 'document360',
    })
    expect(t.metadata).toMatchObject({
      isMainVersion: 'true',
      isBeta: 'false',
      isPublic: 'true',
      isDeprecated: 'false',
      versionType: '0',
      versionNumber: '1',
      slug: 'v1',
      createdAt: new Date('2024-06-13T14:30:00').toISOString(),
      modifiedAt: new Date('2024-06-13T14:30:00').toISOString(),
    })
  })

  it('passes the schema enum form of version_type through as well', () => {
    const t = TeamSchema.parse(transformTeam({ ...raw, version_type: 'apiDocumentation' }))
    expect(t.metadata?.['versionType']).toBe('apiDocumentation')
  })

  it('uses the documented version_number when version_code_name is null', () => {
    const t = TeamSchema.parse(
      transformTeam({ ...raw, version_code_name: null, version_number: 2 }),
    )
    expect(t.name).toBe('2')
  })

  it('throws instead of inventing a name when neither is present', () => {
    expect(() => transformTeam({ id: 'ver-min' })).toThrow(/version_code_name/)
  })

  it('throws instead of inventing an id', () => {
    expect(() => transformTeam({ ...raw, id: null })).toThrow(/no id/)
  })
})
