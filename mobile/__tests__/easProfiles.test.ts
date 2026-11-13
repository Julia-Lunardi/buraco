import eas from '../eas.json';

// Every build profile needs the Google client ids: .env never reaches EAS, and without
// them the sign-in screen hides the Google button (production builds shipped that way).
const REQUIRED = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
];

type Profile = { extends?: string; env?: Record<string, string> };
const profiles = eas.build as Record<string, Profile>;

function envOf(name: string): Record<string, string> {
  const p = profiles[name];
  return { ...(p.extends ? envOf(p.extends) : {}), ...p.env };
}

test.each(Object.keys(profiles))('build profile %s sets the API url and Google client ids', (name) => {
  const env = envOf(name);
  for (const key of REQUIRED) expect({ [key]: env[key] || '' }).not.toEqual({ [key]: '' });
});
