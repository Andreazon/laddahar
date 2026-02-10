import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { INITIAL_USERS, SETTINGS, CAR_MODELS } from './constants';
import { User, ChargingSession, AppSettings } from './types';
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
  Heart,
  Cloud,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  UploadCloud,
  Info,
  ShieldCheck,
  Link as LinkIcon
} from 'lucide-react';

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

interface ExtendedSettings extends AppSettings {
  lastSyncTs?: number;
  lastSyncStatus?: string;
}

const App: React.FC = () => {
  // --- States ---
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('laddahar_users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [sessions, setSessions] = useState<ChargingSession[]>(() => {
    const saved = localStorage.getItem('laddahar_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  const [appSettings, setAppSettings] = useState<ExtendedSettings>(() => {
    const saved = localStorage.getItem('laddahar_settings');
    const defaults = { ...SETTINGS, cloudId: '', lastSyncTs: 0, lastSyncStatus: 'Ingen Hub ansluten' };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [userModal, setUserModal] = useState<{show: boolean, mode: 'add' | 'edit', userId?: string}>({show: false, mode: 'add'});
  const [showSettings, setShowSettings] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
  const [copiedId, setCopiedId] = useState(false);
  
  const syncLockRef = useRef(false);

  // Lokal backup
  useEffect(() => {
    localStorage.setItem('laddahar_users', JSON.stringify(users));
    localStorage.setItem('laddahar_sessions', JSON.stringify(sessions));
    localStorage.setItem('laddahar_settings', JSON.stringify(appSettings));
  }, [users, sessions, appSettings]);

  // --- Temp States för Settings ---
  const [tempKwhPrice, setTempKwhPrice] = useState(appSettings.kwhPrice.toString());
  const [tempCloudId, setTempCloudId] = useState(appSettings.cloudId || '');

  useEffect(() => {
    if (showSettings) {
      setTempKwhPrice(appSettings.kwhPrice.toString());
      setTempCloudId(appSettings.cloudId || '');
    }
  }, [showSettings, appSettings.cloudId, appSettings.kwhPrice]);

  // --- Moln-logik (npoint.io) ---
  const getCloudUrl = (id: string) => `https://api.npoint.io/${id}`;

  const pushToCloud = async (u: User[], s: ChargingSession[], st: ExtendedSettings, manualId?: string): Promise<{success: boolean, error?: string}> => {
    const id = (manualId || st.cloudId)?.trim();
    if (!id) return { success: false, error: "ID saknas" };

    setIsSyncing(true);
    setCloudStatus('syncing');
    syncLockRef.current = true;
    
    try {
      const ts = Date.now();
      const payload = { users: u, sessions: s, settings: { kwhPrice: st.kwhPrice }, ts: ts };

      const response = await fetch(getCloudUrl(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setCloudStatus('success');
        setAppSettings(prev => ({ 
          ...prev, 
          lastSyncTs: ts, 
          lastSyncStatus: `✓ Uppdaterad ${new Date().toLocaleTimeString()}` 
        }));
        return { success: true };
      } else {
        throw new Error(`Kunde inte spara (${response.status})`);
      }
    } catch (e: any) {
      setCloudStatus('error');
      setAppSettings(prev => ({ ...prev, lastSyncStatus: `✕ Fel: ${e.message}` }));
      return { success: false, error: e.message };
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setCloudStatus('idle');
        syncLockRef.current = false;
      }, 3000);
    }
  };

  // --- Moln-logik (npoint.io) ---

const createNewHub = async () => {
  if (!window.confirm("Skapa en ny Hub? Din nuvarande data laddas upp.")) return;
  
  setIsSyncing(true);
  setCloudStatus('syncing');
  try {
    const ts = Date.now();
    const payload = { users, sessions, settings: { kwhPrice: appSettings.kwhPrice }, ts };
    const response = await fetch('https://api.npoint.io/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      // npoint returnerar hela objektet med ett id-fält
      const newId = result.id || window.location.href.split('/').pop();
      if (newId) {
        const newSettings = { ...appSettings, cloudId: newId, lastSyncTs: ts, lastSyncStatus: '✓ Hub skapad!' };
        setAppSettings(newSettings);
        setTempCloudId(newId);
        alert(`Hub skapad! ID: ${newId}\n\nDela detta med kollegor.`);
      }
    } else {
      const errText = await response.text();
      throw new Error(errText || `Fel ${response.status}`);
    }
  } catch (e: any) {
    alert("Kunde inte skapa Hub: " + e.message);
  } finally {
    setIsSyncing(false);
    setCloudStatus('idle');
  }
};
  const fetchFromCloud = useCallback(async (manualId?: string) => {
    const id = (manualId || appSettings.cloudId)?.trim();
    if (!id) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch(getCloudUrl(id), { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const incomingTs = data.ts || 0;
        
        if (manualId || incomingTs > (appSettings.lastSyncTs || 0)) {
          if (Array.isArray(data.users)) setUsers(data.users);
          if (Array.isArray(data.sessions)) setSessions(data.sessions);
          if (data.settings) {
            setAppSettings(prev => ({ 
              ...prev, 
              kwhPrice: data.settings.kwhPrice || prev.kwhPrice,
              cloudId: id,
              lastSyncTs: incomingTs,
              lastSyncStatus: `✓ Synkad ${new Date().toLocaleTimeString()}`
            }));
          }
          if (manualId) alert("Ansluten! Data har hämtats.");
        }
      } else {
        if (manualId) alert("Kunde inte hitta Hubben. Kontrollera ID:t.");
      }
    } catch (e: any) {
      if (manualId) alert("Anslutningsfel: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  }, [appSettings.cloudId, appSettings.lastSyncTs]);

  useEffect(() => {
    if (!appSettings.cloudId) return;
    const interval = setInterval(() => fetchFromCloud(), 30000);
    return () => clearInterval(interval);
  }, [appSettings.cloudId, fetchFromCloud]);

  // --- Handlers ---
  const handleSaveSettings = async () => {
    const newPrice = parseFloat(tempKwhPrice) || appSettings.kwhPrice;
    const newSettings = { ...appSettings, kwhPrice: newPrice };
    setAppSettings(newSettings);
    if (appSettings.cloudId) pushToCloud(users, sessions, newSettings);
    setShowSettings(false);
  };

  const toggleSession = (date: Date) => {
    if (!activeUserId) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const newSessions = sessions.some(s => s.userId === activeUserId && s.date === dateStr)
      ? sessions.filter(s => !(s.userId === activeUserId && s.date === dateStr))
      : [...sessions, { userId: activeUserId, date: dateStr }];
    
    setSessions(newSessions);
    if (appSettings.cloudId) pushToCloud(users, newSessions, appSettings);
  };

  const [localFormData, setLocalFormData] = useState({ name: '', carModel: CAR_MODELS[0].name, capacity: CAR_MODELS[0].capacity, avatarUrl: '' });

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let newUsers = [...users];
    if (userModal.mode === 'edit' && userModal.userId) {
      newUsers = users.map(u => u.id === userModal.userId ? { ...u, name: localFormData.name, car: { model: localFormData.carModel, batteryCapacity: localFormData.capacity }, avatarUrl: localFormData.avatarUrl } : u);
    } else {
      const newUser = { id: Date.now().toString(), name: localFormData.name, car: { model: localFormData.carModel, batteryCapacity: localFormData.capacity }, avatarUrl: localFormData.avatarUrl };
      newUsers.push(newUser);
      setActiveUserId(newUser.id);
    }
    setUsers(newUsers);
    setUserModal({ show: false, mode: 'add' });
    if (appSettings.cloudId) pushToCloud(newUsers, sessions, appSettings);
  };

  const deleteUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Ta bort profil?')) {
      const newUsers = users.filter(u => u.id !== userId);
      const newSessions = sessions.filter(s => s.userId !== userId);
      setUsers(newUsers);
      setSessions(newSessions);
      if (activeUserId === userId) setActiveUserId(null);
      if (appSettings.cloudId) pushToCloud(newUsers, newSessions, appSettings);
    }
  };

  const getAvatarUrl = (user: {name: string, avatarUrl?: string}) => {
    if (user.avatarUrl) return user.avatarUrl;
    return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=b6e3f4,c0aede,d1d4f9&radius=50`;
  };

  const activeUser = users.find(u => u.id === activeUserId);
  const monthStart = getStartOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentDate) });
  const userSessionsThisMonth = sessions.filter(s => s.userId === activeUserId && new Date(s.date) >= monthStart && new Date(s.date) <= endOfMonth(currentDate));
  const totalCost = (activeUser ? userSessionsThisMonth.length * activeUser.car.batteryCapacity : 0) * appSettings.kwhPrice;

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-emerald-100">
      <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-slate-100 overflow-hidden">
        {isSyncing && <div className="h-full bg-emerald-500 animate-[progress_2s_infinite] w-1/3"></div>}
      </div>

      {!activeUserId ? (
        <div className="min-h-screen p-6 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-6 right-6 flex items-center gap-3">
            {appSettings.cloudId && (
              <button 
                onClick={() => fetchFromCloud()}
                disabled={isSyncing}
                className={`flex items-center gap-2 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 shadow-sm bg-white text-emerald-600 border-slate-100 hover:border-emerald-200`}
              >
                {isSyncing ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {isSyncing ? 'Synkar...' : 'Ansluten'}
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
                      <img src={getAvatarUrl(u)} className="w-full h-full object-cover" alt={u.name} />
                    </div>
                    <div className="space-y-2 text-center">
                      <div className="font-black text-slate-800 text-2xl leading-tight">{u.name}</div>
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 bg-emerald-50 px-5 py-2 rounded-full">{u.car.model}</div>
                    </div>
                  </button>
                  <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-3 group-hover:translate-x-0">
                    <button onClick={() => { setLocalFormData({ name: u.name, carModel: u.car.model, capacity: u.car.batteryCapacity, avatarUrl: u.avatarUrl || '' }); setUserModal({ show: true, mode: 'edit', userId: u.id }); }} className="p-3 bg-white/95 backdrop-blur rounded-2xl text-slate-400 hover:text-blue-500 shadow-xl border border-slate-100"><Edit2 size={18} /></button>
                    <button onClick={(e) => deleteUser(u.id, e)} className="p-3 bg-white/95 backdrop-blur rounded-2xl text-slate-400 hover:text-red-500 shadow-xl border border-slate-100"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => { setLocalFormData({ name: '', carModel: CAR_MODELS[0].name, capacity: CAR_MODELS[0].capacity, avatarUrl: '' }); setUserModal({ show: true, mode: 'add' }); }} className="bg-white/50 border-2 border-dashed border-slate-200 p-10 rounded-[4rem] flex flex-col items-center justify-center gap-5 text-slate-300 hover:border-emerald-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all group min-h-[300px]">
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
                  <img src={getAvatarUrl(activeUser!)} alt="user" className="w-full h-full object-cover" />
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
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-[4.5rem] p-14 max-w-xl w-full shadow-2xl relative my-8 animate-in slide-in-from-bottom duration-400">
            <button onClick={() => setShowSettings(false)} className="absolute top-12 right-12 text-slate-300 hover:text-slate-900 transition-colors"><X size={32} /></button>
            <div className="space-y-12">
              <section>
                <h2 className="text-4xl font-black mb-8 tracking-tighter flex items-center gap-5 text-emerald-600"><Zap size={40} /> Inställningar</h2>
                <div className="space-y-5">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-3">Aktuellt Elpris (SEK / kWh)</label>
                  <input type="number" step="0.01" value={tempKwhPrice} onChange={(e) => setTempKwhPrice(e.target.value)} className="w-full px-10 py-10 rounded-[3rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-black text-6xl text-emerald-600 bg-slate-50/50 transition-all shadow-inner" />
                </div>
              </section>

              <section className="pt-10 border-t border-slate-100">
                <h2 className="text-4xl font-black mb-8 tracking-tighter flex items-center gap-5 text-blue-500"><Cloud size={40} /> Molnsynk</h2>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-3">Hub-ID (Numeriskt ID från kollega)</label>
                    <div className="flex gap-4">
                      <div className="relative flex-1">
                        <input type="text" value={tempCloudId} onChange={(e) => setTempCloudId(e.target.value)} placeholder="Klistra in ID..." className="w-full px-8 py-6 rounded-[2rem] border-2 border-slate-50 focus:border-blue-400 outline-none font-bold bg-slate-50/50 text-base" />
                        {appSettings.cloudId && (
                          <button onClick={() => { navigator.clipboard.writeText(appSettings.cloudId || ''); setCopiedId(true); setTimeout(()=>setCopiedId(false),2000); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 text-slate-400 hover:text-blue-500 transition-colors">
                            {copiedId ? <Check size={24} className="text-emerald-500" /> : <Copy size={24} />}
                          </button>
                        )}
                      </div>
                      <button onClick={() => fetchFromCloud(tempCloudId)} disabled={!tempCloudId || isSyncing} className="px-10 bg-blue-500 text-white font-black rounded-[2rem] text-[11px] uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-blue-100 flex items-center gap-2">
                        {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <LinkIcon size={16} />} 
                        Anslut
                      </button>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button onClick={createNewHub} disabled={isSyncing} className="w-full py-7 bg-emerald-50 text-emerald-600 font-black rounded-[2.5rem] border-2 border-dashed border-emerald-100 hover:border-emerald-300 hover:bg-emerald-100 transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-3">
                      <UploadCloud size={18} /> Skapa ny Hub i molnet
                    </button>
                  </div>

                  <div className="mt-6 p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-start gap-4">
                    <Info size={20} className="text-blue-500 shrink-0 mt-1" />
                    <div className="space-y-1 overflow-hidden">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Synk-logg</div>
                      <div className="text-xs font-bold text-slate-600 break-all">{appSettings.lastSyncStatus}</div>
                    </div>
                  </div>
                </div>
              </section>

              <button onClick={handleSaveSettings} className="w-full py-8 bg-slate-900 text-white font-black rounded-[3rem] uppercase tracking-widest text-sm shadow-2xl active:scale-95 transition-all hover:bg-slate-800">Spara & Stäng</button>
            </div>
          </div>
        </div>
      )}

      {userModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[4.5rem] p-14 max-w-md w-full shadow-2xl relative animate-in zoom-in duration-300">
            <button onClick={() => setUserModal({show: false, mode: 'add'})} className="absolute top-12 right-12 text-slate-300 hover:text-slate-900 transition-colors"><X size={32} /></button>
            <h2 className="text-4xl font-black mb-12 text-slate-900 tracking-tighter text-center">{userModal.mode === 'add' ? 'Ny Profil' : 'Redigera'}</h2>
            <div className="flex flex-col items-center mb-12">
              <div className="relative group">
                <div className="w-44 h-44 bg-slate-50 rounded-full overflow-hidden border-4 border-slate-50 shadow-inner flex items-center justify-center relative">
                  {isGeneratingImage ? <Loader2 className="animate-spin text-emerald-500" size={64} /> : (
                    <img src={getAvatarUrl({name: localFormData.name || 'default', avatarUrl: localFormData.avatarUrl})} className="w-full h-full object-cover" alt="Preview" />
                  )}
                </div>
                <button 
                  type="button" 
                  onClick={async () => {
                    if (!localFormData.name) return;
                    setIsGeneratingImage(true);
                    try {
                      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                      const response = await ai.models.generateContent({ 
                        model: 'gemini-2.5-flash-image', 
                        contents: { 
                          parts: [{ text: `3D character portrait of ${localFormData.name}, friendly face, bright studio lighting, minimalist style.` }] 
                        }, 
                        config: { 
                          imageConfig: { aspectRatio: "1:1" } 
                        } 
                      });
                      const imagePart = response.candidates?.[0]?.content.parts.find(p => p.inlineData);
                      if (imagePart?.inlineData) {
                        setLocalFormData(prev => ({ 
                          ...prev, 
                          avatarUrl: `data:image/png;base64,${imagePart.inlineData?.data}` 
                        }));
                      }
                    } catch (e) {
                      console.error("Failed to generate image:", e);
                    } finally { 
                      setIsGeneratingImage(false); 
                    }
                  }} 
                  disabled={isGeneratingImage || !localFormData.name} 
                  className="absolute -bottom-2 -right-2 p-6 bg-gradient-to-tr from-emerald-600 to-teal-400 text-white rounded-[2rem] shadow-2xl hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Sparkles size={32} />
                </button>
              </div>
            </div>
            <form onSubmit={handleUserSubmit} className="space-y-6">
              <input type="text" required value={localFormData.name} onChange={(e) => setLocalFormData({...localFormData, name: e.target.value})} className="w-full px-10 py-7 rounded-[2.5rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold bg-slate-50/50 text-xl shadow-inner" placeholder="Namn..." />
              <div className="grid grid-cols-2 gap-5">
                <select 
                  className="w-full px-8 py-7 rounded-[2.5rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold bg-slate-50/50 appearance-none text-sm" 
                  value={localFormData.carModel} 
                  onChange={(e) => {
                    const m = CAR_MODELS.find(x => x.name === e.target.value);
                    if (m) setLocalFormData({...localFormData, carModel: m.name, capacity: m.capacity});
                  }}
                >
                  {CAR_MODELS.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
                <input type="number" value={localFormData.capacity} onChange={(e) => setLocalFormData({...localFormData, capacity: parseFloat(e.target.value) || 0})} className="w-full px-8 py-7 rounded-[2.5rem] border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold bg-slate-50/50" />
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






