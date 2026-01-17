import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  groundingUrls?: Array<{ title: string; uri: string }>;
}

interface DogProfile {
  id: string;
  name: string;
  breed: string;
  age: string;
  weight: string;
  allergies: string;
  conditions: string;
  image?: string; // base64 string
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface AdSpot {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  type: 'vet' | 'food' | 'breeder' | 'accessory';
  targetBreeds?: string[];
}

// --- Constants ---
const COMMON_BREEDS = [
  "Labrador Retriever", "German Shepherd", "Golden Retriever", "French Bulldog", 
  "Bulldog", "Poodle", "Beagle", "Rottweiler", "Dachshund", "Yorkshire Terrier"
];

const MOCK_ADS: AdSpot[] = [
  { id: '1', title: 'VetDirect Urgent Care', description: '24/7 Virtual vet consults from $19.', imageUrl: 'https://picsum.photos/seed/vet/300/200', link: '#', type: 'vet' },
  { id: '2', title: 'PuppyPower Kibble', description: 'Formulated for active dogs.', imageUrl: 'https://picsum.photos/seed/food/300/200', link: '#', type: 'food' }
];

// --- Sub-Components ---

const BreedScanner: React.FC<{ onScan: (breed: string, photo: string) => void; onClose: () => void }> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = s;
        setStream(s);
      } catch (err) {
        console.error("Camera error:", err);
        onClose();
      }
    }
    setupCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const handleIdentify = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;
    setIsAnalyzing(true);

    const context = canvasRef.current.getContext('2d');
    if (!context) return;
    
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    
    const base64Data = canvasRef.current.toDataURL('image/jpeg', 0.6).split(',')[1];
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
            { text: "Identify the dog breed in this image. Return ONLY the breed name as plain text. If no dog is found, return 'Unknown'." }
          ]
        }
      });
      
      const breed = response.text?.trim() || "Unknown";
      onScan(breed, `data:image/jpeg;base64,${base64Data}`);
    } catch (err) {
      console.error("Vision API Error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex justify-between items-center p-4 text-white z-10">
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full"><i className="fa-solid fa-xmark"></i></button>
        <span className="font-bold tracking-widest text-xs uppercase">Breed Scanner</span>
        <div className="w-10"></div>
      </div>
      
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <video ref={videoRef} autoPlay playsInline className="absolute w-full h-full object-cover" />
        <div className="relative w-64 h-64 border-2 border-orange-500 rounded-3xl flex items-center justify-center">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-orange-500 rounded-tl-xl -translate-x-1 -translate-y-1"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-orange-500 rounded-tr-xl translate-x-1 -translate-y-1"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-orange-500 rounded-bl-xl -translate-x-1 translate-y-1"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-orange-500 rounded-br-xl translate-x-1 translate-y-1"></div>
          {isAnalyzing && <div className="absolute inset-0 bg-orange-500/20 animate-pulse flex items-center justify-center text-white font-bold">Analyzing...</div>}
        </div>
      </div>

      <div className="p-8 flex justify-center bg-black/40 backdrop-blur-md">
        <button 
          onClick={handleIdentify}
          disabled={isAnalyzing}
          className="w-20 h-20 bg-white rounded-full border-8 border-white/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-2xl"
        >
          <div className={`w-12 h-12 rounded-full ${isAnalyzing ? 'bg-gray-400' : 'bg-orange-600'}`}></div>
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

declare const L: any;
const MapView: React.FC<{ location?: UserLocation; onClose: () => void }> = ({ location, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !location) return;
    mapInstance.current = L.map(mapRef.current).setView([location.latitude, location.longitude], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapInstance.current);

    const dogIcon = L.divIcon({ html: '<div class="bg-orange-600 text-white w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg"><i class="fa-solid fa-paw"></i></div>', className: '', iconSize: [32, 32], iconAnchor: [16, 32] });
    const vetIcon = L.divIcon({ html: '<div class="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg"><i class="fa-solid fa-hospital"></i></div>', className: '', iconSize: [32, 32], iconAnchor: [16, 32] });
    const userIcon = L.divIcon({ html: '<div class="bg-green-500 w-4 h-4 rounded-full border-2 border-white shadow-lg ring-4 ring-green-500/30"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] });

    L.marker([location.latitude, location.longitude], { icon: userIcon }).addTo(mapInstance.current).bindPopup('<b>You are here</b>');

    const places = [
      { name: 'Happy Paws Dog Park', type: 'park', offset: [0.005, 0.008], rating: '4.8 ⭐' },
      { name: 'Central Vet Hospital', type: 'vet', offset: [0.01, -0.005], rating: '4.9 ⭐', hours: 'Open 24/7' },
    ];

    places.forEach(place => {
      const lat = location.latitude + place.offset[0];
      const lng = location.longitude + place.offset[1];
      const icon = place.type === 'park' ? dogIcon : vetIcon;
      L.marker([lat, lng], { icon }).addTo(mapInstance.current).bindPopup(`<div class="p-1"><h4 class="font-bold text-gray-800 text-sm">${place.name}</h4><p class="text-xs text-gray-500 mb-1 capitalize">${place.type}</p><div class="flex items-center gap-2 mt-2"><span class="text-[10px] font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded">${place.rating}</span></div></div>`);
    });

    return () => { if (mapInstance.current) mapInstance.current.remove(); };
  }, [location]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white animate-in slide-in-from-bottom duration-300">
      <header className="bg-orange-600 text-white p-4 flex items-center justify-between">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20"><i className="fa-solid fa-chevron-left"></i></button>
        <h2 className="font-bold text-lg">Local Pet Services</h2>
        <div className="w-8"></div>
      </header>
      <div className="flex-1 relative">
        <div id="map" ref={mapRef} className="h-full w-full"></div>
      </div>
    </div>
  );
};

// --- Main App ---
const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => {
    const saved = localStorage.getItem('paws4life_profiles');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    return localStorage.getItem('paws4life_active_id');
  });
  
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0] || null;

  const [messages, setMessages] = useState<Message[]>([{
    id: 'init',
    role: 'model',
    text: "Welcome back! I'm your paws4life AI assistant. How can I help you or your dogs today?",
    timestamp: Date.now()
  }]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useState<UserLocation | undefined>();
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Partial<DogProfile> | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('paws4life_profiles', JSON.stringify(profiles));
    if (activeProfileId) localStorage.setItem('paws4life_active_id', activeProfileId);
  }, [profiles, activeProfileId]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.warn("Location permission denied", err)
      );
    }
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const contextText = activeProfile 
        ? `The user is focused on ${activeProfile.name}, a ${activeProfile.breed}. Age: ${activeProfile.age}, Weight: ${activeProfile.weight}, Allergies: ${activeProfile.allergies}.` 
        : "The user hasn't selected a specific dog profile yet.";

      const systemInstruction = `You are "paws4life.ai", a veterinary assistant. ${contextText} Always prioritize safety. Use Google Search for real-time info.`;
      
      const modelName = location ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';
      const response = await ai.models.generateContent({
        model: modelName,
        contents: messages.concat(userMsg).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { 
          systemInstruction, 
          tools: [{ googleSearch: {} }],
          toolConfig: location ? { retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } } } : undefined
        }
      });

      const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const urls = grounding?.map((c: any) => ({ title: c.web?.title || 'Source', uri: c.web?.uri || '#' })) || [];

      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: response.text || "I'm having trouble thinking right now.", 
        timestamp: Date.now(),
        groundingUrls: urls
      }]);
    } catch (err) {
      console.error("Chat Error:", err);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Service temporary unavailable. Please check your network.", timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProfile = () => {
    if (!editingProfile) return;
    const newProfile = {
      ...editingProfile,
      id: editingProfile.id || Date.now().toString(),
      name: editingProfile.name || 'Unnamed Dog',
      breed: editingProfile.breed || 'Unknown',
    } as DogProfile;

    if (editingProfile.id) {
      setProfiles(prev => prev.map(p => p.id === editingProfile.id ? newProfile : p));
    } else {
      setProfiles(prev => [...prev, newProfile]);
      setActiveProfileId(newProfile.id);
    }
    setEditingProfile(null);
  };

  const deleteProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
    if (activeProfileId === id) setActiveProfileId(null);
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto bg-white shadow-xl overflow-hidden font-sans relative">
      <header className="bg-orange-600 text-white p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-paw text-2xl"></i>
          <div>
            <h1 className="text-xl font-bold leading-tight">paws4life.ai</h1>
            <p className="text-[10px] opacity-80 uppercase tracking-widest font-semibold">Smart Canine Care</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsScannerOpen(true)} 
            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <i className="fa-solid fa-camera"></i>
          </button>
          <button 
            onClick={() => setIsProfileManagerOpen(true)} 
            className="flex items-center gap-2 bg-orange-700 px-3 py-1.5 rounded-full hover:bg-orange-800 transition-colors"
          >
            {activeProfile?.image ? (
              <img src={activeProfile.image} className="w-6 h-6 rounded-full object-cover border border-white" alt="Pup" />
            ) : (
              <i className="fa-solid fa-dog"></i>
            )}
            <span className="text-sm font-bold hidden sm:inline">{activeProfile?.name || 'My Dogs'}</span>
          </button>
        </div>
      </header>

      {isMapOpen && <MapView location={location} onClose={() => setIsMapOpen(false)} />}
      {isScannerOpen && (
        <BreedScanner 
          onScan={(breed, photo) => {
            setEditingProfile({ breed, image: photo });
            setIsScannerOpen(false);
            setIsProfileManagerOpen(true);
          }} 
          onClose={() => setIsScannerOpen(false)} 
        />
      )}

      {isProfileManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-orange-600 p-6 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-id-card"></i> Profiles</h2>
              <button onClick={() => {setIsProfileManagerOpen(false); setEditingProfile(null)}}><i className="fa-solid fa-xmark text-2xl"></i></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {editingProfile ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
                  <div className="flex justify-center">
                    <div className="relative w-24 h-24 rounded-full bg-gray-100 border-4 border-orange-100 overflow-hidden flex items-center justify-center">
                        {editingProfile.image ? (
                          <img src={editingProfile.image} className="w-full h-full object-cover" alt="Scan" />
                        ) : (
                          <i className="fa-solid fa-dog text-2xl text-gray-300"></i>
                        )}
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => setEditingProfile({ ...editingProfile, image: ev.target?.result as string });
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                    </div>
                  </div>
                  <input type="text" placeholder="Dog Name" value={editingProfile.name || ''} onChange={e => setEditingProfile({...editingProfile, name: e.target.value})} className="w-full border-b-2 py-2 focus:border-orange-500 outline-none text-lg font-bold" />
                  <input type="text" list="breeds" placeholder="Breed" value={editingProfile.breed || ''} onChange={e => setEditingProfile({...editingProfile, breed: e.target.value})} className="w-full border-b-2 py-2 focus:border-orange-500 outline-none" />
                  <datalist id="breeds">{COMMON_BREEDS.map(b => <option key={b} value={b} />)}</datalist>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="text" placeholder="Age" value={editingProfile.age || ''} onChange={e => setEditingProfile({...editingProfile, age: e.target.value})} className="w-full border-b-2 py-2 focus:border-orange-500 outline-none" />
                    <input type="text" placeholder="Weight" value={editingProfile.weight || ''} onChange={e => setEditingProfile({...editingProfile, weight: e.target.value})} className="w-full border-b-2 py-2 focus:border-orange-500 outline-none" />
                  </div>
                  <textarea placeholder="Health Notes / Allergies" value={editingProfile.allergies || ''} onChange={e => setEditingProfile({...editingProfile, allergies: e.target.value})} className="w-full bg-gray-50 border rounded-xl p-3 outline-none" rows={2} />
                  <div className="flex gap-3 pt-4">
                    <button onClick={() => setEditingProfile(null)} className="flex-1 py-3 font-bold text-gray-400">Cancel</button>
                    <button onClick={saveProfile} className="flex-[2] bg-orange-600 text-white font-bold py-3 rounded-2xl shadow-lg hover:bg-orange-700">Save Dog</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {profiles.map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => { setActiveProfileId(p.id); setIsProfileManagerOpen(false); }}
                      className={`group p-4 rounded-2xl border-2 flex items-center gap-4 transition-all cursor-pointer ${activeProfileId === p.id ? 'border-orange-500 bg-orange-50' : 'border-gray-100'}`}
                    >
                      <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden">
                        {p.image ? <img src={p.image} className="w-full h-full object-cover" alt={p.name} /> : <div className="w-full h-full flex items-center justify-center text-gray-400"><i className="fa-solid fa-dog"></i></div>}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-800">{p.name}</h4>
                        <p className="text-xs text-gray-500">{p.breed}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setEditingProfile(p); }} className="p-2 text-gray-400 hover:text-blue-500"><i className="fa-solid fa-pen"></i></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }} className="p-2 text-gray-400 hover:text-red-500"><i className="fa-solid fa-trash"></i></button>
                    </div>
                  ))}
                  <button onClick={() => setEditingProfile({})} className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold hover:border-orange-300 hover:text-orange-500 transition-all">+ Add New Dog</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden bg-gray-50">
        <section className="flex-1 flex flex-col bg-white">
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none border'}`}>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                  {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-300/30 flex flex-wrap gap-2">
                      {msg.groundingUrls.map((u, i) => (
                        <a key={i} href={u.uri} target="_blank" rel="noopener" className="text-[10px] bg-white/40 px-2 py-0.5 rounded border flex items-center gap-1 hover:bg-white transition-colors">
                          <i className="fa-solid fa-link"></i> {u.title.length > 15 ? u.title.slice(0, 15) + '...' : u.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex gap-2 p-4 bg-gray-100 rounded-2xl w-24 animate-pulse"><div className="w-2 h-2 bg-orange-400 rounded-full"></div><div className="w-2 h-2 bg-orange-400 rounded-full"></div><div className="w-2 h-2 bg-orange-400 rounded-full"></div></div>}
            <div ref={chatEndRef} />
          </div>
          
          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t flex gap-3 items-center">
            <input 
              type="text" 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              placeholder={activeProfile ? `Ask about ${activeProfile.name}...` : "Ask a canine expert..."} 
              className="flex-1 rounded-2xl border bg-gray-50 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-orange-200" 
            />
            <button type="submit" disabled={isLoading || !inputText.trim()} className="bg-orange-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-orange-700 shadow-lg active:scale-95 disabled:bg-gray-300">
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </section>

        <aside className="hidden lg:flex w-80 bg-gray-50 border-l p-6 flex-col gap-6 overflow-y-auto">
          {activeProfile && (
             <div className="bg-white p-6 rounded-3xl shadow-sm border border-orange-100 space-y-4">
                <div className="flex items-center gap-4">
                   <div className="w-16 h-16 rounded-2xl bg-orange-100 overflow-hidden shadow-inner">
                      {activeProfile.image ? <img src={activeProfile.image} className="w-full h-full object-cover" alt="pup" /> : <div className="w-full h-full flex items-center justify-center text-orange-400 text-2xl"><i className="fa-solid fa-paw"></i></div>}
                   </div>
                   <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black text-gray-800 truncate">{activeProfile.name}</h3>
                      <p className="text-[10px] font-bold text-orange-600 uppercase tracking-tighter truncate">{activeProfile.breed}</p>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                   <div className="bg-gray-50 p-2 rounded-xl border">
                      <p className="text-[10px] text-gray-400 font-bold">Age</p>
                      <p className="font-bold text-gray-700">{activeProfile.age || '?'}</p>
                   </div>
                   <div className="bg-gray-50 p-2 rounded-xl border">
                      <p className="text-[10px] text-gray-400 font-bold">Weight</p>
                      <p className="font-bold text-gray-700">{activeProfile.weight || '?'}</p>
                   </div>
                </div>
                <button onClick={() => setIsMapOpen(true)} className="w-full py-3 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 transition-colors shadow-sm">Find Vets Nearby</button>
             </div>
          )}

          <div className="space-y-4">
             <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Sponsored</h4>
             {MOCK_ADS.map(ad => (
               <a key={ad.id} href={ad.link} className="block group bg-white p-3 rounded-2xl border hover:border-orange-300 transition-all">
                  <img src={ad.imageUrl} className="w-full h-24 object-cover rounded-xl mb-3" alt="Ad" />
                  <h5 className="font-bold text-xs text-gray-800">{ad.title}</h5>
                  <p className="text-[10px] text-gray-500 line-clamp-2">{ad.description}</p>
               </a>
             ))}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;