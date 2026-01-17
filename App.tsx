import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
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

const RecordForm: React.FC<{ type: 'vaccinations' | 'reminders'; onSave: (title: string, date: string) => void; onClose: () => void }> = ({ type, onSave, onClose }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center animate-in p-4">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
          <i className={type === 'vaccinations' ? 'fa-solid fa-syringe text-blue-500' : 'fa-solid fa-calendar-plus text-orange-500'}></i>
          {type === 'vaccinations' ? 'Add Vaccination' : 'Add Reminder'}
        </h3>
        <div className="space-y-4">
          <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" placeholder="Rabies, Vet Appt, etc." />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none" />
        </div>
        <div className="flex gap-2 mt-8">
          <button onClick={onClose} className="flex-1 py-4 text-slate-400 font-bold uppercase tracking-widest text-xs">Cancel</button>
          <button onClick={() => { if (title) onSave(title, date); }} className="flex-[2] py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg shadow-orange-600/20">Save</button>
        </div>
      </div>
    </div>
  );
};

const MapView: React.FC<{ location?: UserLocation; onRefresh: () => void; onClose: () => void }> = ({ location, onRefresh, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    if (mapInstance.current) mapInstance.current.remove();

    // High-Resolution CartoDB Voyager Retina-Ready Tiles
    mapInstance.current = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([location.latitude, location.longitude], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, detectRetina: true }).addTo(mapInstance.current);

    const icon = (color: string, icon: string) => L.divIcon({ 
        html: `<div class="w-10 h-10 bg-${color}-600 rounded-2xl flex items-center justify-center text-white shadow-xl border-2 border-white"><i class="fa-solid fa-${icon}"></i></div>`, 
        iconSize: [40, 40], className: 'custom-marker' 
    });

    L.marker([location.latitude, location.longitude], { icon: L.divIcon({ html: '<div class="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>', iconSize: [24, 24] }) }).addTo(mapInstance.current);
    
    // Interesting Simulated POIs
    const spots = [
        { lat: location.latitude + 0.003, lng: location.longitude + 0.004, name: 'Vet Emergency Center', type: 'hospital', color: 'orange' },
        { lat: location.latitude - 0.002, lng: location.longitude - 0.005, name: 'Golden Bark Park', type: 'tree', color: 'green' },
        { lat: location.latitude + 0.006, lng: location.longitude - 0.002, name: 'The Grooming Den', type: 'scissors', color: 'blue' },
    ];

    spots.forEach(s => L.marker([s.lat, s.lng], { icon: icon(s.color, s.type) }).addTo(mapInstance.current).bindPopup(`<b>${s.name}</b>`));

    return () => { if (mapInstance.current) mapInstance.current.remove(); };
  }, [location]);

  return (
    <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-in">
      <Header title="Local Services" onBack={onClose} />
      <div className="flex-1 relative bg-slate-50">
        {!location ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-6">
            <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600"><i className="fa-solid fa-location-dot text-4xl"></i></div>
            <h3 className="text-xl font-black text-slate-800">Location Required</h3>
            <p className="text-sm text-slate-400">Enable location to find reputable local clinics and parks.</p>
            <button onClick={onRefresh} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg active:scale-95 transition-all">Grant Access</button>
          </div>
        ) : (
          <>
            <div ref={mapRef} className="h-full w-full" id="map"></div>
            <button onClick={onRefresh} className="absolute bottom-6 right-6 z-[160] w-14 h-14 bg-white text-orange-600 rounded-2xl shadow-2xl flex items-center justify-center border"><i className="fa-solid fa-location-crosshairs text-xl"></i></button>
          </>
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
  const [recordForm, setRecordForm] = useState<{type: 'vaccinations' | 'reminders'} | null>(null);
  const [formDog, setFormDog] = useState<Partial<DogProfile>>({ name: '', breed: '', age: '', weight: '', photo: '', vaccinations: [], procedures: [], reminders: [] });
  const [viewId, setViewId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeDog = profiles.find(p => p.id === activeId) || null;
  const viewedDog = profiles.find(p => p.id === viewId) || null;
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
        err => alert("Please enable location permissions in your browser or iPhone settings."),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  useEffect(() => { requestLocation(); }, []);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const { text, sources, isVerified } = await generateDogAdvice(input, messages, location, activeDog || undefined);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), isVerified, groundingUrls: sources }]);
    setLoading(false);
  };

  const saveDog = () => {
    if (!formDog.name) return alert("Name is required.");
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
    else { setProfiles(prev => [...prev, dog]); setActiveId(dog.id); }
    setViewId(dog.id); setView('profile-detail');
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
            <button onClick={() => { setFormDog({ vaccinations: [], procedures: [], reminders: [] }); setView('edit-form'); }} className="w-full py-5 border-2 border-dashed border-orange-200 bg-orange-50 text-orange-600 font-black rounded-[2rem]">Add Pack Member</button>
            {profiles.map(p => (
              <div key={p.id} onClick={() => { setViewId(p.id); setView('profile-detail'); }} className="p-4 rounded-[2rem] border-2 flex items-center gap-4 bg-white border-slate-100">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border shadow-sm">{p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-slate-300 m-4"></i>}</div>
                <div className="flex-1 font-black text-slate-800">{p.name}</div>
                <i className="fa-solid fa-chevron-right text-slate-300"></i>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'profile-detail' && viewedDog && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-in">
          <Header title={viewedDog.name} onBack={() => setView('profiles')} actions={
            <button onClick={() => { setFormDog(viewedDog); setView('edit-form'); }} className="px-5 bg-white text-orange-600 rounded-xl font-black h-10 shadow-sm">Edit</button>
          }/>
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center gap-6">
              <div className="w-28 h-28 rounded-[2.5rem] overflow-hidden border-4 border-orange-50 shrink-0 shadow-lg">{viewedDog.photo ? <img src={viewedDog.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-50 flex items-center justify-center"><i className="fa-solid fa-dog text-3xl text-slate-200"></i></div>}</div>
              <div><h2 className="text-3xl font-black text-slate-800">{viewedDog.name}</h2><p className="text-orange-600 font-black uppercase text-[10px] tracking-widest">{viewedDog.breed || 'Dog'}</p></div>
            </div>
            <button onClick={() => { setActiveId(viewedDog.id); setView('chat'); }} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black">Select as Active Pet</button>
            <SectionHeader title="Vaccinations" />
            <div className="space-y-3">{viewedDog.vaccinations.map(v => (<div key={v.id} className="p-4 bg-slate-50 border rounded-2xl flex justify-between items-center"><span className="font-bold">{v.title}</span><span className="text-[10px] font-black text-slate-400">{v.date}</span></div>))}</div>
            <SectionHeader title="Reminders" />
            <div className="space-y-3">{viewedDog.reminders.map(r => (<div key={r.id} className="p-4 bg-orange-50 border border-orange-100 rounded-2xl flex justify-between items-center"><span className="font-bold text-slate-800">{r.title}</span><span className="text-[10px] font-black text-orange-600">{r.date}</span></div>))}</div>
          </div>
        </div>
      )}

      {view === 'edit-form' && (
        <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-in">
          <Header title="Details" onBack={() => setView('profiles')} />
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            <input type="text" value={formDog.name} onChange={e => setFormDog(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Dog Name *" />
            <input type="text" value={formDog.breed} onChange={e => setFormDog(p => ({ ...p, breed: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Breed" />
            <SectionHeader title="Health Tracking" onAdd={() => setRecordForm({ type: 'vaccinations' })} />
            <div className="space-y-2">{formDog.vaccinations?.map(v => (<div key={v.id} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center text-xs font-bold">{v.title} <span className="text-slate-400">{v.date}</span></div>))}</div>
            <SectionHeader title="Future Reminders" onAdd={() => setRecordForm({ type: 'reminders' })} />
            <div className="space-y-2">{formDog.reminders?.map(r => (<div key={r.id} className="p-3 bg-orange-50 rounded-xl flex justify-between items-center text-xs font-bold">{r.title} <span className="text-orange-600">{r.date}</span></div>))}</div>
            <button onClick={saveDog} className="w-full py-5 bg-orange-600 text-white rounded-[2rem] font-black mt-6">Save Pack Member</button>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="Settings" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            <div className="space-y-4">
              <SectionHeader title="Owner Information" />
              <input type="text" value={user.name} onChange={e => setUser(p => ({ ...p, name: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Full Name" />
              <input type="tel" value={user.phone} onChange={e => setUser(p => ({ ...p, phone: e.target.value }))} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" placeholder="Phone Number" />
            </div>
            <div className="space-y-4">
              <SectionHeader title="Social Sync" />
              <div className="relative"><i className="fa-brands fa-instagram absolute left-4 top-1/2 -translate-y-1/2 text-orange-500"></i><input type="text" value={user.instagram} onChange={e => setUser(p => ({ ...p, instagram: e.target.value }))} className="w-full p-4 pl-12 bg-slate-50 border rounded-2xl font-bold" placeholder="@username" /></div>
            </div>
          </div>
        </div>
      )}

      {view === 'reminders-list' && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
          <Header title="Reminders" onBack={() => setView('chat')} />
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            {profiles.flatMap(p => p.reminders).length === 0 ? <p className="text-center text-slate-300 font-bold py-12">All quiet in the pack!</p> : profiles.flatMap(p => p.reminders).map(r => (
              <div key={r.id} className="p-4 bg-orange-50 border rounded-3xl flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-orange-600 shadow-inner shrink-0"><i className="fa-solid fa-calendar-check"></i></div>
                <div className="flex-1 font-black text-slate-800">{r.title}<p className="text-xs text-orange-600">{r.date}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'map' && <MapView location={location} onRefresh={requestLocation} onClose={() => setView('chat')} />}
      
      {recordForm && (
        <RecordForm type={recordForm.type} onSave={(title, date) => {
          setFormDog(prev => ({ ...prev, [recordForm.type]: [...(prev[recordForm.type] as any[]), { id: Date.now().toString(), title, date, type: 'Other' }] }));
          setRecordForm(null);
        }} onClose={() => setRecordForm(null)} />
      )}
    </div>
  );
};

export default App;