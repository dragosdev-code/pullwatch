import type { BadgeColorDetails, BadgeTextDetails, TabDetails } from '../chrome-types';

export interface ActionAdapter {
  setBadgeBackgroundColor(details: BadgeColorDetails): Promise<void>;
  setBadgeTextColor(details: BadgeColorDetails): Promise<void>;
  setBadgeText(details: BadgeTextDetails): Promise<void>;
  getBadgeText(details: TabDetails): Promise<string>;
}

export function makeActionAdapter(): ActionAdapter {
  return {
    setBadgeBackgroundColor: (d) => chrome.action.setBadgeBackgroundColor(d),
    setBadgeTextColor: (d) => chrome.action.setBadgeTextColor(d),
    setBadgeText: (d) => chrome.action.setBadgeText(d),
    getBadgeText: (d) => chrome.action.getBadgeText(d),
  };
}
