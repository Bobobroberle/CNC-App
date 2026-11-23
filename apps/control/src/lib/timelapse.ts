/** Grabs the current picture of a video or image element as a JPEG. */
export async function captureFrame(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  maxWidth = 960,
): Promise<Blob | null> {
  const w =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source instanceof HTMLImageElement
        ? source.naturalWidth
        : source.width;
  const h =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source instanceof HTMLImageElement
        ? source.naturalHeight
        : source.height;
  if (!w || !h) return null;
  const scale = Math.min(1, maxWidth / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    } catch {
      // a cross-origin stream without CORS taints the canvas
      resolve(null);
    }
  });
}

/**
 * Collects frames during a job and turns them into a short WebM video: the
 * frames are drawn one after another while a MediaRecorder records the canvas.
 */
export class Timelapse {
  readonly frames: Blob[] = [];

  add(frame: Blob): void {
    this.frames.push(frame);
  }

  get count(): number {
    return this.frames.length;
  }

  async render(fps = 12): Promise<Blob | null> {
    if (this.frames.length === 0 || typeof MediaRecorder === 'undefined') return null;
    const first = await createImageBitmap(this.frames[0]!);
    const canvas = document.createElement('canvas');
    canvas.width = first.width;
    canvas.height = first.height;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(fps);
    const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start();
    for (const frame of this.frames) {
      const bitmap = frame === this.frames[0] ? first : await createImageBitmap(frame);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }
    recorder.stop();
    await stopped;
    return new Blob(chunks, { type: 'video/webm' });
  }
}
