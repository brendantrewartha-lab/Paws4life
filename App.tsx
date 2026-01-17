
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message, DogProfile, UserLocation, AdSpot } from './types';
import { generateDogAdvice } from './services/geminiService';
import { AdBanner } from './components/AdBanner';
import { MapView } from './components/MapView';

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

// --- Sub-Components ---

/**
 * BreedScanner component uses Gemini 3 Flash to identify dog breeds from a camera feed.
 */
const BreedScanner: React.FC<{ onScan: (breed: string, photo: string) => void; onClose: () => void }> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera access failed", err);
        alert("Camera access is required for the Breed Scanner to work.");
        onClose();
      }
    }
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [onClose]);

  const captureAndIdentify = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;
    setIsAnalyzing(true);
    
    const context = canvasRef.current.getContext('2d');
    if (!context) return;
    
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);
    
    const base64Data = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
    
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      
      // Using Gemini 3 Flash for fast vision identification
      const ai = new GoogleGenAI({ apiKey });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
            { text: "Identify the dog breed in this photo. Return only the breed name as plain text. If no dog is seen or it's unclear, say 'Unknown'." }
          ]
        }
      });
      const breed = response.text?.trim() || "Unknown";
      onScan(breed, `data:image/jpeg;base64,${base64Data}`);
    } catch (err) {
      console.error("Vision Analysis Error:", err);
      alert("AI Scan failed. Please check your API configuration.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center">
      <div className="absolute top-4 left-4 z-10">
        <button onClick={onClose} className="bg-black/40 p-3 rounded-full text-white hover:bg-black/60 transition-colors">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 border-2 border-white/30 rounded-3xl relative">
            <div className="absolute inset-0 border-2 border-orange-500 rounded-3xl animate-pulse"></div>
        </div>
      </div>
      <div className="absolute bottom-10 flex flex-col items-center gap-4 w-full px-6">
        <p className="text-white text-sm font-bold bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm">Frame the dog in the box</p>
        <button 
          onClick={captureAndIdentify}
          disabled={isAnalyzing}
          className={`w-20 h-20 rounded-full border-8 border-white/20 flex items-center justify-center transition-all ${isAnalyzing ? 'bg-gray-500' : 'bg-orange-600 hover:bg-orange-700 active:scale-95'}`}
        >
          {isAnalyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-10 h-10 bg-white rounded-full shadow-lg"></div>}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main Application ---

/**
 * Main App component managing the chat interface, dog profiles, and service integrations.
 */
const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => {
    const saved = localStorage.getItem('paws4life_dogs_v3');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws4life_active_id_v3'));
  const activeDog = profiles.find(p => p.id === (activeId || profiles[0]?.id)) || null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [location, setLocation] = useState<UserLocation | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeDog) {
      localStorage.setItem('paws4life_active_id_v3', activeDog.id);
    }
  }, [activeDog]);

  useEffect(() => {
    localStorage.setItem('paws4life_dogs_v3', JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.warn("Location access denied or unavailable", err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const currentInput = inputValue;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentInput,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Pass the complete profile context to the service
      const profileContext: DogProfile | undefined = activeDog ? {
        ...activeDog
      } : undefined;

      const { text, sources } = await generateDogAdvice(
        currentInput,
        messages,
        location,
        profileContext
      );

      const modelMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: text,
        timestamp: Date.now(),
        groundingUrls: sources
      };

      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "I'm having a little trouble connecting to my dog knowledge right now. Can you try again?",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanResult = (breed: string, photo: string) => {
    const newId = Date.now().toString();
    const newProfile: DogProfile = {
      id: newId,
      name: breed !== 'Unknown' ? `${breed}` : 'Unknown Dog',
      breed: breed,
      age: '',
      weight: '',
      allergies: '',
      conditions: '',
      homeLocation: '',
      photo: photo
    };
    setProfiles(prev => [...prev, newProfile]);
    setActiveId(newId);
    setIsScanning(false);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'model',
      text: `I've successfully identified the dog as a **${breed}**! How can I help you with their health, diet, or training today?`,
      timestamp: Date.now()
    }]);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans max-w-2xl mx-auto shadow-2xl relative overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 p-4 sticky top-0 z-50 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-orange-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
            <i className="fa-solid fa-paw text-xl"></i>
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tight text-gray-800">paws4life<span className="text-orange-600">.ai</span></h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Expert Vet Assistant</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowMap(true)}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
            title="Nearby Parks & Vets"
          >
            <i className="fa-solid fa-map-location-dot"></i>
          </button>
          <button 
            onClick={() => setIsScanning(true)}
            className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center text-white hover:bg-orange-700 transition-transform active:scale-95 shadow-md"
            title="Scan Dog Breed"
          >
            <i className="fa-solid fa-camera"></i>
          </button>
        </div>
      </header>

      {/* Profiles Bar */}
      {profiles.length > 0 && (
        <div className="bg-white border-b border-gray-100 p-3 flex gap-3 overflow-x-auto scrollbar-hide shrink-0">
          {profiles.map(p => (
            <button 
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${activeId === p.id ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold ring-2 ring-orange-100' : 'bg-gray-50 border-gray-100 text-gray-500'}`}
            >
              <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden shadow-inner">
                {p.photo ? <img src={p.photo} className="w-full h-full object-cover" alt={p.name} /> : <i className="fa-solid fa-dog text-[10px] m-1.5"></i>}
              </div>
              <span className="text-xs truncate max-w-[80px]">{p.name}</span>
            </button>
          ))}
          <button 
            onClick={() => setIsScanning(true)}
            className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors"
          >
            <i className="fa-solid fa-plus text-xs"></i>
          </button>
        </div>
      )}

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 px-8 py-12 opacity-80">
            <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 animate-bounce shadow-inner">
              <i className="fa-solid fa-comment-medical text-4xl"></i>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-gray-800">Your Personal Vet Expert</h2>
              <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">Ask anything about your dog's health, find local clinics, or scan a new breed.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              <button onClick={() => setInputValue("What's the best diet for a puppy?")} className="p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-600 hover:border-orange-200 hover:text-orange-600 shadow-sm transition-all hover:shadow-md active:scale-95">🍎 Diet Tips</button>
              <button onClick={() => setInputValue("Emergency vets open now?")} className="p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-600 hover:border-orange-200 hover:text-orange-600 shadow-sm transition-all hover:shadow-md active:scale-95">🏥 ER Vets</button>
              <button onClick={() => setInputValue("How to stop barking?")} className="p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-600 hover:border-orange-200 hover:text-orange-600 shadow-sm transition-all hover:shadow-md active:scale-95">🎾 Training</button>
              <button onClick={() => setIsScanning(true)} className="p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-600 hover:border-orange-200 hover:text-orange-600 shadow-sm transition-all hover:shadow-md active:scale-95">📸 Scan Breed</button>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'}`}>
              <div className="whitespace-pre-wrap">
                {msg.text}
              </div>
              
              {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-50 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Verified Sources & Grounding</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.groundingUrls.map((source, sIdx) => (
                      <a 
                        key={sIdx} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[10px] bg-gray-50 text-gray-500 px-2 py-1 rounded-lg border border-gray-100 hover:text-orange-600 hover:bg-orange-50 hover:border-orange-200 transition-all"
                      >
                        <i className="fa-solid fa-link mr-1"></i> {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Inject Ads Contextually */}
            {msg.role === 'model' && idx === 1 && (
              <div className="w-full mt-6 animate-in fade-in slide-in-from-bottom-2">
                <AdBanner ad={MOCK_ADS[0]} />
              </div>
            )}
            {msg.role === 'model' && idx === 3 && (
              <div className="w-full mt-6 animate-in fade-in slide-in-from-bottom-2">
                <AdBanner ad={MOCK_ADS[1]} />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start">
            <div className="bg-white border border-gray-100 p-4 rounded-3xl rounded-tl-none flex gap-2 shadow-sm">
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-gray-100 p-4 sticky bottom-0 z-50 shrink-0">
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <input 
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={activeDog ? `Ask about your ${activeDog.breed}...` : "Type a question..."}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-inner"
          />
          <button 
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${!inputValue.trim() || isLoading ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-orange-600 text-white shadow-lg shadow-orange-200 active:scale-95 hover:bg-orange-700'}`}
          >
            <i className={`fa-solid ${isLoading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
          </button>
        </form>
      </footer>

      {isScanning && <BreedScanner onScan={handleScanResult} onClose={() => setIsScanning(false)} />}
      {showMap && <MapView location={location} onClose={() => setShowMap(false)} />}
    </div>
  );
};

export default App;
