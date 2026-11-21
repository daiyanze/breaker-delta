/**
 * The fixture sets, one JSON file per read model. Data is validated by the
 * query layer on every read and by `contract.test.ts`.
 */
import busyChanges from "../sets/busy/changes.json" with { type: "json" };
import busyDeskCorrTopics from "../sets/busy/desk-correction-topics.json" with { type: "json" };
import busyDeskCorrections from "../sets/busy/desk-corrections.json" with { type: "json" };
import busyDeskMail from "../sets/busy/desk-mail.json" with { type: "json" };
import busyDeskScanLog from "../sets/busy/desk-scan-log.json" with { type: "json" };
import busyDeskSettings from "../sets/busy/desk-settings.json" with { type: "json" };
import busyDeskVerdicts from "../sets/busy/desk-verdict-queue.json" with { type: "json" };
import busyEchoes from "../sets/busy/echoes.json" with { type: "json" };
import busyEditionLists from "../sets/busy/edition-lists.json" with { type: "json" };
import busyEditions from "../sets/busy/editions.json" with { type: "json" };
import busySearch from "../sets/busy/search.json" with { type: "json" };
import busyShareCards from "../sets/busy/share-cards.json" with { type: "json" };
import busySiteMeta from "../sets/busy/site-meta.json" with { type: "json" };
import busySourceDetails from "../sets/busy/source-details.json" with { type: "json" };
import busySources from "../sets/busy/sources.json" with { type: "json" };
import busyTopics from "../sets/busy/topics.json" with { type: "json" };
import busyTrackRecord from "../sets/busy/track-record.json" with { type: "json" };
import freshChanges from "../sets/fresh/changes.json" with { type: "json" };
import freshDeskCorrTopics from "../sets/fresh/desk-correction-topics.json" with { type: "json" };
import freshDeskCorrections from "../sets/fresh/desk-corrections.json" with { type: "json" };
import freshDeskMail from "../sets/fresh/desk-mail.json" with { type: "json" };
import freshDeskScanLog from "../sets/fresh/desk-scan-log.json" with { type: "json" };
import freshDeskSettings from "../sets/fresh/desk-settings.json" with { type: "json" };
import freshDeskVerdicts from "../sets/fresh/desk-verdict-queue.json" with { type: "json" };
import freshEchoes from "../sets/fresh/echoes.json" with { type: "json" };
import freshEditionLists from "../sets/fresh/edition-lists.json" with { type: "json" };
import freshEditions from "../sets/fresh/editions.json" with { type: "json" };
import freshSearch from "../sets/fresh/search.json" with { type: "json" };
import freshShareCards from "../sets/fresh/share-cards.json" with { type: "json" };
import freshSiteMeta from "../sets/fresh/site-meta.json" with { type: "json" };
import freshSourceDetails from "../sets/fresh/source-details.json" with { type: "json" };
import freshSources from "../sets/fresh/sources.json" with { type: "json" };
import freshTopics from "../sets/fresh/topics.json" with { type: "json" };
import freshTrackRecord from "../sets/fresh/track-record.json" with { type: "json" };
import quietChanges from "../sets/quiet/changes.json" with { type: "json" };
import quietDeskCorrTopics from "../sets/quiet/desk-correction-topics.json" with { type: "json" };
import quietDeskCorrections from "../sets/quiet/desk-corrections.json" with { type: "json" };
import quietDeskMail from "../sets/quiet/desk-mail.json" with { type: "json" };
import quietDeskScanLog from "../sets/quiet/desk-scan-log.json" with { type: "json" };
import quietDeskSettings from "../sets/quiet/desk-settings.json" with { type: "json" };
import quietDeskVerdicts from "../sets/quiet/desk-verdict-queue.json" with { type: "json" };
import quietEchoes from "../sets/quiet/echoes.json" with { type: "json" };
import quietEditionLists from "../sets/quiet/edition-lists.json" with { type: "json" };
import quietEditions from "../sets/quiet/editions.json" with { type: "json" };
import quietSearch from "../sets/quiet/search.json" with { type: "json" };
import quietShareCards from "../sets/quiet/share-cards.json" with { type: "json" };
import quietSiteMeta from "../sets/quiet/site-meta.json" with { type: "json" };
import quietSourceDetails from "../sets/quiet/source-details.json" with { type: "json" };
import quietSources from "../sets/quiet/sources.json" with { type: "json" };
import quietTopics from "../sets/quiet/topics.json" with { type: "json" };
import quietTrackRecord from "../sets/quiet/track-record.json" with { type: "json" };

/** Raw JSON per set. Keys of map files are slot, day, slug, group id, query or card key. */
export const RAW_SETS = {
  busy: {
    changes: busyChanges,
    deskCorrectionTopics: busyDeskCorrTopics,
    deskCorrections: busyDeskCorrections,
    deskMail: busyDeskMail,
    deskScanLog: busyDeskScanLog,
    deskSettings: busyDeskSettings,
    deskVerdictQueue: busyDeskVerdicts,
    echoes: busyEchoes,
    editionLists: busyEditionLists,
    editions: busyEditions,
    search: busySearch,
    shareCards: busyShareCards,
    siteMeta: busySiteMeta,
    sourceDetails: busySourceDetails,
    sources: busySources,
    topics: busyTopics,
    trackRecord: busyTrackRecord,
  },
  fresh: {
    changes: freshChanges,
    deskCorrectionTopics: freshDeskCorrTopics,
    deskCorrections: freshDeskCorrections,
    deskMail: freshDeskMail,
    deskScanLog: freshDeskScanLog,
    deskSettings: freshDeskSettings,
    deskVerdictQueue: freshDeskVerdicts,
    echoes: freshEchoes,
    editionLists: freshEditionLists,
    editions: freshEditions,
    search: freshSearch,
    shareCards: freshShareCards,
    siteMeta: freshSiteMeta,
    sourceDetails: freshSourceDetails,
    sources: freshSources,
    topics: freshTopics,
    trackRecord: freshTrackRecord,
  },
  quiet: {
    changes: quietChanges,
    deskCorrectionTopics: quietDeskCorrTopics,
    deskCorrections: quietDeskCorrections,
    deskMail: quietDeskMail,
    deskScanLog: quietDeskScanLog,
    deskSettings: quietDeskSettings,
    deskVerdictQueue: quietDeskVerdicts,
    echoes: quietEchoes,
    editionLists: quietEditionLists,
    editions: quietEditions,
    search: quietSearch,
    shareCards: quietShareCards,
    siteMeta: quietSiteMeta,
    sourceDetails: quietSourceDetails,
    sources: quietSources,
    topics: quietTopics,
    trackRecord: quietTrackRecord,
  },
} as const;

export type FixtureSetName = keyof typeof RAW_SETS;
export type RawSet = (typeof RAW_SETS)[FixtureSetName];
export const FIXTURE_SET_NAMES = Object.keys(RAW_SETS) as FixtureSetName[];
