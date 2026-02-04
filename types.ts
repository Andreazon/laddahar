
export interface Car {
  model: string;
  batteryCapacity: number; // in kWh
}

export interface User {
  id: string;
  name: string;
  car: Car;
  avatarUrl?: string;
}

export interface ChargingSession {
  userId: string;
  date: string; // YYYY-MM-DD
}

export interface AppSettings {
  kwhPrice: number; // SEK per kWh
  cloudId?: string; // ID för molnsynk via JSONBlob
}
