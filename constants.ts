
import { User, AppSettings } from './types';

export const INITIAL_USERS: User[] = [
  {
    id: '1',
    name: "Erik Andersson",
    car: { model: "Tesla Model 3", batteryCapacity: 75 }
  },
  {
    id: '2',
    name: "Anna Berg",
    car: { model: "VW ID.4", batteryCapacity: 77 }
  }
];

export const CAR_MODELS = [
  { name: "Tesla Model 3/Y", capacity: 75 },
  { name: "VW ID.3/ID.4", capacity: 77 },
  { name: "Polestar 2", capacity: 78 },
  { name: "Kia EV6 / Ioniq 5", capacity: 77 },
  { name: "Volvo XC40 Recharge", capacity: 78 },
  { name: "Hybrid (Standard)", capacity: 12 },
  { name: "Annan (Ange kWh)", capacity: 60 }
];

export const SETTINGS: AppSettings = {
  kwhPrice: 2.5, // SEK/kWh
};
