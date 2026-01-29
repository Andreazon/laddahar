import React, { useState, useMemo, useEffect } from 'react';
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
  CreditCard, 
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
  Heart
} from 'lucide-react';

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const App: React.FC = () => {
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
    return saved ? JSON.parse(saved) : SETTINGS;
  });

  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [userModal, setUserModal] = useState<{show: boolean, mode: 'add' | 'edit', userId?: string}>({show: false, mode: 'add'});
  const [showSettings, setShowSettings] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  const [formData, setFormData] = useState({ 
    name: '', 
    carModel: CAR_MODELS[0].name, 
    capacity: CAR_MODELS[0].capacity,
    avatarUrl: ''
  });
  const [tempKwhPrice, setTempKwhPrice] = useState(appSettings.kwhPrice.toString());

  useEffect(() => {
    localStorage.setItem('laddahar_users', JSON.stringify(users));
    localStorage.setItem('laddahar_sessions', JSON.stringify(sessions));
    localStorage.setItem('laddahar_settings', JSON.stringify(appSettings));
  }, [users, sessions, appSettings]);

  const activeUser = users.find(u => u.id === activeUserId);
  const monthStart = getStartOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const toggleSession = (date: Date) => {
    if (!activeUserId) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    setSessions(prev => {
      const exists = prev.find(s => s.userId === activeUserId && s.date === dateStr);
      if (exists) return prev.filter(s => !(s.userId === activeUserId && s.date === dateStr));
      return [...prev, { userId: activeUserId, date: dateStr }];
    });
  };

  const userSessionsThisMonth = useMemo(() => {
    if (!activeUserId) return [];
    return sessions.filter(s => {
      const sessionDate = new Date(s.date);
      return s.userId === activeUserId && sessionDate >= monthStart && sessionDate <= monthEnd;
    });
  }, [sessions, activeUserId, monthStart, monthEnd]);

  const totalKwh = activeUser ? userSessionsThisMonth.length * activeUser.car.batteryCapacity : 0;
  const totalCost = totalKwh * appSettings.kwhPrice;

  const generateAIAvatar = async () => {
    if (!formData.name) {
      alert("Ange ett namn först!");
      return;
    }
    
    setIsGeneratingImage(true);
    try {
      // Fix: Use new GoogleGenAI instance for each API call to ensure latest key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `A joyful, fashionable 3D Pixar-style avatar of a person named ${formData.name}. Bright radiant smile, trendy high-end clothing, warm cinematic studio lighting, vibrant colorful background (soft pinks/emeralds), extremely detailed face and stylish hair. High fashion aesthetic.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64Data = part.inlineData.data;
            setFormData(prev => ({ ...prev, avatarUrl: `data:image/png;base64,${base64Data}` }));
            break;
          }
        }
      }
    } catch (error) {
      console.error("AI Error:", error);
      alert("Kunde inte generera bild. Kontrollera din API-nyckel.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const getAvatarUrl = (user: User | {name: string, avatarUrl?: string}) => {
    if (user.avatarUrl) return user.avatarUrl;
    // Using Lorelei style from DiceBear - more fashionable and happy
    return `https://api.dicebear.com/7.x/lorelei/svg?seed=${user.name}&radius=50&backgroundColor=b6e3f4,c0aede,d1d4f9&mood=happy`;
  };

  const deleteUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Är du säker på att du vill ta bort den här profilen?')) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      setSessions(prev => prev.filter(s => s.userId !== userId));
      if (activeUserId === userId) setActiveUserId(null);
    }
  };

  const openUserModal = (mode: 'add' | 'edit', user?: User) => {
    if (mode === 'edit' && user) {
      setFormData({ 
        name: user.name, 
        carModel: user.car.model, 
        capacity: user.car.batteryCapacity,
        avatarUrl: user.avatarUrl || ''
      });
      setUserModal({ show: true, mode: 'edit', userId: user.id });
    } else {
      setFormData({ 
        name: '', 
        carModel: CAR_MODELS[0].name, 
        capacity: CAR_MODELS[0].capacity,
        avatarUrl: ''
      });
      setUserModal({ show: true, mode: 'add' });
    }
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (userModal.mode === 'edit' && userModal.userId) {
      setUsers(users.map(u => u.id === userModal.userId ? {
        ...u, 
        name: formData.name, 
        car: { model: formData.carModel, batteryCapacity: formData.capacity },
        avatarUrl: formData.avatarUrl
      } : u));
    } else {
      const newUser: User = {
        id: Date.now().toString(),
        name: formData.name,
        car: { model: formData.carModel, batteryCapacity: formData.capacity },
        avatarUrl: formData.avatarUrl
      };
      setUsers([...users, newUser]);
      setActiveUserId(newUser.id);
    }
    setUserModal({ show: false, mode: 'add' });
  };

  if (!activeUserId) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
        <button onClick={() => setShowSettings(true)} className="absolute top-6 right-6 p-3 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-emerald-500 transition-all shadow-sm">
          <SettingsIcon size={24} />
        </button>

        <div className="max-w-5xl w-full text-center space-y-12">
          <div className="flex flex-col items-center">
            <div className="inline-flex p-5 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-[2.5rem] text-white shadow-2xl shadow-emerald-200 mb-6 scale-110">
              <Zap size={40} fill="currentColor" />
            </div>
            <h1 className="text-6xl font-black text-slate-900 tracking-tighter mb-2">LaddaHär</h1>
            <p className="text-slate-400 text-lg font-medium flex items-center gap-2">
              Företagets gladaste laddningsportal <Heart size={18} className="text-pink-400 fill-pink-400" />
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 pt-6">
            {users.map(u => (
              <div key={u.id} className="group relative">
                <button
                  onClick={() => setActiveUserId(u.id)}
                  className="w-full bg-white p-8 rounded-[3rem] border border-slate-100 hover:shadow-2xl hover:shadow-emerald-100 transition-all flex flex-col items-center gap-5 group shadow-sm hover:-translate-y-2 duration-300"
                >
                  <div className="relative">
                    <div className="absolute -inset-2 bg-gradient-to-tr from-emerald-400 via-teal-300 to-blue-400 rounded-full animate-gradient-slow opacity-0 group-hover:opacity-100 transition-opacity blur-sm"></div>
                    <div className="w-28 h-28 bg-slate-50 rounded-full overflow-hidden border-4 border-white shadow-lg relative z-10">
                      <img 
                        src={getAvatarUrl(u)} 
                        className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                        alt={u.name} 
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-black text-slate-800 text-xl leading-tight">{u.name}</div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full">{u.car.model}</div>
                  </div>
                </button>
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                  <button onClick={() => openUserModal('edit', u)} className="p-2.5 bg-white/95 backdrop-blur rounded-2xl text-slate-400 hover:text-blue-500 shadow-xl border border-slate-100"><Edit2 size={16} /></button>
                  <button onClick={(e) => deleteUser(u.id, e)} className="p-2.5 bg-white/95 backdrop-blur rounded-2xl text-slate-400 hover:text-red-500 shadow-xl border border-slate-100"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            
            <button
              onClick={() => openUserModal('add')}
              className="bg-white/50 border-2 border-dashed border-slate-200 p-8 rounded-[3rem] flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-emerald-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all group min-h-[250px]"
            >
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus size={36} />
              </div>
              <span className="font-black text-xs uppercase tracking-[0.2em]">Skapa Profil</span>
            </button>
          </div>
        </div>

        {userModal.show && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[3.5rem] p-12 max-w-md w-full shadow-2xl relative animate-in zoom-in duration-300">
              <button onClick={() => setUserModal({show: false, mode: 'add'})} className="absolute top-10 right-10 text-slate-300 hover:text-slate-900"><X size={24} /></button>
              <h2 className="text-4xl font-black mb-10 text-slate-900 tracking-tighter">{userModal.mode === 'add' ? 'Ny profil' : 'Redigera'}</h2>
              
              <div className="flex flex-col items-center mb-10">
                <div className="relative group">
                  <div className="absolute -inset-3 bg-gradient-to-br from-emerald-400 to-blue-400 rounded-full blur-md opacity-20"></div>
                  <div className="w-36 h-36 bg-slate-50 rounded-full overflow-hidden border-4 border-slate-50 shadow-inner flex items-center justify-center relative">
                    {isGeneratingImage ? (
                      <Loader2 className="animate-spin text-emerald-500" size={48} />
                    ) : (
                      <img 
                        src={getAvatarUrl({name: formData.name || 'default', avatarUrl: formData.avatarUrl})} 
                        className="w-full h-full object-cover" 
                        alt="Preview" 
                      />
                    )}
                  </div>
                  <button 
                    type="button"
                    onClick={generateAIAvatar}
                    disabled={isGeneratingImage || !formData.name}
                    className="absolute -bottom-2 -right-2 p-4 bg-gradient-to-tr from-emerald-500 to-teal-400 text-white rounded-2xl shadow-2xl hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <Sparkles size={24} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.25em] mt-8 text-center">Få en personlig AI-avatar <br/><span className="text-emerald-500">fashion-style</span></p>
              </div>

              <form onSubmit={handleUserSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Ditt Namn</label>
                  <input
                    autoFocus
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-8 py-5 rounded-3xl border-2 border-slate-50 focus:border-emerald-500 focus:bg-white outline-none font-bold text-slate-700 transition-all bg-slate-50/50"
                    placeholder="Namn..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Bil</label>
                    <select
                      className="w-full px-6 py-5 rounded-3xl border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold text-slate-700 bg-slate-50/50 appearance-none"
                      value={formData.carModel}
                      onChange={(e) => {
                        const model = CAR_MODELS.find(m => m.name === e.target.value);
                        if (model) setFormData({...formData, carModel: model.name, capacity: model.capacity});
                      }}
                    >
                      {CAR_MODELS.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">kWh</label>
                    <input 
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData({...formData, capacity: parseFloat(e.target.value) || 0})}
                      className="w-full px-6 py-5 rounded-3xl border-2 border-slate-50 focus:border-emerald-500 outline-none font-bold text-slate-700 bg-slate-50/50"
                    />
                  </div>
                </div>
                <button type="submit" className="w-full py-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black rounded-3xl hover:shadow-2xl hover:shadow-emerald-200 transition-all uppercase tracking-[0.2em] text-sm mt-4 active:scale-95">
                  Spara & Börja Ladda
                </button>
              </form>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[3rem] p-12 max-w-sm w-full shadow-2xl relative">
              <button onClick={() => setShowSettings(false)} className="absolute top-10 right-10 text-slate-300 hover:text-slate-900"><X size={24} /></button>
              <h2 className="text-2xl font-black mb-8 tracking-tighter text-slate-800">Prisinställningar</h2>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-2">Elpris (SEK per kWh)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={tempKwhPrice}
                    onChange={(e) => setTempKwhPrice(e.target.value)}
                    className="w-full px-8 py-6 rounded-3xl border-2 border-slate-50 focus:border-emerald-500 outline-none font-black text-4xl text-emerald-500 bg-slate-50/50"
                  />
                </div>
                <button 
                  onClick={() => { setAppSettings({...appSettings, kwhPrice: parseFloat(tempKwhPrice)}); setShowSettings(false); }}
                  className="w-full py-5 bg-slate-900 text-white font-black rounded-3xl hover:bg-slate-800 transition-all shadow-xl"
                >
                  Uppdatera Pris
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Grid layout for active user
  const activeUserSafe = users.find(u => u.id === activeUserId)!;
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between print:hidden">
          <button 
            onClick={() => setActiveUserId(null)}
            className="flex items-center gap-3 px-8 py-4 bg-white border border-slate-100 rounded-3xl text-slate-600 hover:text-emerald-500 hover:border-emerald-300 transition-all font-black text-xs uppercase tracking-[0.2em] shadow-sm hover:shadow-md"
          >
            <ArrowLeft size={16} /> Profilval
          </button>
          <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-3xl border border-slate-100 shadow-sm">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-100 shadow-sm">
              <img src={getAvatarUrl(activeUserSafe)} alt="user" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-slate-800">{activeUserSafe.name}</span>
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">{activeUserSafe.car.model}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-[3.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
              <div className="p-12 border-b border-slate-50 flex items-center justify-between bg-slate-50/20">
                <h2 className="text-4xl font-black text-slate-900 capitalize tracking-tighter">
                  {format(currentDate, 'MMMM yyyy', { locale: sv })}
                </h2>
                <div className="flex items-center gap-4 print:hidden">
                  <button onClick={() => setCurrentDate(addMonths(currentDate, -1))} className="p-4 bg-white border border-slate-100 rounded-2xl hover:text-emerald-500 transition-all shadow-sm"><ChevronLeft size={24} /></button>
                  <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-4 bg-white border border-slate-100 rounded-2xl hover:text-emerald-500 transition-all shadow-sm"><ChevronRight size={24} /></button>
                </div>
              </div>
              
              <div className="p-12">
                <div className="grid grid-cols-7 gap-5">
                  {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] pb-8">{day}</div>
                  ))}
                  
                  {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => <div key={i} />)}
                  
                  {daysInMonth.map(day => {
                    const isSelected = userSessionsThisMonth.some(s => s.date === format(day, 'yyyy-MM-dd'));
                    const today = isToday(day);
                    
                    return (
                      <button
                        key={day.toString()}
                        onClick={() => toggleSession(day)}
                        className={`
                          aspect-square rounded-[1.5rem] flex flex-col items-center justify-center relative transition-all duration-300 group
                          ${isSelected 
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-xl shadow-emerald-200 scale-110 z-10' 
                            : 'bg-white border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/50 text-slate-600 shadow-sm'}
                          ${today && !isSelected ? 'ring-4 ring-emerald-50' : ''}
                        `}
                      >
                        <span className={`text-xl font-black ${isSelected ? 'mb-1' : ''}`}>{format(day, 'd')}</span>
                        {isSelected && <CheckCircle2 size={20} className="animate-in zoom-in duration-300" />}
                        {today && !isSelected && <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full"></div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-10">
            <div className="bg-slate-900 text-white p-12 rounded-[3.5rem] shadow-[0_30px_60px_-15px_rgba(15,23,42,0.3)] relative overflow-hidden flex flex-col justify-between min-h-[450px]">
              <div className="absolute -top-10 -right-10 opacity-5 pointer-events-none rotate-12">
                <Zap size={300} fill="white" />
              </div>
              
              <div>
                <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mb-6">Månadens Nota</h3>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-3">
                    <span className="text-7xl font-black tabular-nums tracking-tighter">{totalCost.toFixed(2)}</span>
                    <span className="text-2xl font-bold text-emerald-400">SEK</span>
                  </div>
                  <p className="text-slate-500 text-xs font-medium pl-1">Beräknat på {appSettings.kwhPrice} kr / kWh</p>
                </div>
              </div>

              <div className="space-y-6 pt-12 border-t border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em]">Tillfällen</span>
                  <span className="font-black text-3xl">{userSessionsThisMonth.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em]">Energi</span>
                  <span className="font-black text-3xl">{totalKwh.toFixed(0)} <span className="text-xs text-slate-600">kWh</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em]">Fordon</span>
                  <span className="font-black text-emerald-400 text-sm bg-emerald-500/10 px-4 py-1.5 rounded-full">{activeUserSafe.car.model}</span>
                </div>
              </div>

              <button 
                onClick={() => window.print()}
                className="w-full mt-10 py-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black rounded-3xl transition-all shadow-2xl shadow-emerald-900/50 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs print:hidden active:scale-95"
              >
                <Printer size={20} /> Skapa Rapport
              </button>
            </div>

            <div className="bg-emerald-50/50 p-10 rounded-[3rem] border border-emerald-100/50 flex gap-5">
              <div className="p-3 bg-white rounded-2xl text-emerald-500 shadow-sm border border-emerald-50"><Info size={24} /></div>
              <div className="space-y-2">
                <h4 className="font-black text-emerald-900 text-xs uppercase tracking-widest">Grid Info</h4>
                <p className="text-[11px] text-emerald-800/60 leading-relaxed font-medium">
                  Klicka på de datum du laddat fullt. Appen räknar ut kostnaden automatiskt baserat på din bils kapacitet ({activeUserSafe.car.batteryCapacity} kWh).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
