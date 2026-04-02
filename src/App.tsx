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
  Edit2
} from 'lucide-react';
import Lottie from 'lottie-react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  Timestamp,
  getDocs,
  writeBatch,
  doc
} from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { speak } from './services/tts';
import { generateDistractors, generateExampleSentence, analyzePerformance, translateWord } from './services/ai';
import { cn } from './lib/utils';

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
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

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

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
        { id: '4', word: 'Book', meaning: 'Quyển sách', type: 'noun', example: 'I read a book.', pronunciation: '/bʊk/', userId: 'test-user-123', language: 'en', createdAt: Date.now() },
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
                onClick={() => setLanguage('en')}
                className={cn("px-3 py-1 rounded-lg text-sm font-medium transition-all", language === 'en' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
              >
                EN
              </button>
              <button 
                onClick={() => setLanguage('de')}
                className={cn("px-3 py-1 rounded-lg text-sm font-medium transition-all", language === 'de' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500")}
              >
                DE
              </button>
            </div>
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-slate-200" alt="User" />
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
            <motion.div key="input" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
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
                onComplete={(res) => setGameResults(prev => [...prev, res])} 
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
                onEdit={(lesson) => {
                  setEditingLesson(lesson);
                  setView('input');
                }}
                onPlay={(lesson) => {
                  setVocabList(lesson.vocabularies);
                  setView('games');
                }}
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

function LibraryView({ lessons, onEdit, onPlay }: { lessons: Lesson[], onEdit: (l: Lesson) => void, onPlay: (l: Lesson) => void }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLessons = lessons.filter(l => 
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
                  onClick={() => onEdit(lesson)}
                  className="flex-1 md:flex-none bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <Edit2 size={18} /> Sửa
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
    </div>
  );
}

function InputView({ language, user, onSaved, initialLesson }: { language: Language, user: User, onSaved: () => void, initialLesson?: Lesson }) {
  const [rows, setRows] = useState<{ word: string, meaning: string, loading: boolean, suggestions?: string[] }[]>(
    initialLesson ? initialLesson.vocabularies.map(v => ({ ...v, loading: false })) : 
    Array(5).fill(null).map(() => ({ word: '', meaning: '', loading: false }))
  );
  const [lessonTitle, setLessonTitle] = useState(initialLesson?.title || '');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const addRow = () => {
    setRows([...rows, { word: '', meaning: '', loading: false }]);
  };

  const addRowAtIndex = (index: number) => {
    const newRows = [...rows];
    newRows.splice(index + 1, 0, { word: '', meaning: '', loading: false });
    setRows(newRows);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 5 && !initialLesson) {
      const newRows = [...rows];
      newRows[index] = { word: '', meaning: '', loading: false };
      setRows(newRows);
      return;
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: 'word' | 'meaning', value: string) => {
    const newRows = [...rows];
    (newRows[index] as any)[field] = value;
    setRows(newRows);
  };

  const handleAutoTranslate = async (index: number) => {
    const word = rows[index].word;
    if (!word) return;

    const newRows = [...rows];
    newRows[index].loading = true;
    setRows(newRows);

    try {
      const data = await translateWord(word, language);
      const updatedRows = [...rows];
      updatedRows[index].loading = false;
      if (data.translations && data.translations.length > 0) {
        updatedRows[index].suggestions = data.translations;
        if (!updatedRows[index].meaning) {
          updatedRows[index].meaning = data.translations[0];
        }
      }
      setRows(updatedRows);
    } catch (e) {
      console.error(e);
      const updatedRows = [...rows];
      updatedRows[index].loading = false;
      setRows(updatedRows);
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
      const lessonData: Omit<Lesson, 'id'> = {
        title: lessonTitle.trim(),
        wordCount: validRows.length,
        userId: user.uid,
        userName: user.displayName || 'Người dùng',
        language,
        createdAt: Date.now(),
        vocabularies: validRows.map(r => ({
          word: r.word.trim(),
          meaning: r.meaning.trim(),
          language,
          userId: user.uid,
          createdAt: Date.now()
        }))
      };

      await addDoc(collection(db, 'lessons'), lessonData);
      
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
    const lines = text.split('\n');
    const newRows: { word: string, meaning: string, loading: boolean }[] = [];
    lines.forEach(line => {
      // Try comma, dash, or colon as separators
      const separators = [',', '-', ':'];
      let parts: string[] = [];
      for (const sep of separators) {
        if (line.includes(sep)) {
          parts = line.split(sep);
          break;
        }
      }
      
      if (parts.length >= 2) {
        newRows.push({ word: parts[0].trim(), meaning: parts[1].trim(), loading: false });
      }
    });
    return newRows;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      let text = '';
      if (file.name.endsWith('.txt')) {
        text = await file.text();
      } else if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          fullText += strings.join(' ') + '\n';
        }
        text = fullText;
      }

      const parsedRows = parseText(text);
      if (parsedRows.length > 0) {
        setRows(prev => {
          const filteredPrev = prev.filter(r => r.word || r.meaning);
          return [...filteredPrev, ...parsedRows];
        });
      } else {
        alert("Không tìm thấy từ vựng trong file. Vui lòng kiểm tra định dạng (Từ, Nghĩa).");
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi khi đọc file.");
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const totalValidWords = rows.filter(r => r.word.trim() && r.meaning.trim()).length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Tạo bài học mới</h2>
          <p className="text-slate-500">Nhập từ vựng và nghĩa để bắt đầu luyện tập.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className={cn(
            "flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm",
            uploading && "opacity-50 cursor-not-allowed"
          )}>
            {uploading ? <Loader2 className="animate-spin text-indigo-600 w-5 h-5" /> : <Upload className="text-indigo-600 w-5 h-5" />}
            <span className="text-sm font-bold text-slate-700">Tải file (.txt, .docx, .pdf)</span>
            <input type="file" accept=".txt,.pdf,.docx" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="group relative">
            <div className="grid grid-cols-1 md:grid-cols-[40px,1fr,1fr,40px] gap-4 items-start p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="hidden md:flex items-center justify-center h-12 font-bold text-slate-300 text-xl">
                {index + 1}
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Thuật ngữ ({language.toUpperCase()})</label>
                <input 
                  type="text" 
                  value={row.word}
                  onChange={(e) => updateRow(index, 'word', e.target.value)}
                  onBlur={() => handleAutoTranslate(index)}
                  className="w-full bg-slate-50 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all text-lg font-medium"
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
                    className="w-full bg-slate-50 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all text-lg font-medium"
                    placeholder="Nhập nghĩa..."
                  />
                  {row.loading && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="animate-spin text-indigo-500 w-5 h-5" />
                    </div>
                  )}
                </div>
                
                {row.suggestions && row.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {row.suggestions.map((s, i) => (
                      <button 
                        key={i}
                        onClick={() => updateRow(index, 'meaning', s)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-lg border transition-all",
                          row.meaning === s ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-400"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex md:flex-col items-center justify-center gap-2 h-full">
                <button 
                  onClick={() => removeRow(index)}
                  className="p-2 text-slate-300 hover:text-red-500 transition-colors"
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
                className="bg-white border border-slate-200 text-indigo-600 p-1.5 rounded-full shadow-lg hover:scale-110 transition-all"
                title="Thêm hàng ở đây"
              >
                <PlusCircle size={20} />
              </button>
            </div>
          </div>
        ))}

        <button 
          onClick={addRow}
          className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-bold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
        >
          <PlusCircle size={24} /> Thêm hàng mới
        </button>
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
        <div className="bg-white/80 backdrop-blur-xl border border-white/20 p-4 rounded-[2.5rem] shadow-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 ml-2">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold",
              totalValidWords >= 5 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
            )}>
              {totalValidWords}
            </div>
            <span className="text-sm font-bold text-slate-600">từ đã nhập</span>
          </div>
          <button 
            onClick={() => setShowSaveModal(true)}
            disabled={totalValidWords < 5}
            className={cn(
              "px-8 py-3 rounded-2xl font-bold transition-all shadow-lg flex items-center gap-2",
              totalValidWords >= 5 ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            Lưu bài học <ChevronRight size={20} />
          </button>
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
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
              <h3 className="text-2xl font-bold mb-2">Lưu bài học vào thư viện</h3>
              <p className="text-slate-500 mb-6">Đặt tên cho bài học của bạn để dễ dàng tìm kiếm sau này.</p>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Tên bài học</label>
                  <input 
                    type="text" 
                    autoFocus
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    placeholder="Ví dụ: Từ vựng Unit 1, Business English..."
                    className="w-full bg-slate-50 border-slate-200 rounded-2xl px-5 py-4 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all text-lg font-medium"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowSaveModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={saveLesson}
                    disabled={loading || !lessonTitle.trim()}
                    className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : "Xác nhận lưu"}
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

function GamesView({ vocabList, language, onComplete, playSound, activeGame, setActiveGame }: { vocabList: Vocabulary[], language: Language, onComplete: (res: GameResult) => void, playSound: (t: 'correct' | 'wrong') => void, activeGame: GameType | null, setActiveGame: (g: GameType | null) => void }) {
  // Filter vocabList by language just in case
  const filteredVocab = vocabList.filter(v => v.language === language);

  if (filteredVocab.length < 5) {
    return (
      <div className="text-center py-20 bg-white rounded-[3rem] shadow-xl border border-slate-100">
        <RobotAnimation type="sad" />
        <h3 className="text-2xl font-bold mt-6">Bạn cần ít nhất 5 từ để bắt đầu!</h3>
        <p className="text-slate-500 mt-2">Hãy thêm thêm từ vựng để mở khóa các trò chơi nhé.</p>
        <p className="text-indigo-600 font-bold mt-4">Hiện có: {filteredVocab.length} từ</p>
      </div>
    );
  }

  if (activeGame) {
    return (
      <GameContainer 
        type={activeGame} 
        vocabList={filteredVocab} 
        language={language} 
        onBack={() => setActiveGame(null)} 
        onFinish={(score) => {
          onComplete({ gameType: activeGame, score, total: 5, timestamp: Date.now() });
          setActiveGame(null);
        }}
        playSound={playSound}
      />
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      <GameCard 
        title="Flashcards" 
        desc="Thẻ lật 3 mặt giúp ghi nhớ sâu." 
        icon={<BrainCircuit />} 
        colorClass="bg-blue-500"
        onClick={() => setActiveGame('flashcards')} 
      />
      <GameCard 
        title="Trắc nghiệm" 
        desc="AI tạo từ nhiễu thông minh." 
        icon={<CheckCircle2 />} 
        colorClass="bg-indigo-500"
        onClick={() => setActiveGame('quiz')} 
      />
      <GameCard 
        title="Nối từ" 
        desc="Thử thách phản xạ nhanh." 
        icon={<RefreshCw />} 
        colorClass="bg-orange-500"
        onClick={() => setActiveGame('matching')} 
      />
      <GameCard 
        title="Luyện viết" 
        desc="Nghe và viết lại chính xác." 
        icon={<Volume2 />} 
        colorClass="bg-emerald-500"
        onClick={() => setActiveGame('writing')} 
      />
      <GameCard 
        title="Điền từ" 
        desc="Sử dụng từ trong ngữ cảnh AI." 
        icon={<ChevronRight />} 
        colorClass="bg-pink-500"
        onClick={() => setActiveGame('fill')} 
      />
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
      
      {/* Decorative background element */}
      <div className={cn("absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-5 group-hover:scale-150 transition-transform", colorClass)}></div>
    </motion.button>
  );
}

// --- GAME LOGIC ---

function GameContainer({ type, vocabList, language, onBack, onFinish, playSound }: { type: GameType, vocabList: Vocabulary[], language: Language, onBack: () => void, onFinish: (score: number) => void, playSound: (t: 'correct' | 'wrong') => void }) {
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [gameVocabs] = useState(() => [...vocabList].sort(() => 0.5 - Math.random()).slice(0, 5));
  
  const currentVocab = gameVocabs[step];

  const next = (correct: boolean) => {
    if (correct) {
      setScore(s => s + 1);
      playSound('correct');
    } else {
      playSound('wrong');
    }
    
    if (step < 4) {
      setStep(s => s + 1);
    } else {
      onFinish(correct ? score + 1 : score);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold">
          <ChevronLeft size={20} /> Quay lại
        </button>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className={cn("w-12 h-2 rounded-full transition-all", i <= step ? "bg-indigo-600" : "bg-slate-200")} />
          ))}
        </div>
        <div className="font-bold text-indigo-600">Điểm: {score}</div>
      </div>

      <AnimatePresence mode="wait">
        {type === 'flashcards' && (
          <motion.div key={step} initial={{ opacity: 0, rotateY: 90 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: -90 }}>
            <FlashcardGame vocab={currentVocab} onNext={() => next(true)} language={language} />
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

function FlashcardGame({ vocab, onNext, language }: { vocab: Vocabulary, onNext: () => void, language: Language }) {
  const [side, setSide] = useState(0); // 0: Word, 1: Meaning, 2: Example

  return (
    <div className="space-y-8">
      <div 
        onClick={() => setSide((side + 1) % 3)}
        className="aspect-[4/3] bg-white rounded-[3rem] shadow-2xl flex flex-col items-center justify-center p-12 text-center cursor-pointer relative overflow-hidden group"
      >
        <div className="absolute top-6 right-6">
          <button onClick={(e) => { e.stopPropagation(); speak(vocab.word, language); }} className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all">
            <Volume2 size={24} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {side === 0 && (
            <motion.div key="0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-sm">Từ vựng</span>
              <h3 className="text-5xl font-black text-indigo-600">{vocab.word}</h3>
            </motion.div>
          )}
          {side === 1 && (
            <motion.div key="1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-sm">Nghĩa Tiếng Việt</span>
              <h3 className="text-5xl font-black text-emerald-600">{vocab.meaning}</h3>
            </motion.div>
          )}
          {side === 2 && (
            <motion.div key="2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 max-w-md">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-sm">Ví dụ</span>
              <p className="text-2xl font-medium text-slate-700 italic">"{vocab.example || 'Đang tải ví dụ...'}"</p>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="absolute bottom-8 text-slate-300 font-bold text-xs uppercase tracking-widest">Nhấn để lật mặt</div>
      </div>

      <button onClick={onNext} className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-bold text-xl shadow-xl hover:bg-indigo-700 transition-all">
        Tiếp theo
      </button>
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
        <button onClick={() => speak(vocab.word, language)} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
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
    speak(vocab.word, language);
  }, [vocab]);

  const check = () => {
    setSubmitted(true);
    setTimeout(() => onNext(input.toLowerCase().trim() === vocab.word.toLowerCase().trim()), 1500);
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-12 rounded-[3rem] shadow-xl text-center">
        <button onClick={() => speak(vocab.word, language)} className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 hover:scale-110 transition-transform">
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

function ReportView({ results, language, vocabList }: { results: GameResult[], language: Language, vocabList: Vocabulary[] }) {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (results.length === 0) return;
    const runAnalysis = async () => {
      setLoading(true);
      const feedback = await analyzePerformance(results, language);
      setAnalysis(feedback);
      setLoading(false);
    };
    runAnalysis();
  }, [results]);

  const chartData = results.map((r, i) => ({
    name: `Game ${i + 1}`,
    score: r.score,
    total: r.total
  }));

  const totalScore = results.reduce((acc, r) => acc + r.score, 0);
  const totalPossible = results.reduce((acc, r) => acc + r.total, 0);
  const accuracy = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

  return (
    <div className="space-y-8 pb-20">
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
          <BrainCircuit className="text-indigo-600" /> AI Nhận xét & Khuyên dùng
        </h3>
        {loading ? (
          <div className="flex flex-col items-center py-8">
            <RefreshCw className="animate-spin text-indigo-600 mb-4" size={32} />
            <p className="text-slate-500 font-medium italic">Gemini đang phân tích kết quả của bạn...</p>
          </div>
        ) : (
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{analysis || "Bắt đầu chơi để nhận nhận xét từ AI!"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-4 mt-auto border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-400 text-xs md:text-sm">
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
