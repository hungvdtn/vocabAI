import { GoogleGenAI } from "@google/genai";

// Using the key provided by the user
const GEMINI_API_KEY = "AIzaSyDsjjATfKqO8NGNtf8lTypIHLi6qe8CC7Y";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const generateDistractors = async (word: string, meaning: string, language: string) => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate 3 incorrect but plausible meanings (distractors) for the ${language} word "${word}" (which means "${meaning}" in Vietnamese). Return only a JSON array of strings.`,
    config: {
      responseMimeType: "application/json",
    },
  });
  const response = await model;
  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return ["Sai 1", "Sai 2", "Sai 3"];
  }
};

export const generateExampleSentence = async (word: string, language: string) => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a simple example sentence using the ${language} word "${word}". Return only the sentence.`,
  });
  const response = await model;
  return response.text?.trim() || "";
};

export const translateWord = async (word: string, language: string) => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the ${language} word "${word}". 
    Provide:
    1. A list of 3 common Vietnamese meanings.
    2. The word type (noun, verb, adj, etc.).
    3. The IPA pronunciation.
    4. A simple English definition (A2-B1 level).
    5. A simple example sentence in ${language}.
    6. The Vietnamese translation of that example sentence.
    
    Return ONLY a JSON object with keys: translations (array of strings), type (string), pronunciation (string), definition (string), example (string), exampleTranslation (string).`,
    config: {
      responseMimeType: "application/json",
    },
  });
  const response = await model;
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { translations: [], type: "", pronunciation: "", definition: "", example: "", exampleTranslation: "" };
  }
};

export const analyzePerformance = async (results: any[], language: string) => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze these vocabulary learning results for ${language}: ${JSON.stringify(results)}. Provide a personalized, encouraging feedback in Vietnamese. Focus on mistakes and how to improve.`,
  });
  const response = await model;
  return response.text || "Hãy tiếp tục cố gắng nhé!";
};
