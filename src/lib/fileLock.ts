// Simple in-process mutex for file operations.
// Prevents concurrent read-modify-write from corrupting JSON files.

const locks = new Map<string, Promise<void>>();

export async function withFileLock<T>(filePath: string, fn: () => Promise<T> | T): Promise<T> {
  // Wait for any existing lock on this file
  while (locks.has(filePath)) {
    await locks.get(filePath);
  }

  let resolve: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  locks.set(filePath, promise);

  try {
    return await fn();
  } finally {
    locks.delete(filePath);
    resolve!();
  }
}
