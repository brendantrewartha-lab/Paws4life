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

export interface AdSpot {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  type: 'vet' | 'food' | 'breeder' | 'accessory';
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

// Global declaration for Leaflet
declare const L: any;

// --- Constants ---
const MOCK_ADS: AdSpot[] = [
  { 
    id: '1', 
    title: 'VetDirect Care', 
    description: '24/7 Virtual consults with certified veterinarians.', 
    imageUrl: 'https://picsum.photos/seed/vet/400/200', 
    link: '#',
    type: 'vet'
  },
  { 
    id: '2', 
    title: 'PuppyPower', 
    description: 'Premium organic dog nutrition tailored for your breed.', 
    imageUrl: 'https://picsum.photos/seed/food/400/200', 
    link: '#',
    type: 'food'
  }
];

// --- Internal Components ---

const AdBanner: React.FC<{ ad: AdSpot }> = ({ ad }) => (
  <a href={ad.link} target="_blank" rel="noopener noreferrer" className="block bg-white border border-orange-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow animate-in">
    <div className="flex flex-col sm:flex-row">
      <div className="sm:w-32 h-24 bg-gray-200">
        <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
      </div>
      <div className="p-4 flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 bg-orange-50 px-2 py-0.5 rounded">Sponsored</span>
          <span className="text-xs text-gray-400 capitalize">{ad.type}</span>
        </div>
        <h4 className="font-bold text-gray-800 text-sm">{ad.title}</h4>
        <p className="text-xs text-gray-600 line-clamp-1">{ad.description}</p>
      </div>
    </div>
  </a>
);

const MapView: React.FC<{ location: UserLocation | undefined; onClose: () => void }> = ({ location, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    mapInstance.current = L.map(mapRef.current).setView([location.latitude, location.longitude], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance.current);
    
    const userIcon = L.divIcon({ html: '<div class="bg-blue-500 w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>', iconSize: [16, 16] });
    L.marker([location.latitude, location.longitude], { icon: userIcon }).addTo(mapInstance.current).bindPopup("Your Location");
    
    const offsets = [[0.005, 0.005], [-0.005, -0.008]];
    const names = ["Local Dog Park", "Emergency Vet Clinic"];
    offsets.forEach((off, i) => {
      L.marker([location.latitude + off[0], location.longitude + off[1]]).addTo(mapInstance.current).bindPopup(`<b>${names[i]}</b>`);
    });

    return () => mapInstance.current?.remove();
  }, [location]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      <header className="p-4 bg-orange-600 text-white flex justify-between items-center shadow-lg">
        <h2 className="font-bold flex items-center gap-2"><i className="fa-solid fa-location-dot"></i> Local Services</h2>
        <button onClick={onClose} className="p-2"><i className="fa-solid fa-xmark text-xl"></i></button>
      </header>
      <div ref={mapRef} className="flex-1" />
    </div>
  );
};

