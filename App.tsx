import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// --- Types & Interfaces ---

export interface HealthRecord {
  id: string;
  date: string;
  title: string;
  notes?: string;
  type: 'Vaccination' | 'Visit';
}

export interface DogReminder {
  id: string;
  date: string;
  title: string;
  type: 'Vaccination' | 'Grooming' | 'Vet' | 'Other';
}

export interface DogProfile {
  id: string;
  name: string;
  breed?: string;
  age?: string;
  weight?: string;
  photo?: string;
  healthRecords: HealthRecord[];
  reminders: DogReminder[];
}

export interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  socials?: {
    instagram?: string;
    facebook?: string;
    x?: string;
  };
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface MapPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  uri?: string;
  categoryColor: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isVerified?: boolean;
  groundingUrls?: Array<{ title: string; uri: string }>;
}

// --- AI Service Logic ---

const verifiedKnowledgeBase = `
REPUTABLE VETERINARY FACTS:
1. Rabies vaccines: Required by law; first dose 12-16 weeks.
2. Toxins: Chocolate, grapes, xylitol, onions, garlic are LETHAL.
3. Puppies: Parvovirus boosters every 3-4 weeks until 16 weeks.
4. Ticks: Lyme risk starts 24 hours after attachment.
5. Heartworm: Year-round prevention is mandatory in humid areas.
`;

