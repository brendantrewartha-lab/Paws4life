
import React, { useState, useEffect, useRef } from 'react';
import { DogProfile, Message, UserLocation, HealthRecord, DogReminder, UserProfile } from './types';
import { generateDogAdvice } from './services/geminiService';

declare const L: any;

// --- Components ---

const Header: React.FC<{ title: string; onBack?: () => void; actions?: React.ReactNode }> = ({ title, onBack, actions }) => (
  <header className="bg-orange-600 text-white shadow-xl z-[60] shrink-0 border-b border-orange-500/30">
    <div style={{ height: 'max(env(safe-area-inset-top), 44px)' }} className="w-full"></div>
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
      <button onClick={onAdd} className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center hover:bg-orange-200 transition-all shadow-sm">
        <i className="fa-solid fa-plus text-xs"></i>
      </button>
    )}
  </div>
);

const MapView: React.FC<{ location?: UserLocation; onRefresh: () => void; onClose: () => void }> = ({ location, onRefresh, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    
    // Initialize map
    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    mapInstance.current = L.map(mapRef.current, { 
      zoomControl: false, 
      attributionControl: false,
      fadeAnimation: true
    }).setView([location.latitude, location.longitude], 15);

    // High-Resolution CartoDB Voyager Retina Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
      maxZoom: 20, 
      detectRetina: true,
      // Use @2x for retina displays (iPhone/High-res PC)
      r: window.devicePixelRatio > 1 ? '@2x' : ''
    }).addTo(mapInstance.current);

    // CRITICAL FIX: The "Grey Screen" happens because Leaflet doesn't know the container size 
    // when it's rendered inside a hidden/transitioning div.
    setTimeout(() => {
      if (mapInstance.current) {
        mapInstance.current.invalidateSize();
      }
    }, 400);

    const icon = (color: string, iconName: string) => L.divIcon({ 
        html: `<div class="w-10 h-10 bg-${color}-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-2 border-white transform transition-transform hover:scale-110"><i class="fa-solid fa-${iconName}"></i></div>`, 
        iconSize: [40, 40], className: 'custom-marker' 
    });

    // User Position
    L.marker([location.latitude, location.longitude], { 
      icon: L.divIcon({ html: '<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>', iconSize: [24, 24] }) 
    }).addTo(mapInstance.current).bindPopup('<b class="text-blue-600">You are here</b>');
    
    // Simulated POIs
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
      <Header title="Local Services" onBack={onClose} />
      <div className="flex-1 relative bg-slate-50 overflow-hidden">
        {!location ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-6 z-[200]">
            <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 animate-bounce">
              <i className="fa-solid fa-location-dot text-4xl"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">Map restricted</h3>
              <p className="text-sm text-slate-400 leading-relaxed">To see local Vets and Parks, please enable location access in your device settings.</p>
            </div>
            <button 
              onClick={onRefresh} 
              className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-xl shadow-orange-600/20 active:scale-95 transition-all"
            >
              Grant Permission
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full">
            <div ref={mapRef} id="map" className="w-full h-full"></div>
            <button 
              onClick={onRefresh} 
              className="absolute bottom-8 right-6 z-[160] w-14 h-14 bg-white text-orange-600 rounded-2xl shadow-2xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all"
            >
              <i className="fa-solid fa-location-crosshairs text-xl"></i>
            </button>
          </div>
        )}
      </div>
      <footer className="p-4 flex gap-3 overflow-x-auto scrollbar-hide bg-white border-t border-slate-100 shrink-0">
        <div className="px-5 py-3 bg-orange-50 text-orange-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border border-orange-100">Nearby Vets</div>
        <div className="px-5 py-3 bg-green-50 text-green-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border border-green-100">Dog Parks</div>
        <div className="px-5 py-3 bg-blue-50 text-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border border-blue-100">Grooming</div>
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
  
  // Fix: Added missing formDog state to handle creation and editing of dog profiles
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
          console.warn("Location error:", err);
          if (view === 'map') alert("Please enable location permissions in your iPhone Settings to see local services.");
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
        const { text, sources, isVerified } = await generateDogAdvice(input, messages, location, activeDog || undefined);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), isVerified, groundingUrls: sources }]);
    } catch (err) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Connection issues. Please try again.", timestamp: Date.now() }]);
    } finally {
        setLoading(false);
    }
  };

  // Fix: Added missing saveDog function to persist profile changes
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
      allergies: formDog.allergies || '',
      conditions: formDog.conditions || '',
      homeLocation: formDog.homeLocation || '',
    };

    if (formDog.id) {
      setProfiles(prev => prev.map(p => p.id === formDog.id ? newDog : p));
    } else {
      setProfiles(prev => [...prev, newDog]);
      if (!activeId) setActiveId(newDog.id);
    }
    setView('profiles');
    setFormDog(null);
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden font-sans">
      <Header title="paws4life" actions={
        <>
          <button onClick={() => setView('reminders-list')} className="relative w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all">
            <i className="fa-solid fa-bell"></i>
            {activeRemindersCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-orange-600 animate-pulse">{activeRemindersCount}</span>}
          </button>
          <button onClick={() => setView('map')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"><i className="fa-solid fa-map-location-dot"></i></button>
          <button onClick={() => setView('settings')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"><i className="fa-solid fa-user-gear"></i></button>
          <button onClick={() => setView('profiles')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"><i className="fa-solid fa-dog"></i></button>
        </>
      }/>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4"><i className="fa-solid fa-shield-dog text-2xl"></i></div>
            <p className="text-xs font-black uppercase tracking-widest leading-relaxed">How can I help you and<br/>your pack today?</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[88%] p-4 rounded-[2rem] text-sm shadow-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'}`}>
              {m.role === 'model' && m.isVerified && (
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-blue-500 mb-2 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 w-fit">
                  <i className="fa-solid fa-circle-check"></i> Verified knowledge base reference
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
          <Header title="My Pack" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            {/* Fix: setFormDog is now defined and accessible here */}
            <button onClick={() => { setFormDog({ vaccinations: [], procedures: [], reminders: [] }); setView('edit-form'); }} className="w-full py-5 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-[2rem] active:scale-[0.98] transition-all">Add Pack Member</button>
            {profiles.length === 0 ? (
              <div className="p-12 text-center space-y-3 opacity-30">
                <i className="fa-solid fa-dog text-4xl"></i>
                <p className="text-xs font-black uppercase tracking-widest italic">Your pack is empty</p>
              </div>
            ) : profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setView('profile-detail'); }} className="p-4 rounded-[2rem] border-2 flex items-center gap-4 bg-white border-slate-100 active:bg-slate-50 transition-all cursor-pointer">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border shadow-sm bg-slate-100 flex items-center justify-center">
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
          <Header title={formDog?.id ? "Edit Member" : "Add to Pack"} onBack={() => setView('profiles')} />
          <form onSubmit={saveDog} className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Dog Name</label>
                <input required value={formDog?.name || ''} onChange={e => setFormDog({ ...formDog, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none focus:border-orange-500 transition-all" placeholder="e.g. Buddy" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Breed</label>
                <input value={formDog?.breed || ''} onChange={e => setFormDog({ ...formDog, breed: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none focus:border-orange-500 transition-all" placeholder="e.g. Golden Retriever" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Age</label>
                  <input value={formDog?.age || ''} onChange={e => setFormDog({ ...formDog, age: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none focus:border-orange-500 transition-all" placeholder="e.g. 3 years" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Weight</label>
                  <input value={formDog?.weight || ''} onChange={e => setFormDog({ ...formDog, weight: e.target.value })} className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none focus:border-orange-500 transition-all" placeholder="e.g. 25kg" />
                </div>
              </div>
            </div>
            <button type="submit" className="w-full py-5 bg-orange-600 text-white font-black rounded-2xl shadow-xl shadow-orange-600/20 active:scale-95 transition-all mt-4">Save Member</button>
          </form>
        </div>
      )}

      {view === 'profile-detail' && viewDog && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-in">
          <Header title={viewDog.name} onBack={() => setView('profiles')} actions={
            <button onClick={() => { setActiveId(viewDog.id); setView('chat'); }} className="bg-white text-orange-600 px-4 py-2 rounded-xl text-xs font-black uppercase shadow-sm active:scale-95 transition-all">Set Active</button>
          }/>
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-white shadow-2xl bg-slate-100 flex items-center justify-center shrink-0">
                {viewDog.photo ? <img src={viewDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-3xl text-slate-300"></i>}
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">{viewDog.name}</h2>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">{viewDog.breed || 'Unknown Breed'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Age</div>
                <div className="font-bold text-slate-800">{viewDog.age || '--'}</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase mb-1">Weight</div>
                <div className="font-bold text-slate-800">{viewDog.weight || '--'}</div>
              </div>
            </div>

            <SectionHeader title="Vaccinations" />
            {viewDog.vaccinations.length === 0 ? (
              <div className="bg-slate-50/50 p-6 rounded-3xl border border-dashed border-slate-200 text-center italic text-xs text-slate-400">No vaccination records added.</div>
            ) : (
              <div className="space-y-3">
                {viewDog.vaccinations.map(v => (
                  <div key={v.id} className="p-4 bg-white border rounded-2xl flex justify-between items-center shadow-sm">
                    <div>
                      <div className="font-bold text-sm text-slate-800">{v.title}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{v.date}</div>
                    </div>
                    <div className="w-8 h-8 bg-blue-50 text-blue-400 rounded-lg flex items-center justify-center"><i className="fa-solid fa-syringe text-sm"></i></div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 pt-6">
              <button onClick={() => { setFormDog(viewDog); setView('edit-form'); }} className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl active:bg-slate-200 transition-all">Edit Member Profile</button>
              <button onClick={() => { if(confirm("Permanently remove from pack?")) { setProfiles(profiles.filter(p => p.id !== viewDog.id)); if(activeId === viewDog.id) setActiveId(null); setView('profiles'); } }} className="w-full py-2 text-red-300 text-[10px] font-black uppercase tracking-widest hover:text-red-500 transition-colors">Delete Member</button>
            </div>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <Header title="Settings" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            <SectionHeader title="User Profile" />
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Your Name</label>
                <input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} placeholder="Full Name" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Email</label>
                <input value={user.email} onChange={e => setUser({ ...user, email: e.target.value })} placeholder="Email Address" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none" />
              </div>
            </div>
            <div className="pt-12 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400 border"><i className="fa-solid fa-cog"></i></div>
              <p className="text-[9px] text-slate-300 uppercase tracking-[0.2em] font-black">paws4life v1.6.0 Stable</p>
            </div>
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[130] bg-white flex flex-col animate-in">
          <Header title="Reminders" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            {profiles.flatMap(p => p.reminders.map(r => ({ ...r, dogName: p.name }))).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                <i className="fa-solid fa-calendar-check text-5xl mb-6"></i>
                <p className="text-sm font-black uppercase tracking-widest italic">All caught up!</p>
              </div>
            ) : (
              profiles.flatMap(p => p.reminders.map(r => ({ ...r, dogName: p.name }))).sort((a,b) => a.date.localeCompare(b.date)).map(r => (
                <div key={r.id} className="p-4 bg-orange-50 border border-orange-100 rounded-[2rem] flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-600 shadow-sm border border-orange-50 shrink-0"><i className="fa-solid fa-bell"></i></div>
                  <div className="flex-1">
                    <div className="font-black text-slate-800 text-sm leading-tight">{r.title}</div>
                    <div className="text-[10px] text-orange-600 font-bold uppercase tracking-wide mt-0.5">{r.dogName} • {r.date}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {view === 'map' && <MapView location={location} onRefresh={requestLocation} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;
