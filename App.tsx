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
  isBooked?: boolean; // Distinguishes between a set appointment and a suggestion
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
- Provide actionable advice based on breed or history.
- Be empathetic yet professional.
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
    { id: 'Vet', label: 'Vets', query: 'Veterinary Clinic or Hospital', icon: 'fa-stethoscope', color: 'orange' },
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
      marker.bindPopup(`<div class="p-3"><h3 class="font-black text-sm text-slate-800">${place.name}</h3><p class="text-[10px] text-slate-400 uppercase font-bold mb-2">${place.type}</p>${place.uri ? `<a href="${place.uri}" target="_blank" class="block bg-orange-600 text-white text-center py-2 rounded-lg text-[10px] font-black uppercase">Visit Site</a>` : ''}</div>`, { closeButton: false });
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
        contents: `Search local pet services for: ${query}. Strictly provide: [Name: Name, CatID: OneOf(${categoryIds.join(',')}), Lat: Latitude, Lng: Longitude].`,
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

  const centerMap = () => {
    if (mapInstance.current && location) {
      mapInstance.current.setView([location.latitude, location.longitude], 15);
    }
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
        <button onClick={onClose} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
        <div className="flex-1 relative">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchPlaces(searchQuery, selectedCategories)} className="w-full bg-white/10 rounded-xl px-4 py-2 text-sm placeholder-white/60 focus:bg-white focus:text-slate-800 outline-none" placeholder="Search pet spots..." />
          <button onClick={() => fetchPlaces(searchQuery, selectedCategories)} className="absolute right-3 top-2 text-white/50">{searching ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-search"></i>}</button>
        </div>
      </header>
      <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide border-b shadow-sm bg-white">
        {categories.map(c => (
          <button key={c.id} onClick={() => toggleCat(c.id)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest flex-shrink-0 transition-all ${selectedCategories.includes(c.id) ? `bg-${c.color}-600 text-white` : 'bg-slate-100 text-slate-400'}`}>
            <i className={`fa-solid ${c.icon} mr-1.5`}></i> {c.label}
          </button>
        ))}
      </div>
      <div className="flex-1 relative">
        <div ref={mapRef} id="map" className="w-full h-full bg-slate-200"></div>
        <button onClick={centerMap} className="absolute bottom-6 right-6 w-12 h-12 bg-white text-orange-600 rounded-2xl shadow-2xl flex items-center justify-center z-[10] border border-slate-100 active:scale-95 transition-all">
          <i className="fa-solid fa-location-crosshairs text-lg"></i>
        </button>
      </div>
    </div>
  );
};

// --- App Component ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v5_profiles') || '[]'));
  const [user, setUser] = useState<UserProfile>(() => JSON.parse(localStorage.getItem('paws_v5_user') || '{"name":"","email":"","phone":"","address":""}'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v5_active'));
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>(() => JSON.parse(localStorage.getItem('paws_v5_admin_users') || '[]'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'profiles' | 'profile-detail' | 'map' | 'reminders-list' | 'settings' | 'edit-form' | 'registration' | 'admin'>('chat');
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ healthRecords: [], reminders: [] });
  const [location, setLocation] = useState<UserLocation>();
  
  const [recordModal, setRecordModal] = useState<{ 
    isOpen: boolean, 
    mode: 'past' | 'future' | 'reminder',
    type: 'Vaccination' | 'Visit' | 'Grooming' | 'Other', 
    title: string, 
    date: string, 
    notes: string,
    scheduleFollowUp?: boolean,
    followUpRange?: string
  } | null>(null);

  const activeDog = profiles.find(p => p.id === activeId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Date Helpers ---
  const parseLocalISO = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const getTodayAtMidnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getAllReminders = () => {
    return profiles.flatMap(p => p.reminders.map(r => ({ ...r, dog: p.name })));
  };

  const getFilteredReminders = (daysRange?: number) => {
    const today = getTodayAtMidnight();
    return getAllReminders()
      .filter(r => {
        const rDate = parseLocalISO(r.date);
        if (rDate < today) return false;
        if (daysRange !== undefined) {
          const endRange = new Date(today);
          endRange.setDate(today.getDate() + daysRange);
          return rDate <= endRange;
        }
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const upcomingBadgeCount = getFilteredReminders(30).length;

  useEffect(() => {
    localStorage.setItem('paws_v5_profiles', JSON.stringify(profiles));
    localStorage.setItem('paws_v5_user', JSON.stringify(user));
    if (activeId) localStorage.setItem('paws_v5_active', activeId);
    if (user.email && user.name) {
      if (!registeredUsers.some(u => u.email === user.email)) {
        const next = [...registeredUsers, user];
        setRegisteredUsers(next);
        localStorage.setItem('paws_v5_admin_users', JSON.stringify(next));
      }
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

  const handleAddRecord = () => {
    if (!recordModal || !recordModal.title) return;
    
    let newReminders = [...(formDog.reminders || [])];
    let newRecords = [...(formDog.healthRecords || [])];

    if (recordModal.mode === 'past') {
      const rec: HealthRecord = { 
        id: Date.now().toString(), 
        type: recordModal.type === 'Vaccination' ? 'Vaccination' : 'Visit', 
        title: recordModal.title, 
        date: recordModal.date, 
        notes: recordModal.notes 
      };
      newRecords.push(rec);

      if (recordModal.scheduleFollowUp && recordModal.followUpRange) {
        const nextDate = parseLocalISO(recordModal.date);
        switch (recordModal.followUpRange) {
          case '1m': nextDate.setMonth(nextDate.getMonth() + 1); break;
          case '3m': nextDate.setMonth(nextDate.getMonth() + 3); break;
          case '6m': nextDate.setMonth(nextDate.getMonth() + 6); break;
          case '1y': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
        }
        newReminders.push({
          id: Date.now().toString() + 'rem',
          date: nextDate.toISOString().split('T')[0],
          title: `Follow-up: ${recordModal.title}`,
          type: recordModal.type as any,
          isBooked: false
        });
      }
    } else if (recordModal.mode === 'future') {
      newReminders.push({
        id: Date.now().toString() + 'fut',
        date: recordModal.date,
        title: recordModal.title,
        type: recordModal.type as any,
        isBooked: true
      });
    } else {
      newReminders.push({
        id: Date.now().toString() + 'man',
        date: recordModal.date,
        title: recordModal.title,
        type: 'Other',
        isBooked: false
      });
    }

    setFormDog(prev => ({ ...prev, healthRecords: newRecords, reminders: newReminders }));
    setRecordModal(null);
  };

  const deleteRecord = (id: string) => {
    if (confirm("Delete this health record permanently?")) {
      setFormDog(prev => ({ ...prev, healthRecords: prev.healthRecords?.filter(r => r.id !== id) }));
    }
  };

  const deleteReminder = (id: string) => {
    if (confirm("Delete this reminder permanently?")) {
      setFormDog(prev => ({ ...prev, reminders: prev.reminders?.filter(r => r.id !== id) }));
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="bg-orange-600 text-white pt-12 pb-4 px-4 flex items-center justify-between shadow-xl z-[100]">
        <div className="flex items-center gap-2">
          <div className="bg-white w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"><i className="fa-solid fa-paw text-orange-600"></i></div>
          <h1 className="text-xl font-black italic tracking-tighter">paws4life<span className="text-orange-200">.ai</span></h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('reminders-list')} className="relative w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-95">
            <i className="fa-solid fa-bell"></i>
            {upcomingBadgeCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-orange-600 animate-in">
                {upcomingBadgeCount}
              </span>
            )}
          </button>
          <button onClick={() => setView('map')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-95"><i className="fa-solid fa-map-location-dot"></i></button>
          <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-95"><i className="fa-solid fa-cog"></i></button>
          <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-95"><i className="fa-solid fa-dog"></i></button>
        </div>
      </header>

      {/* Main Chat Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-hide relative">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 py-20 animate-in">
            <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center text-orange-600 mb-8 shadow-2xl border-4 border-orange-50"><i className="fa-solid fa-shield-dog text-4xl"></i></div>
            <h2 className="text-3xl font-black tracking-tight text-slate-800 mb-3 leading-tight">Welcome, {user.name.split(' ')[0] || 'Pack Member'}</h2>
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10">Your AI-powered health advisor and concierge for everything canine. Ask about toxins, vaccines, or find local emergency vets.</p>
            <div className="grid grid-cols-2 gap-4 w-full">
               <button onClick={() => setInput("Is avocado safe for dogs?")} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-orange-600 transition-all hover:shadow-md">Toxin Check</button>
               <button onClick={() => setInput("Schedule for a puppy's first year")} className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-orange-600 transition-all hover:shadow-md">Care Schedule</button>
            </div>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[85%] p-4 rounded-3xl text-sm shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
              <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
              {m.groundingUrls?.map((u, i) => <a key={i} href={u.uri} target="_blank" className="block text-[10px] mt-2 text-orange-600 font-bold underline truncate">Source: {u.title}</a>)}
            </div>
          </div>
        ))}
        {loading && <div className="p-3 bg-white border rounded-2xl w-16 flex gap-1 animate-pulse"><div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div></div>}
        <div ref={scrollRef} />
      </main>

      <footer className="p-4 bg-white border-t pb-8 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)] z-[90]">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={activeDog ? `Talk about ${activeDog.name}...` : "Ask your advisor..."} className="flex-1 bg-slate-50 px-5 py-4 rounded-2xl text-sm border-2 border-transparent focus:border-orange-500 outline-none transition-all shadow-inner font-bold" />
          <button disabled={!input.trim() || loading} className="bg-orange-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"><i className="fa-solid fa-paper-plane"></i></button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {view === 'registration' && (
        <div className="fixed inset-0 z-[500] bg-orange-600 flex items-center justify-center p-6 text-white animate-in">
          <div className="w-full space-y-8 text-center">
            <div className="w-20 h-20 bg-white rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl"><i className="fa-solid fa-paw text-4xl text-orange-600"></i></div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter mb-2">paws4life<span className="text-orange-200">.ai</span></h1>
              <p className="opacity-80 font-bold text-sm uppercase tracking-widest">The Pack Hub</p>
            </div>
            <div className="space-y-3">
              <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} className="w-full bg-white text-slate-800 rounded-2xl px-5 py-4 font-bold placeholder-slate-400 outline-none shadow-xl border-2 border-transparent focus:border-white" placeholder="Name *" />
              <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} className="w-full bg-white text-slate-800 rounded-2xl px-5 py-4 font-bold placeholder-slate-400 outline-none shadow-xl border-2 border-transparent focus:border-white" placeholder="Email *" />
              <button onClick={() => user.name && user.email && setView('chat')} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-2xl uppercase tracking-[0.2em] text-xs mt-4 active:scale-95 transition-all">Join the Pack</button>
            </div>
          </div>
        </div>
      )}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black italic">My Pack</h2>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50">
            <button onClick={() => { setFormDog({ healthRecords: [], reminders: [] }); setView('edit-form'); }} className="w-full py-8 border-4 border-dashed border-orange-200 bg-white text-orange-600 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-sm hover:bg-orange-50 transition-all">Add Companion</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setFormDog(p); setView('profile-detail'); }} className="p-5 bg-white border border-slate-100 rounded-[2.5rem] flex items-center gap-4 cursor-pointer hover:shadow-md transition-all">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-white shadow-inner">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-slate-300"></i>}
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-slate-800 text-lg">{p.name}</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{p.breed || 'Companion'}</p>
                </div>
                {activeId === p.id && <span className="bg-orange-500 text-white text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest shadow-sm">Active</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'edit-form' && (
        <div className="fixed inset-0 z-[210] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center justify-between">
            <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black">Edit Identity</h2>
            <button type="submit" form="dogForm" className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-check"></i></button>
          </header>
          <form id="dogForm" onSubmit={saveDog} className="flex-1 p-6 space-y-8 overflow-y-auto bg-slate-50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 bg-white rounded-[3rem] border-4 border-white shadow-2xl overflow-hidden relative flex items-center justify-center">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-5xl text-slate-100"></i>}
                <label className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                   <div className="bg-orange-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-2xl border-2 border-white"><i className="fa-solid fa-camera text-sm"></i></div>
                   <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && scanBreed(e.target.files[0])} />
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <input required value={formDog.name || ''} onChange={e => setFormDog({ ...formDog, name: e.target.value })} className="w-full bg-white border border-slate-100 px-5 py-5 rounded-[1.5rem] font-bold shadow-sm outline-none focus:border-orange-500 transition-all" placeholder="Dog's Name *" />
              <input value={formDog.breed || ''} onChange={e => setFormDog({ ...formDog, breed: e.target.value })} className="w-full bg-white border border-slate-100 px-5 py-5 rounded-[1.5rem] font-bold shadow-sm outline-none focus:border-orange-500 transition-all" placeholder="Breed" />
              <div className="flex gap-4">
                <input value={formDog.age || ''} onChange={e => setFormDog({ ...formDog, age: e.target.value })} className="flex-1 bg-white border border-slate-100 px-5 py-5 rounded-[1.5rem] font-bold shadow-sm outline-none focus:border-orange-500 transition-all" placeholder="Age" />
                <input value={formDog.weight || ''} onChange={e => setFormDog({ ...formDog, weight: e.target.value })} className="flex-1 bg-white border border-slate-100 px-5 py-5 rounded-[1.5rem] font-bold shadow-sm outline-none focus:border-orange-500 transition-all" placeholder="Weight (kg)" />
              </div>
            </div>

            <div className="space-y-6">
               <h3 className="font-black uppercase tracking-[0.2em] text-[10px] text-slate-400 ml-1">Archive Management</h3>
               <div className="space-y-3">
                  {formDog.healthRecords?.map(r => (
                    <div key={r.id} className="p-4 bg-white border border-slate-100 rounded-[1.5rem] flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-6 rounded-full ${r.type === 'Vaccination' ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                        <div><div className="text-xs font-black text-slate-800">{r.title}</div><div className="text-[9px] text-slate-400 font-bold">{r.date}</div></div>
                      </div>
                      <button type="button" onClick={() => deleteRecord(r.id)} className="text-red-300 hover:text-red-500 p-2"><i className="fa-solid fa-trash-can text-sm"></i></button>
                    </div>
                  ))}
                  {formDog.reminders?.map(r => (
                    <div key={r.id} className="p-4 bg-white border border-slate-100 rounded-[1.5rem] flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-6 rounded-full ${r.isBooked ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                        <div><div className="text-xs font-black text-slate-800">{r.title}</div><div className="text-[9px] text-slate-400 font-bold">{r.date}</div></div>
                      </div>
                      <button type="button" onClick={() => deleteReminder(r.id)} className="text-red-300 hover:text-red-500 p-2"><i className="fa-solid fa-trash-can text-sm"></i></button>
                    </div>
                  ))}
               </div>
            </div>

            <div className="space-y-3">
               <button type="button" onClick={() => setRecordModal({ isOpen: true, mode: 'past', type: 'Vaccination', title: '', date: new Date().toISOString().split('T')[0], notes: '', scheduleFollowUp: true, followUpRange: '1y' })} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2"><i className="fa-solid fa-clock-rotate-left"></i> Log Past Service</button>
               <button type="button" onClick={() => setRecordModal({ isOpen: true, mode: 'future', type: 'Visit', title: '', date: new Date().toISOString().split('T')[0], notes: '', scheduleFollowUp: false })} className="w-full bg-blue-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2"><i className="fa-solid fa-calendar-check"></i> Book Future Visit</button>
               <button type="button" onClick={() => setRecordModal({ isOpen: true, mode: 'reminder', type: 'Other', title: '', date: new Date().toISOString().split('T')[0], notes: '', scheduleFollowUp: false })} className="w-full bg-slate-100 text-slate-600 py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"><i className="fa-solid fa-bell"></i> Set General Reminder</button>
            </div>
            
            <button type="submit" className="w-full border-4 border-orange-50 bg-white text-orange-600 py-6 rounded-[2.5rem] font-black uppercase tracking-[0.2em] shadow-sm transition-all active:scale-95">Complete Setup</button>
          </form>

          {recordModal && (
            <div className="fixed inset-0 z-[300] bg-slate-900/60 flex items-end justify-center animate-in p-0">
              <div className="bg-white w-full max-w-xl rounded-t-[3rem] p-8 pb-12 space-y-6 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black italic">{recordModal.mode === 'past' ? 'Log Past Record' : recordModal.mode === 'future' ? 'Book Appointment' : 'Add Reminder'}</h3>
                  <button onClick={() => setRecordModal(null)} className="text-slate-300 hover:text-slate-800"><i className="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setRecordModal({...recordModal, type: 'Vaccination'})} className={`py-3 rounded-xl font-black uppercase text-[9px] border-2 tracking-widest transition-all ${recordModal.type === 'Vaccination' ? 'bg-orange-500 text-white border-orange-500' : 'bg-slate-50 text-slate-400 border-slate-50'}`}>Vaccination</button>
                    <button onClick={() => setRecordModal({...recordModal, type: 'Visit'})} className={`py-3 rounded-xl font-black uppercase text-[9px] border-2 tracking-widest transition-all ${recordModal.type === 'Visit' ? 'bg-blue-500 text-white border-blue-500' : 'bg-slate-50 text-slate-400 border-slate-50'}`}>Vet Visit</button>
                  </div>
                  <input autoFocus value={recordModal.title} onChange={e => setRecordModal({...recordModal, title: e.target.value})} placeholder="Service Title (e.g. Parvo Booster)" className="w-full bg-slate-50 border p-4 rounded-2xl font-bold outline-none focus:bg-white focus:border-orange-500 transition-all" />
                  <input type="date" value={recordModal.date} onChange={e => setRecordModal({...recordModal, date: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold outline-none focus:bg-white focus:border-orange-500 transition-all" />
                  
                  {recordModal.mode === 'past' && (
                    <div className="bg-slate-50 p-5 rounded-2xl space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${recordModal.scheduleFollowUp ? 'bg-orange-600 border-orange-600' : 'bg-white border-slate-200 group-hover:border-orange-300'}`}>
                          {recordModal.scheduleFollowUp && <i className="fa-solid fa-check text-white text-[10px]"></i>}
                        </div>
                        <input type="checkbox" className="hidden" checked={recordModal.scheduleFollowUp} onChange={e => setRecordModal({...recordModal, scheduleFollowUp: e.target.checked})} />
                        <span className="text-xs font-black uppercase tracking-widest text-slate-700">Schedule automatic follow-up?</span>
                      </label>
                      {recordModal.scheduleFollowUp && (
                        <div className="grid grid-cols-4 gap-2">
                           {['1m', '3m', '6m', '1y'].map(range => (
                             <button key={range} onClick={() => setRecordModal({...recordModal, followUpRange: range})} className={`py-2 rounded-lg text-[9px] font-black uppercase transition-all ${recordModal.followUpRange === range ? 'bg-orange-600 text-white' : 'bg-white text-slate-400 border'}`}>
                               {range}
                             </button>
                           ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={handleAddRecord} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl text-xs">Save Event</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'profile-detail' && formDog && (
        <div className="fixed inset-0 z-[220] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center justify-between shadow-md">
            <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black italic">Companion Insights</h2>
            <button onClick={() => setView('edit-form')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-pen-to-square"></i></button>
          </header>
          <div className="flex-1 p-6 space-y-8 overflow-y-auto bg-slate-50 scrollbar-hide">
            <div className="flex items-center gap-6">
              <div className="w-28 h-28 bg-white rounded-[2.5rem] overflow-hidden border-4 border-white shadow-2xl flex items-center justify-center">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-4xl text-slate-100"></i>}
              </div>
              <div className="flex-1">
                <h3 className="text-3xl font-black text-slate-800 leading-none mb-2">{formDog.name}</h3>
                <p className="text-sm text-orange-600 font-bold uppercase tracking-widest">{formDog.breed || 'Unique Friend'}</p>
                <button onClick={() => { setActiveId(formDog.id!); setView('chat'); }} className={`mt-4 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-all active:scale-95 ${activeId === formDog.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border'}`}>
                  {activeId === formDog.id ? 'Active Advisor' : 'Select Companion'}
                </button>
              </div>
            </div>

            {/* History Section: Past Records */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Archive History</h3>
              <div className="space-y-3">
                {formDog.healthRecords?.length === 0 ? <p className="text-xs text-slate-300 italic py-4">No records logged yet.</p> : 
                  formDog.healthRecords?.sort((a,b) => b.date.localeCompare(a.date)).map(r => (
                    <div key={r.id} className="p-4 bg-white border border-slate-100 rounded-[2rem] flex items-center gap-4 shadow-sm">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white ${r.type === 'Vaccination' ? 'bg-orange-500 shadow-orange-100' : 'bg-blue-500 shadow-blue-100'} shadow-lg`}><i className={`fa-solid ${r.type === 'Vaccination' ? 'fa-syringe' : 'fa-calendar-check'} text-sm`}></i></div>
                      <div className="flex-1">
                        <div className="text-sm font-black text-slate-800">{r.title}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{r.date} • {r.type}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Booked Appointments: Future isBooked=true */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Booked Appointments</h3>
              <div className="space-y-3">
                {formDog.reminders?.filter(r => parseLocalISO(r.date) >= getTodayAtMidnight() && r.isBooked).length === 0 ? <p className="text-xs text-slate-300 italic py-4">No future bookings.</p> : 
                  formDog.reminders?.filter(r => parseLocalISO(r.date) >= getTodayAtMidnight() && r.isBooked).sort((a,b) => a.date.localeCompare(b.date)).map(r => (
                    <div key={r.id} className="p-4 bg-blue-600 text-white rounded-[2rem] flex items-center gap-4 shadow-xl shadow-blue-100">
                      <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center"><i className="fa-solid fa-calendar-check text-sm"></i></div>
                      <div className="flex-1">
                        <div className="text-sm font-black">{r.title}</div>
                        <div className="text-[9px] opacity-70 font-bold uppercase tracking-widest">{r.date}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Health Reminders: Future isBooked=false */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Suggested Reminders</h3>
              <div className="space-y-3">
                {formDog.reminders?.filter(r => parseLocalISO(r.date) >= getTodayAtMidnight() && !r.isBooked).length === 0 ? <p className="text-xs text-slate-300 italic py-4">No suggestions pending.</p> : 
                  formDog.reminders?.filter(r => parseLocalISO(r.date) >= getTodayAtMidnight() && !r.isBooked).sort((a,b) => a.date.localeCompare(b.date)).map(r => (
                    <div key={r.id} className="p-4 bg-white border-2 border-orange-50 rounded-[2rem] flex items-center gap-4 shadow-sm">
                      <div className="w-11 h-11 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600"><i className="fa-solid fa-bolt text-sm"></i></div>
                      <div className="flex-1">
                        <div className="text-sm font-black text-slate-800">{r.title}</div>
                        <div className="text-[9px] text-orange-500 font-bold uppercase tracking-widest">{r.date}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
            
            <button onClick={() => { if(confirm("Archiving companion will hide it from active pack. Continue?")) { setProfiles(p => p.filter(d => d.id !== formDog.id)); setView('profiles'); } }} className="w-full text-red-400 font-black uppercase text-[10px] tracking-[0.3em] py-6 border border-red-50 rounded-[2.5rem] bg-red-50/20 active:bg-red-50 transition-all">Archive Companion</button>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[230] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black italic">Settings & Profile</h2>
          </header>
          <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-slate-50">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-5">
              <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold outline-none focus:bg-white" placeholder="Name *" />
              <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold outline-none focus:bg-white" placeholder="Email *" />
              <input value={user.phone} onChange={e => setUser({ ...user, phone: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold outline-none focus:bg-white" placeholder="Phone" />
              <input value={user.address} onChange={e => setUser({ ...user, address: e.target.value })} className="w-full bg-slate-50 border p-4 rounded-2xl font-bold outline-none focus:bg-white" placeholder="Location" />
            </div>

            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-4">
              <h3 className="font-black uppercase text-[10px] tracking-widest text-slate-400 ml-1">Social Ecosystem</h3>
              <div className="flex items-center gap-3"><i className="fa-brands fa-instagram text-xl text-slate-300"></i><input value={user.socials?.instagram} onChange={e => setUser({ ...user, socials: { ...user.socials, instagram: e.target.value } })} className="flex-1 bg-slate-50 border p-4 rounded-2xl font-bold text-sm" placeholder="Instagram" /></div>
              <div className="flex items-center gap-3"><i className="fa-brands fa-facebook text-xl text-slate-300"></i><input value={user.socials?.facebook} onChange={e => setUser({ ...user, socials: { ...user.socials, facebook: e.target.value } })} className="flex-1 bg-slate-50 border p-4 rounded-2xl font-bold text-sm" placeholder="Facebook" /></div>
            </div>

            <button onClick={() => setView('admin')} className="w-full py-4 text-slate-300 font-black uppercase text-[10px] tracking-widest border border-dashed border-slate-200 rounded-2xl">Admin Panel</button>
          </div>
        </div>
      )}

      {view === 'admin' && (
        <div className="fixed inset-0 z-[300] bg-white flex flex-col animate-in">
          <header className="bg-slate-900 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black italic">Pack Oversight</h2>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50">
            <h3 className="font-black uppercase tracking-widest text-[10px] text-slate-400">Total Members: {registeredUsers.length}</h3>
            {registeredUsers.map((u, i) => (
              <div key={i} className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm flex flex-col gap-1">
                <div className="font-black text-slate-800 text-lg">{u.name}</div>
                <div className="text-sm text-orange-600 font-bold">{u.email}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">{u.phone || '--'} • {u.address ? 'Location Logged' : 'No Location'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[240] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h2 className="text-xl font-black italic">Next 30 Days</h2>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50">
            {getFilteredReminders(30).length === 0 ? <div className="text-center py-20 text-slate-300 italic opacity-50"><i className="fa-solid fa-calendar-day text-5xl mb-6 block"></i> All clear for the next month!</div> : 
              getFilteredReminders(30).map(r => (
                <div key={r.id} className={`p-5 rounded-[2rem] flex items-center gap-4 shadow-sm border transition-all ${r.isBooked ? 'bg-blue-600 text-white border-blue-600 shadow-blue-100' : 'bg-white text-slate-800 border-slate-100'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${r.isBooked ? 'bg-white/20' : 'bg-orange-100 text-orange-600'}`}><i className={`fa-solid ${r.isBooked ? 'fa-calendar-check' : 'fa-bell'}`}></i></div>
                  <div className="flex-1">
                    <div className="text-sm font-black italic mb-1">{r.title}</div>
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${r.isBooked ? 'opacity-70' : 'text-slate-400'}`}>{r.dog} • {r.isBooked ? 'Booked Appt' : 'Reminder'}</div>
                  </div>
                  <div className={`text-[10px] font-black px-3 py-1.5 rounded-xl border transition-all ${r.isBooked ? 'bg-white/20 border-white/20' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>{r.date}</div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {view === 'map' && <MapView location={location} onRefresh={() => {}} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;