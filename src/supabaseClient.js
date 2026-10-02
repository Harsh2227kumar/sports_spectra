import { createClient } from '@supabase/supabase-js';

export const getCleanUrl = (rawUrl) => {
  if (!rawUrl) return '';
  let clean = rawUrl.trim().replace(/\/+$/, '');
  // Clean /rest/v1 if user accidentally appended it
  clean = clean.replace(/\/rest\/v1\/?$/, '');
  
  // If user only typed project ID (e.g. abcdefghijklmnop)
  if (!clean.includes('.') && !clean.includes('://') && clean.length > 5) {
    clean = `https://${clean}.supabase.co`;
  } else if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  return clean;
};

// In-memory runtime override
let runtimeConfig = {
  url: '',
  key: ''
};

// Read configuration from runtime, localStorage, or environment
const getEnvOrStored = (envKey, storageKey, runtimeKey) => {
  if (runtimeConfig[runtimeKey]) {
    return runtimeConfig[runtimeKey];
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && stored.trim()) return stored.trim();
    } catch {}
  }
  const envVal = import.meta.env[envKey];
  if (envVal && typeof envVal === 'string' && envVal.trim()) return envVal.trim();
  return '';
};

export const getSupabaseConfig = () => {
  let url = getEnvOrStored('VITE_SUPABASE_URL', 'sports_spectra_supabase_url', 'url');
  let key = getEnvOrStored('VITE_SUPABASE_ANON_KEY', 'sports_spectra_supabase_anon_key', 'key');
  url = getCleanUrl(url);
  key = (key || '').trim();

  const valid = Boolean(
    url &&
    key &&
    (url.startsWith('http://') || url.startsWith('https://')) &&
    !url.includes('your-project') &&
    key.length > 15
  );
  return { url, key, isValid: valid };
};


// Clean old mock bids or test artifacts
if (typeof window !== 'undefined') {
  try {
    const staleKeys = ['auctionPlayers'];
    staleKeys.forEach(k => {
      const val = localStorage.getItem(k);
      if (val && (val.includes('b1') || val.includes('2700') || val.includes('7300'))) {
        localStorage.removeItem(k);
      }
    });
  } catch {}
}

export const INITIAL_SEED_PLAYERS = [];
export const INITIAL_SEED_BIDS = [];

