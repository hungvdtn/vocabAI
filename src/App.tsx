import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Languages, 
  PlusCircle,
  ArrowUp,
  Target,
  Menu,
  X,
  Gamepad2, 
  BarChart3, 
  Volume2, 
  Upload, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Trophy,
  RefreshCw,
  Home,
  BrainCircuit,
  Trash2,
  FileText,
  Loader2,
  Mail,
  Search,
  Calendar,
  Clock,
  User as UserIcon,
  Play,
  Edit2,
  Download,
  LogOut,
  ChevronDown,
  BookOpen,
  Mic,
  LayoutGrid,
  GraduationCap,
  Briefcase,
  Coffee,
  HeartPulse,
  Rocket,
  Globe,
  Leaf,
  Plane,
  Shuffle,
  Save,
  CheckSquare,
  AlertCircle
} from 'lucide-react';
import Lottie from 'lottie-react';
import * as mammoth from 'mammoth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  Timestamp,
  getDocs,
  writeBatch,
  doc,
  deleteDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { generateExampleSentence, translateWord } from './services/ai';
import { cn } from './lib/utils';

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import enDictDataRaw from './data/en_3000.json';
import deDictDataRaw from './data/de_3000.json';

type Language = 'en' | 'de';
type View = 'home' | 'topics' | 'input' | 'library' | 'games' | 'report' | 'dictionary' | 'assessment' | 'admin';

// THAY MÃ UID CỦA MÌNH VÀO ĐÂY (Lấy trong mục Authentication trên Firebase)
const ADMIN_UID = "W3paMyFVFjPwxOHuy1w5FFScYzD3";
type GameType = 'flashcards' | 'quiz' | 'matching' | 'writing' | 'fill' | 'roleplay';

interface Vocabulary {
  id?: string;
  word: string;
  meaning: string;
  type?: string;
  part_of_speech?: string;
  pronunciation?: string;
  phonetic?: string;
  definition?: string;
  english_definition?: string;
  german_definition?: string;
  example?: string;
  example_english?: string;
  example_german?: string;
  example_vietnamese?: string;
  article?: string;
  plural?: string;
  synonym?: string; 
  synonyms?: string; 
  topic?: string;
  level?: string;
  language: Language;
  userId: string;
  createdAt: any;
  suggestions?: string[];
}

interface Lesson {
  id?: string;
  title: string;
  wordCount: number;
  userId: string;
  userName: string;
  language: Language;
  createdAt: number;
  lastPracticed?: number;
  practiceCount?: number;
  vocabularies: Vocabulary[];
}

interface GameResult {
  lessonId: string; 
  gameType: GameType;
  score: number;
  total: number;
  timestamp: number;
  language: Language;
  mistakes?: {word: string, userAnswer: string, correctAnswer: string}[];
}

const Confetti = () => {
  const colors = ['bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-yellow-400', 'bg-purple-500', 'bg-pink-500'];
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {[...Array(80)].map((_, i) => {
        const left = Math.random() * 100;
        const animationDuration = 2 + Math.random() * 4;
        const animationDelay = Math.random() * 0.5;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const isCircle = Math.random() > 0.5;
        return (
          <motion.div
            key={i}
            initial={{ y: -50, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: '100vh', x: Math.random() * 300 - 150, rotate: 720, opacity: 0 }}
            transition={{ duration: animationDuration, delay: animationDelay, ease: "easeOut" }}
            className={cn("absolute w-3 h-3 shadow-sm", color, isCircle ? "rounded-full" : "rounded-sm")}
            style={{ left: `${left}%` }}
          />
        );
      })}
    </div>
  );
};

const PRAISE_MESSAGES = {
  en: [
    "Keep up the good work! Tuyệt vời!",
    "Excellent! Bạn đang làm rất tốt!",
    "Outstanding! Cứ thế phát huy nhé!",
    "Impressive! Điểm số nói lên tất cả!",
    "Brilliant! Bạn thực sự là một cao thủ!",
    "Unbelievable! Quá nhanh và quá nguy hiểm!",
    "Perfect! Bạn sắp thông thạo tiếng Anh rồi đấy!"
  ],
  de: [
    "Weiter so! Tuyệt vời!",
    "Ausgezeichnet! Bạn đang làm rất tốt!",
    "Hervorragend! Cứ thế phát huy nhé!",
    "Beeindruckend! Điểm số nói lên tất cả!",
    "Wunderbar! Bạn thực sự là ein cao thủ!",
    "Unglaublich! Quá nhanh và quá nguy hiểm!",
    "Perfekt! Bạn sắp thông thạo tiếng Đức rồi đấy!"
  ]
};

const ENCOURAGEMENT_MESSAGES = {
  en: [
    "Don't give up! Đừng bỏ cuộc!",
    "Keep practicing! Hãy tiếp tục luyện tập nhé!",
    "You can do this! Cố lên, bạn có thể làm được mà!",
    "Every mistake is a lesson! Sai sót là để học hỏi!"
  ],
  de: [
    "Gib nicht auf! Cố gắng lên nhé!",
    "Übe weiter! Đừng bỏ cuộc!",
    "Du schaffst das! Luyện tập thêm chút nữa nhé!",
    "Aus Fehlern lernt man! Sai sót là để học hỏi!"
  ]
};

const getRandomPraise = (lang: Language) => {
  const messages = PRAISE_MESSAGES[lang] || PRAISE_MESSAGES.en;
  return messages[Math.floor(Math.random() * messages.length)];
};

const getRandomEncouragement = (lang: Language) => {
  const messages = ENCOURAGEMENT_MESSAGES[lang] || ENCOURAGEMENT_MESSAGES.en;
  return messages[Math.floor(Math.random() * messages.length)];
};

const playGameSound = (type: 'correct' | 'wrong' | 'success') => {
  let audioSrc = '';
  if (type === 'correct') audioSrc = '/assets/correct.mp3'; 
  else if (type === 'wrong') audioSrc = '/assets/error-3.mp3';
  else if (type === 'success') audioSrc = '/assets/great-success.mp3';
  
  if (audioSrc) {
    const audio = new Audio(audioSrc);
    audio.play().catch(e => console.warn("Audio file missing", e));
  }
};

const handleSpeak = (text: string, lang: Language) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'en' ? 'en-US' : 'de-DE';
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const langPrefix = lang === 'en' ? 'en' : 'de';
    let selectedVoice = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix) && (v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Google')));
    if (!selectedVoice) selectedVoice = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
    if (selectedVoice) utterance.voice = selectedVoice;
  }
  window.speechSynthesis.speak(utterance);
};

const highlightWordInSentence = (sentence: string, targetWord: string) => {
  if (!sentence || !targetWord) return sentence;
  try {
    const escapedWord = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedWord})`, 'gi');
    const parts = sentence.split(regex);
    return parts.map((part, i) => regex.test(part) ? <span key={i} className="text-blue-600 font-bold">{part}</span> : part);
  } catch (e) {
    return sentence;
  }
};

const renderPhonetic = (rawPhonetic?: string) => {
  if (!rawPhonetic) return null;
  let clean = rawPhonetic.trim();
  if (clean.startsWith('[') && clean.endsWith(']')) clean = clean.substring(1, clean.length - 1);
  return `/${clean.replace(/\//g, '')}/`;
};

const isDefSentence = (text?: string) => {
  if (!text) return false;
  const t = text.trim();
  return t.endsWith('.') || t.endsWith('!') || t.endsWith('?');
};

const KNOWN_TOPIC_IDS = ['education_and_learning', 'work_and_business', 'daily_life', 'health_and_body', 'science_and_technology', 'society_and_culture', 'nature_and_environment', 'travel_and_transport', 'other'];
// HỆ THỐNG PHỄU LỌC TỰ ĐỘNG TÍCH HỢP BẢN VÁ TỪ FIREBASE
function useMergedDict(language: Language) {
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  
  useEffect(() => {
    const q = query(collection(db, 'dictionary_overrides'));
    const unsub = onSnapshot(q, (snap) => {
      const res: Record<string, any> = {};
      snap.forEach(doc => { res[doc.id] = doc.data(); });
      setOverrides(res);
    });
    return () => unsub();
  }, []);

  return useMemo(() => {
    const rawData = language === 'en' ? enDictDataRaw : deDictDataRaw;
    return rawData.map((item: any) => {
      const key = `${language}_${item.word.toLowerCase()}`;
      return overrides[key] ? { ...item, ...overrides[key] } : item;
    });
  }, [language, overrides]);
}

const removeAccents = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

const mapSubTopicToMainTopic = (rawTopic?: string) => {
  if (!rawTopic) return 'other';
  const t = removeAccents(rawTopic.toLowerCase());
  if (/(truong|giao duc|hoc|bang cap|nghien cuu|thay|co|sinh vien|mon|ngon ngu|education|school|learn|study|college|university|student|teacher|language|bildung|studium|schule|sprache|unterricht)/i.test(t)) return 'education_and_learning';
  if (/(cong viec|nghe|cong so|kinh doanh|tai chinh|tien|cong ty|van phong|buu chinh|work|business|job|office|finance|money|company|career|beruf|arbeit|buro|wirtschaft|geld|post|firma)/i.test(t)) return 'work_and_business';
  if (/(suc khoe|co the|y te|benh|dinh duong|thuoc|bac si|health|body|medical|medicine|doctor|disease|nutrition|gesundheit|korper|krankheit|arzt)/i.test(t)) return 'health_and_body';
  if (/(khoa hoc|cong nghe|may tinh|internet|phat minh|science|tech|computer|machine|engine|invention|wissenschaft|technik|medien)/i.test(t)) return 'science_and_technology';
  if (/(xa hoi|van hoa|nghe thuat|the thao|giai tri|luat|chinh tri|ton giao|society|culture|art|sport|entertain|law|politic|religion|kunst|politik|gesellschaft|recht)/i.test(t)) return 'society_and_culture';
  if (/(thien nhien|moi truong|dong vat|thuc vat|khi hau|thoi tiet|dia ly|nature|environment|animal|plant|climate|weather|geography|earth|umwelt|tier|pflanze|wetter|klima|natur|geografie)/i.test(t)) return 'nature_and_environment';
  if (/(du lich|giao thong|phuong tien|ky nghi|xe|duong|travel|transport|traffic|tourism|vacation|trip|vehicle|flight|verkehr|reise|tourismus|urlaub)/i.test(t)) return 'travel_and_transport';
  if (/(doi song|hang ngay|gia dinh|thoi gian|do an|thuc|mua sam|nha|cam xuc|mau|vat|quan ao|daily|life|family|time|food|eat|drink|shop|home|house|emotion|color|cloth|general|alltag|mensch|familie|essen|trinken|zeit|allgemein|wohnen|einkaufen|kleidung|gefuhl|farbe)/i.test(t)) return 'daily_life';
  return 'other'; 
};

const getLessonStatus = (lesson: Lesson) => {
  const lastTime = lesson.lastPracticed || lesson.createdAt;
  const daysPassed = (Date.now() - lastTime) / (1000 * 60 * 60 * 24);
  if (daysPassed >= 5) return 'red'; 
  if (daysPassed >= 3) return 'amber'; 
  return 'emerald'; 
}

const RobotAnimation = ({ type }: { type: 'happy' | 'thinking' | 'sad' }) => {
  const lottiePaths = {
    happy: 'https://assets10.lottiefiles.com/packages/lf20_v7rc87p0.json',
    thinking: 'https://assets10.lottiefiles.com/packages/lf20_i9mxcD.json',
    sad: 'https://assets10.lottiefiles.com/packages/lf20_96bovdur.json'
  };
  return <div className="w-48 h-48 mx-auto"><Lottie animationData={null} path={lottiePaths[type]} loop={true} /></div>;
};

const getGameTitle = (type: GameType) => {
  switch(type) {
    case 'flashcards': return 'Flashcards';
    case 'quiz': return 'Trắc nghiệm';
    case 'matching': return 'Nối từ';
    case 'writing': return 'Luyện viết';
    case 'fill': return 'Điền từ';
    case 'roleplay': return 'Giao tiếp AI';
    default: return '';
  }
};
import { useRef, useEffect } from 'react';
import Lottie from 'lottie-react';
import { motion } from 'framer-motion';
import robotHello from './assets/robot_hello.json'; 

// ==========================================
// LINH VẬT AIBTeM BOT (BẢN HOÀN CHỈNH: KÍCH THƯỚC CHUẨN + ĐA CẢM XÚC)
// ==========================================
function AIBTeMBot({ emotion = 'idle', className = "" }: { emotion?: 'idle' | 'happy' | 'sad' | 'loading' | 'search', className?: string }) {
  const lottieRef = useRef<any>(null);

  // 1. CAN THIỆP TỐC ĐỘ (Speed)
  useEffect(() => {
    if (lottieRef.current) {
      if (emotion === 'sad') {
        lottieRef.current.setSpeed(0.4); 
      } else if (emotion === 'happy' || emotion === 'loading') {
        lottieRef.current.setSpeed(1.5); 
      } else {
        lottieRef.current.setSpeed(1); 
      }
    }
  }, [emotion]);

  // 2. CAN THIỆP CHUYỂN ĐỘNG & MÀU SẮC (Framer Motion & CSS Filter)
  let motionProps: any = {};
  let filterStyle = "";

  switch (emotion) {
    case 'happy':
      motionProps = { y: [0, -25, 0], transition: { repeat: Infinity, duration: 0.5, ease: "easeInOut" } };
      filterStyle = "drop-shadow(0px 0px 20px rgba(16, 185, 129, 0.6)) brightness(1.1)"; 
      break;
    
    case 'sad':
      motionProps = { y: 15, rotate: 15, scale: 0.9, transition: { duration: 0.5 } };
      filterStyle = "grayscale(80%) sepia(30%) hue-rotate(-30deg) opacity(80%)"; 
      break;
    
    case 'search':
    case 'loading':
      motionProps = { y: [0, -10, 0], scale: [1, 1.05, 1], transition: { repeat: Infinity, duration: 1.5, ease: "easeInOut" } };
      filterStyle = "drop-shadow(0px 10px 15px rgba(79, 70, 229, 0.3))"; 
      break;
    
    default: 
      motionProps = { y: [0, -5, 0], transition: { repeat: Infinity, duration: 3, ease: "easeInOut" } };
      filterStyle = "drop-shadow(0px 5px 10px rgba(0,0,0,0.1))";
      break;
  }

  // TỐI ƯU KÍCH THƯỚC: Mặc định trên Mobile là w-48, trên PC là w-80
  const finalClass = className || "w-48 h-48 md:w-80 md:h-80";

  return (
    <motion.div 
      className={`relative flex items-center justify-center ${finalClass}`}
      animate={motionProps}
      style={{ filter: filterStyle, transition: 'filter 0.8s ease' }} 
    >
      <Lottie 
        lottieRef={lottieRef}
        animationData={robotHello} 
        loop={true} 
        className="w-full h-full" 
      />
      
      {/* 3. THÊM HIỆU ỨNG TRỰC QUAN BỔ SUNG */}
      {emotion === 'sad' && (
        <span className="absolute -top-2 right-4 md:right-8 text-2xl md:text-4xl opacity-70 animate-pulse">💧</span>
      )}
      {emotion === 'happy' && (
        <span className="absolute -top-4 text-4xl md:text-5xl animate-bounce">✨</span>
      )}
      {emotion === 'loading' && (
        <span className="absolute -top-2 -right-2 md:right-4 flex h-6 w-6 md:h-8 md:w-8">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-6 w-6 md:h-8 md:w-8 bg-indigo-500"></span>
        </span>
      )}
    </motion.div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  // TỰ ĐỘNG LƯU HỒ SƠ NGƯỜI DÙNG KHI ĐĂNG NHẬP
  useEffect(() => {
    if (!user) return;
    // Bóc tách ngày giờ tạo tài khoản gốc từ Firebase Auth
    const joinDate = user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : Date.now();
    
    // Đẩy dữ liệu vào CSDL (dùng merge: true để không làm mất trình độ CEFR cũ nếu đã thi)
    const userRef = doc(db, 'userProfiles', user.uid);
    setDoc(userRef, {
      displayName: user.displayName || 'Học viên ẩn danh',
      email: user.email || 'Chưa cập nhật email',
      createdAt: joinDate,
      lastLoginAt: Date.now()
    }, { merge: true }).catch(e => console.error("Lỗi đồng bộ hồ sơ:", e));
  }, [user]);
  const [view, setView] = useState<View>('home');
  const [language, setLanguage] = useState<Language>('en');
  const [activeGame, setActiveGame] = useState<GameType | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);
  
  // STATE BẢO VỆ BÀI TEST & ĐIỀU HƯỚNG
  const [isTestInProgress, setIsTestInProgress] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavigation = (targetView: View) => {
    if (isTestInProgress) {
      if (!window.confirm("Bạn đang làm bài kiểm tra. Bạn có chắc chắn muốn thoát? Kết quả sẽ bị hủy bỏ.")) return;
      setIsTestInProgress(false);
    }
    setView(targetView);
    setIsMobileMenuOpen(false);
    if (targetView !== 'games') setActiveGame(null);
  };

  const handleLanguageChange = (lang: Language) => {
    if (isTestInProgress) {
      if (!window.confirm("Bạn đang làm bài kiểm tra. Bạn có chắc chắn muốn đổi ngôn ngữ? Kết quả sẽ bị hủy bỏ.")) return;
      setIsTestInProgress(false);
    }
    setLanguage(lang);
    setEditingLesson(null);
    setPlayVocabList([]);
    setActiveLessonId(null);
    setGameResults([]);
  };

  const [vocabList, setVocabList] = useState<Vocabulary[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [playVocabList, setPlayVocabList] = useState<Vocabulary[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [userLevel, setUserLevel] = useState<string | null>(null);

  // ĐỌC TRÌNH ĐỘ TỪ HỒ SƠ FIREBASE
  useEffect(() => {
    if (!user) return; // Đã xóa isTestMode ở đây
    const unsubProfile = onSnapshot(doc(db, 'userProfiles', user.uid), (docSnap) => {
      if (docSnap.exists()) setUserLevel(docSnap.data().cefrLevel || null);
    });
    return () => unsubProfile();
  }, [user]); // Đã xóa isTestMode ở đây

  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);


  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  useEffect(() => {
    const handleFocusIn = (e: any) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) setIsKeyboardOpen(true);
    };
    const handleFocusOut = () => setIsKeyboardOpen(false);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'lessons'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson));
      items.sort((a, b) => b.createdAt - a.createdAt);
      setLessons(items);
    });
    return () => unsubscribe();
  }, [user]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      alert("Lỗi đăng nhập: " + error.message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setIsMenuOpen(false);
      setView('home');
      setIsTestMode(false);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const enterTestMode = () => {
    setIsTestMode(true);
    setUser({ uid: 'test-user-123', displayName: 'Dùng tạm', email: 'test@example.com', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test' } as any);
  };

  useEffect(() => {
    if (!user) return;
    if (isTestMode) return;
    const q = query(collection(db, 'vocabularies'), where('userId', '==', user.uid), where('language', '==', language));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vocabulary)));
    });
    return () => unsubscribe();
  }, [user, language, isTestMode]);

  const deleteLesson = async (lessonId: string) => {
    try {
      await deleteDoc(doc(db, 'lessons', lessonId));
    } catch (error) {
      alert("Không thể xóa bài học.");
    }
  };

 const handleGameComplete = async (res: GameResult) => {
    const newResults = [...gameResults, { ...res, language }];
    setGameResults(newResults);
    
    let isReportNext = false;
    if (activeLessonId) {
       const gamesPlayedOfThisLesson = newResults.filter(r => r.lessonId === activeLessonId).map(r => r.gameType);
       const uniqueGamesPlayed = new Set(gamesPlayedOfThisLesson);
       if (uniqueGamesPlayed.size >= 5) {
          isReportNext = true;
       }
    }

    if (isReportNext) {
       playGameSound('success');
       setView('report');
       setTimeout(() => setActiveGame(null), 300);
    } else {
       setActiveGame(null); 
    }

    if (activeLessonId && !isTestMode) {
      try {
        const lessonRef = doc(db, 'lessons', activeLessonId);
        const currentLesson = lessons.find(l => l.id === activeLessonId);
        await updateDoc(lessonRef, { lastPracticed: Date.now(), practiceCount: (currentLesson?.practiceCount || 0) + 1 });
      } catch (error) {
        console.error("Lỗi cập nhật lịch sử:", error);
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
            <Languages className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Vocab AIBTeM</h1>
          <p className="text-slate-500 mb-8">Nâng tầm vốn từ vựng Tiếng Anh & Đức với sức mạnh AIBTeM.</p>
          <button onClick={login} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3 mb-4">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/pjax/google.png" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
            Đăng nhập với Google
          </button>
          <button onClick={enterTestMode} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3">
            <Gamepad2 size={20} className="text-indigo-600" />
            Không đăng nhập
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 font-sans flex flex-col relative">
      {/* DÁN NÚT BẤM VÀO ĐÂY ĐỂ LUÔN HIỂN THỊ */}
      {/* Nút Xem hướng dẫn nổi ở góc dưới bên phải */}
      <button 
        onClick={() => window.open('https://lamchuaigiaoduc.vn/hoc_tu_vung_vocab/', '_blank')}
        className="fixed bottom-4 md:bottom-6 right-6 md:right-8 z-[9999] bg-blue-400 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 hover:bg-blue-500 transition-all group cursor-pointer border-2 border-white"
        title="Xem hướng dẫn sử dụng"
      >
        <BookOpen size={24} />
        <span className="absolute right-16 bg-slate-800 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl">
          Hướng dẫn sử dụng
        </span>
      </button>
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setActiveGame(null); }}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <Languages className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">Vocab AIBTeM</span>
          </div>
          
          {/* MENU DESKTOP: Đã tối ưu padding, font chữ và icon để gọn gàng, không bị tràn thanh cuộn */}
          <div className="hidden lg:flex items-center gap-1">
            <NavButton active={view === 'topics'} onClick={() => handleNavigation('topics')} icon={<LayoutGrid size={16} />} label="Chủ đề" />
            <NavButton active={view === 'assessment'} onClick={() => handleNavigation('assessment')} icon={<Target size={16} />} label="Đánh giá" />
            <NavButton active={view === 'input'} onClick={() => handleNavigation('input')} icon={<PlusCircle size={16} />} label="Nhập liệu" />
            <NavButton active={view === 'library'} onClick={() => handleNavigation('library')} icon={<FileText size={16} />} label="Thư viện" />
            <NavButton active={view === 'games'} onClick={() => handleNavigation('games')} icon={<Gamepad2 size={16} />} label="Trò chơi" />
            <NavButton active={view === 'report'} onClick={() => handleNavigation('report')} icon={<BarChart3 size={16} />} label="Báo cáo" />
            <NavButton active={view === 'dictionary'} onClick={() => handleNavigation('dictionary')} icon={<BookOpen size={16} />} label="Từ điển" />
            {user?.uid === ADMIN_UID && <NavButton active={view === 'admin'} onClick={() => handleNavigation('admin')} icon={<Save size={16} />} label="Quản trị" />}
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            {/* NÚT NGÔN NGỮ EN/DE */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => handleLanguageChange('en')}
                className={cn("px-2 lg:px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2", language === 'en' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-indigo-600")}
                title="Tiếng Anh"
              >
                <img src="https://flagcdn.com/w20/gb.png" width="20" alt="English" className={cn("rounded-[2px] shadow-sm transition-all", language !== 'en' && "grayscale opacity-50")} />
                <span className="hidden sm:block">EN</span>
              </button>
              <button 
                onClick={() => handleLanguageChange('de')}
                className={cn("px-2 lg:px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2", language === 'de' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-indigo-600")}
                title="Tiếng Đức"
              >
                <img src="https://flagcdn.com/w20/de.png" width="20" alt="Deutsch" className={cn("rounded-[2px] shadow-sm transition-all", language !== 'de' && "grayscale opacity-50")} />
                <span className="hidden sm:block">DE</span>
              </button>
            </div>
            
            {/* MENU TÀI KHOẢN (AVATAR) */}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-2 p-1 pr-2 lg:pr-3 rounded-full hover:bg-slate-100 transition-all border border-slate-200">
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-slate-200" alt="User" />
                <ChevronDown size={14} className={cn("text-slate-400 transition-transform hidden sm:block", isMenuOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-slate-50 mb-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tài khoản</p>
                      <p className="text-sm font-bold text-slate-900 truncate">{user.displayName}</p>
                    </div>
                    {isTestMode ? (
                      <button onClick={() => { login(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors font-medium">
                        <UserIcon size={16} /> Đăng nhập Google
                      </button>
                    ) : (
                      <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium">
                        <LogOut size={16} /> Đăng xuất
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* NÚT HAMBURGER (CHỈ HIỂN THỊ TRÊN ĐIỆN THOẠI/TABLET) */}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              className="lg:hidden w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-slate-200 shrink-0"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* THỰC ĐƠN DỌC DÀNH RIÊNG CHO MOBILE (SỔ XUỐNG KHI BẤM NÚT HAMBURGER) */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: 'auto', opacity: 1 }} 
              exit={{ height: 0, opacity: 0 }} 
              className="lg:hidden bg-white border-t border-slate-100 overflow-hidden shadow-2xl absolute w-full z-40"
            >
              <div className="flex flex-col p-4 gap-2">
                <MobileMenuButton active={view === 'home'} onClick={() => handleNavigation('home')} icon={<Home size={20} />} label="Trang chủ" />
                <MobileMenuButton active={view === 'topics'} onClick={() => handleNavigation('topics')} icon={<LayoutGrid size={20} />} label="Chủ đề" />
                <MobileMenuButton active={view === 'assessment'} onClick={() => handleNavigation('assessment')} icon={<Target size={20} />} label="Đánh giá" />
                <MobileMenuButton active={view === 'input'} onClick={() => handleNavigation('input')} icon={<PlusCircle size={20} />} label="Nhập liệu" />
                <MobileMenuButton active={view === 'library'} onClick={() => handleNavigation('library')} icon={<FileText size={20} />} label="Thư viện" />
                <MobileMenuButton active={view === 'games'} onClick={() => handleNavigation('games')} icon={<Gamepad2 size={20} />} label="Trò chơi" />
                <MobileMenuButton active={view === 'report'} onClick={() => handleNavigation('report')} icon={<BarChart3 size={20} />} label="Báo cáo" />
                <MobileMenuButton active={view === 'dictionary'} onClick={() => handleNavigation('dictionary')} icon={<BookOpen size={20} />} label="Từ điển" />
                {user?.uid === ADMIN_UID && <MobileMenuButton active={view === 'admin'} onClick={() => handleNavigation('admin')} icon={<Save size={20} />} label="Admin" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
      <AnimatePresence>
        {activeGame && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-indigo-600 text-white overflow-hidden w-full">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-1.5 rounded-lg"><Gamepad2 size={18} /></div>
                <span className="font-bold text-sm uppercase tracking-[0.2em]">Đang chơi: {getGameTitle(activeGame)}</span>
              </div>
              <button onClick={() => setActiveGame(null)} className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                <ChevronLeft size={14} /> Thoát
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-28 md:py-8 flex-grow w-full flex flex-col">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div key="home" className="w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <HomeView setView={setView} language={language} user={user} lessons={lessons} />
            </motion.div>
          )}
          {view === 'assessment' && (
            <motion.div key={`assessment-${language}`} className="w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <AssessmentView language={language} user={user} onGoToTopics={() => handleNavigation('topics')} setIsTestInProgress={setIsTestInProgress} />
            </motion.div>
          )}
          {view === 'topics' && (
            <motion.div key={`topics-${language}`} className="w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <TopicLibraryView language={language} lessons={lessons} userLevel={userLevel} onGoToAssessment={() => handleNavigation('assessment')} onOpenInInput={(vocabData, generatedTitle) => {
                  setEditingLesson({ title: generatedTitle, vocabularies: vocabData, language, wordCount: vocabData.length, userId: user.uid, userName: user.displayName || '', createdAt: Date.now() } as Lesson);
                  setView('input');
                }} 
              />
            </motion.div>
          )}
          {view === 'dictionary' && (
            <motion.div key={`dict-${language}`} className="w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <DictionaryView language={language} />
            </motion.div>
          )}
          {view === 'input' && (
            <motion.div key={`input-${language}`} className="w-full" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <InputView language={language} user={user} initialLesson={editingLesson || undefined} onSaved={() => { setEditingLesson(null); setView('library'); }} />
            </motion.div>
          )}
          {view === 'games' && (
            <motion.div key="games" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GamesView 
                vocabList={playVocabList} 
                language={language} 
                onComplete={handleGameComplete} 
                activeGame={activeGame} 
                setActiveGame={setActiveGame} 
                onGoToLibrary={() => setView('library')} 
                onGoToTopics={() => setView('topics')} 
                onGoToInput={() => setView('input')} 
                hasLessons={lessons.some(l => l.language === language)}
                activeLessonId={activeLessonId || ''}
                playSound={playGameSound}
              />
            </motion.div>
          )}
          {view === 'library' && (
            <motion.div key="library" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LibraryView lessons={lessons} language={language} onEdit={(lesson) => { setEditingLesson(lesson); setView('input'); }} onPlay={(lesson) => { setPlayVocabList(lesson.vocabularies); setActiveLessonId(lesson.id || null); setView('games'); }} onDelete={deleteLesson} />
            </motion.div>
          )}
          {view === 'report' && (
            <motion.div key="report" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ReportView 
                results={gameResults} 
                language={language} 
                activeLessonId={activeLessonId || ''} 
                onPlayAIGame={() => { setView('games'); setActiveGame('roleplay'); }}
                onGoToTopics={() => setView('topics')}
              />
            </motion.div>
          )}
          {view === 'admin' && user?.uid === ADMIN_UID && (
            <motion.div key="admin" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AdminDashboardView language={language} />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

    
    </div>
  );
}

// COMPONENT NÚT MENU DESKTOP MỚI
function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap", active ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600")}>
      {icon}{label}
    </button>
  );
}

// COMPONENT NÚT MENU MOBILE DỌC MỚI (To rõ, dễ bấm)
function MobileMenuButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-4 px-4 py-3 rounded-2xl font-bold transition-all w-full", active ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50 hover:text-indigo-600")}>
      {icon}
      <span className="text-base">{label}</span>
    </button>
  );
}

