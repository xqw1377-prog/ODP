/**
 * Vercel Node entry (Root Directory = repository root).
 * Vercel captures the demo server via listen(process.env.PORT).
 * Local `npm run dev` still uses packages/web (`tsx src/server.ts`).
 */
import { createDemoServer, listenDemoServer } from "@odp/web";

const server = createDemoServer();
export default listenDemoServer(server);