// Official 8 franchise teams matching the user's tournament configuration
export const DEFAULT_TEAMS_DATA = [
  {
    id: 'team-1',
    name: 'Team 1',
    total_purse: 10000,
    logo_url: '/logo1.png',
    color: 'bg-orange-500',
    text_color: 'text-orange-500',
    from_color: 'from-orange-500',
    captain_name: 'Atharva Anil Masharkar',
    captain_gender: 'M',
    captain_initials: 'AM',
    captain_color: '#D6CFCB',
    captain_photo: '',
    vice_captain_name: 'SHRIYA YERANE',
    vice_captain_gender: 'F',
    vice_captain_initials: 'SY',
    vice_captain_color: '#2196F3',
    vice_captain_photo: '',
    display_order: 1
  },
  {
    id: 'team-2',
    name: 'Team 2',
    total_purse: 10000,
    logo_url: '/logo2.png',
    color: 'bg-blue-600',
    text_color: 'text-blue-600',
    from_color: 'from-blue-600',
    captain_name: 'Chaitanya Kharpate',
    captain_gender: 'M',
    captain_initials: 'CK',
    captain_color: '#FFB74D',
    captain_photo: '',
    vice_captain_name: 'Mahek Malkan',
    vice_captain_gender: 'F',
    vice_captain_initials: 'MM',
    vice_captain_color: '#BA68C8',
    vice_captain_photo: '',
    display_order: 2
  },
  {
    id: 'team-3',
    name: 'Team 3',
    total_purse: 10000,
    logo_url: '/logo3.png',
    color: 'bg-red-600',
    text_color: 'text-red-600',
    from_color: 'from-red-600',
    captain_name: 'Karan Deshmukh',
    captain_gender: 'M',
    captain_initials: 'KD',
    captain_color: '#4DB6AC',
    captain_photo: '',
    vice_captain_name: 'Sejal Lende',
    vice_captain_gender: 'F',
    vice_captain_initials: 'SL',
    vice_captain_color: '#F06292',
    vice_captain_photo: '',
    display_order: 3
  },
  {
    id: 'team-4',
    name: 'Team 4',
    total_purse: 10000,
    logo_url: '/logo4.png',
    color: 'bg-purple-600',
    text_color: 'text-purple-600',
    from_color: 'from-purple-600',
    captain_name: 'Ranvir Thakur',
    captain_gender: 'M',
    captain_initials: 'RT',
    captain_color: '#7986CB',
    captain_photo: '',
    vice_captain_name: 'Radhika Sapate',
    vice_captain_gender: 'F',
    vice_captain_initials: 'RS',
    vice_captain_color: '#FF8A65',
    vice_captain_photo: '',
    display_order: 4
  },
  {
    id: 'team-5',
    name: 'Team 5',
    total_purse: 10000,
    logo_url: '/logo5.png',
    color: 'bg-green-600',
    text_color: 'text-green-600',
    from_color: 'from-green-600',
    captain_name: 'Arnav Sakharkar',
    captain_gender: 'M',
    captain_initials: 'AS',
    captain_color: '#E65100',
    captain_photo: '',
    vice_captain_name: 'Ritisha Naigaonkar',
    vice_captain_gender: 'F',
    vice_captain_initials: 'RN',
    vice_captain_color: '#0277BD',
    vice_captain_photo: '',
    display_order: 5
  },
  {
    id: 'team-6',
    name: 'Team 6',
    total_purse: 10000,
    logo_url: '/logo6.png',
    color: 'bg-yellow-600',
    text_color: 'text-yellow-600',
    from_color: 'from-yellow-600',
    captain_name: 'Manthan Gujar',
    captain_gender: 'M',
    captain_initials: 'MG',
    captain_color: '#D84315',
    captain_photo: '/manthan.png',
    vice_captain_name: 'Aarya Raut',
    vice_captain_gender: 'F',
    vice_captain_initials: 'AR',
    vice_captain_color: '#C5E1A5',
    vice_captain_photo: '',
    display_order: 6
  },
  {
    id: 'team-7',
    name: 'Team 7',
    total_purse: 10000,
    logo_url: '/logo7.png',
    color: 'bg-pink-600',
    text_color: 'text-pink-600',
    from_color: 'from-pink-600',
    captain_name: 'Parth tiwaskar',
    captain_gender: 'M',
    captain_initials: 'PT',
    captain_color: '#A1887F',
    captain_photo: '',
    vice_captain_name: 'Janhavi Admane',
    vice_captain_gender: 'F',
    vice_captain_initials: 'JA',
    vice_captain_color: '#F48FB1',
    vice_captain_photo: '',
    display_order: 7
  },
  {
    id: 'team-8',
    name: 'Team 8',
    total_purse: 10000,
    logo_url: '/logo8.png',
    color: 'bg-cyan-600',
    text_color: 'text-cyan-600',
    from_color: 'from-cyan-600',
    captain_name: 'Shervin Peter',
    captain_gender: 'M',
    captain_initials: 'SP',
    captain_color: '#90A4AE',
    captain_photo: '',
    vice_captain_name: 'Gauri Savale',
    vice_captain_gender: 'F',
    vice_captain_initials: 'GS',
    vice_captain_color: '#FFD54F',
    vice_captain_photo: '',
    display_order: 8
  }
];

export function getLocalPlayersRegistry() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('master_players');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalPlayersRegistry(players) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('master_players', JSON.stringify(players));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn('[Sports Spectra] Local storage save failed:', err);
  }
}

export function getLocalTeamBids() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('team_bids');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalTeamBids(bids) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('team_bids', JSON.stringify(bids));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn('[Sports Spectra] Local bids save failed:', err);
  }
}

export function getLocalTeams() {
  if (typeof window === 'undefined') return DEFAULT_TEAMS_DATA;
  try {
    const raw = localStorage.getItem('franchise_teams');
    if (!raw) {
      localStorage.setItem('franchise_teams', JSON.stringify(DEFAULT_TEAMS_DATA));
      return DEFAULT_TEAMS_DATA;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem('franchise_teams', JSON.stringify(DEFAULT_TEAMS_DATA));
      return DEFAULT_TEAMS_DATA;
    }
    return parsed;
  } catch {
    return DEFAULT_TEAMS_DATA;
  }
}

