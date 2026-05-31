import { Type } from "@google/genai";
import { ai } from "./config.mjs";
import { safeText } from "./utils.mjs";

export async function generateLessonContent(topic) {
  const t = safeText(topic);
  if (!t || t.length < 3) throw new Error("Lesson topic is too short");

  const prompt = `You are an expert startup mentor and educator. Teach the topic: "${t}".
Write it like Duolingo meets Paul Graham: short, punchy, practical, with real-world examples.

Return ONLY valid JSON matching this schema:
{
  "keyPoints": ["string", "string", "string", "string"],
  "realWorldExample": "string",
  "commonMistake": "string",
  "proTip": "string",
  "quiz": {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correctIndex": 0,
    "explanation": "string"
  }
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            realWorldExample: { type: Type.STRING },
            commonMistake: { type: Type.STRING },
            proTip: { type: Type.STRING },
            quiz: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
              },
              required: ["question", "options", "correctIndex", "explanation"]
            }
          },
          required: ["keyPoints", "realWorldExample", "commonMistake", "proTip", "quiz"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (err) {
    console.error("Lesson LLM Error:", err);
    throw new Error("Failed to generate lesson content using AI.");
  }
}
