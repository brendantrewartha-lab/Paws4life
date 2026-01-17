import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { DogProfile, Message, UserLocation } from './types';

// Global declaration for Leaflet
declare const L: any;

// --- Helper Components ---

const Header: React.FC<{ title: string; onBack?: () => void; actions?: React.ReactNode }> = ({ title, onBack, actions }) => (
  <header className="bg-orange-600 text-white shadow-xl z-[60] shrink-0">
    <div style={{ height: 'max(env(safe-area-inset-top), 44px)' }} className="w-full"></div>
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
        <div>
          <h1 className="text-xl font-black italic tracking-tighter leading-tight">
            {title === "paws4life" ? (<>paws4life<span className="text-orange-200">.ai</span></>) : title}
          </h1>
        </div>
      </div>
      <div className="flex gap-2">
        {actions}
      </div>
    </div>
  </header>
);

const MapOverlay: React.FC<{ location: UserLocation | undefined; onClose: () => void }> = ({ location, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    const map = L.map(mapRef.current).setView([location.latitude, location.longitude], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const userIcon = L.divIcon({ html: '<div class="bg-blue-600 w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>', iconSize: [16, 16] });
    L.marker([location.latitude, location.longitude], { icon: userIcon }).addTo(map).bindPopup("You are here");
    return () => map.remove();
  }, [location]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
      <Header title="Nearby Services" onBack={onClose} />
      <div ref={mapRef} className="flex-1" />
    </div>
  );
};

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
      <div className="absolute inset-0 border-[60px] border-black/50 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-64 border-2 border-white/30 rounded-3xl relative">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-orange-500 -ml-1 -mt-1 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-orange-500 -mr-1 -mt-1 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-orange-500 -ml-1 -mb-1 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-orange-500 -mr-1 -mb-1 rounded-br-lg"></div>
        </div>
      </div>
      <button onClick={onClose} className="absolute right-6 top-16 text-white p-4 bg-black/40 rounded-full backdrop-blur-md">
        <i className="fa-solid fa-xmark text-xl"></i>
      </button>
      <div className="absolute bottom-20 w-full flex flex-col items-center gap-4">
        <button onClick={capture} disabled={analyzing} className="w-20 h-20 rounded-full border-4 border-white bg-orange-600 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
          {analyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-12 h-12 bg-white rounded-full"></div>}
        </button>
        <p className="text-white font-bold tracking-wide drop-shadow-md text-sm">{analyzing ? 'IDENTIFYING...' : 'CAPTURE'}</p>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v12_profiles') || '[]'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v12_active'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'profiles' | 'add' | 'scan' | 'form-scan' | 'add-form' | 'edit-form' | 'map'>('chat');
  const [location, setLocation] = useState<UserLocation>();
  
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ name: '', breed: '', age: '', weight: '', photo: '', vaccinations: '', procedures: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentDog = profiles.find(p => p.id === activeId) || null;

  useEffect(() => {
    localStorage.setItem('paws_v12_profiles', JSON.stringify(profiles));
    if (activeId) localStorage.setItem('paws_v12_active', activeId);
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
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API KEY MISSING");

      const ai = new GoogleGenAI({ apiKey });
      const context = currentDog ? 
        `User dog: ${currentDog.name}, ${currentDog.breed}, ${currentDog.age}, ${currentDog.weight}. 
         Vaccinations: ${currentDog.vaccinations || 'None listed'}. 
         History: ${currentDog.procedures || 'None listed'}.` : "No specific dog context.";
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: updatedHistory.map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: `You are paws4life.ai, a specialized canine expert. ${context} Be helpful, prioritize dog safety.`,
          tools: [{ googleSearch: {} }],
        }
      });

      const text = response.text || "I'm having trouble thinking clearly. Please try again.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ 
        title: c.web?.title || c.maps?.title || 'Knowledge Source', 
        uri: c.web?.uri || c.maps?.uri || '#' 
      })) || [];

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err) {
      console.error("Gemini Error:", err);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "⚠️ Connection Error. Ensure your internet is active and API key is valid.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDog = () => {
    if (!formDog.name || !formDog.breed) {
      alert("Name and Breed are required!");
      return;
    }
    const dogData: DogProfile = {
      id: editingId || Date.now().toString(),
      name: formDog.name || '',
      breed: formDog.breed || '',
      age: formDog.age || '',
      weight: formDog.weight || '',
      photo: formDog.photo || '',
      vaccinations: formDog.vaccinations || '',
      procedures: formDog.procedures || ''
    };

    if (editingId) {
      setProfiles(prev => prev.map(p => p.id === editingId ? dogData : p));
      setEditingId(null);
    } else {
      setProfiles(prev => [...prev, dogData]);
      setActiveId(dogData.id);
    }
    setView('chat');
    setFormDog({ name: '', breed: '', age: '', weight: '', photo: '', vaccinations: '', procedures: '' });
  };

  const startEdit = (p: DogProfile) => {
    setEditingId(p.id);
    setFormDog({ ...p });
    setView('edit-form');
  };

  const deleteProfile = (id: string) => {
    if(confirm("Remove this dog from your pack?")) {
      setProfiles(prev => prev.filter(p => p.id !== id));
      if (activeId === id) setActiveId(null);
    }
  };

  const PhotoSelector: React.FC = () => (
    <div className="flex flex-col items-center gap-3">
      <div className="w-32 h-32 rounded-[40px] bg-white border-2 border-slate-200 overflow-hidden relative shadow-lg">
        {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-300"><i className="fa-solid fa-dog text-4xl mb-2"></i><span className="text-[10px] font-black">NO PHOTO</span></div>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setView('form-scan')} className="px-4 py-2 bg-orange-600 text-white text-[10px] font-black rounded-full uppercase"><i className="fa-solid fa-camera mr-1"></i> Scan</button>
        <label className="px-4 py-2 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full uppercase cursor-pointer">
          <i className="fa-solid fa-upload mr-1"></i> Upload
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
  );

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden font-sans">
      <Header 
        title="paws4life" 
        actions={
          <>
            <button onClick={() => setView('map')} className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"><i className="fa-solid fa-map-location-dot"></i></button>
            <button onClick={() => setView('profiles')} className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"><i className="fa-solid fa-dog"></i></button>
          </>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 shadow-inner"><i className="fa-solid fa-shield-dog text-3xl"></i></div>
            <h2 className="text-xl font-black text-slate-800">Expert Dog Care</h2>
            <p className="text-sm text-slate-400 max-w-[240px]">Ask about health, breed info, or find local dog-friendly spots.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[85%] p-4 rounded-3xl shadow-sm text-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap leading-relaxed prose prose-sm">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (
                    <a key={i} href={u.uri} target="_blank" rel="noopener" className="text-[10px] bg-slate-50 text-orange-600 px-2 py-1 rounded-lg font-bold border"><i className="fa-solid fa-link mr-1"></i> {u.title}</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="p-3 bg-white border rounded-2xl w-16 flex gap-1 justify-center animate-pulse"><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-300 rounded-full"></div></div>}
        <div ref={scrollRef} />
      </main>

      <footer className="px-4 py-4 bg-white border-t sticky bottom-0 z-50 shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={currentDog ? `Message about ${currentDog.name}...` : "Ask a question..."} className="flex-1 bg-slate-100 px-5 py-3 rounded-full text-sm outline-none border-2 border-transparent focus:border-orange-500 transition-all" />
          <button type="submit" disabled={!input.trim() || loading} className="bg-orange-600 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-90 disabled:opacity-50 transition-all"><i className="fa-solid fa-paper-plane"></i></button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="My Pack" onBack={() => setView('chat')} />
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <button onClick={() => { setFormDog({}); setView('add'); }} className="w-full py-4 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-3xl flex items-center justify-center gap-2 mb-4 hover:bg-orange-100 transition-colors">
              <i className="fa-solid fa-plus"></i> Add New Dog
            </button>
            {profiles.length === 0 ? (
              <div className="text-center p-12 text-slate-300 font-bold">Pack is empty!</div>
            ) : (
              profiles.map(p => (
                <div key={p.id} className={`p-4 rounded-3xl border-2 flex items-center gap-4 ${activeId === p.id ? 'bg-orange-50 border-orange-500' : 'bg-white border-slate-100'}`}>
                  <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 border">{p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-2xl text-slate-300 mt-4 ml-4"></i>}</div>
                  <div className="flex-1 min-w-0" onClick={() => { setActiveId(p.id); setView('chat'); }}>
                    <h3 className="font-black text-slate-800 text-base truncate">{p.name}</h3>
                    <p className="text-xs text-slate-500 italic truncate">{p.breed} • {p.age || '?'}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(p)} className="p-3 text-slate-400 hover:text-orange-600"><i className="fa-solid fa-pen-to-square"></i></button>
                    <button onClick={() => deleteProfile(p.id)} className="p-3 text-slate-400 hover:text-red-500"><i className="fa-solid fa-trash-can"></i></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {view === 'add' && (
        <div className="fixed inset-0 z-[105] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center animate-in">
          <div className="bg-white w-full max-w-xl rounded-t-[40px] px-8 pt-8 pb-10 shadow-2xl">
            <h2 className="text-xl font-black text-slate-800 text-center mb-6">Create Profile</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button onClick={() => setView('scan')} className="p-6 rounded-3xl border-2 hover:border-orange-500 flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-orange-600 rounded-2xl flex items-center justify-center text-white"><i className="fa-solid fa-camera text-xl"></i></div>
                <span className="font-bold text-xs">Scan Dog</span>
              </button>
              <button onClick={() => { setFormDog({}); setView('add-form'); }} className="p-6 rounded-3xl border-2 hover:border-orange-500 flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-white"><i className="fa-solid fa-keyboard text-xl"></i></div>
                <span className="font-bold text-xs">Manual Entry</span>
              </button>
            </div>
            <button onClick={() => setView('profiles')} className="w-full text-slate-400 font-bold">Cancel</button>
          </div>
        </div>
      )}

      {(view === 'add-form' || view === 'edit-form') && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <Header title={editingId ? "Edit Profile" : "Dog Details"} onBack={() => setView('profiles')} />
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <PhotoSelector />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" value={formDog.name} onChange={e => setFormDog(p => ({ ...p, name: e.target.value }))} placeholder="Dog Name" className="p-4 bg-slate-50 border rounded-2xl font-bold" />
                <input type="text" value={formDog.breed} onChange={e => setFormDog(p => ({ ...p, breed: e.target.value }))} placeholder="Breed" className="p-4 bg-slate-50 border rounded-2xl font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" value={formDog.age} onChange={e => setFormDog(p => ({ ...p, age: e.target.value }))} placeholder="Age (e.g. 4 yrs)" className="p-4 bg-slate-50 border rounded-2xl font-bold" />
                <input type="text" value={formDog.weight} onChange={e => setFormDog(p => ({ ...p, weight: e.target.value }))} placeholder="Weight (e.g. 25kg)" className="p-4 bg-slate-50 border rounded-2xl font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Vaccination History</label>
                <textarea value={formDog.vaccinations} onChange={e => setFormDog(p => ({ ...p, vaccinations: e.target.value }))} placeholder="List vaccines (Rabies, Parvo, etc.)" className="w-full p-4 bg-slate-50 border rounded-2xl min-h-[80px]" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Procedures & Health History</label>
                <textarea value={formDog.procedures} onChange={e => setFormDog(p => ({ ...p, procedures: e.target.value }))} placeholder="Spay/Neuter, Surgeries, Medications..." className="w-full p-4 bg-slate-50 border rounded-2xl min-h-[80px]" />
              </div>
            </div>
            <button onClick={handleSaveDog} className="w-full py-5 bg-orange-600 text-white rounded-3xl font-black shadow-xl shadow-orange-600/20 active:scale-95 transition-all">Save {formDog.name || 'Dog'}</button>
            <div className="h-10" />
          </div>
        </div>
      )}

      {view === 'scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog({ breed, photo, name: '' }); setView('add-form'); }} onClose={() => setView('add')} />}
      {view === 'form-scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog(prev => ({ ...prev, photo, breed: breed || prev.breed })); setView(editingId ? 'edit-form' : 'add-form'); }} onClose={() => setView(editingId ? 'edit-form' : 'add-form')} />}
      {view === 'map' && <MapOverlay location={location} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;