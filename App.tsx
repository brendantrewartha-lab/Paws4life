import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message, DogProfile, UserLocation, AdSpot } from './types';

// Declare Leaflet global variable to fix "Cannot find name 'L'" errors
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

// --- Sub-Components (Internal) ---

const AdBanner: React.FC<{ ad: AdSpot }> = ({ ad }) => (
  <a href={ad.link} target="_blank" rel="noopener noreferrer" className="block bg-white border border-orange-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
    // Check for L global before accessing to prevent runtime errors
    if (!mapRef.current || !location || typeof L === 'undefined') return;
    mapInstance.current = L.map(mapRef.current).setView([location.latitude, location.longitude], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance.current);
    const userIcon = L.divIcon({ html: '<div class="bg-blue-500 w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>', iconSize: [16, 16] });
    L.marker([location.latitude, location.longitude], { icon: userIcon }).addTo(mapInstance.current);
    
    // Add mock markers for local flavor
    const offsets = [[0.005, 0.005], [-0.005, -0.008], [0.008, -0.003]];
    const names = ["Happy Tails Park", "PetCare Urgent Vet", "The Dog Stop"];
    offsets.forEach((off, i) => {
      L.marker([location.latitude + off[0], location.longitude + off[1]]).addTo(mapInstance.current).bindPopup(`<b>${names[i]}</b>`);
    });

    return () => mapInstance.current?.remove();
  }, [location]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col">
      <header className="p-4 bg-orange-600 text-white flex justify-between items-center shadow-lg">
        <h2 className="font-bold">Dog Parks & Vets Nearby</h2>
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
      .catch(() => { alert("Camera access required"); onClose(); });
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
      // Create a new instance right before the call as per SDK guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [
          { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
          { text: "Identify the dog breed in this photo. Return only the breed name as plain text. If no dog is seen, say 'Unknown'." }
        ]}
      });
      onScan(response.text?.trim() || "Unknown", `data:image/jpeg;base64,${base64Data}`);
    } catch (err) {
      alert("AI Analysis failed. Check API key in Vercel settings.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute top-6 left-6"><button onClick={onClose} className="bg-black/40 p-4 rounded-full text-white"><i className="fa-solid fa-xmark"></i></button></div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 border-2 border-white/50 rounded-3xl animate-pulse"></div>
      </div>
      <div className="absolute bottom-10 w-full flex justify-center px-6">
        <button onClick={capture} disabled={isAnalyzing} className="w-20 h-20 rounded-full border-8 border-white/20 flex items-center justify-center bg-orange-600 shadow-2xl">
          {isAnalyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-10 h-10 bg-white rounded-full"></div>}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => {
    const saved = localStorage.getItem('paws4life_dogs_v4');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws4life_active_v4'));
  const activeDog = profiles.find(p => p.id === activeId) || profiles[0] || null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [location, setLocation] = useState<UserLocation | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('paws4life_dogs_v4', JSON.stringify(profiles));
    if (activeId) localStorage.setItem('paws4life_active_v4', activeId);
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [profiles, activeId, messages]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        err => console.log("Location denied")
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
      // Initialize ai instance right before call using strict env var
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const context = activeDog ? `The user's dog is ${activeDog.name}, a ${activeDog.breed}. Health info: ${activeDog.allergies || 'none'}.` : "The user has no dog profile selected.";
      
      const response = await ai.models.generateContent({
        model: location ? 'gemini-2.5-flash' : 'gemini-3-flash-preview',
        contents: messages.concat(userMsg).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
          systemInstruction: `You are paws4life.ai, a expert vet assistant. ${context} Be precise, safe, and helpful. Use Google Search for news.`,
          tools: location ? [{ googleSearch: {} }, { googleMaps: {} }] : [{ googleSearch: {} }],
          toolConfig: location ? { retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } } } : undefined
        }
      });

      const text = response.text || "I'm having a little trouble thinking. Please try again.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks?.map((c: any) => ({ title: c.web?.title || c.maps?.title || 'Source', uri: c.web?.uri || c.maps?.uri || '#' })) || [];

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "⚠️ Error connecting to Gemini. Please check your API_KEY in Vercel Settings.", timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanResult = (breed: string, photo: string) => {
    const newDog: DogProfile = { id: Date.now().toString(), name: breed === 'Unknown' ? 'My New Friend' : breed, breed, age: '', weight: '', allergies: '', conditions: '', photo };
    setProfiles(prev => [...prev, newDog]);
    setActiveId(newDog.id);
    setIsScanning(false);
    setMessages(prev => [...prev, { id: 'scan', role: 'model', text: `That looks like a beautiful **${breed}**! I've added a profile. How can I help with their care?`, timestamp: Date.now() }]);
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-white shadow-2xl relative">
      <header className="bg-orange-600 text-white p-4 flex items-center justify-between shadow-lg z-50">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-paw text-xl"></i>
          <h1 className="text-xl font-bold tracking-tight">paws4life<span className="text-orange-200">.ai</span></h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowMap(true)} className="p-2 bg-white/20 rounded-lg"><i className="fa-solid fa-map-location-dot"></i></button>
          <button onClick={() => setIsScanning(true)} className="p-2 bg-white/20 rounded-lg"><i className="fa-solid fa-camera"></i></button>
          <button onClick={() => setProfiles([])} className="p-2 text-white/40"><i className="fa-solid fa-rotate-right"></i></button>
        </div>
      </header>

      {profiles.length > 0 && (
        <div className="flex gap-2 p-3 bg-gray-50 border-b overflow-x-auto scrollbar-hide">
          {profiles.map(p => (
            <button key={p.id} onClick={() => setActiveId(p.id)} className={`flex-shrink-0 flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${activeId === p.id ? 'bg-orange-600 text-white border-orange-600 shadow-md scale-105' : 'bg-white text-gray-500 border-gray-200'}`}>
              {p.photo ? <img src={p.photo} className="w-5 h-5 rounded-full object-cover" /> : <i className="fa-solid fa-dog"></i>}
              <span className="text-xs font-bold">{p.name}</span>
            </button>
          ))}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6 opacity-60">
            <i className="fa-solid fa-comment-medical text-6xl text-orange-200"></i>
            <div>
              <h2 className="text-2xl font-black text-gray-800">Hi! I'm your AI Vet.</h2>
              <p className="text-sm text-gray-500">Ask me anything, scan a dog, or find nearby parks.</p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${m.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border text-gray-800 rounded-tl-none'}`}>
              {m.text}
              {m.groundingUrls && m.groundingUrls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                  {m.groundingUrls.map((u, i) => (
                    <a key={i} href={u.uri} target="_blank" rel="noopener" className="text-[10px] bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-bold border border-orange-100"><i className="fa-solid fa-link mr-1"></i> {u.title}</a>
                  ))}
                </div>
              )}
            </div>
            {m.role === 'model' && i === 1 && <div className="w-full mt-4"><AdBanner ad={MOCK_ADS[0]} /></div>}
          </div>
        ))}
        {isLoading && <div className="bg-white border p-3 rounded-2xl w-16 shadow-sm"><div className="flex gap-1"><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce delay-150"></div></div></div>}
        <div ref={chatEndRef} />
      </main>

      <footer className="p-4 bg-white border-t sticky bottom-0">
        <form onSubmit={handleSend} className="flex gap-2">
          <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder={activeDog ? `Ask about ${activeDog.name}...` : "Type your question..."} className="flex-1 bg-gray-100 p-4 rounded-2xl text-sm outline-none focus:ring-2 ring-orange-200" />
          <button type="submit" disabled={!inputValue.trim() || isLoading} className="bg-orange-600 text-white w-14 h-14 rounded-2xl shadow-lg active:scale-90 disabled:opacity-50 transition-all">
            <i className="fa-solid fa-paper-plane text-xl"></i>
          </button>
        </form>
      </footer>

      {isScanning && <BreedScanner onScan={handleScanResult} onClose={() => setIsScanning(false)} />}
      {showMap && <MapView location={location} onClose={() => setShowMap(false)} />}
    </div>
  );
};

export default App;