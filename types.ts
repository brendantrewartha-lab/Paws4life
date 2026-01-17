export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  groundingUrls?: Array<{ title: string; uri: string }>;
}

export interface HealthRecord {
  id: string;
  date: string;
  title: string;
  notes?: string;
}

export interface DogReminder {
  id: string;
  date: string;
  type: 'Vaccination' | 'Check-up' | 'Grooming' | 'Medication' | 'Other';
  title: string;
}

export interface DogProfile {
  id: string;
  name: string;
  breed?: string;
  age?: string;
  weight?: string;
  photo?: string; // base64
  vaccinations: HealthRecord[];
  procedures: HealthRecord[];
  reminders: DogReminder[];
  allergies?: string;
  conditions?: string;
  homeLocation?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  instagram?: string;
  facebook?: string;
  xPlatform?: string;
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
  type: string;
}