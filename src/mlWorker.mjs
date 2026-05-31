import readline from "node:readline";
import { spawn } from "node:child_process";
import { ML_TIMEOUT_MS, PYTHON_CMD, mlModelPath, mlPredictorPath, rootDir } from "./config.mjs";

let mlWorker = null;
let mlWorkerStderr = "";
const mlPending = [];
export function runStartupModel(payload) {
  const worker = getMlWorker();
  return new Promise((resolve, reject) => {
    const pending = {};
    const timeout = setTimeout(() => {
      const index = mlPending.indexOf(pending);
      if (index >= 0) mlPending.splice(index, 1);
      reject(new Error("Local ML model timed out while searching datasets. Try a shorter idea or disable public context."));
    }, ML_TIMEOUT_MS);

    pending.resolve = (value) => {
      clearTimeout(timeout);
      resolve(value);
    };
    pending.reject = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
    mlPending.push(pending);

    worker.stdin.write(`${JSON.stringify({ ...payload, model_path: mlModelPath })}\n`, (err) => {
      if (!err) return;
      clearTimeout(timeout);
      const index = mlPending.indexOf(pending);
      if (index >= 0) mlPending.splice(index, 1);
      mlWorker = null;
      reject(err);
    });
  });
}

export function stopMlWorker() {
  const worker = mlWorker;
  if (!worker) return Promise.resolve();
  mlWorker = null;
  if (worker.killed || worker.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => resolve();
    const fallback = setTimeout(done, 1500);
    worker.once("close", () => {
      clearTimeout(fallback);
      resolve();
    });
    worker.kill();
  });
}

function getMlWorker() {
  if (mlWorker && !mlWorker.killed) return mlWorker;

  mlWorkerStderr = "";
  mlWorker = spawn(PYTHON_CMD, [mlPredictorPath, "--server"], {
    cwd: rootDir,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const rl = readline.createInterface({ input: mlWorker.stdout });
  rl.on("line", (line) => {
    const pending = mlPending.shift();
    if (!pending) return;
    try {
      const payload = JSON.parse(line);
      if (payload?.error) pending.reject(new Error(payload.error));
      else pending.resolve(payload);
    } catch {
      pending.reject(new Error(`ML worker returned invalid JSON: ${line || mlWorkerStderr}`));
    }
  });

  mlWorker.stderr.on("data", (chunk) => {
    mlWorkerStderr = `${mlWorkerStderr}${chunk}`.slice(-4000);
  });

  const failPending = (message) => {
    while (mlPending.length) {
      mlPending.shift().reject(new Error(message));
    }
  };

  mlWorker.on("error", (err) => {
    failPending(`Could not start ML worker with ${PYTHON_CMD}: ${err.message}`);
    mlWorker = null;
  });

  mlWorker.on("close", (code) => {
    failPending(mlWorkerStderr || `ML worker exited with code ${code}`);
    mlWorker = null;
  });

  return mlWorker;
}

process.on("exit", () => {
  if (mlWorker && !mlWorker.killed) mlWorker.kill();
});
