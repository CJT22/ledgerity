import { ApiClient } from './client';
import { httpApi } from './httpApi';
import { mockApi } from './mockApi';

export type { ApiClient } from './client';
export { ApiError } from './errors';

/**
 * `npm run dev` / `npm start` → real server (SQLite).
 * `npm run dev:mock`          → in-browser demo data (localStorage), no server needed.
 */
export const api: ApiClient = import.meta.env.MODE === 'mock' ? mockApi : httpApi;
