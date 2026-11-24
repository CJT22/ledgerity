export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    readonly issues?: { path: string; message: string }[]
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Fired on window whenever the server is unreachable / reachable again. */
export const SERVER_STATUS_EVENT = 'ledgerity:server-status';
export type ServerStatusDetail = { online: boolean };
