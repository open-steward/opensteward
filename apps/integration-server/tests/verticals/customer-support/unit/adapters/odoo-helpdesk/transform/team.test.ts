/** helpdesk.team rows; name and active from odoo/industry 19.0 bike_shop/data/helpdesk_team.xml. */
import { describe, expect, it } from 'vitest'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema'
import { transformTeam } from '../../../../../../../src/verticals/customer-support/adapters/odoo-helpdesk/transform/team'

describe('odoo-helpdesk transformTeam', () => {
  it('maps a team', () => {
    const t = TeamSchema.parse(
      transformTeam({ id: 1, name: 'Warranties / After-Sales / SAV', active: true }),
    )
    expect(t).toMatchObject({
      id: '1',
      externalId: '1',
      name: 'Warranties / After-Sales / SAV',
      platform: 'odoo-helpdesk',
    })
    expect(t.memberCount).toBeUndefined()
    expect(t.metadata).toEqual({ active: 'true' })
  })

  it('keeps an archived team archived and tolerates a missing name', () => {
    const t = TeamSchema.parse(transformTeam({ id: 2, active: false }))
    expect(t.name).toBe('')
    expect(t.metadata).toEqual({ active: 'false' })
  })
})
