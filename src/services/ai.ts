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

// Local Cache for translations to achieve 0s response for repeated words
const translationCache: Record<string, any> = {};

export const translateWord = async (word: string, language: string) => {
  const cacheKey = `${language}:${word.toLowerCase().trim()}`;
  
  // Check Cache first
  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  try {
    const ai = getAI();
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview", // Optimized for low latency
      contents: `Analyze the ${language} word "${word}". 
      Return ONLY a JSON object. No explanations.
      Keys: translations (array of 3-5 strings), type (string), pronunciation (string), definition (string), example (string), exampleTranslation (string).`,
      config: {
        responseMimeType: "application/json",
      },
    });
    const response = await model;
    const text = response.text;
    if (!text) throw new Error("API không trả về nội dung.");
    
    const result = JSON.parse(text);
    
    // Save to Cache
    translationCache[cacheKey] = result;
    
    return result;
  } catch (e: any) {
    console.error("Gemini API Error (translateWord):", e);
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
