import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const ai = new GoogleGenAI({});

async function test() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello",
    });
    console.log("RESPONSE:", response);
    console.log("TEXT:", response.text);
    console.log("IS FUNCTION:", typeof response.text);
  } catch (err) {
    console.error("ERROR:", err);
  }
}

test();