const BreedScanner: React.FC<{ onScan: (breed: string, photo: string) => void; onClose: () => void }> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => { stream = s; if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => { alert("Camera access required for breed identification."); onClose(); });
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;
    setIsAnalyzing(true);
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current, 0, 0);
    const base64Data = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [
          { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
          { text: "Identify the dog breed in this photo. Return only the breed name. If no dog is seen, say 'Unknown Dog'." }
        ]}
      });
      onScan(response.text?.trim() || "Unknown Dog", `data:image/jpeg;base64,${base64Data}`);
    } catch (err) {
      alert("AI Identification failed. Please ensure your API_KEY is set.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute top-6 left-6"><button onClick={onClose} className="bg-black/40 p-4 rounded-full text-white"><i className="fa-solid fa-xmark text-xl"></i></button></div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-72 h-72 border-4 border-orange-500/50 rounded-3xl animate-pulse flex items-center justify-center">
            <div className="text-white/30 text-xs font-bold uppercase tracking-widest">Scanning...</div>
        </div>
      </div>
      <div className="absolute bottom-10 w-full flex flex-col items-center gap-6 px-6">
        <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">Position the dog in the square</p>
        <button onClick={capture} disabled={isAnalyzing} className="w-20 h-20 rounded-full border-8 border-white/20 bg-orange-600 shadow-2xl flex items-center justify-center active:scale-90 transition-transform">
          {isAnalyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-10 h-10 bg-white rounded-full"></div>}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => {
    const saved = localStorage.getItem('paws4life_dogs_v6');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws4life_active_v6'));
  const activeDog = profiles.find(p => p.id === activeId) || (profiles.length > 0 ? profiles[0] : null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [location, setLocation] = useState<UserLocation | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('paws4life_dogs_v6', JSON.stringify(profiles));
    if (activeId) localStorage.setItem('paws4life_active_v6', activeId);
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [profiles, activeId, messages]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        err => console.log("Location access denied")
      );
    }
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: inputValue, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      if (!process.env.API_KEY) {
        throw new Error("API_KEY_MISSING");
      }
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const context = activeDog ? `The user's dog is ${activeDog.name}, a ${activeDog.breed}.` : "No specific dog selected.";
      
      // Determine if location services are needed based on prompt content
      const needsLocation = inputValue.toLowerCase().includes('near') || inputValue.toLowerCase().includes('vet') || inputValue.toLowerCase().includes('park');
      const useModel = (location && needsLocation) ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';

      const response = await ai.models.generateContent({
        model: useModel,
        contents: messages.concat(userMsg).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
          systemInstruction: `You are paws4life.ai, a world-class veterinary assistant. ${context} Be helpful, compassionate, and prioritize medical safety. Use Google Search for the latest info.`,
          tools: needsLocation && location ? [{ googleSearch: {} }, { googleMaps: {} }] : [{ googleSearch: {} }],
          toolConfig: needsLocation && location ? { retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } } } : undefined
        }
      });

      const text = response.text || "I apologize, but I couldn't generate a response.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ 
        title: c.web?.title || c.maps?.title || 'Source', 
        uri: c.web?.uri || c.maps?.uri || '#' 
      })) || [];

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err: any) {
      console.error(err);
      let errorText = "⚠️ Error connecting to AI. Please check that your environment variable is named exactly 'API_KEY'.";
      if (err.message === "API_KEY_MISSING") errorText = "⚠️ API Key is missing. Rename your 'Gemini_API_Key' to 'API_KEY' in Vercel project settings.";
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: errorText, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanResult = (breed: string, photo: string) => {
    const newDog: DogProfile = { id: Date.now().toString(), name: breed === 'Unknown Dog' ? 'New Buddy' : breed, breed, age: '', weight: '', allergies: '', photo };
    setProfiles(prev => [...prev, newDog]);
    setActiveId(newDog.id);
    setIsScanning(false);
    setMessages(prev => [...prev, { 
      id: 'scan-res', 
      role: 'model', 
      text: `Woof! I've identified this dog as a **${breed}**. I've created a profile for them. How can I help with their care today?`, 
      timestamp: Date.now() 
    }]);
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-white shadow-2xl relative overflow-hidden">
      {/* Header */}
      <header className="bg-orange-600 text-white p-4 flex items-center justify-between shadow-lg z-50">
        <div className="flex items-center gap-2">
          <div className="bg-white/20 p-2 rounded-xl">
            <i className="fa-solid fa-paw text-xl"></i>
          </div>
          <h1 className="text-xl font-bold tracking-tight">paws4life<span className="text-orange-200">.ai</span></h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowMap(true)} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-full hover:bg-white/30 transition-colors" title="Nearby Services">
            <i className="fa-solid fa-map-location-dot"></i>
          </button>
          <button onClick={() => setIsScanning(true)} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-full hover:bg-white/30 transition-colors" title="Identify Breed">
            <i className="fa-solid fa-camera"></i>
          </button>
        </div>
      </header>

      {/* Profile Bar - Persistent */}
      <div className="flex gap-2 p-3 bg-gray-50 border-b overflow-x-auto scrollbar-hide shrink-0 items-center min-h-[64px]">
        {profiles.length > 0 ? (
          <>
            {profiles.map(p => (
              <button 
                key={p.id} 
                onClick={() => setActiveId(p.id)} 
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${activeId === p.id ? 'bg-orange-600 text-white border-orange-600 shadow-md ring-4 ring-orange-100' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'}`}
              >
                <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center shadow-inner">
                  {p.photo ? <img src={p.photo} className="w-full h-full object-cover" alt={p.name} /> : <i className="fa-solid fa-dog text-[10px]"></i>}
                </div>
                <span className="text-xs font-bold whitespace-nowrap">{p.name}</span>
              </button>
            ))}
            <button 
                onClick={() => setIsScanning(true)} 
                className="w-8 h-8 flex-shrink-0 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-orange-600 hover:border-orange-600 transition-all hover:bg-orange-50"
                title="Add Another Dog"
            >
              <i className="fa-solid fa-plus text-xs"></i>
            </button>
          </>
        ) : (
          <button 
            onClick={() => setIsScanning(true)} 
            className="flex-1 flex items-center justify-center gap-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-orange-600 font-bold text-sm hover:bg-orange-100 transition-colors animate-pulse"
          >
            <i className="fa-solid fa-plus-circle"></i> Add Your First Pet to Start
          </button>
        )}
      </div>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-8">
            <div className="relative">
                <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-500 shadow-inner">
                  <i className="fa-solid fa-shield-dog text-5xl"></i>
                </div>
                <div className="absolute -bottom-2 -right-2 bg-green-500 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center text-white text-[10px]">
                    <i className="fa-solid fa-check"></i>
                </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-gray-800">Hello, Dog Lover!</h2>
              <p className="text-sm text-gray-500 leading-relaxed max-w-[240px] mx-auto">I'm your expert vet advisor. Scan your dog's breed or ask me anything about their health and happiness.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => setInputValue("What's the best diet for my breed?")} className="px-3 py-2 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm hover:border-orange-400">🍎 Diet Tips</button>
                <button onClick={() => setInputValue("Nearby vets open now?")} className="px-3 py-2 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm hover:border-orange-400">🏥 ER Vets</button>
                <button onClick={() => setIsScanning(true)} className="px-3 py-2 bg-orange-600 text-white rounded-full text-xs font-bold shadow-md hover:bg-orange-700">📸 Scan Breed</button>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[88%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-gray-800 rounded-tl-none border-gray-100'}`}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-50 flex flex-wrap gap-2">
                  <p className="w-full text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Expert Sources</p>
                  {m.groundingUrls.map((u, i) => (
                    <a key={i} href={u.uri} target="_blank" rel="noopener" className="text-[10px] bg-gray-50 text-orange-600 px-3 py-1 rounded-full border border-gray-100 hover:bg-orange-50 hover:border-orange-200 font-bold transition-all">
                      <i className="fa-solid fa-link mr-1"></i> {u.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'model' && i === 1 && <div className="w-full mt-4"><AdBanner ad={MOCK_ADS[0]} /></div>}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-2">
             <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm">
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce delay-150"></div>
                    <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce delay-300"></div>
                </div>
             </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Input Footer */}
      <footer className="p-4 bg-white border-t border-gray-100 sticky bottom-0 z-50">
        <form onSubmit={handleSend} className="flex gap-3">
          <input 
            type="text" 
            value={inputValue} 
            onChange={e => setInputValue(e.target.value)} 
            placeholder={activeDog ? `Ask about ${activeDog.name}...` : "Type a question..."} 
            className="flex-1 bg-gray-50 p-4 rounded-2xl text-sm outline-none focus:ring-4 ring-orange-500/10 border border-gray-200 focus:border-orange-500 transition-all" 
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isLoading} 
            className="bg-orange-600 text-white w-14 h-14 rounded-2xl shadow-xl shadow-orange-600/20 active:scale-95 disabled:bg-gray-200 disabled:shadow-none transition-all flex items-center justify-center shrink-0"
          >
            <i className="fa-solid fa-paper-plane text-xl"></i>
          </button>
        </form>
      </footer>

      {/* Overlays */}
      {isScanning && <BreedScanner onScan={handleScanResult} onClose={() => setIsScanning(false)} />}
      {showMap && <MapView location={location} onClose={() => setShowMap(false)} />}
    </div>
  );
};

export default App;