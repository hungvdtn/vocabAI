import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Languages, 
  PlusCircle, 
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
import { generateDistractors, generateExampleSentence, analyzePerformance, translateWord, checkLocalDictionary } from './services/ai';
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

// IMPORT TRỰC TIẾP CƠ SỞ DỮ LIỆU TỪ ĐIỂN 3000 TỪ
import enDictDataRaw from './data/en_3000.json';
import deDictDataRaw from './data/de_3000.json';

// Types
type Language = 'en' | 'de';
type View = 'home' | 'topics' | 'input' | 'library' | 'games' | 'report' | 'dictionary';
type GameType = 'flashcards' | 'quiz' | 'matching' | 'writing' | 'fill';

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
  gameType: GameType;
  score: number;
  total: number;
  timestamp: number;
  language: Language;
}

// ------------------------------------------------------------------------------------
// HỆ THỐNG ÂM THANH NATIVE
// ------------------------------------------------------------------------------------
const handleSpeak = (text: string, lang: Language) => {
  if (!('speechSynthesis' in window)) {
    console.warn("Trình duyệt không hỗ trợ âm thanh.");
    return;
  }
  
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  const targetLang = lang === 'en' ? 'en-US' : 'de-DE';
  utterance.lang = targetLang;
  
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const langPrefix = lang === 'en' ? 'en' : 'de';
    
    let selectedVoice = voices.find(v => 
      v.lang.toLowerCase().startsWith(langPrefix) && 
      (v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Google'))
    );
    
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang.toLowerCase().startsWith(langPrefix));
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
  }
  
  window.speechSynthesis.speak(utterance);
};

const highlightWordInSentence = (sentence: string, targetWord: string) => {
  if (!sentence || !targetWord) return sentence;
  const regex = new RegExp(`(${targetWord})`, 'gi');
  const parts = sentence.split(regex);
  return parts.map((part, i) => 
    regex.test(part) ? <span key={i} className="text-blue-600 font-bold">{part}</span> : part
  );
};

const renderPhonetic = (rawPhonetic?: string) => {
  if (!rawPhonetic) return null;
  let clean = rawPhonetic.trim();
  if (clean.startsWith('[') && clean.endsWith(']')) {
    clean = clean.substring(1, clean.length - 1);
  }
  clean = clean.replace(/\//g, '');
  return `/${clean}/`;
};

const isDefSentence = (text?: string) => {
  if (!text) return false;
  const t = text.trim();
  return t.endsWith('.') || t.endsWith('!') || t.endsWith('?');
};

// ------------------------------------------------------------------------------------
// THUẬT TOÁN SIÊU LỌC CHỦ ĐỀ CHO TIẾNG ĐỨC VÀ TIẾNG ANH MỞ RỘNG
// ------------------------------------------------------------------------------------
const KNOWN_TOPIC_IDS = [
  'education_and_learning', 'work_and_business', 'daily_life', 
  'health_and_body', 'science_and_technology', 'society_and_culture', 
  'nature_and_environment', 'travel_and_transport', 'other'
];

const removeAccents = (str: string) => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
};

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

// Components
const RobotAnimation = ({ type }: { type: 'happy' | 'thinking' | 'sad' }) => {
  const lottiePaths = {
    happy: 'https://assets10.lottiefiles.com/packages/lf20_v7rc87p0.json',
    thinking: 'https://assets10.lottiefiles.com/packages/lf20_i9mxcD.json',
    sad: 'https://assets10.lottiefiles.com/packages/lf20_96bovdur.json'
  };
  
  return (
    <div className="w-48 h-48 mx-auto">
      <Lottie animationData={null} path={lottiePaths[type]} loop={true} />
    </div>
  );
};

