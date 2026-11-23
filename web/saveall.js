// Save all (F13): one tap hands every received photo to the share sheet, or downloads them.
// Stub: the behaviour comes in the next commit.
export const DOWNLOAD_GAP = 0;
export const REVOKE_AFTER = 0;
export function saveBatch() { return { ready: [], arriving: 0 }; }
export function createSaveAll() { const handed = new Set(); return { handed, tap: async () => {} }; }
