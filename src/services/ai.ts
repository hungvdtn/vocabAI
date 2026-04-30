import { GoogleGenAI } from "@google/genai";
import enDictRaw from '../data/en_3000.json';
import deDictRaw from '../data/de_3000.json';

// Khắc phục lỗi bọc Module (Default Export)
const enDict = (enDictRaw as any).default || enDictRaw;
const deDict = (deDictRaw as any).default || deDictRaw;

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

// Tra cứu siêu tốc (O(1) Lookup) từ từ điển cục bộ
export const checkLocalDictionary = (word: string, language: string) => {
  console.log("🔍 checkLocalDictionary called with:", word, language);
  // Chọn từ điển và log kiểm tra
  const activeDictionary = language === 'de' ? deDict : enDict;
  console.log("📚 activeDictionary is array:", Array.isArray(activeDictionary), "length:", activeDictionary?.length);

  // Kiểm tra kiểu mảng và tra cứu (Array check & Find)
  if (Array.isArray(activeDictionary)) {
    const searchKey = word.trim().toLowerCase();
    const foundItem = activeDictionary.find(item => item?.word?.trim().toLowerCase() === searchKey);

    if (foundItem?.vietnamese_meaning) {
      console.log(`✅ Đã tìm thấy "${searchKey}" trong Local Dictionary!`);
      return foundItem.vietnamese_meaning.trim(); // Ngắt API ngay lập tức
    }
  } else {
    // Báo cáo nếu file JSON bị đọc sai định dạng
    console.error("❌ activeDictionary không phải là mảng. Kiểu dữ liệu:", typeof activeDictionary, activeDictionary);
  }
  
  return null;
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
  const activeDictionary = language === 'de' ? deDict : enDict;
  const cacheKey = `${language}:${word.toLowerCase().trim()}`;
  
  // 1. Kiểm tra Local Dictionary (O(1))
  const localResult = checkLocalDictionary(word, language);
  if (localResult) {
    const translations = localResult.split(',').map((item: string) => item.trim()).filter((item: string) => item !== '');
    return {
      word: word,
      translations: translations,
      vietnamese_meaning: localResult,
      part_of_speech: "",
      phonetic: "",
      english_definition: "",
      german_definition: "",
      example: "",
      example_vietnamese: "",
      level: "A1",
      topic: "other"
    };
  }

  // 2. Gọi AI nếu không có trong từ điển cục bộ
  return callWithRetry(async () => {
    try {
      if (signal?.aborted) throw new Error("Aborted");

      const ai = getAI(); 
      const langName = language === 'en' ? 'English' : 'German';
      const defKey = language === 'en' ? 'english_definition' : 'german_definition';
      const exKey = language === 'en' ? 'example_english' : 'example_german';

      // KỊCH BẢN ĐÃ ÉP BUỘC TRẢ VỀ TỪ LOẠI, TRÌNH ĐỘ VÀ CHỦ ĐỀ
      const systemInstruction = `You are a professional lexicographer. Return a strictly formatted JSON object for the word in ${langName}. 
DO NOT use markdown wrappers.
Structure:
{
  "word": "exact word",
  "phonetic": "/IPA/",
  "part_of_speech": "noun/verb/adj",
  "vietnamese_meaning": "meanings separated by commas",
  "${defKey}": "definition in ${langName}",
  "${exKey}": "example sentence in ${langName}",
  "example_vietnamese": "Vietnamese translation of example",
  "level": "Assign CEFR level (A1, A2, B1, B2, C1, or C2)",
  "topic": "Assign ONE exact ID: education_and_learning, work_and_business, daily_life, health_and_body, science_and_technology, society_and_culture, nature_and_environment, travel_and_transport, or other"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: `Translate: "${word}"`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });
      
      if (signal?.aborted) throw new Error("Aborted");
      
      const rawText = response.text;
      if (!rawText) throw new Error("API trả về rỗng");
      
      const cleanJsonText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      let resultObj;
      try {
        resultObj = JSON.parse(cleanJsonText);
        resultObj.translations = resultObj.vietnamese_meaning 
          ? resultObj.vietnamese_meaning.split(',').map((s: string) => s.trim()) 
          : [];
      } catch (parseError) {
        throw new Error("Dữ liệu JSON không hợp lệ");
      }
      
      // Xóa bỏ cache cục bộ để luôn ép AI dịch mới trong quá trình sửa lỗi
      return resultObj;

    } catch (e: any) {
      console.error("Gemini API Error (translateWord):", e);
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

// --- HÀM MỚI: SỬ DỤNG SDK CHUẨN CHO ROLEPLAY ---
export const sendRoleplayMessage = async (history: {role: string, text: string}[], systemPrompt: string) => {
  return callWithRetry(async () => {
    const ai = getAI();
    
    const contents = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    // Tối ưu chi phí bằng dòng Flash thế hệ mới nhất, giá rẻ và tốc độ cao
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7
      }
    });

    if (!response.text) throw new Error("Dữ liệu trả về bị rỗng");
    return response.text;
  });
};
