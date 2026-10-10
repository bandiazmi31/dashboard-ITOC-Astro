/** Generic message returned to clients for any unexpected server failure. */
export const GENERIC_SERVER_ERROR = 'Terjadi kesalahan pada server';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Log the real error on the server and return a generic 500 to the client.
 * Raw database messages and stack traces never leave the server.
 */
export function serverError(context: string, err: unknown): Response {
  console.error(`[${context}]`, err);
  return jsonResponse({ error: GENERIC_SERVER_ERROR }, 500);
}
