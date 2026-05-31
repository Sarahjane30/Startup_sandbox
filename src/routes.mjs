import http from "node:http";
import { analyze } from "./companyAnalysis.mjs";
import { analyzeIdeaText } from "./ideaAnalysis.mjs";
import { generateLessonContent } from "./lessonContent.mjs";
import { getProductHuntLaunches } from "./productHunt.mjs";
import { runLearningEngine } from "./pythonEngines.mjs";
import { advanceSimulation, simulateStartup } from "./simulation.mjs";
import { serveStatic } from "./staticServer.mjs";
import { json, safeText } from "./utils.mjs";

export function createAppServer() {
  return http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true, service: "startup-sandbox" });
    }

    if (req.method === "GET" && url.pathname === "/api/analyze") {
      const company = safeText(url.searchParams.get("company"));
      if (!company) return json(res, 400, { error: "Missing ?company= query parameter" });
      const payload = await analyze(company);
      return json(res, 200, payload);
    }

    if (req.method === "GET" && url.pathname === "/api/product-hunt") {
      const payload = await getProductHuntLaunches();
      return json(res, 200, payload);
    }

    if (req.method === "POST" && url.pathname === "/api/analyze-idea") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const idea = safeText(body.idea);
      if (!idea || idea.length < 10) {
        return json(res, 400, { error: "Idea is too short. Add at least 10 characters." });
      }
      const result = await analyzeIdeaText(idea, body);
      return json(res, 200, {
        product: "Startup Sandbox",
        mode: "idea",
        engine: "local-hybrid-startup-ml",
        generatedAt: new Date().toISOString(),
        idea,
        analysis: result
      });
    }

    if (req.method === "POST" && url.pathname === "/api/lesson") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const title = safeText(body.title);
      const desc = safeText(body.desc);
      if (!title) return json(res, 400, { error: "Missing lesson title." });
      const result = await generateLessonContent(`${title} - ${desc}`);
      return json(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/learning") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const action = safeText(body.action) || "analyze";
      if (!["curriculum", "lesson", "submit", "analyze"].includes(action)) {
        return json(res, 400, { error: "Unsupported learning action." });
      }
      if (["lesson", "submit"].includes(action) && !safeText(body.moduleId)) {
        return json(res, 400, { error: "Missing moduleId." });
      }
      const result = await runLearningEngine(body);
      return json(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/simulate") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const founder = body.founder || {};
      const startup = body.startup || { idea: body.idea, stage: body.stage };
      const idea = safeText(startup.idea) || [
        safeText(startup.industry),
        safeText(startup.customerType),
        safeText(startup.productType),
        safeText(startup.businessModel),
        safeText(startup.revenueModel),
        safeText(startup.aiDependency)
      ].filter(Boolean).join(" ");
      if (!idea || idea.length < 10) {
        return json(res, 400, { error: "Add a startup idea or fill in a few startup setup fields first." });
      }
      const result = await simulateStartup(founder, startup);
      return json(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/simulate/decision") {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = JSON.parse(raw || "{}");
      const choiceId = safeText(body.choiceId);
      const allocation = body.allocation && typeof body.allocation === "object" ? body.allocation : null;
      const strategicAnswer = safeText(body.strategicAnswer);
      if (!body.state || (!choiceId && !allocation)) {
        return json(res, 400, { error: "Decision request needs state and an operating budget." });
      }
      const actorDecision = body.actorDecision && typeof body.actorDecision === "object" ? body.actorDecision : null;
      const result = await advanceSimulation(body.state, choiceId, allocation, strategicAnswer, actorDecision);
      return json(res, 200, result);
    }

    return serveStatic(req, res);
  } catch (err) {
    return json(res, 500, { error: err.message || "Internal server error" });
  }
  });
}
