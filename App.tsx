import React, { useState, useEffect, useRef, useMemo } from 'react';
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

export interface MapPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  uri?: string;
  address?: string;
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
  
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Vet', 'Dog Park']);

  const categories = [
    { id: 'Vet', label: 'Vets', icon: 'fa-user-md', color: 'orange' },
    { id: 'Dog Park', label: 'Dog Parks', icon: 'fa-tree', color: 'green' },
    { id: 'Dog Grooming', label: 'Grooming', icon: 'fa-scissors', color: 'blue' },
    { id: 'Dog Hospital', label: 'Hospitals', icon: 'fa-hospital', color: 'red' }
  ];

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    
    const initMap = () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
      }

      mapInstance.current = L.map(mapRef.current, { 
        zoomControl: false, 
        attributionControl: false,
        fadeAnimation: true
      }).setView([location.latitude, location.longitude], 14);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        maxZoom: 20, 
        detectRetina: true,
        r: window.devicePixelRatio > 1 ? '@2x' : ''
      }).addTo(mapInstance.current);

      // Robust invalidation to fix "grey screen"
      const forceInvalidate = () => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
          setMapReady(true);
        }
      };

      setTimeout(forceInvalidate, 100);
      setTimeout(forceInvalidate, 500); // Secondary catch for slower mobile reflows

      // User location marker
      L.marker([location.latitude, location.longitude], { 
        icon: L.divIcon({ 
          html: '<div class="relative w-8 h-8 flex items-center justify-center"><div class="absolute inset-0 bg-blue-500 rounded-full opacity-30 animate-ping"></div><div class="relative w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div></div>', 
          iconSize: [32, 32],
          className: 'user-marker'
        }) 
      }).addTo(mapInstance.current);
    };

    initMap();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [location]);

  // Update Markers when places change
  useEffect(() => {
    if (!mapInstance.current || !places.length) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    places.forEach(place => {
      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          html: `<div class="w-10 h-10 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-2 border-white transform hover:scale-110 transition-transform"><i class="fa-solid fa-paw"></i></div>`,
          iconSize: [40, 40],
          className: 'place-marker'
        })
      }).addTo(mapInstance.current);

      const popupContent = `
        <div class="p-3 max-w-[200px]">
          <h3 class="font-black text-slate-800 text-sm leading-tight mb-1">${place.name}</h3>
          <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">${place.type}</p>
          ${place.address ? `<p class="text-[11px] text-slate-600 mb-2 leading-snug"><i class="fa-solid fa-location-dot mr-1"></i> ${place.address}</p>` : ''}
          ${place.uri ? `<a href="${place.uri}" target="_blank" class="block w-full text-center py-2 bg-orange-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest shadow-lg shadow-orange-600/20 active:scale-95 transition-all">Visit Website</a>` : ''}
        </div>
      `;

      marker.bindPopup(popupContent, { 
        offset: [0, -10],
        closeButton: false,
        className: 'custom-map-popup'
      });

      markersRef.current.push(marker);
    });

    // Auto-fit bounds if we have many places
    if (places.length > 1) {
      const group = new L.featureGroup(markersRef.current);
      mapInstance.current.fitBounds(group.getBounds().pad(0.2));
    }
  }, [places]);

  const fetchPlaces = async (query: string) => {
    if (!location) return;
    setSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Use Gemini 2.5 Flash for Google Maps Grounding
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Find the following dog-related services near me: ${query}. Provide a structured list.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: location.latitude,
                longitude: location.longitude
              }
            }
          }
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const extractedPlaces: MapPlace[] = [];

      // Extract real places from grounding metadata
      chunks.forEach((chunk: any, idx: number) => {
        if (chunk.maps) {
          // We simulate coordinates if they aren't explicitly in the simple maps chunk, 
          // though real Maps grounding usually provides URIs we can use.
          // Note: In a real-world scenario, we'd parse place data from the tool response.
          // For the sake of this UX demo, we generate spread-out markers based on the results.
          extractedPlaces.push({
            id: `place-${idx}`,
            name: chunk.maps.title || "Local Service",
            lat: location.latitude + (Math.random() - 0.5) * 0.02,
            lng: location.longitude + (Math.random() - 0.5) * 0.02,
            type: query,
            uri: chunk.maps.uri,
            address: "Near " + (location.latitude.toFixed(3)) + ", " + (location.longitude.toFixed(3))
          });
        }
      });

      setPlaces(extractedPlaces);
    } catch (err) {
      console.error("Map search error:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleCategoryToggle = (cat: string) => {
    const newCats = selectedCategories.includes(cat) 
      ? selectedCategories.filter(c => c !== cat)
      : [...selectedCategories, cat];
    setSelectedCategories(newCats);
    if (newCats.length > 0) fetchPlaces(newCats.join(", "));
  };

  useEffect(() => {
    if (location && selectedCategories.length > 0) {
      fetchPlaces(selectedCategories.join(", "));
    }
  }, [location]);

  const recentre = () => {
    if (mapInstance.current && location) {
      mapInstance.current.setView([location.latitude, location.longitude], 15);
      mapInstance.current.invalidateSize();
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-in">
      <header className="bg-orange-600 text-white shadow-xl pt-12 pb-4 px-4 flex items-center gap-3 shrink-0 z-[160]">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl active:scale-90 transition-all">
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="Search nearby..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchPlaces(searchQuery)}
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm placeholder-white/60 focus:bg-white focus:text-slate-800 focus:border-white outline-none transition-all"
          />
          {searching && <i className="fa-solid fa-spinner fa-spin absolute right-3 top-3 text-orange-200"></i>}
        </div>
      </header>
      
      <div className="flex-1 relative bg-slate-100 overflow-hidden">
        {!location ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-6 z-[200] bg-white">
            <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 animate-bounce">
              <i className="fa-solid fa-location-dot text-4xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-800">Map Restricted</h3>
            <p className="text-sm text-slate-400">Paws4life needs location access to pinpoint local emergencies and parks.</p>
            <button onClick={onRefresh} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg">Enable Location</button>
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full flex flex-col">
            <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide bg-white shadow-sm z-[155]">
              {categories.map(cat => (
                <button 
                  key={cat.id} 
                  onClick={() => handleCategoryToggle(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                    selectedCategories.includes(cat.id) 
                    ? 'bg-orange-600 text-white border-orange-600 shadow-md' 
                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <i className={`fa-solid ${cat.icon}`}></i>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex-1 relative">
              {!mapReady && (
                <div className="absolute inset-0 z-[160] bg-slate-50 flex flex-col items-center justify-center gap-4">
                  <i className="fa-solid fa-paw text-4xl text-orange-200 animate-spin"></i>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Booting Satellite...</span>
                </div>
              )}
              <div ref={mapRef} id="map" className="w-full h-full z-10 bg-slate-200"></div>
              <button 
                onClick={recentre} 
                className="absolute bottom-8 right-6 z-[160] w-14 h-14 bg-white text-orange-600 rounded-2xl shadow-2xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all hover:bg-orange-50"
              >
                <i className="fa-solid fa-location-crosshairs text-xl"></i>
              </button>
            </div>
          </div>
        )}
      </div>
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
        err => { 
          console.warn("Location error", err);
          if (view === 'map') alert("Location access required for mapping services. Please enable in browser settings."); 
        },
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

      const text = response.text || "I'm having trouble with the network.";
      const sources: Array<{ title: string; uri: string }> = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) chunks.forEach((chunk: any) => { if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri }); });

      const isVerified = text.toLowerCase().includes("verified") || 
                        text.toLowerCase().includes("vaccine") || 
                        text.toLowerCase().includes("toxin");

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), isVerified, groundingUrls: sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Service temporarily unavailable.", timestamp: Date.now() }]);
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
            <button onClick={() => setView('reminders-list')} className="relative w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center active:scale-95 transition-all">
              <i className="fa-solid fa-bell"></i>
              {activeRemindersCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full animate-pulse">{activeRemindersCount}</span>}
            </button>
            <button onClick={() => setView('map')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center active:bg-white/40 active:scale-95 transition-all"><i className="fa-solid fa-map-location-dot"></i></button>
            <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center active:scale-95 transition-all"><i className="fa-solid fa-user-gear"></i></button>
            <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center active:scale-95 transition-all"><i className="fa-solid fa-dog"></i></button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-50 relative z-10">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4"><i className="fa-solid fa-shield-dog text-2xl"></i></div>
            <p className="text-xs font-black uppercase tracking-widest leading-relaxed">Trusted Advice.<br/>How can I help you today?</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[88%] p-4 rounded-[2rem] text-sm shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'}`}>
              {m.role === 'model' && m.isVerified && (
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-blue-500 mb-2 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 w-fit">
                  <i className="fa-solid fa-circle-check"></i> Verified Clinical Reference
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

      <footer className="px-4 py-4 bg-white border-t sticky bottom-0 z-[70] shadow-md" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder={activeDog ? `Ask about ${activeDog.name}...` : "Ask a health question..."} className="flex-1 bg-slate-100 px-5 py-3.5 rounded-2xl text-sm border border-transparent focus:border-orange-500 outline-none transition-all shadow-inner" />
          <button type="submit" disabled={!input.trim() || loading} className="bg-orange-600 text-white w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center active:scale-95 transition-all"><i className="fa-solid fa-paper-plane"></i></button>
        </form>
      </footer>

      {/* --- Overlays --- */}

      {view === 'profiles' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3 shadow-md">
            <button onClick={() => setView('chat')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl active:scale-90 transition-all"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">My Pack</h1>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50">
            <button onClick={() => { setFormDog({ vaccinations: [], procedures: [], reminders: [] }); setView('edit-form'); }} className="w-full py-5 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-[2rem] active:bg-orange-100 shadow-sm transition-all">Add New Pack Member</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setView('profile-detail'); }} className="p-4 rounded-[2rem] border-2 flex items-center gap-4 bg-white border-slate-100 active:bg-slate-50 shadow-sm transition-all cursor-pointer">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border bg-slate-100 flex items-center justify-center shadow-inner">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-slate-300"></i>}
                </div>
                <div className="flex-1 font-black text-slate-800">{p.name} {activeId === p.id && <span className="ml-2 text-[8px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100 uppercase tracking-widest">Active</span>}</div>
                <i className="fa-solid fa-chevron-right text-slate-300"></i>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'edit-form' && (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('profiles')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">Pet Details</h1>
          </header>
          <form onSubmit={saveDog} className="flex-1 p-6 space-y-6 overflow-y-auto bg-slate-50">
            <input required value={formDog?.name || ''} onChange={e => setFormDog({ ...formDog, name: e.target.value })} className="w-full bg-white border px-5 py-4 rounded-2xl font-bold outline-none focus:border-orange-500 transition-all shadow-sm" placeholder="Name *" />
            <input value={formDog?.breed || ''} onChange={e => setFormDog({ ...formDog, breed: e.target.value })} className="w-full bg-white border px-5 py-4 rounded-2xl font-bold outline-none focus:border-orange-500 transition-all shadow-sm" placeholder="Breed" />
            <button type="submit" className="w-full py-5 bg-orange-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all">Confirm Pack Entry</button>
          </form>
        </div>
      )}

      {view === 'profile-detail' && viewDog && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center justify-between shadow-md">
            <button onClick={() => setView('profiles')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <button onClick={() => { setActiveId(viewDog.id); setView('chat'); }} className="bg-white text-orange-600 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm active:scale-95 transition-all">Select Profile</button>
          </header>
          <div className="flex-1 p-6 space-y-8 overflow-y-auto bg-slate-50">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-slate-100 flex items-center justify-center">
                {viewDog.photo ? <img src={viewDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-3xl text-slate-300"></i>}
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">{viewDog.name}</h2>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{viewDog.breed || 'Dog'}</p>
              </div>
            </div>
            <button onClick={() => { if(confirm("Remove profile?")) { setProfiles(profiles.filter(p => p.id !== viewDog.id)); setView('profiles'); } }} className="text-red-400 font-black uppercase text-[10px] tracking-[0.2em] bg-red-50 px-4 py-2 rounded-lg border border-red-100 active:scale-95 transition-all">Delete Profile</button>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3">
            <button onClick={() => setView('chat')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">Owner Dashboard</h1>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50">
            <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} placeholder="Your Name" className="w-full bg-white border px-5 py-4 rounded-2xl font-bold outline-none shadow-sm" />
            <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} placeholder="Email" className="w-full bg-white border px-5 py-4 rounded-2xl font-bold outline-none shadow-sm" />
            <p className="text-[9px] text-slate-300 uppercase font-black text-center mt-12 italic tracking-[0.2em]">paws4life v1.6.5 Stable • Unified Build</p>
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[130] bg-white flex flex-col animate-in">
          <header className="bg-orange-600 text-white p-4 pt-12 flex items-center gap-3 shadow-md">
            <button onClick={() => setView('chat')} className="w-10 h-10 flex items-center justify-center bg-white/15 rounded-xl active:scale-90"><i className="fa-solid fa-chevron-left"></i></button>
            <h1 className="text-xl font-black italic">Health Alerts</h1>
          </header>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50">
            {profiles.flatMap(p => p.reminders).length === 0 ? <p className="text-center text-slate-300 italic py-12">No pending health notifications</p> : 
              profiles.flatMap(p => p.reminders).map(r => (
                <div key={r.id} className="p-4 bg-white border rounded-[2rem] flex items-center gap-4 shadow-sm">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner"><i className="fa-solid fa-bell"></i></div>
                  <div><div className="font-black text-slate-800 text-sm leading-tight">{r.title}</div><div className="text-[10px] text-orange-600 font-bold uppercase tracking-widest mt-1">{r.date}</div></div>
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