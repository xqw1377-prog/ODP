/**
 * Vercel Node Function. Production is LAMBDAS — export (req, res), do not listen().
 * vercel.json rewrites /:path* → /api?odp_path=:path* so /early-humans still works.
 */
import { handleDemoRequest } from "@odp/web";

export const config = { maxDuration: 30 };

export default handleDemoRequest;
