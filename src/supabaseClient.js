import { createClient } from '@supabase/supabase-js';

// Read configuration from environment or browser configuration
const getEnvOrStored = (envKey, storageKey) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(storageKey);
    if (stored && stored.trim()) return stored.trim();
  }
  const envVal = import.meta.env[envKey];
  if (envVal && typeof envVal === 'string' && envVal.trim()) return envVal.trim();
  return '';
};

export const getSupabaseConfig = () => {
  const url = getEnvOrStored('VITE_SUPABASE_URL', 'sports_spectra_supabase_url');
  const key = getEnvOrStored('VITE_SUPABASE_ANON_KEY', 'sports_spectra_supabase_anon_key');
  const valid = Boolean(
    url &&
    key &&
    url.startsWith('http') &&
    !url.includes('placeholder') &&
    !url.includes('your-project')
  );
  return { url, key, isValid: valid };
};

// Immediate purge of all legacy fake/mock bids or fake players from prior tests
if (typeof window !== 'undefined') {
  try {
    const staleKeys = ['team_bids', 'auctionPlayers', 'master_players'];
    staleKeys.forEach(k => {
      const val = localStorage.getItem(k);
      if (val && (val.includes('b1') || val.includes('2700') || val.includes('Rohan') || val.includes('7300') || val.includes('4 MEMBERS'))) {
        localStorage.removeItem(k);
      }
    });

    const teamsRaw = localStorage.getItem('franchise_teams');
    if (teamsRaw && (teamsRaw.includes('"name":"Team 1"') || teamsRaw.includes('"name":"Team 3"'))) {
      localStorage.removeItem('franchise_teams');
    }
  } catch {}
}

export const INITIAL_SEED_PLAYERS = [];
export const INITIAL_SEED_BIDS = [];

// Default 8 franchise team structures (if teams table is not yet created in Supabase)
export const DEFAULT_TEAMS_DATA = [
  {
    id: 'team-1',
    name: 'ONE EIGHT CHALLENGERS',
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
    vice_captain_name: 'Shriya Yerane',
    vice_captain_gender: 'F',
    vice_captain_initials: 'SY',
    vice_captain_color: '#2196F3',
    vice_captain_photo: '',
    display_order: 1
  },
  {
    id: 'team-2',
    name: 'TEAM 2',
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
    name: 'ASTRA',
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
    name: 'BRAVO',
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
    name: 'HELLFIRE',
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
    name: 'AUREX',
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
    name: 'TITANS',
    total_purse: 10000,
    logo_url: '/logo7.png',
    color: 'bg-pink-600',
    text_color: 'text-pink-600',
    from_color: 'from-pink-600',
    captain_name: 'Parth Tiwaskar',
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
    name: 'NEMESIS',
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
    console.warn('[AI Studio] Local storage save failed:', err);
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
    console.warn('[AI Studio] Local bids save failed:', err);
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
    return JSON.parse(raw);
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
    console.warn('[AI Studio] Local teams save failed:', err);
  }
}

