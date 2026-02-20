export type NotificationSound = 'ping' | 'bell' | 'off';

export interface ExtensionSettings {
  assigned: {
    notificationsEnabled: boolean;
    notifyOnDrafts: boolean;
    sound: NotificationSound;
    showDraftsInList: boolean;
  };
  merged: {
    notificationsEnabled: boolean;
    sound: NotificationSound;
  };
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  assigned: {
    notificationsEnabled: true,
    notifyOnDrafts: false,
    sound: 'ping',
    showDraftsInList: true,
  },
  merged: {
    notificationsEnabled: false,
    sound: 'bell',
  },
};
