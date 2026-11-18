/**
 * Adapter factories — lazy constructors keyed by platform slug.
 */
import type { AdapterFactory } from '@opensteward/shared'
import type { CustomerSupportAdapter } from './interface'

// Major helpdesk platforms
import { ZendeskAdapter } from '../adapters/zendesk'
import { IntercomAdapter } from '../adapters/intercom'
import { FreshdeskAdapter } from '../adapters/freshdesk'
import { HelpScoutAdapter } from '../adapters/helpscout'

// Omnichannel + live-chat majors
import { FrontAdapter } from '../adapters/front'
import { SalesforceServiceAdapter } from '../adapters/salesforce-service'
import { ZohoDeskAdapter } from '../adapters/zoho-desk'
import { GorgiasAdapter } from '../adapters/gorgias'
import { KustomerAdapter } from '../adapters/kustomer'
import { GladlyAdapter } from '../adapters/gladly'
import { DriftAdapter } from '../adapters/drift'
import { CrispAdapter } from '../adapters/crisp'

// Mid-market platforms
import { LiveChatAdapter } from '../adapters/livechat'
import { HiverAdapter } from '../adapters/hiver'
import { TidioAdapter } from '../adapters/tidio'
import { ReamazeAdapter } from '../adapters/reamaze'
import { HappyFoxAdapter } from '../adapters/happyfox'
import { GrooveAdapter } from '../adapters/groove'
import { HelpCrunchAdapter } from '../adapters/helpcrunch'

// Regional + cloud-OSS
import { ChatwootAdapter } from '../adapters/chatwoot'
import { CustomerlyAdapter } from '../adapters/customerly'
import { TrengoAdapter } from '../adapters/trengo'
import { GistAdapter } from '../adapters/gist'
import { MojoHelpdeskAdapter } from '../adapters/mojo-helpdesk'
import { AdaCxAdapter } from '../adapters/ada-cx'
import { ChannelTalkAdapter } from '../adapters/channel-talk'
import { ChaportAdapter } from '../adapters/chaport'
import { ChaskiqAdapter } from '../adapters/chaskiq'
import { ChatbotKnowmaxAdapter } from '../adapters/chatbot-knowmax'
import { ClearfeedAdapter } from '../adapters/clearfeed'
import { CognigyAdapter } from '../adapters/cognigy'
import { Comm100Adapter } from '../adapters/comm100'
import { ConnectwisePsaAdapter } from '../adapters/connectwise-psa'
import { DelightchatAdapter } from '../adapters/delightchat'
import { DeskcomDesk365Adapter } from '../adapters/deskcom-desk365'
import { DeskproAdapter } from '../adapters/deskpro'
import { Document360Adapter } from '../adapters/document360'
import { EdeskAdapter } from '../adapters/edesk'
import { EgainAdapter } from '../adapters/egain'
import { FaveoHelpdeskAdapter } from '../adapters/faveo-helpdesk'
import { Five9Adapter } from '../adapters/five9'
import { ForethoughtAdapter } from '../adapters/forethought'
import { FrappeHelpdeskAdapter } from '../adapters/frappe-helpdesk'
import { FreescoutAdapter } from '../adapters/freescout'
import { FreshchatAdapter } from '../adapters/freshchat'
import { FreshserviceAdapter } from '../adapters/freshservice'
import { GallaboxAdapter } from '../adapters/gallabox'
import { GenesysCloudAdapter } from '../adapters/genesys-cloud'
import { GorgiasAircallAdapter } from '../adapters/gorgias-aircall'
import { HalopsaAdapter } from '../adapters/halopsa'
import { HaptikAdapter } from '../adapters/haptik'
import { HellotarsSupportAdapter } from '../adapters/hellotars-support'
import { HelpcenterIoAdapter } from '../adapters/helpcenter-io'
import { HelpcrunchNaAdapter } from '../adapters/helpcrunch-na'
import { HelpjuiceAdapter } from '../adapters/helpjuice'
import { HelpshiftAdapter } from '../adapters/helpshift'
import { HelpspotAdapter } from '../adapters/helpspot'
import { HelpwiseAdapter } from '../adapters/helpwise'
import { HubspotServiceHubAdapter } from '../adapters/hubspot-service-hub'
import { JiraServiceManagementAdapter } from '../adapters/jira-service-management'
import { JitbitHelpdeskAdapter } from '../adapters/jitbit-helpdesk'
import { KayakoAdapter } from '../adapters/kayako'
import { KhorosCareAdapter } from '../adapters/khoros-care'
import { KoreAiAdapter } from '../adapters/kore-ai'
import { LibredeskAdapter } from '../adapters/libredesk'
import { LiveagentAdapter } from '../adapters/liveagent'
import { LivehelpnowAdapter } from '../adapters/livehelpnow'
import { MissiveAdapter } from '../adapters/missive'
import { MovideskAdapter } from '../adapters/movidesk'
import { OctadeskAdapter } from '../adapters/octadesk'
import { OdooHelpdeskAdapter } from '../adapters/odoo-helpdesk'
import { OlarkAdapter } from '../adapters/olark'
import { OmnideskAdapter } from '../adapters/omnidesk'
import { OsticketAdapter } from '../adapters/osticket'
import { OtoboAdapter } from '../adapters/otobo'
import { PapercupsAdapter } from '../adapters/papercups'
import { PlainAdapter } from '../adapters/plain'
import { ProprofsHelpDeskAdapter } from '../adapters/proprofs-help-desk'
import { PyrusAdapter } from '../adapters/pyrus'
import { RasayelAdapter } from '../adapters/rasayel'
import { ReplyBirdConversationsAdapter } from '../adapters/reply-bird-conversations'
import { RespondIoAdapter } from '../adapters/respond-io'
import { RichpanelAdapter } from '../adapters/richpanel'
import { SmartsuppAdapter } from '../adapters/smartsupp'
import { SnapengageAdapter } from '../adapters/snapengage'
import { SprinklrServiceAdapter } from '../adapters/sprinklr-service'
import { SupportbenchAdapter } from '../adapters/supportbench'
import { SysaidAdapter } from '../adapters/sysaid'
import { TakeBlipAdapter } from '../adapters/take-blip'
import { TalkdeskAdapter } from '../adapters/talkdesk'
import { TawkToAdapter } from '../adapters/tawk-to'
import { TeamsupportAdapter } from '../adapters/teamsupport'
import { ThenaAdapter } from '../adapters/thena'
import { TiledeskAdapter } from '../adapters/tiledesk'
import { UnthreadAdapter } from '../adapters/unthread'
import { UsedeskAdapter } from '../adapters/usedesk'
import { UserlikeAdapter } from '../adapters/userlike'
import { UvdeskAdapter } from '../adapters/uvdesk'
import { VerloopAdapter } from '../adapters/verloop'
import { VivantioAdapter } from '../adapters/vivantio'
import { WatiAdapter } from '../adapters/wati'
import { YellowAiAdapter } from '../adapters/yellow-ai'
import { ZammadAdapter } from '../adapters/zammad'
import { ZenviaAdapter } from '../adapters/zenvia'
import { ZnunyAdapter } from '../adapters/znuny'