const getGameTitle = (type: GameType) => {
  switch(type) {
    case 'flashcards': return 'Flashcards';
    case 'quiz': return 'Trắc nghiệm';
    case 'matching': return 'Nối từ';
    case 'writing': return 'Luyện viết';
    case 'fill': return 'Điền từ';
    default: return '';
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [view, setView] = useState<View>('home');
  const [activeGame, setActiveGame] = useState<GameType | null>(null);
  
  const [vocabList, setVocabList] = useState<Vocabulary[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  
  const [playVocabList, setPlayVocabList] = useState<Vocabulary[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
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
      console.error("Login Error:", error);
      if (error.code === 'auth/configuration-not-found' || error.code === 'auth/unauthorized-domain') {
        alert("Lỗi: Firebase Authentication chưa được cấu hình hoặc tên miền chưa được cấp phép. Bạn có thể sử dụng 'Test Mode' để xem giao diện.");
      } else {
        alert("Lỗi đăng nhập: " + error.message);
      }
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
    const mockUser: any = {
      uid: 'test-user-123',
      displayName: 'Người dùng Thử nghiệm',
      email: 'test@example.com',
      photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test'
    };
    setUser(mockUser);
  };

  useEffect(() => {
    if (!user) return;
    
    if (isTestMode) {
      const mockVocab: Vocabulary[] = [
        { id: '1', word: 'Hello', meaning: 'Xin chào', type: 'noun', example: 'Hello, how are you?', phonetic: '/həˈloʊ/', english_definition: 'Used as a greeting or to begin a phone conversation.', userId: 'test-user-123', language: 'en', createdAt: Date.now() }
      ];
      setVocabList(mockVocab.filter(v => v.language === language));
      return;
    }

    const q = query(
      collection(db, 'vocabularies'), 
      where('userId', '==', user.uid),
      where('language', '==', language)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vocabulary));
      setVocabList(items);
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    return () => unsubscribe();
  }, [user, language, isTestMode]);

  const playSound = (type: 'correct' | 'wrong') => {
    const audio = new Audio(type === 'correct' ? 'assets/sound-correct.mp3' : 'assets/sound-wrong.mp3');
    audio.play().catch(() => {}); 
  };

  const deleteLesson = async (lessonId: string) => {
    try {
      await deleteDoc(doc(db, 'lessons', lessonId));
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Không thể xóa bài học.");
    }
  };

  const handleGameComplete = async (res: GameResult) => {
    setGameResults(prev => [...prev, { ...res, language }]);
    if (activeLessonId && !isTestMode) {
      try {
        const lessonRef = doc(db, 'lessons', activeLessonId);
        const currentLesson = lessons.find(l => l.id === activeLessonId);
        await updateDoc(lessonRef, {
          lastPracticed: Date.now(),
          practiceCount: (currentLesson?.practiceCount || 0) + 1
        });
      } catch (error) {
        console.error("Lỗi cập nhật lịch sử:", error);
      }
    }
    setActiveGame(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
            <Languages className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Vocab AIBTeM</h1>
          <p className="text-slate-500 mb-8">Nâng tầm vốn từ vựng Tiếng Anh & Đức với sức mạnh AIBTeM.</p>
          <button 
            onClick={login}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3 mb-4"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/pjax/google.png" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
            Đăng nhập với Google
          </button>

          <button 
            onClick={enterTestMode}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3"
          >
            <Gamepad2 size={20} className="text-indigo-600" />
            Vào thẳng không cần đăng nhập (Test Mode)
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setActiveGame(null); }}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Languages className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">Vocab AIBTeM</span>
          </div>
          
          <div className="hidden md:flex items-center gap-2 lg:gap-4 overflow-x-auto">
            <NavButton active={view === 'topics'} onClick={() => setView('topics')} icon={<LayoutGrid size={18} />} label="Chủ đề" />
            <NavButton active={view === 'input'} onClick={() => setView('input')} icon={<PlusCircle size={18} />} label="Nhập liệu" />
            <NavButton active={view === 'library'} onClick={() => setView('library')} icon={<FileText size={18} />} label="Thư viện" />
            <NavButton active={view === 'games'} onClick={() => setView('games')} icon={<Gamepad2 size={18} />} label="Trò chơi" />
            <NavButton active={view === 'report'} onClick={() => setView('report')} icon={<BarChart3 size={18} />} label="Báo cáo" />
            <NavButton active={view === 'dictionary'} onClick={() => setView('dictionary')} icon={<BookOpen size={18} />} label="Từ điển" />
          </div>

          <div className="flex items-center gap-3 lg:gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => { setLanguage('en'); setEditingLesson(null); setPlayVocabList([]); setActiveLessonId(null); }}
                className={cn("px-2 lg:px-3 py-1 rounded-lg text-sm font-medium transition-all", language === 'en' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
              >
                EN
              </button>
              <button 
                onClick={() => { setLanguage('de'); setEditingLesson(null); setPlayVocabList([]); setActiveLessonId(null); }}
                className={cn("px-2 lg:px-3 py-1 rounded-lg text-sm font-medium transition-all", language === 'de' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
              >
                DE
              </button>
            </div>
            
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-2 p-1 pr-2 lg:pr-3 rounded-full hover:bg-slate-100 transition-all border border-slate-200"
              >
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-slate-200" alt="User" />
                <ChevronDown size={14} className={cn("text-slate-400 transition-transform hidden sm:block", isMenuOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50"
                  >
                    <div className="px-4 py-2 border-b border-slate-50 mb-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tài khoản</p>
                      <p className="text-sm font-bold text-slate-900 truncate">{user.displayName}</p>
                    </div>
                    
                    {isTestMode ? (
                      <button 
                        onClick={() => { login(); setIsMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                      >
                        <UserIcon size={16} /> Đăng nhập Google
                      </button>
                    ) : (
                      <button 
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                      >
                        <LogOut size={16} /> Đăng xuất
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {activeGame && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-indigo-600 text-white overflow-hidden w-full"
          >
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-1.5 rounded-lg">
                  <Gamepad2 size={18} />
                </div>
                <span className="font-bold text-sm uppercase tracking-[0.2em]">
                  Đang chơi: {getGameTitle(activeGame)}
                </span>
              </div>
              <button 
                onClick={() => setActiveGame(null)}
                className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Thoát
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-grow w-full flex flex-col">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div key="home" className="w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <HomeView setView={setView} language={language} user={user} lessons={lessons} />
            </motion.div>
          )}
          {view === 'topics' && (
            <motion.div key={`topics-${language}`} className="w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <TopicLibraryView 
                language={language} 
                lessons={lessons}
                onOpenInInput={(vocabData, generatedTitle) => {
                  setEditingLesson({
                    title: generatedTitle,
                    vocabularies: vocabData,
                    language,
                    wordCount: vocabData.length,
                    userId: user.uid,
                    userName: user.displayName || '',
                    createdAt: Date.now()
                  } as Lesson);
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
              <InputView 
                language={language} 
                user={user} 
                initialLesson={editingLesson || undefined}
                onSaved={() => {
                  setEditingLesson(null);
                  setView('library');
                }} 
              />
            </motion.div>
          )}
          {view === 'games' && (
            <motion.div key="games" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GamesView 
                vocabList={playVocabList} 
                language={language} 
                onComplete={handleGameComplete} 
                playSound={playSound}
                activeGame={activeGame}
                setActiveGame={setActiveGame}
                onGoToLibrary={() => setView('library')}
                onGoToTopics={() => setView('topics')}
                onGoToInput={() => setView('input')}
                hasLessons={lessons.some(l => l.language === language)}
              />
            </motion.div>
          )}
          {view === 'library' && (
            <motion.div key="library" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LibraryView 
                lessons={lessons} 
                language={language}
                onEdit={(lesson) => {
                  setEditingLesson(lesson);
                  setView('input');
                }}
                onPlay={(lesson) => {
                  setPlayVocabList(lesson.vocabularies);
                  setActiveLessonId(lesson.id || null);
                  setView('games');
                }}
                onDelete={deleteLesson}
              />
            </motion.div>
          )}
          {view === 'report' && (
            <motion.div key="report" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ReportView results={gameResults} language={language} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 z-50">
        <MobileNavButton active={view === 'topics'} onClick={() => setView('topics')} icon={<LayoutGrid />} />
        <MobileNavButton active={view === 'input'} onClick={() => setView('input')} icon={<PlusCircle />} />
        <MobileNavButton active={view === 'games'} onClick={() => setView('games')} icon={<Gamepad2 />} />
        <MobileNavButton active={view === 'dictionary'} onClick={() => setView('dictionary')} icon={<BookOpen />} />
        <MobileNavButton active={view === 'home'} onClick={() => { setView('home'); setActiveGame(null); }} icon={<Home />} />
      </div>
      <Footer />
    </div>
  );
}

// Sub-components
function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition-all whitespace-nowrap",
        active ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon }: { active: boolean, onClick: () => void, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-3 rounded-2xl transition-all",
        active ? "bg-indigo-600 text-white shadow-lg -translate-y-2" : "text-slate-400"
      )}
    >
      {icon}
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
        <motion.div 
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-orange-50 border border-orange-200 p-6 rounded-[2rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 p-3 rounded-full text-orange-600 shrink-0">
              <AlertCircle size={28} />
            </div>
            <div>
              <h3 className="font-bold text-orange-800 text-lg">AIBTeM nhắc nhở ôn tập!</h3>
              <p className="text-orange-600/80">Anh có <strong className="text-orange-700">{needsReview.length} bài học</strong> đã tới hạn luyện tập lại.</p>
            </div>
          </div>
          <button 
            onClick={() => setView('library')}
            className="bg-orange-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-700 transition-all shrink-0 shadow-md"
          >
            Tới Thư viện ôn ngay
          </button>
        </motion.div>
      )}

      <div className="bg-indigo-600 rounded-[2.5rem] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">Chào mừng, {user.displayName?.split(' ')[0]}!</h2>
          <p className="text-indigo-100 text-lg mb-8 opacity-90">Bạn đã sẵn sàng chinh phục {language === 'en' ? 'Tiếng Anh' : 'Tiếng Đức'} hôm nay chưa?</p>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => setView('topics')}
              className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-bold hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-lg"
            >
              Khám phá Chủ đề <ChevronRight size={20} />
            </button>
            <button 
              onClick={() => setView('input')}
              className="bg-indigo-500/30 backdrop-blur-md border border-indigo-400/50 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-500/40 transition-all"
            >
              Thêm từ mới
            </button>
          </div>
        </div>
        <div className="absolute right-[-5%] bottom-[-10%] opacity-20 rotate-12">
          <Languages size={300} />
        </div>
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

// --- TOPIC LIBRARY VIEW ---
function TopicLibraryView({ language, lessons, onOpenInInput }: { language: Language, lessons: Lesson[], onOpenInInput: (vocab: Vocabulary[], title: string) => void }) {
  
  const currentDict = useMemo(() => {
    const rawDict = language === 'en' ? enDictDataRaw : deDictDataRaw;
    
    return rawDict.map(w => {
      if (w.topic && KNOWN_TOPIC_IDS.includes(w.topic)) {
          return w;
      }
      return {
          ...w,
          topic: mapSubTopicToMainTopic(w.topic)
      };
    });
  }, [language]);

  const [selectedTopic, setSelectedTopic] = useState<any | null>(null);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());

  const learnedWordsMap = useMemo(() => {
    const map = new Map<string, string>();
    lessons.filter(l => l.language === language).forEach(lesson => {
      lesson.vocabularies.forEach(v => {
        if (!map.has(v.word)) map.set(v.word, lesson.title);
      });
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

  const getTopicWords = (topicId: string) => {
    return currentDict.filter(w => w.topic === topicId);
  };

  const toggleWordSelection = (word: string) => {
    const newSet = new Set(selectedWords);
    if (newSet.has(word)) newSet.delete(word);
    else newSet.add(word);
    setSelectedWords(newSet);
  };

  const formatToVocab = (wordsArray: any[]): Vocabulary[] => {
    return wordsArray.map(w => ({
      word: w.word,
      meaning: w.vietnamese_meaning || w.meaning,
      type: w.part_of_speech,
      phonetic: w.phonetic,
      example: language === 'en' ? w.example_english : w.example_german,
      article: w.article,
      plural: w.plural,
      language: language,
      userId: 'system',
      createdAt: Date.now()
    }));
  };

  const generateLessonTitle = (topicName: string, prefix: 'NN' | 'TC') => {
    const baseName = `${topicName} - ${prefix}`;
    const matchingLessons = lessons.filter(l => l.language === language && l.title.startsWith(baseName));
    let maxSeq = 0;
    matchingLessons.forEach(l => {
      const match = l.title.match(/(\d+)$/);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });
    const nextSeq = (maxSeq + 1).toString().padStart(2, '0');
    return `${baseName}${nextSeq}`;
  };

  const handleLearnRandom = (topicId: string, topicName: string) => {
    const wordsInTopic = getTopicWords(topicId);
    if (wordsInTopic.length === 0) return;
    
    let unlearnedWords = wordsInTopic.filter(w => !learnedWordsMap.has(w.word));
    if (unlearnedWords.length === 0) {
      alert("Chúc mừng! Bạn đã lưu/học toàn bộ từ vựng trong chủ đề này. Hệ thống sẽ bốc lại các từ cũ nhé.");
      unlearnedWords = wordsInTopic; 
    }

    const shuffled = [...unlearnedWords].sort(() => 0.5 - Math.random()).slice(0, 15);
    const title = generateLessonTitle(topicName, 'NN');
    onOpenInInput(formatToVocab(shuffled), title);
  };

  const handleLearnSelected = (topicName: string) => {
    if (selectedWords.size < 5) return;
    
    const selectedLearned = Array.from(selectedWords).filter(w => learnedWordsMap.has(w));
    if (selectedLearned.length > 0) {
      const msg = selectedLearned.slice(0, 3).join(', ') + (selectedLearned.length > 3 ? '...' : '');
      const lessonName = learnedWordsMap.get(selectedLearned[0]);
      if(!window.confirm(`Một số từ bạn chọn (${msg}) đã có trong bài "${lessonName}". Bạn vẫn muốn tiếp tục đưa vào bài học mới?`)) {
        return;
      }
    }

    const wordsToLearn = currentDict.filter(w => selectedWords.has(w.word));
    const title = generateLessonTitle(topicName, 'TC');
    onOpenInInput(formatToVocab(wordsToLearn), title);
  };

  if (selectedTopic) {
    const words = getTopicWords(selectedTopic.id);
    return (
      <div className="w-full pb-32">
        <button 
          onClick={() => { setSelectedTopic(null); setSelectedWords(new Set()); }} 
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold mb-6 transition-colors"
        >
          <ChevronLeft size={20} /> Quay lại danh sách
        </button>
        
        <div className={cn("rounded-[2.5rem] p-8 md:p-12 text-white relative overflow-hidden shadow-xl mb-8", selectedTopic.color)}>
          <div className="relative z-10">
            <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm">
              <selectedTopic.icon size={32} />
            </div>
            <h2 className="text-4xl font-bold mb-2">{selectedTopic.name}</h2>
            <p className="text-white/80 text-lg mb-8">{selectedTopic.desc}</p>
            <div className="flex flex-wrap items-center gap-4">
              <span className="bg-black/20 px-6 py-3 rounded-xl font-bold backdrop-blur-md">
                Tổng cộng: {words.length} từ
              </span>
              <span className="bg-white/20 px-6 py-3 rounded-xl font-bold backdrop-blur-md text-emerald-100">
                Đã lưu: {words.filter(w => learnedWordsMap.has(w.word)).length} từ
              </span>
              <button 
                onClick={() => handleLearnRandom(selectedTopic.id, selectedTopic.name)}
                disabled={words.length === 0}
                className="bg-white text-slate-900 px-8 py-3 rounded-xl font-bold hover:scale-105 transition-transform flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:hover:scale-100"
              >
                <Shuffle size={20} className={selectedTopic.textCol} /> Học 15 từ ngẫu nhiên
              </button>
              <button 
                onClick={() => handleLearnSelected(selectedTopic.name)}
                disabled={selectedWords.size < 5}
                className={cn(
                  "px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg",
                  selectedWords.size >= 5 
                    ? "bg-emerald-500 text-white hover:bg-emerald-400 hover:scale-105" 
                    : "bg-white/20 text-white/50 cursor-not-allowed"
                )}
              >
                <CheckSquare size={20} /> Học lựa chọn ({selectedWords.size} từ)
              </button>
            </div>
            {selectedWords.size > 0 && selectedWords.size < 5 && (
              <p className="text-sm text-orange-200 mt-3 font-medium">* Vui lòng chọn tối thiểu 5 từ để tạo bài học.</p>
            )}
          </div>
          <div className="absolute -right-10 -bottom-10 opacity-10">
            <selectedTopic.icon size={300} />
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">Danh sách từ vựng</h3>
            {words.length > 0 && (
              <span className="text-sm font-medium text-slate-400">Tích vào ô vuông để chọn từ.</span>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {words.length > 0 ? words.map((vocab, idx) => {
              const isLearned = learnedWordsMap.has(vocab.word);
              const lessonName = learnedWordsMap.get(vocab.word);

              return (
                <div key={idx} className={cn("p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group", isLearned && "bg-emerald-50/30")}>
                  <div 
                    className="flex flex-1 items-start gap-4 cursor-pointer"
                    onClick={() => toggleWordSelection(vocab.word)}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedWords.has(vocab.word)}
                      readOnly
                      className="w-5 h-5 mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className={cn("font-bold text-xl transition-colors", isLearned ? "text-emerald-700" : "text-slate-900 group-hover:text-indigo-600")}>
                          {vocab.article && <span className={cn(
                            "font-normal mr-2",
                            vocab.article.toLowerCase() === 'der' ? "text-blue-500" :
                            vocab.article.toLowerCase() === 'die' ? "text-red-500" : "text-green-500"
                          )}>{vocab.article}</span>}
                          {vocab.word}
                        </span>
                        {vocab.phonetic && <span className="text-sm font-mono text-slate-400">{renderPhonetic(vocab.phonetic)}</span>}
                      </div>
                      <div className={cn("mb-1", isLearned ? "text-emerald-600/80" : "text-slate-600")}>
                        {vocab.vietnamese_meaning || vocab.meaning}
                      </div>
                      {isLearned && (
                        <div className="text-xs font-bold text-emerald-500 flex items-center gap-1 mt-1">
                          <CheckCircle2 size={12} /> Đã lưu trong bài: {lessonName}
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSpeak(vocab.word, language); }}
                    className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center transition-all ml-4 shrink-0"
                  >
                    <Volume2 size={20} />
                  </button>
                </div>
              );
            }) : (
              <div className="p-12 text-center text-slate-400">
                Đang cập nhật từ vựng cho chủ đề này...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-32">
      <div className="mb-10">
        <h2 className="text-4xl font-bold text-slate-900 mb-2">Thư viện Chủ đề</h2>
        <p className="text-slate-500 text-lg">Học từ vựng theo ngữ cảnh để ghi nhớ sâu hơn.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {topics.map((topic) => {
          const count = getTopicWords(topic.id).length;
          if (topic.id === 'other' && count === 0) return null;

          return (
            <motion.button 
              key={topic.id}
              whileHover={{ y: -8 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedTopic(topic)}
              className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 text-left transition-all hover:shadow-xl group relative overflow-hidden flex flex-col h-full"
            >
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", topic.bgSoft, topic.textCol)}>
                <topic.icon size={28} />
              </div>
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
    </div>
  );
}

// --- DICTIONARY VIEW CHUYÊN SÂU ---
function DictionaryView({ language }: { language: Language }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedWord, setSelectedWord] = useState<any | null>(null);
  
  const [aiTranslation, setAiTranslation] = useState<string[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm('');
    setSelectedWord(null);
    setSuggestions([]);
    setAiTranslation(null);
  }, [language]);

  const currentDict: any[] = language === 'en' ? enDictDataRaw : deDictDataRaw;

  const handleSearchChange = (text: string) => {
    setSearchTerm(text);
    setAiTranslation(null); 
    if (text.trim() === '') {
      setSuggestions([]);
      setSelectedWord(null);
      return;
    }
    
    const results = currentDict.filter(item => 
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm.trim() !== '') {
      const exactMatch = currentDict.find(item => item.word && item.word.toLowerCase() === searchTerm.toLowerCase().trim());
      if (exactMatch) {
        handleSelectWord(exactMatch);
      } else if (suggestions.length > 0) {
        handleSelectWord(suggestions[0]);
      } else {
        setSuggestions([]);
      }
    }
  };

  const handleAITranslate = async () => {
    if (!searchTerm.trim()) return;
    setIsTranslating(true);
    try {
      const data = await translateWord(searchTerm, language, new AbortController().signal);
      let meaningArray: string[] = [];
      if (data && Array.isArray(data.translations)) {
        meaningArray = data.translations;
      } else if (typeof data === 'string' && data.trim() !== '') {
        meaningArray = data.split(',').map((s:string) => s.trim()).filter((s:string) => s !== '');
      }
      setAiTranslation(meaningArray);
    } catch (error) {
      console.error(error);
      setAiTranslation(["Lỗi kết nối AIBTeM. Vui lòng thử lại sau."]);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    const GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycb.../exec"; 
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Lỗi khi lưu vào Google Sheets!");
    } finally {
      setIsSaving(false);
    }
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = language === 'en' ? 'en-US' : 'de-DE';
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSearchTerm(transcript);
        handleSearchChange(transcript);
      };
      recognition.start();
    } else {
      alert("Trình duyệt của bạn không hỗ trợ tính năng nhận diện giọng nói (Vui lòng sử dụng Google Chrome).");
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchRef]);

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
            placeholder="Nhập từ vựng cần tra..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-white border-2 border-slate-200 rounded-[2rem] pl-16 pr-16 py-4 text-xl font-medium focus:border-indigo-500 outline-none transition-all shadow-sm"
          />
          <button 
            onClick={startVoiceSearch} 
            className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors p-2 bg-slate-50 hover:bg-indigo-50 rounded-full"
            title="Tra từ bằng giọng nói"
          >
            <Mic size={20} />
          </button>
        </div>

        <AnimatePresence>
          {suggestions.length > 0 && !selectedWord && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50"
            >
              {suggestions.map((item, idx) => (
                <div 
                  key={idx}
                  onClick={() => handleSelectWord(item)}
                  className="px-6 py-4 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-none flex items-center justify-between"
                >
                  <span className="text-lg font-bold text-slate-800">{item.word}</span>
                  <span className="text-slate-500 truncate ml-4 max-w-xs">{item.vietnamese_meaning || item.meaning}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!selectedWord && (!searchTerm || (searchTerm && suggestions.length > 0)) && (
        <div className="w-full mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-white p-8 md:p-12 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="space-y-4">
            <h3 className="text-2xl font-black text-indigo-700 mb-2">AIBTeM Dictionary</h3>
            <div className="space-y-3 text-slate-600 text-sm md:text-base leading-relaxed">
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Từ điển trực tuyến miễn phí;</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Tra cứu nhanh;</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Kho từ đồ sộ, gợi ý thông minh;</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Nghe được phát âm;</p>
              <p className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500 shrink-0" size={18}/> Hỗ trợ tra từ bằng giọng nói.</p>
            </div>
          </div>
          <div className="flex justify-center">
            <img 
              src="https://placehold.co/300x300/4f46e5/white?text=AIBTeM+Mochi" 
              alt="Mochi Placeholder" 
              className="w-48 h-48 md:w-64 md:h-64 object-contain animate-[bounce_3s_infinite]" 
            />
          </div>
        </div>
      )}

      {!selectedWord && searchTerm && suggestions.length === 0 && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className="w-full mt-6 bg-white p-12 border border-slate-200 shadow-sm text-center"
        >
          {!aiTranslation ? (
            <>
              <Search className="w-16 h-16 mx-auto mb-4 text-slate-200" />
              <p className="text-xl text-slate-600 font-medium mb-6">Từ cần tra chưa có trong cơ sở dữ liệu.</p>
              <button 
                onClick={handleAITranslate}
                disabled={isTranslating}
                className="bg-indigo-50 text-indigo-600 px-8 py-4 rounded-xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-3 mx-auto shadow-sm"
              >
                {isTranslating ? <Loader2 className="animate-spin" size={24} /> : <BrainCircuit size={24} />}
                Dịch bằng AIBTeM ngay
              </button>
            </>
          ) : (
            <div className="text-left">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2 mb-2">
                    <BrainCircuit size={16} /> Kết quả từ AIBTeM
                  </h4>
                  <h3 className="text-4xl font-bold text-slate-900">{searchTerm}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleSpeak(searchTerm, language)}
                    className="w-14 h-14 shrink-0 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all"
                  >
                    <Volume2 size={24} />
                  </button>
                  <button 
                    onClick={handleSaveToDatabase}
                    disabled={isSaving || saveSuccess}
                    className={cn(
                      "px-6 h-14 shrink-0 rounded-2xl flex items-center justify-center font-bold transition-all gap-2",
                      saveSuccess ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                    )}
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : saveSuccess ? <CheckCircle2 size={20} /> : <Save size={20} />}
                    {saveSuccess ? "Đã lưu CSDL" : "Lưu vào CSDL"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {aiTranslation.map((meaning, idx) => (
                  <span key={idx} className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-6 py-3 rounded-xl font-bold text-xl">
                    {meaning}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {selectedWord && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full mt-6 bg-white p-8 md:p-10 border border-slate-200 shadow-sm"
        >
          <div className="mb-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl text-blue-700 font-bold">
              {selectedWord.article && (
                <span className={cn(
                  "font-normal mr-2",
                  selectedWord.article.toLowerCase() === 'der' ? "text-blue-500" :
                  selectedWord.article.toLowerCase() === 'die' ? "text-red-500" :
                  "text-green-600"
                )}>
                  {selectedWord.article}
                </span>
              )}
              {selectedWord.word}
            </span>
            {selectedWord.part_of_speech && (
              <span className="text-xl text-slate-500 font-medium">({selectedWord.part_of_speech})</span>
            )}
          </div>

          {selectedWord.phonetic && (
            <div className="flex items-center gap-3 mb-6">
              <Volume2 
                className="text-indigo-600 cursor-pointer hover:text-indigo-800 hover:scale-110 transition-transform" 
                onClick={() => handleSpeak(selectedWord.word, language)} 
                size={22} 
              />
              <span className="font-mono text-slate-600 text-lg">
                {renderPhonetic(selectedWord.phonetic)}
              </span>
            </div>
          )}

          <div className="mb-4">
            {language === 'en' && selectedWord.english_definition && (
              <div className="text-slate-800 mb-1 text-lg font-medium">
                <span className="font-bold text-slate-500 mr-2">
                  def. ({isDefSentence(selectedWord.english_definition) ? 'sentence' : 'phrase'}):
                </span>
                {selectedWord.english_definition}
              </div>
            )}
            
            {language === 'de' && selectedWord.german_definition && (
              <div className="text-slate-800 mb-1 text-lg font-medium">
                <span className="font-bold text-slate-500 mr-2">
                  Begr. ({isDefSentence(selectedWord.german_definition) ? 'Satz' : 'Aus'}):
                </span>
                {selectedWord.german_definition}
              </div>
            )}

            {(selectedWord.synonyms || selectedWord.synonym) && (
              <div className="text-slate-700 text-lg mt-2">
                <span className="font-bold text-indigo-600 mr-2">Từ đồng nghĩa:</span>
                {selectedWord.synonyms || selectedWord.synonym}
              </div>
            )}
          </div>

          <div className="text-emerald-700 mb-8 text-xl font-bold flex items-start">
            <span className="text-emerald-600 mr-2">Nghĩa:</span>
            <span>{selectedWord.vietnamese_meaning || selectedWord.meaning}</span>
          </div>

          {(selectedWord.example_english || selectedWord.example_german || selectedWord.example) && (
            <div className="mt-4 border-t border-slate-100 pt-6">
              <div className="flex items-start gap-3 mb-2">
                <Volume2 
                  className="text-slate-400 cursor-pointer hover:text-indigo-600 mt-1 flex-shrink-0 transition-colors" 
                  onClick={() => handleSpeak(selectedWord.example_english || selectedWord.example_german || selectedWord.example, language)} 
                  size={20} 
                />
                <span className="text-slate-800 text-lg leading-relaxed">
                  <span className="font-bold text-slate-500 mr-2">Ví dụ:</span>
                  <span className="italic">
                    {highlightWordInSentence(selectedWord.example_english || selectedWord.example_german || selectedWord.example, selectedWord.word)}
                  </span>
                </span>
              </div>
              {selectedWord.example_vietnamese && (
                <div className="ml-8 pl-1 text-slate-600 text-lg">
                  {selectedWord.example_vietnamese}
                </div>
              )}
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
    const textData = lesson.vocabularies
      .map(v => `${v.word} - ${v.meaning}`)
      .join('\n');
    
    const blob = new Blob([textData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lesson.title || 'bai-hoc'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredLessons = lessons.filter(l => 
    l.language === language &&
    l.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Thư viện của bạn</h2>
          <p className="text-slate-500">Quản lý và ôn tập các bài học đã lưu.</p>
        </div>
        <div className="relative max-w-md w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Tìm kiếm bài học..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="grid gap-4">
        {filteredLessons.length > 0 ? (
          filteredLessons.map((lesson) => {
            const status = getLessonStatus(lesson);
            const cardClass = cn(
              "p-6 rounded-3xl border shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group",
              status === 'red' ? "bg-red-50/30 border-red-200" :
              status === 'amber' ? "bg-amber-50/30 border-amber-200" :
              "bg-emerald-50/30 border-emerald-200"
            );
            const iconClass = cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0",
              status === 'red' ? "bg-red-100 text-red-600" :
              status === 'amber' ? "bg-amber-100 text-amber-600" :
              "bg-emerald-100 text-emerald-600"
            );

            return (
              <motion.div 
                key={lesson.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cardClass}
              >
                <div className="flex items-center gap-6">
                  <div className={iconClass}>
                    <FileText size={32} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={cn("text-xl font-bold transition-colors", status === 'red' ? "text-red-900 group-hover:text-red-600" : status === 'amber' ? "text-amber-900 group-hover:text-amber-600" : "text-slate-900 group-hover:text-emerald-600")}>
                        {lesson.title}
                      </h3>
                      {status === 'red' ? <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600 px-2 py-1 rounded-lg">Cần ôn ngay</span> :
                       status === 'amber' ? <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-600 px-2 py-1 rounded-lg">Đã tới hạn ôn</span> :
                       <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-600 px-2 py-1 rounded-lg">Đang nhớ tốt</span>}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Gamepad2 size={14} />
                        <span>{lesson.wordCount} thuật ngữ</span>
                      </div>
                      {lesson.practiceCount !== undefined && lesson.practiceCount > 0 && (
                        <div className="flex items-center gap-1 text-indigo-600 font-medium">
                          <Trophy size={14} />
                          <span>Đã học {lesson.practiceCount} lần</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        <span>{new Date(lesson.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => onPlay(lesson)}
                    className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Play size={18} fill="currentColor" /> Chơi
                  </button>
                  <button 
                    onClick={() => handleDownloadLesson(lesson)}
                    className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    title="Tải xuống (.txt)"
                  >
                    <Download size={18} />
                  </button>
                  <button 
                    onClick={() => onEdit(lesson)}
                    className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    title="Sửa"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => setDeletingId(lesson.id || null)}
                    className="flex-1 md:flex-none bg-red-50 text-red-600 px-4 py-3 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                    title="Xóa"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Search size={40} />
            </div>
            <h3 className="text-xl font-bold text-slate-400">Không tìm thấy bài học nào</h3>
            <p className="text-slate-500">Hãy thử tìm kiếm với từ khóa khác hoặc tạo bài học mới.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-hidden text-center"
            >
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-2">Xóa bài học?</h3>
              <p className="text-slate-500 mb-8">Bạn có chắc chắn muốn xóa toàn bộ bài học? Hành động này không thể hoàn tác.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={() => {
                    if (deletingId) onDelete(deletingId);
                    setDeletingId(null);
                  }}
                  className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg"
                >
                  Xác nhận xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InputView({ language, user, onSaved, initialLesson }: { language: Language, user: User, onSaved: () => void, initialLesson?: Lesson }) {
  const [rows, setRows] = useState<{ word: string, meaning: string, loading: boolean, suggestions: string[] }[]>(
    initialLesson ? initialLesson.vocabularies.map(v => ({ ...v, loading: false, suggestions: v.suggestions || [] })) : 
    [{ word: '', meaning: '', loading: false, suggestions: [] }]
  );
  const [lessonTitle, setLessonTitle] = useState(initialLesson?.title || '');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const translationCache = useRef<Record<string, any>>({});
  const abortControllers = useRef<Record<number, AbortController>>({});
  const lastTranslatedWords = useRef<Record<number, string>>({});

  const cleanInputData = (text: string, isForeignWord: boolean = false, isFinal: boolean = false) => {
    if (!text) return '';
    let cleaned = text.replace(/^[\u2022\u2023\u25E6\u2043\u2219\u2000-\u206F\u2E00-\u2E7F\u25A0-\u25FF\uF000-\uF0FF\-\+\*•]+/g, '');
    if (isFinal) {
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
    }
    return cleaned;
  };

  const addRow = () => {
    setRows([...rows, { word: '', meaning: '', loading: false, suggestions: [] }]);
  };

  const addRowAtIndex = (index: number) => {
    const newRows = [...rows];
    newRows.splice(index + 1, 0, { word: '', meaning: '', loading: false, suggestions: [] });
    setRows(newRows);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1 && !initialLesson) {
      setRows([{ word: '', meaning: '', loading: false, suggestions: [] }]);
      return;
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: 'word' | 'meaning', value: string) => {
    const cleanedValue = field === 'word' ? cleanInputData(value, true, false) : value;

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

  const handleSelectSuggestion = (index: number, selectedText: string) => {
    setRows(prevRows => {
      const newRows = [...prevRows];
      if (newRows[index]) {
        const currentDef = newRows[index].meaning || '';
        if (currentDef === '' || currentDef.endsWith(', ')) {
            newRows[index].meaning = currentDef + selectedText;
        } else {
            newRows[index].meaning = currentDef + ', ' + selectedText;
        }
      }
      return newRows;
    });
  };

  const handleAutoTranslate = async (index: number, currentLanguage: Language) => {
    const currentRow = rows[index];
    if (!currentRow) return;

    const term = currentRow.word.trim();
    const definition = currentRow.meaning.trim();

    if (term === '') return;
    if (definition !== '') return;
    if (lastTranslatedWords.current[index] === term) return;

    const word = cleanInputData(term, true, true);
    if (!word) return;

    if (translationCache.current[word]) {
      const data = translationCache.current[word];
      lastTranslatedWords.current[index] = term; 
      setRows(prevRows => {
        const updatedRows = [...prevRows];
        if (updatedRows[index]) {
          updatedRows[index] = { ...updatedRows[index], suggestions: data.translations };
        }
        return updatedRows;
      });
      return;
    }

    if (abortControllers.current[index]) {
      abortControllers.current[index].abort();
    }
    abortControllers.current[index] = new AbortController();

    setRows(prevRows => {
      const updatedRows = [...prevRows];
      if (updatedRows[index]) {
        updatedRows[index] = { ...updatedRows[index], loading: true };
      }
      return updatedRows;
    });

    try {
      const data = await translateWord(word, currentLanguage, abortControllers.current[index].signal);
      let meaningArray: string[] = [];
      if (data && Array.isArray(data.translations)) {
        meaningArray = data.translations;
      } else if (typeof data === 'string' && data.trim() !== '') {
        meaningArray = data.split(',').map(s => s.trim()).filter(s => s !== '');
      }

      translationCache.current[word] = data;
      lastTranslatedWords.current[index] = term; 
      
      setRows(prevRows => {
        const newRows = [...prevRows];
        if (newRows[index]) {
          newRows[index] = { ...newRows[index], suggestions: meaningArray, loading: false };
        }
        return newRows;
      });
    } catch (error: any) {
      if (error.message === 'Aborted') return;
      setRows(prevRows => {
        const newRows = [...prevRows];
        if (newRows[index]) {
          newRows[index] = { ...newRows[index], loading: false, suggestions: [] };
        }
        return newRows;
      });
    }
  };

  const cancelInput = () => {
    if (window.confirm('Bạn có chắc chắn muốn hủy bỏ toàn bộ dữ liệu đang nhập không?')) {
      setRows([{ word: '', meaning: '', loading: false, suggestions: [] }]);
      setLessonTitle('');
      if (initialLesson) {
        onSaved();
      }
    }
  };

  const saveLesson = async () => {
    const validRows = rows.filter(r => r.word.trim() && r.meaning.trim());
    if (validRows.length < 5) {
      alert("Bạn cần ít nhất 5 từ để lưu bài học!");
      return;
    }

    if (!lessonTitle.trim()) {
      alert("Vui lòng nhập tên bài học!");
      return;
    }

    setLoading(true);
    try {
      const finalRows = rows.map(r => ({
        ...r,
        word: cleanInputData(r.word, true, true),
        meaning: cleanInputData(r.meaning, false, true)
      }));

      const validRows = finalRows.filter(r => r.word && r.meaning);
      
      const lessonData: Omit<Lesson, 'id'> = {
        title: lessonTitle.trim(),
        wordCount: validRows.length,
        userId: user.uid,
        userName: user.displayName || 'Người dùng',
        language,
        createdAt: Date.now(),
        vocabularies: validRows.map(r => ({
          word: r.word,
          meaning: r.meaning,
          language,
          userId: user.uid,
          createdAt: Date.now()
        }))
      };

      if (initialLesson?.id) {
        await setDoc(doc(db, 'lessons', initialLesson.id), lessonData);
      } else {
        await addDoc(collection(db, 'lessons'), lessonData);
      }
      
      setShowSaveModal(false);
      onSaved();
    } catch (e) {
      console.error(e);
      alert("Có lỗi xảy ra khi lưu bài học.");
    } finally {
      setLoading(false);
    }
  };

  const parseText = (text: string) => {
    const rawLines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    const newRows: { word: string, meaning: string, loading: boolean, suggestions: string[] }[] = [];
    const separatorRegex = /[\t,:\-–—=]/;
    const hasAnySeparator = rawLines.some(line => separatorRegex.test(line));

    if (hasAnySeparator) {
      rawLines.forEach(line => {
        let parts: string[] = [];
        if (line.includes('\t')) {
          parts = line.split('\t');
        } else if (line.includes(',')) {
          parts = line.split(',');
        } else {
          const match = line.match(/[:\-–—=]/);
          if (match) {
            const sep = match[0];
            parts = [line.substring(0, line.indexOf(sep)), line.substring(line.indexOf(sep) + 1)];
          }
        }

        if (parts.length >= 2) {
          const word = cleanInputData(parts[0], true, true);
          const meaning = cleanInputData(parts.slice(1).join(' '), false, true);
          if (word) {
            newRows.push({ word, meaning, loading: false, suggestions: [] });
          }
        } else {
          newRows.push({ word: cleanInputData(line, true, true), meaning: '', loading: false, suggestions: [] });
        }
      });
    } else {
      for (let i = 0; i < rawLines.length; i += 2) {
        const word = cleanInputData(rawLines[i], true, true);
        const meaning = (i + 1 < rawLines.length) ? cleanInputData(rawLines[i + 1], false, true) : '';
        if (word) {
          newRows.push({ word, meaning, loading: false, suggestions: [] });
        }
      }
    }
    return newRows;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let text = '';
      if (file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        text = await file.text();
      } else if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      }

      const parsedRows = parseText(text);
      if (parsedRows.length > 0) {
        setRows(parsedRows);
      } else {
        alert("Không tìm thấy từ vựng trong file. Vui lòng kiểm tra định dạng (Từ, Nghĩa).");
      }
    } catch (e) {
      console.error("File Upload Error:", e);
      alert("Lỗi khi đọc file. Vui lòng thử lại với định dạng khác hoặc kiểm tra nội dung file.");
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
          <p className="text-slate-500">Chỉnh sửa, thêm bớt và BẮT BUỘC lưu lại để bắt đầu luyện tập.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className={cn(
            "flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-indigo-300 transition-all shadow-sm group",
            uploading && "opacity-50 cursor-not-allowed"
          )}>
            {uploading ? <Loader2 className="animate-spin text-indigo-600 w-5 h-5" /> : <Upload className="text-indigo-600 w-5 h-5 group-hover:scale-110 transition-transform" />}
            <span className="text-sm font-bold text-slate-700">Tải file (.txt, .docx, .csv)</span>
            <input type="file" accept=".txt,.docx,.csv" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="group relative">
            <div className="flex flex-col md:flex-row gap-4 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all relative">
              <div className="hidden md:flex items-center justify-center w-10 font-bold text-slate-300 text-xl group-hover:text-indigo-200 transition-colors">
                {index + 1}
              </div>
              
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Thuật ngữ ({language.toUpperCase()})</label>
                  <input 
                    type="text" 
                    value={row.word}
                    onChange={(e) => updateRow(index, 'word', e.target.value)}
                    onBlur={() => handleAutoTranslate(index, language)}
                    className="w-full bg-slate-50 border-2 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-lg font-medium placeholder:text-slate-300"
                    placeholder="Nhập từ..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Định nghĩa (Tiếng Việt)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={row.meaning}
                      onChange={(e) => updateRow(index, 'meaning', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab' && !e.shiftKey && index === rows.length - 1) {
                          addRow();
                        }
                      }}
                      className="w-full bg-slate-50 border-2 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-lg font-medium placeholder:text-slate-300"
                      placeholder="Nhập nghĩa..."
                    />
                    {row.loading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-100">
                        <Loader2 className="animate-spin text-indigo-500 w-4 h-4" />
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">AIBTeM đang dịch...</span>
                      </div>
                    )}
                  </div>
                  
                  {(() => {
                    const shouldShowSuggestions = row.meaning === '' || row.meaning.endsWith(', ');
                    const availableSuggestions = (row.suggestions || []).filter(s => !row.meaning.includes(s));

                    return shouldShowSuggestions && availableSuggestions.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 p-2 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap gap-2"
                      >
                        {availableSuggestions.map((s, i) => (
                          <button 
                            key={i}
                            type="button"
                            onClick={() => handleSelectSuggestion(index, s)}
                            className="text-[15px] px-5 py-2.5 rounded-full border-2 transition-all font-medium shadow-sm bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 hover:scale-105"
                          >
                            {s}
                          </button>
                        ))}
                      </motion.div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex md:flex-col items-center justify-center gap-2">
                <button 
                  onClick={() => removeRow(index)}
                  className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title="Xóa hàng"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            {/* Insert Button */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-all">
              <button 
                onClick={() => addRowAtIndex(index)}
                className="bg-white border-2 border-slate-200 text-indigo-600 p-2 rounded-full shadow-xl hover:scale-110 hover:border-indigo-500 transition-all"
                title="Thêm hàng ở đây"
              >
                <PlusCircle size={20} />
              </button>
            </div>
          </div>
        ))}

        <button 
          onClick={addRow}
          className="w-full py-8 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 font-bold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-3 group"
        >
          <PlusCircle size={24} className="group-hover:rotate-90 transition-transform duration-300" /> Thêm hàng mới
        </button>
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40">
        <div className="bg-white/90 backdrop-blur-2xl border border-white/20 p-4 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 ml-2">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-all",
              totalValidWords >= 5 ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-slate-100 text-slate-400"
            )}>
              {totalValidWords}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">Từ đã chọn</p>
              <p className="text-xs text-slate-500 mt-1">{totalValidWords >= 5 ? "Đủ điều kiện lưu!" : `Cần tối thiểu 5 từ`}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={cancelInput}
              className="px-6 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"
            >
              Hủy
            </button>
            <button 
              onClick={() => setShowSaveModal(true)}
              disabled={totalValidWords < 5}
              className={cn(
                "px-8 py-3 rounded-2xl font-bold transition-all shadow-lg flex items-center gap-2",
                totalValidWords >= 5 
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95" 
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              Lưu vào Thư viện <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaveModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl overflow-hidden"
            >
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
                    placeholder="Ví dụ: Bài học ngày..."
                    className="w-full bg-slate-50 border-2 border-transparent rounded-2xl px-6 py-5 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-xl font-bold"
                  />
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setShowSaveModal(false)}
                    className="flex-1 py-5 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={saveLesson}
                    disabled={loading || !lessonTitle.trim()}
                    className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-bold hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-2"
                  >
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

function GamesView({ vocabList, language, onComplete, playSound, activeGame, setActiveGame, onGoToLibrary, onGoToTopics, onGoToInput, hasLessons }: { vocabList: Vocabulary[], language: Language, onComplete: (res: GameResult) => void, playSound: (t: 'correct' | 'wrong') => void, activeGame: GameType | null, setActiveGame: (g: GameType | null) => void, onGoToLibrary: () => void, onGoToTopics: () => void, onGoToInput: () => void, hasLessons: boolean }) {
  
  if (vocabList.length < 5) {
    if (!hasLessons) {
      return (
        <div className="text-center py-20 bg-white rounded-[3rem] shadow-xl border border-slate-100 w-full">
          <RobotAnimation type="thinking" />
          <h3 className="text-2xl font-bold mt-6">Chưa có bài học nào được tạo</h3>
          <p className="text-slate-500 mt-2 mb-8">Vui lòng tạo bài học từ Chủ đề hoặc Nhập liệu trực tiếp.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4">
            <button onClick={onGoToTopics} className="w-full sm:w-auto bg-indigo-50 text-indigo-600 px-8 py-4 rounded-2xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2">
              <LayoutGrid size={20} /> Đến Chủ đề
            </button>
            <button onClick={onGoToInput} className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2">
              <PlusCircle size={20} /> Đến Nhập liệu
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="text-center py-20 bg-white rounded-[3rem] shadow-xl border border-slate-100 w-full">
        <RobotAnimation type="sad" />
        <h3 className="text-2xl font-bold mt-6">Chưa có bài học nào được chọn</h3>
        <p className="text-slate-500 mt-2 mb-8">Vui lòng chọn Bài học để bắt đầu chơi.</p>
        <button onClick={onGoToLibrary} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center gap-2 mx-auto">
          <BookOpen size={20} /> Đến Thư viện ngay
        </button>
      </div>
    );
  }

  if (activeGame) {
    return (
      <GameContainer 
        type={activeGame} 
        vocabList={vocabList} 
        language={language} 
        onBack={() => setActiveGame(null)} 
        onFinish={(score) => {
          onComplete({ gameType: activeGame, score, total: 5, timestamp: Date.now(), language });
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
      </div>
    </div>
  );
}

function GameCard({ title, desc, icon, onClick, colorClass }: { title: string, desc: string, icon: React.ReactNode, onClick: () => void, colorClass: string }) {
  return (
    <motion.button 
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 text-left transition-all group relative overflow-hidden",
        "hover:shadow-2xl hover:shadow-indigo-100"
      )}
    >
      <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg rotate-3 group-hover:rotate-6 transition-transform", colorClass)}>
        {React.cloneElement(icon as React.ReactElement, { size: 32, className: "text-white" })}
      </div>
      <h3 className="text-xl font-bold mb-2 text-slate-900">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
      
      <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="text-slate-300" />
      </div>
      
      <div className={cn("absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-5 group-hover:scale-150 transition-transform", colorClass)}></div>
    </motion.button>
  );
}

// --- GAME LOGIC ---

function GameContainer({ type, vocabList, language, onBack, onFinish, playSound }: { type: GameType, vocabList: Vocabulary[], language: Language, onBack: () => void, onFinish: (score: number) => void, playSound: (t: 'correct' | 'wrong') => void }) {
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  
  // Trò chơi Flashcard không giới hạn 5 từ mà hiển thị toàn bộ vocabList
  const gameVocabs = type === 'flashcards' ? vocabList : [...vocabList].sort(() => 0.5 - Math.random()).slice(0, 5);
  const currentVocab = gameVocabs[step];

  const next = (correct: boolean) => {
    if (correct) {
      setScore(s => s + 1);
      playSound('correct');
    } else {
      playSound('wrong');
    }
    
    if (step < gameVocabs.length - 1) {
      setStep(s => s + 1);
    } else {
      onFinish(correct ? score + 1 : score);
    }
  };
  
  const prev = () => {
    if (step > 0) {
      setStep(s => s - 1);
    }
  };

  return (
    <div className="w-full mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold">
          <ChevronLeft size={20} /> Quay lại
        </button>
        <div className="flex gap-2 flex-1 max-w-sm mx-4">
          {gameVocabs.map((_, i) => (
            <div key={i} className={cn("h-2 rounded-full transition-all flex-1", i <= step ? "bg-indigo-600" : "bg-slate-200")} />
          ))}
        </div>
        <div className="font-bold text-indigo-600">Từ {step + 1}/{gameVocabs.length}</div>
      </div>

      <AnimatePresence mode="wait">
        {type === 'flashcards' && (
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <FlashcardGame 
              vocab={currentVocab} 
              onNext={() => next(false)} 
              onPrev={prev} 
              language={language} 
              step={step} 
              totalSteps={gameVocabs.length} 
            />
          </motion.div>
        )}
        {type === 'quiz' && (
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <QuizGame vocab={currentVocab} allVocabs={vocabList} onNext={next} language={language} />
          </motion.div>
        )}
        {type === 'matching' && (
          <motion.div key="matching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MatchingGame vocabs={gameVocabs} onFinish={onFinish} playSound={playSound} />
          </motion.div>
        )}
        {type === 'writing' && (
          <motion.div key={step} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <WritingGame vocab={currentVocab} onNext={next} language={language} />
          </motion.div>
        )}
        {type === 'fill' && (
          <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FillGame vocab={currentVocab} onNext={next} language={language} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FlashcardGame({ vocab, onNext, onPrev, language, step, totalSteps }: { vocab: Vocabulary, onNext: () => void, onPrev: () => void, language: Language, step: number, totalSteps: number }) {
  const [side, setSide] = useState(0); 

  useEffect(() => {
    setSide(0);
  }, [vocab]);

  useEffect(() => {
    if (side === 2) {
       handleSpeak(vocab.word, language);
    }
  }, [side, vocab.word, language]);

  const definition = language === 'en' ? vocab.english_definition : vocab.german_definition;
  const exampleText = language === 'en' ? vocab.example_english : vocab.example_german;

  return (
    <div className="space-y-8 w-full max-w-4xl mx-auto">
      {/* Khung thẻ cố định chiều cao, hiệu ứng nhào lộn xoay X 3D */}
      <div className="perspective-[1000px] w-full min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div 
            key={side}
            initial={{ rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: -90, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            onClick={() => setSide((side + 1) % 3)}
            className="w-full min-h-[400px] bg-white rounded-[3rem] shadow-xl border border-slate-100 flex flex-col items-center justify-center p-8 md:p-12 text-center cursor-pointer relative overflow-hidden group"
          >
            {side === 0 && (
              <div className="text-center w-full max-w-3xl mx-auto px-4 md:px-8">
                 <div className="text-2xl md:text-3xl font-medium text-slate-800 leading-relaxed">
                   {vocab.part_of_speech && <span className="font-bold text-indigo-600 mr-3">({vocab.part_of_speech})</span>}
                   {definition || "Chưa có định nghĩa ngôn ngữ gốc cho từ này."}
                 </div>
              </div>
            )}
            
            {side === 1 && (
              <div className="text-center space-y-8 w-full">
                 <h3 className="text-4xl md:text-5xl font-bold text-emerald-600">{vocab.vietnamese_meaning || vocab.meaning}</h3>
                 {vocab.phonetic && (
                   <div className="flex items-center justify-center gap-4 text-slate-500">
                     <button onClick={(e) => {e.stopPropagation(); handleSpeak(vocab.word, language)}} className="hover:text-indigo-600 transition-colors p-3 bg-slate-50 rounded-full hover:bg-indigo-50 border border-slate-100 shadow-sm">
                       <Volume2 size={28} />
                     </button>
                     <span className="text-2xl md:text-3xl font-mono">{renderPhonetic(vocab.phonetic)}</span>
                   </div>
                 )}
              </div>
            )}

            {side === 2 && (
              <div className="text-left w-full max-w-3xl mx-auto space-y-6">
                 <div className="flex items-baseline gap-3 mb-2 border-b border-slate-100 pb-4">
                    <h3 className="text-4xl md:text-5xl font-bold text-indigo-600">{vocab.word}</h3>
                    {vocab.part_of_speech && <span className="text-xl md:text-2xl text-slate-400 font-medium">({vocab.part_of_speech})</span>}
                 </div>

                 {vocab.phonetic && (
                   <div className="flex items-center gap-4 text-slate-500 mb-8">
                       <button onClick={(e) => {e.stopPropagation(); handleSpeak(vocab.word, language)}} className="hover:text-indigo-600 transition-colors p-3 bg-slate-50 rounded-full hover:bg-indigo-50 border border-slate-100 shadow-sm">
                         <Volume2 size={24} />
                       </button>
                       <span className="text-2xl md:text-3xl font-mono">{renderPhonetic(vocab.phonetic)}</span>
                   </div>
                 )}

                 {(exampleText || vocab.example) && (
                   <div className="bg-slate-50 p-6 md:p-8 rounded-3xl border border-slate-100 shadow-inner">
                     <div className="flex items-start gap-4 mb-4">
                        <button onClick={(e) => {e.stopPropagation(); handleSpeak(exampleText || vocab.example || '', language)}} className="hover:text-indigo-600 transition-colors text-slate-400 mt-1 shrink-0 p-2 bg-white rounded-full shadow-sm">
                          <Volume2 size={24} />
                        </button>
                        <div className="text-xl md:text-2xl text-slate-700 leading-relaxed italic">
                           {highlightWordInSentence(exampleText || vocab.example || '', vocab.word)}
                        </div>
                     </div>
                     {vocab.example_vietnamese && (
                        <div className="text-lg md:text-xl text-emerald-700 font-medium ml-14">
                           {vocab.example_vietnamese}
                        </div>
                     )}
                   </div>
                 )}
              </div>
            )}
            
            <div className="absolute bottom-6 text-slate-300 font-bold text-xs uppercase tracking-widest flex items-center gap-2 group-hover:text-indigo-300 transition-colors">
               <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> Nhấn để lật thẻ
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-4 w-full">
         <button 
           onClick={onPrev} 
           disabled={step === 0} 
           className="flex-1 py-4 rounded-2xl font-bold text-lg bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
         >
           <ChevronLeft size={20} /> Lùi lại
         </button>
         <button 
           onClick={onNext} 
           className="flex-1 py-4 rounded-2xl font-bold text-lg bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-2"
         >
           {step === totalSteps - 1 ? 'Hoàn thành' : 'Tiếp theo'} {step !== totalSteps - 1 && <ChevronRight size={20} />}
         </button>
      </div>
    </div>
  );
}

function QuizGame({ vocab, allVocabs, onNext, language }: { vocab: Vocabulary, allVocabs: Vocabulary[], onNext: (c: boolean) => void, language: Language }) {
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const loadOptions = async () => {
      const distractors = await generateDistractors(vocab.word, vocab.meaning, language);
      const all = [vocab.meaning, ...distractors].sort(() => 0.5 - Math.random());
      setOptions(all);
    };
    loadOptions();
  }, [vocab]);

  return (
    <div className="space-y-8">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl text-center">
        <span className="text-slate-400 font-bold uppercase tracking-widest text-sm mb-4 block">Chọn nghĩa đúng của</span>
        <h3 className="text-5xl font-black text-indigo-600 mb-6">{vocab.word}</h3>
        <button onClick={() => handleSpeak(vocab.word, language)} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
          <Volume2 size={20} />
        </button>
      </div>

      <div className="grid gap-4">
        {options.map((opt, i) => (
          <button 
            key={i}
            disabled={!!selected}
            onClick={() => {
              setSelected(opt);
              setTimeout(() => onNext(opt === vocab.meaning), 1000);
            }}
            className={cn(
              "p-6 rounded-2xl text-left font-bold text-lg transition-all border-2",
              selected === opt 
                ? (opt === vocab.meaning ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-red-50 border-red-500 text-red-700")
                : "bg-white border-slate-100 hover:border-indigo-300 hover:bg-indigo-50"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchingGame({ vocabs, onFinish, playSound }: { vocabs: Vocabulary[], onFinish: (s: number) => void, playSound: (t: 'correct' | 'wrong') => void }) {
  const [words, setWords] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [meanings, setMeanings] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedMeaning, setSelectedMeaning] = useState<string | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [wrong, setWrong] = useState<[string, string] | null>(null);

  useEffect(() => {
    if (selectedWord && selectedMeaning) {
      const vocab = vocabs.find(v => v.word === selectedWord);
      if (vocab?.meaning === selectedMeaning) {
        setMatches(prev => [...prev, selectedWord]);
        playSound('correct');
        setSelectedWord(null);
        setSelectedMeaning(null);
        if (matches.length + 1 === vocabs.length) {
          setTimeout(() => onFinish(5), 1000);
        }
      } else {
        setWrong([selectedWord, selectedMeaning]);
        playSound('wrong');
        setTimeout(() => {
          setWrong(null);
          setSelectedWord(null);
          setSelectedMeaning(null);
        }, 1000);
      }
    }
  }, [selectedWord, selectedMeaning]);

  return (
    <div className="grid grid-cols-2 gap-8">
      <div className="space-y-4">
        {words.map(v => (
          <button 
            key={v.word}
            disabled={matches.includes(v.word)}
            onClick={() => setSelectedWord(v.word)}
            className={cn(
              "w-full p-6 rounded-2xl font-bold text-lg border-2 transition-all",
              matches.includes(v.word) ? "bg-emerald-500 text-white border-emerald-500 opacity-50" :
              selectedWord === v.word ? "bg-indigo-600 text-white border-indigo-600" :
              wrong?.[0] === v.word ? "bg-red-500 text-white border-red-500" :
              "bg-white border-slate-100 hover:border-indigo-300"
            )}
          >
            {v.word}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {meanings.map(v => (
          <button 
            key={v.meaning}
            disabled={matches.some(m => vocabs.find(voc => voc.word === m)?.meaning === v.meaning)}
            onClick={() => setSelectedMeaning(v.meaning)}
            className={cn(
              "w-full p-6 rounded-2xl font-bold text-lg border-2 transition-all",
              matches.some(m => vocabs.find(voc => voc.word === m)?.meaning === v.meaning) ? "bg-emerald-500 text-white border-emerald-500 opacity-50" :
              selectedMeaning === v.meaning ? "bg-indigo-600 text-white border-indigo-600" :
              wrong?.[1] === v.meaning ? "bg-red-500 text-white border-red-500" :
              "bg-white border-slate-100 hover:border-indigo-300"
            )}
          >
            {v.meaning}
          </button>
        ))}
      </div>
    </div>
  );
}

function WritingGame({ vocab, onNext, language }: { vocab: Vocabulary, onNext: (c: boolean) => void, language: Language }) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    handleSpeak(vocab.word, language);
  }, [vocab]);

  const check = () => {
    setSubmitted(true);
    setTimeout(() => onNext(input.toLowerCase().trim() === vocab.word.toLowerCase().trim()), 1500);
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl text-center">
        <button onClick={() => handleSpeak(vocab.word, language)} className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 hover:scale-110 transition-transform">
          <Volume2 size={40} />
        </button>
        <p className="text-slate-500 font-bold">Nghe và viết lại từ này</p>
        <p className="text-sm text-slate-400 mt-2">Nghĩa: {vocab.meaning}</p>
      </div>

      <div className="space-y-4">
        <input 
          autoFocus
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          className={cn(
            "w-full bg-white border-4 rounded-3xl px-8 py-6 text-3xl font-black text-center focus:outline-none transition-all",
            submitted ? (input.toLowerCase().trim() === vocab.word.toLowerCase().trim() ? "border-emerald-500 text-emerald-600" : "border-red-500 text-red-600") : "border-slate-100 focus:border-indigo-500"
          )}
          placeholder="..."
        />
        {submitted && input.toLowerCase().trim() !== vocab.word.toLowerCase().trim() && (
          <p className="text-center font-bold text-emerald-600">Đáp án đúng: {vocab.word}</p>
        )}
      </div>
    </div>
  );
}

function FillGame({ vocab, onNext, language }: { vocab: Vocabulary, onNext: (c: boolean) => void, language: Language }) {
  const [sentence, setSentence] = useState('');
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const load = async () => {
      const s = await generateExampleSentence(vocab.word, language);
      setSentence(s);
    };
    load();
  }, [vocab]);

  const parts = sentence.split(new RegExp(`(${vocab.word})`, 'gi'));

  const check = () => {
    setSubmitted(true);
    setTimeout(() => onNext(input.toLowerCase().trim() === vocab.word.toLowerCase().trim()), 1500);
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl">
        <h3 className="text-2xl font-medium leading-loose text-slate-700 text-center">
          {parts.map((p, i) => 
            p.toLowerCase() === vocab.word.toLowerCase() ? (
              <span key={i} className="inline-block min-w-[120px] border-b-4 border-indigo-300 mx-2 text-indigo-600 font-bold">
                {submitted ? p : (input || '...')}
              </span>
            ) : p
          )}
        </h3>
        <p className="text-center text-slate-400 mt-8 font-bold">Nghĩa của từ cần điền: {vocab.meaning}</p>
      </div>

      <div className="space-y-4">
        <input 
          autoFocus
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          className={cn(
            "w-full bg-white border-4 rounded-3xl px-8 py-6 text-2xl font-bold text-center focus:outline-none transition-all",
            submitted ? (input.toLowerCase().trim() === vocab.word.toLowerCase().trim() ? "border-emerald-500 text-emerald-600" : "border-red-500 text-red-600") : "border-slate-100 focus:border-indigo-500"
          )}
          placeholder="Nhập từ còn thiếu"
        />
      </div>
    </div>
  );
}

// --- REPORT VIEW ---

function ReportView({ results, language }: { results: GameResult[], language: Language }) {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredResults = results.filter(r => r.language === language);

  useEffect(() => {
    if (filteredResults.length === 0) return;
    const runAnalysis = async () => {
      setLoading(true);
      const feedback = await analyzePerformance(filteredResults, language);
      setAnalysis(feedback);
      setLoading(false);
    };
    runAnalysis();
  }, [filteredResults, language]);

  const chartData = filteredResults.map((r, i) => ({
    name: `Game ${i + 1}`,
    score: r.score,
    total: r.total
  }));

  const totalScore = filteredResults.reduce((acc, r) => acc + r.score, 0);
  const totalPossible = filteredResults.reduce((acc, r) => acc + r.total, 0);
  const accuracy = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

  return (
    <div className="w-full space-y-8 pb-20">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Kết quả học tập</h2>
        <p className="text-slate-500">Phân tích chi tiết quá trình rèn luyện của bạn.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" /> Tiến độ gần đây
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="score" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl text-white flex flex-col justify-center items-center text-center">
          <Trophy size={64} className="mb-4 text-indigo-200" />
          <h3 className="text-2xl font-bold mb-2">Tổng điểm tích lũy</h3>
          <div className="text-6xl font-black mb-4">{totalScore}</div>
          <div className="bg-indigo-500/50 px-6 py-2 rounded-full font-bold">
            Độ chính xác: {accuracy}%
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <BrainCircuit className="text-indigo-600" /> AIBTeM Nhận xét & Khuyên dùng
        </h3>
        {loading ? (
          <div className="flex flex-col items-center py-8">
            <RefreshCw className="animate-spin text-indigo-600 mb-4" size={32} />
            <p className="text-slate-500 font-medium italic">AIBTeM đang phân tích kết quả của bạn...</p>
          </div>
        ) : (
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{analysis || "Bắt đầu chơi để nhận nhận xét từ AIBTeM!"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-4 mt-auto border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-400 text-xs md:text-sm">
        <div className="flex items-center gap-2">
          <img 
            src="/chan_trang.PNG" 
            alt="AIBTeM Logo" 
            className="h-6 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="font-bold text-white tracking-wider">AIBTeM</span>
        </div>
        
        <p>
          © 2026 Vũ Xuân Hùng | Vocab AIBTeM. All Rights Reserved.
        </p>
        
        <div className="flex items-center gap-2 hover:text-white transition-colors">
          <Mail size={14} className="text-indigo-400" />
          <span>hungvdtnai@gmail.com</span>
        </div>
      </div>
    </footer>
  );
}