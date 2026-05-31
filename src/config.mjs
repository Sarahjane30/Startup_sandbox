import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

export const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY });
export const rootFile = fileURLToPath(new URL("../server.mjs", import.meta.url));
export const rootDir = path.dirname(rootFile);
export const publicDir = path.join(rootDir, "public");
export const dataDir = path.join(rootDir, "data");
export const ideaDataDir = path.join(rootDir, "ai_model", "data_sets", "data_sets");
export const mlPredictorPath = path.join(rootDir, "ai_model", "data_sets", "training", "predict_startup_ml.py");
export const mlModelPath = path.join(rootDir, "ai_model", "data_sets", "models", "ctgan_xgboost_strict_model.pkl");
export const learningEnginePath = path.join(rootDir, "ai_model", "data_sets", "adaptive_path_engine.py");
export const simulationEnginePath = path.join(rootDir, "ai_model", "data_sets", "simulation_platform.py");

const bundledPythonPath = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");

export const PORT = Number(process.env.PORT || 3000);
export const STRICT_LIVE_DATA = true;
export const PYTHON_CMD = process.env.PYTHON_CMD || (existsSync(bundledPythonPath) ? bundledPythonPath : "python");
export const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);
export const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 4500);
export const LIVE_CACHE_TTL_MS = Number(process.env.LIVE_CACHE_TTL_MS || 10 * 60 * 1000);
export const ANALYSIS_CACHE_TTL_MS = Number(process.env.ANALYSIS_CACHE_TTL_MS || 30 * 60 * 1000);
export const IDEA_CACHE_TTL_MS = Number(process.env.IDEA_CACHE_TTL_MS || 30 * 60 * 1000);
export const IDEA_LIVE_TIMEOUT_MS = Number(process.env.IDEA_LIVE_TIMEOUT_MS || 4500);
export const IDEA_DATASET_MATCH_THRESHOLD = Number(process.env.IDEA_DATASET_MATCH_THRESHOLD || 0.05);
export const GEMINI_IDEA_MODEL = process.env.GEMINI_IDEA_MODEL || "gemini-2.5-flash";
export const HAS_GEMINI_KEY = Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
export const USE_GEMINI_IDEA_FEEDBACK = process.env.USE_GEMINI_IDEA_FEEDBACK === "false"
  ? false
  : HAS_GEMINI_KEY || process.env.USE_GEMINI_IDEA_FEEDBACK === "true";
