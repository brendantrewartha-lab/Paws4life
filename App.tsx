import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { DogProfile, Message, UserLocation } from './types';

// Global declaration for Leaflet
declare const L: any;

// --- Components ---

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
      <header className="bg-orange-600 text-white shadow-lg">
        <div style={{ height: 'env(safe-area-inset-top)' }}></div>
        <div className="px-4 py-4 flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2 text-lg"><i className="fa-solid fa-map-pin"></i> Nearby Services</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors"><i className="fa-solid fa-xmark text-2xl"></i></button>
        </div>
      </header>
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ inlineData: { data: base64, mimeType: 'image/jpeg' } }, { text: "Identify the dog breed in this image. Answer with ONLY the breed name." }] }
      });
      onResult(res.text?.trim() || "Unknown Breed", `data:image/jpeg;base64,${base64}`);
    } catch (e) {
      alert("AI Analysis Error. Defaulting to manual.");
      onResult("", `data:image/jpeg;base64,${base64}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute inset-0 border-[60px] border-black/50 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-64 border-2 border-white/50 rounded-3xl relative">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-orange-500 -ml-1 -mt-1 rounded-tl-lg"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-orange-500 -mr-1 -mt-1 rounded-tr-lg"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-orange-500 -ml-1 -mb-1 rounded-bl-lg"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-orange-500 -mr-1 -mb-1 rounded-br-lg"></div>
        </div>
      </div>
      <button 
        onClick={onClose} 
        className="absolute right-6 text-white p-4 bg-black/40 rounded-full backdrop-blur-md"
        style={{ top: 'calc(1.5rem + env(safe-area-inset-top))' }}
      >
        <i className="fa-solid fa-xmark text-xl"></i>
      </button>
      <div 
        className="absolute w-full flex flex-col items-center gap-4"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        <button onClick={capture} disabled={analyzing} className="w-20 h-20 rounded-full border-4 border-white bg-orange-600 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
          {analyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-12 h-12 bg-white rounded-full"></div>}
        </button>
        <p className="text-white font-bold tracking-wide drop-shadow-md">{analyzing ? 'IDENTIFYING BREED...' : 'SNAP PHOTO'}</p>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v11_profiles') || '[]'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v11_active'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'profiles' | 'add' | 'scan' | 'form-scan' | 'add-form' | 'map'>('chat');
  const [location, setLocation] = useState<UserLocation>();
  
  // Profile Form State
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ name: '', breed: '', age: '', weight: '', photo: '' });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentDog = profiles.find(p => p.id === activeId) || null;

  useEffect(() => {
    localStorage.setItem('paws_v11_profiles', JSON.stringify(profiles));
    if (activeId) localStorage.setItem('paws_v11_active', activeId);
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
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const context = currentDog ? `User dog: ${currentDog.name}, ${currentDog.breed}, ${currentDog.age}, ${currentDog.weight}.` : "No specific dog selected.";
      const isLocRequest = input.toLowerCase().match(/near|vet|park|clinic|where/);
      
      const response = await ai.models.generateContent({
        model: (location && isLocRequest) ? 'gemini-2.5-flash' : 'gemini-3-flash-preview',
        contents: messages.concat(userMsg).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
          systemInstruction: `You are paws4life.ai, a specialized canine expert. ${context} Be factual, helpful, and prioritize dog safety.`,
          tools: (isLocRequest && location) ? [{ googleSearch: {} }, { googleMaps: {} }] : [{ googleSearch: {} }],
        }
      });

      const text = response.text || "I'm having trouble thinking clearly. Please try again.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ title: c.web?.title || c.maps?.title || 'Info', uri: c.web?.uri || c.maps?.uri || '#' })) || [];

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "⚠️ Connection Error. Ensure your API Key is valid.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDog = () => {
    if (!formDog.name || !formDog.breed) {
      alert("Name and Breed are required!");
      return;
    }
    const newDog: DogProfile = {
      id: Date.now().toString(),
      name: formDog.name || '',
      breed: formDog.breed || '',
      age: formDog.age || '',
      weight: formDog.weight || '',
      photo: formDog.photo || ''
    };
    setProfiles(prev => [...prev, newDog]);
    setActiveId(newDog.id);
    setView('chat');
    setFormDog({ name: '', breed: '', age: '', weight: '', photo: '' });
  };

  const deleteProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const PhotoSelector: React.FC = () => (
    <div className="flex flex-col items-center gap-2">
      <div className="w-32 h-32 rounded-[40px] bg-white border-2 border-slate-200 overflow-hidden relative shadow-md group">
        {formDog.photo ? (
          <img src={formDog.photo} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
            <i className="fa-solid fa-dog text-3xl mb-1"></i>
            <span className="text-[10px] font-black">NO PHOTO</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
          <i className="fa-solid fa-camera text-white text-xl"></i>
        </div>
      </div>
      <div className="flex gap-2 mt-1">
        <button 
          onClick={() => setView('form-scan')}
          className="text-[10px] font-black uppercase bg-orange-100 text-orange-600 px-3 py-1.5 rounded-full hover:bg-orange-200 transition-colors"
        >
          <i className="fa-solid fa-camera mr-1"></i> Take Photo
        </button>
        <label className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full hover:bg-slate-200 transition-colors cursor-pointer">
          <i className="fa-solid fa-upload mr-1"></i> Upload
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (re) => setFormDog(p => ({ ...p, photo: re.target?.result as string }));
                    reader.readAsDataURL(file);
                }
            }}
          />
        </label>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden font-sans">
      {/* Header with Physical Safe Area Spacer */}
      <header className="bg-orange-600 text-white shadow-xl z-[60]">
        <div style={{ height: 'env(safe-area-inset-top)' }}></div>
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 w-10 h-10 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <i className="fa-solid fa-paw text-xl text-white"></i>
            </div>
            <div>
              <h1 className="text-xl font-black italic tracking-tighter">paws4life<span className="text-orange-200">.ai</span></h1>
              {currentDog && <div className="text-[10px] font-bold text-orange-200 uppercase tracking-widest bg-black/10 px-2 rounded-full inline-block">Talking about: {currentDog.name}</div>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('map')} title="Map View" className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"><i className="fa-solid fa-map-location-dot"></i></button>
            <button onClick={() => setView('profiles')} title="My Pack" className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"><i className="fa-solid fa-dog"></i></button>
          </div>
        </div>
      </header>

      {/* Main Chat */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6">
            <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 shadow-inner">
              <i className="fa-solid fa-shield-dog text-4xl"></i>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-800">Canine Expert AI</h2>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[260px]">Ask about health, behavior, or local services for your pack.</p>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[90%] p-4 rounded-3xl shadow-sm text-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (
                    <a key={i} href={u.uri} target="_blank" rel="noopener" className="text-[10px] bg-slate-50 text-orange-600 px-3 py-1.5 rounded-xl border border-slate-100 font-black hover:bg-orange-100 transition-colors">
                      <i className="fa-solid fa-link mr-1"></i> {u.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="p-4 bg-white rounded-3xl border shadow-sm w-20 flex gap-1 justify-center animate-pulse"><div className="w-2 h-2 bg-orange-300 rounded-full"></div><div className="w-2 h-2 bg-orange-300 rounded-full"></div><div className="w-2 h-2 bg-orange-300 rounded-full"></div></div>}
        <div ref={scrollRef} />
      </main>

      {/* Input Group with Safe Area Bottom */}
      <footer 
        className="px-4 pt-4 bg-white border-t border-slate-100 sticky bottom-0 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <form onSubmit={sendMessage} className="flex gap-3">
          <input 
            type="text" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder={currentDog ? `Ask about ${currentDog.name}...` : "Type a pet health question..."} 
            className="flex-1 bg-slate-100 p-4 rounded-3xl text-sm outline-none border-2 border-transparent focus:border-orange-500 transition-all focus:bg-white" 
          />
          <button 
            type="submit" 
            disabled={!input.trim() || loading} 
            className="bg-orange-600 text-white w-14 h-14 rounded-3xl shadow-xl shadow-orange-600/30 flex items-center justify-center shrink-0 active:scale-95 disabled:bg-slate-200 disabled:shadow-none transition-all"
          >
            <i className="fa-solid fa-paper-plane text-xl"></i>
          </button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {/* 1. Pack List */}
      {view === 'profiles' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white shadow-lg">
            <div style={{ height: 'env(safe-area-inset-top)' }}></div>
            <div className="px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-black italic tracking-tight"><i className="fa-solid fa-dog mr-2"></i> My Pack</h2>
              <button onClick={() => setView('chat')} className="p-2 hover:bg-white/20 rounded-full transition-colors"><i className="fa-solid fa-xmark text-2xl"></i></button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <button onClick={() => setView('add')} className="w-full py-4 rounded-3xl border-2 border-dashed border-orange-300 bg-orange-50 text-orange-600 font-black text-lg hover:bg-orange-100 transition-all flex items-center justify-center gap-2 mb-4">
              <i className="fa-solid fa-plus"></i> Add New Dog
            </button>
            {profiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-12 space-y-4 text-slate-300">
                <i className="fa-solid fa-bone text-6xl opacity-20"></i>
                <p className="font-bold">Your pack is empty!</p>
              </div>
            ) : (
              profiles.map(p => (
                <div key={p.id} className={`p-4 rounded-3xl border-2 transition-all flex items-center gap-4 ${activeId === p.id ? 'bg-orange-50 border-orange-500 shadow-sm' : 'bg-white border-slate-100 hover:border-orange-200'}`}>
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100 shadow-inner">
                    {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-4xl text-slate-300 mt-4 ml-4"></i>}
                  </div>
                  <div className="flex-1 min-w-0" onClick={() => { setActiveId(p.id); setView('chat'); }}>
                    <h3 className="font-black text-slate-800 text-lg truncate">{p.name}</h3>
                    <p className="text-sm text-slate-500 italic font-medium truncate">{p.breed}</p>
                    <div className="flex gap-2 mt-2">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{p.age || 'Age?'}</span>
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{p.weight || 'Weight?'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => deleteProfile(p.id)} className="p-3 text-slate-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash-can"></i></button>
                    {activeId !== p.id && (
                        <button onClick={() => { setActiveId(p.id); setView('chat'); }} className="text-[10px] font-black uppercase text-orange-600 tracking-tighter">Switch To</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2. Step Selector with Safe Area Bottom */}
      {view === 'add' && (
        <div className="fixed inset-0 z-[105] bg-slate-900/80 backdrop-blur-sm flex items-end justify-center animate-in">
          <div 
            className="bg-white w-full max-w-xl rounded-t-[40px] px-8 pt-8 pb-4 slide-in-up"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          >
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>
            <h2 className="text-2xl font-black text-slate-800 text-center mb-6">New Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setView('scan')}
                className="flex flex-col items-center gap-3 p-6 rounded-3xl border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 transition-all"
              >
                <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><i className="fa-solid fa-camera text-2xl"></i></div>
                <span className="font-bold text-slate-800">Scan & ID</span>
                <span className="text-[10px] text-slate-400 text-center leading-tight">AI breed identification</span>
              </button>
              <button 
                onClick={() => { setFormDog({ name: '', breed: '', age: '', weight: '', photo: '' }); setView('add-form'); }}
                className="flex flex-col items-center gap-3 p-6 rounded-3xl border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 transition-all"
              >
                <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center text-white shadow-lg"><i className="fa-solid fa-keyboard text-2xl"></i></div>
                <span className="font-bold text-slate-800">Manual Entry</span>
                <span className="text-[10px] text-slate-400 text-center leading-tight">Start from scratch</span>
              </button>
            </div>
            <button onClick={() => setView('profiles')} className="w-full py-4 text-slate-400 font-bold hover:text-slate-800 transition-colors mt-4">Cancel</button>
          </div>
        </div>
      )}

      {/* 3. Detail Form */}
      {view === 'add-form' && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <header className="bg-slate-50 border-b">
            <div style={{ height: 'env(safe-area-inset-top)' }}></div>
            <div className="flex justify-between items-center px-6 py-4">
              <h2 className="text-xl font-black text-slate-800">Pet Details</h2>
              <button onClick={() => setView('profiles')} className="p-2 text-slate-400 hover:text-slate-800"><i className="fa-solid fa-xmark text-2xl"></i></button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <PhotoSelector />
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Name</label>
                <input 
                  type="text" 
                  value={formDog.name} 
                  onChange={e => setFormDog(p => ({ ...p, name: e.target.value }))} 
                  placeholder="e.g. Buddy" 
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none transition-all font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Breed</label>
                <input 
                  type="text" 
                  value={formDog.breed} 
                  onChange={e => setFormDog(p => ({ ...p, breed: e.target.value }))} 
                  placeholder="e.g. Golden Retriever" 
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none transition-all font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Age</label>
                  <input 
                    type="text" 
                    value={formDog.age} 
                    onChange={e => setFormDog(p => ({ ...p, age: e.target.value }))} 
                    placeholder="e.g. 3 years" 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none transition-all font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Weight</label>
                  <input 
                    type="text" 
                    value={formDog.weight} 
                    onChange={e => setFormDog(p => ({ ...p, weight: e.target.value }))} 
                    placeholder="e.g. 25kg" 
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-orange-500 outline-none transition-all font-bold"
                  />
                </div>
              </div>
            </div>
            <button 
              onClick={handleSaveDog}
              className="w-full py-5 bg-orange-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-orange-600/30 active:scale-95 transition-all"
            >
              Save Profile
            </button>
            <div style={{ height: 'env(safe-area-inset-bottom)' }}></div>
          </div>
        </div>
      )}

      {/* Overlays for Camera */}
      {view === 'scan' && (
        <ScannerOverlay 
            onResult={(breed, photo) => {
                setFormDog({ breed, photo, name: '' });
                setView('add-form');
            }} 
            onClose={() => setView('add')} 
        />
      )}
      {view === 'form-scan' && (
        <ScannerOverlay 
            onResult={(breed, photo) => {
                setFormDog(prev => ({ ...prev, photo, breed: breed || prev.breed }));
                setView('add-form');
            }} 
            onClose={() => setView('add-form')} 
        />
      )}

      {/* Map Overlay */}
      {view === 'map' && <MapOverlay location={location} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;