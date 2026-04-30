import type { IDebugService } from '../../interfaces/IDebugService';
import type { IStorageService } from '../../interfaces/IStorageService';
import { STORAGE_KEY_PR_LIST_TRUST } from '@common/constants';
import type { PRListTrustState } from './types';

export class PrListTrustStore {
  constructor(
    private readonly storageService: IStorageService,
    private readonly debugService: IDebugService
  ) {}

  async read(): Promise<PRListTrustState> {
    try {
      return (await this.storageService.get<PRListTrustState>(STORAGE_KEY_PR_LIST_TRUST)) ?? {};
    } catch {
      return {};
    }
  }

  async write(state: PRListTrustState): Promise<void> {
    try {
      await this.storageService.set(STORAGE_KEY_PR_LIST_TRUST, state);
    } catch (error) {
      this.debugService.warn('[PrListTrustStore] Failed to persist PR list trust metadata.', error);
    }
  }
}
