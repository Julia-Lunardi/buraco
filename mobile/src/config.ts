// Values come from .env locally and from eas.json `env` in EAS builds (.env is gitignored
// and never reaches EAS: Salvie's TestFlight build crashed on missing client ids).

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8001';

export const GOOGLE_CLIENT_IDS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
};

export const LEGAL_URLS = {
  // No domain yet (runbook): set these once privacy and terms are published.
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || '',
  terms: process.env.EXPO_PUBLIC_TERMS_URL || '',
};
