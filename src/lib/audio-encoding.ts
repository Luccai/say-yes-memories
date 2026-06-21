import { Mp3Encoder } from "@breezystack/lamejs";

const TARGET_SAMPLE_RATE = 44100;
const MP3_KBPS = 64;
const MP3_FRAME_SIZE = 1152;

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function createCompatibleAudioContext() {
  const AudioContextConstructor =
    window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error("Audio recording is not supported in this browser.");
  }

  return new AudioContextConstructor();
}

function flattenFloatChunks(chunks: Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function resampleAudio(samples: Float32Array, inputSampleRate: number) {
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    return samples;
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const result = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const weight = position - left;
    const leftSample = samples[left] ?? 0;
    const rightSample = samples[right] ?? leftSample;

    result[i] = leftSample + (rightSample - leftSample) * weight;
  }

  return result;
}

function floatToInt16(samples: Float32Array) {
  const result = new Int16Array(samples.length);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    result[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return result;
}

function encodeMp3(samples: Float32Array, inputSampleRate: number) {
  const pcm = floatToInt16(resampleAudio(samples, inputSampleRate));
  const encoder = new Mp3Encoder(1, TARGET_SAMPLE_RATE, MP3_KBPS);
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < pcm.length; offset += MP3_FRAME_SIZE) {
    const frame = pcm.subarray(offset, offset + MP3_FRAME_SIZE);
    const encoded = encoder.encodeBuffer(frame);

    if (encoded.length > 0) {
      chunks.push(encoded);
    }
  }

  const flush = encoder.flush();

  if (flush.length > 0) {
    chunks.push(flush);
  }

  return new Blob(chunks.map(uint8ToArrayBuffer), { type: "audio/mpeg" });
}

function uint8ToArrayBuffer(chunk: Uint8Array) {
  const buffer = new ArrayBuffer(chunk.byteLength);
  new Uint8Array(buffer).set(chunk);
  return buffer;
}

export function createMp3BlobFromChunks(chunks: Float32Array[], inputSampleRate: number) {
  return encodeMp3(flattenFloatChunks(chunks), inputSampleRate);
}

function audioBufferToMonoSamples(audioBuffer: AudioBuffer) {
  const samples = new Float32Array(audioBuffer.length);

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);

    for (let i = 0; i < channelData.length; i += 1) {
      samples[i] += (channelData[i] ?? 0) / audioBuffer.numberOfChannels;
    }
  }

  return samples;
}

function decodeAudioData(context: AudioContext, arrayBuffer: ArrayBuffer) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    let settled = false;
    const finish = (buffer: AudioBuffer) => {
      if (!settled) {
        settled = true;
        resolve(buffer);
      }
    };
    const fail = (error: DOMException) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const maybePromise = context.decodeAudioData(arrayBuffer, finish, fail);

    if (maybePromise) {
      maybePromise.then(finish).catch(fail);
    }
  });
}

export function shouldNormalizeAudioFile(file: File) {
  const type = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const name = file.name.toLowerCase();

  return (
    type === "audio/webm" ||
    type === "audio/ogg" ||
    type === "audio/opus" ||
    name.endsWith(".webm") ||
    name.endsWith(".ogg") ||
    name.endsWith(".opus")
  );
}

export async function normalizeAudioFileToMp3(file: File) {
  const context = createCompatibleAudioContext();

  try {
    const audioBuffer = await decodeAudioData(context, await file.arrayBuffer());
    const blob = encodeMp3(audioBufferToMonoSamples(audioBuffer), audioBuffer.sampleRate);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "voice-note";

    return new File([blob], `${baseName}.mp3`, {
      type: "audio/mpeg",
      lastModified: Date.now(),
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}
