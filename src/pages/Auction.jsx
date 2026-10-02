import React, { useState, useEffect } from 'react';
import { 
  supabase, 
  getLocalTeams, 
  saveLocalTeams, 
  testSupabaseConnection,
  getSupabaseConfig,
  updateCustomSupabaseCredentials
} from '../supabaseClient';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

function getNormalizedTeam(teamName) {
    return (teamName || '').toLowerCase().replace(/\s+/g, '');
}

function Auction() {
    const [activeTeam, setActiveTeam] = useState(null);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [players, setPlayers] = useState([]);
    const [teamsList, setTeamsList] = useState(() => getLocalTeams());
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isTeamLoading, setIsTeamLoading] = useState(false);
    const [hoveredTeam, setHoveredTeam] = useState(null);
    const [dbStatus, setDbStatus] = useState({ connected: false, latency: 0, message: '' });
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configInputUrl, setConfigInputUrl] = useState(() => getSupabaseConfig().url);
    const [configInputKey, setConfigInputKey] = useState(() => getSupabaseConfig().key);
    const [isTestingConn, setIsTestingConn] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [isSavingConn, setIsSavingConn] = useState(false);
    const [showSqlGuide, setShowSqlGuide] = useState(false);

    const handleTeamClick = (teamName) => {
        setMobileDrawerOpen(false);
        if (activeTeam === teamName) return;
        setIsTeamLoading(true);
        setActiveTeam(teamName);
        setTimeout(() => setIsTeamLoading(false), 300);
    };

    const fetchAllAuctionData = async (isBackground = false) => {
        if (!isBackground) setIsPageLoading(true);
        else setIsSyncing(true);

        const startTime = performance.now();
        try {
            // Fetch players, bids, and teams dynamically from the database
            const [playersRes, bidsRes, teamsRes] = await Promise.all([
                supabase.from('players').select('*'),
                supabase.from('team_bids').select('*'),
                supabase.from('teams').select('*').order('display_order')
            ]);

            const latency = Math.max(1, Math.round(performance.now() - startTime));

            // Check connection status based on actual live queries
            const config = getSupabaseConfig();
            if (!config.isValid) {
                setDbStatus({
                    connected: false,
                    isMock: true,
                    latency: 0,
                    message: 'Database not connected. Please enter your Supabase Project URL and Anon API Key.'
                });
            } else {
                const anyError = playersRes.error || bidsRes.error || teamsRes.error;
                if (anyError) {
                    if (anyError.code === 'PGRST301' || anyError.message?.includes('JWT') || anyError.message?.includes('apikey') || anyError.code === '401' || anyError.code === '403') {
                        setDbStatus({
                            connected: false,
                            latency,
                            message: 'Authentication failed. Please verify your Supabase Anon API Key.'
                        });
                    } else if (anyError.message?.includes('does not exist') || anyError.message?.includes('relation')) {
                        setDbStatus({
                            connected: true,
                            hasMissingTables: true,
                            latency,
                            message: 'Connected to Supabase! Tables not created yet. Please execute the SQL setup script.'
                        });
                    } else {
                        setDbStatus({
                            connected: false,
                            latency,
                            message: `Query error: ${anyError.message}`
                        });
                    }
                } else {
                    setDbStatus({
                        connected: true,
                        latency,
                        hasMissingTables: false,
                        message: `Live Supabase connection active (${latency}ms)`
                    });
                }
            }

            // 1. Process Teams from database
            if (!teamsRes.error && teamsRes.data && teamsRes.data.length > 0) {
                setTeamsList(teamsRes.data);
                saveLocalTeams(teamsRes.data);
            }

            // 2. Process Players & Bids directly from database - STRICTLY NO FAKE OR HARDCODED BIDS
            const dbPlayers = playersRes.data || [];
            const dbBids = bidsRes.data || [];

            // Map bids by player name (case-insensitive) and player id
            const bidsByName = new Map();
            const bidsById = new Map();
            dbBids.forEach(b => {
                if (b.player_name) bidsByName.set(b.player_name.trim().toLowerCase(), b);
                if (b.player_id) bidsById.set(String(b.player_id), b);
            });

            const mappedData = dbPlayers.map(p => {
                const nameKey = p.name ? p.name.trim().toLowerCase() : '';
                const bid = bidsByName.get(nameKey) || bidsById.get(String(p.id));
                const assignedTeam = bid?.team || (p.team && p.team !== 'UNSOLD' ? p.team : 'UNSOLD');
                const winningBid = bid ? Number(bid.bid_amount || 0) : Number(p.bid_amount || 0);

                return {
                    id: p.id,
                    team: assignedTeam,
                    role: bid ? (bid.role || 'Player') : (p.role || 'Player'),
                    name: p.name,
                    gender: p.gender || 'M',
                    year: p.year || '',
                    section: p.section || '',
                    sports: p.sports || '',
                    bidAmount: winningBid,
                    photoUrl: p.photo_url || p.photoUrl || ''
                };
            });

            // Include any bids from team_bids whose players might not be in players table
            const existingNames = new Set(dbPlayers.map(p => p.name ? p.name.trim().toLowerCase() : ''));
            dbBids.forEach(b => {
                if (b.player_name && !existingNames.has(b.player_name.trim().toLowerCase())) {
                    mappedData.push({
                        id: b.id,
                        team: b.team,
                        role: b.role || 'Player',
                        name: b.player_name,
                        gender: 'M',
                        year: '',
                        section: '',
                        sports: '',
                        bidAmount: Number(b.bid_amount || 0),
                        photoUrl: ''
                    });
                }
            });

            setPlayers(mappedData);
        } catch (err) {
            console.warn("[Sports Spectra] Error loading live auction data:", err);
            setDbStatus(prev => ({
                ...prev,
                connected: false,
                message: err.message || 'Database connection error'
            }));
        } finally {
            setIsPageLoading(false);
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        // Immediate purge of any old mock data from previous tests
        try {
            const staleKeys = ['auctionPlayers'];
            staleKeys.forEach(k => {
                const val = localStorage.getItem(k);
                if (val && (val.includes('2700') || val.includes('7300') || val.includes('b1'))) {
                    localStorage.removeItem(k);
                }
            });
        } catch {}

        // Initial live fetch deferred to next tick
        const initTimer = setTimeout(() => {
            fetchAllAuctionData(false);
        }, 0);

        // Continuous polling (every 2.5 seconds) to detect any database changes
        const pollInterval = setInterval(() => {
            fetchAllAuctionData(true);
        }, 2500);

        // Instant refresh on tab focus / visibility
        const handleVisibilityOrFocus = () => {
            fetchAllAuctionData(true);
        };
        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);

        // Instant refresh on credentials change
        const handleCredsChanged = () => {
            const freshConfig = getSupabaseConfig();
            setConfigInputUrl(freshConfig.url);
            setConfigInputKey(freshConfig.key);
            fetchAllAuctionData(false);
        };
        window.addEventListener('supabase-credentials-changed', handleCredsChanged);

        // Real-time synchronization on all tables via Supabase WebSocket
        const subscription = supabase
            .channel('live_auction_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
                fetchAllAuctionData(true);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'team_bids' }, () => {
                fetchAllAuctionData(true);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
                fetchAllAuctionData(true);
            })
            .subscribe();

        const handleStorageChange = () => {
            fetchAllAuctionData(true);
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            clearTimeout(initTimer);
            clearInterval(pollInterval);
            window.removeEventListener('focus', handleVisibilityOrFocus);
            window.removeEventListener('supabase-credentials-changed', handleCredsChanged);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('storage', handleStorageChange);
            try { supabase.removeChannel(subscription); } catch {}
        };
    }, []);

    const handleTestConnection = async () => {
        setIsTestingConn(true);
        setTestResult(null);
        try {
            const res = await testSupabaseConnection(configInputUrl, configInputKey);
            setTestResult(res);
        } catch (err) {
            setTestResult({
                connected: false,
                message: `Connection failed: ${err.message}`
            });
        } finally {
            setIsTestingConn(false);
        }
    };

    const handleSaveSupabaseConfig = async (e) => {
        e.preventDefault();
        setIsSavingConn(true);
        try {
            await updateCustomSupabaseCredentials(configInputUrl, configInputKey);
            setShowConfigModal(false);
            setTestResult(null);
            await fetchAllAuctionData(false);
        } catch (err) {
            console.error('Error saving credentials:', err);
            setTestResult({
                connected: false,
                message: `Failed to save configuration: ${err.message}`
            });
        } finally {
            setIsSavingConn(false);
        }
    };

    const renderLeaderCard = (leader, roleTitle, roleIcon, bgColor) => {
        const roleColor = roleTitle === 'CAPTAIN' ? 'bg-[#FF4500]' : 'bg-[#1e1e1e]';
        const isLightBg = ['#D6CFCB', '#FFB74D', '#F06292', '#FF8A65', '#C5E1A5', '#FFD54F', '#A1887F', '#90A4AE'].includes(bgColor);
        const initialColor = isLightBg ? 'text-gray-900' : 'text-white';
        const cardBgImg = leader.gender === 'M' ? '/boy_bg.png' : '/girl_bg.png';
        
        return (
            <div className="bg-white rounded-3xl sm:rounded-[40px] p-5 sm:p-8 md:p-10 shadow-xl shadow-gray-200/50 border border-white overflow-hidden relative group hover:shadow-2xl hover:shadow-orange-100 transition-all duration-300"
                 style={{ background: `url('${cardBgImg}') no-repeat center center`, backgroundSize: 'cover' }}>
                <div className={`absolute top-0 right-0 ${roleColor} text-white px-4 sm:px-6 py-1.5 sm:py-2 rounded-bl-2xl sm:rounded-bl-3xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 sm:gap-2 z-10 shadow-xs`}>
                    <i className={`fa-solid ${roleIcon}`}></i> {roleTitle}
                </div>
                <div className="flex flex-col items-center relative z-10">
                    <div className={`w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-2xl sm:rounded-[32px] flex items-center justify-center text-3xl sm:text-4xl md:text-5xl font-black ${initialColor} shadow-inner mb-4 sm:mb-8 group-hover:scale-105 transition-transform duration-300 border border-black/5 overflow-hidden`} style={{ backgroundColor: bgColor || '#FF4500' }}>
                        {leader.photo ? (
                            <img src={leader.photo} className="w-full h-full object-cover" alt={leader.name} />
                        ) : (
                            leader.initials || (leader.name ? leader.name.slice(0, 2).toUpperCase() : 'LD')
                        )}
                    </div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-center text-gray-900 leading-tight">{leader.name}</h3>
                    <p className="text-gray-400 font-bold uppercase text-[9px] sm:text-[10px] mt-1.5 sm:mt-2 tracking-widest">{leader.gender} &nbsp;|&nbsp; {roleTitle}</p>
                    <div className="mt-5 sm:mt-8 bg-orange-50 border border-orange-100 px-6 sm:px-8 py-2 sm:py-2.5 rounded-full flex items-center gap-2 shadow-xs">
                        <i className="fa-solid fa-circle-check text-orange-500"></i>
                        <span className="text-orange-500 font-black text-[10px] sm:text-xs uppercase tracking-widest">RETAINED</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-[#F3F4F6]">
            {/* MOBILE TOP BAR (Screens < lg) */}
            <header className="lg:hidden bg-[#111827] text-white px-3 sm:px-4 py-3 border-b border-white/10 flex items-center justify-between sticky top-0 z-30 shadow-md shrink-0">
                <div className="flex items-center gap-2.5 sm:gap-3">
                    <button 
                        onClick={() => setMobileDrawerOpen(true)}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center text-sm transition cursor-pointer"
                        aria-label="Open Navigation Menu"
                    >
                        <i className="fa-solid fa-bars"></i>
                    </button>
                    <div className="cursor-pointer" onClick={() => setActiveTeam(null)}>
                        <span className="hero-font text-sm sm:text-base leading-none tracking-tight block">
                            SPORTS <span className="text-orange-500">SPECTRA 4.0</span>
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block truncate max-w-[130px] sm:max-w-[200px]">
                            {activeTeam || 'Auction Dashboard'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowConfigModal(true)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                            dbStatus.connected ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                        title="Configure Supabase Database"
                    >
                        <span className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`}></span>
                        <span className="hidden xs:inline">{dbStatus.connected ? `${dbStatus.latency}ms` : 'DB Offline'}</span>
                    </button>
                    <button 
                        onClick={() => fetchAllAuctionData(true)} 
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center text-xs transition cursor-pointer shadow-xs"
                        title="Refresh Auction Data"
                    >
                        <i className={`fa-solid fa-rotate ${isSyncing ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </header>

            {/* MOBILE QUICK FRANCHISE SWITCHER BAR (Screens < lg) */}
            <div className="lg:hidden bg-white border-b border-gray-200 px-3 sm:px-4 py-2 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar shrink-0 shadow-xs z-20">
                <button
                    onClick={() => setActiveTeam(null)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        !activeTeam ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                    <i className="fa-solid fa-grip text-[10px]"></i> All Teams
                </button>
                {teamsList.map(teamObj => {
                    const isSelected = activeTeam === teamObj.name;
                    return (
                        <button
                            key={teamObj.name}
                            onClick={() => handleTeamClick(teamObj.name)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                isSelected ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                            {teamObj.name}
                        </button>
                    );
                })}
            </div>

            {/* MOBILE OFF-CANVAS SLIDING DRAWER (Screens < lg) */}
            <div className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${
                mobileDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}>
                {/* Backdrop */}
                <div 
                    className="absolute inset-0 bg-black/70 backdrop-blur-xs transition-opacity cursor-pointer" 
                    onClick={() => setMobileDrawerOpen(false)} 
                />
                
                {/* Sliding Navigation Panel */}
                <aside 
                    className={`absolute top-0 bottom-0 left-0 w-72 max-w-[85vw] flex flex-col shadow-2xl transition-transform duration-300 transform bg-[#111827] text-white ${
                        mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                    style={{ background: "url('/left-navbar.png') no-repeat center center", backgroundSize: 'cover' }}
                >
                    <div className="p-5 flex items-center justify-between border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="bg-orange-600 p-2 rounded-xl text-white">
                                <i className="fa-solid fa-bolt-lightning"></i>
                            </div>
                            <div className="hero-font text-white text-base leading-none cursor-pointer" onClick={() => { setActiveTeam(null); setMobileDrawerOpen(false); }}>
                                SPORTS<br /><span className="text-orange-500">SPECTRA 4.0</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => setMobileDrawerOpen(false)}
                            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition cursor-pointer"
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <nav className="flex-1 overflow-y-auto no-scrollbar py-3">
                        {activeTeam ? (
                            <button 
                                onClick={() => { setActiveTeam(null); setMobileDrawerOpen(false); }} 
                                className="w-[calc(100%-24px)] text-left text-orange-400 bg-white/5 hover:bg-white/10 transition-all rounded-xl mx-3 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-sm cursor-pointer"
                            >
                                <i className="fa-solid fa-house-chimney w-5 text-center"></i> All Franchises
                            </button>
                        ) : (
                            <Link 
                                to="/" 
                                onClick={() => setMobileDrawerOpen(false)}
                                className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-3 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-sm cursor-pointer"
                            >
                                <i className="fa-solid fa-arrow-left w-5 text-center"></i> Back to main website
                            </Link>
                        )}

                        <div className="px-6 mt-4 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            Franchises ({teamsList.length})
                        </div>

                        {teamsList.map(teamObj => (
                            <button 
                                key={teamObj.name} 
                                onClick={() => handleTeamClick(teamObj.name)}
                                className={`w-[calc(100%-24px)] text-left relative block text-[#9CA3AF] hover:text-white transition-colors rounded-xl mx-3 my-1 px-4 py-2.5 cursor-pointer group ${
                                    activeTeam === teamObj.name ? 'bg-[#FF6B00] !text-white font-bold shadow-md' : 'hover:bg-white/5'
                                }`}
                            >
                                <span className="relative z-10 flex items-center gap-3 font-semibold text-sm">
                                    <i className="fa-solid fa-users w-5 text-center"></i> {teamObj.name}
                                    {activeTeam === teamObj.name && <i className="fa-solid fa-chevron-right ml-auto text-[10px]"></i>}
                                </span>
                            </button>
                        ))}

                        <div className="px-6 mt-5 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            Management
                        </div>
                        <Link 
                            to="/doremon" 
                            onClick={() => setMobileDrawerOpen(false)}
                            className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-3 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-xs cursor-pointer"
                        >
                            <i className="fa-solid fa-gavel w-5 text-center text-orange-500"></i> Auction Bidding
                        </Link>
                        <Link 
                            to="/doremon/import-export" 
                            onClick={() => setMobileDrawerOpen(false)}
                            className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-3 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-xs cursor-pointer"
                        >
                            <i className="fa-solid fa-file-import w-5 text-center text-orange-500"></i> Import & Export
                        </Link>
                    </nav>

                    {/* Connection Status in Mobile Drawer */}
                    <div className="p-3.5 m-3 bg-black/50 rounded-2xl border border-white/10 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Database</span>
                            {dbStatus.connected ? (
                                <span className="flex items-center gap-1.5 text-green-400 font-bold text-[10px]">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                    {dbStatus.latency}ms
                                </span>
                            ) : (
                                <span className="text-amber-400 font-bold text-[10px]">Disconnected</span>
                            )}
                        </div>
                        <button 
                            onClick={() => { setMobileDrawerOpen(false); setShowConfigModal(true); }} 
                            className="text-[10px] text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer"
                        >
                            {dbStatus.connected ? 'Connection Settings' : 'Configure Supabase'}
                        </button>
                    </div>
                </aside>
            </div>

            {/* DESKTOP SIDEBAR (Screens >= lg) */}
            <aside className="hidden lg:flex flex-col shrink-0 w-64 xl:w-72" style={{ background: "url('/left-navbar.png') no-repeat center center", backgroundSize: 'cover', transition: 'all 0.3s' }}>
                <div className="p-8">
                    <div className="flex items-center gap-3">
                        <div className="bg-orange-600 p-2 rounded-xl text-white">
                            <i className="fa-solid fa-bolt-lightning"></i>
                        </div>
                        <div className="hero-font text-white text-lg leading-none cursor-pointer" onClick={() => setActiveTeam(null)}>
                            SPORTS<br /><span className="text-orange-500">SPECTRA 4.0</span>
                        </div>
                    </div>
                </div>
                
                <nav className="flex-1 mt-4 overflow-y-auto no-scrollbar" onMouseLeave={() => setHoveredTeam(null)}>
                    {activeTeam ? (
                        <a onClick={() => setActiveTeam(null)} className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-3 flex items-center gap-3 font-semibold text-sm cursor-pointer">
                            <i className="fa-solid fa-house-chimney w-5 text-center"></i> Dashboard
                        </a>
                    ) : (
                        <Link to="/" className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-3 flex items-center gap-3 font-semibold text-sm cursor-pointer">
                            <i className="fa-solid fa-arrow-left w-5 text-center"></i> Back to main website
                        </Link>
                    )}
                    <div className="px-8 mt-4 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Franchises ({teamsList.length})</div>
                    
                    {teamsList.map(teamObj => (
                        <a key={teamObj.name} onClick={() => handleTeamClick(teamObj.name)} onMouseEnter={() => setHoveredTeam(teamObj.name)}
                           className={`relative block text-[#9CA3AF] hover:text-white transition-colors rounded-xl mx-4 my-1 px-4 py-3 cursor-pointer group ${(hoveredTeam || activeTeam) === teamObj.name ? '!text-white' : ''}`}>
                            {(hoveredTeam || activeTeam) === teamObj.name && (
                                <motion.div
                                    layoutId="navIndicator"
                                    className="absolute inset-0 bg-[#FF6B00] rounded-xl shadow-[0_10px_15px_-3px_rgba(255,107,0,0.4)]"
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}
                            <span className="relative z-10 flex items-center gap-3 font-semibold text-sm">
                                <i className="fa-solid fa-users w-5 text-center"></i> {teamObj.name}
                                {activeTeam === teamObj.name && <i className="fa-solid fa-chevron-right ml-auto text-[10px]"></i>}
                            </span>
                        </a>
                    ))}

                    <div className="px-8 mt-6 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Management</div>
                    <Link to="/doremon" className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-xs cursor-pointer">
                        <i className="fa-solid fa-gavel w-5 text-center text-orange-500"></i> Auction Bidding
                    </Link>
                    <Link to="/doremon/import-export" className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-xs cursor-pointer">
                        <i className="fa-solid fa-file-import w-5 text-center text-orange-500"></i> Import & Export
                    </Link>
                </nav>

                {/* Connection Status in Sidebar */}
                <div className="p-4 mx-4 mb-4 bg-black/40 rounded-2xl border border-white/10 text-xs">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Database</span>
                        {dbStatus.connected ? (
                            <span className="flex items-center gap-1.5 text-green-400 font-bold text-[10px]">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                {dbStatus.latency}ms
                            </span>
                        ) : (
                            <span className="text-amber-400 font-bold text-[10px]">Disconnected</span>
                        )}
                    </div>
                    <button onClick={() => setShowConfigModal(true)} className="text-[10px] text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer">
                        {dbStatus.connected ? 'Settings' : 'Configure Supabase'}
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col overflow-y-auto relative w-full" style={{ background: "url('/bg.png') no-repeat center center fixed", backgroundSize: 'cover' }}>
                
                {!activeTeam ? (
                    <div className="p-3.5 sm:p-6 md:p-10 flex-1 relative z-10 w-full max-w-7xl mx-auto">
                        <div className="mb-6 sm:mb-8 md:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <div className="w-6 sm:w-8 h-1 bg-orange-500 rounded-full"></div>
                                    <span className="text-[10px] sm:text-xs font-bold text-gray-800 tracking-widest uppercase flex items-center gap-2 flex-wrap">
                                        Live Auction
                                        {isPageLoading ? (
                                            <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse">
                                                <i className="fa-solid fa-circle-notch fa-spin"></i> FETCHING FROM DATABASE
                                            </span>
                                        ) : isSyncing ? (
                                            <span className="bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 animate-pulse">
                                                <i className="fa-solid fa-arrows-rotate fa-spin"></i> SYNCING CHANGES
                                            </span>
                                        ) : dbStatus.connected ? (
                                            <span className="bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> SUPABASE LIVE ({dbStatus.latency}ms)
                                            </span>
                                        ) : (
                                            <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer" onClick={() => setShowConfigModal(true)}>
                                                <i className="fa-solid fa-triangle-exclamation"></i> SETUP SUPABASE DB
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <h1 className="hero-font text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-gray-900 tracking-tight leading-none mb-1">
                                    AUCTION <span className="text-orange-500">DASHBOARD</span>
                                </h1>
                                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    Real-time Franchise Standings & Budget
                                </p>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                <button onClick={() => fetchAllAuctionData(true)} 
                                        className="bg-white/90 hover:bg-white text-gray-700 font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 text-xs flex items-center gap-2 shadow-xs transition hover:shadow cursor-pointer">
                                    <i className={`fa-solid fa-rotate text-orange-500 ${isSyncing ? 'fa-spin' : ''}`}></i>
                                    Refresh Now
                                </button>
                                <button onClick={() => setShowConfigModal(true)} 
                                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition cursor-pointer">
                                    <i className="fa-solid fa-database"></i>
                                    Database Connection
                                </button>
                            </div>
                        </div>

                        {/* PROMINENT DATABASE NOT CONNECTED BANNER */}
                        {!dbStatus.connected && (
                            <div className="mb-6 sm:mb-10 p-4 sm:p-6 md:p-8 bg-gradient-to-r from-orange-500/10 via-amber-500/15 to-orange-500/10 border-2 border-orange-500/30 rounded-2xl sm:rounded-3xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 shadow-sm">
                                <div className="flex items-start gap-3 sm:gap-4">
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-xl sm:text-2xl shrink-0 shadow-sm shadow-orange-500/30">
                                        <i className="fa-solid fa-database animate-pulse"></i>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <h3 className="font-black text-gray-900 text-base sm:text-lg">
                                                Auction Dashboard Is Not Connected To Supabase
                                            </h3>
                                            <span className="text-[9px] sm:text-[10px] bg-red-100 text-red-700 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                Database Disconnected
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600 max-w-2xl leading-relaxed font-medium">
                                            {dbStatus.message || 'Please connect your Supabase database using your Project URL & Public Anon Key to view live franchise budgets, winning bids, and roster statistics.'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto shrink-0">
                                    <button 
                                        onClick={() => setShowConfigModal(true)} 
                                        className="px-5 py-3 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl transition shadow-md shadow-orange-500/30 cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        <i className="fa-solid fa-plug"></i> Connect Database Now
                                    </button>
                                    <button 
                                        onClick={() => setShowSqlGuide(true)} 
                                        className="px-4 py-3 bg-white hover:bg-gray-50 text-gray-800 text-xs font-bold rounded-xl border border-gray-200 transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                                    >
                                        <i className="fa-solid fa-code text-orange-500"></i> View SQL Script
                                    </button>
                                </div>
                            </div>
                        )}

                        {isPageLoading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                                {[1,2,3,4,5,6,7,8].map(i => (
                                    <div key={i} className="bg-white rounded-2xl sm:rounded-[24px] p-5 sm:p-6 border border-gray-100 relative h-[240px] sm:h-[260px]">
                                        <div className="animate-pulse flex flex-col h-full justify-between">
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-200 rounded-xl"></div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="w-20 h-5 bg-gray-200 rounded"></div>
                                                    <div className="w-16 h-3 bg-gray-200 rounded"></div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-end mt-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="w-12 h-3 bg-gray-200 rounded"></div>
                                                    <div className="w-16 h-5 bg-gray-200 rounded"></div>
                                                </div>
                                                <div className="flex flex-col gap-1.5 items-end">
                                                    <div className="w-12 h-3 bg-gray-200 rounded"></div>
                                                    <div className="w-16 h-5 bg-gray-200 rounded"></div>
                                                </div>
                                            </div>
                                            <div className="mt-4 pt-3 border-t border-gray-50">
                                                <div className="w-full h-2.5 bg-gray-200 rounded-full"></div>
                                                <div className="w-12 h-2 bg-gray-200 rounded mt-2"></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                                {teamsList.map(teamObj => {
                                    const team = teamObj.name;
                                    const totalPurse = Number(teamObj.total_purse || 10000);
                                    
                                    // Drafted players strictly matching this team
                                    const teamDraftedPlayers = players.filter(p => getNormalizedTeam(p.team) === getNormalizedTeam(team));
                                    const totalSpent = teamDraftedPlayers.reduce((sum, p) => sum + Number(p.bidAmount || 0), 0);
                                    const purseLeft = Math.max(0, totalPurse - totalSpent);
                                    const percentUsed = totalPurse > 0 ? Math.min(100, Math.round((totalSpent / totalPurse) * 100)) : 0;
                                    const logoUrl = teamObj.logo_url || '/logo1.png';
                                    const themeColor = teamObj.color || 'bg-orange-500';

                                    // Retained leaders count
                                    const retainedLeadersCount = (teamObj.captain_name ? 1 : 0) + (teamObj.vice_captain_name ? 1 : 0);
                                    const totalSquadCount = teamDraftedPlayers.length + retainedLeadersCount;
                                    
                                    return (
                                        <div key={team} onClick={() => handleTeamClick(team)}
                                             className="bg-white rounded-2xl sm:rounded-[24px] p-5 sm:p-6 shadow-xs border border-gray-100 hover:shadow-xl transition-all cursor-pointer relative overflow-hidden group">
                                            
                                            {/* Faint watermark on the right */}
                                            <div className="absolute -bottom-4 -right-4 w-32 h-32 sm:w-40 sm:h-40 opacity-[0.04] group-hover:scale-110 group-hover:opacity-[0.08] transition-all pointer-events-none grayscale">
                                                <img src={logoUrl} className="w-full h-full object-contain" alt="" />
                                            </div>

                                            {/* Chevron icon top right */}
                                            <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-gray-100 transition-colors shadow-xs">
                                                <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                            </div>

                                            <div className="flex items-center gap-3 sm:gap-4 relative z-10 mb-4 sm:mb-6 mt-1 sm:mt-2">
                                                <img src={logoUrl} className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-sm group-hover:scale-105 transition-transform" alt={`${team} logo`} />
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="text-lg sm:text-xl font-black text-gray-900 uppercase tracking-tight leading-tight truncate">{team}</h3>
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                                        {totalSquadCount} MEMBERS SQUAD
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-end relative z-10">
                                                <div>
                                                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-0.5">Purse Left</p>
                                                    <p className="text-lg sm:text-xl font-black text-green-500 leading-none">₹{purseLeft.toLocaleString('en-IN')}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-0.5">Spent</p>
                                                    <p className="text-lg sm:text-xl font-black text-gray-900 leading-none">₹{totalSpent.toLocaleString('en-IN')}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-4 sm:mt-5 relative z-10 pt-3 sm:pt-4 border-t border-gray-50">
                                                <div className="w-full h-2 sm:h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                                    <div className={`h-full ${themeColor} rounded-full transition-all duration-500`} style={{ width: `${percentUsed}%` }}></div>
                                                </div>
                                                <div className="flex justify-between items-center mt-2">
                                                    <p className="text-[9px] font-bold text-gray-400">{percentUsed}% USED</p>
                                                    <p className="text-[9px] font-bold text-gray-400">{teamDraftedPlayers.length} Drafted</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-3.5 sm:p-6 md:p-10 flex-1 relative z-10 w-full max-w-7xl mx-auto">
                        {/* LIVE AUCTION Title & Breadcrumbs */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                            <div>
                                <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest">Live Auction</p>
                                <h2 className="hero-font text-2xl sm:text-3xl md:text-4xl text-gray-900 tracking-tight">AUCTION <span className="text-orange-500">DASHBOARD</span></h2>
                                <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-gray-400 mt-1 font-bold uppercase tracking-wider flex-wrap">
                                    <Link to="/" className="hover:text-orange-500 transition"><i className="fa-solid fa-house"></i></Link> / 
                                    <button onClick={() => setActiveTeam(null)} className="hover:text-orange-500 transition cursor-pointer">Teams</button> / 
                                    <span className="text-gray-900">{activeTeam}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5 sm:gap-4 w-full sm:w-auto">
                                <button onClick={() => setActiveTeam(null)} className="flex-1 sm:flex-none bg-white/90 hover:bg-white text-gray-700 font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer">
                                    <i className="fa-solid fa-arrow-left"></i> All Franchises
                                </button>
                                <button onClick={() => fetchAllAuctionData(true)} className="flex-1 sm:flex-none bg-orange-500 hover:bg-orange-600 text-white font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer">
                                    <i className={`fa-solid fa-arrows-rotate ${isSyncing ? 'fa-spin' : ''}`}></i>
                                    Sync
                                </button>
                            </div>
                        </div>

                        {isTeamLoading ? (
                            <div className="w-full animate-pulse">
                                <div className="h-28 sm:h-32 bg-gray-200/60 rounded-2xl sm:rounded-[24px] mb-6 sm:mb-10 border border-gray-100"></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-8 sm:mb-12">
                                    {[1, 2].map(i => (
                                        <div key={i} className="bg-white rounded-3xl sm:rounded-[40px] p-6 sm:p-10 h-[320px] sm:h-[400px] shadow-sm border border-gray-100">
                                            <div className="w-28 h-28 sm:w-40 sm:h-40 bg-gray-200/80 rounded-2xl sm:rounded-[32px] mx-auto mb-6 sm:mb-8"></div>
                                            <div className="w-40 h-6 sm:w-48 sm:h-8 bg-gray-200/80 rounded-full mx-auto mb-4"></div>
                                            <div className="w-28 h-4 bg-gray-200/80 rounded-full mx-auto"></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full">
                                {(() => {
                                    const teamDraftedPlayers = players.filter(p => getNormalizedTeam(p.team) === getNormalizedTeam(activeTeam));
                                    const currentTeamData = teamsList.find(t => getNormalizedTeam(t.name) === getNormalizedTeam(activeTeam)) || {
                                        name: activeTeam,
                                        total_purse: 10000,
                                        captain_name: '',
                                        captain_gender: 'M',
                                        vice_captain_name: '',
                                        vice_captain_gender: 'F'
                                    };

                                    const captainData = {
                                        name: currentTeamData.captain_name || 'Captain',
                                        gender: currentTeamData.captain_gender || 'M',
                                        initials: currentTeamData.captain_initials || (currentTeamData.captain_name ? currentTeamData.captain_name.slice(0, 2).toUpperCase() : 'CP'),
                                        color: currentTeamData.captain_color || '#D6CFCB',
                                        photo: currentTeamData.captain_photo || ''
                                    };

                                    const viceCaptainData = {
                                        name: currentTeamData.vice_captain_name || 'Vice Captain',
                                        gender: currentTeamData.vice_captain_gender || 'F',
                                        initials: currentTeamData.vice_captain_initials || (currentTeamData.vice_captain_name ? currentTeamData.vice_captain_name.slice(0, 2).toUpperCase() : 'VC'),
                                        color: currentTeamData.vice_captain_color || '#2196F3',
                                        photo: currentTeamData.vice_captain_photo || ''
                                    };

                                    const regulars = teamDraftedPlayers;
                                    const totalGirls = (captainData.gender === 'F' && currentTeamData.captain_name ? 1 : 0) + 
                                                       (viceCaptainData.gender === 'F' && currentTeamData.vice_captain_name ? 1 : 0) + 
                                                       regulars.filter(p => p.gender === 'F').length;
                                    const girlsRemaining = Math.max(0, 15 - totalGirls);
                                    const totalSpent = regulars.reduce((sum, p) => sum + Number(p.bidAmount || 0), 0);
                                    const totalPurse = Number(currentTeamData.total_purse || 10000);
                                    const purseLeft = Math.max(0, totalPurse - totalSpent);
                                    const retainedCount = (currentTeamData.captain_name ? 1 : 0) + (currentTeamData.vice_captain_name ? 1 : 0);

                                    return (
                                        <>
                                            {/* TEAM INFO & STATS */}
                                            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6 mb-6 sm:mb-10 bg-orange-50/50 p-4 sm:p-6 rounded-2xl sm:rounded-[24px] border border-orange-100/60 backdrop-blur-sm shadow-xs">
                                                <div>
                                                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gray-900">{activeTeam.toUpperCase()}</h2>
                                                    <p className="text-orange-500 font-black text-[10px] sm:text-xs uppercase tracking-widest mt-1.5 sm:mt-2">
                                                        {regulars.length + retainedCount} PLAYERS SQUAD ({regulars.length} DRAFTED)
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                                                    <div className="rounded-xl sm:rounded-[20px] px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 border border-black/5 bg-[#FFF0F5] shadow-xs">
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center text-pink-500 shadow-xs shrink-0"><i className="fa-solid fa-user-group text-lg sm:text-xl"></i></div>
                                                        <div>
                                                            <p className="text-[9px] sm:text-[10px] font-extrabold text-pink-400 uppercase tracking-widest">Girls Needed</p>
                                                            <p className="text-2xl sm:text-3xl font-black text-pink-600 leading-none mt-1">{girlsRemaining}</p>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl sm:rounded-[20px] px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 border border-black/5 bg-white shadow-xs">
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-gray-600 shadow-inner border border-gray-100 shrink-0"><i className="fa-solid fa-coins text-lg sm:text-xl"></i></div>
                                                        <div>
                                                            <p className="text-[9px] sm:text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Total Spent</p>
                                                            <p className="text-2xl sm:text-3xl font-black text-gray-900 leading-none mt-1">₹{totalSpent.toLocaleString('en-IN')}</p>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl sm:rounded-[20px] px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 border border-black/5 bg-[#EBFCF5] shadow-xs">
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center text-green-500 shadow-xs shrink-0"><i className="fa-solid fa-money-bill-wave text-lg sm:text-xl"></i></div>
                                                        <div>
                                                            <p className="text-[9px] sm:text-[10px] font-extrabold text-green-500 uppercase tracking-widest">Purse Left</p>
                                                            <p className="text-2xl sm:text-3xl font-black text-green-600 leading-none mt-1">₹{purseLeft.toLocaleString('en-IN')}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* RETAINED LEADERS */}
                                            {(currentTeamData.captain_name || currentTeamData.vice_captain_name) && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 mb-6 sm:mb-12">
                                                    {currentTeamData.captain_name ? renderLeaderCard(captainData, 'CAPTAIN', 'fa-crown', captainData.color) : null}
                                                    {currentTeamData.vice_captain_name ? renderLeaderCard(viceCaptainData, 'VICE CAPTAIN', 'fa-star', viceCaptainData.color) : null}
                                                </div>
                                            )}

                                            {/* DRAFTED PLAYERS SQUAD */}
                                            <div className="bg-white rounded-2xl sm:rounded-[32px] p-4 sm:p-6 md:p-8 shadow-xs border border-gray-100 mb-8 sm:mb-12">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 sm:gap-2 mb-4 sm:mb-6">
                                                    <div>
                                                        <h3 className="text-xl sm:text-2xl font-black text-gray-900">Drafted Squad</h3>
                                                        <p className="text-[11px] sm:text-xs text-gray-400 uppercase tracking-wider font-bold mt-0.5">
                                                            {regulars.length} Regular Players Drafted
                                                        </p>
                                                    </div>
                                                    <div className="text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                        {activeTeam}
                                                    </div>
                                                </div>

                                                {regulars.length === 0 ? (
                                                    <div className="text-center py-12 sm:py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                                        <i className="fa-solid fa-users text-3xl sm:text-4xl text-gray-300 mb-3"></i>
                                                        <p className="text-gray-500 font-bold text-sm">No regular players drafted yet for {activeTeam}.</p>
                                                        <p className="text-gray-400 text-xs mt-1">Go to the Auction Bidding desk in Admin Panel to draft players from the database.</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                                                        {regulars.map(player => (
                                                            <div key={player.id} className="bg-gray-50/60 hover:bg-orange-50/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-gray-100 transition group">
                                                                <div className="flex items-center gap-3 sm:gap-4">
                                                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-sm sm:text-base shrink-0 overflow-hidden shadow-xs">
                                                                        {player.photoUrl ? (
                                                                            <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            player.name.charAt(0)
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="font-bold text-gray-900 text-sm sm:text-base">{player.name}</span>
                                                                            <span className="text-[10px] font-bold bg-white text-gray-600 border border-gray-200 px-2 py-0.5 rounded-md">
                                                                                {player.gender}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[11px] sm:text-xs text-gray-500 mt-1 truncate">
                                                                            Yr: <strong>{player.year || 'N/A'}</strong> | Sec: <strong>{player.section || 'N/A'}</strong> | <strong>{player.sports || 'Sports'}</strong>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="sm:text-right flex sm:flex-col justify-between items-baseline sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                                                                    <span className="text-base sm:text-lg font-black text-orange-600">
                                                                        ₹{Number(player.bidAmount || 0).toLocaleString('en-IN')}
                                                                    </span>
                                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Winning Bid</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Supabase Configuration Modal */}
            {showConfigModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-5 sm:mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold">
                                    <i className="fa-solid fa-database"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-lg sm:text-xl text-gray-900">Supabase Connection</h3>
                                    <p className="text-[10px] sm:text-xs text-gray-400 font-bold">Live Database Integration</p>
                                </div>
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1">
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>

                        <div className={`p-4 rounded-2xl mb-6 text-xs font-medium border ${dbStatus.connected ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                            <div className="flex items-center gap-2 font-bold mb-1">
                                <i className={`fa-solid ${dbStatus.connected ? 'fa-circle-check text-green-600' : 'fa-triangle-exclamation text-amber-600'}`}></i>
                                <span>{dbStatus.connected ? 'Database Status: Live Connected' : 'Database Status: Disconnected'}</span>
                            </div>
                            <p className="text-gray-600 text-[11px] mt-0.5">{dbStatus.message}</p>
                            {dbStatus.connected && (
                                <p className="text-green-700 text-[11px] font-bold mt-1">Real-time latency: {dbStatus.latency}ms</p>
                            )}
                        </div>

                        {/* TEST CONNECTION FEEDBACK */}
                        {testResult && (
                            <div className={`p-4 rounded-2xl mb-4 text-xs font-medium border ${testResult.connected ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                                <div className="flex items-center gap-2 font-bold">
                                    <i className={`fa-solid ${testResult.connected ? 'fa-circle-check text-emerald-600' : 'fa-circle-xmark text-red-600'}`}></i>
                                    <span>{testResult.connected ? 'Test Succeeded!' : 'Connection Test Failed'}</span>
                                </div>
                                <p className="mt-1 text-[11px]">{testResult.message}</p>
                                {testResult.errorType === 'MISSING_TABLES' && (
                                    <button
                                        type="button"
                                        onClick={() => { setShowConfigModal(false); setShowSqlGuide(true); }}
                                        className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-lg text-[10px] flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <i className="fa-solid fa-code"></i> Open SQL Script to Create Tables
                                    </button>
                                )}
                            </div>
                        )}

                        <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Supabase Project URL <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="https://xyzcompany.supabase.co"
                                    value={configInputUrl}
                                    onChange={(e) => setConfigInputUrl(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-orange-500 font-medium"
                                    required
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Found in: Supabase Dashboard &rarr; Project Settings &rarr; API &rarr; Project URL</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Supabase Anon Public API Key <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                    value={configInputKey}
                                    onChange={(e) => setConfigInputKey(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-xs font-mono focus:outline-none focus:border-orange-500"
                                    required
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Found in: Project Settings &rarr; API &rarr; Project API keys &rarr; <strong>anon public</strong></p>
                            </div>

                            <div className="pt-2 flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={handleTestConnection}
                                    disabled={isTestingConn}
                                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <i className={`fa-solid ${isTestingConn ? 'fa-spinner fa-spin' : 'fa-bolt text-orange-500'}`}></i>
                                    {isTestingConn ? 'Testing Connection...' : 'Test Connection'}
                                </button>
                                
                                <div className="flex gap-3">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowConfigModal(false)}
                                        className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold rounded-xl text-xs cursor-pointer border border-gray-200"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={isSavingConn}
                                        className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md shadow-orange-500/20 flex items-center justify-center gap-1.5"
                                    >
                                        <i className={`fa-solid ${isSavingConn ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                                        {isSavingConn ? 'Saving & Connecting...' : 'Save & Connect'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SQL SCRIPT GUIDE MODAL */}
            {showSqlGuide && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 max-w-3xl w-full shadow-2xl border border-gray-100 max-h-[92vh] flex flex-col">
                        <div className="flex justify-between items-center mb-3 sm:mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold">
                                    <i className="fa-solid fa-code"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-lg sm:text-xl text-gray-900">Supabase SQL Setup</h3>
                                    <p className="text-[10px] sm:text-xs text-gray-400 font-bold">Run in Supabase &rarr; SQL Editor</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSqlGuide(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1">
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>

                        <p className="text-xs text-gray-500 mb-3">
                            Execute this in your Supabase SQL Editor to initialize the <strong>players</strong>, <strong>team_bids</strong>, and <strong>teams</strong> tables, configure Row Level Security, and enable real-time updates:
                        </p>

                        <div className="flex-1 bg-gray-900 text-gray-100 p-4 rounded-2xl overflow-y-auto font-mono text-[11px] mb-4">
                            <pre className="whitespace-pre-wrap">{`-- =========================================================
-- 1. PLAYERS REGISTRY TABLE (Personal Details & Status)
-- =========================================================
create table if not exists players (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  gender text not null check (gender in ('M', 'F')),
  year text,
  section text,
  sports text,
  team text not null default 'UNSOLD',
  role text not null default 'Player',
  bid_amount numeric not null default 0 check (bid_amount >= 0),
  photo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_players_name on players using gin (to_tsvector('simple', name));
create index if not exists idx_players_name_lower on players (lower(name));
create index if not exists idx_players_team on players (lower(team));

-- =========================================================
-- 2. TEAM BIDS TABLE (Auction Draft & Bids)
-- =========================================================
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

-- =========================================================
-- 3. TEAMS TABLE (Franchises, Purses, Leaders & Themes)
-- =========================================================
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
  vice_captain_name text,
  vice_captain_gender text default 'F',
  vice_captain_initials text,
  vice_captain_color text default '#2196F3',
  vice_captain_photo text,
  display_order integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_teams_display_order on teams (display_order);

-- =========================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================
alter table players enable row level security;
alter table team_bids enable row level security;
alter table teams enable row level security;

-- Public read policies
create policy "Anyone can read players" on players for select using (true);
create policy "Anyone can read team_bids" on team_bids for select using (true);
create policy "Anyone can read teams" on teams for select using (true);

-- Admin modification policies
create policy "Public/Admin can insert players" on players for insert with check (true);
create policy "Public/Admin can update players" on players for update using (true);
create policy "Public/Admin can delete players" on players for delete using (true);

create policy "Public/Admin can insert team_bids" on team_bids for insert with check (true);
create policy "Public/Admin can update team_bids" on team_bids for update using (true);
create policy "Public/Admin can delete team_bids" on team_bids for delete using (true);

create policy "Public/Admin can insert teams" on teams for insert with check (true);
create policy "Public/Admin can update teams" on teams for update using (true);
create policy "Public/Admin can delete teams" on teams for delete using (true);

-- =========================================================
-- 5. INITIAL FRANCHISES SEED DATA
-- =========================================================
insert into teams (name, total_purse, logo_url, color, text_color, from_color, captain_name, captain_gender, captain_initials, captain_color, captain_photo, vice_captain_name, vice_captain_gender, vice_captain_initials, vice_captain_color, vice_captain_photo, display_order)
values 
  ('Team 1', 10000, '/logo1.png', 'bg-orange-500', 'text-orange-500', 'from-orange-500', 'Atharva Anil Masharkar', 'M', 'AM', '#D6CFCB', '', 'SHRIYA YERANE', 'F', 'SY', '#2196F3', '', 1),
  ('Team 2', 10000, '/logo2.png', 'bg-blue-600', 'text-blue-600', 'from-blue-600', 'Chaitanya Kharpate', 'M', 'CK', '#FFB74D', '', 'Mahek Malkan', 'F', 'MM', '#BA68C8', '', 2),
  ('Team 3', 10000, '/logo3.png', 'bg-red-600', 'text-red-600', 'from-red-600', 'Karan Deshmukh', 'M', 'KD', '#4DB6AC', '', 'Sejal Lende', 'F', 'SL', '#F06292', '', 3),
  ('Team 4', 10000, '/logo4.png', 'bg-purple-600', 'text-purple-600', 'from-purple-600', 'Ranvir Thakur', 'M', 'RT', '#7986CB', '', 'Radhika Sapate', 'F', 'RS', '#FF8A65', '', 4),
  ('Team 5', 10000, '/logo5.png', 'bg-green-600', 'text-green-600', 'from-green-600', 'Arnav Sakharkar', 'M', 'AS', '#E65100', '', 'Ritisha Naigaonkar', 'F', 'RN', '#0277BD', '', 5),
  ('Team 6', 10000, '/logo6.png', 'bg-yellow-600', 'text-yellow-600', 'from-yellow-600', 'Manthan Gujar', 'M', 'MG', '#D84315', '/manthan.png', 'Aarya Raut', 'F', 'AR', '#C5E1A5', '', 6),
  ('Team 7', 10000, '/logo7.png', 'bg-pink-600', 'text-pink-600', 'from-pink-600', 'Parth tiwaskar', 'M', 'PT', '#A1887F', '', 'Janhavi Admane', 'F', 'JA', '#F48FB1', '', 7),
  ('Team 8', 10000, '/logo8.png', 'bg-cyan-600', 'text-cyan-600', 'from-cyan-600', 'Shervin Peter', 'M', 'SP', '#90A4AE', '', 'Gauri Savale', 'F', 'GS', '#FFD54F', '', 8)
on conflict (name) do nothing;

-- =========================================================
-- 6. ENABLE REALTIME BROADCASTING
-- =========================================================
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table team_bids;
alter publication supabase_realtime add table teams;`}</pre>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(`create table if not exists players (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  gender text not null check (gender in ('M', 'F')),
  year text,
  section text,
  sports text,
  team text not null default 'UNSOLD',
  role text not null default 'Player',
  bid_amount numeric not null default 0 check (bid_amount >= 0),
  photo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_players_name on players using gin (to_tsvector('simple', name));
create index if not exists idx_players_name_lower on players (lower(name));
create index if not exists idx_players_team on players (lower(team));

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
  vice_captain_name text,
  vice_captain_gender text default 'F',
  vice_captain_initials text,
  vice_captain_color text default '#2196F3',
  vice_captain_photo text,
  display_order integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_teams_display_order on teams (display_order);

alter table players enable row level security;
alter table team_bids enable row level security;
alter table teams enable row level security;

create policy "Anyone can read players" on players for select using (true);
create policy "Anyone can read team_bids" on team_bids for select using (true);
create policy "Anyone can read teams" on teams for select using (true);

create policy "Public/Admin can insert players" on players for insert with check (true);
create policy "Public/Admin can update players" on players for update using (true);
create policy "Public/Admin can delete players" on players for delete using (true);

create policy "Public/Admin can insert team_bids" on team_bids for insert with check (true);
create policy "Public/Admin can update team_bids" on team_bids for update using (true);
create policy "Public/Admin can delete team_bids" on team_bids for delete using (true);

create policy "Public/Admin can insert teams" on teams for insert with check (true);
create policy "Public/Admin can update teams" on teams for update using (true);
create policy "Public/Admin can delete teams" on teams for delete using (true);

insert into teams (name, total_purse, logo_url, color, text_color, from_color, captain_name, captain_gender, captain_initials, captain_color, captain_photo, vice_captain_name, vice_captain_gender, vice_captain_initials, vice_captain_color, vice_captain_photo, display_order)
values 
  ('Team 1', 10000, '/logo1.png', 'bg-orange-500', 'text-orange-500', 'from-orange-500', 'Atharva Anil Masharkar', 'M', 'AM', '#D6CFCB', '', 'SHRIYA YERANE', 'F', 'SY', '#2196F3', '', 1),
  ('Team 2', 10000, '/logo2.png', 'bg-blue-600', 'text-blue-600', 'from-blue-600', 'Chaitanya Kharpate', 'M', 'CK', '#FFB74D', '', 'Mahek Malkan', 'F', 'MM', '#BA68C8', '', 2),
  ('Team 3', 10000, '/logo3.png', 'bg-red-600', 'text-red-600', 'from-red-600', 'Karan Deshmukh', 'M', 'KD', '#4DB6AC', '', 'Sejal Lende', 'F', 'SL', '#F06292', '', 3),
  ('Team 4', 10000, '/logo4.png', 'bg-purple-600', 'text-purple-600', 'from-purple-600', 'Ranvir Thakur', 'M', 'RT', '#7986CB', '', 'Radhika Sapate', 'F', 'RS', '#FF8A65', '', 4),
  ('Team 5', 10000, '/logo5.png', 'bg-green-600', 'text-green-600', 'from-green-600', 'Arnav Sakharkar', 'M', 'AS', '#E65100', '', 'Ritisha Naigaonkar', 'F', 'RN', '#0277BD', '', 5),
  ('Team 6', 10000, '/logo6.png', 'bg-yellow-600', 'text-yellow-600', 'from-yellow-600', 'Manthan Gujar', 'M', 'MG', '#D84315', '/manthan.png', 'Aarya Raut', 'F', 'AR', '#C5E1A5', '', 6),
  ('Team 7', 10000, '/logo7.png', 'bg-pink-600', 'text-pink-600', 'from-pink-600', 'Parth tiwaskar', 'M', 'PT', '#A1887F', '', 'Janhavi Admane', 'F', 'JA', '#F48FB1', '', 7),
  ('Team 8', 10000, '/logo8.png', 'bg-cyan-600', 'text-cyan-600', 'from-cyan-600', 'Shervin Peter', 'M', 'SP', '#90A4AE', '', 'Gauri Savale', 'F', 'GS', '#FFD54F', '', 8)
on conflict (name) do nothing;

alter publication supabase_realtime add table players;
alter publication supabase_realtime add table team_bids;
alter publication supabase_realtime add table teams;`);
                                    setShowSqlGuide(false);
                                }}
                                className="w-full sm:w-auto px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                            >
                                <i className="fa-solid fa-copy"></i> Copy Script
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowSqlGuide(false)}
                                className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs cursor-pointer flex items-center justify-center"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Auction;
