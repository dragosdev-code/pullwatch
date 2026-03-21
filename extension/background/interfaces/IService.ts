/**
 * Base interface for all extension services.
 * Defines the common lifecycle methods that every service must implement.
 */
export interface IService {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
