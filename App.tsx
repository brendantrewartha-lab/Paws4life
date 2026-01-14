
import React, { useState, useEffect, useRef } from 'react';
import { Message, AdSpot, UserLocation, DogProfile } from './types';
import { generateDogAdvice } from './services/geminiService';
import { AdBanner } from './components/AdBanner';
import { MapView } from './components/MapView';

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

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'model',
      text: "Hello! I'm paws4life.ai, your expert canine companion. Whether you have a medical question, need local park recommendations, or breed-specific tips, I'm here to help. How can I assist you and your furry friend today?",
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [location, setLocation] = useState<UserLocation | undefined>();
  const [activeTab, setActiveTab] = useState<'chat' | 'local' | 'resources'>('chat');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  
  const [ageError, setAgeError] = useState('');
  const [weightError, setWeightError] = useState('');

  const [dogProfile, setDogProfile] = useState<DogProfile>(() => {
    const saved = localStorage.getItem('paws4life_profile');
    return saved ? JSON.parse(saved) : {
      name: '',
      breed: '',
      age: '',
      weight: '',
      allergies: '',
      conditions: '',
      homeLocation: ''
    };
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
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

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const validateAge = (val: string) => {
    const ageRegex = /^\d+(\s*(yr|yrs|year|years|mo|mos|month|months))?$/i;
    if (val && !ageRegex.test(val)) {
      setAgeError('Use format: "5 years" or "6 mo"');
    } else {
      setAgeError('');
    }
  };

  const validateWeight = (val: string) => {
    const weightRegex = /^\d+(\s*(kg|lbs|lb))?$/i;
    if (val && !weightRegex.test(val)) {
      setWeightError('Use format: "30kg" or "15 lbs"');
    } else {
      setWeightError('');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    const { text, sources } = await generateDogAdvice(inputText, messages, location, dogProfile);

    const modelMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: text,
      timestamp: Date.now(),
      groundingUrls: sources
    };

    setMessages(prev => [...prev, modelMsg]);
    setIsLoading(false);
  };

  const handleUseCurrentLocation = () => {
    if (location) {
      setDogProfile({
        ...dogProfile, 
        homeLocation: `Near ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
      });
    } else {
      alert("Location data is not available. Please ensure GPS is enabled.");
    }
  };

  const targetedAds = [...MOCK_ADS].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (dogProfile.breed) {
      if (a.targetBreeds?.some(b => dogProfile.breed.toLowerCase().includes(b.toLowerCase()))) scoreA += 2;
      if (b.targetBreeds?.some(br => dogProfile.breed.toLowerCase().includes(br.toLowerCase()))) scoreB += 2;
    }
    if (dogProfile.conditions) {
      if (a.targetConditions?.some(c => dogProfile.conditions.toLowerCase().includes(c.toLowerCase()))) scoreA += 3;
      if (b.targetConditions?.some(c => dogProfile.conditions.toLowerCase().includes(c.toLowerCase()))) scoreB += 3;
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
        <div className="flex gap-4">
           <button 
             onClick={() => setIsProfileOpen(true)}
             className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${dogProfile.name ? 'bg-orange-500 ring-2 ring-white/50' : 'bg-orange-700 hover:bg-orange-800'}`}
             title="Dog Profile"
           >
             <i className="fa-solid fa-dog"></i>
           </button>
        </div>
      </header>

      {isMapOpen && (
        <MapView location={location} onClose={() => setIsMapOpen(false)} />
      )}

      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-200">
            <div className="bg-orange-600 p-4 text-white flex justify-between items-center">
              <h2 className="font-bold flex items-center gap-2">
                <i className="fa-solid fa-id-card"></i>
                Pup Profile
              </h2>
              <button onClick={() => setIsProfileOpen(false)} className="hover:rotate-90 transition-transform">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Dog's Name</label>
                <input 
                  type="text" 
                  value={dogProfile.name}
                  onChange={e => setDogProfile({...dogProfile, name: e.target.value})}
                  className="w-full border-b border-gray-300 focus:border-orange-500 focus:outline-none py-1 text-sm"
                  placeholder="e.g. Buddy"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Breed</label>
                  <input 
                    type="text" 
                    list="breed-list"
                    value={dogProfile.breed}
                    onChange={e => setDogProfile({...dogProfile, breed: e.target.value})}
                    className="w-full border-b border-gray-300 focus:border-orange-500 focus:outline-none py-1 text-sm"
                    placeholder="e.g. Golden Retriever"
                  />
                  <datalist id="breed-list">
                    {COMMON_BREEDS.map(breed => <option key={breed} value={breed} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Age</label>
                  <input 
                    type="text" 
                    value={dogProfile.age}
                    onChange={e => {
                      setDogProfile({...dogProfile, age: e.target.value});
                      validateAge(e.target.value);
                    }}
                    className={`w-full border-b ${ageError ? 'border-red-500' : 'border-gray-300'} focus:border-orange-500 focus:outline-none py-1 text-sm`}
                    placeholder="e.g. 5 years"
                  />
                  {ageError && <p className="text-[10px] text-red-500 mt-1">{ageError}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Weight</label>
                  <input 
                    type="text" 
                    value={dogProfile.weight}
                    onChange={e => {
                      setDogProfile({...dogProfile, weight: e.target.value});
                      validateWeight(e.target.value);
                    }}
                    className={`w-full border-b ${weightError ? 'border-red-500' : 'border-gray-300'} focus:border-orange-500 focus:outline-none py-1 text-sm`}
                    placeholder="e.g. 30kg"
                  />
                  {weightError && <p className="text-[10px] text-red-500 mt-1">{weightError}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase flex items-center justify-between">
                    Home Location
                    <button 
                      onClick={handleUseCurrentLocation}
                      className="text-[10px] text-orange-600 hover:text-orange-700 font-bold"
                    >
                      📍 Use Current
                    </button>
                  </label>
                  <input 
                    type="text" 
                    value={dogProfile.homeLocation}
                    onChange={e => setDogProfile({...dogProfile, homeLocation: e.target.value})}
                    className="w-full border-b border-gray-300 focus:border-orange-500 focus:outline-none py-1 text-sm"
                    placeholder="e.g. Downtown SF"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Known Allergies</label>
                <textarea 
                  value={dogProfile.allergies}
                  onChange={e => setDogProfile({...dogProfile, allergies: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg p-2 focus:ring-1 focus:ring-orange-500 focus:outline-none text-sm mt-1"
                  rows={2}
                  placeholder="e.g. Chicken, Beef, Pollen..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Medical Conditions</label>
                <textarea 
                  value={dogProfile.conditions}
                  onChange={e => setDogProfile({...dogProfile, conditions: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg p-2 focus:ring-1 focus:ring-orange-500 focus:outline-none text-sm mt-1"
                  rows={2}
                  placeholder="e.g. Hip Dysplasia, Diabetes..."
                />
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t flex gap-2">
              <button 
                onClick={() => {
                  if (!ageError && !weightError) setIsProfileOpen(false);
                }}
                className="flex-1 bg-orange-600 text-white font-bold py-2 rounded-xl hover:bg-orange-700 transition-colors disabled:bg-gray-400"
                disabled={!!ageError || !!weightError}
              >
                Save Pup Info
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <section className={`flex-1 flex flex-col ${activeTab !== 'chat' ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 ${
                  msg.role === 'user' 
                    ? 'bg-orange-500 text-white rounded-tr-none shadow-lg' 
                    : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200 shadow-sm'
                }`}>
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:mb-2 whitespace-pre-wrap text-sm">
                    {msg.text}
                  </div>
                  
                  {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-300 border-opacity-30">
                      <p className="text-[10px] font-bold uppercase mb-2">Verified Sources:</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.groundingUrls.slice(0, 3).map((source, idx) => (
                          <a 
                            key={idx} 
                            href={source.uri} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] bg-white/50 px-2 py-1 rounded border border-gray-400/30 hover:bg-white transition-colors flex items-center gap-1"
                          >
                            <i className="fa-solid fa-link text-[8px]"></i>
                            {source.title.length > 25 ? source.title.substring(0, 25) + '...' : source.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl p-4 animate-pulse flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t bg-gray-50">
            <form onSubmit={handleSendMessage} className="flex gap-2 bg-white rounded-full border border-gray-300 p-1 pl-4 items-center shadow-sm focus-within:ring-2 focus-within:ring-orange-200">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={dogProfile.name ? `Ask about ${dogProfile.name}...` : "Ask about diet, health, or local vets..."}
                className="flex-1 border-none focus:outline-none text-sm p-2"
              />
              <button 
                type="submit"
                disabled={isLoading}
                className="bg-orange-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-orange-700 transition-colors disabled:bg-gray-400"
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </form>
          </div>
        </section>

        <aside className={`w-full md:w-80 bg-gray-50 border-l border-gray-200 flex flex-col ${activeTab === 'chat' ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 overflow-y-auto space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tailored For You</h3>
                {dogProfile.name && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold">
                    {dogProfile.name}'s Picks
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {targetedAds.map(ad => (
                  <AdBanner key={ad.id} ad={ad} />
                ))}
              </div>
            </div>

            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
              <h3 className="font-bold text-orange-800 text-sm mb-2 flex items-center gap-2">
                <i className="fa-solid fa-location-dot"></i>
                Local Services
              </h3>
              <p className="text-xs text-orange-700 mb-3 leading-relaxed">
                {location 
                  ? "We've found local clinics and parks in your current vicinity." 
                  : "Enable location to see nearby services."}
              </p>
              <button 
                onClick={() => setIsMapOpen(true)}
                className="w-full bg-white text-orange-600 text-xs font-bold py-2.5 rounded-xl border border-orange-200 hover:bg-orange-100 transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-map"></i>
                View Full Map
              </button>
            </div>

            {dogProfile.name && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-id-card-clip text-orange-500"></i>
                  Pup Info
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-gray-100 pb-1">
                    <span className="text-gray-500">Name</span>
                    <span className="font-semibold">{dogProfile.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-1">
                    <span className="text-gray-500">Home</span>
                    <span className="font-semibold text-right truncate max-w-[120px]">{dogProfile.homeLocation || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-1">
                    <span className="text-gray-500">Breed</span>
                    <span className="font-semibold">{dogProfile.breed || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-1">
                    <span className="text-gray-500">Age / Weight</span>
                    <span className="font-semibold">{dogProfile.age || '—'} / {dogProfile.weight || '—'}</span>
                  </div>
                  {dogProfile.allergies && (
                    <div className="pt-1">
                      <span className="text-gray-500 block mb-0.5">Allergies</span>
                      <span className="text-red-600 font-medium italic leading-snug">{dogProfile.allergies}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-auto p-4 bg-gradient-to-br from-orange-600 to-red-600 text-white">
            <p className="text-sm font-bold mb-1">Go paws4life.ai Premium</p>
            <p className="text-[10px] opacity-90 mb-3">Priority vet responses & personalized health tracking.</p>
            <button className="w-full bg-white text-orange-600 text-xs font-bold py-2 rounded shadow-md hover:bg-orange-50 transition-colors">
              Upgrade $9.99/mo
            </button>
          </div>
        </aside>
      </main>

      <nav className="flex md:hidden border-t border-gray-200 bg-white shadow-lg">
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 flex flex-col items-center gap-1 ${activeTab === 'chat' ? 'text-orange-600 border-t-2 border-orange-600' : 'text-gray-400'}`}
        >
          <i className="fa-solid fa-message"></i>
          <span className="text-[10px] font-bold">Expert Chat</span>
        </button>
        <button 
          onClick={() => setActiveTab('local')}
          className={`flex-1 py-3 flex flex-col items-center gap-1 ${activeTab === 'local' ? 'text-orange-600 border-t-2 border-orange-600' : 'text-gray-400'}`}
        >
          <i className="fa-solid fa-star"></i>
          <span className="text-[10px] font-bold">Picks</span>
        </button>
        <button 
          onClick={() => setActiveTab('resources')}
          className={`flex-1 py-3 flex flex-col items-center gap-1 ${activeTab === 'resources' ? 'text-orange-600 border-t-2 border-orange-600' : 'text-gray-400'}`}
        >
          <i className="fa-solid fa-book-open"></i>
          <span className="text-[10px] font-bold">Resources</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
