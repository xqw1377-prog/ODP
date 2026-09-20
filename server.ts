/**
 * Vercel Node entry if the dashboard Framework is still "node".
 * Export the request listener only — listen() hangs on LAMBDAS (zero-byte timeout).
 */
import { handleDemoRequest } from "@odp/web";

export default handleDemoRequest;
