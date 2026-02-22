export const TAB_IDS = {
  ASSIGNED: 'assigned',
  AUTHORED: 'authored',
  MERGED: 'merged',
} as const;

export type TabId = typeof TAB_IDS[keyof typeof TAB_IDS];

export const DEFAULT_TAB_ID = TAB_IDS.ASSIGNED;
