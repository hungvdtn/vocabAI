import { GoogleGenAI } from "@google/genai";

// Using the key from environment variables (Vite standard)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const getAI = () => {
  if (!GEMINI_API_KEY) {
    throw new Error("Lỗi: Không tìm thấy Gemini API Key (VITE_GEMINI_API_KEY). Vui lòng kiểm tra cấu hình biến môi trường.");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

export const generateDistractors = async (word: string, meaning: string, language: string) => {
  try {
    const ai = getAI();
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate 3 incorrect but plausible meanings (distractors) for the ${language} word "${word}" (which means "${meaning}" in Vietnamese). Return only a JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
      },
    });
    const response = await model;
    return JSON.parse(response.text || "[]");
  } catch (e: any) {
    console.error("Gemini API Error (generateDistractors):", e);
    return ["Sai 1", "Sai 2", "Sai 3"];
  }
};

export const generateExampleSentence = async (word: string, language: string) => {
  try {
    const ai = getAI();
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Create a simple example sentence using the ${language} word "${word}". Return only the sentence.`,
    });
    const response = await model;
    return response.text?.trim() || "";
  } catch (e: any) {
    console.error("Gemini API Error (generateExampleSentence):", e);
    return "";
  }
};

export const translateWord = async (word: string, language: string) => {
  try {
    const ai = getAI();
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the ${language} word "${word}". 
      Provide:
      1. A list of 3-5 common Vietnamese meanings.
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
    const text = response.text;
    if (!text) throw new Error("API không trả về nội dung.");
    return JSON.parse(text);
  } catch (e: any) {
    console.error("Gemini API Error (translateWord):", e);
    // Re-throw to be caught by the UI for notification
    throw new Error(e.message || "Lỗi mạng hoặc lỗi hệ thống khi dịch từ.");
  }
};

export const analyzePerformance = async (results: any[], language: string) => {
  try {
    const ai = getAI();
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze these vocabulary learning results for ${language}: ${JSON.stringify(results)}. Provide a personalized, encouraging feedback in Vietnamese. Focus on mistakes and how to improve.`,
    });
    const response = await model;
    return response.text || "Hãy tiếp tục cố gắng nhé!";
  } catch (e: any) {
    console.error("Gemini API Error (analyzePerformance):", e);
    return "Hãy tiếp tục cố gắng nhé!";
  }
};
