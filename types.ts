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
  allergies?: string;
  // Fix: Added missing properties used in geminiService.ts
  conditions?: string;
  homeLocation?: string;
  photo?: string; // base64
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

// Fix: Added exported AdSpot member requested by AdBanner.tsx
export interface AdSpot {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  type: 'product' | 'service';
}