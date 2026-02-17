/**
 * Interface for the badge service that handles Chrome extension badge management.
 */
export interface IBadgeService {
  /**
   * Updates the badge with a count or text.
   */
  updateBadge(countOrText: number | string, color?: string): Promise<void>;

  /**
   * Sets the badge to loading state.
   */
  setLoadingBadge(): Promise<void>;

  /**
   * Sets the badge to error state.
   */
  setErrorBadge(): Promise<void>;

  /**
   * Sets the badge to default/inactive state.
   */
  setDefaultBadge(): Promise<void>;

  /**
   * Sets the badge to show PR count.
   */
  setPRCountBadge(count: number): Promise<void>;

  /**
   * Initializes the badge service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the badge service.
   */
  dispose(): Promise<void>;
}
