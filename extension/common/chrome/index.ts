/**
 * Barrel for the `extension/common/chrome/` layer (globals, types, adapters, clients).
 *
 * WHY: Lets extension-common code import one path when crossing from another submodule (e.g.
 * parsers) into chrome helpers without deep relative chains. Popup and worker entrypoints should
 * still use `@common/chrome-extension-service` as the public composition root.
 */
export * from './chrome-globals';
export * from './chrome-types';
export * from './listener-binding';
export * from './adapters/storage-adapter';
export * from './adapters/runtime-adapter';
export * from './adapters/alarms-adapter';
export * from './adapters/notifications-adapter';
export * from './adapters/tabs-adapter';
export * from './adapters/action-adapter';
export * from './adapters/permissions-adapter';
export * from './adapters/offscreen-adapter';
export * from './clients/background-action-client';
export * from './clients/pr-client';
export * from './clients/settings-client';
export * from './clients/sound-preview-client';
export * from './clients/dev-test-client';
export * from './clients/runtime-message-client';
