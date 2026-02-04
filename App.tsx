import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { INITIAL_USERS, SETTINGS, CAR_MODELS } from './constants';
import { User, ChargingSession } from './types';
import { 
  format, 
  endOfMonth, 
  eachDayOfInterval, 
  addMonths, 
  isToday 
} from 'date-fns';
import { sv } from 'date-fns/locale/sv';
import { 
  ChevronLeft, 
  ChevronRight, 
  Zap, 
  CheckCircle2, 
  Printer,
  Plus,
  ArrowLeft,
  Trash2,
  Settings as SettingsIcon,
  Edit2,
  X,
  Sparkles,
  Loader2,
  Info,
  Heart,
  Cloud,
  RefreshCw,
  Copy,
  Check,
  AlertCircle
} from 'lucide-react';

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const App: React.FC = () => {
  // State initialization
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('laddahar_users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [sessions, setSessions] = useState<ChargingSession[]>(() => {
    const saved = localStorage.getItem('laddahar_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  const [appSettings, setAppSettings] = useState(() => {
    const saved = localStorage.getItem('laddahar_settings');
    const defaults = { ...SETTINGS, cloudId: '' };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  // UI state
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [userModal, setUserModal] = useState<{show: boolean, mode: 'add' | 'edit', userId?: string}>({show: false, mode: 'add'});
  const [showSettings, setShowSettings] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
  const [copiedId, setCopiedId] = useState(false);
  
  const syncRef = useRef({ users, sessions, appSettings });
  useEffect(() => {
    syncRef.current = { users, sessions, appSettings };
  }, [users, sessions, appSettings]);

  const [formData, setFormData] = useState({ 
    name: '', carModel: CAR_MODELS[0].name, capacity: CAR_MODELS[0].capacity, avatarUrl: ''
  });
  const [tempKwhPrice, setTempKwhPrice] = useState(appSettings.kwhPrice.toString());
  const [tempCloudId, setTempCloudId] = useState(appSettings.cloudId || '');

  // Persistent local storage
  useEffect(() => {
    localStorage.setItem('laddahar_users', JSON.stringify(users));
    localStorage.setItem('laddahar_sessions', JSON.stringify(sessions));
    localStorage.setItem('laddahar_settings', JSON.stringify(appSettings));
  }, [users, sessions, appSettings]);

  // --- Cloud Sync Core ---
  const fetchFromCloud = useCallback(async () => {
    if (!appSettings.cloudId) return;
    setIsSyncing(true);
    setCloudStatus('syncing');
    try {
      const response = await fetch(`https://jsonblob.com/api/jsonBlob/${appSettings.cloudId}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.users) setUsers(data.users);
        if (data.sessions) setSessions(data.sessions);
        if (data.settings?.kwhPrice) setAppSettings(prev => ({ ...prev, kwhPrice: data.settings.kwhPrice }));
        setCloudStatus('success');
      } else {
        setCloudStatus('error');
      }
    } catch (e) {
      setCloudStatus('error');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setCloudStatus('idle'), 2000);
    }
  }, [appSettings.cloudId]);

  const pushToCloud = async (overrideSessions?: ChargingSession[], overrideUsers?: User[]) => {
    if (!appSettings.cloudId) return;
    setIsSyncing(true);
    setCloudStatus('syncing');
    try {
      await fetch(`https://jsonblob.com/api/jsonBlob/${appSettings.cloudId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          users: overrideUsers || syncRef.current.users, 
          sessions: overrideSessions || syncRef.current.sessions, 
          settings: { kwhPrice: appSettings.kwhPrice } 
        })
      });
      setCloudStatus('success');
    } catch (e) {
      setCloudStatus('error');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setCloudStatus('idle'), 2000);
    }
  };

  useEffect(() => {
    if (!appSettings.cloudId) return;
    fetchFromCloud();
    const timer = setInterval(fetchFromCloud, 30000);
    return () => clearInterval(timer);
  }, [appSettings.cloudId, fetchFromCloud]);

  const createCloudHub = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('https://jsonblob.com/api/jsonBlob', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ users, sessions, settings: appSettings })
      });
      
      // JSONBlob returnerar ID i "Location" headern. 
      // Vissa webbläsare döljer denna header pga säkerhet (CORS).
      // Vi försöker extrahera ID:t på två sätt.
      const locationHeader = response.headers.get('Location');
      let id = '';
      
      if (locationHeader) {
        id = locationHeader.split('/').pop() || '';
      } else {
        // Om headern saknas kan vi prova att titta på response.url om den ändrats
        const urlParts = response.url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart !== 'jsonBlob') id = lastPart;
      }
      
      if (id && id.length > 5) {
        setAppSettings(prev => ({ ...prev, cloudId: id }));
        setTempCloudId(id);
        alert(`Klart! Din gemensamma hub är skapad.\nID: ${id}\n\nDela detta ID med dina kollegor.`);
      } else {
        throw new Error("Kunde inte läsa ut ID från servern.");
      }
    } catch (e) {
      console.error(e);
      alert("Något gick fel vid skapandet. Detta kan bero på din webbläsares säkerhetsinställningar. Försök igen eller be en kollega prova!");
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Handlers ---
  const toggleSession = (date: Date) => {
    if (!activeUserId) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const newSessions = sessions.some(s => s.userId === activeUserId && s.date === dateStr)
      ? sessions.filter(s => !(s.userId === activeUserId && s.date === dateStr))
      : [...sessions, { userId: activeUserId, date: dateStr }];
    
    setSessions(newSessions);
    if (appSettings.cloudId) pushToCloud(newSessions);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let newUsers = [...users];
    if (userModal.mode === 'edit' && userModal.userId) {
      newUsers = users.map(u => u.id === userModal.userId ? { ...u, name: formData.name, car: { model: formData.carModel, batteryCapacity: formData.capacity }, avatarUrl: formData.avatarUrl } : u);
    } else {
      const newUser = { id: Date.now().toString(), name: formData.name, car: { model: formData.carModel, batteryCapacity: formData.capacity }, avatarUrl: formData.avatarUrl };
      newUsers.push(newUser);
      setActiveUserId(newUser.id);
    }
    setUsers(newUsers);
    setUserModal({ show: false, mode: 'add' });
    if (appSettings.cloudId) pushToCloud(sessions, newUsers);
  };

  const deleteUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Ta bort profil?')) {
      const newUsers = users.filter(u => u.id !== userId);
      const newSessions = sessions.filter(s => s.userId !== userId);
      setUsers(newUsers);
      setSessions(newSessions);
      if (activeUserId === userId) setActiveUserId(null);
      if (appSettings.cloudId) pushToCloud(newSessions, newUsers);
    }
  };

  const openUserModal = (mode: 'add' | 'edit', user?: User) => {
    if (mode === 'edit' && user) {
      setFormData({ name: user.name, carModel: user.car.model, capacity: user.car.batteryCapacity, avatarUrl: user.avatarUrl || '' });
      setUserModal({ show: true, mode: 'edit', userId: user.id });
    } else {
      setFormData({ name: '', carModel: CAR_MODELS[0].name, capacity: CAR_MODELS[0].capacity, avatarUrl: '' });
      setUserModal({ show: true, mode: 'add' });
    }
  };

  const generateAIAvatar = async () => {
    if (!formData.name) return;
    setIsGeneratingImage(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `A professional 3D animated portrait of ${formData.name}, friendly face, bright studio lighting, minimalist style, centered, high quality.`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      if (response.candidates?.[0]?.content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            setFormData(prev => ({ ...prev, avatarUrl: `data:image/png;base64,${part.inlineData?.data}` }));
            break;
          }
        }
      }
    } catch (e) { console.error(e); } finally { setIsGeneratingImage(false); }
  };

  const getAvatarUrl = (user: User | {name: string, avatarUrl?: string}) => {
    if (user.avatarUrl) return user.avatarUrl;
    // DiceBear v7 - Mycket stabilare för standard-avatarer
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9&radius=50`;
  };

  const activeUser = users.find(u => u.id === activeUserId);
  const monthStart = getStartOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentDate) });
  const userSessionsThisMonth = sessions.filter(s => s.userId === activeUserId && new Date(s.date) >= monthStart && new Date(s.date) <= endOfMonth(currentDate));
  const totalCost = (activeUser ? userSessionsThisMonth.length * activeUser.car.batteryCapacity : 0) * appSettings.kwhPrice;

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-emerald-100">
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-slate-100 overflow-hidden">
        {isSyncing && <div className="h-full bg-emerald-500 animate-[progress_2s_infinite] w-1/3"></div>}
      </div>

      {!activeUserId ? (
        <div className="min-h-screen p-6 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-6 right-6 flex items-center gap-3">
            {appSettings.cloudId && (
              <button 
                onClick={fetchFromCloud}
                disabled={isSyncing}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 shadow-sm
                  ${cloudStatus === 'error' ? 'bg-red-50 text-red-500 border-red-100' : 'bg-white text-emerald-600 border-slate-100 hover:border-emerald-200'}`}
              >
                {cloudStatus === 'syncing' ? <RefreshCw size={12} className="animate-spin" /> : (cloudStatus === 'error' ? <AlertCircle size={12} /> : <Cloud size={12} />)}
                {cloudStatus === 'error' ? 'Sync-fel' : (cloudStatus === 'syncing' ? 'Hämtar...' : 'Kopplad')}
              </button>
            )}
            <button onClick={() => setShowSettings(true)} className="p-4 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-emerald-500 shadow-sm transition-all hover:rotate-90"><SettingsIcon size={24} /></button>
          </div>

          <div className="max-w-5xl w-full text-center space-y-12 relative z-10">
            <div className="flex flex-col items-center">
              <div className="inline-flex p-7 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-[2.5rem] text-white shadow-2xl shadow-emerald-200 mb-8 transform hover:scale-110 hover:rotate-3 transition-all cursor-pointer">
                <Zap size={56} fill="currentColor" />
              </div>
              <h1 className="text-8xl font-black text-slate-900 tracking-tighter mb-2">LaddaHär</h1>
              <p className="text-slate-400 text-xl font-medium flex items-center gap-2">Företagets gemensamma laddningsgrid <Heart size={20} className="text-pink-400 fill-pink-400" /></p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 pt-8">
              {users.map(u => (
                <div key={u.id} className="group relative">
                  <button onClick={() => setActiveUserId(u.id)} className="w-full bg-white p-10 rounded-[4rem] border border-slate-100 hover:shadow-2xl hover:shadow-emerald-100 transition-all flex flex-col items-center gap-6 group shadow-sm hover:-translate-y-3 duration-300">
                    <div className="w-32 h-32 bg-slate-50 rounded-full overflow-hidden border-4 border-white shadow-lg relative z-10 transition-transform group-hover:scale-105 flex items-center justify-center">
                      <img 
                        src={getAvatarUrl(u)} 
                        className="w-full h-full object-cover" 
                        alt={u.name} 
                        onError={(e) => {
                          e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random&size=200&bold=true`;
                        }}
                      />
                    </div>
                    <div className="space-y-2 text-center">
                      <div className="font-black text-slate-800 text-2xl leading-tight">{u.name}</div>
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 bg-emerald-50 px-5 py-2 rounded-full">{u.car.model}</div>
                    </div>
                  </button>
                  <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-3 group-hover:translate-x-0">
                    <button onClick={() => openUserModal('edit', u)} className="p-3 bg-white/95 backdrop-blur rounded-2xl text-slate-400 hover:text-blue-500 shadow-xl border border-slate-100"><Edit2 size={18} /></button>
                    <button onClick={(e) => deleteUser(u.id, e)} className="p-3 bg-white/95 backdrop-blur rounded-2xl text-slate-400 hover:text-red-500 shadow-xl border border-slate-100"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => openUserModal('add')} className="bg-white/50 border-2 border-dashed border-slate-200 p-10 rounded-[4rem] flex flex-col items-center justify-center gap-5 text-slate-300 hover:border-emerald-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all group min-h-[300px]">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform"><Plus size={44} /></div>
                <span className="font-black text-xs uppercase tracking-[0.2em]">Lägg till Profil</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-screen p-4 md:p-10 animate-in fade-in duration-500">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between print:hidden">
              <button onClick={() => setActiveUserId(null)} className="flex items-center gap-3 px-10 py-5 bg-white border border-slate-100 rounded-3xl text-slate-600 hover:text-emerald-500 font-black text-xs uppercase tracking-[0.2em] shadow-sm hover:shadow-md transition-all active:scale-95"><ArrowLeft size={16} /> Tillbaka</button>
              <div className="flex items-center gap-5 bg-white px-8 py-4 rounded-[2rem] border border-slate-100 shadow-sm">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-100 shadow-inner flex items-center justify-center">
                  <img 
                    src={getAvatarUrl(activeUser!)} 
                    alt="user" 
                    className="w-full h-full object-cover" 
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activeUser?.name || 'User')}&background=random&size=200&bold=true`;
                    }}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-black text-slate-800">{activeUser?.name}</span>
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{activeUser?.car.model}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white rounded-[4.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                  <div className="p-14 border-b border-slate-50 flex items-center justify-between bg-slate-50/20">
                    <h2 className="text-6xl font-black text-slate-900 capitalize tracking-tighter">{format(currentDate, 'MMMM yyyy', { locale: sv })}</h2>
                    <div className="flex items-center gap-4 print:hidden">
                      <button onClick={() => setCurrentDate(addMonths(currentDate, -1))} className="p-6 bg-white border border-slate-100 rounded-3xl hover:text-emerald-500 transition-all shadow-sm active:scale-90"><ChevronLeft size={28} /></button>
                      <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-6 bg-white border border-slate-100 rounded-3xl hover:text-emerald-500 transition-all shadow-sm active:scale-90"><ChevronRight size={28} /></button>
                    </div>
                  </div>
                  <div className="p-14">
                    <div className="grid grid-cols-7 gap-6">
                      {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map(day => <div key={day} className="text-center text-[11px] font-black text-slate-300 uppercase tracking-[0.4em] pb-10">{day}</div>)}
                      {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => <div key={i} />)}
                      {daysInMonth.map(day => {
                        const isSelected = userSessionsThisMonth.some(s => s.date === format(day, 'yyyy-MM-dd'));
                        const today = isToday(day);
                        return (
                          <button key={day.toString()} onClick={() => toggleSession(day)} className={`aspect-square rounded-[2.5rem] flex flex-col items-center justify-center relative transition-all duration-300 group ${isSelected ? 'bg-gradient-to-br from-emerald-600 to-teal-400 text-white shadow-2xl shadow-emerald-200 scale-105 z-10' : 'bg-white border border-slate-100 hover:bg-emerald-50 text-slate-600 shadow-sm'}`}>
                            <span className="text-3xl font-black">{format(day, 'd')}</span>
                            {isSelected && <CheckCircle2 size={28} className="mt-2 animate-in zoom-in" />}
                            {today && !isSelected && <div className="absolute top-4 right-4 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-12">
                <div className="bg-slate-900 text-white p-14 rounded-[4.5rem] shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[520px]">
                  <div className="absolute -top-10 -right-10 opacity-5 pointer-events-none rotate-12"><Zap size={400} fill="white" /></div>
                  <div>
                    <h3 className="text-slate-500 text-[11px] font-black uppercase tracking-[0.4em] mb-8">Månadens Kostnad</h3>
                    <div className="flex items-baseline gap-4">
                      <span className="text-9xl font-black tabular-nums tracking-tighter">{totalCost.toFixed(2)}</span>
                      <span className="text-3xl font-bold text-emerald-400">SEK</span>
                    </div>
                  </div>
                  <div className="space-y-8 pt-14 border-t border-white/5">
                    <div className="flex justify-between items-center"><span className="text-slate-500 font-bold uppercase text-[11px] tracking-[0.3em]">Laddningar</span><span className="font-black text-5xl">{userSessionsThisMonth.length}</span></div>
                    <div className="flex justify-between items-center"><span className="text-slate-500 font-bold uppercase text-[11px] tracking-[0.3em]">Total kWh</span><span className="font-black text-5xl">{(activeUser ? userSessionsThisMonth.length * activeUser.car.batteryCapacity : 0).toFixed(0)}</span></div>
                  </div>
                  <button onClick={() => window.print()} className="w-full mt-12 py-7 bg-white text-slate-900 font-black rounded-[2rem] flex items-center justify-center gap-4 uppercase tracking-[0.2em] text-xs print:hidden active:scale-95 transition-all shadow-2xl hover:bg-slate-50"><Printer size={24} /> Skapa Rapport</button>
                </div>
                <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex gap-8 items-center group">
                  <div className="p-5 bg-emerald-50 rounded-[1.5rem] text-emerald-600 group-hover:bg-emerald-100 transition-colors"><Cloud size={32} /></div>
                  <div className="space-y-2">
                    <h4 className="font-black text-slate-800 text-xs uppercase tracking-widest">Live Synk</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">Allt sparas i företagets gemensamma hub. Dina ändringar syns direkt hos kollegorna.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-[4.5rem] p-14 max-w-xl w-full shadow-2xl relative my-8 animate-in slide-in-from-bottom duration-400">
            <button onClick={() => setShowSettings(false)} className="absolute top-12 right-12 text-slate-300 hover:text-slate-900 transition-colors"><X size={32} /></button>
            <div className="space-y-14">
              <section>
                <h2 className="text-4xl font-black mb-10 tracking-tighter flex items-center gap-5 text-emerald-600"><Zap size={40} /> Inställningar</h2>
                <div className="space-y-5">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-3">Aktuellt Elpris (SEK / kWh)</label>
                  <input type="number" step="0.01" value={tempKwhPrice} onChange={(e) => setTempKwhPrice(e.target.value)} className="w-full px-10 py-10 rounded-[3rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-black text-6xl text-emerald-600 bg-slate-50/50 transition-all shadow-inner" />
                </div>
              </section>

              <section className="pt-14 border-t border-slate-100">
                <h2 className="text-4xl font-black mb-10 tracking-tighter flex items-center gap-5 text-blue-500"><Cloud size={40} /> Molnsynk</h2>
                <p className="text-base text-slate-500 mb-10 leading-relaxed font-medium">Koppla ihop med kollegornas grid. Skapa en ny hub eller ange ID från en befintlig.</p>
                <div className="space-y-5">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-3">Delat Hub-ID</label>
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <input type="text" value={tempCloudId} onChange={(e) => setTempCloudId(e.target.value)} placeholder="Klistra in ID..." className="w-full px-10 py-6 rounded-[2rem] border-2 border-slate-50 focus:border-blue-400 outline-none font-bold bg-slate-50/50 text-base" />
                      {appSettings.cloudId && (
                        <button onClick={() => { navigator.clipboard.writeText(appSettings.cloudId || ''); setCopiedId(true); setTimeout(()=>setCopiedId(false),2000); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-blue-500 transition-colors">
                          {copiedId ? <Check size={24} className="text-emerald-500" /> : <Copy size={24} />}
                        </button>
                      )}
                    </div>
                    <button onClick={() => { setAppSettings(p => ({ ...p, cloudId: tempCloudId })); setShowSettings(false); }} className="px-10 bg-blue-500 text-white font-black rounded-[2rem] text-[11px] uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-blue-100">Koppla</button>
                  </div>
                  {!appSettings.cloudId && (
                    <button onClick={createCloudHub} className="w-full py-8 bg-slate-50 text-slate-500 font-black rounded-[2.5rem] border-2 border-dashed border-slate-200 hover:border-emerald-300 hover:text-emerald-500 transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-4">
                      {isSyncing ? <Loader2 className="animate-spin" size={24} /> : <Plus size={24} />} Skapa Ny Gemensam Hub
                    </button>
                  )}
                </div>
              </section>

              <button onClick={() => { setAppSettings(prev => ({ ...prev, kwhPrice: parseFloat(tempKwhPrice) })); setShowSettings(false); if(appSettings.cloudId) pushToCloud(); }} className="w-full py-8 bg-slate-900 text-white font-black rounded-[3rem] uppercase tracking-widest text-sm shadow-2xl active:scale-95 transition-all hover:bg-slate-800">Spara & Stäng</button>
            </div>
          </div>
        </div>
      )}

      {/* User Creation Modal */}
      {userModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[4.5rem] p-14 max-w-md w-full shadow-2xl relative animate-in zoom-in duration-300">
            <button onClick={() => setUserModal({show: false, mode: 'add'})} className="absolute top-12 right-12 text-slate-300 hover:text-slate-900 transition-colors"><X size={32} /></button>
            <h2 className="text-4xl font-black mb-12 text-slate-900 tracking-tighter text-center">{userModal.mode === 'add' ? 'Ny Profil' : 'Redigera'}</h2>
            <div className="flex flex-col items-center mb-12">
              <div className="relative group">
                <div className="w-44 h-44 bg-slate-50 rounded-full overflow-hidden border-4 border-slate-50 shadow-inner flex items-center justify-center relative">
                  {isGeneratingImage ? <Loader2 className="animate-spin text-emerald-500" size={64} /> : (
                    <img 
                      src={getAvatarUrl({name: formData.name || 'default', avatarUrl: formData.avatarUrl})} 
                      className="w-full h-full object-cover" 
                      alt="Preview" 
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || 'User')}&background=random&size=200&bold=true`;
                      }}
                    />
                  )}
                </div>
                <button type="button" onClick={generateAIAvatar} disabled={isGeneratingImage || !formData.name} className="absolute -bottom-2 -right-2 p-6 bg-gradient-to-tr from-emerald-600 to-teal-400 text-white rounded-[2rem] shadow-2xl hover:scale-110 active:scale-95 transition-all disabled:opacity-50"><Sparkles size={32} /></button>
              </div>
            </div>
            <form onSubmit={handleUserSubmit} className="space-y-6">
              <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-10 py-7 rounded-[2.5rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold bg-slate-50/50 text-xl transition-all shadow-inner" placeholder="Namn..." />
              <div className="grid grid-cols-2 gap-5">
                <select className="w-full px-8 py-7 rounded-[2.5rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold bg-slate-50/50 appearance-none text-sm" value={formData.carModel} onChange={(e) => {
                  const model = CAR_MODELS.find(m => m.name === e.target.value);
                  if (model) setFormData({...formData, carModel: model.name, capacity: model.capacity});
                }}>{CAR_MODELS.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}</select>
                <input type="number" value={formData.capacity} onChange={(e) => setFormData({...formData, capacity: parseFloat(e.target.value) || 0})} className="w-full px-8 py-7 rounded-[2.5rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold bg-slate-50/50" />
              </div>
              <button type="submit" className="w-full py-8 bg-slate-900 text-white font-black rounded-[2.5rem] uppercase tracking-widest text-sm mt-6 active:scale-95 transition-all shadow-xl hover:bg-slate-800">Spara Profil</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
