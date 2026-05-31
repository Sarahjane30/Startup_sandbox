import { PORT } from "./src/config.mjs";
import { warmMlWorker } from "./src/ideaAnalysis.mjs";
import { createAppServer } from "./src/routes.mjs";

const server = createAppServer();

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing server or run with a different PORT.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`startup-sandbox running at http://localhost:${PORT}`);
  warmMlWorker();
});
