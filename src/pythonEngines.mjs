import path from "node:path";
import { spawn } from "node:child_process";
import { PYTHON_CMD, learningEnginePath, simulationEnginePath } from "./config.mjs";

export function runLearningEngine(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_CMD, [learningEnginePath], {
      cwd: path.dirname(learningEnginePath),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Learning engine timed out"));
    }, 20000);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(stderr || `Learning engine exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (err) {
        reject(new Error(`Learning engine returned invalid JSON: ${err.message}`));
      }
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}

export function runSimulationModel(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_CMD, [simulationEnginePath], {
      cwd: path.dirname(simulationEnginePath),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Simulation model timed out"));
    }, 20000);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(stderr || `Simulation model exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (err) {
        reject(new Error(`Simulation model returned invalid JSON: ${err.message}`));
      }
    });
    child.stdin.end(JSON.stringify(payload || {}));
  });
}