export function saveLocalTeams(teams) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('franchise_teams', JSON.stringify(teams));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn('[Sports Spectra] Local teams save failed:', err);
  }
}

// Fallback client when offline or awaiting configuration
function createMockSupabase() {
  const channelCallbacks = new Set();

  return {
    isMock: true,
    from(tableName) {
      return {
        select(_columns = '*', _options = {}) {
          return {
            order(_col, _opts) {
              return this;
            },
            limit(_n) {
              return this;
            },
            then(resolve) {
              if (tableName === 'team_bids') {
                const bids = getLocalTeamBids();
                resolve({ data: bids, error: null });
              } else if (tableName === 'teams') {
                const teams = getLocalTeams();
                resolve({ data: teams, error: null });
              } else {
                const players = getLocalPlayersRegistry();
                resolve({ data: players, error: null });
              }
            }
          };
        },
        insert(records) {
          const arr = Array.isArray(records) ? records : [records];
          return {
            select() {
              return this;
            },
            then(resolve) {
              if (tableName === 'team_bids') {
                const current = getLocalTeamBids();
                const newRecords = arr.map(r => ({
                  id: r.id || 'bid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                  player_id: r.player_id,
                  player_name: r.player_name,
                  team: r.team,
                  role: r.role || 'Player',
                  bid_amount: Number(r.bid_amount || 0),
                  created_at: new Date().toISOString()
                }));
                const updated = [...current, ...newRecords];
                saveLocalTeamBids(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'INSERT', new: newRecords[0] }); } catch {}
                });
                resolve({ data: newRecords, error: null });
              } else if (tableName === 'teams') {
                const current = getLocalTeams();
                const updated = [...current, ...arr];
                saveLocalTeams(updated);
                resolve({ data: arr, error: null });
              } else {
                const current = getLocalPlayersRegistry();
                const newRecords = arr.map(r => ({
                  id: r.id || 'p-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                  name: r.name,
                  gender: r.gender || 'M',
                  year: r.year || '',
                  section: r.section || '',
                  sports: r.sports || '',
                  team: r.team || 'UNSOLD',
                  role: r.role || 'Player',
                  bid_amount: Number(r.bid_amount || 0),
                  photo_url: r.photo_url || r.photoUrl || '',
                  created_at: new Date().toISOString()
                }));
                const updated = [...current, ...newRecords];
                saveLocalPlayersRegistry(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'INSERT', new: newRecords[0] }); } catch {}
                });
                resolve({ data: newRecords, error: null });
              }
            }
          };
        },
        upsert(records) {
          return this.insert(records);
        },
        update(updates) {
          return {
            eq(column, value) {
              return {
                then(resolve) {
                  if (tableName === 'team_bids') {
                    const current = getLocalTeamBids();
                    const updated = current.map(item => {
                      if (String(item[column] || '').toLowerCase() === String(value).toLowerCase()) {
                        return { ...item, ...updates };
                      }
                      return item;
                    });
                    saveLocalTeamBids(updated);
                    resolve({ data: updated, error: null });
                  } else if (tableName === 'teams') {
                    const current = getLocalTeams();
                    const updated = current.map(item => {
                      if (String(item[column] || '').toLowerCase() === String(value).toLowerCase()) {
                        return { ...item, ...updates };
                      }
                      return item;
                    });
                    saveLocalTeams(updated);
                    resolve({ data: updated, error: null });
                  } else {
                    const current = getLocalPlayersRegistry();
                    const updated = current.map(item => {
                      if (String(item[column] || '').toLowerCase() === String(value).toLowerCase()) {
                        return { ...item, ...updates };
                      }
                      return item;
                    });
                    saveLocalPlayersRegistry(updated);
                    resolve({ data: updated, error: null });
                  }
                }
              };
            }
          };
        },
        delete() {
          return {
            eq(column, value) {
              return {
                then(resolve) {
                  if (tableName === 'team_bids') {
                    const current = getLocalTeamBids();
                    const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                    saveLocalTeamBids(updated);
                    channelCallbacks.forEach(cb => {
                      try { cb({ event: 'DELETE' }); } catch {}
                    });
                    resolve({ data: null, error: null });
                  } else if (tableName === 'teams') {
                    const current = getLocalTeams();
                    const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                    saveLocalTeams(updated);
                    resolve({ data: null, error: null });
                  } else {
                    const current = getLocalPlayersRegistry();
                    const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                    saveLocalPlayersRegistry(updated);
                    channelCallbacks.forEach(cb => {
                      try { cb({ event: 'DELETE' }); } catch {}
                    });
                    resolve({ data: null, error: null });
                  }
                }
              };
            }
          };
        }
      };
    },
    channel(_channelName) {
      const channelObj = {
        on(_event, _filter, callback) {
          channelCallbacks.add(callback);
          return channelObj;
        },
        subscribe() {
          return {
            unsubscribe: () => {
              channelCallbacks.clear();
            }
          };
        }
      };
      return channelObj;
    },
    removeChannel(_channel) {
      // no-op
    }
  };
}

