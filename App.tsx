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

const getSystemInstruction = (profile?: DogProfile, userName?: string) => {
  return `
You are "paws4life.ai", an elite Veterinary Assistant. 
### SOURCE HIERARCHY:
1. MANDATORY: Reference "REPUTABLE VETERINARY FACTS": Rabies required 12-16 weeks; Toxins (Chocolate, grapes, xylitol, onions, garlic) are lethal; Puppies need Parvo boosters; Ticks cause Lyme risk in 24h; Heartworm prevention is mandatory.
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
          html: `<div class="relative w-8 h-8 flex items-center justify-center"><div class="absolute inset-0 bg-blue-500 rounded-full opacity-30 animate-ping"></div><div class="relative w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div></div>`, 
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
      <header className="bg-orange-600 text-white px-4 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] pb-1.5 flex items-center gap-3">
        <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left text-sm"></i></button>
        <div className="flex-1 relative">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchPlaces(searchQuery, selectedCategories)} className="w-full bg-white/10 rounded-xl px-4 py-1.5 text-sm placeholder-white/60 focus:bg-white focus:text-slate-800 outline-none" placeholder="Search pet spots..." />
          <button onClick={() => fetchPlaces(searchQuery, selectedCategories)} className="absolute right-3 top-1.5 text-white/50">{searching ? <i className="fa-solid fa-spinner fa-spin text-xs"></i> : <i className="fa-solid fa-search text-xs"></i>}</button>
        </div>
      </header>
      <div className="px-4 py-1.5 flex gap-2 overflow-x-auto scrollbar-hide border-b shadow-sm bg-white">
        {categories.map(c => (
          <button key={c.id} onClick={() => toggleCat(c.id)} className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex-shrink-0 transition-all ${selectedCategories.includes(c.id) ? `bg-${c.color}-600 text-white` : 'bg-slate-100 text-slate-400'}`}>
            <i className={`fa-solid ${c.icon} mr-1`}></i> {c.label}
          </button>
        ))}
      </div>
      <div className="flex-1 relative">
        <div ref={mapRef} id="map" className="w-full h-full bg-slate-200"></div>
        <button onClick={centerMap} className="absolute bottom-6 right-6 w-10 h-10 bg-white text-orange-600 rounded-xl shadow-2xl flex items-center justify-center z-[10] border border-slate-100 active:scale-95 transition-all">
          <i className="fa-solid fa-location-crosshairs text-base"></i>
        </button>
      </div>
    </div>
  );
};

// --- App Component ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_v8_profiles') || '[]'));
  const [user, setUser] = useState<UserProfile>(() => JSON.parse(localStorage.getItem('paws_v8_user') || '{"name":"","email":"","phone":"","address":""}'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_v8_active'));
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>(() => JSON.parse(localStorage.getItem('paws_v8_admin_users') || '[]'));
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
        const isPast = rDate < today;
        if (isPast) return false;

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
    localStorage.setItem('paws_v8_profiles', JSON.stringify(profiles));
    localStorage.setItem('paws_v8_user', JSON.stringify(user));
    if (activeId) localStorage.setItem('paws_v8_active', activeId);
    if (user.email && user.name) {
      if (!registeredUsers.some(u => u.email === user.email)) {
        const next = [...registeredUsers, user];
        setRegisteredUsers(next);
        localStorage.setItem('paws_v8_admin_users', JSON.stringify(next));
      }
    }
  }, [profiles, user, activeId]);

  useEffect(() => {
    if (!user.email || !user.name) setView('registration');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => setLocation({ latitude: p.coords.latitude, longitude: p.coords.longitude }));
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
          contents: { parts: [{ inlineData: { data: base64, mimeType: file.type } }, { text: "What is the dog breed in this photo? Just give the breed name. If you cannot identify it, say 'Unknown'." }] }
        });
        const detectedBreed = res.text?.trim() || "Unknown";
        setFormDog(prev => ({ 
          ...prev, 
          breed: detectedBreed, 
          photo: prev.photo || reader.result as string 
        }));
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
      const rec: HealthRecord = { id: Date.now().toString(), type: recordModal.type === 'Vaccination' ? 'Vaccination' : 'Visit', title: recordModal.title, date: recordModal.date, notes: recordModal.notes };
      newRecords.push(rec);
      if (recordModal.scheduleFollowUp && recordModal.followUpRange) {
        const nextDate = parseLocalISO(recordModal.date);
        switch (recordModal.followUpRange) {
          case '1m': nextDate.setMonth(nextDate.getMonth() + 1); break;
          case '3m': nextDate.setMonth(nextDate.getMonth() + 3); break;
          case '6m': nextDate.setMonth(nextDate.getMonth() + 6); break;
          case '1y': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
        }
        newReminders.push({ id: Date.now().toString() + 'rem', date: nextDate.toISOString().split('T')[0], title: `Follow-up: ${recordModal.title}`, type: recordModal.type as any, isBooked: false });
      }
    } else if (recordModal.mode === 'future') {
      newReminders.push({ id: Date.now().toString() + 'fut', date: recordModal.date, title: recordModal.title, type: recordModal.type as any, isBooked: true });
    } else {
      newReminders.push({ id: Date.now().toString() + 'man', date: recordModal.date, title: recordModal.title, type: 'Other', isBooked: false });
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
    <div className="flex flex-col h-[100dvh] w-full max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden font-sans">
      {/* Ultra Compact Header */}
      <header className="bg-orange-600 text-white px-4 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] pb-1.5 flex items-center justify-between shadow-xl z-[100]">
        <div className="flex items-center gap-2">
          <div className="bg-white w-7 h-7 rounded-lg flex items-center justify-center shadow-inner"><i className="fa-solid fa-paw text-orange-600 text-xs"></i></div>
          <h1 className="text-base font-black italic tracking-tighter">paws4life<span className="text-orange-200">.ai</span></h1>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setView('reminders-list')} className="relative w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90">
            <i className="fa-solid fa-bell text-xs"></i>
            {upcomingBadgeCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[7px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-orange-600">
                {upcomingBadgeCount}
              </span>
            )}
          </button>
          <button onClick={() => setView('map')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-map-location-dot text-xs"></i></button>
          <button onClick={() => setView('settings')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-cog text-xs"></i></button>
          <button onClick={() => setView('profiles')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-dog text-xs"></i></button>
        </div>
      </header>

      {/* Main Chat Content - flex-1 for dynamic sizing */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 scrollbar-hide relative">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-2 animate-in">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center text-orange-600 mb-3 shadow-lg border border-orange-50"><i className="fa-solid fa-shield-dog text-xl"></i></div>
            <h2 className="text-lg font-black tracking-tight text-slate-800 mb-1 leading-tight">Hello, {user.name.split(' ')[0] || 'Friend'}</h2>
            <p className="text-[11px] text-slate-500 font-medium mb-4">Canine advice & mapping at your fingertips.</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
               <button onClick={() => setInput("Is chocolate toxic?")} className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-orange-600 transition-all">Toxic Foods</button>
               <button onClick={() => setInput("Pup care schedule")} className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-orange-600 transition-all">Care Tips</button>
            </div>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[88%] p-3 rounded-2xl text-xs shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
              <div className="whitespace-pre-wrap leading-normal">{m.text}</div>
              {m.groundingUrls?.map((u, i) => <a key={i} href={u.uri} target="_blank" className="block text-[9px] mt-1 text-orange-600 font-bold underline truncate">Source: {u.title}</a>)}
            </div>
          </div>
        ))}
        {loading && <div className="p-2.5 bg-white border rounded-xl w-12 flex gap-1 animate-pulse"><div className="w-1 h-1 bg-orange-400 rounded-full"></div><div className="w-1 h-1 bg-orange-400 rounded-full"></div><div className="w-1 h-1 bg-orange-400 rounded-full"></div></div>}
        <div ref={scrollRef} className="h-1" />
      </main>

      {/* Tighter Response Bar - safe area bottom preserved */}
      <footer className="px-3 pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] bg-white border-t shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)] z-[90]">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={activeDog ? `Ask about ${activeDog.name}...` : "Message AI Advisor..."} className="flex-1 bg-slate-50 px-3 py-2 rounded-lg text-sm border border-transparent focus:border-orange-500 outline-none transition-all shadow-inner font-bold" />
          <button disabled={!input.trim() || loading} className="bg-orange-600 text-white w-9 h-9 rounded-lg flex items-center justify-center shadow-lg active:scale-95 transition-all"><i className="fa-solid fa-paper-plane text-xs"></i></button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in pt-[env(safe-area-inset-top,0px)]">
          <header className="bg-orange-600 text-white px-4 py-2 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <h2 className="text-base font-black italic">My Pack</h2>
          </header>
          <div className="flex-1 p-4 space-y-3 overflow-y-auto bg-slate-50">
            <button onClick={() => { setFormDog({ healthRecords: [], reminders: [] }); setView('edit-form'); }} className="w-full py-5 border-2 border-dashed border-orange-200 bg-white text-orange-600 rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-sm">Add Companion</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setFormDog(p); setView('profile-detail'); }} className="p-3.5 bg-white border border-slate-100 rounded-2xl flex items-center gap-3 cursor-pointer hover:shadow-md transition-all">
                <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center border border-white shadow-inner">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-slate-300"></i>}
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-slate-800 text-sm leading-none mb-1">{p.name}</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{p.breed || 'Companion'}</p>
                </div>
                {activeId === p.id && <span className="bg-orange-500 text-white text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest">Active</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'edit-form' && (
        <div className="fixed inset-0 z-[210] bg-white flex flex-col animate-in pt-[env(safe-area-inset-top,0px)]">
          <header className="bg-orange-600 text-white px-4 py-2 flex items-center justify-between">
            <button onClick={() => setView('profiles')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <h2 className="text-base font-black">Edit Dog</h2>
            <button type="submit" form="dogForm" className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-check text-xs"></i></button>
          </header>
          <form id="dogForm" onSubmit={saveDog} className="flex-1 p-4 space-y-4 overflow-y-auto bg-slate-50">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-white rounded-2xl border-2 border-white shadow-xl overflow-hidden relative flex items-center justify-center">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-2xl text-slate-100"></i>}
                <label className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                   <div className="bg-orange-600 text-white w-7 h-7 rounded-lg flex items-center justify-center shadow-2xl border-2 border-white"><i className="fa-solid fa-camera text-[10px]"></i></div>
                   <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && scanBreed(e.target.files[0])} />
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <input required value={formDog.name || ''} onChange={e => setFormDog({ ...formDog, name: e.target.value })} className="w-full bg-white border border-slate-100 px-3 py-2 rounded-lg font-bold outline-none focus:border-orange-500 transition-all text-xs" placeholder="Name *" />
              <div className="relative">
                <input value={formDog.breed || ''} onChange={e => setFormDog({ ...formDog, breed: e.target.value })} className="w-full bg-white border border-slate-100 px-3 py-2 rounded-lg font-bold outline-none focus:border-orange-500 transition-all text-xs pr-10" placeholder="Breed" />
                <label className="absolute right-2 top-1.5 bottom-1.5 bg-orange-100 text-orange-600 w-7 flex items-center justify-center rounded-md cursor-pointer">
                  {loading ? <i className="fa-solid fa-spinner fa-spin text-[10px]"></i> : <i className="fa-solid fa-wand-magic-sparkles text-[10px]"></i>}
                  <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && scanBreed(e.target.files[0])} disabled={loading} />
                </label>
              </div>
              <div className="flex gap-2">
                <input value={formDog.age || ''} onChange={e => setFormDog({ ...formDog, age: e.target.value })} className="flex-1 bg-white border border-slate-100 px-3 py-2 rounded-lg font-bold outline-none text-xs" placeholder="Age" />
                <input value={formDog.weight || ''} onChange={e => setFormDog({ ...formDog, weight: e.target.value })} className="flex-1 bg-white border border-slate-100 px-3 py-2 rounded-lg font-bold outline-none text-xs" placeholder="Weight (kg)" />
              </div>
            </div>
            <div className="space-y-2">
               <button type="button" onClick={() => setRecordModal({ isOpen: true, mode: 'past', type: 'Vaccination', title: '', date: new Date().toISOString().split('T')[0], notes: '', scheduleFollowUp: true, followUpRange: '1y' })} className="w-full bg-slate-900 text-white py-3 rounded-lg font-black uppercase text-[8px] tracking-widest shadow-xl flex items-center justify-center gap-2"><i className="fa-solid fa-clock-rotate-left"></i> Log Past Service</button>
               <button type="button" onClick={() => setRecordModal({ isOpen: true, mode: 'future', type: 'Visit', title: '', date: new Date().toISOString().split('T')[0], notes: '', scheduleFollowUp: false })} className="w-full bg-blue-600 text-white py-3 rounded-lg font-black uppercase text-[8px] tracking-widest shadow-xl flex items-center justify-center gap-2"><i className="fa-solid fa-calendar-check"></i> Book Future Visit</button>
               <button type="button" onClick={() => setRecordModal({ isOpen: true, mode: 'reminder', type: 'Other', title: '', date: new Date().toISOString().split('T')[0], notes: '', scheduleFollowUp: false })} className="w-full bg-slate-100 text-slate-600 py-3 rounded-lg font-black uppercase text-[8px] tracking-widest flex items-center justify-center gap-2"><i className="fa-solid fa-bell"></i> Set Reminder</button>
            </div>
          </form>
          {recordModal && (
            <div className="fixed inset-0 z-[300] bg-slate-900/60 flex items-end justify-center animate-in p-0">
              <div className="bg-white w-full max-w-xl rounded-t-2xl p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] space-y-3 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-black italic">Record Entry</h3>
                  <button onClick={() => setRecordModal(null)} className="text-slate-300 hover:text-slate-800"><i className="fa-solid fa-xmark text-base"></i></button>
                </div>
                <div className="space-y-2">
                  <input autoFocus value={recordModal.title} onChange={e => setRecordModal({...recordModal, title: e.target.value})} placeholder="Title..." className="w-full bg-slate-50 border p-2.5 rounded-lg font-bold outline-none text-xs" />
                  <input type="date" value={recordModal.date} onChange={e => setRecordModal({...recordModal, date: e.target.value})} className="w-full bg-slate-50 border p-2.5 rounded-lg font-bold outline-none text-xs" />
                  <button onClick={handleAddRecord} className="w-full bg-slate-900 text-white py-3 rounded-lg font-black uppercase tracking-widest shadow-xl text-[9px]">Save Event</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'profile-detail' && formDog && (
        <div className="fixed inset-0 z-[220] bg-white flex flex-col animate-in pt-[env(safe-area-inset-top,0px)]">
          <header className="bg-orange-600 text-white px-4 py-2 flex items-center justify-between shadow-md">
            <button onClick={() => setView('profiles')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <h2 className="text-base font-black italic">Dog Info</h2>
            <button onClick={() => setView('edit-form')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-pen-to-square text-xs"></i></button>
          </header>
          <div className="flex-1 p-4 space-y-5 overflow-y-auto bg-slate-50 scrollbar-hide pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white rounded-xl overflow-hidden border-2 border-white shadow-xl flex items-center justify-center">
                {formDog.photo ? <img src={formDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-2xl text-slate-100"></i>}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-slate-800 leading-none mb-1">{formDog.name}</h3>
                <p className="text-[9px] text-orange-600 font-bold uppercase tracking-widest mb-2">{formDog.breed || 'Unique Dog'}</p>
                <button onClick={() => { setActiveId(formDog.id!); setView('chat'); }} className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-widest shadow-sm transition-all ${activeId === formDog.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border'}`}>
                  {activeId === formDog.id ? 'Active' : 'Select'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-400">Past Records</h3>
              <div className="space-y-1.5">
                {formDog.healthRecords?.sort((a,b) => b.date.localeCompare(a.date)).map(r => (
                  <div key={r.id} className="p-2.5 bg-white border border-slate-100 rounded-xl flex items-center gap-2.5 shadow-sm">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white ${r.type === 'Vaccination' ? 'bg-orange-500' : 'bg-blue-500'}`}><i className={`fa-solid ${r.type === 'Vaccination' ? 'fa-syringe' : 'fa-calendar-check'} text-[10px]`}></i></div>
                    <div className="flex-1"><div className="text-xs font-black text-slate-800 leading-none mb-0.5">{r.title}</div><div className="text-[8px] text-slate-400 font-bold uppercase">{r.date}</div></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-400">Future Bookings</h3>
              <div className="space-y-1.5">
                {formDog.reminders?.filter(r => parseLocalISO(r.date) >= getTodayAtMidnight() && r.isBooked).sort((a,b) => a.date.localeCompare(b.date)).map(r => (
                  <div key={r.id} className="p-2.5 bg-blue-600 text-white rounded-xl flex items-center gap-2.5 shadow-md">
                    <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center"><i className="fa-solid fa-calendar-check text-[10px]"></i></div>
                    <div className="flex-1"><div className="text-xs font-black leading-none mb-0.5">{r.title}</div><div className="text-[8px] opacity-70 font-bold uppercase">{r.date}</div></div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => { if(confirm("Archive profile?")) { setProfiles(p => p.filter(d => d.id !== formDog.id)); setView('profiles'); } }} className="w-full text-red-400 font-black uppercase text-[8px] tracking-[0.2em] py-3.5 border border-red-50 rounded-xl bg-red-50/20 active:bg-red-50">Archive Profile</button>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[230] bg-white flex flex-col animate-in pt-[env(safe-area-inset-top,0px)]">
          <header className="bg-orange-600 text-white px-4 py-2 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <h2 className="text-lg font-black italic">Settings</h2>
          </header>
          <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-slate-50">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-2.5">
              <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} className="w-full bg-slate-50 border p-2.5 rounded-lg font-bold outline-none text-xs" placeholder="Full Name" />
              <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} className="w-full bg-slate-50 border p-2.5 rounded-lg font-bold outline-none text-xs" placeholder="Email" />
              <input value={user.phone} onChange={e => setUser({ ...user, phone: e.target.value })} className="w-full bg-slate-50 border p-2.5 rounded-lg font-bold outline-none text-xs" placeholder="Mobile" />
            </div>
            <button onClick={() => setView('admin')} className="w-full py-2.5 text-slate-300 font-black uppercase text-[7px] tracking-widest border border-dashed border-slate-200 rounded-lg">Governance</button>
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[240] bg-white flex flex-col animate-in pt-[env(safe-area-inset-top,0px)]">
          <header className="bg-orange-600 text-white px-4 py-2 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center transition-all active:scale-90"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <h2 className="text-lg font-black italic">Schedule</h2>
          </header>
          <div className="flex-1 p-3 space-y-1.5 overflow-y-auto bg-slate-50">
            {getFilteredReminders(30).length === 0 ? <div className="text-center py-20 text-slate-300 italic text-xs">All clear!</div> : 
              getFilteredReminders(30).map(r => (
                <div key={r.id} className={`p-3 rounded-2xl flex items-center gap-3 shadow-sm border transition-all ${r.isBooked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-800 border-slate-100'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.isBooked ? 'bg-white/20' : 'bg-orange-100 text-orange-600'}`}><i className={`fa-solid ${r.isBooked ? 'fa-calendar-check' : 'fa-bell'} text-[10px]`}></i></div>
                  <div className="flex-1">
                    <div className="text-xs font-black leading-tight mb-0.5">{r.title}</div>
                    <div className={`text-[8px] font-bold uppercase tracking-widest ${r.isBooked ? 'opacity-70' : 'text-slate-400'}`}>{r.dog}</div>
                  </div>
                  <div className={`text-[8px] font-black px-1.5 py-0.5 rounded-md ${r.isBooked ? 'bg-white/20' : 'bg-orange-50 text-orange-600'}`}>{r.date}</div>
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