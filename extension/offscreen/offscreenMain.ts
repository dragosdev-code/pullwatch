import { debugLog, debugError, debugWarn, initializeDebugTools } from '../debug/debugLogger';
import {
  EVENT_OFFSCREEN_READY,
  EVENT_PLAY_SOUND,
  EVENT_STOP_SOUND_PLAYBACK,
} from '../common/runtime-actions';
import type { RuntimeMessage, MessageResponse, NotificationSound, BuiltInSound } from '../common/types';
import { SOUND_PRESETS, isCustomSoundId, isBuiltInSound, type SoundPreset } from '../common/sound-config';
import { chromeExtensionService } from '@common/chrome-extension-service';

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

/**
 * Aborts the post-play `setTimeout` wait so the SW `sendMessage` callback can run after STOP or a newer play.
 * WHY: the worker stays alive until offscreen responds; we must end that wait when preview is cut short.
 */
let activePlaybackAbort: AbortController | null = null;

/**
 * Monotonic stamp for “which PLAY/STOP request is current”.
 * WHY: `decodeAudioData` is async; a superseded handler can finish decode after a newer PLAY started and would
 * call `source.start()` unless we compare generations after every yield.
 */
let playRequestGeneration = 0;

/** Last started custom clip; suspend/resume alone does not stop BufferSources—they resume with the context. */
let activeCustomBufferSource: AudioBufferSourceNode | null = null;

/** Built-in tones use oscillators; same resume issue if we only suspend the AudioContext. */
const activeBuiltInOscillators: OscillatorNode[] = [];

/**
 * Hard-stops any nodes still connected from the previous play so a new preview cannot overlap.
 * WHY: `AudioContext.suspend()` pauses time; `resume()` continues *all* scheduled sources, including
 * an older `BufferSource` that was never `stop()`ped—users hear two clips at once.
 */
const stopAllActiveAudioNodes = (): void => {
  if (activeCustomBufferSource) {
    const ctx = activeCustomBufferSource.context;
    try {
      activeCustomBufferSource.stop(ctx.currentTime);
    } catch {
      /* already stopped / not started */
    }
    try {
      activeCustomBufferSource.disconnect();
    } catch {
      /* */
    }
    activeCustomBufferSource = null;
  }
  for (const osc of activeBuiltInOscillators) {
    try {
      osc.stop(osc.context.currentTime);
    } catch {
      /* */
    }
    try {
      osc.disconnect();
    } catch {
      /* */
    }
  }
  activeBuiltInOscillators.length = 0;
};

/**
 * Stops audible output and the duration wait for the current play.
 * WHY node stops + suspend: suspend alone does not tear down started `BufferSource`s; `resume()` for the next clip would un-pause them too.
 */
function interruptActivePlayback(): void {
  activePlaybackAbort?.abort();
  stopAllActiveAudioNodes();
  if (sharedAudioContext?.state === 'running') {
    void sharedAudioContext.suspend();
  }
}

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
  /** Snapshot from the caller; if a newer play or STOP bumped `playRequestGeneration`, discard output. */
  requestGeneration: number,
): Promise<number> {
  if (!base64) {
    debugWarn(`No custom sound payload for ${soundId}, falling back to ping`);
    return playBuiltInSound(audioContext, 'ping');
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const buffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
  // WHY: another PLAY or STOP may have run while decoding; starting this buffer would layer on top of the new sound.
  if (requestGeneration !== playRequestGeneration) {
    debugLog(`Discarding decoded custom sound (superseded): ${soundId}`);
    return 0;
  }
  debugLog(`Decoded custom sound: ${soundId}`);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  activeCustomBufferSource = source;
  // WHY: `interruptActivePlayback` must not hold a pointer to a finished node so the next stop targets the right source.
  source.onended = () => {
    if (activeCustomBufferSource === source) {
      activeCustomBufferSource = null;
    }
  };
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

    // WHY track oscillators: suspend/resume does not cancel scheduled tones; `stop()` on interrupt silences them immediately.
    activeBuiltInOscillators.push(oscillator);

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
  // Bump generation before interrupt so in-flight decode from an older handler becomes stale as soon as this PLAY is accepted.
  const myGeneration = ++playRequestGeneration;
  interruptActivePlayback();

  const abortController = new AbortController();
  activePlaybackAbort = abortController;
  const signal = abortController.signal;

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

    // WHY after `resume`: another message may have run during the await and bumped `playRequestGeneration`.
    if (myGeneration !== playRequestGeneration) {
      return;
    }

    let durationMs = 0;

    if (isCustomSoundId(soundType)) {
      durationMs = await playCustomSound(
        audioContext,
        soundType,
        playPayload?.customSoundBase64,
        myGeneration,
      );
    } else if (isBuiltInSound(soundType)) {
      durationMs = playBuiltInSound(audioContext, soundType);
    } else {
      debugWarn(`Unrecognised sound type "${soundType}", falling back to ping`);
      durationMs = playBuiltInSound(audioContext, 'ping');
    }

    // WHY after decode/play path: custom decode is async; built-in path is sync but a STOP could interleave before we schedule the wait.
    if (myGeneration !== playRequestGeneration) {
      return;
    }

    if (durationMs > 0) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          signal.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          clearTimeout(tid);
          finish();
        };
        const tid = setTimeout(finish, durationMs);
        signal.addEventListener('abort', onAbort);
      });
      debugLog(`Offscreen sound playback completed: ${soundType}`);
    }
  } catch (error) {
    debugError('Failed to play sound in offscreen document:', error);
  } finally {
    if (activePlaybackAbort === abortController) {
      activePlaybackAbort = null;
    }
  }
}

// Listen for messages from other parts of the extension (e.g., background script)
chromeExtensionService.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  const message = rawMessage as RuntimeMessage;
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

  if (message.action === EVENT_STOP_SOUND_PLAYBACK) {
    // WHY bump generation: in-flight decodes must not call `source.start()` after the user asked for silence.
    playRequestGeneration += 1;
    interruptActivePlayback();
    // WHY clear abort ref: interrupt already aborted the controller; leaving it would confuse `finally` in a concurrent PLAY handler.
    activePlaybackAbort = null;
    sendResponse({ success: true, data: 'Playback interrupted' } as MessageResponse);
    return true;
  }

  // Handle other messages if needed

  // Default response for unhandled actions
  // sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  return false; // No async response from this path
});

// Notify the background script that the offscreen document is ready and loaded.
// This is useful for the background script to know it can start sending messages.
function notifyBackgroundReady(): void {
  chromeExtensionService.runtime
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
