import path from 'path';

/** Where files are kept on the server — since Drive became the store, only a cache (lib/driveStore.js). */
export const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), 'uploads');
