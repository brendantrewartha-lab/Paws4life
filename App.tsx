import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { DogProfile, Message, UserLocation, HealthRecord, DogReminder, UserProfile } from './types';
import { MapView } from './components/MapView';

// --- Helper Components ---

const Header: React.FC<{ title: string; onBack?: () => void; actions?: React.ReactNode }> = ({ title, onBack, actions }) => (
  <header className="bg-orange-600 text-white shadow-xl z-[60] shrink-0">
    <div style={{ height: 'max(env(safe-area-inset-top), 60px)' }} className="w-full"></div>
    <div className="px-5 pb-5 flex items-center justify-between min-h-[64px]">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl active:scale-90 transition-all">
            <i className="fa-solid fa-chevron-left text-lg"></i>
          </button>
        ) : (
          <div className="bg-white w-11 h-11 rounded-2xl flex items-center justify-center shadow-inner">
            <i className="fa-solid fa-paw text-2xl text-orange-600"></i>
          </div>
        )}
        <h1 className="text-xl font-black italic tracking-tighter leading-tight truncate max-w-[150px]">
          {title === "paws4life" ? (<>paws4life<span className="text-orange-200">.ai</span></>) : title}
        </h1>
      </div>
      <div className="flex gap-1.5">
        {actions}
      </div>
    </div>
  </header>
);

const SectionHeader: React.FC<{ title: string; onAdd?: () => void }> = ({ title, onAdd }) => (
  <div className="flex items-center justify-between mt-6 mb-3 px-1">
    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h3>
    {onAdd && (
      <button onClick={onAdd} className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center hover:bg-orange-200 transition-all shadow-sm">
        <i className="fa-solid fa-plus text-xs"></i>
      </button>
    )}
  </div>
);

// --- Overlays ---

