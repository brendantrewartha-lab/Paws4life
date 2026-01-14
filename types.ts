
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  groundingUrls?: Array<{ title: string; uri: string }>;
}

export interface DogProfile {
  name: string;
  breed: string;
  age: string;
  weight: string;
  allergies: string;
  conditions: string;
  homeLocation?: string;
}

export interface AdSpot {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  type: 'vet' | 'food' | 'breeder' | 'accessory';
  targetBreeds?: string[];
  targetConditions?: string[];
  promoted?: boolean;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}
