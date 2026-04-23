import { useSyncedStorageValue } from './use-synced-storage-value';

export type LinkOpenBehavior = 'foreground' | 'background';

const STORAGE_KEY = 'pr-extension-link-behavior';
const DEFAULT_BEHAVIOR: LinkOpenBehavior = 'foreground';

const validate = (raw: unknown): LinkOpenBehavior =>
  raw === 'background' ? 'background' : 'foreground';

export const useLinkBehavior = () => {
  const [behavior, setBehavior] = useSyncedStorageValue<LinkOpenBehavior>({
    key: STORAGE_KEY,
    defaultValue: DEFAULT_BEHAVIOR,
    validate,
  });
  return { behavior, setBehavior };
};