// --- VIEWS ---

function HomeView({ setView, language, user, lessons }: { setView: (v: View) => void, language: Language, user: User, lessons: Lesson[] }) {
  const needsReview = lessons.filter(l => {
    if (l.language !== language) return false;
    const status = getLessonStatus(l);
    return status === 'red' || status === 'amber';
  });

  return (
    <div className="space-y-8 w-full">
      {needsReview.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-orange-50 border border-orange-200 p-6 rounded-[2rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 p-3 rounded-full text-orange-600 shrink-0"><AlertCircle size={28} /></div>
            <div>
              <h3 className="font-bold text-orange-800 text-lg">AIBTeM nhắc nhở ôn tập!</h3>
              <p className="text-orange-600/80">Bạn có <strong className="text-orange-700">{needsReview.length} bài học</strong> đã tới hạn luyện tập lại.</p>
            </div>
          </div>
          <button onClick={() => setView('library')} className="bg-orange-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-700 transition-all shrink-0 shadow-md">
            Tới Thư viện ôn ngay
          </button>
        </motion.div>
      )}

      <div className="bg-indigo-600 rounded-[2.5rem] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
  {/* NỬA BÊN TRÁI: THÔNG ĐIỆP CHÀO MỪNG VÀ HỆ THỐNG NÚT */}
  <div className="relative z-10 max-w-2xl space-y-6 w-full md:w-2/3">
    <h2 className="text-3xl md:text-5xl font-bold leading-tight">
      Chào bạn, {user.displayName}!
    </h2>
    <div className="space-y-2">
      <p className="text-indigo-100 text-lg md:text-xl opacity-95">
        Bạn đã sẵn sàng học từ vựng {language === 'en' ? 'Tiếng Anh' : 'Tiếng Đức'} hôm nay chưa?
      </p>
      <p className="text-indigo-200 text-base md:text-lg italic font-medium">
        "Mỗi ngày một chút nỗ lực sẽ mang lại thành quả lớn!"
      </p>
    </div>

    <div className="flex flex-col sm:flex-row gap-4 pt-4 w-full md:max-w-3xl">
      <button 
        onClick={() => setView('topics')} 
        className="flex-1 bg-white text-indigo-600 px-6 py-4 rounded-2xl font-bold hover:bg-indigo-50 transition-all shadow-lg flex items-center justify-between text-left"
      >
        <span>Khám phá Chủ đề</span> <ChevronRight size={20} />
      </button>
      
      {/* Sử dụng bg-amber-700 để có tông màu trầm và chuyên nghiệp hơn */}
      <button 
        onClick={() => setView('input')} 
        className="flex-1 bg-amber-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-amber-800 transition-all shadow-lg flex items-center justify-between text-left border border-amber-600/20"
      >
        <span>Thêm từ mới</span> <PlusCircle size={20} />
      </button>

      <button 
        onClick={() => setView('assessment')} 
        className="flex-1 bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-between text-left"
      >
        <span>Kiểm tra trình độ</span> <Target size={20} />
      </button>
    </div>
  </div>

  {/* NỬA BÊN PHẢI: LINH VẬT AIBTeM BOT */}
  <div className="w-full md:w-1/3 flex justify-center md:justify-end relative z-10">
    <AIBTeMBot emotion="idle" className="w-48 h-48 md:w-64 md:h-64 lg:w-72 lg:h-72" />
  </div>

  {/* HIỆU ỨNG TRANG TRÍ NỀN */}
  <div className="absolute right-[-5%] bottom-[-10%] opacity-10 rotate-12 pointer-events-none">
    <Languages size={350} />
  </div>
  <div className="absolute top-0 right-0 w-80 h-80 bg-white opacity-5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
</div>

      <div className="grid md:grid-cols-3 gap-6">
        <StatCard title="Bài học cá nhân" value={lessons.filter(l=>l.language === language).length.toString()} color="bg-blue-500" />
        <StatCard title="Từ đã lưu" value={lessons.filter(l=>l.language===language).reduce((acc, l) => acc + l.wordCount, 0).toString()} color="bg-orange-500" />
        <StatCard title="Độ chính xác" value="85%" color="bg-emerald-500" />
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string, value: string, color: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white", color)}>
        <BarChart3 size={24} />
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

// --- ASSESSMENT VIEW (TRẮC NGHIỆM ĐÁNH GIÁ NĂNG LỰC) ---
// --- ASSESSMENT VIEW (TRẮC NGHIỆM ĐÁNH GIÁ NĂNG LỰC) ---
function AssessmentView({ language, user, onGoToTopics, setIsTestInProgress }: { language: Language, user: User, onGoToTopics: () => void, setIsTestInProgress: (status: boolean) => void }) {
  const mergedDict = useMergedDict(language);
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState<Record<string, { correct: number, total: number }>>({});
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  
  // BỘ MÀU SẮC ĐỒNG BỘ CHO CÁC TRÌNH ĐỘ
  const LEVEL_COLORS: Record<string, { bg: string, text: string, border: string, bar: string, fill: string }> = {
    'A1': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-100', fill: 'bg-emerald-500' },
    'A2': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', bar: 'bg-blue-100', fill: 'bg-blue-500' },
    'B1': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-100', fill: 'bg-amber-500' },
    'B2': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', bar: 'bg-orange-100', fill: 'bg-orange-500' },
    'C1': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bar: 'bg-rose-100', fill: 'bg-rose-500' },
    'C2': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', bar: 'bg-purple-100', fill: 'bg-purple-500' },
  };
  const getColor = (lvl: string) => LEVEL_COLORS[lvl] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', bar: 'bg-slate-100', fill: 'bg-slate-500' };

  const generateQuiz = () => {
    const dict = mergedDict;
    const standardLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    let generatedQuestions: any[] = [];
    let initialScores: Record<string, { correct: number, total: number }> = {};

    standardLevels.forEach(lvl => initialScores[lvl] = { correct: 0, total: 0 });

    // Bước 1: Lấy cơ bản 5 câu cho mỗi trình độ (nếu có dữ liệu)
    standardLevels.forEach(lvl => {
      const wordsInLevel = dict.filter(w => w.level?.toUpperCase() === lvl);
      const shuffled = wordsInLevel.sort(() => 0.5 - Math.random()).slice(0, 5);
      shuffled.forEach(w => {
          generatedQuestions.push({ word: w.word, level: lvl, correctMeaning: w.vietnamese_meaning || w.meaning });
      });
    });

    // Bước 2: THUẬT TOÁN BÙ ĐẮP - Nếu thiếu C1, C2 (chưa đủ 30 câu), tự động bốc thêm từ A1-B2 để bù vào cho đủ chuẩn 30
    if (generatedQuestions.length < 30) {
      const remainingWords = dict.filter(w => w.level && standardLevels.includes(w.level.toUpperCase()) && !generatedQuestions.some(q => q.word === w.word));
      const needed = 30 - generatedQuestions.length;
      const extra = remainingWords.sort(() => 0.5 - Math.random()).slice(0, needed);
      extra.forEach(w => {
          generatedQuestions.push({ word: w.word, level: w.level!.toUpperCase(), correctMeaning: w.vietnamese_meaning || w.meaning });
      });
    }

    if (generatedQuestions.length === 0) return alert("Không đủ dữ liệu từ vựng để tạo bài kiểm tra.");

    // Xáo trộn ngẫu nhiên vị trí 30 câu hỏi
    generatedQuestions = generatedQuestions.sort(() => 0.5 - Math.random());

    // Cập nhật lại tổng số câu thực tế cho từng Level và tạo đáp án nhiễu
    const finalQuestions = generatedQuestions.map(q => {
       initialScores[q.level].total += 1;
       let distractors = dict.filter(d => d.word !== q.word && (d.vietnamese_meaning || d.meaning)).sort(() => 0.5 - Math.random()).slice(0, 3).map(d => d.vietnamese_meaning || d.meaning);
      while (distractors.length < 3) { distractors.push("Đáp án phụ " + Math.random().toString(36).substring(7)); }
      return { ...q, options: [q.correctMeaning, ...distractors].sort(() => 0.5 - Math.random()) };
    });

    Object.keys(initialScores).forEach(k => { if (initialScores[k].total === 0) delete initialScores[k]; });

    setScores(initialScores);
    setQuestions(finalQuestions);
    setCurrentIdx(0);
    setSelectedOption(null);
    setPhase('quiz');
    setIsTestInProgress(true);
  };

  const handleAnswer = (option: string) => {
    if (selectedOption) return; 
    setSelectedOption(option);
    
    const currentQ = questions[currentIdx];
    const isCorrect = option === currentQ.correctMeaning;
    
    if (isCorrect) {
      playGameSound('correct');
      setScores(prev => ({
        ...prev,
        [currentQ.level]: { ...prev[currentQ.level], correct: prev[currentQ.level].correct + 1 }
      }));
    } else {
      playGameSound('wrong');
    }

    setTimeout(() => {
      if (currentIdx < questions.length - 1) {
        setCurrentIdx(prev => prev + 1);
        setSelectedOption(null);
      } else {
        setPhase('result');
        setIsTestInProgress(false);
      }
    }, 1000);
  };

  const calculateFinalLevel = () => {
    const evaluatedLevels = Object.keys(scores).sort();
    let finalLevel = 'Pre-A1';
    for (const lvl of evaluatedLevels) {
      const acc = scores[lvl].correct / scores[lvl].total;
      if (acc >= 0.6) { 
        finalLevel = lvl;
      } else {
        break;
      }
    }
    return finalLevel;
  };

  // TỰ ĐỘNG LƯU KẾT QUẢ VÀO HỒ SƠ KHI KẾT THÚC
  useEffect(() => {
    if (phase === 'result' && user && user.uid !== 'test-user-123') {
       const finalLvl = calculateFinalLevel();
       setDoc(doc(db, 'userProfiles', user.uid), { cefrLevel: finalLvl, lastTested: Date.now() }, { merge: true })
         .catch(e => console.error("Lỗi lưu hồ sơ:", e));
    }
  }, [phase]);

  const getRecommendations = (level: string) => {
    switch(level) {
      case 'Pre-A1': return "AIBTeM nhận thấy bạn cần củng cố lại từ vựng cơ bản. Hãy bắt đầu học từ Chủ đề 'Đời sống hàng ngày' và 'Thời gian'.";
      case 'A1': return "Bạn đã nắm được các khái niệm rất cơ bản. Tiếp tục mở rộng vốn từ ở các chủ đề 'Gia đình', 'Du lịch' mức độ A2.";
      case 'A2': return "Nền tảng của bạn khá tốt! Hãy thử thách bản thân bằng các từ vựng B1 thuộc chuyên ngành 'Công sở & Kinh doanh' hoặc 'Sức khỏe'.";
      case 'B1': return "Khả năng ngôn ngữ của bạn đã ở mức giao tiếp độc lập. Để lên B2, hãy tập trung vào các từ diễn đạt trừu tượng thuộc 'Xã hội & Văn hóa'.";
      case 'B2': return "Rất xuất sắc! Vốn từ của bạn hoàn toàn đáp ứng được môi trường học thuật/làm việc. Hãy tìm hiểu thêm các thành ngữ C1 để văn phong tự nhiên hơn.";
      case 'C1': 
      case 'C2': return "Tuyệt vời! Bạn sở hữu lượng từ vựng ở mức chuyên gia/bản xứ. Hãy duy trì thói quen bằng cách giao tiếp Roleplay với AI thường xuyên.";
      default: return "Hãy tiếp tục luyện tập hàng ngày cùng AIBTeM để nâng cao trình độ.";
    }
  };

  if (phase === 'intro') {
    return (
      <div className="w-full pb-32">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2 text-slate-900">Đánh giá Năng lực Từ vựng</h2>
            <p className="text-slate-500 text-lg">Kiểm tra vốn từ của bạn theo Khung tham chiếu CEFR (Từ A1 đến C2).</p>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] w-full p-8 md:p-12 shadow-sm border border-slate-100 flex flex-col items-start justify-start text-left">
          
          <div className="flex items-center gap-6 mb-8">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center shadow-sm rotate-3 shrink-0">
              <Target size={40} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Bạn đang ở cấp độ nào?</h3>
              <p className="text-slate-500 font-medium mt-1">Bài Test 30 câu hỏi sẽ giúp AIBTeM định vị chính xác năng lực của bạn.</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 mb-12">
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(lvl => {
              const c = getColor(lvl);
              return (
                <span key={lvl} className={cn("px-8 py-4 font-black text-xl rounded-2xl border-2 shadow-sm transition-transform hover:scale-105", c.bg, c.text, c.border)}>
                  {lvl}
                </span>
              );
            })}
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 w-full mb-12">
            <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-50">
              <CheckCircle2 className="text-indigo-500 mb-3" size={28} />
              <h4 className="font-bold text-slate-800 mb-2">Trích xuất ngẫu nhiên</h4>
              <p className="text-sm text-slate-500 font-medium">Hệ thống chọn 30 câu hỏi ngẫu nhiên cho mọi cấp độ có trong từ điển.</p>
            </div>
            <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-50">
              <BarChart3 className="text-emerald-500 mb-3" size={28} />
              <h4 className="font-bold text-slate-800 mb-2">Đo lường chính xác</h4>
              <p className="text-sm text-slate-500 font-medium">Bạn cần đạt độ chính xác 60% ở một cấp độ để được công nhận và nâng bậc đánh giá.</p>
            </div>
            <div className="bg-orange-50/50 p-6 rounded-2xl border border-orange-50">
              <BrainCircuit className="text-orange-500 mb-3" size={28} />
              <h4 className="font-bold text-slate-800 mb-2">Lộ trình cá nhân hóa</h4>
              <p className="text-sm text-slate-500 font-medium">Kết quả sẽ được lưu để AIBTeM tự động gắn nhãn ưu tiên bài học cho bạn.</p>
            </div>
          </div>

          <button onClick={generateQuiz} className="bg-indigo-600 text-white px-12 py-5 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 hover:scale-105 active:scale-95 flex items-center gap-3">
            <Play size={24} fill="currentColor" /> Bắt đầu kiểm tra
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'quiz') {
    const currentQ = questions[currentIdx];
    return (
      <div className="w-full pb-32">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2 text-slate-900">Đang làm bài kiểm tra</h2>
            <p className="text-slate-500 text-lg">Vui lòng không tải lại trang để bảo lưu kết quả.</p>
          </div>
          <div className="flex items-center gap-4 bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm">
            <span className="font-bold text-slate-400 uppercase tracking-widest text-sm">Trình độ: <span className="text-indigo-600 text-lg">{currentQ.level}</span></span>
            <div className="w-px h-8 bg-slate-200"></div>
            <span className="font-bold text-slate-400 uppercase tracking-widest text-sm">Câu: <span className="text-slate-800 text-lg">{currentIdx + 1}/{questions.length}</span></span>
          </div>
        </div>
        
        <div className="w-full">
          <div className="flex gap-2 w-full mb-10">
            {questions.map((_, i) => (
              <div key={i} className={cn("h-2 rounded-full transition-all flex-1", i < currentIdx ? "bg-indigo-600" : i === currentIdx ? "bg-indigo-400 animate-pulse" : "bg-slate-200")} />
            ))}
          </div>

          <div className="space-y-6">
            <div className="bg-white p-10 md:p-12 rounded-[2rem] shadow-sm border border-slate-100 text-center">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-4 block">Chọn nghĩa đúng nhất của từ</span>
              <div className="flex items-center justify-center gap-6">
                <h3 className="text-3xl md:text-4xl font-black text-indigo-600 tracking-tight">{currentQ.word}</h3>
                <button onClick={() => handleSpeak(currentQ.word, language)} className="p-4 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 hover:scale-110 transition-all shadow-sm"><Volume2 size={24} /></button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 w-full">
              {currentQ.options.map((opt: string, i: number) => (
                <button key={i} disabled={!!selectedOption} onClick={() => handleAnswer(opt)}
                  className={cn("p-6 rounded-3xl text-left font-bold text-lg transition-all border-2 flex items-center min-h-[100px] shadow-sm w-full", 
                    selectedOption === opt 
                    ? (opt === currentQ.correctMeaning ? "bg-green-50 border-[#009900] text-[#009900]" : "bg-red-50 border-red-500 text-red-600") 
                    : selectedOption && opt === currentQ.correctMeaning 
                      ? "bg-green-50 border-[#009900] text-[#009900]" 
                      : "bg-white border-slate-100 hover:border-indigo-400 hover:bg-indigo-50 hover:-translate-y-1")}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const finalLevel = calculateFinalLevel();
  const maxAvailableLevel = Object.keys(scores).sort().pop() || 'A1';

  return (
    <div className="w-full pb-32">
      <Confetti />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2 text-slate-900">Kết quả Đánh giá</h2>
          <p className="text-slate-500 text-lg">Hồ sơ năng lực của bạn đã được cập nhật thành công!</p>
        </div>
      </div>

      <div className="grid md:grid-cols-12 gap-8 w-full">
        <div className="md:col-span-5 bg-indigo-600 text-white rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center shadow-xl relative overflow-hidden">
          <Trophy size={80} className="mb-6 text-indigo-200" />
          <p className="text-indigo-100 text-lg uppercase tracking-widest font-bold mb-2">Trình độ CEFR của bạn</p>
          <h1 className="text-8xl font-black mb-4 drop-shadow-lg">{finalLevel}</h1>
          <div className="bg-white/20 px-6 py-2 rounded-full text-sm font-bold backdrop-blur-md border border-white/20">
            Mức độ tối đa đo được từ Kho dữ liệu: {maxAvailableLevel}
          </div>
          <div className="absolute -left-10 -bottom-10 opacity-10"><Target size={250} /></div>
        </div>

        <div className="md:col-span-7 bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 flex flex-col justify-center">
          <h3 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3"><BrainCircuit className="text-indigo-600" /> Phân tích Từng cấp độ</h3>
          
          <div className="space-y-5 mb-8">
            {Object.keys(scores).sort().map(lvl => {
              const data = scores[lvl];
              const pct = (data.correct / data.total) * 100;
              const c = getColor(lvl);
              
              return (
                <div key={lvl} className="flex items-center gap-4">
                  <span className={cn("font-bold text-lg w-10", c.text)}>{lvl}</span>
                  <div className={cn("flex-1 h-5 rounded-full overflow-hidden border", c.bar, c.border)}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: "easeOut" }} className={cn("h-full", c.fill)} />
                  </div>
                  <span className="font-bold text-sm text-slate-500 w-12 text-right">{data.correct}/{data.total}</span>
                </div>
              );
            })}
          </div>

          <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
            <h4 className="font-bold text-indigo-800 mb-2 flex items-center gap-2"><LightbulbIcon size={18} /> Khuyến nghị Lộ trình:</h4>
            <p className="text-indigo-700/80 leading-relaxed font-medium">{getRecommendations(finalLevel)}</p>
          </div>
          
          <div className="mt-8">
            <button onClick={onGoToTopics} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]">
              <LayoutGrid size={24} /> Chọn Chủ đề Học ngay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Bổ sung Icon phụ cho phần Khuyến nghị
function LightbulbIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>
    </svg>
  );
}
// --- TRANG QUẢN TRỊ ẨN (ADMIN DASHBOARD) ---
// --- TRANG QUẢN TRỊ ẨN (ADMIN DASHBOARD) ---
// --- TRANG QUẢN TRỊ ẨN (ADMIN DASHBOARD) ---
function AdminDashboardView({ language }: { language: Language }) {
  const [activeTab, setActiveTab] = useState<'dictionary' | 'users'>('dictionary');
  
  // STATE CỦA QUẢN LÝ TỪ ĐIỂN
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // STATE MỚI: Tải danh sách các từ đã sửa để phục vụ Xuất Excel
  const [overridesList, setOverridesList] = useState<any[]>([]);

  // STATE CỦA QUẢN LÝ NGƯỜI DÙNG
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 1. Tải danh sách báo lỗi
  useEffect(() => {
    const q = query(collection(db, 'error_reports'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReports(items.sort((a: any, b: any) => b.createdAt - a.createdAt));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Tải danh sách từ vựng đã được sửa (Overrides)
  useEffect(() => {
    const q = query(collection(db, 'dictionary_overrides'), where('language', '==', language));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOverridesList(snapshot.docs.map(doc => doc.data()));
    });
    return () => unsubscribe();
  }, [language]);

  // 3. Tải danh sách người dùng
  useEffect(() => {
    if (activeTab === 'users') {
      setLoadingUsers(true);
      const q = query(collection(db, 'userProfiles'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAppUsers(usersList.sort((a: any, b: any) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0)));
        setLoadingUsers(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const startEdit = (report: any) => {
    const dict = language === 'en' ? enDictDataRaw : deDictDataRaw;
    const entry = dict.find((item: any) => item.word.toLowerCase() === report.word.toLowerCase());
    setEditingReportId(report.id);
    
    const initialForm = entry || { 
      word: report.word, meaning: report.suggestedMeaning || '', vietnamese_meaning: report.suggestedMeaning || '',
      part_of_speech: '', phonetic: '', english_definition: '', german_definition: '',
      example_english: '', example_german: '', example_vietnamese: '', topic: 'other', level: 'A1' 
    };
    
    if (!initialForm.vietnamese_meaning && initialForm.meaning) {
        initialForm.vietnamese_meaning = initialForm.meaning;
    }
    setEditForm(initialForm);
  };

  const handleResolveAndSave = async () => {
    if (!editingReportId || !editForm) return;
    setIsSaving(true);
    try {
      const overrideRef = doc(db, 'dictionary_overrides', `${language}_${editForm.word.toLowerCase()}`);
      await setDoc(overrideRef, { ...editForm, language: language, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid }, { merge: true });
      await updateDoc(doc(db, 'error_reports', editingReportId), { status: 'resolved', resolvedAt: Date.now(), resolutionNote: 'Đã cập nhật hệ thống' });
      alert("Đã lưu trực tiếp vào Hệ thống Đám mây.");
      setEditForm(null); setEditingReportId(null);
    } catch (error) { alert("Lỗi khi lưu vào CSDL."); } finally { setIsSaving(false); }
  };

  // TÍNH NĂNG MỚI: XÓA BÁO CÁO LỖI (NẾU BÁO SAI)
  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Ngăn chặn việc tự động bấm vào nút Sửa
    if (!window.confirm("Xóa bỏ báo cáo này?")) return;
    try {
      // Đánh dấu là đã bị từ chối/xóa
      await updateDoc(doc(db, 'error_reports', id), { status: 'rejected', resolvedAt: Date.now() });
      if (editingReportId === id) { setEditingReportId(null); setEditForm(null); }
    } catch (error) { alert("Lỗi khi xóa báo cáo!"); }
  };

  // TÍNH NĂNG MỚI: XUẤT EXCEL TỪ VỰNG ĐÃ SỬA ĐỂ CẬP NHẬT FILE JSON
  const handleExportDictData = () => {
    if (overridesList.length === 0) return alert("Chưa có từ vựng nào được sửa trên Đám mây để xuất!");
    
    const headers = ["Thuật ngữ", "Phiên âm", "Loại từ", "Trình độ", "Chủ đề", "Nghĩa Tiếng Việt", "Định nghĩa gốc", "Ví dụ", "Nghĩa ví dụ"];
    const csvRows = overridesList.map(w => {
      const word = w.word ? w.word.replace(/"/g, '""') : '';
      const phonetic = w.phonetic ? w.phonetic.replace(/"/g, '""') : '';
      const partOfSpeech = w.part_of_speech ? w.part_of_speech.replace(/"/g, '""') : '';
      const level = w.level ? w.level.replace(/"/g, '""') : '';
      const topic = w.topic ? w.topic.replace(/"/g, '""') : '';
      const meaning = w.vietnamese_meaning ? w.vietnamese_meaning.replace(/"/g, '""') : '';
      const def = (w.english_definition || w.german_definition || '') ? (w.english_definition || w.german_definition).replace(/"/g, '""') : '';
      const ex = (w.example_english || w.example_german || w.example || '') ? (w.example_english || w.example_german || w.example).replace(/"/g, '""') : '';
      const exVn = w.example_vietnamese ? w.example_vietnamese.replace(/"/g, '""') : '';
      
      return `"${word}","${phonetic}","${partOfSpeech}","${level}","${topic}","${meaning}","${def}","${ex}","${exVn}"`;
    });
    
    const csvContent = "\uFEFF" + headers.join(",") + "\n" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `TuVung_DaSua_${language.toUpperCase()}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // XUẤT EXCEL NGƯỜI DÙNG (Giữ nguyên)
  const handleExportUsersData = () => {
    if (appUsers.length === 0) return alert("Không có dữ liệu để xuất!");
    const headers = ["Tên hiển thị", "Email", "Trình độ CEFR", "Cấp bậc", "Ngày gia nhập", "Lần đăng nhập cuối"];
    const csvRows = appUsers.map(u => {
      const joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'Không rõ';
      const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('vi-VN') : 'Không rõ';
      const role = u.id === auth.currentUser?.uid ? 'Quản trị viên' : 'Học viên';
      const name = u.displayName ? u.displayName.replace(/"/g, '""') : 'Học viên ẩn danh';
      const email = u.email ? u.email.replace(/"/g, '""') : 'Không rõ';
      return `"${name}","${email}","${u.cefrLevel || 'Chưa kiểm tra'}","${role}","${joinDate}","${lastLogin}"`;
    });
    
    const csvContent = "\uFEFF" + headers.join(",") + "\n" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `DanhSachHocVien_AIBTeM_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-600" size={40} /></div>;
  const isEn = language === 'en';

  return (
    <div className="w-full pb-32">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Trung tâm Quản trị AIBTeM</h2>
          <p className="text-slate-500">Quản lý toàn diện hệ thống dữ liệu và hồ sơ người học.</p>
        </div>
        <div className="flex p-1 bg-slate-100 rounded-2xl shrink-0">
          <button onClick={() => setActiveTab('dictionary')} className={cn("px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all", activeTab === 'dictionary' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}><BookOpen size={18} /> Dữ liệu Từ vựng</button>
          <button onClick={() => setActiveTab('users')} className={cn("px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all", activeTab === 'users' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}><UserIcon size={18} /> Hồ sơ Người dùng</button>
        </div>
      </div>

      {activeTab === 'dictionary' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-700 flex items-center gap-2"><AlertCircle size={20} className="text-red-500" /> Cần duyệt ({reports.length})</h3>
              <button onClick={handleExportDictData} className="px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center gap-1 transition-all shadow-sm">
                <Download size={14} /> Xuất file sửa
              </button>
            </div>

            {reports.length === 0 ? (
              <div className="bg-white p-10 rounded-[2rem] border border-dashed text-center text-slate-400">Hệ thống đang sạch sẽ.</div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto pr-2 space-y-4">
                {reports.map(r => (
                  <div key={r.id} onClick={() => startEdit(r)} className={cn("bg-white p-5 rounded-[1.5rem] border shadow-sm hover:shadow-md transition-all cursor-pointer", editingReportId === r.id ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-100")}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-black text-lg">{r.word}</span>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">Nguồn: {r.userName}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => handleDeleteReport(r.id, e)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Xóa bỏ báo cáo"><Trash2 size={16} /></button>
                        <button className={cn("p-2 rounded-lg transition-all", editingReportId === r.id ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:bg-slate-100 hover:text-indigo-600")} title="Chỉnh sửa"><Edit2 size={16} /></button>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm italic text-slate-600 line-clamp-3">"{r.errorText}"</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-xl sticky top-24">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-2 text-indigo-700"><BrainCircuit size={28} /> Chỉnh sửa Từ vựng</h3>
              {editForm ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Thuật ngữ gốc</label><input type="text" value={editForm.word || ''} onChange={e => setEditForm({...editForm, word: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-base font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all" /></div>
                     <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Phiên âm Quốc tế</label><input type="text" value={editForm.phonetic || ''} onChange={e => setEditForm({...editForm, phonetic: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-base font-mono text-slate-600 focus:bg-white focus:border-indigo-500 outline-none transition-all" /></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Loại từ</label><input type="text" value={editForm.part_of_speech || ''} placeholder="n, v, adj, adv..." onChange={e => setEditForm({...editForm, part_of_speech: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-base focus:bg-white focus:border-indigo-500 outline-none transition-all" /></div>
                     <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Trình độ CEFR</label><select value={editForm.level || 'A1'} onChange={e => setEditForm({...editForm, level: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-base font-bold text-indigo-700 outline-none cursor-pointer">{['A1','A2','B1','B2','C1','C2'].map(l => <option key={l} value={l}>{l}</option>)}</select></div>
                     <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nhóm Chủ đề</label><select value={editForm.topic || 'other'} onChange={e => setEditForm({...editForm, topic: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-base outline-none cursor-pointer truncate"><option value="education_and_learning">Giáo dục & Học tập</option><option value="work_and_business">Công sở & Kinh doanh</option><option value="daily_life">Đời sống</option><option value="other">Chủ đề khác</option></select></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-1"><label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest ml-1">Nghĩa tiếng Việt</label><textarea value={editForm.vietnamese_meaning || ''} onChange={e => setEditForm({...editForm, vietnamese_meaning: e.target.value})} className="w-full bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-base font-medium focus:bg-white focus:border-emerald-500 outline-none transition-all min-h-[100px] resize-none" /></div>
                     <div className="space-y-1"><label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest ml-1">Định nghĩa ({language.toUpperCase()})</label><textarea value={isEn ? (editForm.english_definition || '') : (editForm.german_definition || '')} onChange={e => { if (isEn) setEditForm({...editForm, english_definition: e.target.value}); else setEditForm({...editForm, german_definition: e.target.value}); }} className="w-full bg-blue-50 border border-blue-100 rounded-xl p-3 text-base focus:bg-white focus:border-blue-500 outline-none transition-all min-h-[100px] resize-none" /></div>
                  </div>
                  <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-4">
                    <button onClick={() => {setEditForm(null); setEditingReportId(null);}} className="px-6 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Hủy bỏ</button>
                    <button onClick={handleResolveAndSave} disabled={isSaving} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl flex items-center gap-2">{isSaving ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />} Lưu đè lên Hệ thống</button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-500"><div className="w-24 h-24 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4"><Edit2 size={40} /></div><p className="text-lg">Chọn một từ mới cần duyệt ở danh sách bên trái.</p></div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'users' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><UserIcon className="text-indigo-600" /> Danh sách Học viên ({appUsers.length})</h3>
            <button onClick={handleExportUsersData} className="px-5 py-3 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100 flex items-center gap-2 transition-all">
              <Download size={18} /> Xuất file Excel (CSV)
            </button>
          </div>
          
          {loadingUsers ? (
             <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-600" size={32} /></div>
          ) : appUsers.length === 0 ? (
             <div className="py-20 text-center text-slate-500">Chưa có người dùng nào tạo hồ sơ.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                    <th className="p-6 font-bold">Học viên</th>
                    <th className="p-6 font-bold">Trình độ CEFR</th>
                    <th className="p-6 font-bold">Cấp bậc</th>
                    <th className="p-6 font-bold">Lần đăng nhập cuối</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appUsers.map((u, idx) => (
                    <tr key={u.id || idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                            {u.displayName ? u.displayName.charAt(0).toUpperCase() : <UserIcon size={20} />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-base">{u.displayName || 'Học viên ẩn danh'}</p>
                            <p className="text-slate-500 text-sm flex items-center gap-1 mt-1"><Mail size={12} /> {u.email || 'Không rõ'}</p>
                            <p className="text-slate-400 text-xs mt-1">Tham gia: {u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'Không rõ'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        {u.cefrLevel ? <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-100">{u.cefrLevel}</span> : <span className="text-slate-400 italic text-sm">Chưa kiểm tra</span>}
                      </td>
                      <td className="p-6">
                        {u.id === auth.currentUser?.uid ? <span className="px-3 py-1 bg-indigo-600 text-white font-bold rounded-lg text-xs shadow-sm">Quản trị viên</span> : <span className="px-3 py-1 bg-slate-100 text-slate-600 font-medium rounded-lg text-xs">Học viên</span>}
                      </td>
                      <td className="p-6 text-slate-500 text-sm font-medium">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('vi-VN') : 'Không rõ'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
function TopicLibraryView({ language, lessons, userLevel, onGoToAssessment, onOpenInInput }: { language: Language, lessons: Lesson[], userLevel: string | null, onGoToAssessment: () => void, onOpenInInput: (vocab: Vocabulary[], title: string) => void }) {
  const mergedDict = useMergedDict(language); // Kích hoạt phễu lọc

  const currentDict = useMemo(() => {
    return mergedDict.map((w: any) => {
      if (w.topic && KNOWN_TOPIC_IDS.includes(w.topic)) return w;
      return { ...w, topic: mapSubTopicToMainTopic(w.topic) };
    });
  }, [mergedDict]);

  const [selectedTopic, setSelectedTopic] = useState<any | null>(null);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [selectedLevel, setSelectedLevel] = useState<string | 'ALL'>('ALL');

  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => { if (window.scrollY > 300) setShowScrollTop(true); else setShowScrollTop(false); };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const learnedWordsMap = useMemo(() => {
    const map = new Map<string, string>();
    lessons.filter(l => l.language === language).forEach(lesson => {
      lesson.vocabularies.forEach(v => { if (!map.has(v.word)) map.set(v.word, lesson.title); });
    });
    return map;
  }, [lessons, language]);

  const topics = [
    { id: 'education_and_learning', name: 'Giáo dục & Học tập', desc: 'Trường học, bằng cấp, nghiên cứu...', icon: GraduationCap, color: 'bg-blue-500', textCol: 'text-blue-500', bgSoft: 'bg-blue-50' },
    { id: 'work_and_business', name: 'Công sở & Kinh doanh', desc: 'Quản trị, tài chính, cuộc họp...', icon: Briefcase, color: 'bg-indigo-500', textCol: 'text-indigo-500', bgSoft: 'bg-indigo-50' },
    { id: 'daily_life', name: 'Đời sống hàng ngày', desc: 'Gia đình, mua sắm, thời gian, cảm xúc...', icon: Coffee, color: 'bg-orange-500', textCol: 'text-orange-500', bgSoft: 'bg-orange-50' },
    { id: 'health_and_body', name: 'Sức khỏe & Cơ thể', desc: 'Y tế, bệnh lý, dinh dưỡng...', icon: HeartPulse, color: 'bg-rose-500', textCol: 'text-rose-500', bgSoft: 'bg-rose-50' },
    { id: 'science_and_technology', name: 'Khoa học & Công nghệ', desc: 'AI, máy tính, phát minh...', icon: Rocket, color: 'bg-cyan-500', textCol: 'text-cyan-500', bgSoft: 'bg-cyan-50' },
    { id: 'society_and_culture', name: 'Xã hội & Văn hóa', desc: 'Nghệ thuật, luật pháp, chính trị...', icon: Globe, color: 'bg-purple-500', textCol: 'text-purple-500', bgSoft: 'bg-purple-50' },
    { id: 'nature_and_environment', name: 'Thiên nhiên & Môi trường', desc: 'Khí hậu, động vật, địa lý...', icon: Leaf, color: 'bg-emerald-500', textCol: 'text-emerald-500', bgSoft: 'bg-emerald-50' },
    { id: 'travel_and_transport', name: 'Du lịch & Giao thông', desc: 'Giao thông công cộng, kỳ nghỉ...', icon: Plane, color: 'bg-amber-500', textCol: 'text-amber-500', bgSoft: 'bg-amber-50' },
    { id: 'other', name: 'Chủ đề khác', desc: 'Các từ vựng mở rộng chưa phân nhóm cụ thể.', icon: LayoutGrid, color: 'bg-slate-700', textCol: 'text-slate-700', bgSoft: 'bg-slate-100' }
  ];

  const getTopicWords = (topicId: string) => currentDict.filter(w => w.topic === topicId);
  const toggleWordSelection = (word: string) => { const newSet = new Set(selectedWords); if (newSet.has(word)) newSet.delete(word); else newSet.add(word); setSelectedWords(newSet); };

  const formatToVocab = (wordsArray: any[]): Vocabulary[] => wordsArray.map(w => ({ word: w.word, meaning: w.vietnamese_meaning || w.meaning, type: w.part_of_speech, part_of_speech: w.part_of_speech, phonetic: w.phonetic, definition: language === 'en' ? w.english_definition : w.german_definition, english_definition: w.english_definition, german_definition: w.german_definition, example: language === 'en' ? w.example_english : w.example_german, example_english: w.example_english, example_german: w.example_german, example_vietnamese: w.example_vietnamese, article: w.article, plural: w.plural, synonyms: w.synonyms || w.synonym, topic: w.topic, level: w.level, language: language, userId: 'system', createdAt: Date.now() }));

  const generateLessonTitle = (topicName: string, prefix: 'NN' | 'TC', levelStr: string) => {
    const levelSuffix = levelStr === 'ALL' ? '' : ` (${levelStr})`;
    const baseName = `${topicName}${levelSuffix} - ${prefix}`;
    const matchingLessons = lessons.filter(l => l.language === language && l.title.startsWith(baseName));
    let maxSeq = 0;
    matchingLessons.forEach(l => { const match = l.title.match(/(\d+)$/); if (match) { const seq = parseInt(match[1], 10); if (seq > maxSeq) maxSeq = seq; }});
    return `${baseName}${(maxSeq + 1).toString().padStart(2, '0')}`;
  };

  const handleLearnRandom = (topicName: string, wordsToPickFrom: any[], currentLevel: string) => {
    if (wordsToPickFrom.length === 0) return;
    let unlearnedWords = wordsToPickFrom.filter(w => !learnedWordsMap.has(w.word));
    if (unlearnedWords.length === 0) { alert("Bạn đã lưu/học toàn bộ từ vựng trong danh sách này. Hệ thống sẽ bốc lại các từ cũ nhé."); unlearnedWords = wordsToPickFrom; }
    const shuffled = [...unlearnedWords].sort(() => 0.5 - Math.random()).slice(0, 15);
    onOpenInInput(formatToVocab(shuffled), generateLessonTitle(topicName, 'NN', currentLevel));
  };

  const handleLearnSelected = (topicName: string, currentLevel: string) => {
    if (selectedWords.size < 5) return;
    const selectedLearned = Array.from(selectedWords).filter(w => learnedWordsMap.has(w));
    if (selectedLearned.length > 0) {
      const msg = selectedLearned.slice(0, 3).join(', ') + (selectedLearned.length > 3 ? '...' : '');
      const lessonName = learnedWordsMap.get(selectedLearned[0]);
      if(!window.confirm(`Một số từ bạn chọn (${msg}) đã có trong bài "${lessonName}". Bạn vẫn muốn tiếp tục đưa vào bài học mới?`)) return;
    }
    const wordsToLearn = currentDict.filter(w => selectedWords.has(w.word));
    onOpenInInput(formatToVocab(wordsToLearn), generateLessonTitle(topicName, 'TC', currentLevel));
  };

  if (selectedTopic) {
    const allTopicWords = getTopicWords(selectedTopic.id);
    const levelCounts = allTopicWords.reduce((acc, word) => { const lvl = word.level ? word.level.toUpperCase() : 'Chưa rõ'; acc[lvl] = (acc[lvl] || 0) + 1; return acc; }, {} as Record<string, number>);
    const sortedLevels = Object.keys(levelCounts).sort((a, b) => { if (a === 'Chưa rõ') return 1; if (b === 'Chưa rõ') return -1; return a.localeCompare(b); });
    const filteredWords = selectedLevel === 'ALL' ? allTopicWords : allTopicWords.filter(w => (w.level ? w.level.toUpperCase() : 'Chưa rõ') === selectedLevel);

    return (
      <div className="w-full pb-32">
        <button onClick={() => { setSelectedTopic(null); setSelectedWords(new Set()); setSelectedLevel('ALL'); scrollToTop(); }} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold mb-6 transition-colors"><ChevronLeft size={20} /> Quay lại danh sách</button>
        
        <div className={cn("rounded-[2.5rem] p-8 md:p-12 text-white relative overflow-hidden shadow-xl mb-8", selectedTopic.color)}>
          <div className="relative z-10">
            <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm"><selectedTopic.icon size={32} /></div>
            <h2 className="text-3xl font-bold mb-2">{selectedTopic.name}</h2>
            <p className="text-white/80 text-lg mb-6">{selectedTopic.desc}</p>
            
            <div className="flex flex-wrap items-center gap-2 mb-8 bg-black/10 p-2 rounded-2xl border border-white/10 backdrop-blur-md w-fit">
              <span className="text-white/90 font-bold text-sm uppercase tracking-wider ml-2 mr-3 flex items-center gap-2"><BarChart3 size={16}/> Trình độ:</span>
              <button onClick={() => { setSelectedLevel('ALL'); setSelectedWords(new Set()); }} className={cn("px-5 py-2.5 rounded-xl text-sm font-bold transition-all border", selectedLevel === 'ALL' ? "bg-white text-slate-900 border-white shadow-lg scale-105" : "bg-transparent border-transparent text-white/80 hover:bg-white/10 hover:text-white")}>
                Tất cả ({allTopicWords.length})
              </button>
              {sortedLevels.map(lvl => {
                const isRecommended = lvl === userLevel;
                return (
                  <button key={lvl} onClick={() => { setSelectedLevel(lvl); setSelectedWords(new Set()); }} 
                    className={cn("px-5 py-2.5 rounded-xl text-sm font-bold transition-all border relative flex items-center gap-2", 
                      selectedLevel === lvl ? "bg-white text-slate-900 border-white shadow-lg scale-105" : "bg-transparent border-transparent text-white/80 hover:bg-white/10 hover:text-white",
                      isRecommended && selectedLevel !== lvl && "border-emerald-400 bg-emerald-500/20 text-emerald-100")}
                  >
                    {lvl} ({levelCounts[lvl]})
                    {isRecommended && <span className="flex h-2 w-2 relative" title="Trình độ đề xuất cho bạn"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <span className="bg-black/20 px-6 py-3 rounded-xl font-bold backdrop-blur-md">Đang hiển thị: {filteredWords.length} từ</span>
              <span className="bg-white/20 px-6 py-3 rounded-xl font-bold backdrop-blur-md text-emerald-100">Đã lưu: {filteredWords.filter(w => learnedWordsMap.has(w.word)).length} từ</span>
              <button onClick={() => handleLearnRandom(selectedTopic.name, filteredWords, selectedLevel)} disabled={filteredWords.length === 0} className="bg-white text-slate-900 px-8 py-3 rounded-xl font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:hover:scale-100"><Shuffle size={20} className={selectedTopic.textCol} /> Học 15 từ ngẫu nhiên</button>
              <button onClick={() => handleLearnSelected(selectedTopic.name, selectedLevel)} disabled={selectedWords.size < 5} className={cn("px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg", selectedWords.size >= 5 ? "bg-emerald-500 text-white hover:bg-emerald-400 hover:scale-105" : "bg-black/20 text-white/50 cursor-not-allowed")}><CheckSquare size={20} /> Học từ đã chọn ({selectedWords.size})</button>
            </div>
            {selectedWords.size > 0 && selectedWords.size < 5 && <p className="text-sm text-orange-200 mt-3 font-medium">* Vui lòng chọn tối thiểu 5 từ để tạo bài học.</p>}
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-10"><selectedTopic.icon size={300} /></div>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">Danh sách từ vựng {selectedLevel !== 'ALL' && <span className="text-indigo-600">({selectedLevel})</span>}</h3>
            {filteredWords.length > 0 && <span className="text-sm font-medium text-slate-400">Tích vào ô vuông để chọn từ.</span>}
          </div>
          <div className="divide-y divide-slate-50">
            {filteredWords.length > 0 ? filteredWords.map((vocab, idx) => {
              const isLearned = learnedWordsMap.has(vocab.word);
              const lessonName = learnedWordsMap.get(vocab.word);
              return (
                <div key={idx} className={cn("p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group", isLearned && "bg-emerald-50/30")}>
                  <div className="flex flex-1 items-start gap-4 cursor-pointer" onClick={() => toggleWordSelection(vocab.word)}>
                    <input type="checkbox" checked={selectedWords.has(vocab.word)} readOnly className="w-5 h-5 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                    <div>
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className={cn("font-bold text-xl transition-colors", isLearned ? "text-emerald-700" : "text-slate-900 group-hover:text-indigo-600")}>{vocab.article && <span className={cn("font-normal mr-2", vocab.article.toLowerCase() === 'der' ? "text-blue-500" : vocab.article.toLowerCase() === 'die' ? "text-red-500" : "text-green-500")}>{vocab.article}</span>}{vocab.word}</span>
                        {vocab.level && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", vocab.level === userLevel ? "bg-emerald-100 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200")}>{vocab.level.toUpperCase()}</span>}
                        {vocab.phonetic && <span className="text-sm font-mono text-slate-400 ml-1">{renderPhonetic(vocab.phonetic)}</span>}
                      </div>
                      <div className={cn("mb-1", isLearned ? "text-emerald-600/80" : "text-slate-600")}>{vocab.vietnamese_meaning || vocab.meaning}</div>
                      {isLearned && <div className="text-xs font-bold text-emerald-500 flex items-center gap-1 mt-1"><CheckCircle2 size={12} /> Đã lưu trong bài: {lessonName}</div>}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleSpeak(vocab.word, language); }} className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center transition-all ml-4 shrink-0"><Volume2 size={20} /></button>
                </div>
              );
            }) : <div className="p-12 text-center text-slate-400">Không có từ vựng nào ở trình độ này.</div>}
          </div>
        </div>

        <AnimatePresence>
          {showScrollTop && (
            <motion.button 
              initial={{ opacity: 0, y: 20, scale: 0.8 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: 20, scale: 0.8 }} 
              onClick={scrollToTop} 
              className="fixed bottom-20 md:bottom-24 right-6 md:right-8 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-[0_10px_25px_rgba(79,70,229,0.4)] hover:bg-indigo-700 hover:shadow-[0_15px_30px_rgba(79,70,229,0.5)] transition-all z-50 flex items-center justify-center group border-2 border-white hover:-translate-y-1" 
              title="Về đầu trang"
            >
              <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="w-full pb-32 relative">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Thư viện Chủ đề</h2>
        <p className="text-slate-500 text-lg">Học từ vựng theo ngữ cảnh để ghi nhớ sâu hơn.</p>
      </div>

      {!userLevel ? (
        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm relative overflow-hidden">
           <div className="flex items-center gap-4 z-10">
              <div className="w-14 h-14 bg-white text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"><Target size={28} /></div>
              <div>
                <h3 className="font-bold text-indigo-900 text-lg">Bạn chưa đánh giá năng lực!</h3>
                <p className="text-indigo-700/80 font-medium mt-1">Làm bài test nhanh để AIBTeM đề xuất từ vựng phù hợp nhất.</p>
              </div>
           </div>
           <button onClick={onGoToAssessment} className="w-full md:w-auto z-10 bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md">Kiểm tra ngay</button>
           <div className="absolute right-0 bottom-0 opacity-5 -translate-y-4 translate-x-4"><Target size={150} /></div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm relative overflow-hidden">
           <div className="flex items-center gap-4 z-10">
              <div className="w-14 h-14 bg-white text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"><Trophy size={28} /></div>
              <div>
                <h3 className="font-bold text-emerald-900 text-lg">Hồ sơ năng lực: <span className="bg-emerald-600 text-white px-3 py-1 rounded-lg ml-2">{userLevel}</span></h3>
                <p className="text-emerald-700/80 font-medium mt-1">Các từ vựng mức {userLevel} sẽ được gắn dấu <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse mx-1"></span> để bạn dễ theo dõi.</p>
              </div>
           </div>
           <button onClick={onGoToAssessment} className="w-full md:w-auto z-10 bg-white text-emerald-700 border border-emerald-200 px-8 py-4 rounded-2xl font-bold hover:bg-emerald-100 transition-all">Kiểm tra lại</button>
           <div className="absolute right-0 bottom-0 opacity-5 -translate-y-4 translate-x-4"><Trophy size={150} /></div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {topics.map((topic) => {
          const count = getTopicWords(topic.id).length;
          if (topic.id === 'other' && count === 0) return null;
          return (
            <motion.button key={topic.id} whileHover={{ y: -8 }} whileTap={{ scale: 0.98 }} onClick={() => { setSelectedTopic(topic); scrollToTop(); }} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 text-left transition-all hover:shadow-xl group relative overflow-hidden flex flex-col h-full">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", topic.bgSoft, topic.textCol)}><topic.icon size={28} /></div>
              <h3 className="text-xl font-bold mb-2 text-slate-900 group-hover:text-indigo-600 transition-colors">{topic.name}</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-grow">{topic.desc}</p>
              <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-50">
                <span className="text-sm font-bold text-slate-400">{count} từ</span>
                <ChevronRight className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" size={20} />
              </div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
          {showScrollTop && (
            <motion.button 
              initial={{ opacity: 0, y: 20, scale: 0.8 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: 20, scale: 0.8 }} 
              onClick={scrollToTop} 
              className="fixed bottom-20 md:bottom-24 right-6 md:right-8 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-[0_10px_25px_rgba(79,70,229,0.4)] hover:bg-indigo-700 hover:shadow-[0_15px_30px_rgba(79,70,229,0.5)] transition-all z-50 flex items-center justify-center group border-2 border-white hover:-translate-y-1" 
              title="Về đầu trang"
            >
              <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>
    </div>
  );
}

function DictionaryView({ language }: { language: Language }) {
  const mergedDict = useMergedDict(language);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedWord, setSelectedWord] = useState<any | null>(null);
  const [aiTranslation, setAiTranslation] = useState<string[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  
  // STATE MỚI: Theo dõi trạng thái thu âm của Mic
  const [isListening, setIsListening] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => { 
    setSearchTerm(''); 
    setSelectedWord(null); 
    setSuggestions([]); 
    setAiTranslation(null); 
    setSelectedIndex(-1); 
    setIsTranslating(false);
    setIsListening(false);
  }, [language]);

  const handleSearchChange = (text: string) => {
    setSearchTerm(text); 
    setAiTranslation(null); 
    setSelectedIndex(-1); 
    setIsTranslating(false);
    
    if (text.trim() === '') { 
      setSuggestions([]); 
      setSelectedWord(null); 
      return; 
    }
    
    const results = mergedDict.filter((item: any) => 
      item.word && item.word.toLowerCase().startsWith(text.toLowerCase())
    ).slice(0, 8); 
    
    setSuggestions(results); 
    setSelectedWord(null); 
  };

  const handleSelectWord = (wordObj: any) => { 
    setSelectedWord(wordObj); 
    setSearchTerm(wordObj.word); 
    setSuggestions([]); 
    setAiTranslation(null); 
    setSelectedIndex(-1); 
    setIsTranslating(false);
  };

  const handleAITranslate = async () => {
    if (!searchTerm.trim()) return;
    setIsTranslating(true);
    setSuggestions([]); 
    
    try {
      const data = await translateWord(searchTerm, language, new AbortController().signal);
      let meaningArray: string[] = [];
      if (data && Array.isArray(data.translations)) meaningArray = data.translations;
      else if (typeof data === 'string' && data.trim() !== '') meaningArray = data.split(',').map((s:string) => s.trim()).filter((s:string) => s !== '');
      
      setAiTranslation(meaningArray);

      if (meaningArray.length > 0) {
        addDoc(collection(db, 'error_reports'), {
          word: searchTerm.toLowerCase().trim(),
          language: language,
          errorText: "🌟 TỪ MỚI (Từ điển tự động bắt)",
          userId: auth.currentUser?.uid || 'unknown',
          userName: auth.currentUser?.displayName || 'Hệ thống tự động',
          status: 'pending',
          createdAt: Date.now(),
          suggestedMeaning: meaningArray.join(', ')
        }).catch(e => console.error("Lỗi thu thập ngầm:", e));
      }
    } catch (error) { 
      setAiTranslation(["Lỗi kết nối AIBTeM. Vui lòng thử lại sau."]); 
    } finally { 
      setIsTranslating(false); 
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
      } 
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
      } 
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSelectWord(suggestions[selectedIndex]);
        } else if (suggestions.length > 0) {
          handleSelectWord(suggestions[0]);
        }
      }
    } else if (e.key === 'Enter' && searchTerm.trim() !== '') {
      const exactMatch = mergedDict.find((item: any) => item.word && item.word.toLowerCase() === searchTerm.toLowerCase().trim());
      if (exactMatch) {
        handleSelectWord(exactMatch);
      } else {
        handleAITranslate();
      }
    }
  };

  // LOGIC ĐÃ ĐƯỢC SỬA CHỮA CHO MIC
  const startVoiceSearch = () => {
    if (isListening) return; // Ngăn người dùng bấm nhiều lần khi mic đang mở

    // Đã sửa 'webkitRecognition' thành 'webkitSpeechRecognition' để hỗ trợ Mobile/Safari
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Trình duyệt hoặc thiết bị của bạn không hỗ trợ tính năng nhận diện giọng nói. Vui lòng thử lại trên Google Chrome hoặc Safari mới nhất.");
      return;
    }

    try {
      const recognition = new SpeechRecognition(); 
      recognition.lang = language === 'en' ? 'en-US' : 'de-DE';
      recognition.interimResults = false;
      
      // Khi bắt đầu bật mic thành công
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      // Khi có kết quả trả về
      recognition.onresult = (event: any) => { 
        const transcript = event.results[0][0].transcript; 
        handleSearchChange(transcript); 
      };

      // Xử lý lỗi (ví dụ: người dùng từ chối cấp quyền)
      recognition.onerror = (event: any) => {
        console.error("Lỗi mic:", event.error);
        setIsListening(false);
      };

      // Khi kết thúc thu âm
      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) { 
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSuggestions([]); 
        setSelectedIndex(-1);
      } 
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="w-full pb-32">
      <div className="text-center space-y-4 mb-8 mt-4">
        <h2 className="text-3xl font-black text-indigo-700">Từ điển {language === 'en' ? 'Anh - Việt' : 'Đức - Việt'}</h2>
      </div>
      
      <div className="relative w-full" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
          
          <input 
            type="text" 
            placeholder={isTranslating ? "" : isListening ? "Đang lắng nghe..." : "Nhập từ vựng cần tra..."} 
            value={searchTerm} 
            onChange={(e) => handleSearchChange(e.target.value)} 
            onKeyDown={handleKeyDown} 
            className="w-full bg-white border-2 border-slate-200 rounded-[2rem] pl-16 pr-16 py-4 text-xl font-medium focus:border-indigo-500 outline-none transition-all shadow-sm" 
          />

          <AnimatePresence>
            {isTranslating && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="absolute left-16 top-1/2 -translate-y-1/2 bg-white pointer-events-none"
              >
                <span className="text-indigo-600 font-bold animate-pulse italic">AIBTeM đang dịch …..</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* NÚT MIC ĐÃ CẬP NHẬT MÀU SẮC VÀ HIỆU ỨNG NHẤP NHÁY ĐỎ */}
          <button 
            onClick={startVoiceSearch} 
            disabled={isTranslating}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 transition-all p-3 rounded-full flex items-center justify-center",
              isListening 
                ? "bg-red-100 text-red-600 animate-pulse shadow-md scale-105" 
                : "bg-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 hover:shadow-sm"
            )}
          >
            <Mic size={20} />
          </button>
        </div>

        <AnimatePresence>
          {suggestions.length > 0 && !selectedWord && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
              {suggestions.map((item, idx) => (
                <div 
                  key={idx} 
                  onMouseDown={(e) => { e.preventDefault(); handleSelectWord(item); }}
                  onMouseEnter={() => setSelectedIndex(idx)} 
                  className={cn(
                    "px-6 py-4 cursor-pointer border-b border-slate-100 last:border-none flex items-center justify-between transition-all", 
                    selectedIndex === idx ? "bg-indigo-50 text-indigo-800" : "hover:bg-slate-50 text-slate-800 bg-white"
                  )}
                >
                  <span className={cn("text-lg font-bold", selectedIndex === idx ? "text-indigo-800" : "text-slate-800")}>{item.word}</span>
                  <span className={cn("truncate ml-4 max-w-xs text-sm", selectedIndex === idx ? "text-indigo-600" : "text-slate-500")}>
                    {item.vietnamese_meaning || item.meaning}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedWord && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full mt-6 bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-[2rem]">
          <div className="mb-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl text-blue-700 font-bold">
              {selectedWord.article && <span className={cn("font-normal mr-2", selectedWord.article.toLowerCase() === 'der' ? "text-blue-500" : selectedWord.article.toLowerCase() === 'die' ? "text-red-500" : "text-green-600")}>{selectedWord.article}</span>}
              {selectedWord.word}
            </span>
            {selectedWord.part_of_speech && <span className="text-xl text-slate-500 font-medium">({selectedWord.part_of_speech})</span>}
          </div>
          {selectedWord.phonetic && (
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => handleSpeak(selectedWord.word, language)} className="text-indigo-600 hover:scale-110 transition-transform"><Volume2 size={22} /></button>
              <span className="font-mono text-slate-600 text-lg">{renderPhonetic(selectedWord.phonetic)}</span>
            </div>
          )}
          <div className="mb-4">
            <div className="text-emerald-700 mb-8 text-xl font-bold"><span className="text-emerald-600 mr-2">Nghĩa:</span>{selectedWord.vietnamese_meaning || selectedWord.meaning}</div>
            {(language === 'en' ? selectedWord.english_definition : selectedWord.german_definition) && (
              <div className="text-slate-800 mb-1 text-lg font-medium">
                <span className="font-bold text-slate-500 mr-2">Định nghĩa:</span> 
                {language === 'en' ? selectedWord.english_definition : selectedWord.german_definition}
              </div>
            )}
          </div>
          {(selectedWord.example_english || selectedWord.example_german || selectedWord.example) && (
            <div className="mt-4 border-t border-slate-100 pt-6">
              <div className="flex items-start gap-3 mb-2">
                <button onClick={() => handleSpeak(selectedWord.example_english || selectedWord.example_german || selectedWord.example, language)} className="text-slate-400 hover:text-indigo-600 mt-1 transition-colors"><Volume2 size={20} /></button>
                <span className="text-slate-800 text-lg leading-relaxed italic">
                  {highlightWordInSentence(selectedWord.example_english || selectedWord.example_german || selectedWord.example, selectedWord.word)}
                </span>
              </div>
              {selectedWord.example_vietnamese && <div className="ml-8 text-slate-500 text-lg">{selectedWord.example_vietnamese}</div>}
            </div>
          )}
        </motion.div>
      )}

      {!selectedWord && !isTranslating && !aiTranslation && (
        <div className="w-full mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-white p-8 md:p-12 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="space-y-4">
            <h3 className="text-2xl font-black text-indigo-700 mb-2">AIBTeM Dictionary</h3>
            <div className="space-y-3 text-slate-600 text-sm md:text-base leading-relaxed">
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Từ điển trực tuyến miễn phí;</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Tra cứu nhanh;</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Kho từ đồ sộ, gợi ý thông minh;</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Nghe được phát âm;</p>
            </div>
          </div>
          <div className="flex justify-center">
            <AIBTeMBot emotion="idle" className="w-56 h-56 md:w-72 md:h-72" />
          </div>
        </div>
      )}

      {(isTranslating || aiTranslation) && !selectedWord && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full mt-6 bg-white p-12 border border-slate-200 shadow-sm text-center rounded-[2rem]">
          {!aiTranslation ? (
            <div className="flex flex-col items-center">
              <div className="relative mb-6">
                <div className="bg-indigo-50 border-2 border-indigo-100 p-6 rounded-[2rem] shadow-sm relative z-10">
                  <p className="text-indigo-700 font-bold italic text-lg md:text-xl">
                    AIBTeM đang dịch, bạn vui lòng đợi chút xíu nhé!
                  </p>
                </div>
                <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[15px] border-t-indigo-100 z-0"></div>
              </div>
              <AIBTeMBot emotion="loading" className="w-64 h-64 md:w-80 md:h-80 mx-auto" />
            </div>
          ) : (
            <div className="text-left">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2 mb-2"><BrainCircuit size={16} /> Kết quả từ AIBTeM</h4>
                  <h3 className="text-4xl font-bold text-slate-900">{searchTerm}</h3>
                </div>
                <button onClick={() => handleSpeak(searchTerm, language)} className="w-14 h-14 shrink-0 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all"><Volume2 size={24} /></button>
              </div>
              <div className="flex flex-wrap gap-3">
                {aiTranslation.map((meaning, idx) => (
                  <span key={idx} className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl font-bold text-xl">{meaning}</span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function LibraryView({ lessons, language, onEdit, onPlay, onDelete }: { lessons: Lesson[], language: Language, onEdit: (l: Lesson) => void, onPlay: (l: Lesson) => void, onDelete: (id: string) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDownloadLesson = (lesson: Lesson) => {
    const textData = lesson.vocabularies.map(v => `${v.word} - ${v.meaning}`).join('\n');
    const blob = new Blob([textData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${lesson.title || 'bai-hoc'}.txt`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const filteredLessons = lessons.filter(l => l.language === language && l.title.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Thư viện của bạn</h2>
          <p className="text-slate-500">Quản lý và ôn tập các bài học đã lưu.</p>
        </div>
        <div className="relative max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input type="text" placeholder="Tìm kiếm bài học..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm" />
        </div>
      </div>

      <div className="grid gap-4">
        {filteredLessons.length > 0 ? (
          filteredLessons.map((lesson) => {
            const status = getLessonStatus(lesson);
            const cardClass = cn("p-6 rounded-3xl border shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group", status === 'red' ? "bg-red-50/30 border-red-200" : status === 'amber' ? "bg-amber-50/30 border-amber-200" : "bg-emerald-50/30 border-emerald-200");
            const iconClass = cn("w-16 h-16 rounded-2xl flex items-center justify-center shrink-0", status === 'red' ? "bg-red-100 text-red-600" : status === 'amber' ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600");

            return (
              <motion.div key={lesson.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cardClass}>
                <div className="flex items-center gap-6">
                  <div className={iconClass}><FileText size={32} /></div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={cn("text-xl font-bold transition-colors", status === 'red' ? "text-red-900 group-hover:text-red-600" : status === 'amber' ? "text-amber-900 group-hover:text-amber-600" : "text-slate-900 group-hover:text-emerald-600")}>{lesson.title}</h3>
                      {status === 'red' ? <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600 px-2 py-1 rounded-lg">Cần ôn ngay</span> : status === 'amber' ? <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-600 px-2 py-1 rounded-lg">Đã tới hạn ôn</span> : <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-600 px-2 py-1 rounded-lg">Đang nhớ tốt</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <div className="flex items-center gap-1"><Gamepad2 size={14} /><span>{lesson.wordCount} thuật ngữ</span></div>
                      {lesson.practiceCount !== undefined && lesson.practiceCount > 0 && <div className="flex items-center gap-1 text-indigo-600 font-medium"><Trophy size={14} /><span>Đã học {lesson.practiceCount} lần</span></div>}
                      <div className="flex items-center gap-1"><Calendar size={14} /><span>{new Date(lesson.createdAt).toLocaleDateString('vi-VN')}</span></div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => onPlay(lesson)} className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-sm"><Play size={18} fill="currentColor" /> Chơi</button>
                  <button onClick={() => handleDownloadLesson(lesson)} className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2" title="Tải xuống (.txt)"><Download size={18} /></button>
                  <button onClick={() => onEdit(lesson)} className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2" title="Sửa"><Edit2 size={18} /></button>
                  <button onClick={() => setDeletingId(lesson.id || null)} className="flex-1 md:flex-none bg-red-50 text-red-600 px-4 py-3 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2" title="Xóa"><Trash2 size={18} /></button>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300"><Search size={40} /></div>
            <h3 className="text-xl font-bold text-slate-400">Không tìm thấy bài học nào</h3>
            <p className="text-slate-500">Hãy thử tìm kiếm với từ khóa khác hoặc tạo bài học mới.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeletingId(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-hidden text-center">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6"><Trash2 size={40} /></div>
              <h3 className="text-2xl font-bold mb-2">Xóa bài học?</h3>
              <p className="text-slate-500 mb-8">Bạn có chắc chắn muốn xóa toàn bộ bài học? Hành động này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeletingId(null)} className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Hủy</button>
                <button onClick={() => { if (deletingId) onDelete(deletingId); setDeletingId(null); }} className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg">Xác nhận xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InputView({ language, user, onSaved, initialLesson }: { language: Language, user: User, onSaved: () => void, initialLesson?: Lesson }) {
  const [rows, setRows] = useState<any[]>(initialLesson ? initialLesson.vocabularies.map(v => ({ ...v, loading: false, suggestions: v.suggestions || [] })) : [{ word: '', meaning: '', loading: false, suggestions: [] }]);
  const [lessonTitle, setLessonTitle] = useState(initialLesson?.title || '');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const [wordSuggestions, setWordSuggestions] = useState<any[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const [activeMeaningIndex, setActiveMeaningIndex] = useState<number | null>(null);
  const [selectedMeaningSuggestionIndex, setSelectedMeaningSuggestionIndex] = useState(-1);

  const translationCache = useRef<Record<string, any>>({});
  const abortControllers = useRef<Record<number, AbortController>>({});
  const lastTranslatedWords = useRef<Record<number, string>>({});

  const cleanInputData = (text: string, isFinal: boolean = false) => {
    if (!text) return '';
    let cleaned = text.replace(/^[\u2022\u2023\u25E6\u2043\u2219\u2000-\u206F\u2E00-\u2E7F\u25A0-\u25FF\uF000-\uF0FF\-\+\*•]+/g, '');
    if (isFinal) cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  };

  const addRow = () => setRows([...rows, { word: '', meaning: '', loading: false, suggestions: [] }]);
  const addRowAtIndex = (index: number) => { const newRows = [...rows]; newRows.splice(index + 1, 0, { word: '', meaning: '', loading: false, suggestions: [] }); setRows(newRows); };
  const removeRow = (index: number) => { if (rows.length <= 1 && !initialLesson) { setRows([{ word: '', meaning: '', loading: false, suggestions: [] }]); return; } setRows(rows.filter((_, i) => i !== index)); };

  const updateRow = (index: number, field: 'word' | 'meaning', value: string) => {
    const cleanedValue = field === 'word' ? cleanInputData(value, false) : value;
    setRows(prevRows => {
      const newRows = [...prevRows];
      newRows[index] = { ...newRows[index], [field]: cleanedValue };
      if (field === 'word' && cleanedValue === '') { 
        newRows[index].meaning = ''; 
        newRows[index].loading = false; 
        newRows[index].suggestions = []; 
        if (abortControllers.current[index]) abortControllers.current[index].abort(); 
      }
      return newRows;
    });
  };

  const handleWordChange = (index: number, value: string) => {
    updateRow(index, 'word', value);
    const cleanVal = cleanInputData(value, false);
    if (cleanVal.trim().length >= 1) {
      const currentDict = language === 'en' ? enDictDataRaw : deDictDataRaw;
      const results = currentDict
        .filter(item => item.word && item.word.toLowerCase().startsWith(cleanVal.toLowerCase()))
        .slice(0, 5);
      setWordSuggestions(results);
      setActiveWordIndex(index);
      setSelectedSuggestionIndex(-1);
    } else {
      setWordSuggestions([]);
      setActiveWordIndex(null);
    }
  };

  const handleSelectWordSuggestion = (index: number, wordStr: string) => {
    updateRow(index, 'word', wordStr);
    setWordSuggestions([]);
    setActiveWordIndex(null);
    setSelectedSuggestionIndex(-1);
    handleAutoTranslate(index, language, wordStr);
  };

  const handleSelectSuggestion = (index: number, selectedText: string) => {
    setRows(prevRows => {
      const newRows = [...prevRows];
      if (newRows[index]) {
        const currentDef = newRows[index].meaning || '';
        newRows[index].meaning = currentDef === '' || currentDef.endsWith(', ') ? currentDef + selectedText : currentDef + ', ' + selectedText;
      }
      return newRows;
    });
    setSelectedMeaningSuggestionIndex(-1);
  };

  const handleAutoTranslate = async (index: number, currentLanguage: Language, overrideWord?: string) => {
    const currentRow = rows[index];
    if (!currentRow) return;
    const term = overrideWord || currentRow.word.trim();
    const definition = currentRow.meaning.trim();
    
    if (term === '' || (definition !== '' && !overrideWord) || lastTranslatedWords.current[index] === term) return;
    const word = cleanInputData(term, true);
    if (!word) return;

    const currentDict = currentLanguage === 'en' ? enDictDataRaw : deDictDataRaw;
    const localEntry = currentDict.find((item: any) => item.word.toLowerCase() === word.toLowerCase());
    
    if (localEntry) {
      const meaningStr = localEntry.vietnamese_meaning || localEntry.meaning || '';
      const meaningArray = meaningStr.split(/[,;]/).map((s: string) => s.trim()).filter((s: string) => s !== '');
      
      lastTranslatedWords.current[index] = term;
      setRows(prev => {
        const upd = [...prev];
        if (upd[index]) upd[index] = { ...upd[index], suggestions: meaningArray, loading: false };
        return upd;
      });
      return; 
    }

    if (translationCache.current[word]) {
      lastTranslatedWords.current[index] = term; 
      setRows(prev => { const upd = [...prev]; if (upd[index]) upd[index] = { ...upd[index], suggestions: translationCache.current[word].translations }; return upd; });
      return;
    }

    if (abortControllers.current[index]) abortControllers.current[index].abort();
    abortControllers.current[index] = new AbortController();
    setRows(prev => { const upd = [...prev]; if (upd[index]) upd[index] = { ...upd[index], loading: true }; return upd; });

    try {
      const data = await translateWord(word, currentLanguage, abortControllers.current[index].signal);
      let meaningArray: string[] = [];
      if (data && Array.isArray(data.translations)) meaningArray = data.translations;
      else if (typeof data === 'string' && data.trim() !== '') meaningArray = data.split(',').map(s => s.trim()).filter(s => s !== '');
      
      translationCache.current[word] = data;
      lastTranslatedWords.current[index] = term; 
      setRows(prev => { const newRows = [...prev]; if (newRows[index]) newRows[index] = { ...newRows[index], suggestions: meaningArray, loading: false }; return newRows; });

      // TÍNH NĂNG TỰ ĐỘNG THU THẬP NGẦM (Gửi về Admin)
      if (meaningArray.length > 0) {
        addDoc(collection(db, 'error_reports'), {
          word: word.toLowerCase().trim(),
          language: currentLanguage,
          errorText: "🌟 TỪ MỚI (Nhập liệu tự động bắt)",
          userId: user.uid || 'unknown',
          userName: user.displayName || 'Hệ thống tự động',
          status: 'pending',
          createdAt: Date.now(),
          suggestedMeaning: meaningArray.join(', ')
        }).catch(e => console.error("Lỗi thu thập ngầm:", e));
      }

    } catch (error: any) {
      if (error.message === 'Aborted') return;
      setRows(prev => { const newRows = [...prev]; if (newRows[index]) newRows[index] = { ...newRows[index], loading: false, suggestions: [] }; return newRows; });
    }
  };

  const handleWordKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (activeWordIndex === index && wordSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev < wordSuggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : wordSuggestions.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSelectWordSuggestion(index, wordSuggestions[selectedSuggestionIndex].word);
        } else {
          handleSelectWordSuggestion(index, wordSuggestions[0].word); 
        }
      }
    }
  };

  const handleMeaningKeyDown = (e: React.KeyboardEvent, index: number) => {
    const row = rows[index];
    const availableSuggestions = (row.suggestions || []).filter((s: string) => !row.meaning.includes(s));

    if (activeMeaningIndex === index && availableSuggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedMeaningSuggestionIndex(prev => (prev < availableSuggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedMeaningSuggestionIndex(prev => (prev > 0 ? prev - 1 : availableSuggestions.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedMeaningSuggestionIndex >= 0) {
          handleSelectSuggestion(index, availableSuggestions[selectedMeaningSuggestionIndex]);
        } else {
          handleSelectSuggestion(index, availableSuggestions[0]);
        }
      }
    }

    if (e.key === 'Tab' && !e.shiftKey && index === rows.length - 1) {
      addRow();
    }
  };

  const cancelInput = () => {
    if (window.confirm('Bạn có chắc chắn muốn hủy bỏ toàn bộ dữ liệu đang nhập không?')) {
      setRows([{ word: '', meaning: '', loading: false, suggestions: [] }]); setLessonTitle(''); if (initialLesson) onSaved();
    }
  };

  const saveLesson = async () => {
    const validRows = rows.filter(r => r.word.trim() && r.meaning.trim());
    if (validRows.length < 5) return alert("Bạn cần ít nhất 5 từ để lưu bài học!");
    if (!lessonTitle.trim()) return alert("Vui lòng nhập tên bài học!");

    setLoading(true);
    try {
      const finalValidRows = validRows.map(r => ({ ...r, word: cleanInputData(r.word, true), meaning: cleanInputData(r.meaning, true) }));
      const lessonData: Omit<Lesson, 'id'> = {
        title: lessonTitle.trim(),
        wordCount: finalValidRows.length,
        userId: user.uid,
        userName: user.displayName || 'Người dùng',
        language,
        createdAt: Date.now(),
        vocabularies: finalValidRows.map(r => ({
          word: r.word, meaning: r.meaning, part_of_speech: r.part_of_speech || r.type || '', phonetic: r.phonetic || '', english_definition: r.english_definition || r.definition || '', german_definition: r.german_definition || '', example: r.example || '', example_english: r.example_english || '', example_german: r.example_german || '', example_vietnamese: r.example_vietnamese || '', article: r.article || '', plural: r.plural || '', synonyms: r.synonyms || r.synonym || '', topic: r.topic || '', language, userId: user.uid, createdAt: Date.now()
        }))
      };
      if (initialLesson?.id) await setDoc(doc(db, 'lessons', initialLesson.id), lessonData);
      else await addDoc(collection(db, 'lessons'), lessonData);
      setShowSaveModal(false); onSaved();
    } catch (e) {
      alert("Có lỗi xảy ra khi lưu bài học.");
    } finally {
      setLoading(false);
    }
  };

  const extractWordMeaning = (line: string) => {
    let cleanLine = line.replace(/^[\s\-\*•]+/, '').replace(/^\d+[\.\)]\s*/, '').trim();
    const sepRegex = /(\t|:| \- | \– | \— | = )/;
    const match = cleanLine.match(sepRegex);

    if (match) {
      const index = match.index!;
      let word = cleanLine.substring(0, index).trim();
      let meaning = cleanLine.substring(index + match[0].length).trim();
      
      const isVietnameseHeader = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(word);
      if (isVietnameseHeader) return null;
      if (word) return { word, meaning };
    }
    return null;
  };

  const parseTextAdvanced = (text: string) => {
    const rawLines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    const newRows: any[] = [];
    const hasSeparators = rawLines.filter(l => /(\t|:| \- | \– | \— | = )/.test(l)).length > rawLines.length * 0.2;

    if (hasSeparators) {
       rawLines.forEach(line => {
          const extracted = extractWordMeaning(line);
          if (extracted) newRows.push({ ...extracted, loading: false, suggestions: [] });
       });
    } else {
       for (let i = 0; i < rawLines.length; i += 2) {
          const word = rawLines[i].replace(/^[\s\-\*•\d\.\)]+\s*/, '').trim();
          const meaning = (i + 1 < rawLines.length) ? rawLines[i + 1].trim() : '';
          const isVietnameseHeader = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(word);
          if (word && !isVietnameseHeader) {
             newRows.push({ word, meaning, loading: false, suggestions: [] });
          }
       }
    }
    return newRows;
  };

  const parseHtmlAdvanced = (html: string) => {
    const processedHtml = html
      .replace(/<\/p>/gi, '</p>\n')
      .replace(/<\/li>/gi, '</li>\n')
      .replace(/<\/h[1-6]>/gi, '</h3>\n')
      .replace(/<br\s*\/?>/gi, '\n');

    const parser = new DOMParser();
    const doc = parser.parseFromString(processedHtml, 'text/html');
    const newRows: any[] = [];

    const hasVietnamese = (text: string) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);

    const tables = doc.querySelectorAll('table');
    tables.forEach(table => {
      const trs = table.querySelectorAll('tr');
      trs.forEach(tr => {
        const tds = Array.from(tr.querySelectorAll('td, th')).map(td => td.textContent?.replace(/\n/g, ' ').trim() || '');
        
        let wordColIndex = -1;
        let meaningColIndex = -1;

        for (let i = 0; i < tds.length; i++) {
           const colText = tds[i];
           if (!colText) continue;

           const isNum = /^[\d\.\)\s]+$/.test(colText);
           const isViet = hasVietnamese(colText);

           if (!isNum && !isViet && wordColIndex === -1) {
              wordColIndex = i;
           } 
           else if (isViet && meaningColIndex === -1) {
              meaningColIndex = i;
           }
        }

        if (wordColIndex === -1 || meaningColIndex === -1) {
           const textCols = [];
           for (let i = 0; i < tds.length; i++) {
               if (tds[i] && !/^[\d\.\)\s]+$/.test(tds[i])) {
                   textCols.push(i);
               }
           }
           if (textCols.length >= 2) {
               wordColIndex = textCols[0];
               meaningColIndex = textCols[1];
           }
        }

        if (wordColIndex !== -1 && meaningColIndex !== -1 && wordColIndex !== meaningColIndex) {
           let word = tds[wordColIndex].replace(/^[\s\-\*•\d\.\)]+\s*/, '').trim();
           let meaning = tds[meaningColIndex].trim();
           
           const isTableTitleRow = word.toLowerCase().includes('tiếng') || 
                                   word.toLowerCase().includes('từ vựng') || 
                                   word.toLowerCase().includes('stt') || 
                                   meaning.toLowerCase().includes('nghĩa');
           
           if (word && meaning && !isTableTitleRow) {
               newRows.push({ word, meaning, loading: false, suggestions: [] });
           }
        }
      });
      table.remove(); 
    });

    const remainingText = doc.body.textContent || '';
    const textRows = parseTextAdvanced(remainingText);
    
    return [...newRows, ...textRows];
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.doc')) {
      alert("Hệ thống AIBTeM chỉ hỗ trợ chuẩn lưu trữ hiện đại (.docx, .txt, .csv).\n\nĐịnh dạng .doc cũ (trước 2007) không còn được các trình duyệt web bảo mật hỗ trợ. Bạn vui lòng mở file này bằng phần mềm MS Word, sau đó chọn 'Save As' (Lưu dưới dạng) thành định dạng .docx rồi tải lên lại nhé!");
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      let parsedRows: any[] = [];
      
      if (file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        const text = await file.text();
        parsedRows = parseTextAdvanced(text);
      } else if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        parsedRows = parseHtmlAdvanced(result.value);
      }

      if (parsedRows.length > 0) {
        setRows(parsedRows);
      } else {
        alert("AIBTeM không tìm thấy từ vựng hợp lệ trong file. Vui lòng kiểm tra lại cấu trúc file!");
      }
    } catch (error) {
      alert("Lỗi không thể đọc file. File có thể bị hỏng hoặc sai định dạng.");
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const totalValidWords = rows.filter(r => r.word.trim() && r.meaning.trim()).length;

  return (
    <div className="w-full mx-auto space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">{initialLesson ? "Kiểm tra & Lưu bài học" : "Tạo bài học mới"}</h2>
          <p className="text-slate-500">Nhập từ cần học, chỉnh sửa, thêm bớt và BẮT BUỘC lưu lại để bắt đầu luyện tập.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className={cn("flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-indigo-300 transition-all shadow-sm group", uploading && "opacity-50 cursor-not-allowed")}>
            {uploading ? <Loader2 className="animate-spin text-indigo-600 w-5 h-5" /> : <Upload className="text-indigo-600 w-5 h-5 group-hover:scale-110 transition-transform" />}
            
            <span className="text-sm font-bold text-slate-700">Tải file (.txt, .doc, .docx, .csv)</span>
            <input type="file" accept=".txt,.doc,.docx,.csv" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="group relative">
            <div className="flex flex-col md:flex-row gap-4 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all relative">
              <div className="hidden md:flex items-center justify-center w-10 font-bold text-slate-300 text-xl group-hover:text-indigo-200 transition-colors">{index + 1}</div>
             <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Thuật ngữ ({language.toUpperCase()})</label>
                  <input 
                    type="text" 
                    value={row.word} 
                    onChange={(e) => handleWordChange(index, e.target.value)} 
                    onFocus={(e) => handleWordChange(index, e.target.value)}
                    onKeyDown={(e) => handleWordKeyDown(e, index)}
                    onBlur={(e) => {
                      const val = e.target.value;
                      setTimeout(() => {
                        if (activeWordIndex === index) setActiveWordIndex(null);
                        handleAutoTranslate(index, language, val);
                      }, 200);
                    }} 
                    className="w-full bg-slate-100 border-2 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-lg font-medium text-slate-800 placeholder:text-slate-400" 
                    placeholder="Nhập từ..." 
                  />
                  
                  <AnimatePresence>
                    {activeWordIndex === index && wordSuggestions.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute top-[80px] left-0 right-0 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-[60]">
                        {wordSuggestions.map((s, idx) => (
                          <div 
                            key={idx} 
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectWordSuggestion(index, s.word);
                            }}
                            className={cn("px-5 py-3 cursor-pointer border-b border-slate-100 last:border-none transition-colors", selectedSuggestionIndex === idx ? "bg-indigo-50 text-indigo-800 font-medium" : "hover:bg-slate-50 text-slate-700")}
                          >
                            <span className="text-lg font-bold">{s.word}</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Định nghĩa (Tiếng Việt)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={row.meaning} 
                      onChange={(e) => {
                        updateRow(index, 'meaning', e.target.value);
                        setSelectedMeaningSuggestionIndex(-1);
                      }}
                      onFocus={() => {
                        setActiveMeaningIndex(index);
                        setSelectedMeaningSuggestionIndex(-1);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (activeMeaningIndex === index) setActiveMeaningIndex(null);
                        }, 200);
                      }}
                      onKeyDown={(e) => handleMeaningKeyDown(e, index)}
                      className="w-full bg-slate-100 border-2 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-lg font-medium text-slate-800 placeholder:text-slate-400" 
                      placeholder="Nhập nghĩa..." 
                    />
                    {row.loading && <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-100"><Loader2 className="animate-spin text-indigo-500 w-4 h-4" /><span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">AIBTeM đang dịch...</span></div>}
                  </div>
                  
                  {(() => {
                    const shouldShowSuggestions = activeMeaningIndex === index && (row.meaning === '' || row.meaning.endsWith(', '));
                    const availableSuggestions = (row.suggestions || []).filter((s: string) => !row.meaning.includes(s));
                    return shouldShowSuggestions && availableSuggestions.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-2 p-2 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap gap-2">
                        {availableSuggestions.map((s: string, i: number) => (
                          <button 
                            key={i} 
                            type="button" 
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectSuggestion(index, s);
                            }}
                            className={cn(
                              "text-[15px] px-5 py-2.5 rounded-full border-2 transition-all font-medium shadow-sm",
                              selectedMeaningSuggestionIndex === i 
                                ? "bg-indigo-600 border-indigo-600 text-white scale-105" 
                                : "bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 hover:scale-105"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </motion.div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex md:flex-col items-center justify-center gap-2 z-10">
                <button onClick={() => removeRow(index)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Xóa hàng"><Trash2 size={20} /></button>
              </div>
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => addRowAtIndex(index)} className="bg-white border-2 border-slate-200 text-indigo-600 p-2 rounded-full shadow-xl hover:scale-110 hover:border-indigo-500 transition-all" title="Thêm hàng ở đây"><PlusCircle size={20} /></button>
            </div>
          </div>
        ))}
        <button onClick={addRow} className="w-full py-8 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 font-bold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-3 group">
          <PlusCircle size={24} className="group-hover:rotate-90 transition-transform duration-300" /> Thêm hàng mới
        </button>
      </div>

      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40">
        <div className="bg-white/90 backdrop-blur-2xl border border-white/20 p-4 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 ml-2">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-all", totalValidWords >= 5 ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-slate-100 text-slate-400")}>{totalValidWords}</div>
            <div><p className="text-sm font-bold text-slate-900 leading-none">Từ đã chọn</p><p className="text-xs text-slate-500 mt-1">{totalValidWords >= 5 ? "Đủ điều kiện lưu!" : `Cần tối thiểu 5 từ`}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={cancelInput} className="px-6 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all">Hủy</button>
            <button onClick={() => setShowSaveModal(true)} disabled={totalValidWords < 5} className={cn("px-8 py-3 rounded-2xl font-bold transition-all shadow-lg flex items-center gap-2", totalValidWords >= 5 ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
              Lưu vào Thư viện <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSaveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSaveModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-3 bg-indigo-600" />
              <h3 className="text-3xl font-bold mb-2">Lưu bài học</h3>
              <p className="text-slate-500 mb-8">Đặt tên cho bài học để ôn tập trong Thư viện.</p>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Tên bài học</label>
                  <input 
  type="text" 
  autoFocus 
  value={lessonTitle} 
  onChange={(e) => setLessonTitle(e.target.value)} 
  onKeyDown={(e) => {
    if (e.key === 'Enter' && lessonTitle.trim() && !loading) {
      e.preventDefault();
      saveLesson();
    }
  }}
  placeholder="Ví dụ: Bài học ngày..." 
  className="w-full bg-slate-50 border-2 border-transparent rounded-2xl px-6 py-5 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-xl font-bold" 
/>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setShowSaveModal(false)} className="flex-1 py-5 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Hủy</button>
                  <button onClick={saveLesson} disabled={loading || !lessonTitle.trim()} className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-bold hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="animate-spin" /> : "Lưu & Tới Thư viện"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GamesView({ vocabList, language, onComplete, activeGame, setActiveGame, onGoToLibrary, onGoToTopics, onGoToInput, hasLessons, activeLessonId, playSound }: { vocabList: Vocabulary[], language: Language, onComplete: (res: GameResult) => void, activeGame: GameType | null, setActiveGame: (g: GameType | null) => void, onGoToLibrary: () => void, onGoToTopics: () => void, onGoToInput: () => void, hasLessons: boolean, activeLessonId: string, playSound: (t: 'correct'|'wrong'|'success')=>void }) {
  
  if (vocabList.length < 5) {
    if (!hasLessons) {
      return (
        <div className="text-center py-20 bg-white rounded-[3rem] shadow-xl border border-slate-100 w-full">
          {/* Đã thay thế RobotAnimation bằng AIBTeMBot trạng thái search */}
          <AIBTeMBot emotion="search" className="w-40 h-40 md:w-48 md:h-48 mx-auto" />
          <h3 className="text-2xl font-bold mt-6">Chưa có bài học nào được tạo</h3>
          <p className="text-slate-500 mt-2 mb-8">Vui lòng tạo bài học từ Chủ đề hoặc Nhập liệu trực tiếp để bắt đầu học.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4">
            <button onClick={onGoToTopics} className="w-full sm:w-auto bg-indigo-50 text-indigo-600 px-8 py-4 rounded-2xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"><LayoutGrid size={20} /> Đến Chủ đề</button>
            <button onClick={onGoToInput} className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2"><PlusCircle size={20} /> Đến Nhập liệu</button>
          </div>
        </div>
      );
    }
    return (
      <div className="text-center py-20 bg-white rounded-[3rem] shadow-xl border border-slate-100 w-full">
        {/* Đã thay thế RobotAnimation tĩnh bằng AIBTeMBot trạng thái idle */}
        <AIBTeMBot emotion="idle" className="w-40 h-40 md:w-48 md:h-48 mx-auto" />
        <h3 className="text-2xl font-bold mt-6">Chưa có bài học nào được chọn</h3>
        <p className="text-slate-500 mt-2 mb-8">Vui lòng chọn một Bài học để bắt đầu chơi.</p>
        <button onClick={onGoToLibrary} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center gap-2 mx-auto"><BookOpen size={20} /> Đến Thư viện ngay</button>
      </div>
    );
  }

 if (activeGame) {
    return (
      <GameContainer 
        type={activeGame} 
        vocabList={vocabList} 
        language={language} 
        activeLessonId={activeLessonId} 
        onBack={() => setActiveGame(null)} 
        onFinish={(score, mistakes) => { 
            onComplete({ lessonId: activeLessonId, gameType: activeGame, score, total: vocabList.length, timestamp: Date.now(), language, mistakes }); 
        }} 
        playSound={playSound} 
      />
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8 bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between">
        <span className="text-indigo-800 font-medium">Đang sử dụng gói từ vựng: <strong className="text-indigo-600">{vocabList.length} từ</strong></span>
        <button onClick={onGoToLibrary} className="text-sm font-bold text-indigo-600 bg-white px-4 py-2 rounded-xl shadow-sm hover:shadow-md transition-all">Đổi gói khác</button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <GameCard title="Flashcards" desc="Thẻ lật 3 mặt giúp ghi nhớ sâu." icon={<BrainCircuit />} colorClass="bg-blue-500" onClick={() => setActiveGame('flashcards')} />
        <GameCard title="Trắc nghiệm" desc="AIBTeM tạo từ nhiễu thông minh." icon={<CheckCircle2 />} colorClass="bg-indigo-500" onClick={() => setActiveGame('quiz')} />
        <GameCard title="Nối từ" desc="Thử thách phản xạ nhanh." icon={<RefreshCw />} colorClass="bg-orange-500" onClick={() => setActiveGame('matching')} />
        <GameCard title="Luyện viết" desc="Nghe và viết lại chính xác." icon={<Volume2 />} colorClass="bg-emerald-500" onClick={() => setActiveGame('writing')} />
        <GameCard title="Điền từ" desc="Sử dụng từ trong ngữ cảnh AIBTeM." icon={<ChevronRight />} colorClass="bg-pink-500" onClick={() => setActiveGame('fill')} />
        <GameCard title="Giao tiếp AI" desc="Thực hành đàm thoại thực tế với AIBTeM." icon={<Mic />} colorClass="bg-rose-500" onClick={() => setActiveGame('roleplay')} />
      </div>
    </div>
  );
}

function GameCard({ title, desc, icon, onClick, colorClass }: { title: string, desc: string, icon: React.ReactNode, onClick: () => void, colorClass: string }) {
  return (
    <motion.button whileHover={{ y: -8, scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onClick} className={cn("bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 text-left transition-all group relative overflow-hidden hover:shadow-2xl hover:shadow-indigo-100")}>
      <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg rotate-3 group-hover:rotate-6 transition-transform", colorClass)}>
        {React.cloneElement(icon as React.ReactElement, { size: 32, className: "text-white" })}
      </div>
      <h3 className="text-xl font-bold mb-2 text-slate-900">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
      <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight className="text-slate-300" /></div>
      <div className={cn("absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-5 group-hover:scale-150 transition-transform", colorClass)}></div>
    </motion.button>
  );
}

function GameContainer({ type, vocabList, language, onBack, onFinish, playSound, activeLessonId }: { type: GameType, vocabList: Vocabulary[], language: Language, onBack: () => void, onFinish: (score: number, mistakes?: any[]) => void, playSound: (t: 'correct' | 'wrong' | 'success') => void, activeLessonId: string }) {
  const mergedDict = useMergedDict(language);
  
  const [gameVocabs] = useState(() => {
    const enriched = vocabList.map(v => {
        // Tìm kiếm đối chiếu với từ điển gốc
        const dictEntry = mergedDict.find((d: any) => d.word && d.word.toLowerCase() === v.word.toLowerCase());
        
        // Nếu có trong từ điển thì làm giàu dữ liệu
        if (dictEntry) {
            return { 
              ...v, 
              part_of_speech: v.part_of_speech || dictEntry.part_of_speech || dictEntry.type, 
              phonetic: v.phonetic || dictEntry.phonetic, 
              english_definition: v.english_definition || dictEntry.english_definition || dictEntry.en_definition || dictEntry.definition, 
              german_definition: v.german_definition || dictEntry.german_definition || dictEntry.de_definition || dictEntry.definition_de || dictEntry.definition, 
              example: v.example || dictEntry.example, 
              example_english: v.example_english || dictEntry.example_english, 
              example_german: v.example_german || dictEntry.example_german, 
              example_vietnamese: v.example_vietnamese || dictEntry.example_vietnamese, 
              level: v.level || (dictEntry as any).level 
            };
        }
        
        // [VÁ LỖI TẠI ĐÂY]: Nếu là câu dài hoặc từ không có trong từ điển, trả về nguyên bản dữ liệu đã nhập
        return v; 
    });
    
    return type === 'flashcards' ? enriched : [...enriched].sort(() => 0.5 - Math.random());
  });

  const [step, setStep] = useState(0);
// ... (Các phần mã bên dưới của GameContainer giữ nguyên hoàn toàn)
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [mistakes, setMistakes] = useState<{word: string, userAnswer: string, correctAnswer: string}[]>([]);
  const currentVocab = gameVocabs[step];
  
  const [answerHistory, setAnswerHistory] = useState<('correct'|'wrong'|null)[]>(new Array(gameVocabs.length).fill(null));

  const scoredStepsRef = useRef<Set<number>>(new Set());

  const handleFlashcardFlipped = () => {
      if (!scoredStepsRef.current.has(step)) {
          scoredStepsRef.current.add(step);
          setScore(scoredStepsRef.current.size); 
          setAnswerHistory(prev => {
              const newHistory = [...prev];
              newHistory[step] = 'correct';
              return newHistory;
          });
      }
  };

  useEffect(() => {
      if (isFinished) {
          if (type !== 'flashcards') {
              const percentage = Math.round((score / gameVocabs.length) * 100);
              if (percentage >= 80) {
                  playSound('success');
              }
          }
          
          const handleKeyDown = (e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                  e.preventDefault(); 
                  onFinish(score, mistakes);
              }
          };
          window.addEventListener('keydown', handleKeyDown);
          return () => window.removeEventListener('keydown', handleKeyDown);
      }
  }, [isFinished, score, gameVocabs.length, type, playSound, onFinish, mistakes]);

  const handleAnswer = (correct: boolean, userAnswer: string, customMistakeWord?: string, customCorrectAns?: string) => {
      const newHistory = [...answerHistory];
      newHistory[step] = correct ? 'correct' : 'wrong';
      setAnswerHistory(newHistory);

      if (correct) {
          setScore(s => s + 1);
          playSound('correct');
      } else {
          playSound('wrong');
          if (type !== 'flashcards') {
              setMistakes(prev => [...prev, {
                  word: customMistakeWord || currentVocab.word,
                  userAnswer: userAnswer || 'Không trả lời',
                  correctAnswer: customCorrectAns || (type === 'writing' ? currentVocab.word : (currentVocab.vietnamese_meaning || currentVocab.meaning))
              }]);
          }
      }
  };

  const handleNextStep = () => {
      if (step < gameVocabs.length - 1) {
          setStep(s => s + 1);
      } else {
          if (type === 'flashcards') {
              onFinish(score, []); 
          } else {
              setIsFinished(true); 
          }
      }
  };
  
  const handlePrevStep = () => {
      if (step > 0) {
          setStep(s => s - 1);
      }
  };

  if (isFinished) {
      const percentage = Math.round((score / gameVocabs.length) * 100);
      const isGood = percentage >= 80; 
      const isNeedsImprovement = percentage < 50;

      return (
          <div className="w-full max-w-3xl mx-auto">
              {isGood && <Confetti />}
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[3rem] p-8 md:p-12 shadow-xl border border-slate-100 text-center relative overflow-hidden z-10">
                  {/* Thay thế Dicebear tĩnh bằng Linh vật AIBTeM Bot */}
    <div className="relative mb-6 flex justify-center">
        <AIBTeMBot 
           emotion={isGood ? 'happy' : 'sad'} 
           className="w-40 h-40 md:w-48 md:h-48" 
        />
    </div>
                  
                  <h2 className="text-3xl md:text-4xl font-black text-slate-800 mb-4">
                      {isGood ? getRandomPraise(language) : (isNeedsImprovement ? getRandomEncouragement(language) : "Cố gắng lên nhé! Đừng bỏ cuộc!")}
                  </h2>
                  <p className="text-lg md:text-xl text-slate-600 mb-8 font-medium">
                      Tổng số có <strong className="text-indigo-600">{gameVocabs.length}</strong> câu, bạn đã làm đúng <strong className="text-emerald-600">{score}</strong> câu; sai <strong className="text-red-500">{gameVocabs.length - score}</strong> câu!
                  </p>

                  {mistakes.length > 0 && (
                      <div className="text-left bg-slate-50 p-6 md:p-8 rounded-3xl space-y-4 mb-8 border border-slate-100 max-h-[300px] overflow-y-auto">
                          <h4 className="font-bold text-slate-700 text-lg border-b border-slate-200 pb-3 mb-4 sticky top-0 bg-slate-50">Chi tiết các lỗi sai:</h4>
                          {mistakes.map((m, i) => (
                              <div key={i} className="text-base text-slate-700 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                  <strong className="text-indigo-600 text-lg block mb-1">{m.word}:</strong> 
                                  Bạn đã trả lời <span className="line-through text-red-500 font-medium ml-1">{m.userAnswer}</span>. <br className="md:hidden" />
                                  Đáp án đúng là <span className="text-emerald-600 font-bold ml-1">{m.correctAnswer}</span>
                              </div>
                          ))}
                      </div>
                  )}

                  <button autoFocus onClick={() => onFinish(score, mistakes)} className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-bold text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 hover:scale-105 active:scale-95">
                      Hoàn thành & Nhận điểm
                  </button>
              </motion.div>
          </div>
      );
  }

  return (
    <div className="w-full mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold">
          <ChevronLeft size={20} /> Quay lại
        </button>
        
        {type !== 'roleplay' && (
          <>
            <div className="flex gap-2 flex-1 max-w-sm mx-4">
              {gameVocabs.map((_, i) => {
                 let bgColor = "bg-slate-200";
                 if (i < step) {
                     if (type === 'flashcards') bgColor = answerHistory[i] === 'correct' ? "bg-[#009900]" : "bg-slate-200";
                     else bgColor = answerHistory[i] === 'correct' ? "bg-[#009900]" : "bg-red-500";
                 } else if (i === step) {
                     if (answerHistory[i] === 'correct') bgColor = "bg-[#009900]";
                     else if (answerHistory[i] === 'wrong') bgColor = "bg-red-500";
                     else bgColor = "bg-indigo-400 animate-pulse";
                 }
                 return <div key={i} className={cn("h-2 rounded-full transition-all flex-1", bgColor)} />
              })}
            </div>
            <div className="font-bold text-indigo-600">Từ {Math.min(step + 1, gameVocabs.length)}/{gameVocabs.length}</div>
          </>
        )}
      </div>

      <AnimatePresence mode="wait">
        {type === 'flashcards' && (
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <FlashcardGame vocab={currentVocab} onNext={handleNextStep} onPrev={handlePrevStep} language={language} step={step} totalSteps={gameVocabs.length} onFinish={() => onFinish(scoredStepsRef.current.size, [])} onFullyFlipped={handleFlashcardFlipped} />
          </motion.div>
        )}
        {type === 'quiz' && (
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <QuizGame vocab={currentVocab} allVocabs={gameVocabs} onAnswer={handleAnswer} onNextStep={handleNextStep} language={language} />
          </motion.div>
        )}
        {type === 'matching' && (
          <motion.div key="matching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MatchingGame 
                vocabs={gameVocabs} 
                onCompleteGame={(finalScore, finalMistakes) => { setScore(finalScore); setMistakes(finalMistakes); setIsFinished(true); }} 
                playSound={playSound} 
                language={language}
                onPairResolved={(status) => {
                   const newHistory = [...answerHistory];
                   newHistory[step] = status;
                   setAnswerHistory(newHistory);
                   setStep(s => s + 1);
                }} 
            />
          </motion.div>
        )}
        {type === 'writing' && (
          <motion.div key={step} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <WritingGame vocab={currentVocab} onAnswer={handleAnswer} onNextStep={handleNextStep} language={language} />
          </motion.div>
        )}
        {type === 'fill' && (
          <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FillGame vocab={currentVocab} onAnswer={handleAnswer} onNextStep={handleNextStep} language={language} />
          </motion.div>
        )}
        {type === 'roleplay' && (
          <motion.div key="roleplay" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
           <RoleplayGame vocabs={gameVocabs} language={language} onComplete={(score) => onFinish(score, [])} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FlashcardGame({ vocab, onNext, onPrev, language, step, totalSteps, onFinish, onFullyFlipped }: any) {
  const [side, setSide] = useState(0); 
  const [showReportModal, setShowReportModal] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [showThankYou, setShowThankYou] = useState(false);
  
  // STATE MỚI: Hiển thị vòng xoay tải dữ liệu khi đang gửi báo cáo lên Firebase
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const [viewedSides, setViewedSides] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    setSide(0);
    setShowReportModal(false); setErrorText(''); setShowThankYou(false);
    setViewedSides(new Set([0]));
  }, [vocab, step]);

  useEffect(() => {
    setViewedSides(prev => {
      const newSet = new Set(prev).add(side);
      if (newSet.size >= 3 && onFullyFlipped) {
        onFullyFlipped();
      }
      return newSet;
    });
  }, [side, onFullyFlipped]);

  useEffect(() => {
    if (side === 2) handleSpeak(vocab.word, language);
  }, [side, vocab.word, language]);

  // Bắt mọi thể loại key định nghĩa từ JSON
  const definition = language === 'en' 
    ? (vocab.english_definition || vocab.en_definition || vocab.definition) 
    : (vocab.german_definition || vocab.de_definition || vocab.definition_de || vocab.definition);
  const exampleText = language === 'en' ? (vocab.example_english || vocab.example) : (vocab.example_german || vocab.example);

  // HÀM MỚI: Đẩy dữ liệu báo cáo lên Firebase Firestore
  const handleSubmitReport = async () => {
    if (!errorText.trim()) return;
    setIsSubmittingReport(true); // Bật hiệu ứng loading
    
    try {
      // Gọi API đẩy dữ liệu vào thư mục 'error_reports'
      await addDoc(collection(db, 'error_reports'), {
        word: vocab.word,
        language: language,
        errorText: errorText.trim(),
        userId: auth.currentUser?.uid || 'unknown',
        userName: auth.currentUser?.displayName || 'Người dùng ẩn danh',
        status: 'pending', // Trạng thái 'pending' để Admin biết lỗi này chưa được xử lý
        createdAt: Date.now()
      });
      
      // Gửi thành công mới hiện màn hình Cảm ơn
      setShowThankYou(true);
    } catch (error) {
      console.error("Lỗi gửi báo cáo:", error);
      alert("Lỗi mạng: Không thể gửi báo cáo lúc này. Vui lòng thử lại sau.");
    } finally {
      setIsSubmittingReport(false); // Tắt hiệu ứng loading
    }
  };

  return (
    <div className="space-y-8 w-full max-w-4xl mx-auto">
      <div className="perspective-[1000px] w-full min-h-[220px]">
        <AnimatePresence mode="wait">
          <motion.div key={side} initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: -90, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} onClick={() => setSide((side + 1) % 3)} className="w-full min-h-[220px] bg-white rounded-[2rem] shadow-xl border border-slate-100 flex flex-col p-6 md:p-10 cursor-pointer relative overflow-hidden group">
           <div className="flex-grow flex flex-col justify-center w-full">
              {side === 0 && (
                <div className="text-left w-full space-y-2">
                   <div className="text-xl text-slate-800 leading-relaxed">
                     {vocab.part_of_speech && <span className="font-bold text-indigo-600 mr-2">({vocab.part_of_speech})</span>}
                     {definition || "Chưa có định nghĩa ngôn ngữ gốc cho từ này."}
                   </div>
                </div>
              )}
              {side === 1 && (
                <div className="text-left w-full space-y-4">
                   <div className="text-xl font-bold text-emerald-600">{vocab.vietnamese_meaning || vocab.meaning}</div>
                   {vocab.phonetic && (
                     <div className="flex items-center gap-3 text-slate-500">
                       <button onClick={(e) => {e.stopPropagation(); handleSpeak(vocab.word, language)}} className="hover:text-indigo-600 transition-colors p-2 bg-slate-50 rounded-full hover:bg-indigo-50 border border-slate-100 shadow-sm"><Volume2 size={20} /></button>
                       <span className="text-lg font-mono">{renderPhonetic(vocab.phonetic)}</span>
                     </div>
                   )}
                </div>
              )}
              {side === 2 && (
                <div className="text-left w-full space-y-4">
                   {/* Khung hiển thị thuật ngữ/câu kèm nút loa luôn hiển thị */}
                   <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-xl font-bold text-indigo-600">
                        {vocab.word} {vocab.part_of_speech && <span className="font-normal text-slate-500">({vocab.part_of_speech})</span>}
                      </div>
                      <button 
                        onClick={(e) => {e.stopPropagation(); handleSpeak(vocab.word, language)}} 
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-all shadow-sm shrink-0"
                        title="Nghe lại"
                      >
                        <Volume2 size={20} />
                      </button>
                   </div>
                   
                   {/* Phần phiên âm chỉ hiện nếu có dữ liệu */}
                   {vocab.phonetic && (
                     <div className="text-slate-500">
                        <span className="text-lg font-mono ml-1">{renderPhonetic(vocab.phonetic)}</span>
                     </div>
                   )}
                   
                   {/* Phần ví dụ */}
                   {(exampleText) && (
                     <div className="flex items-start gap-3 mt-4 pt-4 border-t border-slate-100">
                        <button onClick={(e) => {e.stopPropagation(); handleSpeak(exampleText || '', language)}} className="hover:text-indigo-600 transition-colors text-slate-400 mt-1 shrink-0 p-1.5 bg-white rounded-full shadow-sm border border-slate-100"><Volume2 size={18} /></button>
                        <div className="space-y-1">
                           <div className="text-lg text-slate-700 leading-relaxed italic">{highlightWordInSentence(exampleText || '', vocab.word)}</div>
                           {vocab.example_vietnamese && <div className="text-base text-slate-500">{vocab.example_vietnamese}</div>}
                        </div>
                     </div>
                   )}
                </div>
              )}
            </div>
            <div className="absolute bottom-4 right-6 text-slate-300 font-bold text-xs uppercase tracking-widest flex items-center gap-2 group-hover:text-indigo-300 transition-colors">
               <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> Nhấn lật thẻ
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full">
         <button onClick={onPrev} disabled={step === 0} className="flex-1 py-4 rounded-2xl font-bold text-lg bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
           <ChevronLeft size={20} /> Lùi lại
         </button>
         <button onClick={() => setShowReportModal(true)} className="flex-1 py-4 rounded-2xl font-bold text-lg bg-orange-50 border-2 border-orange-100 text-orange-600 hover:bg-orange-100 hover:border-orange-200 transition-all flex items-center justify-center gap-2">
           <AlertCircle size={20} /> Báo lỗi
         </button>
         <button 
            onClick={() => {
              if (step === totalSteps - 1) {
                if (onFinish) onFinish();
              } else {
                onNext();
              }
            }} 
            className="flex-1 py-4 rounded-2xl font-bold text-lg bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-2"
         >
           {step === totalSteps - 1 ? 'Hoàn thành' : 'Tiếp theo'} {step !== totalSteps - 1 && <ChevronRight size={20} />}
         </button>
      </div>

      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !showThankYou && !isSubmittingReport && setShowReportModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative bg-white w-full max-w-lg rounded-[3rem] p-8 md:p-10 shadow-2xl overflow-hidden z-10">
              {!showThankYou ? (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center shrink-0"><AlertCircle size={24} /></div>
                    <div><h3 className="text-2xl font-bold text-slate-900">Báo lỗi từ vựng</h3><p className="text-slate-500 text-sm">Từ: <strong className="text-indigo-600">{vocab.word}</strong></p></div>
                  </div>
                  <div className="space-y-4 mb-8">
                    <textarea autoFocus value={errorText} onChange={(e) => setErrorText(e.target.value)} disabled={isSubmittingReport} placeholder="Vui lòng nhập nội dung lỗi vào đây..." className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-5 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-lg font-medium placeholder:text-slate-400 min-h-[150px] resize-none disabled:opacity-50" />
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => setShowReportModal(false)} disabled={isSubmittingReport} className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all disabled:opacity-50">Hủy</button>
                    {/* NÚT SUBMIT ĐÃ ĐƯỢC GẮN VÀO HÀM MỚI VÀ CÓ VÒNG XOAY HIỆU ỨNG */}
                    <button onClick={handleSubmitReport} disabled={!errorText.trim() || isSubmittingReport} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-2">
                      {isSubmittingReport ? <Loader2 className="animate-spin" size={20} /> : "Gửi báo cáo"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={48} /></div>
                  <h3 className="text-3xl font-bold text-slate-900 mb-2">Cảm ơn bạn!</h3>
                  <p className="text-slate-500 text-lg mb-8">Báo cáo đã được gửi đến quản trị viên để khắc phục.</p>
                  <button onClick={() => { setShowReportModal(false); setShowThankYou(false); setErrorText(''); }} className="w-full py-4 rounded-2xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all">Đóng</button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuizGame({ vocab, allVocabs, onAnswer, onNextStep, language }: { vocab: Vocabulary, allVocabs: Vocabulary[], onAnswer: (c: boolean, ans: string) => void, onNextStep: () => void, language: Language }) {
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    handleSpeak(vocab.word, language);
  }, [vocab, language]);

  useEffect(() => {
    let others = allVocabs.filter(v => v.word.toLowerCase() !== vocab.word.toLowerCase());
    others = others.sort(() => 0.5 - Math.random());
    let distractors = others.slice(0, 3).map(v => v.vietnamese_meaning || v.meaning);
    let i = 1;
    while (distractors.length < 3) { distractors.push("Đáp án phụ trợ số " + i++); }
    const all = [vocab.vietnamese_meaning || vocab.meaning, ...distractors].sort(() => 0.5 - Math.random());
    setOptions(all);
    setSelected(null);
  }, [vocab, allVocabs]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-xl text-center border border-slate-100">
        <span className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2 block">Chọn nghĩa đúng của</span>
        <div className="flex items-center justify-center gap-4">
           <h3 className="text-3xl md:text-4xl font-bold text-indigo-600">{vocab.word}</h3>
           <button onClick={() => handleSpeak(vocab.word, language)} className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors shadow-sm"><Volume2 size={24} /></button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((opt, i) => (
          <button key={i} disabled={!!selected} onClick={() => {
              setSelected(opt);
              const isCorrect = opt === (vocab.vietnamese_meaning || vocab.meaning);
              onAnswer(isCorrect, opt);
              setTimeout(onNextStep, 1000);
            }}
            className={cn("p-6 rounded-3xl text-left font-bold text-lg transition-all border-2 flex items-center h-full min-h-[100px]", 
              selected === opt 
              ? (opt === (vocab.vietnamese_meaning || vocab.meaning) ? "bg-green-50 border-[#009900] text-[#009900]" : "bg-red-50 border-red-500 text-red-600") 
              : "bg-white border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-md")}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchingGame({ vocabs, onCompleteGame, playSound, language, onPairResolved }: { vocabs: Vocabulary[], onCompleteGame: (score: number, mistakes: any[]) => void, playSound: (t: 'correct' | 'wrong') => void, language: Language, onPairResolved: (status: 'correct'|'wrong') => void }) {
  const [words, setWords] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [meanings, setMeanings] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedMeaning, setSelectedMeaning] = useState<string | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  
  const [mistakesLog, setMistakesLog] = useState<any[]>([]);

  const wordAttempts = useRef<Record<string, number>>({});
  const matchingScore = useRef(0);

  useEffect(() => {
    if (selectedWord && selectedMeaning) {
      const vocab = vocabs.find(v => v.word === selectedWord);
      const correctAnswer = vocab?.vietnamese_meaning || vocab?.meaning || '';
      
      if (correctAnswer === selectedMeaning) {
        setMatches(prev => [...prev, selectedWord]);
        playSound('correct');
        
        const hasError = (wordAttempts.current[selectedWord] || 0) > 0;
        if (!hasError) matchingScore.current += 1;

        onPairResolved(hasError ? 'wrong' : 'correct');

        setSelectedWord(null);
        setSelectedMeaning(null);

        if (matches.length + 1 === vocabs.length) {
          setTimeout(() => onCompleteGame(matchingScore.current, mistakesLog), 1000);
        }
      } else {
        setWrong([selectedWord, selectedMeaning]);
        playSound('wrong');
        
        wordAttempts.current[selectedWord] = (wordAttempts.current[selectedWord] || 0) + 1;

        setMistakesLog(prev => [...prev, { word: selectedWord, userAnswer: selectedMeaning, correctAnswer: correctAnswer }]);
        setTimeout(() => { setWrong(null); setSelectedWord(null); setSelectedMeaning(null); }, 1000);
      }
    }
  }, [selectedWord, selectedMeaning]);

  return (
    <div className="grid grid-cols-2 gap-8">
      <div className="space-y-4">
        {words.map(v => (
          <button key={v.word} disabled={matches.includes(v.word)} onClick={() => {
              setSelectedWord(v.word);
              handleSpeak(v.word, language);
          }} 
            className={cn("w-full p-6 rounded-2xl font-bold text-lg border-2 transition-all", 
              matches.includes(v.word) ? "bg-green-50 text-[#009900] border-[#009900] opacity-50" : 
              selectedWord === v.word ? "bg-indigo-50 text-indigo-600 border-indigo-600" : 
              wrong?.[0] === v.word ? "bg-red-50 text-red-600 border-red-500" : 
              "bg-white border-slate-100 hover:border-indigo-300 hover:shadow-md")}>
            {v.word}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {meanings.map(v => (
          <button key={v.meaning} disabled={matches.some(m => vocabs.find(voc => voc.word === m)?.meaning === v.meaning || vocabs.find(voc => voc.word === m)?.vietnamese_meaning === v.meaning)} onClick={() => setSelectedMeaning(v.vietnamese_meaning || v.meaning)} 
            className={cn("w-full p-6 rounded-2xl font-bold text-lg border-2 transition-all", 
              matches.some(m => vocabs.find(voc => voc.word === m)?.meaning === (v.vietnamese_meaning || v.meaning) || vocabs.find(voc => voc.word === m)?.vietnamese_meaning === (v.vietnamese_meaning || v.meaning)) ? "bg-green-50 text-[#009900] border-[#009900] opacity-50" : 
              selectedMeaning === (v.vietnamese_meaning || v.meaning) ? "bg-indigo-50 text-indigo-600 border-indigo-600" : 
              wrong?.[1] === (v.vietnamese_meaning || v.meaning) ? "bg-red-50 text-red-600 border-red-500" : 
              "bg-white border-slate-100 hover:border-indigo-300 hover:shadow-md")}>
            {v.vietnamese_meaning || v.meaning}
          </button>
        ))}
      </div>
    </div>
  );
}

function WritingGame({ vocab, onAnswer, onNextStep, language }: { vocab: Vocabulary, onAnswer: (c: boolean, ans: string) => void, onNextStep: () => void, language: Language }) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrectVal, setIsCorrectVal] = useState(false);

  useEffect(() => { handleSpeak(vocab.word, language); }, [vocab]);

  const check = () => {
    setSubmitted(true);
    const isCorrect = input.toLowerCase().trim() === vocab.word.toLowerCase().trim();
    setIsCorrectVal(isCorrect);
    onAnswer(isCorrect, input || 'Không gõ gì');
    setTimeout(onNextStep, isCorrect ? 800 : 2500); 
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl text-center border border-slate-100">
        <button onClick={() => handleSpeak(vocab.word, language)} className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 hover:scale-110 transition-transform shadow-md"><Volume2 size={40} /></button>
        <p className="text-slate-500 font-bold uppercase tracking-widest">Nghe và viết lại từ này</p>
        <p className="text-lg text-slate-700 font-medium mt-4">Nghĩa: {vocab.vietnamese_meaning || vocab.meaning}</p>
      </div>
      <div className="space-y-4">
        <input autoFocus type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !submitted && check()} disabled={submitted} className={cn("w-full bg-white border-4 rounded-3xl px-8 py-6 text-3xl font-black text-center focus:outline-none transition-all shadow-sm", submitted ? (isCorrectVal ? "border-[#009900] text-[#009900] bg-green-50" : "border-red-500 text-red-600 bg-red-50") : "border-slate-100 focus:border-indigo-500")} placeholder="..." />
        {submitted && !isCorrectVal && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center font-medium text-slate-600 text-lg bg-red-50 py-3 rounded-2xl border border-red-100">
            Đáp án đúng là: <span className="font-bold text-emerald-600">{vocab.word}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function FillGame({ vocab, onAnswer, onNextStep, language }: { vocab: Vocabulary, onAnswer: (c: boolean, ans: string, w: string, m: string) => void, onNextStep: () => void, language: Language }) {
  const [sentence, setSentence] = useState('');
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrectVal, setIsCorrectVal] = useState(false);

  const exampleText = language === 'en' ? (vocab.example_english || vocab.example) : (vocab.example_german || vocab.example);

  useEffect(() => {
    if (exampleText) setSentence(exampleText);
    else {
        const load = async () => { const s = await generateExampleSentence(vocab.word, language); setSentence(s); };
        load();
    }
  }, [vocab, exampleText, language]);

  let parts: string[] = [sentence];
  let hasMatch = false;
  try {
      const escapedWord = vocab.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      parts = sentence.split(new RegExp(`(${escapedWord})`, 'gi'));
      hasMatch = parts.length > 1;
  } catch(e) {}

  const check = () => {
    setSubmitted(true);
    const isCorrect = input.toLowerCase().trim() === vocab.word.toLowerCase().trim();
    setIsCorrectVal(isCorrect);
    onAnswer(isCorrect, input || 'Không gõ gì', vocab.vietnamese_meaning || vocab.meaning, vocab.word);
    setTimeout(onNextStep, isCorrect ? 800 : 2500);
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-10 md:p-12 rounded-[3rem] shadow-xl border border-slate-100 relative">
        <button onClick={() => handleSpeak(sentence, language)} className="absolute top-6 right-6 p-4 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-colors shadow-sm" title="Nghe cả câu"><Volume2 size={24} /></button>
        <h3 className="text-2xl md:text-3xl font-medium leading-loose text-slate-700 text-center mt-8">
          
          {!hasMatch && (
              <span className={cn("inline-block min-w-[120px] border-b-4 mx-2 font-bold px-2 rounded-t-lg transition-colors", submitted ? (isCorrectVal ? "border-[#009900] text-[#009900] bg-green-50" : "border-red-500 text-red-600 bg-red-50") : "border-indigo-300 text-indigo-600 bg-indigo-50/50")}>
                {submitted ? (isCorrectVal ? vocab.word : (input || '...')) : (input || '...')}
              </span>
          )}

          {hasMatch ? parts.map((p, i) => 
            p.toLowerCase() === vocab.word.toLowerCase() ? (
              <span key={i} className={cn("inline-block min-w-[120px] border-b-4 mx-2 font-bold px-2 rounded-t-lg transition-colors", submitted ? (isCorrectVal ? "border-[#009900] text-[#009900] bg-green-50" : "border-red-500 text-red-600 bg-red-50") : "border-indigo-300 text-indigo-600 bg-indigo-50/50")}>
                {submitted ? (isCorrectVal ? p : (input || '...')) : (input || '...')}
              </span>
            ) : <span key={i}>{p}</span>
          ) : <span> {sentence}</span>}
          
        </h3>
        <p className="text-center text-slate-500 mt-8 font-bold text-lg">Điền từ có nghĩa là: <span className="text-indigo-600">{vocab.vietnamese_meaning || vocab.meaning}</span></p>
      </div>

      <div className="space-y-4">
        <input autoFocus type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !submitted && check()} disabled={submitted} className={cn("w-full bg-white border-4 rounded-3xl px-8 py-6 text-2xl font-bold text-center focus:outline-none transition-all shadow-sm", submitted ? (isCorrectVal ? "border-[#009900] text-[#009900] bg-green-50" : "border-red-500 text-red-600 bg-red-50") : "border-slate-100 focus:border-indigo-500")} placeholder="Nhập từ còn thiếu bằng tiếng gốc..." />
        {submitted && !isCorrectVal && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center font-medium text-slate-600 text-lg bg-red-50 py-3 rounded-2xl border border-red-100">
            Đáp án đúng là: <span className="font-bold text-emerald-600">{vocab.word}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function RoleplayGame({ vocabs, language, onComplete }: { vocabs: Vocabulary[], language: Language, onComplete: (score: number) => void }) {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const topics = vocabs.map(v => v.topic || 'other');
  const dominantTopic = topics.sort((a,b) => topics.filter(v => v===a).length - topics.filter(v => v===b).length).pop() || 'other';

  const getRoleContext = (topic: string, lang: Language) => {
      if (topic === 'education_and_learning') return lang === 'en' ? 'a strict but dedicated Teacher in a classroom' : 'ein strenger, aber engagierter Lehrer in einem Klassenzimmer';
      if (topic === 'work_and_business') return lang === 'en' ? 'a tough Job Interviewer or Business Partner' : 'ein strenger Personalvermittler oder Geschäftspartner';
      if (topic === 'travel_and_transport') return lang === 'en' ? 'a Customs Officer, Hotel Receptionist, or Tour Guide' : 'ein Zollbeamter, Hotelrezeptionist oder Reiseleiter';
      if (topic === 'health_and_body') return lang === 'en' ? 'a Doctor or Nutritionist in a clinic' : 'ein Arzt oder Ernährungsberater in einer Klinik';
      if (topic === 'daily_life') return lang === 'en' ? 'a friendly Neighbor, a Waiter, or a close Friend' : 'ein freundlicher Nachbar, ein Kellner oder ein enger Freund';
      return lang === 'en' ? 'a friendly Native Speaker' : 'ein freundlicher Muttersprachler';
  };
  const aiRole = getRoleContext(dominantTopic, language);

  const targetWordsWithLevel = vocabs.map(v => `${v.word} (Level: ${v.level || 'A2'})`);
  const targetWords = vocabs.map(v => v.word);

  const usedWords = targetWords.filter(word => 
    messages.some(m => m.role === 'user' && m.text.toLowerCase().includes(word.toLowerCase()))
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
     const initialMsg = language === 'en' 
        ? `Hello! I will be acting as ${aiRole}. I will ask you questions or give you situations, and you need to answer using words of our lesson. Let's start! Tell me, how are you today?`
        : `Hallo! Ich werde als ${aiRole} agieren. Ich werde dir Fragen stellen oder Situationen vorgeben, und du musst mit den Wörtern aus unserer Lektion antworten. Lass uns anfangen! Wie geht es dir heute?`;
     setMessages([{ role: 'ai', text: initialMsg }]);
     handleSpeak(initialMsg, language);
  }, [language]);

  const handleSend = async (textToSend: string) => {
     if (!textToSend.trim()) return;
     const newMessages = [...messages, { role: 'user' as const, text: textToSend }];
     setMessages(newMessages);
     setInput('');
     setIsLoading(true);

     try {
        // 1. Lấy khóa API và loại bỏ khoảng trắng thừa
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() || ""; 
        
        // 2. Lệnh hệ thống (Bảo toàn nguyên vẹn kịch bản sư phạm của Tiến sĩ)
        const systemPrompt = `Bạn đang đóng vai: ${aiRole}. Ngôn ngữ: ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Đức'}. 
        Mục tiêu: Ép học viên dùng các từ: ${targetWordsWithLevel.join(', ')}.
        Quy tắc bắt buộc:
        1. LUÔN LUÔN KẾT THÚC BẰNG MỘT CÂU HỎI: Sau khi nhận xét câu trả lời của học viên, bạn phải đặt ngay một câu hỏi mới hoặc tạo ra một tình huống tiếp nối. TUYỆT ĐỐI không được chỉ xác nhận rồi im lặng.
        2. VAI TRÒ CHỦ ĐỘNG: Bạn là người dẫn dắt câu chuyện. Nếu học viên trả lời ngắn, hãy gợi ý thêm hoặc hỏi sâu hơn để họ phải dùng từ vựng mục tiêu.
        3. SỬA LỖI: Luôn sửa lỗi ngữ pháp trong ngoặc đơn (...) ở đầu phản hồi nếu học viên nói sai.
        4. ĐỘ KHÓ: Điều chỉnh câu hỏi theo trình độ (A1-B2) của từ vựng đang học.`;

        // 3. Chuyển đổi lịch sử tin nhắn sang chuẩn của Google
        let finalContents = newMessages.map(m => ({
            role: m.role === 'ai' ? 'model' : 'user',
            parts: [{ text: m.text || " " }] // Dự phòng thêm dấu cách để tránh lỗi gửi tin nhắn rỗng
        }));

        // 4. Xử lý lỗi khi mới bắt đầu Game (Tránh việc AI là người nói cuối cùng)
        if (finalContents.length === 0) {
            finalContents = [{
                role: 'user',
                parts: [{ text: "Hãy bắt đầu cuộc hội thoại theo đúng kịch bản và vai trò của bạn!" }]
            }];
        }

        // 5. Đóng gói dữ liệu chuẩn API Gemini 1.5
        const reqBody = {
            // Khu vực chuẩn mực dành riêng cho Lệnh hệ thống
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            // Nội dung hội thoại
            contents: finalContents,
            generationConfig: { 
                temperature: 0.7, 
                maxOutputTokens: 200 
            }
        };

        // 6. Gọi API (Sử dụng đúng mô hình Gemini 2.5 Flash như Tiến sĩ đề xuất)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        // 7. BỘ LỌC BẮT BỆNH TỪ GOOGLE
        if (!res.ok) {
            const errorData = await res.json(); 
            console.error("🚨 CHI TIẾT LỖI TỪ GOOGLE:", errorData); 
            throw new Error(`Lỗi Google API: ${errorData.error?.message || 'Không xác định'}`);
        }

        const data = await res.json();
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            let reply = data.candidates[0].content.parts[0].text;
            reply = reply.replace(/\*/g, ''); 
            setMessages(prev => [...prev, { role: 'ai', text: reply }]);
            handleSpeak(reply, language);
        } else {
            throw new Error("Lỗi API");
        }
     } catch (error) {
         console.error("Lỗi gọi Gemini:", error);
         setMessages(prev => [...prev, { role: 'ai', text: "Lỗi kết nối AI. Vui lòng tải lại và thử lại." }]);
     } finally {
         setIsLoading(false);
     }
  };

  const startListening = () => {
     const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
     if (!SpeechRecognition) {
         alert("Trình duyệt không hỗ trợ nhận diện giọng nói."); return;
     }
     const recognition = new SpeechRecognition();
     recognition.lang = language === 'en' ? 'en-US' : 'de-DE';
     recognition.interimResults = false;
     
     recognition.onstart = () => setIsRecording(true);
     recognition.onresult = (event: any) => {
         const transcript = event.results[0][0].transcript;
         handleSend(transcript);
     };
     recognition.onerror = () => setIsRecording(false);
     recognition.onend = () => setIsRecording(false);
     
     recognition.start();
  };

  return (
    <div className="w-full bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col h-[650px] max-h-[70dvh] md:max-h-[85vh]">
      <div className="bg-slate-50 p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-start justify-between z-10 gap-4">
         <div className="flex-1">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1"><BrainCircuit className="text-indigo-600" /> AIBTeM Roleplay</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Đang đóng vai: <span className="text-indigo-500">{aiRole}</span></p>
            
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-slate-500 font-medium mr-1">Mục tiêu:</span>
              {targetWords.map((w, idx) => {
                const isUsed = usedWords.includes(w);
                return (
                  <span key={idx} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-500", isUsed ? "bg-emerald-100 text-emerald-600 line-through scale-95 opacity-70" : "bg-white border border-indigo-100 text-indigo-600 shadow-sm")}>
                    {w}
                  </span>
                )
              })}
            </div>
         </div>

         <button onClick={() => onComplete(usedWords.length)} className="bg-red-50 text-red-600 px-5 py-3 rounded-xl text-sm font-bold hover:bg-red-100 transition-all shrink-0 shadow-sm border border-red-100 flex items-center gap-2">
            Kết thúc đàm thoại
         </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50/50">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex max-w-[90%] md:max-w-[85%]", m.role === 'user' ? "ml-auto justify-end" : "mr-auto")}>
            <div className={cn("p-4 md:p-5 rounded-3xl text-base md:text-lg shadow-sm leading-relaxed", m.role === 'user' ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm")}>
              {m.text}
            </div>
            {m.role === 'ai' && (
              <button onClick={() => handleSpeak(m.text, language)} className="ml-2 self-end text-slate-400 hover:text-indigo-600 transition-colors p-3 bg-white rounded-full shadow-sm shrink-0 border border-slate-100"><Volume2 size={18} /></button>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex max-w-[85%] mr-auto">
            <div className="p-4 rounded-3xl bg-white border border-slate-200 text-slate-500 rounded-tl-sm shadow-sm flex items-center gap-2 font-medium">
              <Loader2 className="animate-spin text-indigo-500" size={18} /> Đang suy nghĩ...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3 relative">
          <button onClick={startListening} disabled={isLoading || isRecording} title="Ghi âm giọng nói" className={cn("p-4 rounded-2xl transition-all shadow-sm shrink-0", isRecording ? "bg-red-500 text-white animate-pulse" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100")}>
            <Mic size={24} />
          </button>
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend(input)} disabled={isLoading || isRecording} placeholder={isRecording ? "Đang lắng nghe..." : "Gõ hoặc đọc câu trả lời của bạn..."} className="flex-1 bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl px-4 md:px-6 py-4 text-base md:text-lg outline-none transition-all border-2 placeholder:text-slate-400 font-medium text-slate-800" />
          <button onClick={() => handleSend(input)} disabled={!input.trim() || isLoading} className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shrink-0">
            <ChevronRight size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportView({ results, language, activeLessonId, onPlayAIGame, onGoToTopics }: { results: GameResult[], language: Language, activeLessonId: string, onPlayAIGame: () => void, onGoToTopics: () => void }) {
  const currentSessionResults = results.filter(r => r.lessonId === activeLessonId && r.language === language);
  
  const chartData = currentSessionResults.map((r, i) => ({
    name: getGameTitle(r.gameType),
    score: r.score,
    total: r.total,
    type: r.gameType
  }));

  const totalScore = currentSessionResults.reduce((acc, r) => acc + r.score, 0);
  const totalPossible = currentSessionResults.reduce((acc, r) => acc + r.total, 0);
  const accuracy = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

  const mistakeMap: Record<string, { count: number, correct: string, games: Set<string> }> = {};
  currentSessionResults.forEach(r => {
      if (r.mistakes && r.mistakes.length > 0) {
          r.mistakes.forEach(m => {
              if (!mistakeMap[m.word]) {
                  mistakeMap[m.word] = { count: 0, correct: m.correctAnswer, games: new Set() };
              }
              mistakeMap[m.word].count += 1;
              mistakeMap[m.word].games.add(r.gameType);
          });
      }
  });

  const mistakesList = Object.keys(mistakeMap).map(word => ({ word, ...mistakeMap[word] })).sort((a,b) => b.count - a.count);

  const getRecommendation = (gamesSet: Set<string>) => {
      if (gamesSet.has('writing')) return "Khuyến nghị: Chơi lại game Luyện viết hoặc Điền từ để nhớ mặt chữ.";
      if (gamesSet.has('matching')) return "Khuyến nghị: Ôn lại bằng thẻ lật Flashcard để củng cố phản xạ.";
      if (gamesSet.has('quiz')) return "Khuyến nghị: Đọc kỹ lại từ điển hoặc chơi Flashcard chậm lại.";
      return "Khuyến nghị: Xem lại thẻ Flashcard.";
  };

  const getStaticFeedback = (acc: number) => {
      if (acc >= 90) return "AIBTeM nhận thấy Bạn đã nắm vững gần như toàn bộ từ vựng trong bài học này! Phản xạ xuất sắc. Bạn hoàn toàn có thể chuyển sang bài học mới khó hơn.";
      if (acc >= 80) return "Thành tích rất tốt! Bạn đã ghi nhớ được hầu hết các từ vựng. Chỉ cần ôn tập lại một chút để đạt điểm tuyệt đối nhé.";
      if (acc >= 70) return "Kết quả rất khả quan! Bạn đã nhớ được phần lớn từ vựng. Hãy xem kỹ bảng tổng hợp lỗi sai bên dưới để khắc phục.";
      if (acc >= 60) return "Bạn đang tiến bộ! Kết quả ở mức khá, tuy nhiên vẫn còn một số từ gây nhầm lẫn.";
      return "Đừng nản chí! Việc học ngôn ngữ cần sự lặp lại. AIBTeM khuyên bạn nên lướt qua thẻ Flashcard thêm 2-3 vòng trước khi làm trắc nghiệm.";
  };

  return (
    <div className="w-full space-y-8 pb-20">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Báo cáo Tổng hợp Bài học</h2>
        <p className="text-slate-500">Chi tiết kết quả các trò chơi bạn vừa hoàn thành.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" /> Biểu đồ kỹ năng
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry: any, index: number) => {
                    const colorMap: Record<string, string> = {
                      'flashcards': '#3b82f6', 'quiz': '#6366f1', 'matching': '#f97316',
                      'writing': '#10b981', 'fill': '#ec4899', 'roleplay': '#f43f5e'
                    };
                    return <Cell key={`cell-${index}`} fill={colorMap[entry.type] || '#cbd5e1'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl text-white flex flex-col justify-center items-center text-center relative overflow-hidden">
  {/* LINH VẬT THAY THẾ CÁI CÚP (TROPHY) */}
  <div className="mb-4">
    {currentSessionResults.length === 0 ? (
      <AIBTeMBot emotion="idle" className="w-40 h-40" />
    ) : accuracy >= 50 ? (
      <AIBTeMBot emotion="happy" className="w-40 h-40" />
    ) : (
      <AIBTeMBot emotion="sad" className="w-40 h-40" />
    )}
  </div>
  
  <h3 className="text-2xl font-bold mb-2">
    {currentSessionResults.length === 0 
      ? "Chưa có thông tin" 
      : accuracy >= 50 
        ? "Tuyệt vời!" 
        : "Cố gắng lên nhé!"}
  </h3>
  
  <div className="text-6xl font-black mb-4">
    {totalScore} <span className="text-3xl text-indigo-300">/ {totalPossible}</span>
  </div>
  
  <div className="bg-indigo-500/50 px-8 py-3 rounded-full font-bold text-xl">
    Độ chính xác: {accuracy}%
  </div>
  
  {/* Hiệu ứng cổ vũ bổ sung khi đạt điểm cao */}
  {accuracy >= 80 && (
    <div className="absolute top-4 right-4 text-4xl animate-bounce">🎉</div>
  )}
  
  <div className="absolute -right-10 -bottom-10 opacity-10">
    <BarChart3 size={200} />
  </div>
</div>
      </div>

      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-slate-100">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <BrainCircuit className="text-indigo-600" /> AIBTeM Nhận xét chung
        </h3>
        <div className="prose prose-slate max-w-none bg-indigo-50 p-6 rounded-3xl border border-indigo-100 mb-8">
            <p className="text-indigo-800 text-lg leading-relaxed font-medium">
                {currentSessionResults.length === 0 ? "Bạn chưa hoàn thành trò chơi nào." : getStaticFeedback(accuracy)}
            </p>
        </div>

        {mistakesList.length > 0 && (
            <div>
                <h4 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2"><AlertCircle size={20} /> Phân tích Từ vựng cần lưu ý</h4>
                <div className="space-y-4">
                    {mistakesList.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <strong className="text-xl text-slate-800">{item.word}</strong>
                                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">Sai {item.count} lần</span>
                                </div>
                                <div className="text-emerald-600 font-medium">Nghĩa đúng: {item.correct}</div>
                            </div>
                            <div className="bg-white border border-orange-100 p-3 rounded-xl text-sm text-orange-700 font-medium md:max-w-xs w-full text-center shadow-sm">
                                {getRecommendation(item.games)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
      
      <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 md:p-8 rounded-r-[2.5rem] rounded-l-xl shadow-sm mt-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-indigo-800 flex items-center gap-2 mb-2">
            <span className="text-2xl">🚀</span> Thử thách Nâng cao: Giao tiếp cùng AI
          </h3>
          <p className="text-slate-700 text-base mb-3 leading-relaxed">
            Chúc mừng bạn đã hoàn thành bài học! Để vận dụng ngay các từ vựng này vào thực tế, hãy thử sức trò chuyện trực tiếp với <strong>Trợ lý AIBTeM</strong>.
          </p>
          <ul className="list-disc list-inside text-indigo-700/80 text-sm font-medium">
            <li>Hình thức: Đóng vai (Role-play) tình huống thực tế.</li>
            <li>Phần tùy chọn (không bắt buộc) dành cho chuyên gia muốn luyện phản xạ.</li>
          </ul>
        </div>
        
        <div className="flex flex-col gap-3 min-w-[200px] shrink-0">
          <button 
            onClick={onPlayAIGame}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <Mic size={20} /> Chơi Game AI ngay
          </button>
          <button 
            onClick={onGoToTopics}
            className="w-full bg-white hover:bg-slate-50 text-indigo-600 font-bold py-3 px-6 rounded-2xl transition-all border border-indigo-100 flex items-center justify-center gap-2"
          >
            Quay lại Chủ đề
          </button>
        </div>
      </div>

    </div>
  );
}