let activeClientInstance = null;

export const reinitSupabaseClient = () => {
  const { url, key, isValid } = getSupabaseConfig();
  if (isValid) {
    try {
      activeClientInstance = createClient(url, key, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 20 } }
      });
      activeClientInstance.isMock = false;
      return activeClientInstance;
    } catch (err) {
      console.warn('[Sports Spectra] Supabase createClient error:', err);
    }
  }
  activeClientInstance = createMockSupabase();
  return activeClientInstance;
};

// Singleton getter
export const getActiveSupabaseClient = () => {
  if (!activeClientInstance) {
    reinitSupabaseClient();
  }
  return activeClientInstance;
};

// Export dynamic proxy so all imports automatically use the active client without reloading
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getActiveSupabaseClient();
    const val = client[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  }
});

export const isConfigured = () => getSupabaseConfig().isValid;

/**
 * Test a Supabase connection with credentials before saving
 */
export async function testSupabaseConnection(testUrl, testKey) {
  const cleanUrl = getCleanUrl(testUrl);
  const cleanKey = (testKey || '').trim();

  if (!cleanUrl || !cleanKey) {
    return {
      connected: false,
      message: 'Both Supabase Project URL and Anon API Key are required.'
    };
  }

  const start = performance.now();
  try {
    const tempClient = createClient(cleanUrl, cleanKey, {
      auth: { persistSession: false }
    });

    // Check tables: teams, players, and team_bids
    const [teamsTest, playersTest, bidsTest] = await Promise.all([
      tempClient.from('teams').select('id, name').limit(5),
      tempClient.from('players').select('id, name').limit(1),
      tempClient.from('team_bids').select('id').limit(1)
    ]);

    const latency = Math.max(1, Math.round(performance.now() - start));

    // Check for authorization or invalid key error
    const authError = [teamsTest.error, playersTest.error, bidsTest.error].find(e => 
      e && (e.code === 'PGRST301' || e.message?.includes('JWT') || e.message?.includes('apikey') || e.code === '401' || e.code === '403')
    );
    if (authError) {
      return {
        connected: false,
        latency,
        errorType: 'AUTH_ERROR',
        message: 'Invalid Anon API Key. Please verify the "anon public" key from your Supabase Project Settings -> API.'
      };
    }

    // Check if tables are missing
    const missingTables = [];
    if (teamsTest.error?.message?.includes('does not exist') || teamsTest.error?.message?.includes('relation')) {
      missingTables.push('teams');
    }
    if (playersTest.error?.message?.includes('does not exist') || playersTest.error?.message?.includes('relation')) {
      missingTables.push('players');
    }
    if (bidsTest.error?.message?.includes('does not exist') || bidsTest.error?.message?.includes('relation')) {
      missingTables.push('team_bids');
    }

    if (missingTables.length > 0) {
      return {
        connected: true,
        latency,
        hasMissingTables: true,
        missingTables,
        message: `Connected to Supabase in ${latency}ms! Table(s) [${missingTables.join(', ')}] not created yet. Run the SQL script in SQL Editor.`
      };
    }

    const teamCount = teamsTest.data?.length || 0;
    return {
      connected: true,
      latency,
      hasMissingTables: false,
      teamCount,
      message: `Successfully connected to Supabase in ${latency}ms! Verified teams (${teamCount}), players, and bids tables.`
    };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return {
      connected: false,
      latency,
      errorType: 'NETWORK_ERROR',
      message: `Could not reach ${cleanUrl}: ${err.message}. Please check your internet connection and verify the Project URL.`
    };
  }
}

