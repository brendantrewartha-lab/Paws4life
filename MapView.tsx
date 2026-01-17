import React, { useEffect, useRef } from 'react';
import { UserLocation } from '../types';

interface MapViewProps {
  location: UserLocation | undefined;
  onClose: () => void;
}

declare const L: any;

export const MapView: React.FC<MapViewProps> = ({ location, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !location) return;

    // Initialize map
    mapInstance.current = L.map(mapRef.current).setView([location.latitude, location.longitude], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance.current);

    const dogIcon = L.divIcon({
      html: '<div class="bg-orange-600 text-white w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg"><i class="fa-solid fa-paw"></i></div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const vetIcon = L.divIcon({
      html: '<div class="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg"><i class="fa-solid fa-hospital"></i></div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const userIcon = L.divIcon({
      html: '<div class="bg-green-500 w-4 h-4 rounded-full border-2 border-white shadow-lg ring-4 ring-green-500/30"></div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    L.marker([location.latitude, location.longitude], { icon: userIcon })
      .addTo(mapInstance.current)
      .bindPopup('<b>You are here</b>');

    const places = [
      { name: 'Happy Paws Dog Park', type: 'park', offset: [0.005, 0.008], rating: '4.8 ⭐' },
      { name: 'Canine Creek Reserve', type: 'park', offset: [-0.003, -0.01], rating: '4.5 ⭐' },
      { name: 'Central Vet Hospital', type: 'vet', offset: [0.01, -0.005], rating: '4.9 ⭐', hours: 'Open 24/7' },
      { name: 'PetCare Urgent Clinic', type: 'vet', offset: [-0.008, 0.004], rating: '4.2 ⭐', hours: '9am - 6pm' },
    ];

    places.forEach(place => {
      const lat = location.latitude + place.offset[0];
      const lng = location.longitude + place.offset[1];
      const icon = place.type === 'park' ? dogIcon : vetIcon;
      L.marker([lat, lng], { icon }).addTo(mapInstance.current).bindPopup(`<b>${place.name}</b><br>${place.type}`);
    });

    return () => { if (mapInstance.current) mapInstance.current.remove(); };
  }, [location]);

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-white animate-in">
      <header className="bg-orange-600 text-white shrink-0 shadow-lg">
        <div style={{ height: 'max(env(safe-area-inset-top), 60px)' }} className="w-full"></div>
        <div className="px-5 pb-5 flex items-center justify-between min-h-[64px]">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/20 active:scale-90 transition-all">
              <i className="fa-solid fa-chevron-left text-lg"></i>
            </button>
            <h2 className="font-black italic text-xl tracking-tighter">Nearby Services</h2>
          </div>
          <div className="text-[10px] font-black bg-orange-500 px-3 py-1.5 rounded-full border border-white/20 uppercase tracking-widest">Vets & Parks</div>
        </div>
      </header>
      
      <div className="flex-1 relative">
        {!location && (
          <div className="absolute inset-0 z-[70] bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
            <i className="fa-solid fa-location-crosshairs text-4xl text-slate-200 mb-4"></i>
            <h3 className="font-bold text-slate-800 mb-2">Location Required</h3>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">Please enable location permissions to see dog-friendly services near you.</p>
          </div>
        )}
        <div ref={mapRef} className="h-full w-full"></div>
      </div>

      <footer className="p-4 bg-white border-t border-slate-100 flex gap-3 overflow-x-auto whitespace-nowrap scrollbar-hide" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}>
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-blue-100">
          <i className="fa-solid fa-hospital"></i> Vets
        </div>
        <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-orange-100">
          <i className="fa-solid fa-tree"></i> Dog Parks
        </div>
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-green-100">
          <i className="fa-solid fa-bolt"></i> Urgent Care
        </div>
      </footer>
    </div>
  );
};