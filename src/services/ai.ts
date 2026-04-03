import { GoogleGenAI } from "@google/genai";

// Using the key from environment variables (Vite standard)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const getAI = () => {
  if (!GEMINI_API_KEY) {
    throw new Error("Lỗi: Không tìm thấy Gemini API Key (VITE_GEMINI_API_KEY). Vui lòng kiểm tra cấu hình biến môi trường.");
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

// Local Cache for translations to achieve 0s response for repeated words
const translationCache: Record<string, any> = {};

// Helper for Exponential Backoff Retry
const callWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> => {
  try {
    return await fn();
  } catch (e: any) {
    const is429 = e.message?.includes('429') || e.status === 429;
    const is503 = e.message?.includes('503') || e.status === 503;
    
    // TUYỆT ĐỐI KHÔNG RETRY nếu là lỗi 429 (Quota Exceeded)
    if (is429) {
      throw new Error("QUOTA_EXCEEDED");
    }

    if (is503 && retries > 0) {
      console.warn(`AI Busy (503). Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    
    // Friendly error message for users
    if (is503) {
      throw new Error("Hệ thống AI đang tạm thời quá tải. Vui lòng thử lại sau giây lát.");
    }
    throw e;
  }
};

export const generateDistractors = async (word: string, meaning: string, language: string) => {
  return callWithRetry(async () => {
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
  });
};

export const generateExampleSentence = async (word: string, language: string) => {
  return callWithRetry(async () => {
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
  });
};

export const translateWord = async (word: string, language: string, signal?: AbortSignal) => {
  const cacheKey = `en:${word.toLowerCase().trim()}`;
  
  // Check Cache first
  if (translationCache[cacheKey]) {
    return translationCache[cacheKey];
  }

  return callWithRetry(async () => {
    try {
      if (signal?.aborted) throw new Error("Aborted");

      const ai = getAI();

      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview", // Optimized for ultra-low latency
        contents: `Bạn là một từ điển Anh-Việt. Hãy dịch từ sau sang Tiếng Việt. CHỈ trả về duy nhất một mảng JSON chứa 3 đến 5 nghĩa, không thêm bất kỳ văn bản nào khác. Ví dụ: ["sách", "quyển sách"]
        Từ cần dịch: "${word}"`,
      });
      
      // Note: @google/genai doesn't natively support AbortSignal in generateContent yet, 
      // but we can check it before and after the call, or wrap it in a promise that rejects on signal.
      const response = await model;
      
      if (signal?.aborted) throw new Error("Aborted");
      const rawText = response.text;
      
      if (!rawText) throw new Error("API trả về rỗng");
      
      // Cơ chế trích xuất JSON an toàn bằng Regex
      const match = rawText.match(/\[.*\]/s);
      if (!match) throw new Error("Không tìm thấy mảng JSON trong phản hồi của AI");
      
      let translations;
      try {
        translations = JSON.parse(match[0]);
      } catch (parseError) {
        console.error("JSON Parse Error on match:", match[0]);
        throw new Error("Dữ liệu JSON không hợp lệ");
      }
      
      // Return object structure expected by UI
      const result = {
        translations: Array.isArray(translations) ? translations : [],
        type: "",
        pronunciation: "",
        definition: "",
        example: "",
        exampleTranslation: ""
      };
      
      // Save to Cache
      translationCache[cacheKey] = result;
      
      return result;
    } catch (e: any) {
      console.error("Gemini API Error (translateWord):", e);
      // Re-throw to be caught by UI
      throw e;
    }
  });
};

export const analyzePerformance = async (results: any[], language: string) => {
  return callWithRetry(async () => {
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
  });
};
