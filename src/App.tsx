import React, { useState, useEffect, useRef } from 'react';
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
  ChevronDown
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
  setDoc
} from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { speak } from './services/tts';
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

// Types
type Language = 'en' | 'de';
type View = 'home' | 'input' | 'games' | 'report' | 'library';
type GameType = 'flashcards' | 'quiz' | 'matching' | 'writing' | 'fill';

interface Vocabulary {
  id?: string;
  word: string;
  meaning: string;
  type?: string;
  pronunciation?: string;
  definition?: string;
  example?: string;
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
  vocabularies: Vocabulary[];
}

interface GameResult {
  gameType: GameType;
  score: number;
  total: number;
  timestamp: number;
  language: Language;
}

// Components
const RobotAnimation = ({ type }: { type: 'happy' | 'thinking' | 'sad' }) => {
  // Placeholders for Lottie JSON paths
  const lottiePaths = {
    happy: 'https://assets10.lottiefiles.com/packages/lf20_v7rc87p0.json',
    thinking: 'https://assets10.lottiefiles.com/packages/lf20_i9mxcD.json',
    sad: 'https://assets10.lottiefiles.com/packages/lf20_96bovdur.json'
  };
  
  return (
    <div className="w-48 h-48 mx-auto">
      <Lottie 
        animationData={null} // Normally you'd fetch the JSON
        path={lottiePaths[type]}
        loop={true}
      />
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
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Click outside menu to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  // Fetch Lessons
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'lessons'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson));
      // Sort by createdAt descending (newest first)
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

  // Fetch Vocab
  useEffect(() => {
    if (!user) return;
    
    if (isTestMode) {
      const mockVocab: Vocabulary[] = [
        { id: '1', word: 'Hello', meaning: 'Xin chào', type: 'noun', example: 'Hello, how are you?', pronunciation: '/həˈloʊ/', userId: 'test-user-123', language: 'en', createdAt: Date.now() },
        { id: '2', word: 'World', meaning: 'Thế giới', type: 'noun', example: 'The world is big.', pronunciation: '/wɜːrld/', userId: 'test-user-123', language: 'en', createdAt: Date.now() },
        { id: '3', word: 'Apple', meaning: 'Quả táo', type: 'noun', example: 'I like apples.', pronunciation: '/ˈæp.əl/', userId: 'test-user-123', language: 'en', createdAt: Date.now() },
        { id: '5', word: 'Computer', meaning: 'Máy tính', type: 'noun', example: 'I use a computer.', pronunciation: '/kəmˈpjuːtər/', userId: 'test-user-123', language: 'en', createdAt: Date.now() },
        { id: '6', word: 'Guten Tag', meaning: 'Chào ngày mới', type: 'noun', example: 'Guten Tag, mein Herr.', pronunciation: '/ˌɡuːtn̩ ˈtaːk/', userId: 'test-user-123', language: 'de', createdAt: Date.now() },
        { id: '7', word: 'Haus', meaning: 'Ngôi nhà', type: 'noun', example: 'Das Haus ist schön.', pronunciation: '/haʊs/', userId: 'test-user-123', language: 'de', createdAt: Date.now() },
        { id: '8', word: 'Auto', meaning: 'Ô tô', type: 'noun', example: 'Das Auto ist schnell.', pronunciation: '/ˈaʊto/', userId: 'test-user-123', language: 'de', createdAt: Date.now() },
        { id: '9', word: 'Schule', meaning: 'Trường học', type: 'noun', example: 'Ich gehe zur Schule.', pronunciation: '/ˈʃuːlə/', userId: 'test-user-123', language: 'de', createdAt: Date.now() },
        { id: '10', word: 'Brot', meaning: 'Bánh mì', type: 'noun', example: 'Ich esse Brot.', pronunciation: '/broːt/', userId: 'test-user-123', language: 'de', createdAt: Date.now() },
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
    audio.play().catch(() => {}); // Ignore errors if file doesn't exist
  };

  const deleteLesson = async (lessonId: string) => {
    try {
      await deleteDoc(doc(db, 'lessons', lessonId));
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Không thể xóa bài học.");
    }
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
          <p className="text-slate-500 mb-8">Nâng tầm vốn từ vựng Tiếng Anh & Đức với sức mạnh AI.</p>
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
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setActiveGame(null); }}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Languages className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">Vocab AIBTeM</span>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <NavButton active={view === 'input'} onClick={() => setView('input')} icon={<PlusCircle size={18} />} label="Nhập liệu" />
            <NavButton active={view === 'library'} onClick={() => setView('library')} icon={<FileText size={18} />} label="Thư viện" />
            <NavButton active={view === 'games'} onClick={() => setView('games')} icon={<Gamepad2 size={18} />} label="Trò chơi" />
            <NavButton active={view === 'report'} onClick={() => setView('report')} icon={<BarChart3 size={18} />} label="Báo cáo" />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => {
                  setLanguage('en');
                  setEditingLesson(null);
                }}
                className={cn("px-3 py-1 rounded-lg text-sm font-medium transition-all", language === 'en' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
              >
                EN
              </button>
              <button 
                onClick={() => {
                  setLanguage('de');
                  setEditingLesson(null);
                }}
                className={cn("px-3 py-1 rounded-lg text-sm font-medium transition-all", language === 'de' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
              >
                DE
              </button>
            </div>
            
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-2 p-1 pr-3 rounded-full hover:bg-slate-100 transition-all border border-slate-200"
              >
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-slate-200" alt="User" />
                <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isMenuOpen && "rotate-180")} />
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

      {/* Game Sub-header */}
      <AnimatePresence>
        {activeGame && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-indigo-600 text-white overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 flex-grow">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <HomeView setView={setView} language={language} user={user} />
            </motion.div>
          )}
          {view === 'input' && (
            <motion.div key={`input-${language}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
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
            <motion.div key="games" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GamesView 
                vocabList={vocabList} 
                language={language} 
                onComplete={(res) => setGameResults(prev => [...prev, { ...res, language }])} 
                playSound={playSound}
                activeGame={activeGame}
                setActiveGame={setActiveGame}
              />
            </motion.div>
          )}
          {view === 'library' && (
            <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LibraryView 
                lessons={lessons} 
                language={language}
                onEdit={(lesson) => {
                  setEditingLesson(lesson);
                  setView('input');
                }}
                onPlay={(lesson) => {
                  setVocabList(lesson.vocabularies);
                  setView('games');
                }}
                onDelete={deleteLesson}
              />
            </motion.div>
          )}
          {view === 'report' && (
            <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ReportView results={gameResults} language={language} vocabList={vocabList} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 z-50">
        <MobileNavButton active={view === 'input'} onClick={() => setView('input')} icon={<PlusCircle />} />
        <MobileNavButton active={view === 'library'} onClick={() => setView('library')} icon={<FileText />} />
        <MobileNavButton active={view === 'games'} onClick={() => setView('games')} icon={<Gamepad2 />} />
        <MobileNavButton active={view === 'home'} onClick={() => { setView('home'); setActiveGame(null); }} icon={<Home />} />
        <MobileNavButton active={view === 'report'} onClick={() => setView('report')} icon={<BarChart3 />} />
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
        "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all",
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

function HomeView({ setView, language, user }: { setView: (v: View) => void, language: Language, user: User }) {
  return (
    <div className="space-y-8">
      <div className="bg-indigo-600 rounded-[2.5rem] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">Chào mừng, {user.displayName?.split(' ')[0]}!</h2>
          <p className="text-indigo-100 text-lg mb-8 opacity-90">Bạn đã sẵn sàng chinh phục {language === 'en' ? 'Tiếng Anh' : 'Tiếng Đức'} hôm nay chưa?</p>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => setView('games')}
              className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-bold hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-lg"
            >
              Bắt đầu học ngay <ChevronRight size={20} />
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
        <StatCard title="Từ đã học" value="128" color="bg-blue-500" />
        <StatCard title="Chuỗi ngày" value="5" color="bg-orange-500" />
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
    <div className="space-y-8">
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
          filteredLessons.map((lesson) => (
            <motion.div 
              key={lesson.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group"
            >
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <FileText size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{lesson.title}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <Languages size={14} />
                      <span>{lesson.language.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Gamepad2 size={14} />
                      <span>{lesson.wordCount} thuật ngữ</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <UserIcon size={14} />
                      <span>{lesson.userName}</span>
                    </div>
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
                  className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <Play size={18} fill="currentColor" /> Chơi
                </button>
                <button 
                  onClick={() => handleDownloadLesson(lesson)}
                  className="flex-1 md:flex-none bg-indigo-50 text-indigo-600 px-6 py-3 rounded-xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                  title="Tải xuống bài học (.txt)"
                >
                  <Download size={18} /> Tải
                </button>
                <button 
                  onClick={() => onEdit(lesson)}
                  className="flex-1 md:flex-none bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <Edit2 size={18} /> Sửa
                </button>
                <button 
                  onClick={() => setDeletingId(lesson.id || null)}
                  className="flex-1 md:flex-none bg-red-50 text-red-600 px-6 py-3 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} /> Xóa
                </button>
              </div>
            </motion.div>
          ))
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

      {/* Delete Confirmation Modal */}
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
  
  // Translation Cache
  const translationCache = useRef<Record<string, any>>({});
  const abortControllers = useRef<Record<number, AbortController>>({});
  const lastTranslatedWords = useRef<Record<number, string>>({});

  const cleanInputData = (text: string, isForeignWord: boolean = false, isFinal: boolean = false) => {
    if (!text) return '';
    
    // Chỉ loại bỏ các ký tự đặc biệt dạng bullet ở đầu chuỗi (không xóa khoảng trắng khi đang gõ)
    let cleaned = text.replace(/^[\u2022\u2023\u25E6\u2043\u2219\u2000-\u206F\u2E00-\u2E7F\u25A0-\u25FF\uF000-\uF0FF\-\+\*•]+/g, '');
    
    // Chỉ trim() và chuẩn hóa khoảng trắng ở bước chốt (isFinal = true)
    if (isFinal) {
      cleaned = cleaned.replace(/\s+/g, ' ').trim();
    }
    
    // Đã gỡ bỏ .toLowerCase() để bảo toàn định dạng chữ Hoa/thường theo yêu cầu
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

      // Linked Deletion: Xóa từ Tiếng Anh thì xóa luôn Tiếng Việt và tắt loading
      if (field === 'word' && cleanedValue === '') {
        newRows[index].meaning = '';
        newRows[index].loading = false;
        newRows[index].suggestions = [];
        // Hủy bỏ các request cũ của dòng này
        if (abortControllers.current[index]) abortControllers.current[index].abort();
      }
      return newRows;
    });
  };

  // CẬP NHẬT LOGIC MỚI CHO VIỆC CHỌN NGHĨA
  const handleSelectSuggestion = (index: number, selectedText: string) => {
    setRows(prevRows => {
      const newRows = [...prevRows];
      if (newRows[index]) {
        const currentDef = newRows[index].meaning || '';
        // Nối nghĩa mới vào cách nhau bởi dấu phẩy
        if (currentDef === '' || currentDef.endsWith(', ')) {
            newRows[index].meaning = currentDef + selectedText;
        } else {
            newRows[index].meaning = currentDef + ', ' + selectedText;
        }
        // TUYỆT ĐỐI KHÔNG XÓA suggestions nữa để người dùng có thể chọn tiếp
      }
      return newRows;
    });
  };

  const handleAutoTranslate = async (index: number, currentLanguage: Language) => {
    // 0. Guard Clauses: Kiểm tra điều kiện trước khi gọi AI
    const currentRow = rows[index];
    if (!currentRow) return;

    const term = currentRow.word.trim();
    console.log("👉 GIAO DIỆN BẮT ĐẦU GỌI API | Từ khóa:", term, "| Ngôn ngữ:", currentLanguage);
    
    const definition = currentRow.meaning.trim();

    // Điều kiện 1: Ô Tiếng Anh phải có dữ liệu
    if (term === '') return;

    // Điều kiện 2: Ô Tiếng Việt phải ĐANG TRỐNG
    if (definition !== '') return;

    // Tối ưu onBlur: Chỉ gọi khi dữ liệu thực sự thay đổi so với lần dịch trước đó của dòng này
    if (lastTranslatedWords.current[index] === term) return;

    // Chốt dữ liệu: làm sạch triệt để trước khi gọi AI
    const word = cleanInputData(term, true, true);
    if (!word) return;

    // 1. Caching: Kiểm tra bộ nhớ tạm (0ms)
    if (translationCache.current[word]) {
      console.log("💾 Cache hit for:", word);
      const data = translationCache.current[word];
      lastTranslatedWords.current[index] = term; // Đánh dấu đã dịch thành công
      setRows(prevRows => {
        const updatedRows = [...prevRows];
        if (updatedRows[index]) {
          updatedRows[index] = {
            ...updatedRows[index],
            suggestions: data.translations
          };
        }
        return updatedRows;
      });
      return;
    }

    // 2. AbortController: Hủy request cũ của dòng này
    if (abortControllers.current[index]) {
      abortControllers.current[index].abort();
    }
    abortControllers.current[index] = new AbortController();

    // 3. Bật trạng thái Loading
    setRows(prevRows => {
      const updatedRows = [...prevRows];
      if (updatedRows[index]) {
        updatedRows[index] = { ...updatedRows[index], loading: true };
      }
      return updatedRows;
    });

    try {
      console.log("🌐 Calling translateWord for:", word);
      const data = await translateWord(word, currentLanguage, abortControllers.current[index].signal);
      console.log("✅ Translation result:", data);
      
      // 1. Bọc thép hàm xử lý chuỗi (Safe Splitting)
      // Chấp nhận cả trường hợp data là object (chuẩn hiện tại) hoặc string (phòng hờ)
      let meaningArray: string[] = [];
      if (data && Array.isArray(data.translations)) {
        meaningArray = data.translations;
      } else if (typeof data === 'string' && data.trim() !== '') {
        meaningArray = data.split(',').map(s => s.trim()).filter(s => s !== '');
      }
      console.log("📦 Mảng Gợi ý đã bóc tách:", meaningArray);

      translationCache.current[word] = data;
      lastTranslatedWords.current[index] = term; // Đánh dấu đã dịch thành công
      
      // 2. Tuân thủ tuyệt đối React Immutability
      setRows(prevRows => {
        const newRows = [...prevRows];
        if (newRows[index]) {
          // Tạo object mới hoàn toàn để ép React render lại
          newRows[index] = { 
            ...newRows[index], 
            suggestions: meaningArray,
            loading: false 
          };
        }
        return newRows;
      });
    } catch (error: any) {
      if (error.message === 'Aborted') return;
      
      // 3. Bắt lỗi ngầm (Catch block)
      console.error("❌ Lỗi ngầm UI:", error);
      
      setRows(prevRows => {
        const newRows = [...prevRows];
        if (newRows[index]) {
          newRows[index] = { 
            ...newRows[index], 
            loading: false, 
            suggestions: [] 
          };
        }
        return newRows;
      });
    }
  };

  const cancelInput = () => {
    console.log("Cancel button clicked");
    if (window.confirm('Bạn có chắc chắn muốn hủy bỏ toàn bộ dữ liệu đang nhập không?')) {
      setRows([{ word: '', meaning: '', loading: false, suggestions: [] }]);
      setLessonTitle('');
      if (initialLesson) {
        onSaved(); // Quay lại màn hình Thư viện nếu đang chỉnh sửa
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
      // Làm sạch triệt để toàn bộ dữ liệu trước khi lưu
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
        // Update existing
        await setDoc(doc(db, 'lessons', initialLesson.id), lessonData);
      } else {
        // Create new
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
    
    // Danh sách các dấu phân cách cột tiềm năng (ưu tiên Tab và Phẩy)
    const separatorRegex = /[\t,:\-–—=]/;
    
    // Kiểm tra xem có bất kỳ dòng nào chứa dấu phân cách không
    const hasAnySeparator = rawLines.some(line => separatorRegex.test(line));

    if (hasAnySeparator) {
      // Chiến lược 1: Phân tích từng dòng dựa trên dấu phân cách ưu tiên
      rawLines.forEach(line => {
        let parts: string[] = [];
        
        // Ưu tiên 1: Dấu Tab (thường xuất hiện khi copy từ Excel/Word Table)
        if (line.includes('\t')) {
          parts = line.split('\t');
        } 
        // Ưu tiên 2: Dấu phẩy (định dạng CSV)
        else if (line.includes(',')) {
          parts = line.split(',');
        }
        // Ưu tiên 3: Các dấu phân cách truyền thống
        else {
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
          // Nếu không tách được, coi cả dòng là từ vựng
          newRows.push({ word: cleanInputData(line, true, true), meaning: '', loading: false, suggestions: [] });
        }
      });
    } else {
      // Chiến lược 2: Thuật toán ghép đôi (Pairing Fallback) cho bảng bị làm phẳng
      // Dòng 1: EN, Dòng 2: VN, Dòng 3: EN, Dòng 4: VN...
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
        // Ghi đè hoàn toàn danh sách bằng dữ liệu từ file
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
    <div className="max-w-5xl mx-auto space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">{initialLesson ? "Sửa bài học" : "Tạo bài học mới"}</h2>
          <p className="text-slate-500">Nhập từ vựng và nghĩa để bắt đầu luyện tập.</p>
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
                    className="w-full bg-slate-50 border-2 border-