const getSystemInstruction = (profile?: DogProfile, userName?: string) => {
  return `
You are "paws4life.ai", an elite Veterinary Assistant. 
### SOURCE HIERARCHY:
1. MANDATORY: Reference "REPUTABLE VETERINARY FACTS".
2. SECONDARY: Use high-quality veterinary training.
3. TERTIARY: Use Google Search for local services.

### BEHAVIOR:
- User is ${userName || 'Pet Owner'}.
- Reference toxins or vaccines specifically.
- Recommend vet visits for medical issues.
- Be concise.
${profile ? `\n\n### ACTIVE DOG PROFILE: ${profile.name} (${profile.breed || 'Unknown'}).` : ''}
`;
};

// --- Map Component ---

declare const L: any;

const MapView: React.FC<{ 
  location?: UserLocation; 
  onRefresh: () => void; 
  onClose: () => void;
}> = ({ location, onRefresh, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]); 

  const categories = [
    { id: 'Vet', label: 'Vets', query: 'Veterinary Clinic', icon: 'fa-stethoscope', color: 'orange' },
    { id: 'Dog Park', label: 'Dog Parks', query: 'Dog Park', icon: 'fa-tree', color: 'green' },
    { id: 'Dog Grooming', label: 'Grooming', query: 'Dog Grooming', icon: 'fa-scissors', color: 'blue' }
  ];

  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    
    const initMap = () => {
      if (mapInstance.current) mapInstance.current.remove();
      mapInstance.current = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([location.latitude, location.longitude], 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapInstance.current);
      L.marker([location.latitude, location.longitude], { 
        icon: L.divIcon({ 
          html: '<div class="relative w-8 h-8 flex items-center justify-center"><div class="absolute inset-0 bg-blue-500 rounded-full opacity-30 animate-ping"></div><div class="relative w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div></div>', 
          iconSize: [32, 32], className: 'user-marker'
        }) 
      }).addTo(mapInstance.current);
      setMapReady(true);
      setTimeout(() => mapInstance.current?.invalidateSize(), 500);
    };

    initMap();
    const resizeObserver = new ResizeObserver(() => mapInstance.current?.invalidateSize());
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      if (mapInstance.current) mapInstance.current.remove();
    };
  }, [location]);

  useEffect(() => {
    if (!mapInstance.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    places.forEach(place => {
      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          html: `<div class="w-10 h-10 bg-${place.categoryColor}-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-2 border-white transition-transform hover:scale-110"><i class="fa-solid fa-paw"></i></div>`,
          iconSize: [40, 40]
        })
      }).addTo(mapInstance.current);
      marker.bindPopup(`<div class="p-3"><h3 class="font-black text-sm">${place.name}</h3><p class="text-[10px] text-slate-400 uppercase font-bold mb-2">${place.type}</p>${place.uri ? `<a href="${place.uri}" target="_blank" class="block bg-orange-600 text-white text-center py-2 rounded-lg text-[10px] font-black uppercase">Visit Site</a>` : ''}</div>`, { closeButton: false });
      markersRef.current.push(marker);
    });
    if (places.length > 0) {
      const group = new L.featureGroup(markersRef.current);
      mapInstance.current.fitBounds(group.getBounds().pad(0.3));
    }
  }, [places]);

  const fetchPlaces = async (query: string, categoryIds: string[]) => {
    if (!location || !query.trim()) return;
    setSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Search local pet services for: ${query}. Return JSON format in text: [Name: Name, CatID: OneOf(${categoryIds.join(',')}), Lat: Latitude, Lng: Longitude].`,
        config: { tools: [{ googleMaps: {} }], toolConfig: { retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } } } },
      });
      const responseText = response.text || "";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const extracted: MapPlace[] = [];
      const pattern = /\[Name:\s*([^,]+),\s*CatID:\s*([^,]+),\s*Lat:\s*(-?\d+\.\d+),\s*Lng:\s*(-?\d+\.\d+)\]/gi;
      let match;
      while ((match = pattern.exec(responseText)) !== null) {
        const cat = categories.find(c => c.id === match[2].trim()) || categories[0];
        extracted.push({ id: match[1], name: match[1], lat: parseFloat(match[3]), lng: parseFloat(match[4]), type: cat.label, categoryColor: cat.color, uri: chunks.find((c: any) => c.maps?.title?.includes(match![1]))?.maps?.uri });
      }
      setPlaces(extracted);
    } catch (e) { console.error(e); } finally { setSearching(false); }
  };

  const toggleCat = (id: string) => {
    const next = selectedCategories.includes(id) ? selectedCategories.filter(c => c !== id) : [...selectedCategories, id];
    setSelectedCategories(next);
    if (next.length === 0) setPlaces([]);
    else fetchPlaces(next.map(c => categories.find(cat => cat.id === c)!.query).join(", "), next);
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[150] bg-white flex flex-col animate-in">
      <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
        <button onClick={onClose} className="w-10 h-10 bg-white/20 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
        <div className="flex-1 relative">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchPlaces(searchQuery, selectedCategories)} className="w-full bg-white/10 rounded-xl px-4 py-2 text-sm placeholder-white/60 focus:bg-white focus:text-slate-800" placeholder="Search pet spots..." />
          <button onClick={() => fetchPlaces(searchQuery, selectedCategories)} className="absolute right-3 top-2 text-white/50">{searching ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-search"></i>}</button>
        </div>
      </header>
      <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide border-b shadow-sm bg-white">
        {categories.map(c => (
          <button key={c.id} onClick={() => toggleCat(c.id)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedCategories.includes(c.id) ? `bg-${c.color}-600 text-white` : 'bg-slate-100 text-slate-400'}`}>
            <i className={`fa-solid ${c.icon} mr-1.5`}></i> {c.label}
          </button>
        ))}
      </div>
      <div ref={mapRef} id="map" className="flex-1 bg-slate-200"></div>
    </div>
  );
};

// --- App Component ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v2_profiles') || '[]'));
  const [user, setUser] = useState<UserProfile>(() => JSON.parse(localStorage.getItem('paws_v2_user') || '{"name":"","email":""}'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v2_active'));
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>(() => JSON.parse(localStorage.getItem('paws_v2_admin_users') || '[]'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'profiles' | 'profile-detail' | 'map' | 'reminders-list' | 'settings' | 'edit-form' | 'registration' | 'admin'>('chat');
  const [viewId, setViewId] = useState<string | null>(null);
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ healthRecords: [], reminders: [] });
  const [location, setLocation] = useState<UserLocation>();

  const activeDog = profiles.find(p => p.id === activeId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('paws_v2_profiles', JSON.stringify(profiles));
    localStorage.setItem('paws_v2_user', JSON.stringify(user));
    if (activeId) localStorage.setItem('paws_v2_active', activeId);
    if (user.email && !registeredUsers.some(u => u.email === user.email)) {
      const next = [...registeredUsers, user];
      setRegisteredUsers(next);
      localStorage.setItem('paws_v2_admin_users', JSON.stringify(next));
    }
  }, [profiles, user, activeId]);

  useEffect(() => {
    if (!user.email || !user.name) setView('registration');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => setLocation({ latitude: p.coords.latitude, longitude: p.coords.longitude }));
    }
  }, []);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [...messages, userMsg].map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
        config: { systemInstruction: getSystemInstruction(activeDog, user.name), tools: [{ googleSearch: {} }] },
      });
      const text = response.text || "I'm having trouble connecting.";
      const urls: any[] = [];
      response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((c: any) => c.web && urls.push({ title: c.web.title, uri: c.web.uri }));
      setMessages(p => [...p, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: urls }]);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const scanBreed = async (file: File) => {
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const res = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: { parts: [{ inlineData: { data: base64, mimeType: file.type } }, { text: "What is the dog breed in this photo? Just give the breed name." }] }
        });
        setFormDog(prev => ({ ...prev, breed: res.text?.trim(), photo: reader.result as string }));
        setLoading(false);
      };
    } catch (e) { setLoading(false); }
  };

  const saveDog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDog.name) return;
    const dog: DogProfile = { 
      id: formDog.id || Date.now().toString(), 
      name: formDog.name, 
      breed: formDog.breed, 
      age: formDog.age, 
      weight: formDog.weight, 
      photo: formDog.photo,
      healthRecords: formDog.healthRecords || [],
      reminders: formDog.reminders || []
    };
    if (formDog.id) setProfiles(p => p.map(d => d.id === formDog.id ? dog : d));
    else setProfiles(p => [...p, dog]);
    if (!activeId) setActiveId(dog.id);
    setView('profiles');
  };

  const addRecord = (type: 'Vaccination' | 'Visit') => {
    const title = prompt(`Enter ${type} detail:`);
    if (!title) return;
    const date = new Date().toISOString().split('T')[0];
    const rec: HealthRecord = { id: Date.now().toString(), type, title, date };
    setFormDog(prev => ({ ...prev, healthRecords: [...(prev.healthRecords || []), rec] }));
    
    // Auto-create reminder for next visit/booster (e.g., 1 year out)
    const nextDate = new Date();
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    const rem: DogReminder = { id: Date.now().toString() + 'r', type: type === 'Vaccination' ? 'Vaccination' : 'Vet', title: `Booster/Next: ${title}`, date: nextDate.toISOString().split('T')[0] };
    setFormDog(prev => ({ ...prev, reminders: [...(prev.reminders || []), rem] }));
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="bg-orange-600 text-white pt-12 pb-4 px-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-2">
          <div className="bg-white w-9 h-9 rounded-xl flex items-center justify-center"><i className="fa-solid fa-paw text-orange-600"></i></div>
          <h1 className="text-xl font-black italic">paws4life<span className="text-orange-200">.ai</span></h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('reminders-list')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i className="fa-solid fa-bell"></i></button>
          <button onClick={() => setView('map')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i className="fa-solid fa-map-location-dot"></i></button>
          <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i className="fa-solid fa-cog"></i></button>
          <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><i className="fa-solid fa-dog"></i></button>
        </div>
      </header>

      {/* Main Chat Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[85%] p-4 rounded-3xl text-sm shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border'}`}>
              <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
              {m.groundingUrls?.map((u, i) => <a key={i} href={u.uri} target="_blank" className="block text-[10px] mt-2 text-orange-600 font-bold underline truncate">Source: {u.title}</a>)}
            </div>
          </div>
        ))}
        {loading && <div className="p-3 bg-white border rounded-2xl w-16 flex gap-1 animate-pulse"><div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div></div>}
        <div ref={scrollRef} />
      </main>

      <footer className="p-4 bg-white border-t pb-8">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={activeDog ? `Ask about ${activeDog.name}...` : "Ask a vet question..."} className="flex-1 bg-slate-100 px-5 py-3 rounded-2xl text-sm border focus:border-orange-500 outline-none transition-all" />
          <button disabled={!input.trim() || loading} className="bg-orange-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg active:scale-95"><i className="fa-solid fa-paper-plane"></i></button>
        </form>
      </footer>

      {/* Overlays */}

      {view === 'registration' && (
        <div className="fixed inset-0 z-[500] bg-orange-600 flex items-center justify-center p-6 text-white animate-in">
          <div className="w-full space-y-8 text-center">
            <i className="fa-solid fa-paw text-7xl mb-4"></i>
            <h1 className="text-4xl font-black">Welcome to paws4life</h1>
            <p className="opacity-80 font-bold">Please complete registration to continue.</p>
            <div className="space-y-3">
              <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} className="w-full bg-white/20 border-2 border-white/30 rounded-2xl px-5 py-4 font-black placeholder-white/50 outline-none" placeholder="Full Name *" />
              <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} className="w-full bg-white/20 border-2 border-white/30 rounded-2xl px-5 py-4 font-black placeholder-white/50 outline-none" placeholder="Email Address *" />
              <button onClick={() => user.name && user.email && setView('chat')} className="w-full bg-white text-orange-600 py-5 rounded-2xl font-black shadow-2xl uppercase tracking-widest active:scale-95">Register</button>
            </div>
          </div>
        </div>
      )}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 bg-white/20 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black">My Pack</h2>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            <button onClick={() => { setFormDog({ healthRecords: [], reminders: [] }); setView('edit-form'); }} className="w-full py-5 border-4 border-dashed border-orange-100 bg-orange-50 text-orange-600 rounded-3xl font-black uppercase text-xs tracking-widest">Add New Companion</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setFormDog(p); setView('profile-detail'); }} className="p-4 bg-white border rounded-3xl flex items-center gap-4 cursor-pointer hover:bg-slate-50 shadow-sm border-slate-100">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-slate-300"></i>}
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-slate-800">{p.name}</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{p.breed || 'Companion'}</p>
                </div>
                {activeId === p.id && <span className="bg-orange-100 text-orange-600 text-[8px] px-2 py-1 rounded-full font-black uppercase border border-orange-200">Active</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'edit-form' && (
        <div className="fixed inset-0 z-[210] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center justify-between">
            <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black">Pet Details</h2>
            <div className="w-10"></div>
          </header>
          <form onSubmit={saveDog} className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 bg-slate-100 rounded-[2.5rem] border-4 border-white shadow-xl overflow-hidden relative flex items-center justify-center">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-4xl text-slate-300"></i>}
                <label className="absolute bottom-2 right-2 bg-orange-600 text-white w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer shadow-lg border-2 border-white">
                  <i className="fa-solid fa-camera text-xs"></i>
                  <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && scanBreed(e.target.files[0])} />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">Scan photo for automatic breed detection</p>
            </div>
            <div className="space-y-4">
              <input required value={formDog.name || ''} onChange={e => setFormDog({ ...formDog, name: e.target.value })} className="w-full bg-slate-50 border px-5 py-4 rounded-2xl font-bold focus:border-orange-500 outline-none transition-all" placeholder="Dog's Name *" />
              <input value={formDog.breed || ''} onChange={e => setFormDog({ ...formDog, breed: e.target.value })} className="w-full bg-slate-50 border px-5 py-4 rounded-2xl font-bold focus:border-orange-500 outline-none transition-all" placeholder="Breed (Manual or Scan)" />
              <div className="flex gap-4">
                <input value={formDog.age || ''} onChange={e => setFormDog({ ...formDog, age: e.target.value })} className="flex-1 bg-slate-50 border px-5 py-4 rounded-2xl font-bold outline-none" placeholder="Age" />
                <input value={formDog.weight || ''} onChange={e => setFormDog({ ...formDog, weight: e.target.value })} className="flex-1 bg-slate-50 border px-5 py-4 rounded-2xl font-bold outline-none" placeholder="Weight" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-black uppercase tracking-widest text-[10px] text-slate-400">Records & History</h3>
                <div className="flex gap-2">
                  <button type="button" onClick={() => addRecord('Vaccination')} className="bg-orange-50 text-orange-600 text-[9px] px-3 py-1 rounded-full font-black border border-orange-200">+ Vaccination</button>
                  <button type="button" onClick={() => addRecord('Visit')} className="bg-blue-50 text-blue-600 text-[9px] px-3 py-1 rounded-full font-black border border-blue-200">+ Visit</button>
                </div>
              </div>
              <div className="space-y-2">
                {formDog.healthRecords?.map(r => (
                  <div key={r.id} className="p-3 bg-white border rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase mr-2 ${r.type === 'Vaccination' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>{r.type}</span>
                      <span className="text-xs font-bold text-slate-800">{r.title}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold">{r.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <button type="submit" className="w-full bg-orange-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-orange-200 active:scale-95 transition-all">Save Profile</button>
          </form>
        </div>
      )}

      {view === 'profile-detail' && formDog && (
        <div className="fixed inset-0 z-[220] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center justify-between">
            <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black">Member Profile</h2>
            <button onClick={() => setView('edit-form')} className="w-10 h-10 bg-white/20 rounded-xl"><i className="fa-solid fa-edit"></i></button>
          </header>
          <div className="flex-1 p-6 space-y-8 overflow-y-auto">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-slate-100 rounded-3xl overflow-hidden border-4 border-white shadow-xl flex items-center justify-center">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-3xl text-slate-300"></i>}
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800">{formDog.name}</h3>
                <p className="text-sm text-orange-600 font-bold uppercase tracking-widest">{formDog.breed || 'Unknown Breed'}</p>
                <button onClick={() => { setActiveId(formDog.id!); setView('chat'); }} className={`mt-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${activeId === formDog.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}>
                  {activeId === formDog.id ? 'Current Profile' : 'Set Active'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100"><div className="text-[10px] text-slate-400 font-black uppercase mb-1">Age</div><div className="font-black text-slate-800">{formDog.age || '--'}</div></div>
              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100"><div className="text-[10px] text-slate-400 font-black uppercase mb-1">Weight</div><div className="font-black text-slate-800">{formDog.weight || '--'}</div></div>
            </div>
            {formDog.reminders && formDog.reminders.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><i className="fa-solid fa-bell text-orange-400"></i> Upcoming Tasks</h3>
                {formDog.reminders.map(r => (
                  <div key={r.id} className="p-4 bg-orange-50 border border-orange-100 rounded-3xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black text-slate-800">{r.title}</div>
                      <div className="text-[10px] text-orange-600 font-bold uppercase tracking-widest mt-0.5">{r.type}</div>
                    </div>
                    <div className="text-[10px] font-black text-orange-600 bg-white px-3 py-1 rounded-full border border-orange-100 shadow-sm">{r.date}</div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { if(confirm("Permanently delete profile?")) { setProfiles(p => p.filter(d => d.id !== formDog.id)); setView('profiles'); } }} className="w-full text-red-500 font-black uppercase text-[10px] tracking-widest py-4 border border-red-50 rounded-2xl bg-red-50/30">Delete Companion</button>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[230] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 bg-white/20 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black">Profile & Settings</h2>
          </header>
          <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-slate-50">
            <div className="bg-white p-6 rounded-3xl shadow-sm border space-y-4">
              <h3 className="font-black uppercase text-[10px] tracking-widest text-slate-400 mb-2">Personal Identity</h3>
              <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold" placeholder="Owner Name *" />
              <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold" placeholder="Email Address *" />
              <input value={user.phone} onChange={e => setUser({ ...user, phone: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold" placeholder="Phone Number" />
              <input value={user.address} onChange={e => setUser({ ...user, address: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold" placeholder="Address" />
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border space-y-4">
              <h3 className="font-black uppercase text-[10px] tracking-widest text-slate-400 mb-2">Social Hub</h3>
              <div className="flex items-center gap-3"><i className="fa-brands fa-instagram text-xl text-slate-400"></i><input value={user.socials?.instagram} onChange={e => setUser({ ...user, socials: { ...user.socials, instagram: e.target.value } })} className="flex-1 bg-slate-50 border p-3 rounded-xl font-bold text-sm" placeholder="@username" /></div>
              <div className="flex items-center gap-3"><i className="fa-brands fa-x-twitter text-xl text-slate-400"></i><input value={user.socials?.x} onChange={e => setUser({ ...user, socials: { ...user.socials, x: e.target.value } })} className="flex-1 bg-slate-50 border p-3 rounded-xl font-bold text-sm" placeholder="@username" /></div>
            </div>
            <button onClick={() => setView('admin')} className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest border border-dashed rounded-2xl active:bg-slate-100">Admin Control Panel</button>
            <p className="text-center text-[9px] text-slate-300 font-black italic tracking-[0.2em] pt-6">paws4life.ai v2.0.0 • Satellite Shield Active</p>
          </div>
        </div>
      )}

      {view === 'admin' && (
        <div className="fixed inset-0 z-[300] bg-white flex flex-col animate-in">
          <header className="bg-slate-800 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/10 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black italic">System Admin</h2>
          </header>
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            <h3 className="font-black uppercase tracking-widest text-[10px] text-slate-400">Registered Pack Members ({registeredUsers.length})</h3>
            <div className="space-y-3">
              {registeredUsers.map((u, i) => (
                <div key={i} className="p-4 bg-slate-50 border rounded-2xl">
                  <div className="font-black text-slate-800">{u.name}</div>
                  <div className="text-xs text-slate-400 font-bold">{u.email}</div>
                  {u.phone && <div className="text-[10px] text-slate-400 mt-1"><i className="fa-solid fa-phone mr-1"></i> {u.phone}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[240] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 bg-white/20 rounded-xl"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black">All Notifications</h2>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            {profiles.flatMap(p => p.reminders.map(r => ({ ...r, dog: p.name }))).sort((a,b) => a.date.localeCompare(b.date)).map(r => (
              <div key={r.id} className="p-4 bg-white border border-slate-100 rounded-3xl flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 shadow-inner"><i className="fa-solid fa-bell"></i></div>
                <div className="flex-1">
                  <div className="text-sm font-black text-slate-800 leading-tight">{r.title}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{r.dog} • {r.type}</div>
                </div>
                <div className="text-[10px] font-black text-orange-600 px-3 py-1 bg-orange-50 rounded-full border border-orange-100">{r.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'map' && <MapView location={location} onRefresh={() => {}} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;