export async function updateCustomSupabaseCredentials(url, key) {
  const cleanUrl = getCleanUrl(url);
  const cleanKey = (key || '').trim();

  runtimeConfig.url = cleanUrl;
  runtimeConfig.key = cleanKey;

  if (typeof window !== 'undefined') {
    if (cleanUrl) localStorage.setItem('sports_spectra_supabase_url', cleanUrl);
    else localStorage.removeItem('sports_spectra_supabase_url');

    if (cleanKey) localStorage.setItem('sports_spectra_supabase_anon_key', cleanKey);
    else localStorage.removeItem('sports_spectra_supabase_anon_key');
  }



  // Re-instantiate active client immediately
  reinitSupabaseClient();

  // Notify all listening components in the app
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('supabase-credentials-changed', {
      detail: { url: cleanUrl, key: cleanKey }
    }));
  }

  return { success: true };
}

// --- Security Utilities ---

// Simple hash function for session tokens
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

export const createAdminSession = (password) => {
  const timestamp = Date.now();
  const token = `${timestamp}.${hashString(password + timestamp)}`;
  sessionStorage.setItem('_ss4a_token', token);
};

export const validateAdminSession = () => {
  const token = sessionStorage.getItem('_ss4a_token');
  if (!token) return false;
  
  const expected = import.meta.env.VITE_ADMIN_PASSWORD || '';
  if (!expected) return false;

  const [timestampStr, hash] = token.split('.');
  if (!timestampStr || !hash) return false;

  const timestamp = parseInt(timestampStr, 10);
  // Session expires after 12 hours
  if (Date.now() - timestamp > 12 * 60 * 60 * 1000) {
    sessionStorage.removeItem('_ss4a_token');
    return false;
  }

  return hash === hashString(expected + timestampStr);
};

export const clearAdminSession = () => {
  sessionStorage.removeItem('_ss4a_token');
};

// Rate limiting for login
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

export const checkLoginRateLimit = () => {
  const attemptsData = JSON.parse(localStorage.getItem('_ss4a_attempts') || '{"count": 0, "lockedUntil": 0}');
  
  if (attemptsData.lockedUntil > Date.now()) {
    return Math.ceil((attemptsData.lockedUntil - Date.now()) / 1000); // return seconds remaining
  }
  
  // If lockout expired, reset
  if (attemptsData.lockedUntil > 0 && attemptsData.lockedUntil <= Date.now()) {
    localStorage.setItem('_ss4a_attempts', JSON.stringify({ count: 0, lockedUntil: 0 }));
  }
  return 0;
};

export const recordFailedLogin = () => {
  const attemptsData = JSON.parse(localStorage.getItem('_ss4a_attempts') || '{"count": 0, "lockedUntil": 0}');
  attemptsData.count += 1;
  
  if (attemptsData.count >= MAX_ATTEMPTS) {
    attemptsData.lockedUntil = Date.now() + LOCKOUT_DURATION;
  }
  
  localStorage.setItem('_ss4a_attempts', JSON.stringify(attemptsData));
  return attemptsData.lockedUntil > 0 ? Math.ceil((attemptsData.lockedUntil - Date.now()) / 1000) : 0;
};

export const resetLoginAttempts = () => {
  localStorage.setItem('_ss4a_attempts', JSON.stringify({ count: 0, lockedUntil: 0 }));
};

// CSV Injection prevention
export const sanitizeCsvCell = (value) => {
  if (value === null || value === undefined) return '';
  let strValue = String(value);
  if (/^[=+\-@\t\r]/.test(strValue)) {
    return `'${strValue}`;
  }
  return strValue;
};

/**
 * Checks connection health to Supabase
 */
export async function checkDatabaseConnection() {
  const { url, key, isValid } = getSupabaseConfig();
  if (!isValid) {
    return {
      connected: false,
      isMock: true,
      latency: 0,
      supabaseUrl: null,
      message: 'Supabase credentials not configured. Please enter your Supabase Project URL and Anon Key.'
    };
  }

  return await testSupabaseConnection(url, key);
}