// In-memory Mock fallback (only used if Supabase credentials are not provided)
const createMockSupabase = () => {
  const channelCallbacks = new Set();

  return {
    from(tableName) {
      return {
        select: (_cols = '*') => {
          let currentData = [];
          if (tableName === 'team_bids') {
            currentData = getLocalTeamBids();
          } else if (tableName === 'teams') {
            currentData = getLocalTeams();
          } else {
            currentData = getLocalPlayersRegistry();
          }

          const queryObj = {
            order: (col, opts = {}) => {
              const asc = opts.ascending !== false;
              const sorted = [...currentData].sort((a, b) => {
                const va = a[col] ?? 0;
                const vb = b[col] ?? 0;
                if (va < vb) return asc ? -1 : 1;
                if (va > vb) return asc ? 1 : -1;
                return 0;
              });
              return Promise.resolve({ data: sorted, error: null });
            },
            limit: (count) => {
              return Promise.resolve({ data: currentData.slice(0, count), error: null });
            },
            then: (resolve, reject) => {
              return Promise.resolve({ data: currentData, error: null }).then(resolve, reject);
            }
          };
          return queryObj;
        },
        insert: async (rows) => {
          const itemsToInsert = Array.isArray(rows) ? rows : [rows];
          if (tableName === 'team_bids') {
            const current = getLocalTeamBids();
            const newBids = itemsToInsert.map((row, idx) => ({
              id: row.id || `bid_${Date.now()}_${idx}`,
              player_id: row.player_id || null,
              player_name: row.player_name,
              team: row.team,
              role: row.role || 'Player',
              bid_amount: Number(row.bid_amount || 0),
              created_at: new Date().toISOString()
            }));
            const updated = [...current, ...newBids];
            saveLocalTeamBids(updated);
            channelCallbacks.forEach(cb => {
              try { cb({ event: 'INSERT', new: newBids }); } catch {}
            });
            return { data: newBids, error: null };
          } else if (tableName === 'teams') {
            const current = getLocalTeams();
            const newTeams = itemsToInsert.map((row, idx) => ({
              id: row.id || `team_${Date.now()}_${idx}`,
              name: row.name,
              total_purse: Number(row.total_purse || 10000),
              logo_url: row.logo_url || '/logo1.png',
              color: row.color || 'bg-orange-500',
              text_color: row.text_color || 'text-orange-500',
              from_color: row.from_color || 'from-orange-500',
              captain_name: row.captain_name || '',
              captain_gender: row.captain_gender || 'M',
              captain_initials: row.captain_initials || '',
              captain_color: row.captain_color || '#D6CFCB',
              captain_photo: row.captain_photo || '',
              vice_captain_name: row.vice_captain_name || '',
              vice_captain_gender: row.vice_captain_gender || 'F',
              vice_captain_initials: row.vice_captain_initials || '',
              vice_captain_color: row.vice_captain_color || '#2196F3',
              vice_captain_photo: row.vice_captain_photo || '',
              display_order: row.display_order ?? (current.length + idx + 1),
              created_at: new Date().toISOString()
            }));
            const updated = [...current, ...newTeams];
            saveLocalTeams(updated);
            channelCallbacks.forEach(cb => {
              try { cb({ event: 'INSERT', new: newTeams }); } catch {}
            });
            return { data: newTeams, error: null };
          } else {
            const current = getLocalPlayersRegistry();
            const newPlayers = itemsToInsert.map((row, idx) => ({
              id: row.id || `p_${Date.now()}_${idx}`,
              name: row.name,
              gender: row.gender || 'M',
              year: row.year || '',
              section: row.section || '',
              sports: row.sports || '',
              team: row.team || 'UNSOLD',
              role: row.role || 'Player',
              bid_amount: Number(row.bid_amount || 0),
              photo_url: row.photo_url || '',
              created_at: new Date().toISOString()
            }));
            const updated = [...current, ...newPlayers];
            saveLocalPlayersRegistry(updated);
            channelCallbacks.forEach(cb => {
              try { cb({ event: 'INSERT', new: newPlayers }); } catch {}
            });
            return { data: newPlayers, error: null };
          }
        },
        update(patch) {
          return {
            eq: async (column, value) => {
              if (tableName === 'team_bids') {
                const current = getLocalTeamBids();
                const updated = current.map(item => {
                  if (String(item[column] || '').toLowerCase() === String(value).toLowerCase()) {
                    return { ...item, ...patch };
                  }
                  return item;
                });
                saveLocalTeamBids(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'UPDATE' }); } catch {}
                });
                return { data: patch, error: null };
              } else if (tableName === 'teams') {
                const current = getLocalTeams();
                const updated = current.map(item => {
                  if (String(item[column] || '').toLowerCase() === String(value).toLowerCase()) {
                    return { ...item, ...patch };
                  }
                  return item;
                });
                saveLocalTeams(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'UPDATE' }); } catch {}
                });
                return { data: patch, error: null };
              } else {
                const current = getLocalPlayersRegistry();
                const updated = current.map(item => {
                  if (String(item[column] || '').toLowerCase() === String(value).toLowerCase()) {
                    return { ...item, ...patch };
                  }
                  return item;
                });
                saveLocalPlayersRegistry(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'UPDATE' }); } catch {}
                });
                return { data: patch, error: null };
              }
            }
          };
        },
        delete() {
          return {
            eq: async (column, value) => {
              if (tableName === 'team_bids') {
                const current = getLocalTeamBids();
                const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                saveLocalTeamBids(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'DELETE' }); } catch {}
                });
                return { data: null, error: null };
              } else if (tableName === 'teams') {
                const current = getLocalTeams();
                const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                saveLocalTeams(updated);
                return { data: null, error: null };
              } else {
                const current = getLocalPlayersRegistry();
                const updated = current.filter(item => String(item[column] || '').toLowerCase() !== String(value).toLowerCase());
                saveLocalPlayersRegistry(updated);
                channelCallbacks.forEach(cb => {
                  try { cb({ event: 'DELETE' }); } catch {}
                });
                return { data: null, error: null };
              }
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
};

