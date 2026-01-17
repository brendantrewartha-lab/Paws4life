import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// --- Types ---
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  groundingUrls?: Array<{ title: string; uri: string }>;
}

export interface DogProfile {
  id: string;
  name: string;
  breed: string;
  age: string;
  weight: string;
  allergies: string;
  photo?: string; // base64
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

// Global declaration for Leaflet
declare const L: any;

// --- Constants ---
const MOCK_ADS = [
  { 
    id: '1', 
    title: 'VetDirect 24/7', 
    description: 'Instant video calls with licensed vets.', 
    imageUrl: 'https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&q=80&w=300', 
    link: '#',
    type: 'Emergency'
  }
];

// --- Sub-Components ---

const MapOverlay: React.FC<{ location: UserLocation | undefined; onClose: () => void }> = ({ location, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    const map = L.map(mapRef.current).setView([location.latitude, location.longitude], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const userIcon = L.divIcon({ html: '<div class="bg-blue-600 w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>', iconSize: [16, 16] });
    L.marker([location.latitude, location.longitude], { icon: userIcon }).addTo(map).bindPopup("You are here");
    
    [[0.004, 0.006], [-0.005, -0.009]].forEach((pos, i) => {
      L.marker([location.latitude + pos[0], location.longitude + pos[1]]).addTo(map)
        .bindPopup(`<b>${i === 0 ? "Paws Park" : "City Vet Clinic"}</b>`);
    });
    return () => map.remove();
  }, [location]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in">
      <header className="p-4 bg-orange-600 text-white flex justify-between items-center">
        <h2 className="font-bold flex items-center gap-2"><i className="fa-solid fa-map-pin"></i> Nearby Services</h2>
        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors"><i className="fa-solid fa-xmark text-xl"></i></button>
      </header>
      <div ref={mapRef} className="flex-1" />
    </div>
  );
};

const ScannerOverlay: React.FC<{ onScan: (breed: string, photo: string) => void; onClose: () => void }> = ({ onScan, onClose }) => {
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
        contents: { parts: [{ inlineData: { data: base64, mimeType: 'image/jpeg' } }, { text: "Identify the breed. Return only the breed name." }] }
      });
      onScan(res.text?.trim() || "Mix Breed", `data:image/jpeg;base64,${base64}`);
    } catch (e) {
      alert("AI Analysis failed. Ensure your API_KEY is set in Vercel and you have redeployed.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none flex items-center justify-center">
        <div className="w-72 h-72 border-2 border-white/50 rounded-3xl animate-pulse"></div>
      </div>
      <button onClick={onClose} className="absolute top-6 right-6 text-white p-4 bg-black/40 rounded-full"><i className="fa-solid fa-xmark text-xl"></i></button>
      <div className="absolute bottom-12 w-full flex flex-col items-center gap-4">
        <button onClick={capture} disabled={analyzing} className="w-20 h-20 rounded-full border-8 border-white/20 bg-orange-600 flex items-center justify-center shadow-2xl active:scale-95 transition-all">
          {analyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-10 h-10 bg-white rounded-full"></div>}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => JSON.parse(localStorage.getItem('paws_profiles_v8') || '[]'));
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws_active_v8'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'scan' | 'map'>('chat');
  const [location, setLocation] = useState<UserLocation>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentDog = profiles.find(p => p.id === activeId) || (profiles.length > 0 ? profiles[0] : null);

  useEffect(() => {
    localStorage.setItem('paws_profiles_v8', JSON.stringify(profiles));
    if (activeId) localStorage.setItem('paws_active_v8', activeId);
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
      const context = currentDog ? `The user's dog is ${currentDog.name}, a ${currentDog.breed}.` : "No specific dog profile selected.";
      const isLocRequest = input.toLowerCase().match(/near|vet|park|clinic|where/);
      
      const response = await ai.models.generateContent({
        model: (location && isLocRequest) ? 'gemini-2.5-flash' : 'gemini-3-flash-preview',
        contents: messages.concat(userMsg).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
          systemInstruction: `You are paws4life.ai, a top-tier canine health advisor. ${context} Be helpful, friendly, and prioritize medical safety.`,
          tools: (isLocRequest && location) ? [{ googleSearch: {} }, { googleMaps: {} }] : [{ googleSearch: {} }],
          toolConfig: (isLocRequest && location) ? { retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } } } : undefined
        }
      });

      const text = response.text || "I'm having trouble connecting to the brain. Please try again.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ title: c.web?.title || c.maps?.title || 'Resource', uri: c.web?.uri || c.maps?.uri || '#' })) || [];

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "⚠️ AI Connection Error. If you just updated your Vercel API_KEY, ensure you have clicked 'Redeploy' on the Vercel dashboard.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const onScanComplete = (breed: string, photo: string) => {
    const newDog: DogProfile = { id: Date.now().toString(), name: breed === 'Mix Breed' ? 'New Buddy' : breed, breed, age: '', weight: '', allergies: '', photo };
    setProfiles(prev => [...prev, newDog]);
    setActiveId(newDog.id);
    setView('chat');
    setMessages(prev => [...prev, { id: 'sys', role: 'model', text: `📸 Profile created for a **${breed}**! How can I help you today?`, timestamp: Date.now() }]);
  };

  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-slate-50 relative shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="bg-orange-600 text-white p-4 flex items-center justify-between shadow-xl z-50">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 w-10 h-10 rounded-2xl flex items-center justify-center backdrop-blur-md">
            <i className="fa-solid fa-paw text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-black italic">paws4life<span className="text-orange-200">.ai</span></h1>
            {process.env.API_KEY && <div className="text-[9px] text-orange-200 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1"><div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div> System Ready</div>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('map')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"><i className="fa-solid fa-map-location-dot"></i></button>
          <button onClick={() => setView('scan')} className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"><i className="fa-solid fa-camera"></i></button>
        </div>
      </header>

      {/* Profile Bar */}
      <div className="bg-white border-b border-slate-200 p-3 flex gap-2 overflow-x-auto scrollbar-hide items-center min-h-[68px]">
        {profiles.length > 0 ? (
          <>
            {profiles.map(p => (
              <button 
                key={p.id} 
                onClick={() => setActiveId(p.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-2xl border-2 transition-all ${activeId === p.id ? 'bg-orange-600 border-orange-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-500 hover:border-orange-300'}`}
              >
                <div className="w-7 h-7 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-dog text-xs"></i>}
                </div>
                <span className="text-xs font-black truncate max-w-[80px]">{p.name}</span>
              </button>
            ))}
            <button onClick={() => setView('scan')} className="w-10 h-10 flex-shrink-0 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:text-orange-600 hover:border-orange-600"><i className="fa-solid fa-plus text-xs"></i></button>
          </>
        ) : (
          <button onClick={() => setView('scan')} className="flex-1 flex items-center justify-center gap-3 py-3 bg-orange-50 border-2 border-dashed border-orange-200 rounded-2xl text-orange-600 font-black text-sm pulse-orange">
            <i className="fa-solid fa-camera-retro"></i> Scan Your Dog to Start
          </button>
        )}
      </div>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
              <i className="fa-solid fa-shield-dog text-4xl"></i>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-800">Canine Expert AI</h2>
              <p className="text-sm text-slate-500 leading-relaxed">I'm trained to help you with health, diet, and local pet services.</p>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[88%] p-4 rounded-3xl shadow-sm text-sm ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (
                    <a key={i} href={u.uri} target="_blank" rel="noopener" className="text-[10px] bg-slate-50 text-orange-600 px-3 py-1.5 rounded-xl border border-slate-100 font-black">
                      <i className="fa-solid fa-link mr-1"></i> {u.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'model' && i === 1 && (
              <div className="w-full mt-4 bg-white border border-orange-100 p-4 rounded-3xl shadow-sm">
                <div className="flex items-center gap-4">
                  <img src={MOCK_ADS[0].imageUrl} className="w-16 h-16 rounded-2xl object-cover" />
                  <div className="flex-1">
                    <span className="text-[9px] font-black text-orange-500 uppercase bg-orange-50 px-2 py-0.5 rounded">Sponsored</span>
                    <h4 className="text-xs font-black text-slate-800 mt-1">{MOCK_ADS[0].title}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-1">{MOCK_ADS[0].description}</p>
                  </div>
                  <i className="fa-solid fa-chevron-right text-slate-300"></i>
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && <div className="p-4 bg-white rounded-3xl border shadow-sm w-16 animate-pulse">...</div>}
        <div ref={scrollRef} />
      </main>

      {/* Input */}
      <footer className="p-4 bg-white border-t border-slate-100 sticky bottom-0 z-50">
        <form onSubmit={sendMessage} className="flex gap-3">
          <input 
            type="text" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder={currentDog ? `Ask for ${currentDog.name}...` : "Ask a vet question..."} 
            className="flex-1 bg-slate-100 p-4 rounded-3xl text-sm outline-none border-2 border-transparent focus:border-orange-500 transition-all" 
          />
          <button 
            type="submit" 
            disabled={!input.trim() || loading} 
            className="bg-orange-600 text-white w-14 h-14 rounded-3xl shadow-xl shadow-orange-600/30 flex items-center justify-center shrink-0"
          >
            <i className="fa-solid fa-paper-plane text-xl"></i>
          </button>
        </form>
      </footer>

      {/* Overlays */}
      {view === 'scan' && <ScannerOverlay onScan={onScanComplete} onClose={() => setView('chat')} />}
      {view === 'map' && <MapOverlay location={location} onClose={() => setView('chat')} />}
    </div>
  );
};

export default App;