const ScannerOverlay: React.FC<{ onResult: (breed: string, photo: string) => void; onClose: () => void }> = ({ onResult, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => { alert("Camera access denied."); onClose(); });
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current || analyzing) return;
    setAnalyzing(true);
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current, 0, 0);
    const base64 = canvasRef.current.toDataURL('image/jpeg', 0.6).split(',')[1];
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ inlineData: { data: base64, mimeType: 'image/jpeg' } }, { text: "Identify the dog breed in this image. Answer with ONLY the breed name." }] }
      });
      onResult(res.text?.trim() || "Unknown Breed", `data:image/jpeg;base64,${base64}`);
    } catch (e) {
      onResult("", `data:image/jpeg;base64,${base64}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <button onClick={onClose} className="absolute right-6 top-16 text-white p-4 bg-black/40 rounded-full backdrop-blur-md z-50">
        <i className="fa-solid fa-xmark text-xl"></i>
      </button>
      <div className="absolute bottom-20 w-full flex flex-col items-center gap-4">
        <button onClick={capture} disabled={analyzing} className="w-20 h-20 rounded-full border-4 border-white bg-orange-600 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
          {analyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-12 h-12 bg-white rounded-full"></div>}
        </button>
        <span className="text-white font-black text-[10px] tracking-widest uppercase bg-black/20 px-4 py-1 rounded-full backdrop-blur-sm">Breed Scanner</span>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v14_profiles') || '[]'));
  const [user, setUser] = useState<UserProfile>(() => JSON.parse(localStorage.getItem('paws_v14_user') || '{"name":"","email":"","phone":""}'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v14_active'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'profiles' | 'profile-detail' | 'add' | 'scan' | 'form-scan' | 'edit-form' | 'map' | 'add-form' | 'reminders-list' | 'settings'>('chat');
  const [location, setLocation] = useState<UserLocation>();
  
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ name: '', breed: '', age: '', weight: '', photo: '', vaccinations: [], procedures: [], reminders: [] });
  const [viewId, setViewId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentDog = profiles.find(p => p.id === activeId) || null;
  const viewedDog = profiles.find(p => p.id === viewId) || null;

  // Notification count (upcoming reminders)
  const today = new Date().toISOString().split('T')[0];
  const activeReminders = profiles.flatMap(p => p.reminders).filter(r => r.date >= today);

  useEffect(() => {
    localStorage.setItem('paws_v14_profiles', JSON.stringify(profiles));
    localStorage.setItem('paws_v14_user', JSON.stringify(user));
    if (activeId) localStorage.setItem('paws_v14_active', activeId);
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [profiles, user, activeId, messages]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => setLocation({ latitude: p.coords.latitude, longitude: p.coords.longitude }));
    }
  }, []);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput('');
    setLoading(true);

    try {
      const apiKey = process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const context = currentDog ? 
        `Dog: ${currentDog.name} (${currentDog.breed}). Vaccinations: ${currentDog.vaccinations.map(v => `${v.title} on ${v.date}`).join(', ') || 'None'}. Procedures: ${currentDog.procedures.map(p => `${p.title} on ${p.date}`).join(', ') || 'None'}.` : "";
      
      const response = await ai.models.generateContent({
        model: location ? 'gemini-2.5-flash' : 'gemini-3-flash-preview',
        contents: updatedHistory.map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: `You are paws4life.ai expert. User: ${user.name || 'Owner'}. ${context} Priority: dog safety. Use Google Search for current events/vets.`,
          tools: [{ googleSearch: {} }],
        }
      });

      const text = response.text || "Connection error.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ title: c.web?.title || 'Source', uri: c.web?.uri || '#' })) || [];
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "⚠️ API Error. Please check connectivity.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const saveForm = () => {
    if (!formDog.name) return alert("Name is required!");
    const newDog: DogProfile = {
      id: formDog.id || Date.now().toString(),
      name: formDog.name || '',
      breed: formDog.breed || '',
      age: formDog.age || '',
      weight: formDog.weight || '',
      photo: formDog.photo || '',
      vaccinations: formDog.vaccinations || [],
      procedures: formDog.procedures || [],
      reminders: formDog.reminders || []
    };
    if (formDog.id) {
      setProfiles(prev => prev.map(p => p.id === formDog.id ? newDog : p));
    } else {
      setProfiles(prev => [...prev, newDog]);
      setActiveId(newDog.id);
    }
    setViewId(newDog.id);
    setView('profile-detail');
  };

  const addRecord = (type: 'vaccinations' | 'procedures' | 'reminders') => {
    const title = prompt(`Enter ${type.slice(0, -1)} description:`);
    if (!title) return;
    
    // Using a basic fallback since we want a native date picker, 
    // we'll handle this via a small temporary UI state in the future or keep prompt for now.
    // For this update, I'll enhance the main edit form to have visible "Add" sections.
    const date = prompt(`Enter Date (YYYY-MM-DD):`, new Date().toISOString().split('T')[0]);
    if (title && date) {
      setFormDog(prev => ({
        ...prev,
        [type]: [...(prev[type] as any[]), { id: Date.now().toString(), title, date, type: 'Other' }]
      }));
    }
  };

  const removeItem = (type: 'vaccinations' | 'procedures' | 'reminders', id: string) => {
    setFormDog(prev => ({
      ...prev,
      [type]: (prev[type] as any[]).filter(item => item.id !== id)
    }));
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden font-sans">
      <Header 
        title="paws4life" 
        actions={
          <>
            <button onClick={() => setView('reminders-list')} className="relative w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-bell"></i>
              {activeReminders.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-orange-600 animate-pulse">
                  {activeReminders.length}
                </span>
              )}
            </button>
            <button onClick={() => setView('map')} className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-map-location-dot"></i>
            </button>
            <button onClick={() => setView('settings')} className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-user-gear"></i>
            </button>
            <button onClick={() => setView('profiles')} className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-dog"></i>
            </button>
          </>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-50/50">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-40">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-2">
              <i className="fa-solid fa-comment-medical text-3xl"></i>
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-slate-800">Canine AI Assistant</p>
            <p className="text-xs text-slate-500 max-w-[200px]">How can I help you and your pack today?</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[85%] p-4 rounded-3xl text-sm shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap leading-relaxed prose prose-sm prose-slate">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (<a key={i} href={u.uri} target="_blank" className="text-[10px] bg-slate-50 text-orange-600 px-2 py-1 rounded-lg border border-slate-200 font-bold hover:bg-orange-50"><i className="fa-solid fa-link mr-1"></i> {u.title}</a>))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="p-3 bg-white border border-slate-100 rounded-2xl w-16 flex gap-1 justify-center animate-pulse"><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div></div>}
        <div ref={scrollRef} />
      </main>

      <footer className="px-4 py-4 bg-white border-t border-slate-100 sticky bottom-0 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={currentDog ? `Chat about ${currentDog.name}...` : "Ask a question..."} className="flex-1 bg-slate-50 px-5 py-3.5 rounded-2xl text-sm outline-none border border-slate-100 focus:border-orange-400 transition-all shadow-inner" />
          <button type="submit" disabled={!input.trim() || loading} className="bg-orange-600 text-white w-14 h-14 rounded-2xl shadow-xl shadow-orange-600/30 flex items-center justify-center active:scale-90 disabled:opacity-50 transition-all"><i className="fa-solid fa-paper-plane text-lg"></i></button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="My Pack" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 overflow-y-auto space-y-4 scrollbar-hide">
            <button onClick={() => setView('add')} className="w-full py-5 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-3xl mb-4 hover:bg-orange-100 active:scale-[0.98] transition-all">
              <i className="fa-solid fa-plus mr-2"></i> Add Dog to Pack
            </button>
            {profiles.length === 0 && (
              <div className="text-center p-12 text-slate-300 flex flex-col items-center gap-4">
                <i className="fa-solid fa-dog text-5xl opacity-20"></i>
                <p className="font-bold">No dogs yet!</p>
              </div>
            )}
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setView('profile-detail'); }} className={`p-4 rounded-[2rem] border-2 flex items-center gap-4 transition-all active:scale-[0.98] ${activeId === p.id ? 'bg-orange-50 border-orange-500 shadow-md' : 'bg-white border-slate-100'}`}>
                <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-slate-100 shadow-inner">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-2xl text-slate-300 m-5"></i>}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-slate-800 text-lg">{p.name}</h3>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{p.breed || 'Unknown Breed'}</p>
                </div>
                <i className="fa-solid fa-chevron-right text-slate-300 mr-2"></i>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="Reminders" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 overflow-y-auto space-y-4 scrollbar-hide">
            {activeReminders.length === 0 ? (
              <div className="text-center p-12 text-slate-300 flex flex-col items-center gap-4">
                <i className="fa-solid fa-check-circle text-5xl opacity-20 text-green-500"></i>
                <p className="font-bold">All caught up!</p>
              </div>
            ) : (
              activeReminders.sort((a,b) => a.date.localeCompare(b.date)).map(r => {
                const dog = profiles.find(p => p.reminders.some(rem => rem.id === r.id));
                return (
                  <div key={r.id} className="p-5 bg-orange-50 border border-orange-200 rounded-3xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-600 shadow-sm shrink-0">
                      <i className="fa-solid fa-calendar-check text-xl"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{dog?.name || 'Pack'}</p>
                      <h3 className="font-black text-slate-800 truncate">{r.title}</h3>
                      <p className="text-xs font-bold text-orange-600">{r.date}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="My Account" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 overflow-y-auto space-y-6 scrollbar-hide">
            <div className="space-y-4">
              <SectionHeader title="Personal Details" />
              <input type="text" value={user.name} onChange={e => setUser(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" placeholder="Full Name" />
              <input type="email" value={user.email} onChange={e => setUser(p => ({ ...p, email: e.target.value }))} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" placeholder="Email Address" />
              <input type="tel" value={user.phone} onChange={e => setUser(p => ({ ...p, phone: e.target.value }))} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" placeholder="Phone Number" />
            </div>

            <div className="space-y-4">
              <SectionHeader title="Social Linkage" />
              <div className="relative">
                <i className="fa-brands fa-instagram absolute left-4 top-1/2 -translate-y-1/2 text-orange-600 text-lg"></i>
                <input type="text" value={user.instagram} onChange={e => setUser(p => ({ ...p, instagram: e.target.value }))} className="w-full p-4 pl-12 bg-slate-50 border border-slate-100 rounded-2xl font-bold" placeholder="@username" />
              </div>
              <div className="relative">
                <i className="fa-brands fa-facebook absolute left-4 top-1/2 -translate-y-1/2 text-blue-600 text-lg"></i>
                <input type="text" value={user.facebook} onChange={e => setUser(p => ({ ...p, facebook: e.target.value }))} className="w-full p-4 pl-12 bg-slate-50 border border-slate-100 rounded-2xl font-bold" placeholder="Facebook Profile" />
              </div>
              <div className="relative">
                <i className="fa-brands fa-x-twitter absolute left-4 top-1/2 -translate-y-1/2 text-slate-800 text-lg"></i>
                <input type="text" value={user.xPlatform} onChange={e => setUser(p => ({ ...p, xPlatform: e.target.value }))} className="w-full p-4 pl-12 bg-slate-50 border border-slate-100 rounded-2xl font-bold" placeholder="X Platform" />
              </div>
            </div>
            
            <p className="text-[10px] text-center text-slate-300 font-black uppercase tracking-widest mt-8">paws4life v1.4.0</p>
          </div>
        </div>
      )}

      {view === 'profile-detail' && viewedDog && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-in">
          <Header title={viewedDog.name} onBack={() => setView('profiles')} actions={
            <button onClick={() => { setFormDog(viewedDog); setView('edit-form'); }} className="px-5 bg-white text-orange-600 rounded-xl font-black h-11 flex items-center shadow-md active:scale-90 transition-all">Edit</button>
          }/>
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
            <div className="flex items-center gap-6">
              <div className="w-32 h-32 rounded-[3rem] overflow-hidden border-4 border-orange-50 shrink-0 shadow-lg">
                {viewedDog.photo ? <img src={viewedDog.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><i className="fa-solid fa-dog text-4xl text-slate-300"></i></div>}
              </div>
              <div className="space-y-1.5">
                <h2 className="text-3xl font-black text-slate-800 leading-none">{viewedDog.name}</h2>
                <p className="text-orange-500 font-black uppercase tracking-widest text-[10px] bg-orange-50 px-2 py-0.5 rounded inline-block">{viewedDog.breed || 'Dog'}</p>
                <div className="flex gap-2 mt-2">
                   <div className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-600 shadow-sm flex flex-col items-center">
                     <span className="text-xs">{viewedDog.age || '?'}</span>
                     <span className="opacity-50 text-[8px]">Years</span>
                   </div>
                   <div className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-600 shadow-sm flex flex-col items-center">
                     <span className="text-xs">{viewedDog.weight || '?'}</span>
                     <span className="opacity-50 text-[8px]">KG</span>
                   </div>
                </div>
              </div>
            </div>

            <button onClick={() => { setActiveId(viewedDog.id); setView('chat'); }} className="w-full py-5 bg-orange-600 text-white rounded-[2rem] font-black shadow-xl shadow-orange-600/30 active:scale-95 transition-all">
              <i className="fa-solid fa-shield-dog mr-2"></i> Discuss {viewedDog.name}'s Health
            </button>

            <SectionHeader title="Vaccination History" />
            <div className="space-y-3">
              {viewedDog.vaccinations.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-2xl">No vaccinations added yet.</p>}
              {viewedDog.vaccinations.map(v => (
                <div key={v.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center"><i className="fa-solid fa-syringe text-sm"></i></div>
                    <span className="font-bold text-slate-800">{v.title}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded-md">{v.date}</span>
                </div>
              ))}
            </div>

            <SectionHeader title="Upcoming Reminders" />
            <div className="space-y-3">
              {viewedDog.reminders.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-2xl">No upcoming reminders.</p>}
              {viewedDog.reminders.sort((a,b) => a.date.localeCompare(b.date)).map(r => (
                <div key={r.id} className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white text-orange-600 rounded-lg flex items-center justify-center shadow-sm"><i className="fa-solid fa-calendar-check text-sm"></i></div>
                    <span className="font-bold text-slate-800">{r.title}</span>
                  </div>
                  <span className="text-[10px] font-black text-orange-600">{r.date}</span>
                </div>
              ))}
            </div>
            <div className="h-20"></div>
          </div>
        </div>
      )}

      {(view === 'add-form' || view === 'edit-form') && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <Header title={view.includes('edit') ? 'Update Pack Member' : 'New Pack Member'} onBack={() => setView('profiles')} />
          <div className="flex-1 p-6 overflow-y-auto space-y-8 scrollbar-hide">
            <div className="flex flex-col items-center gap-5">
              <div className="w-32 h-32 rounded-[3rem] bg-slate-100 border-2 border-white overflow-hidden shadow-2xl flex items-center justify-center group relative">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-camera text-slate-300 text-3xl"></i>}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <i className="fa-solid fa-camera text-white"></i>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setView('form-scan')} className="px-5 py-2.5 bg-orange-600 text-white rounded-full font-black text-[10px] uppercase shadow-lg shadow-orange-600/20 active:scale-95 transition-all">Snap Photo</button>
                <label className="px-5 py-2.5 bg-slate-800 text-white rounded-full font-black text-[10px] uppercase shadow-lg shadow-slate-800/20 active:scale-95 transition-all cursor-pointer">
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (re) => setFormDog(p => ({ ...p, photo: re.target?.result as string }));
                        reader.readAsDataURL(file);
                    }
                  }} />
                </label>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2 tracking-widest">Name *</label>
                <input type="text" value={formDog.name} onChange={e => setFormDog(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:border-orange-500 outline-none font-bold" placeholder="Buddy" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2 tracking-widest">Breed</label>
                <input type="text" value={formDog.breed} onChange={e => setFormDog(p => ({ ...p, breed: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold" placeholder="Labrador" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Age</label>
                  <input type="text" value={formDog.age} onChange={e => setFormDog(p => ({ ...p, age: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-center" placeholder="5" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">KG</label>
                  <input type="text" value={formDog.weight} onChange={e => setFormDog(p => ({ ...p, weight: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-center" placeholder="25" />
                </div>
              </div>
            </div>

            <SectionHeader title="Vaccinations" onAdd={() => addRecord('vaccinations')} />
            <div className="space-y-2">
              {formDog.vaccinations?.map(v => (
                <div key={v.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800">{v.title}</span>
                    <span className="text-[10px] text-slate-400">{v.date}</span>
                  </div>
                  <button onClick={() => removeItem('vaccinations', v.id)} className="w-8 h-8 text-slate-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash-can"></i></button>
                </div>
              ))}
            </div>

            <SectionHeader title="Future Reminders" onAdd={() => addRecord('reminders')} />
            <div className="space-y-2">
              {formDog.reminders?.map(r => (
                <div key={r.id} className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800">{r.title}</span>
                    <span className="text-[10px] text-orange-600 font-black">{r.date}</span>
                  </div>
                  <button onClick={() => removeItem('reminders', r.id)} className="w-8 h-8 text-orange-200 hover:text-orange-600 transition-colors"><i className="fa-solid fa-trash-can"></i></button>
                </div>
              ))}
            </div>

            <button onClick={saveForm} className="w-full py-5 bg-orange-600 text-white rounded-[2rem] font-black shadow-xl shadow-orange-600/20 active:scale-95 transition-all mt-4 mb-10">Save {formDog.name || 'Profile'}</button>
            <div className="h-10"></div>
          </div>
        </div>
      )}

      {view === 'add' && (
        <div className="fixed inset-0 z-[105] bg-slate-900/70 backdrop-blur-md flex items-end justify-center animate-in">
          <div className="bg-white w-full max-w-xl rounded-t-[3rem] px-8 py-12 space-y-8 shadow-2xl">
            <h2 className="text-2xl font-black text-center text-slate-800">Choose Entry Method</h2>
            <div className="grid grid-cols-2 gap-5">
              <button onClick={() => setView('scan')} className="p-8 border-2 border-slate-100 rounded-[2.5rem] flex flex-col items-center gap-4 hover:border-orange-500 hover:bg-orange-50/50 transition-all active:scale-95 group">
                <div className="w-16 h-16 bg-orange-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-orange-600/20 group-hover:scale-110 transition-transform"><i className="fa-solid fa-camera text-2xl"></i></div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-800">Scan & ID</span>
              </button>
              <button onClick={() => { setFormDog({ name: '', breed: '', vaccinations: [], procedures: [], reminders: [] }); setView('add-form'); }} className="p-8 border-2 border-slate-100 rounded-[2.5rem] flex flex-col items-center gap-4 hover:border-orange-500 hover:bg-orange-50/50 transition-all active:scale-95 group">
                <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-slate-800/20 group-hover:scale-110 transition-transform"><i className="fa-solid fa-keyboard text-2xl"></i></div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-800">Manual Entry</span>
              </button>
            </div>
            <button onClick={() => setView('profiles')} className="w-full py-4 text-slate-400 font-black uppercase tracking-widest text-xs">Maybe Later</button>
          </div>
        </div>
      )}

      {view === 'scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog({ name: '', breed, photo, vaccinations: [], procedures: [], reminders: [] }); setView('add-form'); }} onClose={() => setView('add')} />}
      {view === 'form-scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog(p => ({ ...p, breed: breed || p.breed, photo })); setView('edit-form'); }} onClose={() => setView('edit-form')} />}
      {view === 'map' && <MapView location={location} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;