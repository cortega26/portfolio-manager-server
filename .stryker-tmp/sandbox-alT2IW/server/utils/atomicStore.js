// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

/**
 * Atomically persist data to a file via write -> fsync -> rename -> dir fsync.
 * Ensures either the old or new contents are visible even across crashes.
 * @param {string} filePath absolute path to the final destination file
 * @param {string|Buffer|Uint8Array} data serialized data to persist
 */
export async function atomicWriteFile(filePath, data) {
  const directory = path.dirname(filePath);
  await fsPromises.mkdir(directory, { recursive: true });

  const tempFileName = `.tmp-${path.basename(filePath)}-${randomUUID()}`;
  const tempPath = path.join(directory, tempFileName);

  let fileHandle;
  try {
    fileHandle = await fsPromises.open(tempPath, 'w');
    await fileHandle.writeFile(data);
    await fileHandle.sync();
  } catch (error) {
    try {
      await fsPromises.rm(tempPath, { force: true });
    } catch {
      // Intentionally ignore cleanup errors to avoid masking the root cause.
    }
    throw error;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }

  await fsPromises.rename(tempPath, filePath);

  let directoryHandle;
  try {
    directoryHandle = await fsPromises.open(directory, 'r');
    await directoryHandle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(error.code)) {
      throw error;
    }
  } finally {
    if (directoryHandle) {
      await directoryHandle.close();
    }
  }
}

export default atomicWriteFile;
