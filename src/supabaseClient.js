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
    } catch { }
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
  } catch { }
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
    vice_captain_name: 'Shrusti Kale',
    vice_captain_gender: 'F',
    vice_captain_initials: 'SK',
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
    captain_photo: '',
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

// Activity & Audit Logs Local Caching
export function getLocalActivityLogs() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('sports_spectra_audit_logs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalActivityLogs(logs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('sports_spectra_audit_logs', JSON.stringify(logs.slice(0, 300)));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn('[Sports Spectra] Local logs save failed:', err);
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
              } else if (tableName === 'activity_logs' || tableName === 'audit_logs') {
                const logs = getLocalActivityLogs();
                resolve({ data: logs, error: null });
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
                  try { cb({ event: 'INSERT', new: newRecords[0] }); } catch { }
                });
                resolve({ data: newRecords, error: null });
              } else if (tableName === 'teams') {
                const current = getLocalTeams();
                const updated = [...current, ...arr];
                saveLocalTeams(updated);
                resolve({ data: arr, error: null });
              } else if (tableName === 'activity_logs' || tableName === 'audit_logs') {
                const current = getLocalActivityLogs();
                const newRecords = arr.map(r => ({
                  id: r.id || 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                  action_type: r.action_type || 'SYSTEM',
                  category: r.category || 'AUCTION',
                  details: r.details || '',
                  actor: r.actor || 'Admin',
                  metadata: r.metadata || {},
                  created_at: new Date().toISOString()
                }));
                const updated = [...newRecords, ...current].slice(0, 300);
                saveLocalActivityLogs(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'INSERT', new: newRecords[0] }); } catch { }
                });
                resolve({ data: newRecords, error: null });
              } else {
                const current = getLocalPlayersRegistry();
                const newRecords = arr.map(r => ({
                  id: r.id || 'p-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                  name: r.name,
                  gender: r.gender || 'M',
                  year: r.year || '',
                  section: r.section || '',
                  sports: r.sports || '',
                  phone_no: r.phone_no || r.phone || '',
                  team: r.team || 'UNSOLD',
                  role: r.role || 'Player',
                  bid_amount: Number(r.bid_amount || 0),
                  photo_url: r.photo_url || r.photoUrl || '',
                  created_at: new Date().toISOString()
                }));
                const updated = [...current, ...newRecords];
                saveLocalPlayersRegistry(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'INSERT', new: newRecords[0] }); } catch { }
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
                  } else if (tableName === 'activity_logs' || tableName === 'audit_logs') {
                    resolve({ data: [], error: null });
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
                      try { cb({ event: 'DELETE' }); } catch { }
                    });
                    resolve({ data: null, error: null });
                  } else if (tableName === 'teams') {
                    const current = getLocalTeams();
                    const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                    saveLocalTeams(updated);
                    resolve({ data: null, error: null });
                  } else if (tableName === 'activity_logs' || tableName === 'audit_logs') {
                    saveLocalActivityLogs([]);
                    channelCallbacks.forEach(cb => {
                      try { cb({ event: 'DELETE' }); } catch { }
                    });
                    resolve({ data: null, error: null });
                  } else {
                    const current = getLocalPlayersRegistry();
                    const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                    saveLocalPlayersRegistry(updated);
                    channelCallbacks.forEach(cb => {
                      try { cb({ event: 'DELETE' }); } catch { }
                    });
                    resolve({ data: null, error: null });
                  }
                }
              };
            },
            neq(column, value) {
              return {
                then(resolve) {
                  if (tableName === 'activity_logs' || tableName === 'audit_logs') {
                    saveLocalActivityLogs([]);
                    resolve({ data: null, error: null });
                  } else {
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

    // Check tables: teams, players, bids, and both log tables
    const [teamsTest, playersTest, bidsTest, logsTest, auditTest] = await Promise.all([
      tempClient.from('teams').select('id, name').limit(5),
      tempClient.from('players').select('id, name').limit(1),
      tempClient.from('team_bids').select('id').limit(1),
      tempClient.from('activity_logs').select('id').limit(1),
      tempClient.from('audit_logs').select('id').limit(1)
    ]);

    const latency = Math.max(1, Math.round(performance.now() - start));

    // Check for authorization or invalid key error
    const authError = [teamsTest.error, playersTest.error, bidsTest.error, logsTest.error, auditTest.error].find(e =>
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
    if (logsTest.error?.message?.includes('does not exist') || logsTest.error?.message?.includes('relation')) {
      missingTables.push('activity_logs');
    }
    if (auditTest.error?.message?.includes('does not exist') || auditTest.error?.message?.includes('relation')) {
      missingTables.push('audit_logs');
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
      message: `Successfully connected to Supabase in ${latency}ms! Verified teams (${teamCount}), players, bids, activity_logs, and audit_logs tables.`
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

// --- Activity & Audit Logs Supabase Integration ---

/**
 * Log an action to the Supabase activity_logs table (and local storage fallback)
 */
export async function logActivityToSupabase({ action_type, category = 'AUCTION', details, actor = 'Admin', metadata = {} }) {
  const logItem = {
    action_type: action_type || 'SYSTEM',
    category: category || 'AUCTION',
    details: details || '',
    actor: actor || 'Admin',
    metadata: metadata || {},
    created_at: new Date().toISOString()
  };

  // Always update local cache for instant UI feedback
  const localLogs = getLocalActivityLogs();
  saveLocalActivityLogs([logItem, ...localLogs]);

  try {
    const client = getActiveSupabaseClient();
    const activityRecord = {
      action_type: logItem.action_type,
      category: logItem.category,
      details: logItem.details,
      actor: logItem.actor,
      metadata: logItem.metadata
    };
    const [{ data, error }, auditResult] = await Promise.all([
      client.from('activity_logs').insert([activityRecord]).select(),
      client.from('audit_logs').insert([{
        action_type: logItem.action_type,
        category: logItem.category,
        actor: logItem.actor,
        details: logItem.details,
        metadata: logItem.metadata
      }]).select()
    ]);

    if (error) {
      console.warn('[Sports Spectra] Supabase activity log insert notice:', error.message);
    }
    if (auditResult.error) {
      console.warn('[Sports Spectra] Supabase audit log insert notice:', auditResult.error.message);
    }
    return { success: !error && !auditResult.error, data, auditData: auditResult.data, error: error || auditResult.error };
  } catch (err) {
    console.warn('[Sports Spectra] Activity log error:', err);
    return { success: false, error: err };
  }
}

/**
 * Fetch latest activity logs directly from Supabase activity_logs table
 */
export async function fetchActivityLogsFromSupabase(limit = 200) {
  try {
    const client = getActiveSupabaseClient();
    const { data, error } = await client
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data)) {
      saveLocalActivityLogs(data);
      return { success: true, logs: data };
    }
    return { success: false, logs: getLocalActivityLogs() };
  } catch {
    return { success: false, logs: getLocalActivityLogs() };
  }
}

/**
 * Clear all activity logs in Supabase
 */
export async function clearActivityLogsInSupabase() {
  saveLocalActivityLogs([]);
  try {
    const client = getActiveSupabaseClient();
    const [activityResult, auditResult] = await Promise.all([
      client.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      client.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    ]);
    return { success: !activityResult.error && !auditResult.error, error: activityResult.error || auditResult.error };
  } catch (err) {
    console.warn('[Sports Spectra] Failed to clear activity logs in Supabase:', err);
    return { success: false, error: err };
  }
}

// Canonical SQL Setup Script for the complete Sports Spectra database
export const SUPABASE_SETUP_SQL = `-- =========================================================
-- SPORTS SPECTRA 4.0 COMPLETE DATABASE SCHEMA & POLICIES
-- =========================================================

-- 1. PLAYERS MASTER REGISTRY TABLE (With Phone No)
create table if not exists players (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  gender text not null check (gender in ('M', 'F')),
  year text,
  section text,
  sports text,
  phone_no text,
  team text not null default 'UNSOLD',
  role text not null default 'Player',
  bid_amount numeric not null default 0 check (bid_amount >= 0),
  photo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure phone_no column exists if table was already created
alter table players add column if not exists phone_no text;

-- Ultra-fast indexes for instant autocomplete & queries (< 5ms response time)
create index if not exists idx_players_name on players using gin (to_tsvector('simple', name));
create index if not exists idx_players_name_lower on players (lower(name));
create index if not exists idx_players_team on players (lower(team));

-- 2. TEAM BIDS TABLE (Auction Draft & Bids)
create table if not exists team_bids (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) on delete set null,
  player_name text not null,
  team text not null,
  role text not null default 'Player',
  bid_amount numeric not null default 0 check (bid_amount >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create unique index if not exists idx_unique_player_bid on team_bids (lower(player_name));
create index if not exists idx_team_bids_team on team_bids (lower(team));

-- 3. TEAMS TABLE (Franchises, Purses, Leaders & Themes)
create table if not exists teams (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  total_purse numeric not null default 10000,
  logo_url text,
  color text default 'bg-orange-500',
  text_color text default 'text-orange-500',
  from_color text default 'from-orange-500',
  captain_name text,
  captain_gender text default 'M',
  captain_initials text,
  captain_color text default '#FF4500',
  captain_photo text,
  captain_phone text,
  vice_captain_name text,
  vice_captain_gender text default 'F',
  vice_captain_initials text,
  vice_captain_color text default '#2196F3',
  vice_captain_photo text,
  vice_captain_phone text,
  display_order integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_teams_display_order on teams (display_order);

-- 4. ACTIVITY & AUDIT LOGS TABLE
create table if not exists activity_logs (
  id uuid default gen_random_uuid() primary key,
  action_type text not null,
  category text not null default 'AUCTION',
  details text not null,
  actor text default 'Admin',
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_activity_logs_created_at on activity_logs (created_at desc);
create index if not exists idx_activity_logs_action on activity_logs (action_type);

-- Dedicated audit trail, kept separately from the user-facing activity feed
create table if not exists audit_logs (
  id uuid default gen_random_uuid() primary key,
  action_type text not null,
  category text not null default 'AUCTION',
  actor text not null default 'Admin',
  details text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_audit_logs_created_at on audit_logs (created_at desc);
create index if not exists idx_audit_logs_action on audit_logs (action_type);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
alter table players enable row level security;
alter table team_bids enable row level security;
alter table teams enable row level security;
alter table activity_logs enable row level security;
alter table audit_logs enable row level security;

-- Public read policies
create policy "Anyone can read players" on players for select using (true);
create policy "Anyone can read team_bids" on team_bids for select using (true);
create policy "Anyone can read teams" on teams for select using (true);
create policy "Anyone can read activity_logs" on activity_logs for select using (true);
drop policy if exists "Anyone can read audit_logs" on audit_logs;
create policy "Anyone can read audit_logs" on audit_logs for select using (true);

-- Admin modification policies
create policy "Admins can insert players" on players for insert with check (true);
create policy "Admins can update players" on players for update using (true);
create policy "Admins can delete players" on players for delete using (true);

create policy "Admins can insert team_bids" on team_bids for insert with check (true);
create policy "Admins can update team_bids" on team_bids for update using (true);
create policy "Admins can delete team_bids" on team_bids for delete using (true);

create policy "Admins can insert teams" on teams for insert with check (true);
create policy "Admins can update teams" on teams for update using (true);
create policy "Admins can delete teams" on teams for delete using (true);

create policy "Admins can insert activity_logs" on activity_logs for insert with check (true);
create policy "Admins can delete activity_logs" on activity_logs for delete using (true);
drop policy if exists "Admins can insert audit_logs" on audit_logs;
create policy "Admins can insert audit_logs" on audit_logs for insert with check (true);
drop policy if exists "Admins can delete audit_logs" on audit_logs;
create policy "Admins can delete audit_logs" on audit_logs for delete using (true);

-- 6. ENABLE REALTIME BROADCASTING
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table team_bids;
alter publication supabase_realtime add table teams;
alter publication supabase_realtime add table activity_logs;
alter publication supabase_realtime add table audit_logs;`;

// --- Security Utilities ---


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
