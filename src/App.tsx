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
  lessonId: string; 
  gameType: GameType;
  score: number;
  total: number;
  timestamp: number;
  language: Language;
}

// ------------------------------------------------------------------------------------
// HIỆU ỨNG TUNG PHÁO HOA (CONFETTI)
// ------------------------------------------------------------------------------------
const Confetti = () => {
  const colors = ['bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-yellow-400', 'bg-purple-500', 'bg-pink-500'];
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {[...Array(80)].map((_, i) => {
        const left = Math.random() * 100;
        const animationDuration = 2 + Math.random() * 4;
        const color = colors[Math.floor(Math.random() * colors.length)];
        return (
          <motion.div
            key={i}
            initial={{ y: -50, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: '100vh', x: Math.random() * 300 - 150, rotate: 720, opacity: 0 }}
            transition={{ duration: animationDuration, ease: "easeOut" }}
            className={cn("absolute w-3 h-3 shadow-sm", color, Math.random() > 0.5 ? "rounded-full" : "rounded-sm")}
            style={{ left: `${left}%` }}
          />
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------------------------
// HỆ THỐNG KHEN NGỢI SONG NGỮ
// ------------------------------------------------------------------------------------
const PRAISE_MESSAGES = {
  en: [
    "Keep up the good work! Tuyệt vời!", "Excellent! Bạn đang làm rất tốt!", "Outstanding! Cứ thế phát huy nhé!",
    "Impressive! Điểm số nói lên tất cả!", "Brilliant! Bạn thực sự là một cao thủ!", "Perfect! Bạn sắp thông thạo tiếng Anh rồi!"
  ],
  de: [
    "Weiter so! Tuyệt vời!", "Ausgezeichnet! Bạn đang làm rất tốt!", "Hervorragend! Cứ thế phát huy nhé!",
    "Beeindruckend! Điểm số nói lên tất cả!", "Wunderbar! Bạn thực sự là một cao thủ!", "Perfekt! Bạn sắp thông thạo tiếng Đức rồi!"
  ]
};

const getRandomPraise = (lang: Language) => {
  const messages = PRAISE_MESSAGES[lang] || PRAISE_MESSAGES.en;
  return messages[Math.floor(Math.random() * messages.length)];
};

// ------------------------------------------------------------------------------------
// THUẬT TOÁN KIỂM TRA ĐÁP ÁN (CHỐNG LỖI DẤU CÂU)
// ------------------------------------------------------------------------------------
const checkMatch = (val1: string, val2: string) => {
  if (!val1 || !val2) return false;
  const clean = (s: string) => s.toLowerCase().replace(/[.,!?;:'"()[\]{}]/g, '').replace(/\s+/g, ' ').trim();
  return clean(val1) === clean(val2);
};

const playGameSound = (type: 'correct' | 'wrong' | 'success') => {
  let audioSrc = '';
  if (type === 'correct') audioSrc = '/assets/correct.mp3'; 
  else if (type === 'wrong') audioSrc = '/assets/error-3.mp3';
  else if (type === 'success') audioSrc = '/assets/great-success.mp3';
  if (audioSrc) {
    const audio = new Audio(audioSrc);
    audio.play().catch(() => {});
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
  const regex = new RegExp(`(${targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = sentence.split(regex);
  return parts.map((part, i) => regex.test(part) ? <span key={i} className="text-blue-600 font-bold">{part}</span> : part);
};

const renderPhonetic = (rawPhonetic?: string) => {
  if (!rawPhonetic) return null;
  return `/${rawPhonetic.trim().replace(/[\[\]\/]/g, '')}/`;
};

const getLessonStatus = (lesson: Lesson) => {
  const lastTime = lesson.lastPracticed || lesson.createdAt;
  const daysPassed = (Date.now() - lastTime) / (1000 * 60 * 60 * 24);
  if (daysPassed >= 5) return 'red'; 
  if (daysPassed >= 3) return 'amber'; 
  return 'emerald'; 
}

// ------------------------------------------------------------------------------------
// MAIN APP
// ------------------------------------------------------------------------------------
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
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

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

  const login = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e: any) { alert(e.message); } };
  const logout = async () => { await signOut(auth); setView('home'); setIsTestMode(false); };
  const enterTestMode = () => { setIsTestMode(true); setUser({ uid: 'test-user-123', displayName: 'Người dùng Thử nghiệm' } as any); };

  const handleGameComplete = async (res: Omit<GameResult, 'language'>) => {
    const newResults = [...gameResults, { ...res, language }];
    setGameResults(newResults);
    if (activeLessonId && !isTestMode) {
      const lessonRef = doc(db, 'lessons', activeLessonId);
      const currentLesson = lessons.find(l => l.id === activeLessonId);
      await updateDoc(lessonRef, { lastPracticed: Date.now(), practiceCount: (currentLesson?.practiceCount || 0) + 1 });
    }
    setActiveGame(null); 
    if (activeLessonId) {
       const uniqueGamesPlayed = new Set(newResults.filter(r => r.lessonId === activeLessonId).map(r => r.gameType));
       if (uniqueGamesPlayed.size >= 5) { setView('report'); }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
          <Languages className="text-indigo-600 w-16 h-16 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-8">Vocab AIBTeM</h1>
          <button onClick={login} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl mb-4">Đăng nhập với Google</button>
          <button onClick={enterTestMode} className="w-full bg-slate-100 text-slate-700 font-bold py-4 rounded-2xl">Test Mode</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
          <Languages className="text-indigo-600" /> <span className="font-bold text-xl">Vocab AIBTeM</span>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <NavButton active={view === 'topics'} onClick={() => setView('topics')} icon={<LayoutGrid size={18} />} label="Chủ đề" />
          <NavButton active={view === 'input'} onClick={() => setView('input')} icon={<PlusCircle size={18} />} label="Nhập liệu" />
          <NavButton active={view === 'library'} onClick={() => setView('library')} icon={<FileText size={18} />} label="Thư viện" />
          <NavButton active={view === 'games'} onClick={() => setView('games')} icon={<Gamepad2 size={18} />} label="Trò chơi" />
          <NavButton active={view === 'report'} onClick={() => setView('report')} icon={<BarChart3 size={18} />} label="Báo cáo" />
          <NavButton active={view === 'dictionary'} onClick={() => setView('dictionary')} icon={<BookOpen size={18} />} label="Từ điển" />
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
           <button onClick={() => setLanguage('en')} className={cn("px-3 py-1 rounded-lg text-xs font-bold", language === 'en' ? "bg-white text-indigo-600" : "text-slate-500")}>EN</button>
           <button onClick={() => setLanguage('de')} className={cn("px-3 py-1 rounded-lg text-xs font-bold", language === 'de' ? "bg-white text-indigo-600" : "text-slate-500")}>DE</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-grow w-full">
        <AnimatePresence mode="wait">
          {view === 'home' && <HomeView key="home" setView={setView} language={language} user={user} lessons={lessons} />}
          {view === 'topics' && <TopicLibraryView key="topics" language={language} lessons={lessons} setEditingLesson={setEditingLesson} setView={setView} />}
          {view === 'input' && <InputView key="input" language={language} user={user} initialLesson={editingLesson || undefined} onSaved={() => setView('library')} />}
          {view === 'library' && <LibraryView key="library" lessons={lessons} language={language} setEditingLesson={setEditingLesson} setView={setView} setPlayVocabList={setPlayVocabList} setActiveLessonId={setActiveLessonId} />}
          {view === 'games' && <GamesView key="games" vocabList={playVocabList} language={language} activeLessonId={activeLessonId || ''} activeGame={activeGame} setActiveGame={setActiveGame} onComplete={handleGameComplete} onGoToLibrary={() => setView('library')} />}
          {view === 'report' && <ReportView key="report" results={gameResults} language={language} activeLessonId={activeLessonId || ''} />}
          {view === 'dictionary' && <DictionaryView key="dict" language={language} />}
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}

// --- SUB-COMPONENTS ---

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl font-medium", active ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50")}>
      {icon}{label}
    </button>
  );
}

function HomeView({ setView, language, user, lessons }: any) {
  return (
    <div className="space-y-8">
      <div className="bg-indigo-600 rounded-[2.5rem] p-12 text-white relative overflow-hidden shadow-2xl">
        <h2 className="text-4xl font-bold mb-4">Chào mừng, {user.displayName?.split(' ')[0]}!</h2>
        <p className="text-indigo-100 text-lg mb-8">Bạn đã sẵn sàng chinh phục {language === 'en' ? 'Tiếng Anh' : 'Tiếng Đức'} hôm nay chưa?</p>
        <button onClick={() => setView('topics')} className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-bold flex items-center gap-2">Khám phá Chủ đề <ChevronRight size={20} /></button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------
// GAME CONTAINER - FIX LỖI WHITE SCREEN & CHỐNG NHẢY TỪ
// ------------------------------------------------------------------------------------
function GamesView({ vocabList, language, activeLessonId, activeGame, setActiveGame, onComplete, onGoToLibrary }: any) {
  if (vocabList.length < 5) return <div className="text-center py-20 bg-white rounded-3xl shadow-xl">Từ vựng ít hơn 5, quay lại Thư viện chọn bài nhé! <button onClick={onGoToLibrary} className="bg-indigo-600 text-white px-6 py-2 rounded-xl ml-4">Thư viện</button></div>;

  if (activeGame) {
    return (
      <GameContainer 
        type={activeGame} 
        vocabList={vocabList} 
        language={language} 
        activeLessonId={activeLessonId} 
        onBack={() => setActiveGame(null)} 
        onFinish={(score: number, mistakes: any[]) => {
          onComplete({ lessonId: activeLessonId, gameType: activeGame, score, total: activeGame === 'flashcards' ? vocabList.length : 5, mistakes });
        }}
      />
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      <GameCard title="Flashcards" onClick={() => setActiveGame('flashcards')} color="bg-blue-500" />
      <GameCard title="Trắc nghiệm" onClick={() => setActiveGame('quiz')} color="bg-indigo-500" />
      <GameCard title="Nối từ" onClick={() => setActiveGame('matching')} color="bg-orange-500" />
      <GameCard title="Luyện viết" onClick={() => setActiveGame('writing')} color="bg-emerald-500" />
      <GameCard title="Điền từ" onClick={() => setActiveGame('fill')} color="bg-pink-500" />
    </div>
  );
}

function GameContainer({ type, vocabList, language, onBack, onFinish, activeLessonId }: any) {
  // 1. Chống nhảy từ: Dùng useState để bồi đắp dữ liệu đúng 1 lần khi khởi tạo
  const [gameVocabs] = useState(() => {
    const currentDict = language === 'en' ? enDictDataRaw : deDictDataRaw;
    const enriched = vocabList.map((v: any) => {
        const d = currentDict.find(item => item.word.toLowerCase() === v.word.toLowerCase());
        return d ? { ...v, ...d } : v;
    });
    return type === 'flashcards' ? enriched : [...enriched].sort(() => 0.5 - Math.random()).slice(0, 5);
  });

  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const currentVocab = gameVocabs[step];
  const [answerHistory, setAnswerHistory] = useState<(string|null)[]>(new Array(gameVocabs.length).fill(null));

  // Hook âm thanh: Phải nằm ngoài mọi điều kiện IF
  useEffect(() => {
    if (isFinished && type !== 'flashcards') {
        const percentage = Math.round((score / gameVocabs.length) * 100);
        if (percentage >= 80) playGameSound('success');
    }
  }, [isFinished, score, gameVocabs.length, type]);

  const handleAnswer = (correct: boolean, userAnswer: string) => {
      const newHistory = [...answerHistory];
      newHistory[step] = correct ? 'correct' : 'wrong';
      setAnswerHistory(newHistory);
      if (correct) { setScore(s => s + 1); playGameSound('correct'); }
      else { 
        playGameSound('wrong');
        setMistakes(prev => [...prev, { 
            word: currentVocab.word, 
            userAnswer: userAnswer || 'Chưa trả lời', 
            correctAnswer: type === 'writing' ? currentVocab.word : (currentVocab.vietnamese_meaning || currentVocab.meaning) 
        }]);
      }
  };

  const handleNext = () => {
    if (step < gameVocabs.length - 1) setStep(s => s + 1);
    else { if (type === 'flashcards') onFinish(score, []); else setIsFinished(true); }
  };

  // MÀN HÌNH TỔNG KẾT
  if (isFinished) {
    const isGood = Math.round((score / gameVocabs.length) * 100) >= 80;
    return (
      <div className="w-full max-w-3xl mx-auto">
        {isGood && <Confetti />}
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100 text-center relative overflow-hidden z-10">
          <img src={isGood ? "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Happy" : "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Sad"} className="w-32 h-32 mx-auto mb-6 bg-indigo-50 rounded-full p-4" alt="Mochi" />
          <h2 className="text-3xl font-black mb-4">{isGood ? getRandomPraise(language) : "Cố gắng lên nhé! Đừng bỏ cuộc!"}</h2>
          <p className="text-lg mb-8">Bạn đã làm đúng <strong className="text-emerald-600">{score}</strong>/{gameVocabs.length} câu!</p>
          {mistakes.length > 0 && (
            <div className="text-left bg-slate-50 p-6 rounded-2xl mb-8">
              {mistakes.map((m, i) => (
                <div key={i} className="mb-2">
                   <strong className="text-indigo-600">{m.word}:</strong> Trả lời <span className="line-through text-red-500">{m.userAnswer}</span>. Đáp án: <span className="text-[#009900]">{m.correctAnswer}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => onFinish(score, mistakes)} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold text-xl">Hoàn thành</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold"><ChevronLeft size={20} /> Quay lại</button>
        {type !== 'matching' && (
          <div className="flex gap-2 flex-1 max-w-sm mx-4">
            {gameVocabs.map((_, i) => (
              <div key={i} className={cn("h-2 rounded-full flex-1 transition-all", i < step ? (answerHistory[i] === 'correct' ? "bg-[#009900]" : "bg-red-500") : i === step ? "bg-indigo-400 animate-pulse" : "bg-slate-200")} />
            ))}
          </div>
        )}
        <div className="font-bold text-indigo-600">{step + 1}/{gameVocabs.length}</div>
      </div>

      <AnimatePresence mode="wait">
        {type === 'flashcards' && <FlashcardGame key={step} vocab={currentVocab} onNext={handleNext} onPrev={() => setStep(s => Math.max(0, s-1))} language={language} step={step} />}
        {type === 'quiz' && <QuizGame key={step} vocab={currentVocab} allVocabs={gameVocabs} onAnswer={handleAnswer} onNextStep={handleNext} language={language} />}
        {type === 'matching' && <MatchingGame vocabs={gameVocabs} onCompleteGame={(s: any, m: any) => { setScore(s); setMistakes(m); setIsFinished(true); }} language={language} />}
        {type === 'writing' && <WritingGame key={step} vocab={currentVocab} onAnswer={handleAnswer} onNextStep={handleNext} language={language} />}
        {type === 'fill' && <FillGame key={step} vocab={currentVocab} onAnswer={handleAnswer} onNextStep={handleNext} language={language} />}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------------------------
// MINI GAMES - CẬP NHẬT MÀU SẮC & ÂM THANH
// ------------------------------------------------------------------------------------

function FlashcardGame({ vocab, onNext, onPrev, language, step }: any) {
  const [side, setSide] = useState(0); 
  useEffect(() => setSide(0), [vocab]);
  useEffect(() => { if (side === 2) handleSpeak(vocab.word, language); }, [side]);
  const definition = language === 'en' ? (vocab.english_definition || vocab.definition) : (vocab.german_definition || vocab.definition);
  return (
    <div className="space-y-8 w-full max-w-4xl mx-auto">
      <motion.div key={side} initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3 }} onClick={() => setSide((side + 1) % 3)} className="w-full h-[220px] bg-white rounded-3xl shadow-xl flex flex-col justify-center p-10 cursor-pointer border border-slate-100">
        {side === 0 && <div className="text-xl leading-relaxed text-left">{vocab.part_of_speech && <span className="font-bold text-indigo-600 mr-2">({vocab.part_of_speech})</span>}{definition}</div>}
        {side === 1 && <div className="text-left"><div className="text-2xl font-bold text-[#009900] mb-2">{vocab.vietnamese_meaning || vocab.meaning}</div><div className="flex items-center gap-2 text-slate-500"><Volume2 size={20} /><span className="font-mono">{renderPhonetic(vocab.phonetic)}</span></div></div>}
        {side === 2 && <div className="text-left space-y-3"><div className="text-2xl font-bold text-indigo-600">{vocab.word} <span className="font-normal text-slate-400 text-lg">({vocab.part_of_speech})</span></div><div className="flex items-center gap-2 text-slate-500"><Volume2 size={20} /><span className="font-mono">{renderPhonetic(vocab.phonetic)}</span></div><div className="pt-3 border-t italic text-slate-700">{highlightWordInSentence(vocab.example_english || vocab.example || '', vocab.word)}</div></div>}
      </motion.div>
      <div className="flex gap-4"><button onClick={onPrev} disabled={step === 0} className="flex-1 py-4 bg-white border-2 rounded-2xl font-bold">Lùi lại</button><button onClick={onNext} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">Tiếp theo</button></div>
    </div>
  );
}

function QuizGame({ vocab, allVocabs, onAnswer, onNextStep, language }: any) {
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    handleSpeak(vocab.word, language);
    let others = allVocabs.filter((v:any) => v.word !== vocab.word).sort(() => 0.5 - Math.random());
    const all = [vocab.vietnamese_meaning || vocab.meaning, ...others.slice(0, 3).map((v:any) => v.vietnamese_meaning || v.meaning)].sort(() => 0.5 - Math.random());
    setOptions(all); setSelected(null);
  }, [vocab]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[2rem] shadow-xl text-center border border-slate-100 flex items-center justify-center gap-4">
        <h3 className="text-3xl font-bold text-indigo-600">{vocab.word}</h3><Volume2 className="text-indigo-400 cursor-pointer" onClick={() => handleSpeak(vocab.word, language)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((opt, i) => (
          <button key={i} disabled={!!selected} onClick={() => { setSelected(opt); onAnswer(opt === (vocab.vietnamese_meaning || vocab.meaning), opt); setTimeout(onNextStep, 1000); }} 
            className={cn("p-6 rounded-3xl text-left font-bold text-lg border-2 min-h-[100px]", 
              selected === opt ? (opt === (vocab.vietnamese_meaning || vocab.meaning) ? "bg-green-50 border-[#009900] text-[#009900]" : "bg-red-50 border-red-500 text-red-600") : "bg-white border-slate-100 hover:border-indigo-300")}
          >{opt}</button>
        ))}
      </div>
    </div>
  );
}

function MatchingGame({ vocabs, onCompleteGame, playSound, language }: any) {
  const [words] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [meanings] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedMeaning, setSelectedMeaning] = useState<string | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    if (selectedWord && selectedMeaning) {
      const v = vocabs.find((v:any) => v.word === selectedWord);
      const isCorrect = (v?.vietnamese_meaning || v?.meaning) === selectedMeaning;
      if (isCorrect) {
        setMatches(prev => [...prev, selectedWord]); playGameSound('correct'); setSelectedWord(null); setSelectedMeaning(null);
        if (matches.length + 1 === vocabs.length) setTimeout(() => onCompleteGame(vocabs.length - errorCount, mistakes), 800);
      } else {
        setWrong([selectedWord, selectedMeaning]); playGameSound('wrong'); setErrorCount(e => e + 1);
        setMistakes(prev => [...prev, { word: selectedWord, userAnswer: selectedMeaning, correctAnswer: (v?.vietnamese_meaning || v?.meaning) }]);
        setTimeout(() => { setWrong(null); setSelectedWord(null); setSelectedMeaning(null); }, 1000);
      }
    }
  }, [selectedWord, selectedMeaning]);

  return (
    <div className="grid grid-cols-2 gap-8">
      <div className="space-y-4">{words.map((v:any) => (
        <button key={v.word} disabled={matches.includes(v.word)} onClick={() => setSelectedWord(v.word)} className={cn("w-full p-5 rounded-2xl font-bold border-2", matches.includes(v.word) ? "bg-green-50 text-[#009900] border-[#009900] opacity-50" : selectedWord === v.word ? "bg-indigo-50 border-indigo-600" : wrong?.[0] === v.word ? "bg-red-50 border-red-500" : "bg-white border-slate-100")}>{v.word}</button>
      ))}</div>
      <div className="space-y-4">{meanings.map((v:any) => (
        <button key={v.word} disabled={matches.some(m => checkMatch(vocabs.find((vc:any) => vc.word === m)?.vietnamese_meaning || '', v.vietnamese_meaning || v.meaning))} onClick={() => setSelectedMeaning(v.vietnamese_meaning || v.meaning)} className={cn("w-full p-5 rounded-2xl font-bold border-2", matches.some(m => checkMatch(vocabs.find((vc:any) => vc.word === m)?.vietnamese_meaning || '', v.vietnamese_meaning || v.meaning)) ? "bg-green-50 text-[#009900] border-[#009900] opacity-50" : selectedMeaning === (v.vietnamese_meaning || v.meaning) ? "bg-indigo-50 border-indigo-600" : wrong?.[1] === (v.vietnamese_meaning || v.meaning) ? "bg-red-50 border-red-500" : "bg-white border-slate-100")}>{v.vietnamese_meaning || v.meaning}</button>
      ))}</div>
    </div>
  );
}

function WritingGame({ vocab, onAnswer, onNextStep, language }: any) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  useEffect(() => handleSpeak(vocab.word, language), [vocab]);
  const check = () => {
    setSubmitted(true); const correct = checkMatch(input, vocab.word);
    setIsCorrect(correct); onAnswer(correct, input);
    setTimeout(onNextStep, correct ? 800 : 2500);
  };
  return (
    <div className="space-y-8 text-center">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl border">
        <Volume2 size={48} className="mx-auto mb-4 text-indigo-600 cursor-pointer" onClick={() => handleSpeak(vocab.word, language)} />
        <p className="font-bold text-slate-500 uppercase text-xs">Nghe và viết lại</p>
        <p className="text-xl font-medium mt-4">Nghĩa: {vocab.vietnamese_meaning || vocab.meaning}</p>
      </div>
      <input autoFocus value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !submitted && check()} disabled={submitted} className={cn("w-full py-6 text-3xl font-black text-center border-4 rounded-3xl outline-none", submitted ? (isCorrect ? "border-[#009900] text-[#009900] bg-green-50" : "border-red-500 text-red-600 bg-red-50") : "focus:border-indigo-500")} />
      {submitted && !isCorrect && <div className="text-[#009900] font-bold text-lg">Đáp án đúng là: {vocab.word}</div>}
    </div>
  );
}

function FillGame({ vocab, onAnswer, onNextStep, language }: any) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const sentence = vocab.example_english || vocab.example_german || vocab.example || "";
  const parts = sentence.split(new RegExp(`(${vocab.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  const hasMatch = parts.length > 1;

  const check = () => {
    setSubmitted(true); const correct = checkMatch(input, vocab.word);
    setIsCorrect(correct); onAnswer(correct, input);
    setTimeout(onNextStep, correct ? 800 : 2500);
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-10 rounded-[3rem] shadow-xl border relative">
        <Volume2 size={24} className="absolute top-6 right-6 text-indigo-400 cursor-pointer" onClick={() => handleSpeak(sentence, language)} />
        <h3 className="text-2xl leading-loose text-center mt-6">
          {hasMatch ? parts.map((p, i) => p.toLowerCase() === vocab.word.toLowerCase() ? (
            <span key={i} className={cn("inline-block min-w-[100px] border-b-4 mx-2 px-2", submitted ? (isCorrect ? "text-[#009900] border-[#009900]" : "text-red-500 border-red-500") : "border-indigo-300 text-indigo-600")}>{submitted ? p : "..."}</span>
          ) : p) : sentence}
        </h3>
        <p className="text-center mt-8 font-bold text-slate-500">Nghĩa của từ: <span className="text-indigo-600">{vocab.vietnamese_meaning || vocab.meaning}</span></p>
      </div>
      <input autoFocus value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !submitted && check()} disabled={submitted} className={cn("w-full py-6 text-2xl font-bold text-center border-4 rounded-3xl outline-none", submitted ? (isCorrect ? "border-[#009900] bg-green-50" : "border-red-500 bg-red-50") : "focus:border-indigo-500")} placeholder="Nhập từ còn thiếu..." />
      {submitted && !isCorrect && <div className="text-center text-[#009900] font-bold">Đáp án đúng: {vocab.word}</div>}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// BÁO CÁO & FOOTER
// ------------------------------------------------------------------------------------

function ReportView({ results, language, activeLessonId }: any) {
  const currentSession = results.filter((r:any) => r.lessonId === activeLessonId && r.language === language);
  const chartData = currentSession.map((r:any) => ({ name: getGameTitle(r.gameType), score: r.score }));
  const totalScore = currentSession.reduce((acc:any, r:any) => acc + r.score, 0);
  const accuracy = currentSession.length > 0 ? Math.round((totalScore / (currentSession.length * 5)) * 100) : 0;

  const getFeedback = (acc: number) => {
    if (acc >= 90) return "AIBTeM nhận thấy bạn đã nắm vững toàn bộ kiến thức bài học này! Tuyệt vời!";
    if (acc >= 70) return "Kết quả rất tốt! Hãy thử ôn lại Game Luyện viết để nhớ từ sâu hơn nhé.";
    return "Bạn cần luyện tập thêm với Flashcards để ghi nhớ các từ vựng này kỹ hơn.";
  };

  return (
    <div className="space-y-8 pb-20">
      <h2 className="text-3xl font-bold text-center">Báo cáo Tổng hợp</h2>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-xl h-80">
          <ResponsiveContainer><BarChart data={chartData}><XAxis dataKey="name" /><YAxis /><Bar dataKey="score" fill="#4f46e5" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>
        </div>
        <div className="bg-indigo-600 p-8 rounded-3xl shadow-xl text-white text-center flex flex-col justify-center">
          <Trophy size={64} className="mx-auto mb-4 text-indigo-200" />
          <div className="text-6xl font-black">{accuracy}%</div>
          <p className="text-xl font-bold">Độ chính xác trung bình</p>
        </div>
      </div>
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><BrainCircuit className="text-indigo-600" /> AIBTeM Nhận xét</h3>
        <p className="text-lg text-slate-700">{currentSession.length === 0 ? "Hãy hoàn thành trò chơi để nhận phân tích." : getFeedback(accuracy)}</p>
      </div>
    </div>
  );
}

function DictionaryView({ language }: any) {
  return <div className="text-center py-20">Tính năng từ điển đang được đồng bộ dữ liệu...</div>;
}

function TopicLibraryView({ language, lessons, setEditingLesson, setView }: any) {
  return <div className="text-center py-20">Thư viện chủ đề đang sẵn sàng cho {language.toUpperCase()}...</div>;
}

function LibraryView({ lessons, language, setEditingLesson, setView, setPlayVocabList, setActiveLessonId }: any) {
  const list = lessons.filter((l:any) => l.language === language);
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Thư viện của bạn</h2>
      {list.map((l:any) => (
        <div key={l.id} className="bg-white p-6 rounded-3xl shadow-sm border flex items-center justify-between">
          <div><h3 className="text-xl font-bold">{l.title}</h3><p className="text-slate-500">{l.wordCount} thuật ngữ</p></div>
          <button onClick={() => { setPlayVocabList(l.vocabularies); setActiveLessonId(l.id); setView('games'); }} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold">Bắt đầu học</button>
        </div>
      ))}
    </div>
  );
}

function InputView({ language, user, onSaved, initialLesson }: any) {
  return <div className="text-center py-20">Tính năng nhập liệu nâng cao...</div>;
}

function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-8 flex justify-between items-center text-sm text-slate-400">
        <p>© 2026 Vũ Xuân Hùng | Vocab AIBTeM</p>
        <div className="flex items-center gap-2"><Mail size={14} /> hungvdtnai@gmail.com</div>
      </div>
    </footer>
  );
}

function GameCard({ title, onClick, color }: any) {
  return (
    <button onClick={onClick} className={cn("p-10 rounded-[2.5rem] shadow-xl text-left transition-all hover:scale-105 bg-white border border-slate-100 group")}>
      <div className={cn("w-14 h-14 rounded-2xl mb-6 flex items-center justify-center", color)}><Gamepad2 className="text-white" /></div>
      <h3 className="text-2xl font-bold group-hover:text-indigo-600">{title}</h3>
    </button>
  );
}