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
  photo?: string; // base64
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

// --- Constants ---
const MOCK_ADS = [
  { id: '1', title: 'VetDirect Care', desc: '24/7 Virtual consults', img: 'https://picsum.photos/seed/vet/200/200', link: '#' },
  { id: '2', title: 'PuppyPower', desc: 'Premium dog nutrition', img: 'https://picsum.photos/seed/food/200/200', link: '#' }
];

// --- Sub-Components ---

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
        alert("Camera access required for scanning.");
        onClose();
      }
    }
    startCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
            { text: "Identify the dog breed in this photo. Return only the breed name as plain text. If no dog is seen, say 'Unknown'." }
          ]
        }
      });
      const breed = response.text?.trim() || "Unknown";
      onScan(breed, `data:image/jpeg;base64,${base64Data}`);
    } catch (err) {
      console.error(err);
      alert("AI Scan failed. Please ensure your API_KEY is set in Vercel.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center">
      <div className="absolute top-4 left-4 z-10">
        <button onClick={onClose} className="bg-black/40 p-3 rounded-full text-white"><i className="fa-solid fa-xmark"></i></button>
      </div>
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 border-2 border-white/50 rounded-3xl relative">
            <div className="absolute inset-0 border-2 border-orange-500 rounded-3xl animate-pulse"></div>
        </div>
      </div>
      <div className="absolute bottom-10 flex flex-col items-center gap-4 w-full px-6">
        <p className="text-white text-sm font-bold bg-black/40 px-4 py-2 rounded-full">Point at the dog</p>
        <button 
          onClick={captureAndIdentify}
          disabled={isAnalyzing}
          className={`w-20 h-20 rounded-full border-8 border-white/20 flex items-center justify-center transition-all ${isAnalyzing ? 'bg-gray-500' : 'bg-orange-600 active:scale-95'}`}
        >
          {isAnalyzing ? <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i> : <div className="w-10 h-10 bg-white rounded-full"></div>}
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- Main Application ---
const App: React.FC = () => {
  const [profiles, setProfiles] = useState<DogProfile[]>(() => {
    const saved = localStorage.getItem('paws4life_dogs_v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem('paws4life_active_id_v2'));
  const activeDog = profiles.find(p => p.id === activeId) || profiles[0] || null;

  const [messages, setMessages] = useState<Message[]>([{
    id: 'init', role: 'model', text: "Woof! I'm your AI Pet Expert. You can add multiple dogs, scan breeds, and ask me anything about care and health!", timestamp: Date.now()
  }]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [editingDog, setEditingDog] = useState<Partial<DogProfile> | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('paws4life_dogs_v2', JSON.stringify(profiles));
    if (activeId) localStorage.setItem('paws4life_active_id_v2', activeId);
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [profiles, activeId, messages]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
      const context = activeDog ? `The user is focused on ${activeDog.name}, a ${activeDog.breed}. Age: ${activeDog.age}, Weight: ${activeDog.weight}, Allergies: ${activeDog.allergies}.` : "The user hasn't selected a specific dog profile yet.";
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: messages.concat(userMsg).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        config: { 
            systemInstruction: `You are "paws4life.ai", a friendly veterinary care assistant. ${context} Be encouraging but prioritize medical safety. Use Google Search for facts.`,
            tools: [{ googleSearch: {} }]
        }
      });

      const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const urls = grounding?.map((c: any) => ({ title: c.web?.title || 'Source', uri: c.web?.uri || '#' })) || [];

      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: response.text || "I'm having a little trouble barking right now.", 
        timestamp: Date.now(),
        groundingUrls: urls
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Something went wrong. Please check if your API_KEY is correctly set in your Vercel Environment Variables.", timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDog = () => {
    if (!editingDog?.name) return alert("Your dog needs a name!");
    const newDog = { ...editingDog, id: editingDog.id || Date.now().toString() } as DogProfile;
    if (editingDog.id) {
        setProfiles(prev => prev.map(p => p.id === editingDog.id ? newDog : p));
    } else {
        setProfiles(prev => [...prev, newDog]);
        setActiveId(newDog.id);
    }
    setEditingDog(null);
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-white shadow-2xl relative">
      <header className="bg-orange-600 text-white p-4 flex items-center justify-between shadow-lg z-50">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-xl"><i className="fa-solid fa-paw text-xl"></i></div>
          <h1 className="text-xl font-bold tracking-tight">paws4life.ai</h1>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={() => setIsScannerOpen(true)} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors" title="Scan Dog Breed">
                <i className="fa-solid fa-camera"></i>
            </button>
            <button onClick={() => setIsManagerOpen(true)} className="flex items-center gap-2 bg-orange-700 px-3 py-1.5 rounded-full hover:bg-orange-800 transition-colors">
                {activeDog?.photo ? <img src={activeDog.photo} className="w-5 h-5 rounded-full border border-white object-cover" /> : <i className="fa-solid fa-dog"></i>}
                <span className="text-xs font-bold">{activeDog?.name || "Dogs"}</span>
            </button>
        </div>
      </header>

      {isScannerOpen && (
        <BreedScanner 
            onScan={(breed, photo) => { setEditingDog({ breed, photo }); setIsScannerOpen(false); setIsManagerOpen(true); }} 
            onClose={() => setIsScannerOpen(false)} 
        />
      )}

      {isManagerOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-300">
                <div className="bg-orange-600 p-6 text-white flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2"><i className="fa-solid fa-id-card"></i> Profiles</h2>
                    <button onClick={() => { setIsManagerOpen(false); setEditingDog(null); }}><i className="fa-solid fa-xmark text-2xl"></i></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                    {editingDog ? (
                        <div className="space-y-4 animate-in fade-in zoom-in-95">
                            <div className="flex justify-center relative">
                                <div className="w-28 h-28 rounded-3xl bg-white border-4 border-orange-100 overflow-hidden flex items-center justify-center shadow-md">
                                    {editingDog.photo ? <img src={editingDog.photo} className="w-full h-full object-cover" /> : <i className="fa-solid fa-camera text-3xl text-gray-200"></i>}
                                </div>
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => setEditingDog({...editingDog, photo: ev.target?.result as string});
                                        reader.readAsDataURL(file);
                                    }
                                }} />
                            </div>
                            <div className="space-y-3">
                                <input type="text" placeholder="Name (e.g. Buddy)" value={editingDog.name || ''} onChange={e => setEditingDog({...editingDog, name: e.target.value})} className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 ring-orange-400 font-bold" />
                                <input type="text" placeholder="Breed" value={editingDog.breed || ''} onChange={e => setEditingDog({...editingDog, breed: e.target.value})} className="w-full p-4 bg-white rounded-2xl border-none shadow-sm" />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" placeholder="Age" value={editingDog.age || ''} onChange={e => setEditingDog({...editingDog, age: e.target.value})} className="p-4 bg-white rounded-2xl border-none shadow-sm" />
                                    <input type="text" placeholder="Weight" value={editingDog.weight || ''} onChange={e => setEditingDog({...editingDog, weight: e.target.value})} className="p-4 bg-white rounded-2xl border-none shadow-sm" />
                                </div>
                                <textarea placeholder="Allergies or Medical Notes..." value={editingDog.allergies || ''} onChange={e => setEditingDog({...editingDog, allergies: e.target.value})} className="w-full p-4 bg-white rounded-2xl border-none shadow-sm h-24 resize-none" />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setEditingDog(null)} className="flex-1 py-4 text-gray-500 font-bold">Cancel</button>
                                <button onClick={handleSaveDog} className="flex-[2] bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-orange-700 transition-colors">Save Dog</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {profiles.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No dogs added yet. Bark away!</p>}
                            {profiles.map(p => (
                                <div key={p.id} onClick={() => { setActiveId(p.id); setIsManagerOpen(false); }} className={`p-4 rounded-2xl border-2 flex items-center gap-4 transition-all cursor-pointer ${activeId === p.id ? 'border-orange-500 bg-orange-50 shadow-inner' : 'border-white bg-white hover:border-orange-200 shadow-sm'}`}>
                                    <div className="w-14 h-14 rounded-2xl bg-gray-100 overflow-hidden border">
                                        {p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><i className="fa-solid fa-dog"></i></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-800 truncate">{p.name}</h4>
                                        <p className="text-xs text-gray-500 truncate">{p.breed}</p>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingDog(p); }} className="p-2 text-gray-400 hover:text-orange-500"><i className="fa-solid fa-pen"></i></button>
                                        <button onClick={(e) => { e.stopPropagation(); setProfiles(prev => prev.filter(x => x.id !== p.id)); }} className="p-2 text-gray-400 hover:text-red-500"><i className="fa-solid fa-trash-can"></i></button>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setEditingDog({})} className="w-full py-5 border-2 border-dashed border-gray-300 rounded-3xl text-gray-400 font-bold hover:text-orange-600 hover:border-orange-400 hover:bg-orange-50 transition-all flex items-center justify-center gap-2">
                                <i className="fa-solid fa-plus"></i> Add New Dog
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      <main className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
            {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                    <div className={`max-w-[90%] p-4 rounded-3xl shadow-sm ${msg.role === 'user' ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border'}`}>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                        {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                                {msg.groundingUrls.map((u, i) => (
                                    <a key={i} href={u.uri} target="_blank" rel="noopener" className="text-[10px] bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-bold border border-orange-100 hover:bg-orange-100 transition-colors">
                                        <i className="fa-solid fa-link mr-1"></i> {u.title}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}
            {isLoading && <div className="flex gap-2 p-4 bg-white border rounded-3xl w-24 shadow-sm"><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>}
            <div ref={chatEndRef} />
        </div>
        
        <form onSubmit={sendMessage} className="p-4 bg-white border-t flex gap-2 items-center">
            <input 
              type="text" 
              value={inputText} 
              onChange={e => setInputText(e.target.value)} 
              placeholder={activeDog ? `Ask about ${activeDog.name}...` : "Ask a dog care question..."} 
              className="flex-1 p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2 ring-orange-200 text-sm border-none" 
            />
            <button 
              type="submit" 
              disabled={isLoading || !inputText.trim()} 
              className="bg-orange-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 disabled:opacity-50 disabled:active:scale-100 transition-all"
            >
              <i className="fa-solid fa-paper-plane text-xl"></i>
            </button>
        </form>
      </main>

      <footer className="hidden lg:block p-4 border-t bg-white">
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {MOCK_ADS.map(ad => (
                <div key={ad.id} className="min-w-[220px] flex items-center gap-3 bg-orange-50/30 p-3 rounded-2xl border border-orange-100">
                    <img src={ad.img} className="w-12 h-12 rounded-xl object-cover shadow-sm" />
                    <div className="min-w-0">
                        <p className="text-[10px] font-black text-orange-600 uppercase tracking-wider mb-0.5">Sponsored</p>
                        <p className="text-[11px] font-bold text-gray-800 truncate">{ad.title}</p>
                        <p className="text-[9px] text-gray-500 truncate">{ad.desc}</p>
                    </div>
                </div>
            ))}
        </div>
      </footer>
    </div>
  );
};

export default App;