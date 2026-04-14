/**
 * Pure client-side audio utilities for custom notification sounds.
 * Zero external dependencies -- relies solely on Web Audio API and FileReader.
 */

// ---------------------------------------------------------------------------
// Singleton AudioContext for preview playback in the popup/options page.
// Mirrors the pattern used in offscreenMain.ts.
// ---------------------------------------------------------------------------
let previewCtx: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;

function getPreviewContext(): AudioContext {
  if (previewCtx && previewCtx.state !== 'closed') return previewCtx;
  previewCtx = new AudioContext();
  return previewCtx;
}

// ---------------------------------------------------------------------------
// decodeAudioFile
// ---------------------------------------------------------------------------
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// trimAudioBuffer
// ---------------------------------------------------------------------------
export async function trimAudioBuffer(
  buffer: AudioBuffer,
  startS: number,
  endS: number
): Promise<AudioBuffer> {
  const duration = endS - startS;
  const sampleRate = buffer.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const offlineCtx = new OfflineAudioContext(1, length, sampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0, startS, duration);

  return offlineCtx.startRendering();
}

// ---------------------------------------------------------------------------
// audioBufferToWavBase64 -- mono 16-bit PCM WAV, no dependencies
// ---------------------------------------------------------------------------
export function audioBufferToWavBase64(buffer: AudioBuffer): string {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;

  // Mono-downmix: average all channels
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i];
    }
  }
  if (buffer.numberOfChannels > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] /= buffer.numberOfChannels;
    }
  }

  const bytesPerSample = 2;
  const dataLength = length * numChannels * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;
  const wav = new ArrayBuffer(totalLength);
  const view = new DataView(wav);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = headerLength;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, mono[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  // ArrayBuffer -> Base64
  const bytes = new Uint8Array(wav);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// previewInterval -- play a slice of an AudioBuffer, return a stop handle
// ---------------------------------------------------------------------------
export function previewInterval(
  buffer: AudioBuffer,
  startS: number,
  endS: number
): { stop: () => void } {
  // Stop any in-flight preview
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {
      /* already stopped */
    }
    activeSource = null;
  }

  const ctx = getPreviewContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0, startS, endS - startS);
  activeSource = source;

  source.onended = () => {
    if (activeSource === source) activeSource = null;
  };

  return {
    stop() {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      if (activeSource === source) activeSource = null;
    },
  };
}

// ---------------------------------------------------------------------------
// getWaveformPeaks -- extract amplitude peaks for canvas rendering
// ---------------------------------------------------------------------------
export function getWaveformPeaks(buffer: AudioBuffer, numBars: number): number[] {
  const data = buffer.getChannelData(0);
  const blockSize = Math.floor(data.length / numBars);
  const peaks: number[] = [];

  for (let i = 0; i < numBars; i++) {
    let max = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }

  return peaks;
}