function factory<T extends CustomerSupportAdapter>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Ctor: new (...args: any[]) => T,
): AdapterFactory<T> {
  return (cfg) => new Ctor(cfg)
}

export const ADAPTER_FACTORIES: Record<string, AdapterFactory<CustomerSupportAdapter>> = {
  zendesk: factory(ZendeskAdapter),
  intercom: factory(IntercomAdapter),
  freshdesk: factory(FreshdeskAdapter),
  helpscout: factory(HelpScoutAdapter),
  front: factory(FrontAdapter),
  'salesforce-service': factory(SalesforceServiceAdapter),
  'zoho-desk': factory(ZohoDeskAdapter),
  gorgias: factory(GorgiasAdapter),
  kustomer: factory(KustomerAdapter),
  gladly: factory(GladlyAdapter),
  drift: factory(DriftAdapter),
  crisp: factory(CrispAdapter),
  livechat: factory(LiveChatAdapter),
  hiver: factory(HiverAdapter),
  tidio: factory(TidioAdapter),
  reamaze: factory(ReamazeAdapter),
  happyfox: factory(HappyFoxAdapter),
  groove: factory(GrooveAdapter),
  helpcrunch: factory(HelpCrunchAdapter),
  chatwoot: factory(ChatwootAdapter),
  customerly: factory(CustomerlyAdapter),
  trengo: factory(TrengoAdapter),
  gist: factory(GistAdapter),
  'mojo-helpdesk': factory(MojoHelpdeskAdapter),
  'ada-cx': factory(AdaCxAdapter),
  'channel-talk': factory(ChannelTalkAdapter),
  chaport: factory(ChaportAdapter),
  chaskiq: factory(ChaskiqAdapter),
  'chatbot-knowmax': factory(ChatbotKnowmaxAdapter),
  clearfeed: factory(ClearfeedAdapter),
  cognigy: factory(CognigyAdapter),
  comm100: factory(Comm100Adapter),
  'connectwise-psa': factory(ConnectwisePsaAdapter),
  delightchat: factory(DelightchatAdapter),
  'deskcom-desk365': factory(DeskcomDesk365Adapter),
  deskpro: factory(DeskproAdapter),
  document360: factory(Document360Adapter),
  edesk: factory(EdeskAdapter),
  egain: factory(EgainAdapter),
  'faveo-helpdesk': factory(FaveoHelpdeskAdapter),
  five9: factory(Five9Adapter),
  forethought: factory(ForethoughtAdapter),
  'frappe-helpdesk': factory(FrappeHelpdeskAdapter),
  freescout: factory(FreescoutAdapter),
  freshchat: factory(FreshchatAdapter),
  freshservice: factory(FreshserviceAdapter),
  gallabox: factory(GallaboxAdapter),
  'genesys-cloud': factory(GenesysCloudAdapter),
  'gorgias-aircall': factory(GorgiasAircallAdapter),
  halopsa: factory(HalopsaAdapter),
  haptik: factory(HaptikAdapter),
  'hellotars-support': factory(HellotarsSupportAdapter),
  'helpcenter-io': factory(HelpcenterIoAdapter),
  'helpcrunch-na': factory(HelpcrunchNaAdapter),
  helpjuice: factory(HelpjuiceAdapter),
  helpshift: factory(HelpshiftAdapter),
  helpspot: factory(HelpspotAdapter),
  helpwise: factory(HelpwiseAdapter),
  'hubspot-service-hub': factory(HubspotServiceHubAdapter),
  'jira-service-management': factory(JiraServiceManagementAdapter),
  'jitbit-helpdesk': factory(JitbitHelpdeskAdapter),
  kayako: factory(KayakoAdapter),
  'khoros-care': factory(KhorosCareAdapter),
  'kore-ai': factory(KoreAiAdapter),
  libredesk: factory(LibredeskAdapter),
  liveagent: factory(LiveagentAdapter),
  livehelpnow: factory(LivehelpnowAdapter),
  missive: factory(MissiveAdapter),
  movidesk: factory(MovideskAdapter),
  octadesk: factory(OctadeskAdapter),
  'odoo-helpdesk': factory(OdooHelpdeskAdapter),
  olark: factory(OlarkAdapter),
  omnidesk: factory(OmnideskAdapter),
  osticket: factory(OsticketAdapter),
  otobo: factory(OtoboAdapter),
  papercups: factory(PapercupsAdapter),
  plain: factory(PlainAdapter),
  'proprofs-help-desk': factory(ProprofsHelpDeskAdapter),
  pyrus: factory(PyrusAdapter),
  rasayel: factory(RasayelAdapter),
  'reply-bird-conversations': factory(ReplyBirdConversationsAdapter),
  'respond-io': factory(RespondIoAdapter),
  richpanel: factory(RichpanelAdapter),
  smartsupp: factory(SmartsuppAdapter),
  snapengage: factory(SnapengageAdapter),
  'sprinklr-service': factory(SprinklrServiceAdapter),
  supportbench: factory(SupportbenchAdapter),
  sysaid: factory(SysaidAdapter),
  'take-blip': factory(TakeBlipAdapter),
  talkdesk: factory(TalkdeskAdapter),
  'tawk-to': factory(TawkToAdapter),
  teamsupport: factory(TeamsupportAdapter),
  thena: factory(ThenaAdapter),
  tiledesk: factory(TiledeskAdapter),
  unthread: factory(UnthreadAdapter),
  usedesk: factory(UsedeskAdapter),
  userlike: factory(UserlikeAdapter),
  uvdesk: factory(UvdeskAdapter),
  verloop: factory(VerloopAdapter),
  vivantio: factory(VivantioAdapter),
  wati: factory(WatiAdapter),
  'yellow-ai': factory(YellowAiAdapter),
  zammad: factory(ZammadAdapter),
  zenvia: factory(ZenviaAdapter),
  znuny: factory(ZnunyAdapter),
}
