import { debugLog, debugError, debugWarn, initializeDebugTools } from '../debug/debugLogger';
import { EVENT_OFFSCREEN_READY, EVENT_PLAY_SOUND } from '../common/runtime-actions';
import type { RuntimeMessage, MessageResponse, NotificationSound } from '../common/types';
import { SOUND_PRESETS, type SoundPreset } from '../common/sound-config';

// Initialize debug tools for this context
initializeDebugTools();

debugLog('Offscreen document (offscreenMain.ts) loaded and script running.');

// Local interface to acknowledge webkitAudioContext for older browser compatibility
interface WindowWithLegacyAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

// Singleton AudioContext — reused across playbacks to avoid leaking native audio
// resources. Chrome caps concurrent AudioContexts at ~6 per origin; creating one
// per notification would exhaust the limit under rapid-fire scenarios.
let sharedAudioContext: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    return sharedAudioContext;
  }
  const globalWin = window as WindowWithLegacyAudio;
  const Ctor = window.AudioContext || globalWin.webkitAudioContext;
  if (!Ctor) {
    throw new Error('AudioContext is not supported in this environment');
  }
  sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

/**
 * Calculates total playback duration for a sound preset in milliseconds.
 */
function getSoundDurationMs(config: SoundPreset): number {
  const lastToneEnd = Math.max(...config.times) + config.duration;
  // Add a small buffer (100ms) to ensure oscillators fully finish
  return Math.ceil(lastToneEnd * 1000) + 100;
}

/**
 * Plays a notification sound using the Web Audio API.
 * @param audioContext - The AudioContext to use for playback.
 * @param soundType - The type of sound to play ('ping' or 'bell')
 * @returns Duration in ms the sound will take to finish
 */
function playNotificationSound(audioContext: AudioContext, soundType: NotificationSound): number {
  const config = SOUND_PRESETS[soundType as Exclude<NotificationSound, 'off'>] as SoundPreset;

  if (!config) {
    debugError(`Unknown sound type: ${soundType}`);
    return 0;
  }

  config.times.forEach((time, index) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = config.oscillatorType;
    oscillator.frequency.setValueAtTime(
      config.frequencies[index],
      audioContext.currentTime + time
    );
    gainNode.gain.setValueAtTime(config.initialGain, audioContext.currentTime + time);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + time + config.duration
    );

    oscillator.start(audioContext.currentTime + time);
    oscillator.stop(audioContext.currentTime + time + config.duration);
  });

  const durationMs = getSoundDurationMs(config);
  debugLog(`Offscreen notification sound playback initiated: ${soundType} (${durationMs}ms)`);
  return durationMs;
}

/**
 * Handles the request to play a notification sound.
 * Resolves only after the full sound duration has elapsed, keeping the
 * service worker alive via the pending sendResponse channel.
 */
async function handlePlayNotificationSound(soundType: NotificationSound = 'ping'): Promise<void> {
  try {
    if (soundType === 'off') {
      debugLog('Sound is disabled (off), skipping playback');
      return;
    }

    debugLog(`Attempting to play notification sound in offscreen document: ${soundType}`);

    const audioContext = getOrCreateAudioContext();
    debugLog('Offscreen AudioContext state:', audioContext.state);

    if (audioContext.state === 'suspended') {
      debugLog('Offscreen AudioContext is suspended, attempting to resume...');
      await audioContext.resume();
      debugLog('AudioContext resumed.');
    }

    const durationMs = playNotificationSound(audioContext, soundType);

    if (durationMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
      debugLog(`Offscreen sound playback completed: ${soundType}`);
    }
  } catch (error) {
    debugError('Failed to play sound in offscreen document:', error);
  }
}

// Listen for messages from other parts of the extension (e.g., background script)
chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  debugLog('Offscreen document received message:', message, 'from sender:', sender);

  if (message.action === EVENT_PLAY_SOUND) {
    // Get sound type from payload, default to 'ping' if not specified
    const payload = message.payload as { soundType?: NotificationSound } | undefined;
    const soundType = payload?.soundType ?? 'ping';

    handlePlayNotificationSound(soundType)
      .then(() => {
        sendResponse({
          success: true,
          data: `Sound playback initiated: ${soundType}`,
        } as MessageResponse);
      })
      .catch((error) => {
        debugError('Error in handlePlayNotificationSound promise chain:', error);
        sendResponse({
          success: false,
          error: 'Failed to initiate sound playback',
        } as MessageResponse);
      });
    return true; // Indicates that the response will be sent asynchronously
  }
  // Handle other messages if needed

  // Default response for unhandled actions
  // sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  return false; // No async response from this path
});

// Notify the background script that the offscreen document is ready and loaded.
// This is useful for the background script to know it can start sending messages.
function notifyBackgroundReady(): void {
  chrome.runtime
    .sendMessage({ action: EVENT_OFFSCREEN_READY } as RuntimeMessage)
    .then((response) => {
      debugLog('Successfully sent offscreenReady message to background. Response:', response);
    })
    .catch((error) => {
      // This can happen if the background script isn't listening yet (e.g., during initial load)
      debugWarn(
        'Failed to send offscreenReady message to background script. It might not be ready yet.',
        error.message
      );
      // Optionally retry or handle this case
    });
}

// Notify readiness when the script loads
notifyBackgroundReady();

debugLog('Offscreen document (offscreenMain.ts) event listeners attached and ready signal sent.');
