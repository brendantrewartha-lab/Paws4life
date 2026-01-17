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
  conditions?: string;
  homeLocation?: string;
  vaccinations?: string;
  procedures?: string;
  photo?: string; // base64
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface AdSpot {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  type: 'product' | 'service';
}