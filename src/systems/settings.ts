/** Persisted user preferences (sound/music/haptics). */
const KEY = "tessera.settings";

export interface SettingsData {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
}

const DEFAULTS: SettingsData = { music: true, sfx: true, haptics: true };

class SettingsStore {
  private data: SettingsData;

  constructor() {
    let loaded: Partial<SettingsData> = {};
    try {
      loaded = JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch {
      loaded = {};
    }
    this.data = { ...DEFAULTS, ...loaded };
  }

  get music() {
    return this.data.music;
  }
  get sfx() {
    return this.data.sfx;
  }
  get haptics() {
    return this.data.haptics;
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    this.save();
  }

  toggle(key: keyof SettingsData): boolean {
    this.data[key] = !this.data[key];
    this.save();
    return this.data[key];
  }

  private save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }
}

export const Settings = new SettingsStore();
