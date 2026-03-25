import { loadProjectEnv } from "./runtime/loadProjectEnv.js";

loadProjectEnv();

const { startServer } = await import("./runtime/startServer.js");
await startServer();
