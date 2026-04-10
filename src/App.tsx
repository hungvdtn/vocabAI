import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, PlusCircle, Gamepad2, BarChart3, Volume2, Upload, ChevronRight, ChevronLeft, CheckCircle2, XCircle, Trophy, RefreshCw, Home, BrainCircuit, Trash2, FileText, Loader2, Mail, Search, Calendar, Clock, User as UserIcon, Play, Edit2, Download, LogOut, ChevronDown, BookOpen, Mic, LayoutGrid, GraduationCap, Briefcase, Coffee, HeartPulse, Rocket, Globe, Leaf, Plane, Shuffle, Save, CheckSquare, AlertCircle } from 'lucide-react';
import Lottie from 'lottie-react';
import * as mammoth from 'mammoth';
import { collection, addDoc, query, where, onSnapshot, getDocs, doc, deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { generateExampleSentence, translateWord } from './services/ai';
import { cn } from './lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import enDictDataRaw from './data/en_3000.json';
import deDictDataRaw from './data/de_3000.json';

type Language = 'en' | 'de';
type View = 'home' | 'topics' | 'input' | 'library' | 'games' | 'report' | 'dictionary';
type GameType = 'flashcards' | 'quiz' | 'matching' | 'writing' | 'fill';

interface Vocabulary { id?: string; word: string; meaning: string; type?: string; part_of_speech?: string; phonetic?: string; definition?: string; english_definition?: string; german_definition?: string; example?: string; example_english?: string; example_german?: string; example_vietnamese?: string; article?: string; synonyms?: string; topic?: string; language: Language; userId: string; createdAt: any; suggestions?: string[]; }
interface Lesson { id?: string; title: string; wordCount: number; userId: string; userName: string; language: Language; createdAt: number; lastPracticed?: number; practiceCount?: number; vocabularies: Vocabulary[]; }
interface GameResult { lessonId: string; gameType: GameType; score: number; total: number; timestamp: number; language: Language; }

const Confetti = () => {
  const colors = ['bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-yellow-400', 'bg-purple-500', 'bg-pink-500'];
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {[...Array(80)].map((_, i) => (
        <motion.div key={i} initial={{ y: -50, x: 0, rotate: 0, opacity: 1 }} animate={{ y: '100vh', x: Math.random() * 300 - 150, rotate: 720, opacity: 0 }} transition={{ duration: 2 + Math.random() * 4, delay: Math.random() * 0.5, ease: "easeOut" }} className={cn("absolute w-3 h-3 shadow-sm", colors[Math.floor(Math.random() * colors.length)], Math.random() > 0.5 ? "rounded-full" : "rounded-sm")} style={{ left: `${Math.random() * 100}%` }} />
      ))}
    </div>
  );
};

const PRAISE_MESSAGES = {
  en: ["Keep up the good work! Tuyệt vời!", "Excellent! Bạn đang làm rất tốt!", "Outstanding! Cứ thế phát huy nhé!", "Impressive! Điểm số nói lên tất cả!", "Brilliant! Bạn thực sự là một cao thủ!", "Perfect! Bạn sắp thông thạo tiếng Anh rồi!"],
  de: ["Weiter so! Tuyệt vời!", "Ausgezeichnet! Bạn đang làm rất tốt!", "Hervorragend! Cứ thế phát huy nhé!", "Beeindruckend! Điểm số nói lên tất cả!", "Wunderbar! Bạn thực sự là một cao thủ!", "Perfekt! Bạn sắp thông thạo tiếng Đức rồi!"]
};
const getRandomPraise = (lang: Language) => PRAISE_MESSAGES[lang][Math.floor(Math.random() * PRAISE_MESSAGES[lang].length)];

const checkMatch = (val1: string, val2: string) => {
  if (!val1 || !val2) return false;
  const clean = (s: string) => s.toLowerCase().replace(/[.,!?;:'"()[\]{}]/g, '').replace(/\s+/g, ' ').trim();
  return clean(val1) === clean(val2);
};

const playGameSound = (type: 'correct' | 'wrong' | 'success') => {
  const audioSrc = type === 'correct' ? '/assets/correct.mp3' : type === 'wrong' ? '/assets/error-3.mp3' : '/assets/great-success.mp3';
  new Audio(audioSrc).play().catch(() => {});
};

const handleSpeak = (text: string, lang: Language) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'en' ? 'en-US' : 'de-DE';
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    let voice = voices.find(v => v.lang.toLowerCase().startsWith(lang) && (v.name.includes('Natural') || v.name.includes('Google')));
    if (!voice) voice = voices.find(v => v.lang.toLowerCase().startsWith(lang));
    if (voice) utterance.voice = voice;
  }
  window.speechSynthesis.speak(utterance);
};

