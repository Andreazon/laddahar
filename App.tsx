
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
  Info
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `A stylish, high-quality professional 3D animated avatar face of a person named ${formData.name}. Friendly expression, simple clean studio background, Pixar style. Highly detailed.`;
      
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
      alert("Kunde inte generera bild. Kontrollera din API-nyckel eller försök igen.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const deleteUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Är du säker på att du vill ta bort den här profilen? All historik för användaren försvinner.')) {
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
        <button onClick={() => setShowSettings(true)} className="absolute top-6 right-6 p-3 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-emerald-500 transition-all shadow-sm hover:shadow-md">
          <SettingsIcon size={24} />
        </button>

        <div className="max-w-4xl w-full text-center space-y-8">
          <div className="inline-flex p-4 bg-emerald-500 rounded-[2rem] text-white shadow-xl shadow-emerald-200 animate-bounce">
            <Zap size={48} fill="currentColor" />
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter">LaddaHär</h1>
          <p className="text-slate-500 text-lg font-medium">Välj din profil för att registrera laddning</p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-10">
            {users.map(u => (
              <div key={u.id} className="group relative">
                <button
                  onClick={() => setActiveUserId(u.id)}
                  className="w-full bg-white p-8 rounded-[2.5rem] border-2 border-transparent hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-100 transition-all flex flex-col items-center gap-4 group shadow-sm"
                >
                  <div className="w-24 h-24 bg-slate-50 rounded-full overflow-hidden border-4 border-white shadow-inner group-hover:scale-110 transition-transform">
                    <img 
                      src={u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`} 
                      className="w-full h-full object-cover" 
                      alt={u.name} 
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="font-black text-slate-800 text-lg leading-tight">{u.name}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{u.car.model}</div>
                  </div>
                </button>
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openUserModal('edit', u)} className="p-2 bg-white/90 backdrop-blur rounded-xl text-slate-400 hover:text-blue-500 shadow-sm"><Edit2 size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); deleteUser(u.id, e); }} className="p-2 bg-white/90 backdrop-blur rounded-xl text-slate-400 hover:text-red-500 shadow-sm"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            
            <button
              onClick={() => openUserModal('add')}
              className="bg-white border-2 border-dashed border-slate-200 p-8 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-emerald-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all group min-h-[220px]"
            >
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus size={32} />
              </div>
              <span className="font-black text-xs uppercase tracking-widest">Ny profil</span>
            </button>
          </div>
        </div>

        {userModal.show && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[3rem] p-10 max-w-md w-full shadow-2xl relative animate-in zoom-in duration-200">
              <button onClick={() => setUserModal({show: false, mode: 'add'})} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900"><X size={24} /></button>
              <h2 className="text-3xl font-black mb-8 text-slate-900">{userModal.mode === 'add' ? 'Ny profil' : 'Redigera profil'}</h2>
              
              <div className="flex flex-col items-center mb-8">
                <div className="relative group">
                  <div className="w-32 h-32 bg-slate-50 rounded-full overflow-hidden border-4 border-slate-100 shadow-inner flex items-center justify-center">
                    {isGeneratingImage ? (
                      <Loader2 className="animate-spin text-emerald-500" size={40} />
                    ) : (
                      <img 
                        src={formData.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.name || 'default'}`} 
                        className="w-full h-full object-cover" 
                        alt="Preview" 
                      />
                    )}
                  </div>
                  <button 
                    type="button"
                    onClick={generateAIAvatar}
                    disabled={isGeneratingImage || !formData.name}
                    className="absolute bottom-0 right-0 p-3 bg-emerald-500 text-white rounded-2xl shadow-xl hover:bg-emerald-600 disabled:bg-slate-200 transition-all hover:scale-110 active:scale-95"
                    title="Generera AI-bild"
                  >
                    <Sparkles size={20} />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-4">Klicka på stjärnorna för AI-avatar</p>
              </div>

              <form onSubmit={handleUserSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ditt Namn</label>
                  <input
                    autoFocus
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none font-bold text-slate-700 transition-colors"
                    placeholder="Erik Andersson"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bilmodell</label>
                  <select
                    className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none font-bold text-slate-700 bg-white"
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Batterikapacitet (kWh)</label>
                  <input 
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => setFormData({...formData, capacity: parseFloat(e.target.value) || 0})}
                    className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none font-bold text-slate-700"
                  />
                </div>
                <button type="submit" className="w-full py-5 bg-emerald-500 text-white font-black rounded-3xl hover:bg-emerald-600 shadow-xl shadow-emerald-100 transition-all uppercase tracking-widest text-sm mt-4">
                  Spara Profil
                </button>
              </form>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[3rem] p-10 max-sm w-full shadow-2xl relative">
              <button onClick={() => setShowSettings(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900"><X size={24} /></button>
              <h2 className="text-2xl font-black mb-6">Prisinställning</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Pris per kWh (SEK)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={tempKwhPrice}
                    onChange={(e) => setTempKwhPrice(e.target.value)}
                    className="w-full px-6 py-5 rounded-2xl border-2 border-slate-100 focus:border-emerald-500 outline-none font-black text-3xl text-emerald-500"
                  />
                </div>
                <button 
                  onClick={() => { setAppSettings({...appSettings, kwhPrice: parseFloat(tempKwhPrice)}); setShowSettings(false); }}
                  className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all"
                >
                  Spara
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeUserSafe = users.find(u => u.id === activeUserId);
  if (!activeUserSafe) {
    setActiveUserId(null);
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between print:hidden">
          <button 
            onClick={() => setActiveUserId(null)}
            className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:text-emerald-500 hover:border-emerald-500 transition-all font-black text-xs uppercase tracking-widest shadow-sm"
          >
            <ArrowLeft size={16} /> Profilval
          </button>
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-100">
              <img src={activeUserSafe.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeUserSafe.name}`} alt="user" className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-black text-slate-800">{activeUserSafe.name}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
              <div className="p-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                <h2 className="text-3xl font-black text-slate-900 capitalize tracking-tight">
                  {format(currentDate, 'MMMM yyyy', { locale: sv })}
                </h2>
                <div className="flex items-center gap-3 print:hidden">
                  <button onClick={() => setCurrentDate(addMonths(currentDate, -1))} className="p-3 bg-white border border-slate-200 rounded-2xl hover:text-emerald-500 transition-all shadow-sm"><ChevronLeft size={24} /></button>
                  <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-3 bg-white border border-slate-200 rounded-2xl hover:text-emerald-500 transition-all shadow-sm"><ChevronRight size={24} /></button>
                </div>
              </div>
              
              <div className="p-10">
                <div className="grid grid-cols-7 gap-4">
                  {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] pb-6">{day}</div>
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
                          aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all duration-300 group
                          ${isSelected 
                            ? 'bg-emerald-500 text-white shadow-2xl shadow-emerald-200 scale-105 z-10' 
                            : 'bg-white border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 text-slate-600 shadow-sm'}
                          ${today && !isSelected ? 'ring-4 ring-emerald-100' : ''}
                        `}
                      >
                        <span className={`text-lg font-black ${isSelected ? 'mb-1' : ''}`}>{format(day, 'd')}</span>
                        {isSelected && <CheckCircle2 size={18} className="animate-in zoom-in" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[400px]">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                <CreditCard size={180} />
              </div>
              
              <div>
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4">Månadens Kostnad</h3>
                <div className="flex items-baseline gap-3">
                  <span className="text-6xl font-black tabular-nums tracking-tighter">{totalCost.toFixed(2)}</span>
                  <span className="text-2xl font-bold text-emerald-400">SEK</span>
                </div>
              </div>

              <div className="space-y-6 pt-10 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Tillfällen</span>
                  <span className="font-black text-2xl">{userSessionsThisMonth.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Totalt kWh</span>
                  <span className="font-black text-2xl">{totalKwh.toFixed(0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Bil</span>
                  <span className="font-bold text-emerald-400 text-right text-xs">{activeUserSafe.car.model}</span>
                </div>
              </div>

              <button 
                onClick={() => window.print()}
                className="w-full mt-10 py-5 bg-emerald-500 hover:bg-emerald-400 text-white font-black rounded-3xl transition-all shadow-xl shadow-emerald-900/50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs print:hidden"
              >
                <Printer size={18} /> Skriv ut rapport
              </button>
            </div>

            <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border border-emerald-100 flex gap-4">
              <div className="text-emerald-500 mt-1"><Info size={24} /></div>
              <div className="space-y-2">
                <h4 className="font-black text-emerald-900 text-xs uppercase tracking-widest">Info</h4>
                <p className="text-[11px] text-emerald-800/70 leading-relaxed font-medium">
                  Varje kryss räknas som en full laddning ({activeUserSafe.car.batteryCapacity} kWh) á {appSettings.kwhPrice} kr/kWh.
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
