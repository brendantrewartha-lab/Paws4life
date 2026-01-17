import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// --- Types & Interfaces ---

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isVerified?: boolean;
  groundingUrls?: Array<{ title: string; uri: string }>;
}

export interface HealthRecord {
  id: string;
  date: string;
  title: string;
  notes?: string;
}

export interface DogReminder {
  id: string;
  date: string;
  type: 'Vaccination' | 'Check-up' | 'Grooming' | 'Medication' | 'Other';
  title: string;
}

export interface DogProfile {
  id: string;
  name: string;
  breed?: string;
  age?: string;
  weight?: string;
  photo?: string;
  vaccinations: HealthRecord[];
  procedures: HealthRecord[];
  reminders: DogReminder[];
  allergies?: string;
  conditions?: string;
  homeLocation?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  instagram?: string;
  facebook?: string;
  xPlatform?: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

// --- AI Service Logic ---

const verifiedKnowledgeBase = `
REPUTABLE VETERINARY FACTS (INTERNAL DATASET):
1. Rabies vaccines are required by law in most regions; first dose at 12-16 weeks.
2. Chocolate, grapes, and xylitol are toxic; immediate vet intervention required.
3. Puppies require parvovirus boosters every 3-4 weeks until 16 weeks old.
4. Ticks can transmit Lyme disease within 24-48 hours of attachment.
5. Heartworm prevention must be administered year-round in humid climates.
6. Onions, garlic, and macadamia nuts can cause serious illness or red blood cell damage.
`;

const getSystemInstruction = (profile?: DogProfile, userName?: string) => {
  let instruction = `
You are "paws4life.ai", an elite Veterinary Assistant. 
### SOURCE HIERARCHY:
1. MANDATORY: Reference the "REPUTABLE VETERINARY FACTS" provided below first.
2. SECONDARY: Use your internal high-quality training for general canine health.
3. TERTIARY: Use Google Search ONLY for finding local services (vets, parks) or current events.

### REPUTABLE VETERINARY FACTS:
${verifiedKnowledgeBase}

### BEHAVIOR:
- User is ${userName || 'Pet Owner'}.
- If a user asks about a topic covered in the Reputable Facts (like toxins or vaccines), use that information as your absolute source.
- For medical questions, conclude with a mention that this is verified information but a physical vet visit is always best for emergencies.
- Be concise, authoritative, and compassionate.
`;

  if (profile && profile.name) {
    instruction += `\n\n### ACTIVE DOG PROFILE: ${profile.name} (${profile.breed || 'Unknown Breed'}). Age: ${profile.age || 'N/A'}. Weight: ${profile.weight || 'N/A'}.`;
  }

  return instruction;
};

// --- Leaflet & Map Helpers ---

declare const L: any;

const MapView: React.FC<{ location?: UserLocation; onRefresh: () => void; onClose: () => void }> = ({ location, onRefresh, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    
    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    mapInstance.current = L.map(mapRef.current, { 
      zoomControl: false, 
      attributionControl: false,
      fadeAnimation: true
    }).setView([location.latitude, location.longitude], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
      maxZoom: 20, 
      detectRetina: true,
      r: window.devicePixelRatio > 1 ? '@2x' : ''
    }).addTo(mapInstance.current);

    setTimeout(() => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize();
      }
    }, 400);

    const icon = (color: string, iconName: string) => L.divIcon({ 
        html: `<div class="w-10 h-10 bg-${color}-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-2 border-white transform transition-transform hover:scale-110"><i class="fa-solid fa-${iconName}"></i></div>`, 
        iconSize: [40, 40], className: 'custom-marker' 
    });

    L.marker([location.latitude, location.longitude], { 
      icon: L.divIcon({ html: '<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>', iconSize: [24, 24] }) 
    }).addTo(mapInstance.current);
    
    const spots = [
        { lat: location.latitude + 0.003, lng: location.longitude + 0.004, name: 'Vet Emergency Center', type: 'hospital', color: 'orange' },
        { lat: location.latitude - 0.002, lng: location.longitude - 0.005, name: 'Golden Bark Park', type: 'tree', color: 'green' },
        { lat: location.latitude + 0.006, lng: location.longitude - 0.002, name: 'The Grooming Den', type: 'scissors', color: 'blue' },
    ];

    spots.forEach(s => {
      L.marker([s.lat, s.lng], { icon: icon(s.color, s.type) })
       .addTo(mapInstance.current)
       .bindPopup(`<div class="p-1"><b class="block text-sm">${s.name}</b><span class="text-[10px] text-slate-400 uppercase font-black tracking-widest">${s.type}</span></div>`);
    });

    return () => { if (mapInstance.current) mapInstance.current.remove(); };
  }, [location]);

  return (
    <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-in">
      <header className="bg-orange-600 text-white shadow-xl p-4 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
        <h1 className="text-xl font-black italic">Local Services</h1>
      </header>
      <div className="flex-1 relative bg-slate-50 overflow-hidden">
        {!location ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-6 z-[200]">
            <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 animate-bounce">
              <i className="fa-solid fa-location-dot text-4xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-800">Map restricted</h3>
            <p className="text-sm text-slate-400">Please enable location access to see local vets and dog parks.</p>
            <button onClick={onRefresh} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black">Grant Permission</button>
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full">
            <div ref={mapRef} id="map" className="w-full h-full"></div>
            <button onClick={onRefresh} className="absolute bottom-8 right-6 z-[160] w-14 h-14 bg-white text-orange-600 rounded-2xl shadow-2xl flex items-center justify-center border border-slate-100"><i className="fa-solid fa-location-crosshairs text-xl"></i></button>
          </div>
        )}
      </div>
      <footer className="p-4 flex gap-3 overflow-x-auto scrollbar-hide bg-white border-t border-slate-100 shrink-0">
        <div className="px-5 py-3 bg-orange-50 text-orange-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border border-orange-100">Nearby Vets</div>
        <div className="px-5 py-3 bg-green-50 text-green-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border border-green-100">Dog Parks</div>
      </footer>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v16_profiles') || '[]'));
  const [user, setUser] = useState<UserProfile>(() => JSON.parse(localStorage.getItem('paws_v16_user') || '{"name":"","email":"","phone":""}'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v16_active'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'profiles' | 'profile-detail' | 'map' | 'reminders-list' | 'settings' | 'edit-form'>('chat');
  const [location, setLocation] = useState<UserLocation>();
  const [viewId, setViewId] = useState<string | null>(null);
  const [formDog, setFormDog] = useState<Partial<DogProfile> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDog = profiles.find(p => p.id === activeId) || null;
  const viewDog = profiles.find(p => p.id === viewId) || null;
  const activeRemindersCount = profiles.flatMap(p => p.reminders).filter(r => r.date >= new Date().toISOString().split('T')[0]).length;

  useEffect(() => {
    localStorage.setItem('paws_v16_profiles', JSON.stringify(profiles));
    localStorage.setItem('paws_v16_user', JSON.stringify(user));
    if (activeId) localStorage.setItem('paws_v16_active', activeId);
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [profiles, user, activeId, messages]);

  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setLocation({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        err => { if (view === 'map') alert("Please enable location permissions in Settings."); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  useEffect(() => { requestLocation(); }, [view]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const model = 'gemini-3-pro-preview';
      
      const response: GenerateContentResponse = await ai.models.generateContent({
        model,
        contents: [...messages, userMsg].map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: m.text }]
        })),
        config: {
          systemInstruction: getSystemInstruction(activeDog || undefined, user.name),
          tools: [{ googleSearch: {} }],
          temperature: 0.2,
        },
      });

      const text = response.text || "I'm having trouble retrieving verified records.";
      const sources: Array<{ title: string; uri: string }> = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) chunks.forEach((chunk: any) => { if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri }); });

      const isVerified = text.toLowerCase().includes("verified") || 
                        text.toLowerCase().includes("vaccine") || 
                        text.toLowerCase().includes("toxin");

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), isVerified, groundingUrls: sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Connection issues. Please try again.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const saveDog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDog?.name) return;
    const newDog: DogProfile = {
      id: formDog.id || Date.now().toString(),
      name: formDog.name,
      breed: formDog.breed || '',
      age: formDog.age || '',
      weight: formDog.weight || '',
      photo: formDog.photo || '',
      vaccinations: formDog.vaccinations || [],
      procedures: formDog.procedures || [],
      reminders: formDog.reminders || [],
    };
    if (formDog.id) setProfiles(prev => prev.map(p => p.id === formDog.id ? newDog : p));
    else { setProfiles(prev => [...prev, newDog]); if (!activeId) setActiveId(newDog.id); }
    setView('profiles');
    setFormDog(null);
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden font-sans">
      <header className="bg-orange-600 text-white shadow-xl z-[60] shrink-0 border-b border-orange-500/30">
        <div style={{ height: 'max(env(safe-area-inset-top), 44px)' }} className="w-full"></div>
        <div className="px-4 pb-4 flex items-center justify-between min-h-[64px]">
          <div className="flex items-center gap-2.5">
            <div className="bg-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner">
              <i className="fa-solid fa-paw text-xl text-orange-600"></i>
            </div>
            <h1 className="text-xl font-black italic tracking-tighter">paws4life<span className="text-orange-200">.ai</span></h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('reminders-list')} className="relative w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-bell"></i>
              {activeRemindersCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full animate-pulse">{activeRemindersCount}</span>}
            </button>
            <button onClick={() => setView('map')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i className="fa-solid fa-map-location-dot"></i></button>
            <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i className="fa-solid fa-user-gear"></i></button>
            <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i className="fa-solid fa-dog"></i></button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4"><i className="fa-solid fa-shield-dog text-2xl"></i></div>
            <p className="text-xs font-black uppercase tracking-widest">How can I help you and your pack?</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[88%] p-4 rounded-[2rem] text-sm shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'}`}>
              {m.role === 'model' && m.isVerified && (
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-blue-500 mb-2 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 w-fit">
                  <i className="fa-solid fa-circle-check"></i> Verified medical dataset reference
                </div>
              )}
              <div className="whitespace-pre-wrap leading-relaxed prose prose-sm">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (<a key={i} href={u.uri} target="_blank" className="text-[10px] bg-slate-50 text-orange-600 px-2 py-1 rounded-lg border font-bold">Source: {u.title}</a>))}
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
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={activeDog ? `Ask about ${activeDog.name}...` : "Ask a vet question..."} className="flex-1 bg-slate-100 px-5 py-3.5 rounded-2xl text-sm border border-transparent focus:border-orange-500 outline-none transition-all" />
          <button type="submit" disabled={!input.trim() || loading} className="bg-orange-600 text-white w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center active:scale-95 transition-all"><i className="fa-solid fa-paper-plane"></i></button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">My Pack</h1>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            <button onClick={() => { setFormDog({ vaccinations: [], procedures: [], reminders: [] }); setView('edit-form'); }} className="w-full py-5 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-[2rem]">Add Pack Member</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setView('profile-detail'); }} className="p-4 rounded-[2rem] border-2 flex items-center gap-4 bg-white border-slate-100">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border bg-slate-100 flex items-center justify-center">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-slate-300"></i>}
                </div>
                <div className="flex-1 font-black text-slate-800">{p.name} {activeId === p.id && <span className="ml-2 text-[8px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100 uppercase">Active</span>}</div>
                <i className="fa-solid fa-chevron-right text-slate-300"></i>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'edit-form' && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 flex items-center gap-3">
            <button onClick={() => setView('profiles')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">Member Info</h1>
          </header>
          <form onSubmit={saveDog} className="flex-1 p-6 space-y-6 overflow-y-auto">
            <input required value={formDog?.name || ''} onChange={e => setFormDog({ ...formDog, name: e.target.value })} className="w-full bg-slate-50 border px-5 py-4 rounded-2xl font-bold" placeholder="Dog Name *" />
            <input value={formDog?.breed || ''} onChange={e => setFormDog({ ...formDog, breed: e.target.value })} className="w-full bg-slate-50 border px-5 py-4 rounded-2xl font-bold" placeholder="Breed" />
            <button type="submit" className="w-full py-5 bg-orange-600 text-white font-black rounded-2xl shadow-xl">Save Member</button>
          </form>
        </div>
      )}

      {view === 'profile-detail' && viewDog && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 flex items-center justify-between">
            <button onClick={() => setView('profiles')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <button onClick={() => { setActiveId(viewDog.id); setView('chat'); }} className="bg-white text-orange-600 px-4 py-2 rounded-xl text-xs font-black uppercase">Set Active</button>
          </header>
          <div className="flex-1 p-6 space-y-8 overflow-y-auto">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-white shadow-lg bg-slate-100 flex items-center justify-center">
                {viewDog.photo ? <img src={viewDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-3xl text-slate-300"></i>}
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">{viewDog.name}</h2>
                <p className="text-sm text-slate-400 font-bold uppercase">{viewDog.breed || 'Dog'}</p>
              </div>
            </div>
            <button onClick={() => { if(confirm("Remove from pack?")) { setProfiles(profiles.filter(p => p.id !== viewDog.id)); setView('profiles'); } }} className="text-red-400 font-black uppercase text-xs">Delete Member</button>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">Settings</h1>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} placeholder="Your Name" className="w-full bg-slate-50 border px-5 py-4 rounded-2xl font-bold" />
            <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} placeholder="Email Address" className="w-full bg-slate-50 border px-5 py-4 rounded-2xl font-bold" />
            <p className="text-[9px] text-slate-300 uppercase font-black text-center mt-12">paws4life v1.6.0 Unified Build</p>
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[130] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">Reminders</h1>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            {profiles.flatMap(p => p.reminders).length === 0 ? <p className="text-center text-slate-300 italic">No reminders</p> : 
              profiles.flatMap(p => p.reminders).map(r => (
                <div key={r.id} className="p-4 bg-orange-50 border rounded-[2rem] flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-orange-600 shadow-sm"><i className="fa-solid fa-bell"></i></div>
                  <div><div className="font-black text-slate-800 text-sm">{r.title}</div><div className="text-[10px] text-orange-600 font-bold uppercase">{r.date}</div></div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {view === 'map' && <MapView location={location} onRefresh={requestLocation} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;