const highlightWord = (sentence: string, word: string) => {
  if (!sentence || !word) return sentence;
  try {
    const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return sentence.split(regex).map((part, i) => regex.test(part) ? <span key={i} className="text-blue-600 font-bold">{part}</span> : part);
  } catch { return sentence; }
};

const renderPhonetic = (p?: string) => p ? `/${p.trim().replace(/[\[\]\/]/g, '')}/` : null;
const KNOWN_TOPICS = ['education_and_learning', 'work_and_business', 'daily_life', 'health_and_body', 'science_and_technology', 'society_and_culture', 'nature_and_environment', 'travel_and_transport', 'other'];

const mapSubTopicToMainTopic = (rawTopic?: string) => {
  if (!rawTopic) return 'other';
  const t = rawTopic.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
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

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false); };
    document.addEventListener("mousedown", handleClick); return () => document.removeEventListener("mousedown", handleClick);
  }, [menuRef]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'lessons'), where('userId', '==', user.uid)), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson));
      items.sort((a, b) => b.createdAt - a.createdAt); setLessons(items);
    });
  }, [user]);

  const login = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e: any) { alert(e.message); } };
  const logout = async () => { await signOut(auth); setView('home'); setIsTestMode(false); };
  const enterTestMode = () => { setIsTestMode(true); setUser({ uid: 'test-123', displayName: 'Người dùng Thử nghiệm' } as any); };

  useEffect(() => {
    if (!user || isTestMode) return;
    return onSnapshot(query(collection(db, 'vocabularies'), where('userId', '==', user.uid), where('language', '==', language)), (snapshot) => {
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vocabulary)));
    });
  }, [user, language, isTestMode]);

  const handleGameComplete = async (res: GameResult) => {
    const newResults = [...gameResults, { ...res, language }];
    setGameResults(newResults);
    if (activeLessonId && !isTestMode) {
      const lessonRef = doc(db, 'lessons', activeLessonId);
      const currentLesson = lessons.find(l => l.id === activeLessonId);
      await updateDoc(lessonRef, { lastPracticed: Date.now(), practiceCount: (currentLesson?.practiceCount || 0) + 1 }).catch(()=>{});
    }
    setActiveGame(null); 
    if (activeLessonId) {
       if (new Set(newResults.filter(r => r.lessonId === activeLessonId).map(r => r.gameType)).size >= 5) {
          playGameSound('success'); setView('report');
       }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3"><Languages className="text-white w-10 h-10" /></div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Vocab AIBTeM</h1>
          <p className="text-slate-500 mb-8">Nâng tầm vốn từ vựng Tiếng Anh & Đức với sức mạnh AIBTeM.</p>
          <button onClick={login} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all shadow-md mb-4">Đăng nhập với Google</button>
          <button onClick={enterTestMode} className="w-full bg-slate-100 text-slate-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3"><Gamepad2 size={20} className="text-indigo-600" /> Test Mode</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <nav className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 md:px-8 sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setActiveGame(null); }}>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"><Languages className="text-white w-5 h-5" /></div>
          <span className="font-bold text-xl hidden sm:block">Vocab AIBTeM</span>
        </div>
        <div className="hidden md:flex items-center gap-2 lg:gap-4">
          <NavButton active={view === 'topics'} onClick={() => setView('topics')} icon={<LayoutGrid size={18} />} label="Chủ đề" />
          <NavButton active={view === 'input'} onClick={() => setView('input')} icon={<PlusCircle size={18} />} label="Nhập liệu" />
          <NavButton active={view === 'library'} onClick={() => setView('library')} icon={<FileText size={18} />} label="Thư viện" />
          <NavButton active={view === 'games'} onClick={() => setView('games')} icon={<Gamepad2 size={18} />} label="Trò chơi" />
          <NavButton active={view === 'report'} onClick={() => setView('report')} icon={<BarChart3 size={18} />} label="Báo cáo" />
          <NavButton active={view === 'dictionary'} onClick={() => setView('dictionary')} icon={<BookOpen size={18} />} label="Từ điển" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => { setLanguage('en'); setEditingLesson(null); setPlayVocabList([]); setActiveLessonId(null); setGameResults([]); }} className={cn("px-2 md:px-3 py-1 rounded-lg text-sm font-bold", language === 'en' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}>EN</button>
            <button onClick={() => { setLanguage('de'); setEditingLesson(null); setPlayVocabList([]); setActiveLessonId(null); setGameResults([]); }} className={cn("px-2 md:px-3 py-1 rounded-lg text-sm font-bold", language === 'de' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}>DE</button>
          </div>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-slate-100 border border-slate-200">
              <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" alt="User" />
            </button>
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl py-2 z-50">
                  <div className="px-4 py-2 border-b mb-2"><p className="text-xs font-bold text-slate-400">Tài khoản</p><p className="text-sm font-bold truncate">{user.displayName}</p></div>
                  <button onClick={isTestMode ? login : logout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold"><LogOut size={16} /> {isTestMode ? "Đăng nhập" : "Đăng xuất"}</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex-grow w-full flex flex-col">
        <AnimatePresence mode="wait">
          {view === 'home' && <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><HomeView setView={setView} language={language} user={user} lessons={lessons} /></motion.div>}
          {view === 'topics' && <motion.div key="topics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TopicLibraryView language={language} lessons={lessons} onOpenInInput={(vocabData:any, generatedTitle:any) => { setEditingLesson({ title: generatedTitle, vocabularies: vocabData, language, wordCount: vocabData.length, userId: user.uid, userName: user.displayName || '', createdAt: Date.now() } as Lesson); setView('input'); }} /></motion.div>}
          {view === 'dictionary' && <motion.div key="dict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><DictionaryView language={language} /></motion.div>}
          {view === 'input' && <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><InputView language={language} user={user} initialLesson={editingLesson || undefined} onSaved={() => { setEditingLesson(null); setView('library'); }} /></motion.div>}
          {view === 'games' && <motion.div key="games" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><GamesView vocabList={playVocabList} language={language} onComplete={handleGameComplete} activeGame={activeGame} setActiveGame={setActiveGame} onGoToLibrary={() => setView('library')} activeLessonId={activeLessonId || ''} /></motion.div>}
          {view === 'library' && <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><LibraryView lessons={lessons} language={language} onEdit={(l:any) => { setEditingLesson(l); setView('input'); }} onPlay={(l:any) => { setPlayVocabList(l.vocabularies); setActiveLessonId(l.id || null); setView('games'); }} onDelete={async (id:string) => { await deleteDoc(doc(db, 'lessons', id)); }} /></motion.div>}
          {view === 'report' && <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><ReportView results={gameResults} language={language} activeLessonId={activeLessonId || ''} /></motion.div>}
        </AnimatePresence>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-2 z-50">
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

function NavButton({ active, onClick, icon, label }: any) {
  return <button onClick={onClick} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-all", active ? "bg-indigo-50 text-indigo-600" : "text-slate-600 hover:bg-slate-50")}>{icon}{label}</button>;
}
function MobileNavButton({ active, onClick, icon }: any) {
  return <button onClick={onClick} className={cn("p-3 rounded-2xl", active ? "bg-indigo-600 text-white" : "text-slate-400")}>{icon}</button>;
}

// --- SUB VIEWS ---
function HomeView({ setView, language, user, lessons }: any) {
  return (
    <div className="space-y-8">
      <div className="bg-indigo-600 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
        <h2 className="text-4xl font-bold mb-4">Chào mừng, {user.displayName?.split(' ')[0]}!</h2>
        <p className="text-indigo-100 text-lg mb-8">Sẵn sàng chinh phục {language === 'en' ? 'Tiếng Anh' : 'Tiếng Đức'}?</p>
        <div className="flex gap-4">
          <button onClick={() => setView('topics')} className="bg-white text-indigo-600 px-6 py-3 rounded-2xl font-bold shadow-lg">Khám phá <ChevronRight className="inline" size={18}/></button>
        </div>
        <Languages className="absolute right-[-5%] bottom-[-10%] opacity-20 w-64 h-64 rotate-12" />
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border"><p className="text-slate-500 font-bold">Bài học</p><p className="text-2xl font-black">{lessons.filter((l:any)=>l.language === language).length}</p></div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border"><p className="text-slate-500 font-bold">Từ đã lưu</p><p className="text-2xl font-black">{lessons.filter((l:any)=>l.language===language).reduce((acc:any, l:any) => acc + l.wordCount, 0)}</p></div>
      </div>
    </div>
  );
}

function TopicLibraryView({ language, lessons, onOpenInInput }: any) {
  const currentDict = language === 'en' ? enDictDataRaw : deDictDataRaw;
  const topics = [
    { id: 'education_and_learning', name: 'Giáo dục & Học tập', icon: GraduationCap, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'work_and_business', name: 'Công sở & Kinh doanh', icon: Briefcase, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { id: 'daily_life', name: 'Đời sống hàng ngày', icon: Coffee, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'travel_and_transport', name: 'Du lịch & Giao thông', icon: Plane, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'other', name: 'Chủ đề khác', icon: LayoutGrid, color: 'text-slate-700', bg: 'bg-slate-100' }
  ];
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {topics.map(t => {
        const words = currentDict.filter(w => mapSubTopicToMainTopic(w.topic) === t.id || (t.id==='other' && !KNOWN_TOPICS.includes(mapSubTopicToMainTopic(w.topic))));
        if (words.length === 0) return null;
        return (
          <button key={t.id} onClick={() => onOpenInInput(words.map(w=>({...w, language, meaning: w.vietnamese_meaning || w.meaning})).slice(0,15), t.name + ' - 01')} className="bg-white p-8 rounded-[2rem] shadow-sm border text-left hover:shadow-xl transition-all group">
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6", t.bg, t.color)}><t.icon size={28} /></div>
            <h3 className="text-xl font-bold mb-2">{t.name}</h3><p className="text-slate-500 font-medium">{words.length} từ vựng</p>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// GAMES VIEW & CONTAINER (CHỐNG NHẢY TỪ & FIX LỖI WHITE SCREEN)
// ------------------------------------------------------------------------------------
function GamesView({ vocabList, language, activeGame, setActiveGame, onComplete, onGoToLibrary, activeLessonId }: any) {
  if (vocabList.length < 5) return <div className="text-center py-20 bg-white rounded-3xl shadow-xl"><h3 className="text-2xl font-bold mb-4">Chưa chọn bài học</h3><button onClick={onGoToLibrary} className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold">Vào Thư viện</button></div>;

  if (activeGame) {
    return <GameContainer type={activeGame} vocabList={vocabList} language={language} onBack={() => setActiveGame(null)} onFinish={(score: number, mistakes: any[]) => onComplete({ lessonId: activeLessonId, gameType: activeGame, score, total: activeGame === 'flashcards' ? vocabList.length : 5, timestamp: Date.now() })} />;
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      <button onClick={() => setActiveGame('flashcards')} className="bg-white p-8 rounded-3xl shadow-xl text-left border hover:scale-105 transition-all"><div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-4"><BrainCircuit className="text-white" size={32}/></div><h3 className="text-xl font-bold">Flashcards</h3></button>
      <button onClick={() => setActiveGame('quiz')} className="bg-white p-8 rounded-3xl shadow-xl text-left border hover:scale-105 transition-all"><div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mb-4"><CheckCircle2 className="text-white" size={32}/></div><h3 className="text-xl font-bold">Trắc nghiệm</h3></button>
      <button onClick={() => setActiveGame('matching')} className="bg-white p-8 rounded-3xl shadow-xl text-left border hover:scale-105 transition-all"><div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mb-4"><RefreshCw className="text-white" size={32}/></div><h3 className="text-xl font-bold">Nối từ</h3></button>
      <button onClick={() => setActiveGame('writing')} className="bg-white p-8 rounded-3xl shadow-xl text-left border hover:scale-105 transition-all"><div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mb-4"><Volume2 className="text-white" size={32}/></div><h3 className="text-xl font-bold">Luyện viết</h3></button>
      <button onClick={() => setActiveGame('fill')} className="bg-white p-8 rounded-3xl shadow-xl text-left border hover:scale-105 transition-all"><div className="w-16 h-16 bg-pink-500 rounded-2xl flex items-center justify-center mb-4"><ChevronRight className="text-white" size={32}/></div><h3 className="text-xl font-bold">Điền từ</h3></button>
    </div>
  );
}

function GameContainer({ type, vocabList, language, onBack, onFinish }: any) {
  const [gameVocabs] = useState(() => {
    const dict = language === 'en' ? enDictDataRaw : deDictDataRaw;
    const enriched = vocabList.map((v:any) => { const d = dict.find(x => x.word.toLowerCase() === v.word.toLowerCase()); return d ? {...v, ...d} : v; });
    return type === 'flashcards' ? enriched : [...enriched].sort(() => 0.5 - Math.random()).slice(0, 5);
  });
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const currentVocab = gameVocabs[step];
  const [answerHistory, setAnswerHistory] = useState<(string|null)[]>(new Array(gameVocabs.length).fill(null));

  useEffect(() => { if (type === 'flashcards') { const h = [...answerHistory]; h[step] = 'correct'; setAnswerHistory(h); } }, [step]);
  useEffect(() => { if (isFinished && type !== 'flashcards' && Math.round((score/gameVocabs.length)*100) >= 80) playGameSound('success'); }, [isFinished]);

  const handleAnswer = (correct: boolean, ans: string, w?: string, cAns?: string) => {
      const h = [...answerHistory]; h[step] = correct ? 'correct' : 'wrong'; setAnswerHistory(h);
      if (correct) { setScore(s => s + 1); playGameSound('correct'); }
      else { playGameSound('wrong'); if (type !== 'flashcards') setMistakes(p => [...p, { word: w || currentVocab.word, userAnswer: ans, correctAnswer: cAns || currentVocab.word }]); }
  };

  const nextStep = () => { if (step < gameVocabs.length - 1) setStep(s => s + 1); else { if (type === 'flashcards') onFinish(score, []); else setIsFinished(true); } };

  if (isFinished) {
      const isGood = Math.round((score / gameVocabs.length) * 100) >= 80;
      return (
          <div className="w-full max-w-3xl mx-auto">
              {isGood && <Confetti />}
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-[3rem] p-10 shadow-xl border text-center relative z-10">
                  <h2 className="text-4xl font-black mb-4">{isGood ? getRandomPraise(language) : "Cố gắng lên nhé!"}</h2>
                  <p className="text-xl mb-8 font-medium">Bạn đã làm đúng <strong className="text-emerald-600">{score}</strong>/{gameVocabs.length} câu!</p>
                  {mistakes.length > 0 && <div className="text-left bg-slate-50 p-6 rounded-3xl mb-8 space-y-3">{mistakes.map((m, i) => <div key={i} className="bg-white p-4 rounded-xl shadow-sm border"><strong className="text-indigo-600">{m.word}:</strong> Sai: <span className="line-through text-red-500">{m.userAnswer}</span>. Đúng: <span className="text-[#009900] font-bold">{m.correctAnswer}</span></div>)}</div>}
                  <button onClick={() => onFinish(score, mistakes)} className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-bold text-xl">Hoàn thành & Nhận điểm</button>
              </motion.div>
          </div>
      );
  }

  return (
    <div className="w-full mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold"><ChevronLeft size={20} /> Quay lại</button>
        {type !== 'matching' && <div className="flex gap-2 flex-1 mx-4">{gameVocabs.map((_, i) => <div key={i} className={cn("h-2 rounded-full flex-1 transition-all", i < step || (type==='flashcards' && i===step) ? (answerHistory[i] === 'correct' ? "bg-[#009900]" : "bg-red-500") : i === step ? "bg-indigo-400 animate-pulse" : "bg-slate-200")} />)}</div>}
      </div>
      <AnimatePresence mode="wait">
        {type === 'flashcards' && <FlashcardGame key={step} vocab={currentVocab} onNext={nextStep} onPrev={() => setStep(s => Math.max(0, s-1))} language={language} step={step} />}
        {type === 'quiz' && <QuizGame key={step} vocab={currentVocab} allVocabs={gameVocabs} onAnswer={handleAnswer} onNextStep={nextStep} language={language} />}
        {type === 'matching' && <MatchingGame vocabs={gameVocabs} onCompleteGame={(s:any, m:any) => { setScore(s); setMistakes(m); setIsFinished(true); }} language={language} />}
        {type === 'writing' && <WritingGame key={step} vocab={currentVocab} onAnswer={handleAnswer} onNextStep={nextStep} language={language} />}
        {type === 'fill' && <FillGame key={step} vocab={currentVocab} onAnswer={handleAnswer} onNextStep={nextStep} language={language} />}
      </AnimatePresence>
    </div>
  );
}

// --- MINI GAMES COMPONENTS ---

function FlashcardGame({ vocab, onNext, onPrev, language, step }: any) {
  const [side, setSide] = useState(0); useEffect(() => setSide(0), [vocab]);
  useEffect(() => { if (side === 2) handleSpeak(vocab.word, language); }, [side]);
  const def = language === 'en' ? (vocab.english_definition || vocab.definition) : (vocab.german_definition || vocab.definition);
  const ex = language === 'en' ? (vocab.example_english || vocab.example) : (vocab.example_german || vocab.example);

  return (
    <div className="space-y-8 w-full max-w-4xl mx-auto">
      <div className="perspective-[1000px] w-full min-h-[220px]">
        <motion.div key={side} initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3 }} onClick={() => setSide((s) => (s + 1) % 3)} className="w-full min-h-[220px] bg-white rounded-[2rem] shadow-xl p-10 cursor-pointer flex flex-col justify-center border">
          {side === 0 && <div className="text-xl leading-relaxed text-left">{vocab.part_of_speech && <span className="font-bold text-indigo-600 mr-2">({vocab.part_of_speech})</span>}{def || "No definition."}</div>}
          {side === 1 && <div className="text-left space-y-4"><div className="text-2xl font-bold text-emerald-600">{vocab.vietnamese_meaning || vocab.meaning}</div>{vocab.phonetic && <div className="flex items-center gap-3"><Volume2 className="text-indigo-400" onClick={(e) => {e.stopPropagation(); handleSpeak(vocab.word, language)}}/><span className="text-lg font-mono text-slate-500">{renderPhonetic(vocab.phonetic)}</span></div>}</div>}
          {side === 2 && <div className="text-left space-y-4"><div className="text-2xl font-bold text-indigo-600">{vocab.word} {vocab.part_of_speech && <span className="font-normal text-slate-500">({vocab.part_of_speech})</span>}</div>{vocab.phonetic && <div className="flex items-center gap-3"><Volume2 className="text-indigo-400" onClick={(e) => {e.stopPropagation(); handleSpeak(vocab.word, language)}}/><span className="text-lg font-mono text-slate-500">{renderPhonetic(vocab.phonetic)}</span></div>}{ex && <div className="pt-4 border-t flex gap-3"><Volume2 className="text-slate-400 shrink-0" onClick={(e) => {e.stopPropagation(); handleSpeak(ex, language)}}/><div className="text-lg italic text-slate-700">{highlightWord(ex, vocab.word)} {vocab.example_vietnamese && <div className="text-base text-slate-500 not-italic mt-1">{vocab.example_vietnamese}</div>}</div></div>}</div>}
        </motion.div>
      </div>
      <div className="flex gap-4"><button onClick={onPrev} disabled={step === 0} className="flex-1 py-4 bg-white border-2 rounded-2xl font-bold disabled:opacity-50">Lùi lại</button><button onClick={onNext} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold">Tiếp theo</button></div>
    </div>
  );
}

function QuizGame({ vocab, allVocabs, onAnswer, onNextStep, language }: any) {
  const [opts, setOpts] = useState<string[]>([]); const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    handleSpeak(vocab.word, language);
    const distractors = allVocabs.filter((v:any) => v.word !== vocab.word).sort(() => 0.5 - Math.random()).slice(0,3).map((v:any) => v.vietnamese_meaning || v.meaning);
    while (distractors.length < 3) distractors.push("Đáp án mồi " + distractors.length);
    setOpts([vocab.vietnamese_meaning || vocab.meaning, ...distractors].sort(() => 0.5 - Math.random())); setSel(null);
  }, [vocab]);
  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-3xl shadow-xl text-center border"><h3 className="text-4xl font-bold text-indigo-600">{vocab.word} <Volume2 className="inline ml-2 text-indigo-400 cursor-pointer" onClick={() => handleSpeak(vocab.word, language)} /></h3></div>
      <div className="grid md:grid-cols-2 gap-4">
        {opts.map((o, i) => (
          <button key={i} disabled={!!sel} onClick={() => { setSel(o); const isCor = checkMatch(o, vocab.vietnamese_meaning || vocab.meaning); onAnswer(isCor, o); setTimeout(onNextStep, 1000); }} className={cn("p-6 rounded-3xl text-left font-bold text-lg border-2 min-h-[100px]", sel === o ? (checkMatch(o, vocab.vietnamese_meaning || vocab.meaning) ? "bg-green-50 border-[#009900] text-[#009900]" : "bg-red-50 border-red-500 text-red-600") : "bg-white border-slate-100 hover:border-indigo-300")}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function MatchingGame({ vocabs, onCompleteGame, language }: any) {
  const [words] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [meanings] = useState(() => [...vocabs].sort(() => 0.5 - Math.random()));
  const [selW, setSelW] = useState<string | null>(null); const [selM, setSelM] = useState<string | null>(null);
  const [matches, setMatches] = useState<string[]>([]); const [wrong, setWrong] = useState<any>(null);
  const [errs, setErrs] = useState<any[]>([]);

  useEffect(() => {
    if (selW && selM) {
      const isCor = checkMatch(vocabs.find((v:any) => v.word === selW)?.vietnamese_meaning || vocabs.find((v:any) => v.word === selW)?.meaning, selM);
      if (isCor) {
        setMatches(p => [...p, selW]); playGameSound('correct'); setSelW(null); setSelM(null);
        if (matches.length + 1 === vocabs.length) setTimeout(() => onCompleteGame(vocabs.length - errs.length, errs), 800);
      } else {
        setWrong([selW, selM]); playGameSound('wrong'); setErrs(p => [...p, { word: selW, userAnswer: selM, correctAnswer: vocabs.find((v:any) => v.word === selW)?.vietnamese_meaning }]);
        setTimeout(() => { setWrong(null); setSelW(null); setSelM(null); }, 1000);
      }
    }
  }, [selW, selM]);

  return (
    <div className="grid grid-cols-2 gap-8">
      <div className="space-y-4">{words.map((v:any) => <button key={v.word} disabled={matches.includes(v.word)} onClick={() => setSelW(v.word)} className={cn("w-full p-6 rounded-2xl font-bold border-2", matches.includes(v.word) ? "bg-green-50 text-[#009900] border-[#009900] opacity-50" : selW === v.word ? "bg-indigo-50 border-indigo-600 text-indigo-600" : wrong?.[0] === v.word ? "bg-red-50 border-red-500 text-red-600" : "bg-white border-slate-100")}>{v.word}</button>)}</div>
      <div className="space-y-4">{meanings.map((v:any) => <button key={v.word} disabled={matches.some(m => checkMatch(vocabs.find((vc:any)=>vc.word===m)?.vietnamese_meaning, v.vietnamese_meaning||v.meaning))} onClick={() => setSelM(v.vietnamese_meaning || v.meaning)} className={cn("w-full p-6 rounded-2xl font-bold border-2", matches.some(m => checkMatch(vocabs.find((vc:any)=>vc.word===m)?.vietnamese_meaning, v.vietnamese_meaning||v.meaning)) ? "bg-green-50 text-[#009900] border-[#009900] opacity-50" : selM === (v.vietnamese_meaning||v.meaning) ? "bg-indigo-50 border-indigo-600 text-indigo-600" : wrong?.[1] === (v.vietnamese_meaning||v.meaning) ? "bg-red-50 border-red-500 text-red-600" : "bg-white border-slate-100")}>{v.vietnamese_meaning || v.meaning}</button>)}</div>
    </div>
  );
}

function WritingGame({ vocab, onAnswer, onNextStep, language }: any) {
  const [val, setVal] = useState(''); const [sub, setSub] = useState(false); const [cor, setCor] = useState(false);
  useEffect(() => handleSpeak(vocab.word, language), [vocab]);
  const check = () => { setSub(true); const ok = checkMatch(val, vocab.word); setCor(ok); onAnswer(ok, val); setTimeout(onNextStep, ok ? 800 : 2500); };
  return (
    <div className="space-y-8 text-center">
      <div className="bg-white p-12 rounded-3xl shadow-xl border"><Volume2 size={48} className="mx-auto mb-4 text-indigo-600 cursor-pointer" onClick={() => handleSpeak(vocab.word, language)} /><p className="font-bold text-slate-500 uppercase text-xs">Nghe và viết lại</p><p className="text-xl font-medium mt-4">Nghĩa: {vocab.vietnamese_meaning || vocab.meaning}</p></div>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && !sub && check()} disabled={sub} className={cn("w-full py-6 text-3xl font-black text-center border-4 rounded-3xl outline-none", sub ? (cor ? "border-[#009900] text-[#009900] bg-green-50" : "border-red-500 text-red-600 bg-red-50") : "focus:border-indigo-500")} placeholder="..." />
      {sub && !cor && <div className="text-emerald-600 font-bold text-lg bg-red-50 py-3 rounded-2xl">Đáp án đúng: {vocab.word}</div>}
    </div>
  );
}

function FillGame({ vocab, onAnswer, onNextStep, language }: any) {
  const [val, setVal] = useState(''); const [sub, setSub] = useState(false); const [cor, setCor] = useState(false);
  const ex = language === 'en' ? (vocab.example_english || vocab.example) : (vocab.example_german || vocab.example);
  const sent = ex || "";
  let parts = [sent]; let hasMatch = false;
  try { const p = sent.split(new RegExp(`(${vocab.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')); if(p.length > 1) {parts = p; hasMatch=true;} } catch{}

  const check = () => { setSub(true); const ok = checkMatch(val, vocab.word); setCor(ok); onAnswer(ok, val, vocab.vietnamese_meaning, vocab.word); setTimeout(onNextStep, ok ? 800 : 2500); };
  return (
    <div className="space-y-8">
      <div className="bg-white p-10 rounded-3xl shadow-xl border relative">
        <Volume2 size={24} className="absolute top-6 right-6 text-indigo-400 cursor-pointer" onClick={() => handleSpeak(sent, language)} />
        <h3 className="text-3xl leading-loose text-center mt-6 text-slate-700 font-medium">
          {hasMatch ? parts.map((p, i) => p.toLowerCase() === vocab.word.toLowerCase() ? <span key={i} className={cn("inline-block min-w-[100px] border-b-4 mx-2 px-2 font-bold", sub ? (cor ? "text-[#009900] border-[#009900]" : "text-red-500 border-red-500") : "border-indigo-300 text-indigo-600 bg-indigo-50/50")}>{sub ? (cor ? p : val) : val}</span> : p) : sent}
        </h3>
        <p className="text-center mt-8 font-bold text-lg">Điền từ có nghĩa là: <span className="text-indigo-600">{vocab.vietnamese_meaning || vocab.meaning}</span></p>
      </div>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && !sub && check()} disabled={sub} className={cn("w-full py-6 text-2xl font-bold text-center border-4 rounded-3xl outline-none", sub ? (cor ? "border-[#009900] bg-green-50" : "border-red-500 bg-red-50") : "focus:border-indigo-500")} placeholder="Nhập từ còn thiếu..." />
      {sub && !cor && <div className="text-center text-emerald-600 font-bold bg-red-50 py-3 rounded-2xl text-lg">Đáp án đúng: {vocab.word}</div>}
    </div>
  );
}

// --- MACRO VIEWS ---

function ReportView({ results, language, activeLessonId }: any) {
  const cur = results.filter((r:any) => r.lessonId === activeLessonId && r.language === language);
  const acc = cur.length > 0 ? Math.round((cur.reduce((a:any, r:any) => a + r.score, 0) / (cur.length * 5)) * 100) : 0;
  return (
    <div className="space-y-8 pb-20">
      <h2 className="text-3xl font-bold text-center">Báo cáo Tổng hợp</h2>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-xl h-80 border"><ResponsiveContainer><BarChart data={cur.map((r:any) => ({ name: getGameTitle(r.gameType), score: r.score }))}><XAxis dataKey="name" /><YAxis /><Bar dataKey="score" fill="#4f46e5" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>
        <div className="bg-indigo-600 p-8 rounded-3xl shadow-xl text-white text-center flex flex-col justify-center"><Trophy size={64} className="mx-auto mb-4 text-indigo-200" /><div className="text-6xl font-black">{acc}%</div><p className="text-xl font-bold mt-2">Độ chính xác trung bình</p></div>
      </div>
      <div className="bg-white p-8 rounded-3xl shadow-xl border"><h3 className="text-xl font-bold mb-4 text-indigo-600 flex items-center gap-2"><BrainCircuit/> AIBTeM Nhận xét</h3><p className="text-lg text-slate-700 bg-slate-50 p-6 rounded-2xl">{cur.length === 0 ? "Chưa có dữ liệu." : acc >= 80 ? "AIBTeM nhận thấy bạn đã nắm vững toàn bộ kiến thức bài học này! Tuyệt vời!" : "Cần luyện tập thêm để ghi nhớ từ vựng lâu hơn nhé."}</p></div>
    </div>
  );
}

function DictionaryView() { return <div className="text-center py-20 text-slate-500 font-bold text-xl">Tính năng từ điển đang được đồng bộ dữ liệu...</div>; }
function InputView() { return <div className="text-center py-20 text-slate-500 font-bold text-xl">Tính năng nhập liệu đang được khởi tạo...</div>; }
function LibraryView({ lessons, language, setPlayVocabList, setActiveLessonId, setView }: any) {
  const list = lessons.filter((l:any) => l.language === language);
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Thư viện của bạn</h2>
      {list.length === 0 ? <p>Chưa có bài học nào.</p> : list.map((l:any) => (
        <div key={l.id} className="bg-white p-6 rounded-3xl shadow-sm border flex items-center justify-between">
          <div><h3 className="text-xl font-bold">{l.title}</h3><p className="text-slate-500">{l.wordCount} thuật ngữ</p></div>
          <button onClick={() => { setPlayVocabList(l.vocabularies); setActiveLessonId(l.id); setView('games'); }} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold">Bắt đầu học</button>
        </div>
      ))}
    </div>
  );
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