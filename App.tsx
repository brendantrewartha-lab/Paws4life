import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { DogProfile, Message, UserLocation, HealthRecord, DogReminder, UserProfile } from './types';

// Declare L for Leaflet map integration
declare const L: any;

// --- Helper Components ---

const Header: React.FC<{ title: string; onBack?: () => void; actions?: React.ReactNode }> = ({ title, onBack, actions }) => (
  <header className="bg-orange-600 text-white shadow-xl z-[60] shrink-0 border-b border-orange-500/30">
    <div style={{ height: 'max(env(safe-area-inset-top), 44px)' }} className="w-full bg-orange-700/20"></div>
    <div className="px-4 pb-4 flex items-center justify-between min-h-[64px]">
      <div className="flex items-center gap-2.5">
        {onBack ? (
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl active:scale-90 transition-all">
            <i className="fa-solid fa-chevron-left text-lg"></i>
          </button>
        ) : (
          <div className="bg-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner">
            <i className="fa-solid fa-paw text-xl text-orange-600"></i>
          </div>
        )}
        <h1 className="text-xl font-black italic tracking-tighter leading-tight truncate max-w-[130px]">
          {title === "paws4life" ? (<>paws4life<span className="text-orange-200">.ai</span></>) : title}
        </h1>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

interface RecordFormProps {
  type: 'vaccinations' | 'reminders';
  onSave: (title: string, date: string) => void;
  onClose: () => void;
}
const RecordForm: React.FC<RecordFormProps> = ({ type, onSave, onClose }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center animate-in p-4">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
          <i className={type === 'vaccinations' ? 'fa-solid fa-syringe text-blue-500' : 'fa-solid fa-calendar-plus text-orange-500'}></i>
          {type === 'vaccinations' ? 'New Vaccination' : 'New Reminder'}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Description</label>
            <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold focus:border-orange-500 outline-none" placeholder="Rabies, Checkup, etc." />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Pick Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold focus:border-orange-500 outline-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-8">
          <button onClick={onClose} className="flex-1 py-4 text-slate-400 font-bold uppercase tracking-widest text-xs">Cancel</button>
          <button onClick={() => { if (title) onSave(title, date); }} className="flex-[2] py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg shadow-orange-600/20">Save Entry</button>
        </div>
      </div>
    </div>
  );
};

