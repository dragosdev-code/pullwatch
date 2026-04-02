import { debugLog, debugError, debugWarn, initializeDebugTools } from '../debug/debugLogger';
import { EVENT_OFFSCREEN_READY, EVENT_PLAY_SOUND } from '../common/runtime-actions';
import type { RuntimeMessage, MessageResponse, NotificationSound, BuiltInSound } from '../common/types';
import { SOUND_PRESETS, isCustomSoundId, isBuiltInSound, type SoundPreset } from '../common/sound-config';

// Initialize debug tools for this context
initializeDebugTools();

debugLog('Offscreen document (offscreenMain.ts) loaded and script running.');

// Offscreen documents do not expose chrome.storage — only chrome.runtime messaging is
// available among extension APIs. Custom WAV data is read in the service worker and
// passed as customSoundBase64 on the play-sound message payload.

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
 * Plays a user-uploaded custom sound from Base64 WAV bytes supplied by the service worker.
 * Falls back to 'ping' if payload audio is missing (e.g. cross-device sync).
 */
async function playCustomSound(
  audioContext: AudioContext,
  soundId: string,
  base64: string | undefined,
): Promise<number> {
  if (!base64) {
    debugWarn(`No custom sound payload for ${soundId}, falling back to ping`);
    return playBuiltInSound(audioContext, 'ping');
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const buffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
  debugLog(`Decoded custom sound: ${soundId}`);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);

  const durationMs = Math.ceil(buffer.duration * 1000) + 100;
  debugLog(`Custom sound playback initiated: ${soundId} (${durationMs}ms)`);
  return durationMs;
}

// ── Built-in sound playback ───────────────────────────────────────────────────

function getSoundDurationMs(config: SoundPreset): number {
  const lastToneEnd = Math.max(...config.times) + config.duration;
  return Math.ceil(lastToneEnd * 1000) + 100;
}

/**
 * Plays a built-in notification sound using oscillator synthesis.
 */
function playBuiltInSound(audioContext: AudioContext, soundType: BuiltInSound): number {
  const config = SOUND_PRESETS[soundType];

  if (!config) {
    debugError(`Unknown built-in sound type: ${soundType}`);
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
  debugLog(`Built-in sound playback initiated: ${soundType} (${durationMs}ms)`);
  return durationMs;
}

/**
 * Handles the request to play a notification sound (built-in or custom).
 * Resolves only after the full sound duration has elapsed, keeping the
 * service worker alive via the pending sendResponse channel.
 */
type PlaySoundMessagePayload = {
  soundType?: NotificationSound;
  customSoundBase64?: string;
};

async function handlePlayNotificationSound(
  soundType: NotificationSound = 'ping',
  playPayload?: PlaySoundMessagePayload,
): Promise<void> {
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

    let durationMs: number;

    if (isCustomSoundId(soundType)) {
      durationMs = await playCustomSound(
        audioContext,
        soundType,
        playPayload?.customSoundBase64,
      );
    } else if (isBuiltInSound(soundType)) {
      durationMs = playBuiltInSound(audioContext, soundType);
    } else {
      debugWarn(`Unrecognised sound type "${soundType}", falling back to ping`);
      durationMs = playBuiltInSound(audioContext, 'ping');
    }

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
    const payload = message.payload as PlaySoundMessagePayload | undefined;
    const soundType = payload?.soundType ?? 'ping';

    handlePlayNotificationSound(soundType, payload)
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
