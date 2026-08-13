import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

/** Match transcribe.py Hear copy: 8 kHz stereo PCM WAV, discrete L/R. */
export const HEAR_SAMPLE_RATE = 8000;
export const HEAR_CHANNELS = 2;
const HEAR_FFMPEG_TIMEOUT_MS = 60_000;

let ffmpegInstance = null;
let loadPromise = null;
let runChain = Promise.resolve();

async function loadFfmpeg() {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(coreURL, "text/javascript"),
    wasmURL: await toBlobURL(wasmURL, "application/wasm"),
  });
  return ffmpeg;
}

export async function getHearFfmpeg() {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (!loadPromise) {
    loadPromise = loadFfmpeg().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  ffmpegInstance = await loadPromise;
  return ffmpegInstance;
}

function hearFileName(originalName, index) {
  const raw = String(originalName || `file-${index + 1}`).replace(/[/\\]/g, "_");
  const base = raw.replace(/\.[^.]+$/, "") || `file-${index + 1}`;
  return `${base}.wav`;
}

function isWavPcm(bytes) {
  if (!bytes || bytes.byteLength < 44) return false;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const tag = (start, len) =>
    String.fromCharCode(...u8.subarray(start, start + len));
  return tag(0, 4) === "RIFF" && tag(8, 4) === "WAVE";
}

async function transcodeOne(file, index) {
  const ffmpeg = await getHearFfmpeg();
  const inName = `in_${index}.bin`;
  const outName = `out_${index}.wav`;
  await ffmpeg.writeFile(inName, await fetchFile(file));
  let code;
  try {
    code = await ffmpeg.exec(
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", inName,
        "-map", "0:a:0",
        "-ac", String(HEAR_CHANNELS),
        "-ar", String(HEAR_SAMPLE_RATE),
        "-c:a", "pcm_s16le",
        "-f", "wav",
        outName,
      ],
      HEAR_FFMPEG_TIMEOUT_MS,
    );
  } finally {
    try {
      await ffmpeg.deleteFile(inName);
    } catch {
      /* vfs may already be clean */
    }
  }
  if (code !== 0) {
    try {
      await ffmpeg.deleteFile(outName);
    } catch {
      /* ignore */
    }
    throw new Error(
      code === 1
        ? "Hear transcode timed out."
        : "Hear transcode failed in the browser.",
    );
  }
  const data = await ffmpeg.readFile(outName);
  try {
    await ffmpeg.deleteFile(outName);
  } catch {
    /* ignore */
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isWavPcm(bytes)) {
    throw new Error("Hear transcode did not produce a WAV file.");
  }
  return new File([bytes], hearFileName(file.name, index), {
    type: "audio/wav",
  });
}

/** One ffmpeg.wasm instance — serialize transcodes. */
export function transcodeHearCopy(file, index) {
  const run = runChain.then(() => transcodeOne(file, index));
  runChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
