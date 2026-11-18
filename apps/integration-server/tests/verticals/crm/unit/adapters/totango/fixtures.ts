/**
 * Totango event fixtures, copied from the documented sample responses.
 *
 * touchpointEvent — "Retrieve events per account", Touchpoints API:
 *   https://support.totango.com/hc/en-us/articles/115000597266-Touchpoints-API
 *   (fetched as https://support.totango.com/api/v2/help_center/en-us/articles/115000597266.json)
 * searchedEvent — sample result of POST /api/v2/events/search, Search API (events):
 *   https://support.totango.com/hc/en-us/articles/360048132792-Search-API-events
 *   (fetched as https://support.totango.com/api/v2/help_center/en-us/articles/360048132792.json)
 */
import type { RawTotangoEvent } from '../../../../../../src/verticals/crm/adapters/totango/client'

export function touchpointEvent(): RawTotangoEvent {
  return {
    id: '4a0c13edzfacez3038zbb46z85f97f04238f',
    timestamp: 1578588991000,
    type: 'note',
    account: { id: '7987' },
    is_new: null,
    note_content: {
      text: ' This is a touchpoint body\n',
      totango_user: { user_name: 'user@totango.com' },
      note_id: 47124,
    },
    properties: {
      customers_visibility: false,
      activity_type_id: 'disabled_1576166402106',
      containsFormatting: 'true',
      subject: '',
      meeting_type: '0af9272e-a055-441e-ae10-f4223a3e0ab8',
      touchpoint_tags: ['450ea17a-0e76-418f-a4ec-8ae7b16b3b85'],
    },
  }
}

export function searchedEvent(): RawTotangoEvent {
  return {
    id: '1233',
    timestamp: 1588493035000,
    type: 'note',
    account: { id: 'ACCOUNT_ID' },
    is_new: null,
    note_content: {
      text: ' @person1 @person2 Please let me know when I can start the process.\n ',
      totango_user: { user_name: 'someone@totango.com' },
      note_id: 10871655,
    },
    properties: {
      customers_visibility: false,
      informed: ['person1@totango.com', 'person2@totango.com'],
      activity_type_id: 'support',
      parent_id: 1234,
      subject: 'Task/Touchpoint Migration',
      meeting_type: 'internal_note',
      totango_participants: ['person1@totango.com', 'person2@totango.com'],
    },
  }
}