// --- Map View Component ---
const MapView: React.FC<{ location?: UserLocation; onRefreshLocation: () => void; onClose: () => void }> = ({ location, onRefreshLocation, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    
    // Clear previous instance if any
    if (mapInstance.current) {
        mapInstance.current.remove();
    }

    // Initialize map with CartoDB Voyager High-Res Tiles
    mapInstance.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false
    }).setView([location.latitude, location.longitude], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(mapInstance.current);

    // Custom Icons
    const userIcon = L.divIcon({ 
        html: '<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>', 
        iconSize: [24, 24], 
        className: 'user-marker' 
    });
    
    const vetIcon = L.divIcon({ 
        html: '<div class="w-10 h-10 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-2 border-white"><i class="fa-solid fa-hospital"></i></div>', 
        iconSize: [40, 40], 
        className: 'vet-marker' 
    });

    const parkIcon = L.divIcon({ 
        html: '<div class="w-10 h-10 bg-green-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-2 border-white"><i class="fa-solid fa-tree"></i></div>', 
        iconSize: [40, 40], 
        className: 'park-marker' 
    });

    L.marker([location.latitude, location.longitude], { icon: userIcon }).addTo(mapInstance.current).bindPopup('<b class="text-orange-600">You are here</b>');
    
    // Simulated interesting spots
    const poi = [
        { lat: location.latitude + 0.003, lng: location.longitude + 0.002, name: 'Paws Veterinary Clinic', type: 'vet' },
        { lat: location.latitude - 0.002, lng: location.longitude - 0.004, name: 'Bark Park Reserve', type: 'park' },
        { lat: location.latitude + 0.006, lng: location.longitude - 0.001, name: 'The Happy Tail Groomers', type: 'vet' },
        { lat: location.latitude - 0.005, lng: location.longitude + 0.005, name: 'Canine Meadows', type: 'park' },
    ];

    poi.forEach(spot => {
        L.marker([spot.lat, spot.lng], { icon: spot.type === 'vet' ? vetIcon : parkIcon })
          .addTo(mapInstance.current)
          .bindPopup(`<b>${spot.name}</b><br><span class="text-slate-400 capitalize">${spot.type}</span>`);
    });

    return () => { if (mapInstance.current) mapInstance.current.remove(); };
  }, [location]);

  return (
    <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-in">
      <Header title="Local Services" onBack={onClose} />
      <div className="flex-1 relative bg-slate-50">
        {!location ? (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center p-12 text-center space-y-6">
            <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 animate-bounce">
              <i className="fa-solid fa-location-dot text-4xl"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">Location Access Required</h3>
              <p className="text-sm text-slate-400 leading-relaxed">We need your location to show nearby vets, groomers, and dog-friendly parks.</p>
            </div>
            <button 
              onClick={onRefreshLocation} 
              className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-xl shadow-orange-600/20 active:scale-95 transition-all"
            >
              Allow Access
            </button>
          </div>
        ) : (
            <>
                <div ref={mapRef} className="h-full w-full" id="map"></div>
                <button 
                    onClick={onRefreshLocation}
                    className="absolute bottom-6 right-6 z-[160] w-14 h-14 bg-white text-orange-600 rounded-2xl shadow-2xl flex items-center justify-center active:scale-90 transition-all border border-slate-100"
                >
                    <i className="fa-solid fa-location-crosshairs text-xl"></i>
                </button>
            </>
        )}
      </div>
      <footer className="p-4 flex gap-3 overflow-x-auto scrollbar-hide bg-white border-t border-slate-100">
        <div className="px-5 py-3 bg-blue-50 text-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2 border border-blue-100">
          <div className="w-2 h-2 bg-blue-600 rounded-full"></div> Vets
        </div>
        <div className="px-5 py-3 bg-green-50 text-green-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2 border border-green-100">
            <div className="w-2 h-2 bg-green-600 rounded-full"></div> Parks
        </div>
        <div className="px-5 py-3 bg-orange-50 text-orange-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2 border border-orange-100">
            <div className="w-2 h-2 bg-orange-600 rounded-full"></div> Grooming
        </div>
      </footer>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v15_profiles') || '[]'));
  const [user, setUser] = useState<UserProfile>(() => JSON.parse(localStorage.getItem('paws_v15_user') || '{"name":"","email":"","phone":""}'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v15_active'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'profiles' | 'profile-detail' | 'add' | 'scan' | 'form-scan' | 'edit-form' | 'map' | 'add-form' | 'reminders-list' | 'settings'>('chat');
  const [location, setLocation] = useState<UserLocation>();
  const [recordForm, setRecordForm] = useState<{type: 'vaccinations' | 'reminders'} | null>(null);
  
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ name: '', breed: '', age: '', weight: '', photo: '', vaccinations: [], procedures: [], reminders: [] });
  const [viewId, setViewId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentDog = profiles.find(p => p.id === activeId) || null;
  const viewedDog = profiles.find(p => p.id === viewId) || null;

  const todayStr = new Date().toISOString().split('T')[0];
  const activeReminders = profiles.flatMap(p => p.reminders).filter(r => r.date >= todayStr);

  useEffect(() => {
    localStorage.setItem('paws_v15_profiles', JSON.stringify(profiles));
    localStorage.setItem('paws_v15_user', JSON.stringify(user));
    if (activeId) localStorage.setItem('paws_v15_active', activeId);
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [profiles, user, activeId, messages]);

  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
          p => setLocation({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
          err => {
              console.warn("Location error:", err);
              alert("Location permission denied. Please enable it in your device settings.");
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  };

  useEffect(() => {
    requestLocation();
  }, []);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const context = currentDog ? `User Dog: ${currentDog.name} (${currentDog.breed}). Vaccs: ${currentDog.vaccinations.map(v => v.title).join(', ')}.` : "";
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [...messages, userMsg].map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
        config: { systemInstruction: `You are paws4life expert. User is ${user.name || 'Pet Owner'}. ${context} Prioritize safety.`, tools: [{ googleSearch: {} }] }
      });

      const text = response.text || "Error processing knowledge.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ title: c.web?.title || 'Source', uri: c.web?.uri || '#' })) || [];
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Connection error. Please try again.", timestamp: Date.now() }]);
    } finally { setLoading(false); }
  };

  const saveForm = () => {
    if (!formDog.name) return alert("Dog Name is required!");
    const dog: DogProfile = {
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
    if (formDog.id) setProfiles(prev => prev.map(p => p.id === dog.id ? dog : p));
    else {
      setProfiles(prev => [...prev, dog]);
      setActiveId(dog.id);
    }
    setViewId(dog.id);
    setView('profile-detail');
  };

  const removeItem = (type: 'vaccinations' | 'reminders', id: string) => {
    setFormDog(prev => ({ ...prev, [type]: (prev[type] as any[]).filter(i => i.id !== id) }));
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden font-sans">
      <Header 
        title="paws4life" 
        actions={
          <>
            <button onClick={() => setView('reminders-list')} className="relative w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-bell"></i>
              {activeReminders.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-orange-600">{activeReminders.length}</span>}
            </button>
            <button onClick={() => setView('map')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-map-location-dot"></i>
            </button>
            <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-user-gear"></i>
            </button>
            <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all">
              <i className="fa-solid fa-dog"></i>
            </button>
          </>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4"><i className="fa-solid fa-shield-dog text-2xl"></i></div>
            <p className="text-xs font-black uppercase tracking-widest">How can I help you today?</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[88%] p-4 rounded-[2rem] text-sm shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap leading-relaxed prose prose-sm">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (<a key={i} href={u.uri} target="_blank" className="text-[10px] bg-slate-50 text-orange-600 px-2 py-1 rounded-lg border font-bold">{u.title}</a>))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="p-3 bg-white border rounded-2xl w-16 flex gap-1 justify-center animate-pulse"><div className="w-1.5 h-1.5 bg-orange-200 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-200 rounded-full"></div></div>}
        <div ref={scrollRef} />
      </main>

      <footer className="px-4 py-4 bg-white border-t sticky bottom-0 z-50 shadow-md" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={currentDog ? `Chat about ${currentDog.name}...` : "Ask a question..."} className="flex-1 bg-slate-100 px-5 py-3.5 rounded-2xl text-sm outline-none border border-transparent focus:border-orange-500 transition-all" />
          <button type="submit" disabled={!input.trim() || loading} className="bg-orange-600 text-white w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center active:scale-90 transition-all"><i className="fa-solid fa-paper-plane"></i></button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="My Pack" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-4 overflow-y-auto scrollbar-hide">
            <button onClick={() => setView('add')} className="w-full py-5 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-[2rem]">Add New Dog</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setView('profile-detail'); }} className="p-4 rounded-[2rem] border-2 flex items-center gap-4 bg-white border-slate-100 active:scale-95 transition-all">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border shadow-sm">{p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-slate-300 m-4"></i>}</div>
                <div className="flex-1"><h3 className="font-black text-slate-800">{p.name}</h3><p className="text-xs text-slate-400 font-bold uppercase">{p.breed || 'Dog'}</p></div>
                <i className="fa-solid fa-chevron-right text-slate-300"></i>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="Settings" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-6 overflow-y-auto scrollbar-hide">
            <div className="space-y-4">
              <SectionHeader title="Owner Info" />
              <input type="text" value={user.name} onChange={e => setUser(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Full Name" />
              <input type="email" value={user.email} onChange={e => setUser(p => ({ ...p, email: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Email" />
              <input type="tel" value={user.phone} onChange={e => setUser(p => ({ ...p, phone: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Phone" />
            </div>
            <div className="space-y-4">
              <SectionHeader title="Social Links" />
              <div className="relative"><i className="fa-brands fa-instagram absolute left-4 top-1/2 -translate-y-1/2 text-orange-500"></i><input type="text" value={user.instagram} onChange={e => setUser(p => ({ ...p, instagram: e.target.value }))} className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold" placeholder="Instagram Username" /></div>
              <div className="relative"><i className="fa-brands fa-facebook absolute left-4 top-1/2 -translate-y-1/2 text-blue-600"></i><input type="text" value={user.facebook} onChange={e => setUser(p => ({ ...p, facebook: e.target.value }))} className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold" placeholder="Facebook URL" /></div>
            </div>
          </div>
        </div>
      )}

      {view === 'profile-detail' && viewedDog && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-in">
          <Header title={viewedDog.name} onBack={() => setView('profiles')} actions={
            <button onClick={() => { setFormDog(viewedDog); setView('edit-form'); }} className="px-5 bg-white text-orange-600 rounded-xl font-black h-10 shadow-sm">Edit</button>
          }/>
          <div className="flex-1 p-6 space-y-6 overflow-y-auto scrollbar-hide">
            <div className="flex items-center gap-6">
              <div className="w-28 h-28 rounded-[2.5rem] overflow-hidden border-4 border-orange-50 shrink-0 shadow-lg">{viewedDog.photo ? <img src={viewedDog.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-50 flex items-center justify-center"><i className="fa-solid fa-dog text-3xl text-slate-200"></i></div>}</div>
              <div><h2 className="text-3xl font-black text-slate-800">{viewedDog.name}</h2><p className="text-orange-600 font-black uppercase text-[10px] tracking-widest">{viewedDog.breed || 'Dog'}</p><p className="text-slate-400 font-bold text-xs mt-1">{viewedDog.age} Years • {viewedDog.weight} KG</p></div>
            </div>
            <button onClick={() => { setActiveId(viewedDog.id); setView('chat'); }} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg shadow-orange-600/20 active:scale-95 transition-all">Select as Active Pet</button>
            <SectionHeader title="Vaccinations" />
            <div className="space-y-3">
              {viewedDog.vaccinations.map(v => (<div key={v.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center"><span className="font-bold text-slate-800">{v.title}</span><span className="text-[10px] font-black text-slate-400">{v.date}</span></div>))}
            </div>
            <SectionHeader title="Upcoming Reminders" />
            <div className="space-y-3">
              {viewedDog.reminders.map(r => (<div key={r.id} className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex justify-between items-center"><div className="flex items-center gap-2"><i className="fa-solid fa-bell text-orange-600 text-xs"></i><span className="font-bold text-slate-800">{r.title}</span></div><span className="text-[10px] font-black text-orange-600">{r.date}</span></div>))}
            </div>
            <div className="h-10"></div>
          </div>
        </div>
      )}

      {(view === 'add-form' || view === 'edit-form') && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <Header title="Details" onBack={() => setView('profiles')} />
          <div className="flex-1 p-6 space-y-6 overflow-y-auto scrollbar-hide">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-[2rem] bg-slate-50 border shadow-inner flex items-center justify-center">{formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover rounded-[2rem]" /> : <i className="fa-solid fa-camera text-slate-300"></i>}</div>
              <button onClick={() => setView('form-scan')} className="px-5 py-2 bg-orange-600 text-white rounded-full font-black text-[10px] uppercase">Snap Photo</button>
            </div>
            <div className="space-y-4">
              <input type="text" value={formDog.name} onChange={e => setFormDog(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Dog Name *" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={formDog.breed} onChange={e => setFormDog(p => ({ ...p, breed: e.target.value }))} className="p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Breed" />
                <div className="flex gap-2">
                  <input type="text" value={formDog.age} onChange={e => setFormDog(p => ({ ...p, age: e.target.value }))} className="flex-1 p-4 bg-slate-50 border rounded-2xl font-bold text-center" placeholder="Age" />
                  <input type="text" value={formDog.weight} onChange={e => setFormDog(p => ({ ...p, weight: e.target.value }))} className="flex-1 p-4 bg-slate-50 border rounded-2xl font-bold text-center" placeholder="KG" />
                </div>
              </div>
              <SectionHeader title="Vaccinations" onAdd={() => setRecordForm({ type: 'vaccinations' })} />
              <div className="space-y-2">{formDog.vaccinations?.map(v => (<div key={v.id} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-xs"><span className="font-bold">{v.title}</span><div className="flex items-center gap-3"><span className="text-slate-400">{v.date}</span><button onClick={() => removeItem('vaccinations', v.id)} className="text-red-400"><i className="fa-solid fa-trash"></i></button></div></div>))}</div>
              <SectionHeader title="Future Reminders" onAdd={() => setRecordForm({ type: 'reminders' })} />
              <div className="space-y-2">{formDog.reminders?.map(r => (<div key={r.id} className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex justify-between items-center text-xs"><span className="font-bold text-orange-700">{r.title}</span><div className="flex items-center gap-3"><span className="text-orange-400">{r.date}</span><button onClick={() => removeItem('reminders', r.id)} className="text-orange-300"><i className="fa-solid fa-trash"></i></button></div></div>))}</div>
            </div>
            <button onClick={saveForm} className="w-full py-5 bg-orange-600 text-white rounded-[2rem] font-black shadow-xl shadow-orange-600/20 active:scale-95 transition-all mt-6">Save Profile</button>
            <div className="h-10"></div>
          </div>
        </div>
      )}

      {view === 'add' && (
        <div className="fixed inset-0 z-[105] bg-slate-900/70 backdrop-blur-md flex items-end justify-center animate-in">
          <div className="bg-white w-full rounded-t-[3rem] p-8 space-y-6">
            <h2 className="text-2xl font-black text-center text-slate-800">Add Pack Member</h2>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setView('scan')} className="p-8 border-2 rounded-3xl flex flex-col items-center gap-4 hover:border-orange-500"><i className="fa-solid fa-camera text-2xl text-orange-600"></i><span className="text-xs font-black uppercase tracking-widest">Scan & ID</span></button>
              <button onClick={() => { setFormDog({ name: '', breed: '', vaccinations: [], procedures: [], reminders: [] }); setView('add-form'); }} className="p-8 border-2 rounded-3xl flex flex-col items-center gap-4 hover:border-orange-500"><i className="fa-solid fa-keyboard text-2xl text-slate-400"></i><span className="text-xs font-black uppercase tracking-widest">Manual</span></button>
            </div>
            <button onClick={() => setView('profiles')} className="w-full py-4 text-slate-300 font-bold uppercase tracking-widest text-[10px]">Cancel</button>
          </div>
        </div>
      )}

      {view === 'map' && <MapView location={location} onRefreshLocation={requestLocation} onClose={() => setView('chat')} />}
      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="Reminders" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-4 overflow-y-auto scrollbar-hide">
            {activeReminders.length === 0 ? <p className="text-center text-slate-300 font-bold py-12">No upcoming reminders</p> : activeReminders.sort((a,b)=>a.date.localeCompare(b.date)).map(r => (
              <div key={r.id} className="p-4 bg-orange-50 border border-orange-100 rounded-3xl flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-orange-600 shadow-inner shrink-0"><i className="fa-solid fa-calendar-check"></i></div>
                <div className="flex-1"><h3 className="font-black text-slate-800">{r.title}</h3><p className="text-xs font-bold text-orange-600">{r.date}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {view === 'scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog({ name: '', breed, photo, vaccinations: [], procedures: [], reminders: [] }); setView('add-form'); }} onClose={() => setView('add')} />}
      {view === 'form-scan' && <ScannerOverlay onResult={(breed, photo) => { setFormDog(p => ({ ...p, breed: breed || p.breed, photo })); setView('edit-form'); }} onClose={() => setView('edit-form')} />}
      
      {recordForm && (
        <RecordForm 
          type={recordForm.type} 
          onSave={(title, date) => {
            setFormDog(prev => ({ ...prev, [recordForm.type]: [...(prev[recordForm.type] as any[]), { id: Date.now().toString(), title, date }] }));
            setRecordForm(null);
          }} 
          onClose={() => setRecordForm(null)} 
        />
      )}
    </div>
  );
};

export default App;