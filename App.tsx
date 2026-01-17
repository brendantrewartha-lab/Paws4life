import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { DogProfile, Message, UserLocation, HealthRecord, DogReminder } from './types';

// Global declaration for Leaflet
declare const L: any;

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
        <h1 className="text-xl font-black italic tracking-tighter leading-tight truncate max-w-[180px]">
          {title === "paws4life" ? (<>paws4life<span className="text-orange-200">.ai</span></>) : title}
        </h1>
      </div>
      <div className="flex gap-2">
        {actions}
      </div>
    </div>
  </header>
);

const SectionHeader: React.FC<{ title: string; onAdd?: () => void }> = ({ title, onAdd }) => (
  <div className="flex items-center justify-between mt-6 mb-3 px-1">
    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h3>
    {onAdd && (
      <button onClick={onAdd} className="w-6 h-6 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center hover:bg-orange-200 transition-all">
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
      // Fix: Use process.env.API_KEY directly and correct named parameter for initialization
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
      <button onClick={onClose} className="absolute right-6 top-16 text-white p-4 bg-black/40 rounded-full backdrop-blur-md">
        <i className="fa-solid fa-xmark text-xl"></i>
      </button>
      <div className="absolute bottom-20 w-full flex flex-col items-center gap-4">
        <button onClick={capture} disabled={analyzing} className="w-20 h-20 rounded-full border-4 border-white bg-orange-600 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
          {analyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-12 h-12 bg-white rounded-full"></div>}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v13_profiles') || '[]'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v13_active'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Fix: Added 'add-form' to the view state union type to resolve assignment errors
  const [view, setView] = useState<'chat' | 'profiles' | 'profile-detail' | 'add' | 'scan' | 'form-scan' | 'edit-form' | 'map' | 'add-form'>('chat');
  const [location, setLocation] = useState<UserLocation>();
  
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ name: '', breed: '', age: '', weight: '', photo: '', vaccinations: [], procedures: [], reminders: [] });
  const [viewId, setViewId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentDog = profiles.find(p => p.id === activeId) || null;
  const viewedDog = profiles.find(p => p.id === viewId) || null;

  useEffect(() => {
    localStorage.setItem('paws_v13_profiles', JSON.stringify(profiles));
    if (activeId) localStorage.setItem('paws_v13_active', activeId);
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [profiles, activeId, messages]);

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
      // Fix: Create instance locally within the function and use direct named apiKey
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const context = currentDog ? 
        `Dog: ${currentDog.name} (${currentDog.breed}). Vaccinations: ${currentDog.vaccinations.map(v => `${v.title} on ${v.date}`).join(', ') || 'None'}. Procedures: ${currentDog.procedures.map(p => `${p.title} on ${p.date}`).join(', ') || 'None'}.` : "";
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: updatedHistory.map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: `You are paws4life.ai expert. ${context} Priority: dog safety. Always list grounding sources if found.`,
          tools: [{ googleSearch: {} }],
        }
      });

      const text = response.text || "Connection error. Try again.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ title: c.web?.title || 'Source', uri: c.web?.uri || '#' })) || [];
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "⚠️ Check internet connection & API key.", timestamp: Date.now() }]);
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
    const title = prompt(`New ${type.slice(0, -1)} title?`);
    const date = prompt(`Date (YYYY-MM-DD)?`, new Date().toISOString().split('T')[0]);
    if (title && date) {
      setFormDog(prev => ({
        ...prev,
        [type]: [...(prev[type] as any[]), { id: Date.now().toString(), title, date, type: 'Other' }]
      }));
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden">
      <Header 
        title="paws4life" 
        actions={
          <>
            <button onClick={() => setView('profiles')} className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"><i className="fa-solid fa-dog"></i></button>
          </>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-50">
            <i className="fa-solid fa-shield-dog text-4xl text-orange-600"></i>
            <p className="text-sm font-bold uppercase tracking-widest">Ask for advice or local services</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[85%] p-4 rounded-3xl text-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap leading-relaxed prose prose-sm">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (<a key={i} href={u.uri} target="_blank" className="text-[10px] bg-slate-50 text-orange-600 px-2 py-1 rounded-lg border font-bold">{u.title}</a>))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="p-3 bg-white border rounded-2xl w-16 flex gap-1 justify-center animate-pulse"><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div></div>}
        <div ref={scrollRef} />
      </main>

      <footer className="px-4 py-4 bg-white border-t sticky bottom-0 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={currentDog ? `Chat about ${currentDog.name}...` : "Ask a question..."} className="flex-1 bg-slate-100 px-5 py-3 rounded-full text-sm outline-none border-2 border-transparent focus:border-orange-500 transition-all" />
          <button type="submit" disabled={!input.trim() || loading} className="bg-orange-600 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-90"><i className="fa-solid fa-paper-plane"></i></button>
        </form>
      </footer>

      {/* Overlays */}
      {view === 'profiles' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="My Pack" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <button onClick={() => setView('add')} className="w-full py-4 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-3xl mb-4">+ Add Dog</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setView('profile-detail'); }} className={`p-4 rounded-3xl border-2 flex items-center gap-4 ${activeId === p.id ? 'bg-orange-50 border-orange-500' : 'bg-white border-slate-100'}`}>
                <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border">{p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-xl text-slate-300 m-4"></i>}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-slate-800">{p.name}</h3>
                  <p className="text-xs text-slate-500">{p.breed || 'Unknown'}</p>
                </div>
                <i className="fa-solid fa-chevron-right text-slate-300 mr-2"></i>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'profile-detail' && viewedDog && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-in">
          <Header title={viewedDog.name} onBack={() => setView('profiles')} actions={
            <button onClick={() => { setFormDog(viewedDog); setView('edit-form'); }} className="px-4 bg-white/20 rounded-xl font-bold h-11 flex items-center gap-2">Edit</button>
          }/>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex items-center gap-6">
              <div className="w-32 h-32 rounded-[40px] overflow-hidden border-4 border-orange-100 shrink-0">
                {viewedDog.photo ? <img src={viewedDog.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><i className="fa-solid fa-dog text-4xl text-slate-300"></i></div>}
              </div>
              <div className="space-y-1">
                <h2 className="text-3xl font-black text-slate-800">{viewedDog.name}</h2>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">{viewedDog.breed || 'No Breed Info'}</p>
                <div className="flex gap-2 mt-2">
                   <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black uppercase text-slate-500">{viewedDog.age || '?'} yrs</span>
                   <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black uppercase text-slate-500">{viewedDog.weight || '?'} kg</span>
                </div>
              </div>
            </div>

            <button onClick={() => { setActiveId(viewedDog.id); setView('chat'); }} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg shadow-orange-600/20">Talk to Expert about {viewedDog.name}</button>

            <SectionHeader title="Vaccinations" />
            <div className="space-y-2">
              {viewedDog.vaccinations.length === 0 && <p className="text-xs text-slate-400 italic">No records added.</p>}
              {viewedDog.vaccinations.map(v => (
                <div key={v.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center">
                  <span className="font-bold text-slate-800">{v.title}</span>
                  <span className="text-[10px] font-black text-slate-400">{v.date}</span>
                </div>
              ))}
            </div>

            <SectionHeader title="Reminders" />
            <div className="space-y-2">
              {viewedDog.reminders.length === 0 && <p className="text-xs text-slate-400 italic">No upcoming reminders.</p>}
              {viewedDog.reminders.map(r => (
                <div key={r.id} className="p-4 bg-orange-50 rounded-2xl flex justify-between items-center border border-orange-100">
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-calendar-day text-orange-600"></i>
                    <span className="font-bold text-slate-800">{r.title}</span>
                  </div>
                  <span className="text-[10px] font-black text-orange-600">{r.date}</span>
                </div>
              ))}
            </div>
            <div className="h-10"></div>
          </div>
        </div>
      )}

      {(view === 'add-form' || view === 'edit-form') && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <Header title="Details" onBack={() => setView('profiles')} />
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 rounded-[40px] bg-slate-100 border-2 overflow-hidden shadow-inner flex items-center justify-center">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-camera text-slate-300 text-2xl"></i>}
              </div>
              <button onClick={() => setView('form-scan')} className="px-6 py-2 bg-orange-600 text-white rounded-full font-black text-[10px] uppercase">Snap Photo</button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-2">Name *</label>
                <input type="text" value={formDog.name} onChange={e => setFormDog(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl border focus:border-orange-500 outline-none" placeholder="Required" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-2">Breed</label>
                <input type="text" value={formDog.breed} onChange={e => setFormDog(p => ({ ...p, breed: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl border" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block ml-2">Age</label>
                <input type="text" value={formDog.age} onChange={e => setFormDog(p => ({ ...p, age: e.target.value }))} className="w-full p-4 bg-slate-50 rounded-2xl border" placeholder="e.g. 5" />
              </div>
            </div>

            <SectionHeader title="Vaccinations" onAdd={() => addRecord('vaccinations')} />
            <div className="space-y-2">
              {formDog.vaccinations?.map(v => (
                <div key={v.id} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-xs">
                  <span>{v.title}</span>
                  <span className="text-slate-400">{v.date}</span>
                </div>
              ))}
            </div>

            <SectionHeader title="Future Reminders" onAdd={() => addRecord('reminders')} />
            <div className="space-y-2">
              {formDog.reminders?.map(r => (
                <div key={r.id} className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex justify-between items-center text-xs">
                  <span className="font-bold text-orange-700">{r.title}</span>
                  <span className="text-orange-400">{r.date}</span>
                </div>
              ))}
            </div>

            <button onClick={saveForm} className="w-full py-5 bg-orange-600 text-white rounded-3xl font-black shadow-xl shadow-orange-600/20 mt-8">Save Profile</button>
            <div className="h-10"></div>
          </div>
        </div>
      )}

      {view === 'add' && (
        <div className="fixed inset-0 z-[105] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center animate-in">
          <div className="bg-white w-full rounded-t-[40px] px-8 py-10 space-y-6">
            <h2 className="text-xl font-black text-center">New Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setView('scan')} className="p-6 border-2 rounded-3xl flex flex-col items-center gap-2 hover:border-orange-500"><i className="fa-solid fa-camera text-2xl text-orange-600"></i><span className="text-xs font-bold">Scan & ID</span></button>
              <button onClick={() => { setFormDog({ name: '', breed: '', vaccinations: [], procedures: [], reminders: [] }); setView('add-form'); }} className="p-6 border-2 rounded-3xl flex flex-col items-center gap-2 hover:border-orange-500"><i className="fa-solid fa-keyboard text-2xl text-slate-400"></i><span className="text-xs font-bold">Manual</span></button>
            </div>
            <button onClick={() => setView('profiles')} className="w-full py-2 text-slate-400 font-bold">Cancel</button>
          </div>
        </div>
      )}

      {view === 'scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog({ name: '', breed, photo, vaccinations: [], procedures: [], reminders: [] }); setView('add-form'); }} onClose={() => setView('add')} />}
      {view === 'form-scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog(p => ({ ...p, breed: breed || p.breed, photo })); setView('edit-form'); }} onClose={() => setView('edit-form')} />}
    </div>
  );
};

export default App;