let currentClientInstance = null;

export const initSupabaseClient = () => {
  const { url, key, isValid } = getSupabaseConfig();
  if (isValid) {
    try {
      currentClientInstance = createClient(url, key, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 20 } }
      });
      return currentClientInstance;
    } catch (err) {
      console.warn('[AI Studio] Supabase createClient failed, falling back:', err);
    }
  }
  currentClientInstance = createMockSupabase();
  return currentClientInstance;
};

export let supabase = initSupabaseClient();
export const isConfigured = getSupabaseConfig().isValid;

export function updateCustomSupabaseCredentials(url, key) {
  if (typeof window !== 'undefined') {
    if (url) localStorage.setItem('sports_spectra_supabase_url', url.trim());
    else localStorage.removeItem('sports_spectra_supabase_url');

    if (key) localStorage.setItem('sports_spectra_supabase_anon_key', key.trim());
    else localStorage.removeItem('sports_spectra_supabase_anon_key');

    supabase = initSupabaseClient();
    window.dispatchEvent(new Event('storage'));
  }
}

/**
 * Checks connection health to Supabase
 */
export async function checkDatabaseConnection() {
  const { url, isValid } = getSupabaseConfig();
  if (!isValid) {
    return {
      connected: false,
      isMock: true,
      latency: 0,
      supabaseUrl: null,
      message: 'Supabase credentials not configured. Please enter your Supabase Project URL and Anon Key.'
    };
  }

  const start = performance.now();
  try {
    const { error: playersErr } = await supabase.from('players').select('id').limit(1);
    const latency = Math.round(performance.now() - start);

    if (playersErr) {
      return {
        connected: false,
        isMock: false,
        latency,
        error: playersErr.message,
        supabaseUrl: url.replace(/(https:\/\/)([^.]+)/, '$1***'),
        message: `Connected to Supabase, but "players" table error: ${playersErr.message}`
      };
    }

    let hasTeamBids = true;
    let hasTeams = true;
    try {
      const { error: bidErr } = await supabase.from('team_bids').select('id').limit(1);
      if (bidErr) hasTeamBids = false;
    } catch {
      hasTeamBids = false;
    }

    try {
      const { error: teamErr } = await supabase.from('teams').select('id').limit(1);
      if (teamErr) hasTeams = false;
    } catch {
      hasTeams = false;
    }

    return {
      connected: true,
      isMock: false,
      latency,
      hasTeamBidsTable: hasTeamBids,
      hasTeamsTable: hasTeams,
      supabaseUrl: url.replace(/(https:\/\/)([^.]+)/, '$1***'),
      message: 'Active & Connected to Supabase PostgreSQL'
    };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return {
      connected: false,
      isMock: false,
      latency,
      error: err.message,
      supabaseUrl: url ? url.replace(/(https:\/\/)([^.]+)/, '$1***') : null,
      message: `Connection failed: ${err.message}`
    };
  }
}
