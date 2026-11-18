/**
 * Fixture: the documented example of GET /activities
 * (https://docs.oracle.com/en/cloud/saas/sales/faaps/op-activities-get.html,
 * "Example of Response Body"), trimmed, plus documented
 * `activities-item-response` attributes the example omits.
 */
import { describe, it, expect } from 'vitest'
import { ActivitySchema } from '../../../../../../../src/verticals/crm/schema/activity'
import {
  ACTIVITY_FIELDS,
  transformActivity,
  untransformActivity,
  type RawOracleCxActivity,
} from '../../../../../../../src/verticals/crm/adapters/oracle-cx/transform/activity'

const DOC_EXAMPLE: RawOracleCxActivity = {
  ActivityId: 300100036212819,
  ActivityNumber: 'CDRM_1007',
  AccountId: null,
  ActivityCreatedBy: 'SALES_MANAGER',
  ActivityCreationDate: '2014-07-08T09:27:10-07:00',
  ActivityEndDate: '2014-07-08T11:00:00-07:00',
  Subject: 'ghgh',
  ActivityFunctionCode: 'APPOINTMENT',
  ActivityStartDate: '2014-07-08T10:00:00-07:00',
  ActivityTypeCode: 'MEETING',
  ActivityUpdateDate: '2016-08-06T10:58:21-07:00',
}

describe('oracle-cx transformActivity', () => {
  it('maps the documented example and parses against ActivitySchema', () => {
    const out = ActivitySchema.parse(transformActivity(DOC_EXAMPLE))
    expect(out).toMatchObject({ id: '300100036212819', subject: 'ghgh' })
    expect(out.company_id).toBeUndefined()
    expect(out.metadata).toEqual(DOC_EXAMPLE)
  })

  it('reads the documented owner, contact, account, opportunity, due date and dates', () => {
    const out = ActivitySchema.parse(
      transformActivity({
        ...DOC_EXAMPLE,
        OwnerId: 300100174752464,
        PrimaryContactId: 300100000000001,
        AccountId: 999997549785817,
        OpportunityId: 999997817606460,
        DueDate: '2014-07-10',
        CreationDate: '2014-07-08T09:27:10-07:00',
        LastUpdateDate: '2016-08-06T10:58:21-07:00',
      }),
    )
    expect(out).toMatchObject({
      owner_id: '300100174752464',
      contact_id: '300100000000001',
      company_id: '999997549785817',
      deal_id: '999997817606460',
      due_date: '2014-07-10T00:00:00.000Z',
      created_at: '2014-07-08T16:27:10.000Z',
      updated_at: '2016-08-06T17:58:21.000Z',
    })
  })

  it('ignores the undocumented attribute names it used to read', () => {
    const out = transformActivity({
      ActivityId: 1,
      Description: 'd',
      PlannedEndDate: '2026-01-01T00:00:00Z',
      OwnedByPartyId: 2,
      PrimaryContactPartyId: 3,
    })
    expect(out.note).toBeUndefined()
    expect(out.due_date).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
    expect(out.contact_id).toBeUndefined()
  })

  it('requests exactly the documented attributes it reads', () => {
    expect(ACTIVITY_FIELDS.split(',')).toEqual([
      'ActivityId',
      'Subject',
      'DueDate',
      'OwnerId',
      'PrimaryContactId',
      'AccountId',
      'OpportunityId',
      'CreationDate',
      'LastUpdateDate',
    ])
  })
})

describe('oracle-cx untransformActivity', () => {
  it('maps subject to Subject', () => {
    const result = untransformActivity({ subject: 'Meeting' })
    expect(result.Subject).toBe('Meeting')
  })
})
