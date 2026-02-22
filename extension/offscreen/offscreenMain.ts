import { debugLog, debugError, debugWarn, initializeDebugTools } from '../debug/debugLogger';
import { EVENT_PLAY_SOUND, EVENT_OFFSCREEN_READY } from '../common/constants';
import type { RuntimeMessage, MessageResponse, NotificationSound } from '../common/types';
import { SOUND_PRESETS, type SoundPreset } from '../common/sound-config';

// Initialize debug tools for this context
initializeDebugTools();

debugLog('Offscreen document (offscreenMain.ts) loaded and script running.');

// Local interface to acknowledge webkitAudioContext for older browser compatibility
interface WindowWithLegacyAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Plays a notification sound using the Web Audio API.
 * @param audioContext - The AudioContext to use for playback.
 * @param soundType - The type of sound to play ('ping' or 'bell')
 */
function playNotificationSound(audioContext: AudioContext, soundType: NotificationSound): void {
  const config = SOUND_PRESETS[soundType as Exclude<NotificationSound, 'off'>] as SoundPreset;

  if (!config) {
    debugError(`Unknown sound type: ${soundType}`);
    return;
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
    // Fade out the sound
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + time + config.duration
    );

    oscillator.start(audioContext.currentTime + time);
    oscillator.stop(audioContext.currentTime + time + config.duration);
  });

  debugLog(`Offscreen notification sound playback initiated: ${soundType}`);
}

/**
 * Handles the request to play a notification sound.
 * Creates or resumes an AudioContext and then plays the sound.
 * @param soundType - The type of sound to play ('ping' or 'bell')
 */
async function handlePlayNotificationSound(soundType: NotificationSound = 'ping'): Promise<void> {
  try {
    // Early return if sound is disabled
    if (soundType === 'off') {
      debugLog('Sound is disabled (off), skipping playback');
      return;
    }

    debugLog(`Attempting to play notification sound in offscreen document: ${soundType}`);

    const globalWin = window as WindowWithLegacyAudio;
    const AudioContextConstructor = window.AudioContext || globalWin.webkitAudioContext;

    if (!AudioContextConstructor) {
      debugError('AudioContext is not supported in this environment.');
      return;
    }
    const audioContext = new AudioContextConstructor();
    debugLog('Offscreen AudioContext state:', audioContext.state);

    // Resume audio context if it's suspended (often required due to browser autoplay policies)
    if (audioContext.state === 'suspended') {
      debugLog('Offscreen AudioContext is suspended, attempting to resume...');
      await audioContext.resume();
      debugLog('AudioContext resumed.');
    }

    playNotificationSound(audioContext, soundType);
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
