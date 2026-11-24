import { JourneyEventDef } from '../../engine/journeyCore';
import { COMMON_EVENTS } from './common';
import { HISTORY_ECHOES, HISTORY_EVENTS } from './history';
import { MASTER_EVENTS } from './masters';
import { PEOPLE_EVENTS } from './people';
import { HOME_EVENTS } from './home';
import { SEASONAL_EVENTS } from './seasonal';
import { CONDITIONAL_EVENTS } from './conditional';

export const ALL_JOURNEY_EVENTS: JourneyEventDef[] = [...COMMON_EVENTS, ...MASTER_EVENTS, ...PEOPLE_EVENTS, ...HISTORY_EVENTS, ...HISTORY_ECHOES, ...HOME_EVENTS, ...SEASONAL_EVENTS, ...CONDITIONAL_EVENTS];

const BY_KEY = new Map(ALL_JOURNEY_EVENTS.map((d) => [d.key, d]));

export function getJourneyEventDef(key: string): JourneyEventDef | undefined {
  return BY_KEY.get(key);
}
