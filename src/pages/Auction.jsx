import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  supabase, 
  saveLocalTeams, 
  getSupabaseConfig,
  getLocalTeamPenalties
} from '../supabaseClient';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import PlayerAvatar from '../components/PlayerAvatar';
import { formatPhotoUrl } from '../utils/photoUtils';

function getNormalizedTeam(teamName) {
    return (teamName || '').toLowerCase().replace(/\s+/g, '');
}

function Auction() {
    const [activeTeam, setActiveTeam] = useState(null);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [players, setPlayers] = useState([]);
    const [teamsList, setTeamsList] = useState([]);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isTeamLoading, setIsTeamLoading] = useState(false);
    const [hoveredTeam, setHoveredTeam] = useState(null);
    const [dbStatus, setDbStatus] = useState({ connected: false, latency: 0, message: '' });
    const [auctionViewTab, setAuctionViewTab] = useState(() => localStorage.getItem('sportsSpectraAuctionTab') || 'franchises'); // 'franchises' | 'leaderboard'
    const [leaderboardSearch, setLeaderboardSearch] = useState('');
    const [localLeaderboardSearch, setLocalLeaderboardSearch] = useState('');
    const [leaderboardTeamFilter, setLeaderboardTeamFilter] = useState('ALL');
    const [leaderboardGenderFilter, setLeaderboardGenderFilter] = useState('ALL');
    const [leaderboardSortBy, setLeaderboardSortBy] = useState('bid_desc');
    const [copiedPhone, setCopiedPhone] = useState(null);
    
    // Squad Filters
    const [squadSearch, setSquadSearch] = useState('');
    const [localSquadSearch, setLocalSquadSearch] = useState('');
    const [squadGenderFilter, setSquadGenderFilter] = useState('ALL');
    const [squadSortBy, setSquadSortBy] = useState('bid_desc');
    
    const auctionFetchInFlight = useRef(false);
    const auctionRefreshQueued = useRef(false);

    useEffect(() => {
        localStorage.setItem('sportsSpectraAuctionTab', auctionViewTab);
    }, [auctionViewTab]);

    useEffect(() => {
        const t = setTimeout(() => setLeaderboardSearch(localLeaderboardSearch), 250);
        return () => clearTimeout(t);
    }, [localLeaderboardSearch]);

    useEffect(() => {
        const t = setTimeout(() => setSquadSearch(localSquadSearch), 250);
        return () => clearTimeout(t);
    }, [localSquadSearch]);

    // Filter all drafted regular players
    const allDrafted = useMemo(() => {
        return players.filter(p => p.team && p.team.trim().toUpperCase() !== 'UNSOLD');
    }, [players]);

    const teamMap = useMemo(() => {
        const map = {};
        teamsList.forEach(t => {
            map[getNormalizedTeam(t.name)] = t;
        });
        return map;
    }, [teamsList]);

    const teamDraftsMap = useMemo(() => {
        const map = {};
        allDrafted.forEach(p => {
            const teamKey = getNormalizedTeam(p.team);
            if (!map[teamKey]) map[teamKey] = [];
            map[teamKey].push(p);
        });
        return map;
    }, [allDrafted]);

    // Filter and sort for leaderboard
    const filteredLeaderboard = useMemo(() => {
        return allDrafted
            .filter(p => {
                if (!leaderboardSearch) return true;
                const q = leaderboardSearch.toLowerCase().trim();
                return (
                    p.name?.toLowerCase().includes(q) ||
                    p.phone?.toLowerCase().includes(q) ||
                    p.team?.toLowerCase().includes(q) ||
                    p.sports?.toLowerCase().includes(q) ||
                    p.section?.toLowerCase().includes(q)
                );
            })
            .filter(p => {
                if (leaderboardTeamFilter === 'ALL') return true;
                return getNormalizedTeam(p.team) === getNormalizedTeam(leaderboardTeamFilter);
            })
            .filter(p => {
                if (leaderboardGenderFilter === 'ALL') return true;
                return p.gender === leaderboardGenderFilter;
            })
            .sort((a, b) => {
                if (leaderboardSortBy === 'bid_desc') return Number(b.bidAmount || 0) - Number(a.bidAmount || 0);
                if (leaderboardSortBy === 'bid_asc') return Number(a.bidAmount || 0) - Number(b.bidAmount || 0);
                if (leaderboardSortBy === 'name') return (a.name || '').localeCompare(b.name || '');
                return 0;
            });
    }, [allDrafted, leaderboardSearch, leaderboardTeamFilter, leaderboardGenderFilter, leaderboardSortBy]);


    const handleTeamClick = (teamName) => {
        setMobileDrawerOpen(false);
        if (activeTeam === teamName) return;
        setIsTeamLoading(true);
        setActiveTeam(teamName);
        setTimeout(() => setIsTeamLoading(false), 300);
    };

    const fetchAllAuctionData = async (isBackground = false) => {
        if (auctionFetchInFlight.current) {
            auctionRefreshQueued.current = true;
            return;
        }
        auctionFetchInFlight.current = true;
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
                    // Keep the last successful snapshot visible instead of replacing it
                    // with empty data from a failed query.
                    return;
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
            if (Array.isArray(teamsRes.data)) {
                setTeamsList(teamsRes.data);
                saveLocalTeams(teamsRes.data);
            }

            // 2. Process Players & Bids directly from database - STRICTLY NO FAKE OR HARDCODED BIDS
            const dbPlayers = playersRes.data || [];
            const dbBids = bidsRes.data || [];

            // team_bids is the source of truth for drafted status and winning bids.
            // players.team / players.bid_amount may be stale after a bid is deleted.
            const bidsByName = new Map();
            const bidsById = new Map();
            dbBids.forEach(b => {
                if (b.player_id) bidsById.set(String(b.player_id), b);
                if (b.player_name) bidsByName.set(b.player_name.trim().toLowerCase(), b);
            });

            const mappedData = dbPlayers.map(p => {
                const nameKey = p.name ? p.name.trim().toLowerCase() : '';
                const bid = bidsById.get(String(p.id)) || bidsByName.get(nameKey);
                const assignedTeam = bid?.team || 'UNSOLD';
                const winningBid = bid ? Number(bid.bid_amount || 0) : 0;

                return {
                    id: p.id,
                    team: assignedTeam,
                    role: bid ? (bid.role || 'Player') : (p.role || 'Player'),
                    name: p.name,
                    gender: p.gender || 'M',
                    year: p.year || '',
                    section: p.section || '',
                    sports: p.sports || '',
                    phone: p.phone_no || p.phone || p.phone_number || '',
                    bidAmount: winningBid,
                    photoUrl: formatPhotoUrl(p.photo_url || p.photoUrl || '')
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
                        phone: b.phone || '',
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
            auctionFetchInFlight.current = false;
            if (auctionRefreshQueued.current) {
                auctionRefreshQueued.current = false;
                queueMicrotask(() => fetchAllAuctionData(true));
            }
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

        // Realtime gives immediate updates; polling also covers tables not enabled for
        // Realtime in Supabase and recovers quickly from missed events.
        let pollInterval = null;
        const startFallbackPolling = () => {
            if (!pollInterval) pollInterval = setInterval(() => fetchAllAuctionData(true), 10000);
        };
        const stopFallbackPolling = () => {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = null;
        };
        startFallbackPolling();

        // Instant refresh on tab focus / visibility
        const handleVisibilityOrFocus = () => {
            fetchAllAuctionData(true);
        };
        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);

        // Instant refresh on credentials change
        const handleCredsChanged = () => {
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
            .subscribe(status => {
                if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) startFallbackPolling();
            });

        const handleStorageChange = () => {
            fetchAllAuctionData(true);
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            clearTimeout(initTimer);
            stopFallbackPolling();
            window.removeEventListener('focus', handleVisibilityOrFocus);
            window.removeEventListener('supabase-credentials-changed', handleCredsChanged);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('storage', handleStorageChange);
            try { supabase.removeChannel(subscription); } catch {}
        };
    }, []);



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
                    <div className={`w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-2xl sm:rounded-[32px] flex items-center justify-center text-3xl sm:text-4xl md:text-5xl font-black ${initialColor} shadow-inner mb-4 sm:mb-8 group-hover:scale-105 transition-transform duration-300 border border-black/5 overflow-hidden relative`} style={{ backgroundColor: bgColor || '#FF4500' }}>
                        <PlayerAvatar
                            photoUrl={leader.photo}
                            name={leader.name}
                            containerClassName="w-full h-full flex items-center justify-center"
                            className="w-full h-full object-cover"
                            alt={leader.name}
                        />
                    </div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-center text-gray-900 leading-tight">{leader.name}</h3>
                    <p className="text-gray-400 font-bold uppercase text-[9px] sm:text-[10px] mt-1.5 sm:mt-2 tracking-widest">{leader.gender} &nbsp;|&nbsp; {roleTitle}</p>
                    
                    {leader.phone && (
                        <a
                            href={`tel:${leader.phone}`}
                            className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-gray-800 bg-white/95 hover:bg-white border border-gray-200 hover:border-orange-300 px-3.5 py-1.5 rounded-full shadow-2xs hover:text-orange-600 transition"
                            title={`Call ${leader.name}: ${leader.phone}`}
                        >
                            <i className="fa-solid fa-phone text-orange-500 text-[10px]"></i>
                            <span className="font-mono">{leader.phone}</span>
                        </a>
                    )}

                    <div className="mt-4 sm:mt-6 bg-orange-50 border border-orange-100 px-6 sm:px-8 py-2 sm:py-2.5 rounded-full flex items-center gap-2 shadow-xs">
                        <i className="fa-solid fa-circle-check text-orange-500"></i>
                        <span className="text-orange-500 font-black text-[10px] sm:text-xs uppercase tracking-widest">
                            {roleTitle === 'CAPTAIN' ? 'OWNER' : roleTitle === 'VICE CAPTAIN' ? 'CO OWNER' : 'OWNER'}
                        </span>
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
                    onClick={() => { setActiveTeam(null); setAuctionViewTab('franchises'); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        !activeTeam && auctionViewTab === 'franchises' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                    <i className="fa-solid fa-grip text-[10px]"></i> Franchises
                </button>
                <button
                    onClick={() => { setActiveTeam(null); setAuctionViewTab('leaderboard'); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        !activeTeam && auctionViewTab === 'leaderboard' ? 'bg-amber-500 text-white shadow-xs' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    }`}
                >
                    <i className="fa-solid fa-trophy text-[10px] text-amber-500"></i> Leaderboard ({allDrafted.length})
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
                        <div className="hero-font text-white text-base leading-none cursor-pointer" onClick={() => { setActiveTeam(null); setAuctionViewTab('franchises'); setMobileDrawerOpen(false); }}>
                            SPORTS<br /><span className="text-orange-500">SPECTRA 4.0</span>
                        </div>
                        <button 
                            onClick={() => setMobileDrawerOpen(false)}
                            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition cursor-pointer"
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <nav className="flex-1 overflow-y-auto no-scrollbar py-3">
                        <button 
                            onClick={() => { setActiveTeam(null); setAuctionViewTab('franchises'); setMobileDrawerOpen(false); }} 
                            className={`w-[calc(100%-24px)] text-left transition-all rounded-xl mx-3 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-sm cursor-pointer ${
                                !activeTeam && auctionViewTab === 'franchises' ? 'bg-orange-500 text-white font-bold' : 'text-[#9CA3AF] hover:bg-white/5 hover:text-white'
                            }`}
                        >
                            <i className="fa-solid fa-house-chimney w-5 text-center"></i> All Franchises
                        </button>

                        <button 
                            onClick={() => { setActiveTeam(null); setAuctionViewTab('leaderboard'); setMobileDrawerOpen(false); }} 
                            className={`w-[calc(100%-24px)] text-left transition-all rounded-xl mx-3 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-sm cursor-pointer ${
                                !activeTeam && auctionViewTab === 'leaderboard' ? 'bg-amber-500 text-white font-bold' : 'text-amber-400 hover:bg-white/5'
                            }`}
                        >
                            <i className="fa-solid fa-trophy w-5 text-center text-amber-400"></i> Auction Leaderboard
                            <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                                {allDrafted.length}
                            </span>
                        </button>

                        <Link 
                            to="/" 
                            onClick={() => setMobileDrawerOpen(false)}
                            className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-3 my-1 px-4 py-2.5 flex items-center gap-3 font-semibold text-sm cursor-pointer"
                        >
                            <i className="fa-solid fa-arrow-left w-5 text-center"></i> Back to main website
                        </Link>

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
                    </nav>
                </aside>
            </div>

            {/* DESKTOP SIDEBAR (Screens >= lg) */}
            <aside className="hidden lg:flex flex-col shrink-0 w-64 xl:w-72" style={{ background: "url('/left-navbar.png') no-repeat center center", backgroundSize: 'cover', transition: 'all 0.3s' }}>
                <div className="p-8">
                    <div className="hero-font text-white text-lg leading-none cursor-pointer" onClick={() => { setActiveTeam(null); setAuctionViewTab('franchises'); }}>
                        SPORTS<br /><span className="text-orange-500">SPECTRA 4.0</span>
                    </div>
                </div>
                
                <nav className="flex-1 mt-4 overflow-y-auto no-scrollbar" onMouseLeave={() => setHoveredTeam(null)}>
                    <a 
                        onClick={() => { setActiveTeam(null); setAuctionViewTab('franchises'); }} 
                        className={`relative block transition-colors rounded-xl mx-4 my-1 px-4 py-3 cursor-pointer group ${
                            !activeTeam && auctionViewTab === 'franchises' ? 'bg-[#FF6B00] text-white font-bold shadow-md' : 'text-[#9CA3AF] hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <span className="relative z-10 flex items-center gap-3 font-semibold text-sm">
                            <i className="fa-solid fa-house-chimney w-5 text-center"></i> Franchises
                        </span>
                    </a>

                    <a 
                        onClick={() => { setActiveTeam(null); setAuctionViewTab('leaderboard'); }} 
                        className={`relative block transition-colors rounded-xl mx-4 my-1 px-4 py-3 cursor-pointer group ${
                            !activeTeam && auctionViewTab === 'leaderboard' ? 'bg-amber-500 text-white font-bold shadow-md' : 'text-[#9CA3AF] hover:bg-white/5 hover:text-white'
                        }`}
                    >
                        <span className="relative z-10 flex items-center gap-3 font-semibold text-sm">
                            <i className="fa-solid fa-trophy w-5 text-center text-amber-400"></i> Auction Leaderboard
                            <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                                {allDrafted.length}
                            </span>
                        </span>
                    </a>

                    <Link to="/" className="text-[#9CA3AF] hover:bg-white/5 hover:text-white transition-all rounded-xl mx-4 my-1 px-4 py-3 flex items-center gap-3 font-semibold text-sm cursor-pointer">
                        <i className="fa-solid fa-arrow-left w-5 text-center"></i> Back to main website
                    </Link>

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
                </nav>


            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col overflow-y-auto relative w-full" style={{ background: "url('/bg.png') no-repeat center center fixed", backgroundSize: 'cover' }}>
                
                {!activeTeam ? (
                    <div className="p-3.5 sm:p-6 md:p-10 flex-1 relative z-10 w-full max-w-7xl mx-auto">
                        <div className="mb-6 sm:mb-8 md:mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
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
                                        ) : null}
                                    </span>
                                </div>
                                <h1 className="hero-font text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-gray-900 tracking-tight leading-none mb-1">
                                    AUCTION <span className="text-orange-500">{auctionViewTab === 'leaderboard' ? 'LEADERBOARD' : 'DASHBOARD'}</span>
                                </h1>
                                <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    {auctionViewTab === 'leaderboard' ? 'All Drafted Players, Winning Bids & Contacts' : 'Real-time Franchise Standings & Budget'}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                <span
                                    title={dbStatus.message || 'Supabase query round-trip time'}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wide ${
                                        !dbStatus.connected
                                            ? 'bg-red-50 text-red-700 border-red-200'
                                            : dbStatus.latency < 200
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : dbStatus.latency < 500
                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                    }`}
                                >
                                    <i className={`fa-solid ${isSyncing ? 'fa-spinner fa-spin' : 'fa-signal'}`}></i>
                                    {dbStatus.connected ? `Ping ${dbStatus.latency} ms` : 'DB offline'}
                                </span>
                                {/* TAB SWITCHER */}
                                <div className="bg-white/90 backdrop-blur-xs p-1 rounded-2xl border border-gray-200/90 shadow-2xs flex items-center gap-1">
                                    <button
                                        onClick={() => setAuctionViewTab('franchises')}
                                        className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                            auctionViewTab === 'franchises'
                                                ? 'bg-orange-500 text-white shadow-xs'
                                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                        }`}
                                    >
                                        <i className="fa-solid fa-grip text-[11px]"></i>
                                        <span>Franchises ({teamsList.length})</span>
                                    </button>
                                    <button
                                        onClick={() => setAuctionViewTab('leaderboard')}
                                        className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                            auctionViewTab === 'leaderboard'
                                                ? 'bg-amber-500 text-white shadow-xs'
                                                : 'text-amber-800 hover:text-amber-900 hover:bg-amber-50'
                                        }`}
                                    >
                                        <i className="fa-solid fa-trophy text-[11px] text-amber-500"></i>
                                        <span>Leaderboard ({allDrafted.length})</span>
                                    </button>
                                </div>

                                <button onClick={() => fetchAllAuctionData(true)} 
                                        className="bg-white/90 hover:bg-white text-gray-700 font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 text-xs flex items-center gap-2 shadow-xs transition hover:shadow cursor-pointer">
                                    <i className={`fa-solid fa-rotate text-orange-500 ${isSyncing ? 'fa-spin' : ''}`}></i>
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {/* FRANCHISES TAB VIEW */}
                        {auctionViewTab === 'franchises' && (
                            <>
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
                                            const teamDraftedPlayers = teamDraftsMap[getNormalizedTeam(team)] || [];
                                            const totalSpent = teamDraftedPlayers.reduce((sum, p) => sum + Number(p.bidAmount || 0), 0);
                                            const purseLeft = totalPurse - totalSpent;
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
                                                            <p className={`text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-0.5 ${purseLeft < 0 ? 'text-red-400' : ''}`}>Purse Left</p>
                                                            <p className={`text-lg sm:text-xl font-black ${purseLeft < 0 ? 'text-red-500' : 'text-green-500'} leading-none`}>₹{purseLeft.toLocaleString('en-IN')}</p>
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
                            </>
                        )}

                        {/* LEADERBOARD TAB VIEW */}
                        {auctionViewTab === 'leaderboard' && (
                            <div className="flex flex-col gap-6">
                                {(() => {
                                    const totalSpentAcrossAll = allDrafted.reduce((sum, p) => sum + Number(p.bidAmount || 0), 0);
                                    const highestBidAmount = allDrafted.length > 0 ? Math.max(...allDrafted.map(p => Number(p.bidAmount || 0))) : 0;
                                    const avgBidAmount = allDrafted.length > 0 ? Math.round(totalSpentAcrossAll / allDrafted.length) : 0;

                                    return (
                                        <>
                                            {/* SUMMARY STATS BAR */}
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-2xs">
                                                    <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                        Total Players Drafted
                                                    </span>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl sm:text-3xl font-black text-gray-900 leading-none">
                                                            {allDrafted.length}
                                                        </span>
                                                        <span className="text-xs font-bold text-gray-400">players</span>
                                                    </div>
                                                </div>

                                                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-2xs">
                                                    <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                        Total Auction Volume
                                                    </span>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl sm:text-3xl font-black text-orange-600 leading-none">
                                                            ₹{totalSpentAcrossAll.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-2xs">
                                                    <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                        Highest Bid Recorded
                                                    </span>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl sm:text-3xl font-black text-green-600 leading-none">
                                                            ₹{highestBidAmount.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-2xs">
                                                    <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                                        Average Bid
                                                    </span>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl sm:text-3xl font-black text-blue-600 leading-none">
                                                            ₹{avgBidAmount.toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* SEARCH & FILTERS BAR */}
                                            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-gray-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                                                {/* Search Input */}
                                                <div className="relative flex-1 min-w-[200px]">
                                                    <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-3 text-gray-400 text-xs"></i>
                                                    <input
                                                        type="text"
                                                        value={localLeaderboardSearch}
                                                        onChange={(e) => setLocalLeaderboardSearch(e.target.value)}
                                                        placeholder="Search player name, phone, sports..."
                                                        className="w-full pl-9 pr-8 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 focus:outline-none focus:border-orange-500 bg-gray-50/50"
                                                    />
                                                    {localLeaderboardSearch && (
                                                        <button 
                                                            onClick={() => setLocalLeaderboardSearch('')}
                                                            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                                                        >
                                                            <i className="fa-solid fa-xmark text-xs"></i>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Franchise Filter */}
                                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                                    <select
                                                        value={leaderboardTeamFilter}
                                                        onChange={(e) => setLeaderboardTeamFilter(e.target.value)}
                                                        className="px-3 py-2 sm:py-2.5 rounded-xl border border-gray-200 text-xs font-bold bg-white focus:outline-none focus:border-orange-500 cursor-pointer flex-1 sm:flex-initial"
                                                    >
                                                        <option value="ALL">All Franchises ({teamsList.length})</option>
                                                        {teamsList.map(t => (
                                                            <option key={t.name} value={t.name}>{t.name}</option>
                                                        ))}
                                                    </select>

                                                    {/* Gender Filter */}
                                                    <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-bold shrink-0">
                                                        <button
                                                            onClick={() => setLeaderboardGenderFilter('ALL')}
                                                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${leaderboardGenderFilter === 'ALL' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500'}`}
                                                        >
                                                            All
                                                        </button>
                                                        <button
                                                            onClick={() => setLeaderboardGenderFilter('M')}
                                                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${leaderboardGenderFilter === 'M' ? 'bg-white text-blue-600 shadow-2xs' : 'text-gray-500'}`}
                                                        >
                                                            M
                                                        </button>
                                                        <button
                                                            onClick={() => setLeaderboardGenderFilter('F')}
                                                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${leaderboardGenderFilter === 'F' ? 'bg-white text-pink-600 shadow-2xs' : 'text-gray-500'}`}
                                                        >
                                                            F
                                                        </button>
                                                    </div>

                                                    {/* Sort Selector */}
                                                    <select
                                                        value={leaderboardSortBy}
                                                        onChange={(e) => setLeaderboardSortBy(e.target.value)}
                                                        className="px-3 py-2 sm:py-2.5 rounded-xl border border-gray-200 text-xs font-bold bg-white focus:outline-none focus:border-orange-500 cursor-pointer shrink-0"
                                                    >
                                                        <option value="bid_desc">Bid: High to Low</option>
                                                        <option value="bid_asc">Bid: Low to High</option>
                                                        <option value="name">Name: A-Z</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* LEADERBOARD CARDS & TABLE */}
                                            {filteredLeaderboard.length === 0 ? (
                                                <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-xs">
                                                    <i className="fa-solid fa-trophy text-4xl text-gray-300 mb-3"></i>
                                                    <h3 className="text-lg font-bold text-gray-700">No Drafted Players Found</h3>
                                                    <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                                                        {allDrafted.length === 0 
                                                            ? 'No auction bids have been drafted yet. Once bids are placed on the admin panel, they will appear here in real time.' 
                                                            : 'No drafted players match your current filter criteria.'}
                                                    </p>
                                                    {(leaderboardSearch || leaderboardTeamFilter !== 'ALL' || leaderboardGenderFilter !== 'ALL') && (
                                                        <button
                                                            onClick={() => {
                                                                setLeaderboardSearch('');
                                                                setLeaderboardTeamFilter('ALL');
                                                                setLeaderboardGenderFilter('ALL');
                                                            }}
                                                            className="mt-4 px-4 py-2 bg-orange-50 text-orange-600 text-xs font-bold rounded-xl hover:bg-orange-100 transition cursor-pointer"
                                                        >
                                                            Reset Filters
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    {/* MOBILE LEADERBOARD CARDS (< md) */}
                                                    <div className="md:hidden flex flex-col gap-3">
                                                        {filteredLeaderboard.map((player, index) => {
                                                            const teamObj = teamMap[getNormalizedTeam(player.team)];
                                                            const rankNum = index + 1;
                                                            const rankBadgeClass = rankNum === 1
                                                                ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                                                                : rankNum === 2
                                                                ? 'bg-slate-300 text-slate-800 font-black shadow-xs'
                                                                : rankNum === 3
                                                                ? 'bg-amber-700 text-white font-black shadow-xs'
                                                                : 'bg-gray-100 text-gray-700 font-bold';

                                                            return (
                                                                <div key={player.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-2xs hover:shadow-md transition flex flex-col gap-3 relative">
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="flex items-center gap-3">
                                                                            {/* Rank Badge */}
                                                                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs shrink-0 ${rankBadgeClass}`}>
                                                                                #{rankNum}
                                                                            </span>

                                                                            {/* Avatar */}
                                                                            <PlayerAvatar
                                                                                photoUrl={player.photoUrl}
                                                                                name={player.name}
                                                                                containerClassName="w-11 h-11 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-sm shrink-0 overflow-hidden shadow-2xs"
                                                                            />

                                                                            <div className="min-w-0">
                                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                                    <span className="font-bold text-gray-900 text-sm leading-tight">{player.name}</span>
                                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${player.gender === 'F' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>
                                                                                        {player.gender}
                                                                                    </span>
                                                                                </div>
                                                                                <p className="text-[11px] text-gray-400 font-medium truncate mt-0.5">
                                                                                    Yr: <strong>{player.year || 'N/A'}</strong> | Sec: <strong>{player.section || 'N/A'}</strong> | {player.sports || 'All'}
                                                                                </p>
                                                                            </div>
                                                                        </div>

                                                                        {/* Winning Bid */}
                                                                        <div className="text-right shrink-0">
                                                                            <span className="text-base font-black text-orange-600 block leading-tight">
                                                                                ₹{Number(player.bidAmount || 0).toLocaleString('en-IN')}
                                                                            </span>
                                                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                                                                Winning Bid
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Team & Phone Bar */}
                                                                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                                                                        {/* Franchise Badge */}
                                                                        <div 
                                                                            onClick={() => handleTeamClick(player.team)}
                                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-orange-50 border border-gray-200/80 cursor-pointer transition"
                                                                        >
                                                                            <img src={teamObj?.logo_url || '/logo1.png'} alt="" className="w-4 h-4 object-contain" />
                                                                            <span className="text-xs font-bold text-gray-800">{player.team}</span>
                                                                        </div>

                                                                        {/* Phone Link */}
                                                                        {player.phone ? (
                                                                            <div className="flex items-center gap-1.5 ml-auto">
                                                                                <a
                                                                                    href={`tel:${player.phone}`}
                                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition shadow-2xs"
                                                                                    title={`Call ${player.name}`}
                                                                                >
                                                                                    <i className="fa-solid fa-phone text-emerald-600 text-[10px]"></i>
                                                                                    <span className="font-mono">{player.phone}</span>
                                                                                </a>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        navigator.clipboard.writeText(player.phone);
                                                                                        setCopiedPhone(player.id);
                                                                                        setTimeout(() => setCopiedPhone(null), 1500);
                                                                                    }}
                                                                                    className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-[11px] transition cursor-pointer"
                                                                                    title="Copy Phone Number"
                                                                                >
                                                                                    <i className={`fa-solid ${copiedPhone === player.id ? 'fa-check text-green-600' : 'fa-copy'}`}></i>
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[11px] text-gray-400 italic">No phone recorded</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* DESKTOP LEADERBOARD TABLE (>= md) */}
                                                    <div className="hidden md:block bg-white rounded-3xl border border-gray-100 shadow-xs overflow-hidden">
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-sm">
                                                                <thead className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                                                                    <tr>
                                                                        <th className="px-5 py-4 w-16 text-center">Rank</th>
                                                                        <th className="px-5 py-4">Player Details</th>
                                                                        <th className="px-5 py-4">Player Phone / Contact</th>
                                                                        <th className="px-5 py-4">Drafted Franchise</th>
                                                                        <th className="px-5 py-4">Batch / Sport</th>
                                                                        <th className="px-5 py-4 text-right">Winning Bid</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {filteredLeaderboard.map((player, index) => {
                                                                        const teamObj = teamMap[getNormalizedTeam(player.team)];
                                                                        const rankNum = index + 1;
                                                                        const rankBadgeClass = rankNum === 1
                                                                            ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                                                                            : rankNum === 2
                                                                            ? 'bg-slate-300 text-slate-800 font-black shadow-xs'
                                                                            : rankNum === 3
                                                                            ? 'bg-amber-700 text-white font-black shadow-xs'
                                                                            : 'bg-gray-100 text-gray-600 font-bold';

                                                                        return (
                                                                            <tr key={player.id} className="hover:bg-orange-50/30 transition">
                                                                                <td className="px-5 py-4 text-center">
                                                                                    <span className={`inline-flex w-7 h-7 rounded-xl items-center justify-center text-xs ${rankBadgeClass}`}>
                                                                                        #{rankNum}
                                                                                    </span>
                                                                                </td>

                                                                                <td className="px-5 py-4">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <PlayerAvatar
                                                                                            photoUrl={player.photoUrl}
                                                                                            name={player.name}
                                                                                            containerClassName="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-sm shrink-0 overflow-hidden shadow-2xs"
                                                                                        />
                                                                                        <div>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <span className="font-bold text-gray-900">{player.name}</span>
                                                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${player.gender === 'F' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>
                                                                                                    {player.gender}
                                                                                                </span>
                                                                                            </div>
                                                                                            <span className="text-xs text-gray-400">{player.role || 'Player'}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>

                                                                                <td className="px-5 py-4">
                                                                                    {player.phone ? (
                                                                                        <div className="inline-flex items-center gap-2">
                                                                                            <a
                                                                                                href={`tel:${player.phone}`}
                                                                                                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition shadow-2xs"
                                                                                                title={`Call ${player.name}`}
                                                                                            >
                                                                                                <i className="fa-solid fa-phone text-emerald-600 text-xs"></i>
                                                                                                <span className="font-mono">{player.phone}</span>
                                                                                            </a>
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    navigator.clipboard.writeText(player.phone);
                                                                                                    setCopiedPhone(player.id);
                                                                                                    setTimeout(() => setCopiedPhone(null), 1500);
                                                                                                }}
                                                                                                className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-xs transition cursor-pointer"
                                                                                                title="Copy Phone Number"
                                                                                            >
                                                                                                <i className={`fa-solid ${copiedPhone === player.id ? 'fa-check text-green-600' : 'fa-copy'}`}></i>
                                                                                            </button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-xs text-gray-400 italic">No phone recorded</span>
                                                                                    )}
                                                                                </td>

                                                                                <td className="px-5 py-4">
                                                                                    <button
                                                                                        onClick={() => handleTeamClick(player.team)}
                                                                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-orange-50 border border-gray-200/80 cursor-pointer transition"
                                                                                    >
                                                                                        <img src={teamObj?.logo_url || '/logo1.png'} alt="" className="w-5 h-5 object-contain" />
                                                                                        <span className="text-xs font-bold text-gray-900">{player.team}</span>
                                                                                    </button>
                                                                                </td>

                                                                                <td className="px-5 py-4">
                                                                                    <div className="text-xs text-gray-700">
                                                                                        Yr: <strong>{player.year || 'N/A'}</strong> | Sec: <strong>{player.section || 'N/A'}</strong>
                                                                                    </div>
                                                                                    <div className="text-xs text-gray-400 font-medium truncate max-w-[150px]">
                                                                                        {player.sports || 'All'}
                                                                                    </div>
                                                                                </td>

                                                                                <td className="px-5 py-4 text-right">
                                                                                    <span className="text-base font-black text-orange-600 block">
                                                                                        ₹{Number(player.bidAmount || 0).toLocaleString('en-IN')}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
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
                                    const teamDraftedPlayers = teamDraftsMap[getNormalizedTeam(activeTeam)] || [];
                                    const currentTeamData = teamsList.find(t => getNormalizedTeam(t.name) === getNormalizedTeam(activeTeam)) || {
                                        name: activeTeam,
                                        total_purse: 10000,
                                        captain_name: '',
                                        captain_gender: 'M',
                                        vice_captain_name: '',
                                        vice_captain_gender: 'F'
                                    };

                                    const captainPlayer = players.find(p => p.name && p.name.trim().toLowerCase() === (currentTeamData.captain_name || '').trim().toLowerCase());
                                    const viceCaptainPlayer = players.find(p => p.name && p.name.trim().toLowerCase() === (currentTeamData.vice_captain_name || '').trim().toLowerCase());

                                    const captainData = {
                                        name: currentTeamData.captain_name || 'Captain',
                                        gender: currentTeamData.captain_gender || 'M',
                                        initials: currentTeamData.captain_initials || (currentTeamData.captain_name ? currentTeamData.captain_name.slice(0, 2).toUpperCase() : 'CP'),
                                        color: currentTeamData.captain_color || '#D6CFCB',
                                        photo: currentTeamData.captain_photo || captainPlayer?.photoUrl || '',
                                        phone: currentTeamData.captain_phone || captainPlayer?.phone || ''
                                    };

                                    const viceCaptainData = {
                                        name: currentTeamData.vice_captain_name || 'Vice Captain',
                                        gender: currentTeamData.vice_captain_gender || 'F',
                                        initials: currentTeamData.vice_captain_initials || (currentTeamData.vice_captain_name ? currentTeamData.vice_captain_name.slice(0, 2).toUpperCase() : 'VC'),
                                        color: currentTeamData.vice_captain_color || '#2196F3',
                                        photo: currentTeamData.vice_captain_photo || viceCaptainPlayer?.photoUrl || '',
                                        phone: currentTeamData.vice_captain_phone || viceCaptainPlayer?.phone || ''
                                    };

                                    let regulars = teamDraftedPlayers;
                                    
                                    // Apply sorting and filtering to regulars
                                    regulars = regulars.filter(p => {
                                        if (!squadSearch) return true;
                                        const q = squadSearch.toLowerCase().trim();
                                        return (
                                            p.name?.toLowerCase().includes(q) ||
                                            p.sports?.toLowerCase().includes(q)
                                        );
                                    }).filter(p => {
                                        if (squadGenderFilter === 'ALL') return true;
                                        return p.gender === squadGenderFilter;
                                    }).sort((a, b) => {
                                        if (squadSortBy === 'bid_desc') return Number(b.bidAmount || 0) - Number(a.bidAmount || 0);
                                        if (squadSortBy === 'bid_asc') return Number(a.bidAmount || 0) - Number(b.bidAmount || 0);
                                        if (squadSortBy === 'name') return (a.name || '').localeCompare(b.name || '');
                                        return 0;
                                    });

                                    const totalGirls = (captainData.gender === 'F' && currentTeamData.captain_name ? 1 : 0) + 

                                                       (viceCaptainData.gender === 'F' && currentTeamData.vice_captain_name ? 1 : 0) + 
                                                       regulars.filter(p => p.gender === 'F').length;
                                    const girlsRemaining = Math.max(0, 11 - totalGirls);
                                    const totalSpent = regulars.reduce((sum, p) => sum + Number(p.bidAmount || 0), 0);
                                    
                                    const totalPurse = Number(currentTeamData.total_purse || 10000);
                                    const purseLeft = totalPurse - totalSpent;
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
                                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
                                                    <div className="flex-1 sm:flex-initial rounded-xl sm:rounded-[20px] px-3.5 sm:px-4.5 py-3 flex items-center gap-2.5 sm:gap-3 border border-black/5 bg-[#FFF0F5] shadow-xs">
                                                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center text-pink-500 shadow-xs shrink-0"><i className="fa-solid fa-user-group text-sm sm:text-base"></i></div>
                                                        <div>
                                                            <p className="text-[9px] sm:text-[10px] font-extrabold text-pink-400 uppercase tracking-wider whitespace-nowrap">Girls Needed</p>
                                                            <p className="text-lg sm:text-xl font-black text-pink-600 leading-none mt-1 whitespace-nowrap">{girlsRemaining}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 sm:flex-initial rounded-xl sm:rounded-[20px] px-3.5 sm:px-4.5 py-3 flex items-center gap-2.5 sm:gap-3 border border-black/5 bg-white shadow-xs">
                                                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-600 shadow-inner border border-gray-100 shrink-0"><i className="fa-solid fa-coins text-sm sm:text-base"></i></div>
                                                        <div>
                                                            <p className="text-[9px] sm:text-[10px] font-extrabold text-gray-400 uppercase tracking-wider whitespace-nowrap">Total Spent</p>
                                                            <p className="text-lg sm:text-xl font-black text-gray-900 leading-none mt-1 whitespace-nowrap">₹{totalSpent.toLocaleString('en-IN')}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 sm:flex-initial rounded-xl sm:rounded-[20px] px-3.5 sm:px-4.5 py-3 flex items-center gap-2.5 sm:gap-3 border border-black/5 bg-[#EBFCF5] shadow-xs">
                                                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center text-green-500 shadow-xs shrink-0"><i className="fa-solid fa-money-bill-wave text-sm sm:text-base"></i></div>
                                                        <div>
                                                            <p className={`text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap ${purseLeft < 0 ? 'text-red-500' : 'text-green-500'}`}>Purse Left</p>
                                                            <p className={`text-lg sm:text-xl font-black leading-none mt-1 whitespace-nowrap ${purseLeft < 0 ? 'text-red-600' : 'text-green-600'}`}>₹{purseLeft.toLocaleString('en-IN')}</p>
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

                                            <div className="bg-white rounded-2xl sm:rounded-[32px] p-4 sm:p-6 md:p-8 shadow-xs border border-gray-100 mb-8 sm:mb-12">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
                                                    <div>
                                                        <h3 className="text-xl sm:text-2xl font-black text-gray-900">Drafted Squad</h3>
                                                        <p className="text-[11px] sm:text-xs text-gray-400 uppercase tracking-wider font-bold mt-0.5">
                                                            {teamDraftedPlayers.length} Regular Players Drafted
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                {/* Squad Filters */}
                                                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                    <div className="relative flex-1">
                                                        <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-gray-400 text-xs"></i>
                                                        <input
                                                            type="text"
                                                            value={localSquadSearch}
                                                            onChange={(e) => setLocalSquadSearch(e.target.value)}
                                                            placeholder="Search players, sports..."
                                                            className="w-full pl-8 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-orange-500 text-xs font-semibold"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                                        <div className="flex rounded-lg bg-gray-200/50 p-1 text-xs font-bold shrink-0">
                                                            <button
                                                                onClick={() => setSquadGenderFilter('ALL')}
                                                                className={`px-2 py-1 rounded transition cursor-pointer ${squadGenderFilter === 'ALL' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500'}`}
                                                            >
                                                                All
                                                            </button>
                                                            <button
                                                                onClick={() => setSquadGenderFilter('M')}
                                                                className={`px-2 py-1 rounded transition cursor-pointer ${squadGenderFilter === 'M' ? 'bg-white text-blue-600 shadow-2xs' : 'text-gray-500'}`}
                                                            >
                                                                M
                                                            </button>
                                                            <button
                                                                onClick={() => setSquadGenderFilter('F')}
                                                                className={`px-2 py-1 rounded transition cursor-pointer ${squadGenderFilter === 'F' ? 'bg-white text-pink-600 shadow-2xs' : 'text-gray-500'}`}
                                                            >
                                                                F
                                                            </button>
                                                        </div>
                                                        <select
                                                            value={squadSortBy}
                                                            onChange={(e) => setSquadSortBy(e.target.value)}
                                                            className="px-2 py-2 rounded-lg border border-gray-200 text-xs font-bold bg-white focus:outline-none focus:border-orange-500 cursor-pointer shrink-0"
                                                        >
                                                            <option value="bid_desc">Highest Bid</option>
                                                            <option value="bid_asc">Lowest Bid</option>
                                                            <option value="name">Name (A-Z)</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {regulars.length === 0 ? (
                                                    <div className="text-center py-12 sm:py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                                        <i className="fa-solid fa-users text-3xl sm:text-4xl text-gray-300 mb-3"></i>
                                                        <p className="text-gray-500 font-bold text-sm">No regular players matching filters drafted yet for {activeTeam}.</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-3 sm:gap-4">
                                                        {regulars.map(player => (
                                                            <div key={player.id} className="bg-gray-50/60 hover:bg-orange-50/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-gray-100 transition group">
                                                                <div className="flex items-center gap-3 sm:gap-4">
                                                                    <PlayerAvatar
                                                                        photoUrl={player.photoUrl}
                                                                        name={player.name}
                                                                        containerClassName="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-sm sm:text-lg shrink-0 overflow-hidden shadow-xs"
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                            <span className="font-bold text-gray-900 text-sm sm:text-lg">{player.name}</span>
                                                                            <span className="text-[10px] font-bold bg-white text-gray-600 border border-gray-200 px-2 py-0.5 rounded-md">
                                                                                {player.gender}
                                                                            </span>
                                                                            {player.phone ? (
                                                                                <a
                                                                                    href={`tel:${player.phone}`}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-700 bg-white hover:bg-orange-50 hover:text-orange-600 border border-gray-200 hover:border-orange-300 px-2.5 py-0.5 rounded-md transition shadow-2xs"
                                                                                    title={`Call ${player.name}: ${player.phone}`}
                                                                                >
                                                                                    <i className="fa-solid fa-phone text-orange-500 text-[10px]"></i>
                                                                                    <span>{player.phone}</span>
                                                                                </a>
                                                                            ) : null}
                                                                        </div>
                                                                        <p className="text-[11px] sm:text-xs text-gray-500 truncate">
                                                                            Yr: <strong>{player.year || 'N/A'}</strong> | Sec: <strong>{player.section || 'N/A'}</strong>
                                                                        </p>
                                                                        <p className="text-[11px] sm:text-xs text-gray-600 font-semibold truncate mt-0.5 bg-gray-100/80 inline-block px-2 py-0.5 rounded">
                                                                            Sports: <span className="text-gray-900">{player.sports || 'All'}</span>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="sm:text-right flex sm:flex-col justify-between items-baseline sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                                                                    <span className="text-base sm:text-xl font-black text-orange-600">
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
        </div>
    );
}
export default Auction;
