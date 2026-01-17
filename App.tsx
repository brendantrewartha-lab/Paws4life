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
  name: string;
  breed: string;
  age: string;
  weight: string;
  allergies: string;
  conditions: string;
  homeLocation?: string;
}

interface AdSpot {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  type: 'vet' | 'food' | 'breeder' | 'accessory';
  targetBreeds?: string[];
  targetConditions?: string[];
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

// --- Constants & Mock Data ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

const MOCK_ADS: AdSpot[] = [
  {
    id: '1',
    title: 'VetDirect Urgent Care',
    description: '24/7 Virtual vet consults from $19. Perfect for peace of mind.',
    imageUrl: 'https://picsum.photos/seed/vet/300/200',
    link: 'https://example.com/vet',
    type: 'vet',
    targetConditions: ['Diabetes', 'Heart', 'Kidney']
  },
  {
    id: '2',
    title: 'PuppyPower Premium Kibble',
    description: 'Scientifically formulated for high-energy breeds. Shop 20% off.',
    imageUrl: 'https://picsum.photos/seed/food/300/200',
    link: 'https://example.com/food',
    type: 'food',
    targetBreeds: ['Golden Retriever', 'Labrador', 'Border Collie']
  },
  {
    id: '3',
    title: 'Small Breed Spa Day',
    description: 'Gentle grooming for smaller companions. Book your spot.',
    imageUrl: 'https://picsum.photos/seed/spa/300/200',
    link: 'https://example.com/groom',
    type: 'accessory',
    targetBreeds: ['Pug', 'Chihuahua', 'Yorkshire Terrier', 'French Bulldog']
  }
];

const COMMON_BREEDS = [
  "Labrador Retriever", "German Shepherd", "Golden Retriever", "French Bulldog", 
  "Bulldog", "Poodle", "Beagle", "Rottweiler", "German Shorthaired Pointer", 
  "Pembroke Welsh Corgi", "Dachshund", "Yorkshire Terrier", "Australian Shepherd", 
  "Boxer", "Siberian Husky", "Cavalier King Charles Spaniel", "Great Dane", 
  "Doberman Pinscher", "Miniature Schnauzer", "Australian Cattle Dog", "Shih Tzu",
  "Boston Terrier", "Havanese", "Bernese Mountain Dog", "Mastiff", "Chihuahua"
];

// --- Sub-Components ---
const AdBanner: React.FC<{ ad: AdSpot }> = ({ ad }) => (
  <a 
    href={ad.link} 
    target="_blank" 
    rel="noopener noreferrer"
    className="block bg-white border border-orange-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
  >
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
      L.marker([lat, lng], { icon }).addTo(mapInstance.current).bindPopup(`<div class="p-1"><h4 class="font-bold text-gray-800">${place.name}</h4><p class="text-xs text-gray-500 mb-1 capitalize">${place.type}</p><div class="flex items-center gap-2 mt-2"><span class="text-xs font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded">${place.rating}</span></div></div>`);
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
  const [messages, setMessages] = useState<Message[]>([{
    id: 'init',
    role: 'model',
    text: "Hello! I'm paws4life.ai, your expert canine companion. How can I assist you and your furry friend today?",
    timestamp: Date.now()
  }]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useState<UserLocation | undefined>();
  const [activeTab, setActiveTab] = useState<'chat' | 'local'>('chat');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  
  const [dogProfile, setDogProfile] = useState<DogProfile>(() => {
    const saved = localStorage.getItem('paws4life_profile');
    return saved ? JSON.parse(saved) : { name: '', breed: '', age: '', weight: '', allergies: '', conditions: '', homeLocation: '' };
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('paws4life_profile', JSON.stringify(dogProfile));
  }, [dogProfile]);

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
      const contents = messages.map(msg => ({ role: msg.role === 'model' ? 'model' : 'user', parts: [{ text: msg.text }] }));
      contents.push({ role: 'user', parts: [{ text: inputText }] });

      const systemInstruction = `You are "paws4life.ai", a veterinary assistant. User's dog: ${dogProfile.name || 'Unknown'}, ${dogProfile.breed || 'Unknown'}. Prioritize safety.`;
      const tools: any[] = [{ googleSearch: {} }];
      const modelName = location ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';
      if (location) tools.push({ googleMaps: {} });

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction,
          tools: tools,
          toolConfig: location ? { retrievalConfig: { latLng: { latitude: location.latitude, longitude: location.longitude } } } : undefined
        }
      });

      const text = response.text || "I'm sorry, I couldn't process that.";
      const sources: any[] = [];
      response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((chunk: any) => {
        if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
        else if (chunk.maps) sources.push({ title: chunk.maps.title, uri: chunk.maps.uri });
      });

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, timestamp: Date.now(), groundingUrls: sources }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Error connecting to AI. Check your API key.", timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const targetedAds = [...MOCK_ADS].sort((a, b) => {
    let scoreA = 0, scoreB = 0;
    if (dogProfile.breed) {
      if (a.targetBreeds?.some(br => dogProfile.breed.toLowerCase().includes(br.toLowerCase()))) scoreA += 2;
      if (b.targetBreeds?.some(br => dogProfile.breed.toLowerCase().includes(br.toLowerCase()))) scoreB += 2;
    }
    return scoreB - scoreA;
  });

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto bg-white shadow-xl overflow-hidden font-sans relative">
      <header className="bg-orange-600 text-white p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-paw text-2xl"></i>
          <div>
            <h1 className="text-xl font-bold leading-tight">paws4life.ai</h1>
            <p className="text-[10px] opacity-80 uppercase tracking-widest font-semibold">Expert Dog Care Hub</p>
          </div>
        </div>
        <button onClick={() => setIsProfileOpen(true)} className="w-10 h-10 rounded-full bg-orange-700 flex items-center justify-center hover:bg-orange-800 transition-colors">
          <i className="fa-solid fa-dog"></i>
        </button>
      </header>

      {isMapOpen && <MapView location={location} onClose={() => setIsMapOpen(false)} />}

      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-orange-600 p-4 text-white flex justify-between items-center">
              <h2 className="font-bold flex items-center gap-2"><i className="fa-solid fa-id-card"></i> Pup Profile</h2>
              <button onClick={() => setIsProfileOpen(false)}><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <input type="text" placeholder="Dog Name" value={dogProfile.name} onChange={e => setDogProfile({...dogProfile, name: e.target.value})} className="w-full border-b py-2 focus:outline-none focus:border-orange-500" />
              <input type="text" list="breeds" placeholder="Breed" value={dogProfile.breed} onChange={e => setDogProfile({...dogProfile, breed: e.target.value})} className="w-full border-b py-2 focus:outline-none focus:border-orange-500" />
              <datalist id="breeds">{COMMON_BREEDS.map(b => <option key={b} value={b} />)}</datalist>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="Age" value={dogProfile.age} onChange={e => setDogProfile({...dogProfile, age: e.target.value})} className="w-full border-b py-2 focus:outline-none focus:border-orange-500" />
                <input type="text" placeholder="Weight" value={dogProfile.weight} onChange={e => setDogProfile({...dogProfile, weight: e.target.value})} className="w-full border-b py-2 focus:outline-none focus:border-orange-500" />
              </div>
              <textarea placeholder="Allergies" value={dogProfile.allergies} onChange={e => setDogProfile({...dogProfile, allergies: e.target.value})} className="w-full border rounded p-2 focus:outline-none focus:border-orange-500" rows={2} />
              <button onClick={() => setIsProfileOpen(false)} className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700">Save Profile</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <section className={`flex-1 flex flex-col ${activeTab !== 'chat' ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none border'}`}>
                  <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                  {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-gray-300">
                      {msg.groundingUrls.map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" rel="noopener" className="text-[10px] bg-white/50 px-2 py-1 rounded border hover:bg-white flex items-center gap-1">
                          <i className="fa-solid fa-link"></i> {s.title.substring(0, 20)}...
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex gap-2 p-4 bg-gray-100 rounded-2xl w-24 animate-pulse"><div className="w-2 h-2 bg-orange-400 rounded-full"></div><div className="w-2 h-2 bg-orange-400 rounded-full"></div></div>}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendMessage} className="p-4 border-t bg-gray-50 flex gap-2">
            <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Ask about diet, health, or local vets..." className="flex-1 rounded-full border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            <button type="submit" disabled={isLoading} className="bg-orange-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-orange-700 disabled:bg-gray-400"><i className="fa-solid fa-paper-plane"></i></button>
          </form>
        </section>

        <aside className={`w-full md:w-80 bg-gray-50 border-l p-4 space-y-6 overflow-y-auto ${activeTab === 'chat' ? 'hidden md:block' : 'block'}`}>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recommended</h3>
          <div className="space-y-4">{targetedAds.map(ad => <AdBanner key={ad.id} ad={ad} />)}</div>
          <div className="bg-orange-100 p-4 rounded-xl border border-orange-200">
            <h3 className="font-bold text-orange-800 text-sm mb-2"><i className="fa-solid fa-location-dot"></i> Local Finder</h3>
            <button onClick={() => setIsMapOpen(true)} className="w-full bg-white text-orange-600 text-xs font-bold py-2 rounded-lg border border-orange-200 hover:bg-orange-50">Open Map</button>
          </div>
          {dogProfile.name && (
            <div className="bg-white p-4 rounded-xl border shadow-sm text-xs space-y-2">
              <h4 className="font-bold border-b pb-1 text-gray-500 uppercase tracking-tight">{dogProfile.name}'s Stats</h4>
              <p><b>Breed:</b> {dogProfile.breed || 'N/A'}</p>
              <p><b>Age/Wt:</b> {dogProfile.age || '?'}/{dogProfile.weight || '?'}</p>
            </div>
          )}
        </aside>
      </main>

      <nav className="flex md:hidden border-t bg-white h-16">
        <button onClick={() => setActiveTab('chat')} className={`flex-1 flex flex-col items-center justify-center gap-1 ${activeTab === 'chat' ? 'text-orange-600' : 'text-gray-400'}`}><i className="fa-solid fa-message"></i><span className="text-[10px] font-bold">Chat</span></button>
        <button onClick={() => setActiveTab('local')} className={`flex-1 flex flex-col items-center justify-center gap-1 ${activeTab === 'local' ? 'text-orange-600' : 'text-gray-400'}`}><i className="fa-solid fa-star"></i><span className="text-[10px] font-bold">Local</span></button>
      </nav>
    </div>
  );
};

export default App;