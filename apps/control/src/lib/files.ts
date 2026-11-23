/** Largest job accepted in the browser; bigger files belong on the SD card. */
export const MAX_JOB_BYTES = 50 * 1024 * 1024;

export async function readJobFile(file: Blob): Promise<string> {
  if (file.size > MAX_JOB_BYTES) throw new Error(`${Math.round(file.size / 1e6)} MB > 50 MB`);
  return file.text();
}
