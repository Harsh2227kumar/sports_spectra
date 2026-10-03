import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_IMPORT } from '../utils/paths';
import { 
  supabase, 
  getLocalPlayersRegistry, 
  getLocalTeamBids, 
  getLocalTeams,
  saveLocalTeams,
  updateCustomSupabaseCredentials,
  getSupabaseConfig,
  sanitizeCsvCell,
  logActivityToSupabase,
  fetchActivityLogsFromSupabase,
  clearActivityLogsInSupabase,
  getLocalActivityLogs
} from '../supabaseClient';

function Admin() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [loginError, setLoginError] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);

    useEffect(() => {
        // Check current session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setIsAuthenticated(!!session);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsAuthenticated(!!session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Database players & bids state
    const [masterPlayers, setMasterPlayers] = useState(() => {
        return getLocalPlayersRegistry().map(p => ({
            id: p.id,
            name: p.name,
            gender: p.gender || 'M',
            year: p.year || '',
            section: p.section || '',
            sports: p.sports || '',
            phone: p.phone_no || p.phone || p.phone_number || '',
            photoUrl: p.photo_url || p.photoUrl || ''
        }));
    });

    const [teamBids, setTeamBids] = useState(() => {
        return getLocalTeamBids().map(b => ({
            id: b.id,
            playerId: b.player_id,
            playerName: b.player_name,
            team: b.team,
            role: b.role || 'Player',
            bidAmount: Number(b.bid_amount || 0)
        }));
    });

    const [teamsList, setTeamsList] = useState(() => getLocalTeams());

    const [showSuccess, setShowSuccess] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMessage, setErrorMessage] = useState(null);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedPlayerObj, setSelectedPlayerObj] = useState(null);
    const suggestionsRef = useRef(null);

    // Form state (Only bidding data and team selection; personal details are fetched from DB)
    const [formData, setFormData] = useState(() => ({
        team: getLocalTeams()[0]?.name || 'Team 1',
        role: 'Player',
        playerName: '',
        bidAmount: ''
    }));

    // Edit state
    const [editBidId, setEditBidId] = useState(null);
    const [duplicateWarning, setDuplicateWarning] = useState(null);

    // Delete confirm modal state
    const [deleteConfirmBid, setDeleteConfirmBid] = useState(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Supabase Connection state
    const [dbStatus, setDbStatus] = useState({ connected: false, latency: 0, message: '' });
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configInputUrl, setConfigInputUrl] = useState(() => getSupabaseConfig().url);
    const [configInputKey, setConfigInputKey] = useState(() => getSupabaseConfig().key);

    // Activity Audit Logs state (Saved in Supabase activity_logs table)
    const [auditLogs, setAuditLogs] = useState(() => {
        return getLocalActivityLogs().map(l => ({
            id: l.id || 'log-' + Math.random().toString(36).substring(2, 6),
            type: l.action_type || l.type || 'SYSTEM',
            details: l.details || '',
            category: l.category || 'AUCTION',
            actor: l.actor || 'Admin',
            timestamp: l.created_at || l.timestamp || new Date().toISOString()
        }));
    });
    const [logFilter, setLogFilter] = useState('ALL');
    const [logSearch, setLogSearch] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    const addLogEntry = async (actionType, details, category = 'AUCTION') => {
        const newLog = {
            id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            type: actionType,
            details: details,
            category: category,
            actor: 'Admin',
            timestamp: new Date().toISOString()
        };
        setAuditLogs(prev => [newLog, ...prev].slice(0, 300));
        setIsSavingLog(true);
        try {
            await logActivityToSupabase({
                action_type: actionType,
                category: category,
                details: details,
                actor: 'Admin'
            });
        } finally {
            setIsSavingLog(false);
        }
    };

    const handleClearLogs = async () => {
        setAuditLogs([]);
        await clearActivityLogsInSupabase();
    };

    const filteredLogs = auditLogs.filter(log => {
        const matchesType = logFilter === 'ALL' || log.type === logFilter;
        const matchesSearch = !logSearch.trim() || 
            (log.details || '').toLowerCase().includes(logSearch.toLowerCase()) || 
            (log.type || '').toLowerCase().includes(logSearch.toLowerCase());
        return matchesType && matchesSearch;
    });

    // Fetch master players and team bids directly from database
    const loadData = async () => {
        const startTime = performance.now();
        try {
            // 1. Fetch Master Players, Team Bids, Teams, and Activity Logs
            const [playersRes, bidsRes, teamsRes, logsRes] = await Promise.all([
                supabase.from('players').select('*'),
                supabase.from('team_bids').select('*'),
                supabase.from('teams').select('*').order('display_order'),
                supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200)
            ]);

            const latency = Math.max(1, Math.round(performance.now() - startTime));

            const config = getSupabaseConfig();
            if (!config.isValid) {
                setDbStatus({
                    connected: false,
                    isMock: true,
                    latency: 0,
                    message: 'Database not connected. Configure Supabase credentials to sync.'
                });
            } else {
                const anyError = playersRes.error || bidsRes.error || teamsRes.error;
                if (anyError) {
                    setDbStatus({
                        connected: false,
                        latency,
                        message: anyError.message
                    });
                } else {
                    setDbStatus({
                        connected: true,
                        latency,
                        message: `Supabase Live (${latency}ms)`
                    });
                }
            }

            if (!playersRes.error && playersRes.data) {
                const mappedPlayers = playersRes.data.map(p => ({
                    id: p.id,
                    name: p.name,
                    gender: p.gender || 'M',
                    year: p.year || '',
                    section: p.section || '',
                    sports: p.sports || '',
                    phone: p.phone_no || p.phone || p.phone_number || '',
                    photoUrl: p.photo_url || p.photoUrl || ''
                }));
                setMasterPlayers(mappedPlayers);
            }

            // 2. Fetch Team Bids (Separate table) - NEVER FALL BACK TO MOCK BIDS IF DB RETURNS 0
            if (!bidsRes.error && bidsRes.data) {
                const mappedBids = bidsRes.data.map(b => ({
                    id: b.id,
                    playerId: b.player_id,
                    playerName: b.player_name,
                    team: b.team,
                    role: b.role || 'Player',
                    bidAmount: Number(b.bid_amount || 0)
                }));
                setTeamBids(mappedBids);
            }

            // 3. Fetch Franchises / Teams from database
            if (!teamsRes.error && teamsRes.data && teamsRes.data.length > 0) {
                setTeamsList(teamsRes.data);
                saveLocalTeams(teamsRes.data);
            }

            // 4. Fetch Activity & Audit Logs from Supabase table
            if (!logsRes.error && logsRes.data && Array.isArray(logsRes.data)) {
                const mappedLogs = logsRes.data.map(l => ({
                    id: l.id,
                    type: l.action_type || l.type || 'SYSTEM',
                    details: l.details || '',
                    category: l.category || 'AUCTION',
                    actor: l.actor || 'Admin',
                    timestamp: l.created_at || new Date().toISOString()
                }));
                setAuditLogs(mappedLogs);
            }
        } catch (err) {
            console.warn('[Sports Spectra] Error loading admin database data:', err);
        }
    };

    useEffect(() => {
        let isCancelled = false;
        const syncFromDb = async () => {
            if (isAuthenticated && !isCancelled) {
                await loadData();
            }
        };
        syncFromDb();

        // High frequency poll for instant live updates
        const poll = setInterval(() => {
            if (isAuthenticated) loadData();
        }, 2500);

        const handleCredsChanged = () => {
            const fresh = getSupabaseConfig();
            setConfigInputUrl(fresh.url);
            setConfigInputKey(fresh.key);
            if (isAuthenticated) loadData();
        };
        window.addEventListener('supabase-credentials-changed', handleCredsChanged);

        // Realtime channels
        const sub = supabase
            .channel('admin_live_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'team_bids' }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => loadData())
            .subscribe();

        window.addEventListener('storage', loadData);
        return () => {
            isCancelled = true;
            clearInterval(poll);
            window.removeEventListener('storage', loadData);
            window.removeEventListener('supabase-credentials-changed', handleCredsChanged);
            try { supabase.removeChannel(sub); } catch {}
        };
    }, [isAuthenticated]);

    // Close suggestions on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError(false);
        const { error } = await supabase.auth.signInWithPassword({
            email: emailInput,
            password: passwordInput,
        });
        
        setLoginLoading(false);

        if (error) {
            setLoginError(true);
            setPasswordInput('');
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    // Autocomplete handler
    const handleNameChange = (e) => {
        setDuplicateWarning(null);
        const value = e.target.value;
        setFormData(prev => ({ ...prev, playerName: value }));

        if (value.trim().length >= 1) {
            const matches = masterPlayers.filter(p =>
                p.name.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 8);

            setSuggestions(matches);
            setShowSuggestions(matches.length > 0);

            const exactMatch = masterPlayers.find(p => p.name.toLowerCase() === value.trim().toLowerCase());
            if (exactMatch) {
                setSelectedPlayerObj(exactMatch);
                checkDraftStatus(exactMatch.name);
            } else {
                setSelectedPlayerObj(null);
            }
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedPlayerObj(null);
        }
    };

    const selectSuggestion = (player) => {
        setFormData(prev => ({
            ...prev,
            playerName: player.name
        }));
        setSelectedPlayerObj(player);
        setShowSuggestions(false);
        setSuggestions([]);
        checkDraftStatus(player.name);
    };

    const checkDraftStatus = (playerName) => {
        const existingBid = teamBids.find(b => b.playerName.toLowerCase() === playerName.trim().toLowerCase());
        if (existingBid && existingBid.id !== editBidId) {
            setDuplicateWarning(`Note: ${playerName} is currently drafted to ${existingBid.team} for ₹${existingBid.bidAmount}. Saving will update their franchise bid.`);
        } else {
            setDuplicateWarning(null);
        }
    };

    const handleChange = (e) => {
        setDuplicateWarning(null);
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    // Save bid to database (team_bids and players table)
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const playerNameTrimmed = formData.playerName.trim();
        if (!playerNameTrimmed) return;

        const bidAmountNum = Number(formData.bidAmount);
        if (isNaN(bidAmountNum) || bidAmountNum < 0) {
            setErrorMessage('Please enter a valid bid amount (0 or higher).');
            return;
        }

        const existingBid = teamBids.find(b => b.playerName.toLowerCase() === playerNameTrimmed.toLowerCase());
        const targetBidId = editBidId || (existingBid ? existingBid.id : null);

        // Find player in master registry
        const playerObj = selectedPlayerObj || masterPlayers.find(p => p.name.toLowerCase() === playerNameTrimmed.toLowerCase());
        const playerId = playerObj ? playerObj.id : null;

        try {
            if (targetBidId) {
                // Update existing bid in team_bids
                await supabase.from('team_bids').update({
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum,
                    player_name: playerNameTrimmed,
                    player_id: playerId
                }).eq('id', targetBidId);

                // Also update players table if present
                await supabase.from('players').update({
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum
                }).eq('name', playerNameTrimmed);

                setSuccessMsg(`Draft updated: ${playerNameTrimmed} drafted to ${formData.team} for ₹${bidAmountNum.toLocaleString('en-IN')}!`);
                addLogEntry('UPDATED', `Updated draft for ${playerNameTrimmed} (${formData.team}, ₹${bidAmountNum.toLocaleString('en-IN')})`);
            } else {
                // Insert new bid in team_bids table
                const newBidRecord = {
                    player_id: playerId,
                    player_name: playerNameTrimmed,
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum
                };

                await supabase.from('team_bids').insert([newBidRecord]);

                // Also update players table if present
                await supabase.from('players').update({
                    team: formData.team,
                    role: formData.role,
                    bid_amount: bidAmountNum
                }).eq('name', playerNameTrimmed);

                setSuccessMsg(`Success! ${playerNameTrimmed} drafted to ${formData.team} for ₹${bidAmountNum.toLocaleString('en-IN')}.`);
                addLogEntry('ENTERED', `Drafted ${playerNameTrimmed} to ${formData.team} for ₹${bidAmountNum.toLocaleString('en-IN')}`);
            }

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 4000);

            // Reset form
            setEditBidId(null);
            setDuplicateWarning(null);
            setFormData({
                team: formData.team,
                role: 'Player',
                playerName: '',
                bidAmount: ''
            });
            setSelectedPlayerObj(null);

            await loadData();
            window.dispatchEvent(new Event('storage'));
        } catch (err) {
            setErrorMessage(`Error saving bid to database: ${err.message}`);
        }
    };

    const handleEditBid = (bid) => {
        setFormData({
            team: bid.team,
            role: bid.role,
            playerName: bid.playerName,
            bidAmount: bid.bidAmount
        });
        setEditBidId(bid.id);
        const match = masterPlayers.find(p => p.name.toLowerCase() === bid.playerName.toLowerCase());
        setSelectedPlayerObj(match || null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const confirmDeleteBid = async () => {
        if (!deleteConfirmBid) return;
        try {
            await supabase.from('team_bids').delete().eq('id', deleteConfirmBid.id);
            await supabase.from('players').update({ team: 'UNSOLD', bid_amount: 0 }).eq('name', deleteConfirmBid.playerName);
            addLogEntry('DELETED', `Deleted draft for ${deleteConfirmBid.playerName} (${deleteConfirmBid.team}, ₹${Number(deleteConfirmBid.bidAmount || 0).toLocaleString('en-IN')})`);
            setDeleteConfirmBid(null);
            await loadData();
            window.dispatchEvent(new Event('storage'));
        } catch (err) {
            setErrorMessage(`Error deleting bid: ${err.message}`);
        }
    };

    const confirmClearAllBids = async () => {
        try {
            for (const b of teamBids) {
                await supabase.from('team_bids').delete().eq('id', b.id);
            }
            await supabase.from('players').update({ team: 'UNSOLD', bid_amount: 0 }).neq('team', 'UNSOLD');
            addLogEntry('DELETED', `Cleared all ${teamBids.length} franchise draft bids from database`);
            setShowClearConfirm(false);
            await loadData();
            window.dispatchEvent(new Event('storage'));
        } catch (err) {
            setErrorMessage(`Error clearing bids: ${err.message}`);
        }
    };

    const handleSaveSupabaseConfig = (e) => {
        e.preventDefault();
        updateCustomSupabaseCredentials(configInputUrl, configInputKey);
        addLogEntry('SYSTEM', `Updated Supabase connection credentials`);
        setShowConfigModal(false);
        setTimeout(() => loadData(), 200);
    };

    // Calculate live franchise purse spending
    const teamSpending = teamsList.map(teamObj => {
        const team = teamObj.name;
        const totalPurse = Number(teamObj.total_purse || 10000);
        const bids = teamBids.filter(b => (b.team || '').toLowerCase().replace(/\s+/g, '') === team.toLowerCase().replace(/\s+/g, ''));
        const spent = bids.reduce((acc, b) => acc + Number(b.bidAmount || 0), 0);
        return {
            name: team,
            totalPurse,
            spent,
            purseLeft: Math.max(0, totalPurse - spent),
            playerCount: bids.length
        };
    });

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-[32px] p-10 max-w-md w-full shadow-2xl border border-gray-100 text-center">
                    <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-inner">
                        <i className="fa-solid fa-lock"></i>
                    </div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Admin Portal</h2>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-8">Sports Spectra 4.0 Auction Desk</p>
                    
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-3">
                            <input 
                                type="email" 
                                value={emailInput} 
                                onChange={(e) => {
                                    setEmailInput(e.target.value);
                                    setLoginError(false);
                                }} 
                                placeholder="Admin Email" 
                                className={`w-full bg-gray-50 border ${loginError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'} rounded-2xl p-4 text-center font-medium focus:outline-none transition`}
                                required
                            />
                            <input 
                                type="password" 
                                value={passwordInput} 
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    setLoginError(false);
                                }} 
                                placeholder="Password" 
                                className={`w-full bg-gray-50 border ${loginError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'} rounded-2xl p-4 text-center font-medium focus:outline-none transition`}
                                required
                            />
                            {loginError && <p className="text-red-500 text-xs font-bold mt-2">Invalid email or password.</p>}
                        </div>
                        <button type="submit" disabled={loginLoading} className={`w-full text-white font-bold text-lg py-4 rounded-2xl transition shadow-lg cursor-pointer ${loginLoading ? 'bg-gray-400 cursor-not-allowed shadow-none' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'}`}>
                            {loginLoading ? 'Authenticating...' : 'Unlock Auction Desk'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-24">
            {/* TOP NAVIGATION */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="bg-orange-500 text-white p-2 sm:p-2.5 rounded-xl shadow-xs shrink-0">
                            <i className="fa-solid fa-gavel text-base sm:text-lg"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-gray-900 text-base sm:text-lg tracking-tight">SPORTS SPECTRA 4.0</span>
                                <span className="bg-orange-100 text-orange-700 text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full">Auction Bidding</span>
                            </div>
                            <p className="text-[11px] sm:text-xs text-gray-500">Live Player Draft & Team Bidding Desk</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full md:w-auto">
                        <button onClick={() => setShowConfigModal(true)} className="px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                            <span className={`w-2 h-2 rounded-full ${dbStatus.connected ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                            <span className="hidden xs:inline">Database</span>
                        </button>
                        <Link to={ADMIN_IMPORT} className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-1.5 sm:gap-2">
                            <i className="fa-solid fa-file-import text-orange-500"></i> <span className="hidden xs:inline">Import /</span> Export
                        </Link>
                        <Link to="/auction" className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 transition flex items-center gap-1.5 sm:gap-2 shadow-xs">
                            <i className="fa-solid fa-trophy"></i> Dashboard
                        </Link>
                        <button onClick={handleLogout} className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition flex items-center gap-1 cursor-pointer ml-auto md:ml-0">
                            <i className="fa-solid fa-right-from-bracket"></i> Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-3.5 sm:px-6 pt-4 sm:pt-8 flex flex-col gap-6 sm:gap-8">
                {/* SUCCESS NOTIFICATION */}
                {showSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-3">
                            <i className="fa-solid fa-circle-check text-emerald-500 text-lg sm:text-xl shrink-0"></i>
                            <span className="font-bold text-xs sm:text-sm">{successMsg}</span>
                        </div>
                        <button onClick={() => setShowSuccess(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                {/* ERROR NOTIFICATION */}
                {errorMessage && (
                    <div className="bg-red-50 border border-red-200 text-red-800 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-3">
                            <i className="fa-solid fa-triangle-exclamation text-red-500 text-lg sm:text-xl shrink-0"></i>
                            <span className="font-bold text-xs sm:text-sm">{errorMessage}</span>
                        </div>
                        <button onClick={() => setErrorMessage(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1">
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
                    {/* LEFT COLUMN: BIDDING DESK FORM */}
                    <div className="lg:col-span-6 flex flex-col gap-6">
                        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-gray-200 shadow-xs relative">
                            <div className="flex justify-between items-center mb-5 sm:mb-6">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                                        {editBidId ? 'Edit Team Bid' : 'Record Auction Bid'}
                                    </h2>
                                    <p className="text-[10px] sm:text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5 sm:mt-1">
                                        Type player name to autocomplete from database
                                    </p>
                                </div>
                                {editBidId && (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            setEditBidId(null);
                                            setFormData(prev => ({ ...prev, playerName: '', bidAmount: '' }));
                                            setSelectedPlayerObj(null);
                                        }}
                                        className="text-xs font-bold text-gray-500 hover:text-gray-800 underline cursor-pointer"
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* PLAYER AUTOCOMPLETE INPUT */}
                                <div className="relative" ref={suggestionsRef}>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Player Name <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={formData.playerName}
                                            onChange={handleNameChange}
                                            onFocus={() => {
                                                if (formData.playerName.trim().length >= 1 && suggestions.length > 0) {
                                                    setShowSuggestions(true);
                                                }
                                            }}
                                            placeholder="Type player name (e.g. Atharva, Karan)..."
                                            className="w-full px-4 py-3.5 pl-11 rounded-2xl border border-gray-200 focus:outline-none focus:border-orange-500 font-semibold text-gray-900 text-sm transition"
                                            required
                                            autoComplete="off"
                                        />
                                        <div className="absolute left-4 top-4 text-gray-400">
                                            <i className="fa-solid fa-magnifying-glass"></i>
                                        </div>
                                        {selectedPlayerObj && (
                                            <div className="absolute right-4 top-3.5 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <i className="fa-solid fa-check"></i> Found in DB
                                            </div>
                                        )}
                                    </div>

                                    {/* AUTOCOMPLETE DROPDOWN */}
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 max-h-60 overflow-y-auto">
                                            <div className="p-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100">
                                                Matching Players ({suggestions.length})
                                            </div>
                                            {suggestions.map(player => (
                                                <div
                                                    key={player.id || player.name}
                                                    onClick={() => selectSuggestion(player)}
                                                    className="p-3.5 hover:bg-orange-50 cursor-pointer flex items-center justify-between border-b border-gray-50 last:border-0 transition"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                                                            {player.photoUrl ? (
                                                                <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                player.name.slice(0, 2).toUpperCase()
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-900 text-sm">{player.name}</div>
                                                            <div className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                                                                <span>{player.gender} &bull; {player.sports || 'All-rounder'} &bull; Yr: {player.year || 'N/A'}</span>
                                                                {player.phone && (
                                                                    <span className="text-orange-600 font-bold bg-orange-100/70 px-1.5 py-0.2 rounded text-[10px] inline-flex items-center gap-1">
                                                                        <i className="fa-solid fa-phone text-[9px]"></i> {player.phone}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">
                                                        Select
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* SELECTED PLAYER PREVIEW CARD */}
                                {selectedPlayerObj && (
                                    <div className="bg-orange-50/70 border border-orange-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-white text-orange-600 border border-orange-200 flex items-center justify-center font-black text-sm shrink-0 overflow-hidden">
                                                {selectedPlayerObj.photoUrl ? (
                                                    <img src={selectedPlayerObj.photoUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    selectedPlayerObj.name.slice(0, 2).toUpperCase()
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-black text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                                                    <span>{selectedPlayerObj.name}</span>
                                                    <span className="bg-white text-gray-600 border border-gray-200 text-[10px] px-1.5 py-0.2 rounded font-bold">
                                                        {selectedPlayerObj.gender}
                                                    </span>
                                                    {selectedPlayerObj.phone && (
                                                        <a
                                                            href={`tel:${selectedPlayerObj.phone}`}
                                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 bg-white hover:bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-md transition"
                                                            title={`Call ${selectedPlayerObj.name}`}
                                                        >
                                                            <i className="fa-solid fa-phone text-[10px]"></i>
                                                            <span>{selectedPlayerObj.phone}</span>
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-600 mt-0.5">
                                                    Year: <strong>{selectedPlayerObj.year || 'N/A'}</strong> | Sec: <strong>{selectedPlayerObj.section || 'N/A'}</strong> | Sport: <strong>{selectedPlayerObj.sports || 'All'}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <Link to={ADMIN_IMPORT} className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline shrink-0 self-start sm:self-auto">
                                            Edit Details
                                        </Link>
                                    </div>
                                )}

                                {/* DUPLICATE DRAFT WARNING */}
                                {duplicateWarning && (
                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2">
                                        <i className="fa-solid fa-triangle-exclamation text-amber-500 text-sm shrink-0"></i>
                                        <span>{duplicateWarning}</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* FRANCHISE TEAM SELECT */}
                                    <div>
                                        <label htmlFor="team" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Assigned Franchise <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            id="team"
                                            value={formData.team}
                                            onChange={handleChange}
                                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 focus:outline-none focus:border-orange-500 font-semibold text-gray-900 text-sm bg-white cursor-pointer"
                                            required
                                        >
                                            {teamsList.map(t => (
                                                <option key={t.name} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                </div>

                                {/* BID AMOUNT INPUT */}
                                <div>
                                    <label htmlFor="bidAmount" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Final Bid Amount (₹) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-gray-400 font-bold text-lg">₹</span>
                                        <input
                                            type="number"
                                            id="bidAmount"
                                            value={formData.bidAmount}
                                            onChange={handleChange}
                                            placeholder="e.g. 1200"
                                            min="0"
                                            step="50"
                                            className="w-full pl-9 pr-4 py-3.5 rounded-2xl border border-gray-200 focus:outline-none focus:border-orange-500 font-black text-gray-900 text-lg transition"
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-black text-base rounded-2xl shadow-lg shadow-orange-500/20 transition cursor-pointer flex items-center justify-center gap-2 mt-2"
                                >
                                    <i className="fa-solid fa-floppy-disk"></i>
                                    {editBidId ? 'Update Bid in Database' : 'Save Bid to Franchise'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: LIVE FRANCHISE PURSE OVERVIEW */}
                    <div className="lg:col-span-6 flex flex-col gap-6">
                        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Franchise Purse Tracker</h3>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Live Budget & Squad Count</p>
                                </div>
                                <span className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                                    {teamBids.length} Total Bids
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-6">
                                {teamSpending.map(t => {
                                    const percent = t.totalPurse > 0 ? Math.min(100, Math.round((t.spent / t.totalPurse) * 100)) : 0;
                                    return (
                                        <div key={t.name} className="p-3 sm:p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-gray-900 text-xs truncate max-w-[120px]">{t.name}</span>
                                                <span className="text-[10px] font-bold text-gray-500">{t.playerCount} drafted</span>
                                            </div>
                                            <div className="flex justify-between items-baseline mb-2">
                                                <span className="text-xs text-gray-500">Purse:</span>
                                                <span className="font-black text-green-600 text-sm">₹{t.purseLeft.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${percent}%` }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                                <span className="text-xs font-bold text-gray-500">Total Spent Across All Teams:</span>
                                <span className="text-base font-black text-gray-900">
                                    ₹{teamBids.reduce((sum, b) => sum + Number(b.bidAmount || 0), 0).toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* BOTTOM SECTION: RECENT AUCTION BIDS TABLE / CARDS */}
                <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 shadow-xs overflow-hidden">
                    <div className="p-4 sm:p-6 md:p-8 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3 sm:gap-4">
                        <div>
                            <h3 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">Recorded Auction Bids ({teamBids.length})</h3>
                            <p className="text-[11px] sm:text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                Real-time bidding records stored in Supabase
                            </p>
                        </div>

                        {teamBids.length > 0 && (
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="px-3.5 sm:px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold rounded-xl transition flex items-center gap-1.5 sm:gap-2 cursor-pointer ml-auto sm:ml-0"
                            >
                                <i className="fa-solid fa-trash-can"></i> Clear All Bids
                            </button>
                        )}
                    </div>

                    {teamBids.length === 0 ? (
                        <div className="text-center py-12 sm:py-16 text-gray-400 px-4">
                            <i className="fa-solid fa-inbox text-3xl sm:text-4xl mb-3 text-gray-300"></i>
                            <p className="font-bold text-sm text-gray-600">No auction bids recorded in database yet.</p>
                            <p className="text-xs mt-1">Use the form above to draft players to franchises.</p>
                        </div>
                    ) : (
                        <>
                            {/* MOBILE CARD VIEW (< md) */}
                            <div className="md:hidden divide-y divide-gray-100">
                                {teamBids.map(bid => {
                                    const pObj = masterPlayers.find(p => p.name.toLowerCase() === bid.playerName.toLowerCase());
                                    const phone = pObj?.phone || '';

                                    return (
                                        <div key={bid.id} className="p-4 flex flex-col gap-2.5 hover:bg-gray-50/60 transition">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <h4 className="font-bold text-gray-900 text-sm">{bid.playerName}</h4>
                                                    {phone ? (
                                                        <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 text-xs text-orange-600 font-bold mt-1 bg-orange-50 px-2 py-0.5 rounded-md hover:bg-orange-100 transition">
                                                            <i className="fa-solid fa-phone text-[10px]"></i>
                                                            <span>{phone}</span>
                                                        </a>
                                                    ) : (
                                                        <span className="text-[11px] text-gray-400 font-medium">No contact</span>
                                                    )}
                                                </div>
                                                <span className="text-base font-black text-orange-600">
                                                    ₹{Number(bid.bidAmount || 0).toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between pt-1">
                                                <span className="bg-orange-100 text-orange-800 text-[11px] font-bold px-2.5 py-0.5 rounded-lg">
                                                    {bid.team}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleEditBid(bid)}
                                                        className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-600 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                                                    >
                                                        <i className="fa-solid fa-pen text-[10px]"></i> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirmBid(bid)}
                                                        className="px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                                                    >
                                                        <i className="fa-solid fa-trash text-[10px]"></i> Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* DESKTOP TABLE VIEW (>= md) */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="text-[10px] uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            <th className="px-6 py-4 font-bold">Player Name</th>
                                            <th className="px-6 py-4 font-bold">Contact / Phone</th>
                                            <th className="px-6 py-4 font-bold">Team</th>
                                            <th className="px-6 py-4 font-bold text-right">Bid Amount</th>
                                            <th className="px-6 py-4 font-bold text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {teamBids.map(bid => {
                                            const pObj = masterPlayers.find(p => p.name.toLowerCase() === bid.playerName.toLowerCase());
                                            const phone = pObj?.phone || '';

                                            return (
                                                <tr key={bid.id} className="hover:bg-gray-50/80 transition">
                                                    <td className="px-6 py-4 font-bold text-gray-900">{bid.playerName}</td>
                                                    <td className="px-6 py-4">
                                                        {phone ? (
                                                            <a
                                                                href={`tel:${phone}`}
                                                                className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-orange-50 hover:text-orange-600 px-2.5 py-1 rounded-lg border border-gray-200 hover:border-orange-300 transition"
                                                                title={`Call ${bid.playerName}`}
                                                            >
                                                                <i className="fa-solid fa-phone text-orange-500 text-[10px]"></i>
                                                                <span>{phone}</span>
                                                            </a>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs italic">Not Provided</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2.5 py-1 rounded-lg">
                                                            {bid.team}
                                                        </span>
                                                    </td>

                                                    <td className="px-6 py-4 font-black text-gray-900 text-right">
                                                        ₹{Number(bid.bidAmount || 0).toLocaleString('en-IN')}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => handleEditBid(bid)}
                                                                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-orange-100 text-gray-600 hover:text-orange-600 flex items-center justify-center transition cursor-pointer"
                                                                title="Edit Bid"
                                                            >
                                                                <i className="fa-solid fa-pen text-xs"></i>
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteConfirmBid(bid)}
                                                                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 flex items-center justify-center transition cursor-pointer"
                                                                title="Delete Bid"
                                                            >
                                                                <i className="fa-solid fa-trash text-xs"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                {/* ACTIVITY & AUDIT LOGS SECTION */}
                <div className="bg-white rounded-2xl sm:rounded-[32px] border border-gray-100 p-4 sm:p-6 md:p-8 shadow-xs">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-lg">
                                <i className="fa-solid fa-list-check"></i>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-xl font-black text-gray-900">Activity & Audit Logs</h3>
                                    <span className="bg-orange-100 text-orange-700 text-xs font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                                        <i className="fa-solid fa-database text-[10px]"></i>
                                        <span>supabase: activity_logs</span>
                                    </span>
                                    <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        {filteredLogs.length} Records
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">Real-time audit trail permanently saved in Supabase database</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 sm:flex-initial min-w-[180px]">
                                <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-gray-400 text-xs"></i>
                                <input 
                                    type="text"
                                    placeholder="Filter logs..."
                                    value={logSearch}
                                    onChange={(e) => setLogSearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:border-orange-500"
                                />
                            </div>
                            <button
                                onClick={handleClearLogs}
                                disabled={auditLogs.length === 0}
                                className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer flex items-center gap-1.5"
                                title="Clear log history"
                            >
                                <i className="fa-solid fa-trash-can text-[11px]"></i> Clear Logs
                            </button>
                        </div>
                    </div>

                    {/* ACTION TYPE FILTERS */}
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
                        {['ALL', 'ENTERED', 'UPDATED', 'DELETED', 'SYSTEM'].map(type => (
                            <button
                                key={type}
                                onClick={() => setLogFilter(type)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                                    logFilter === type 
                                        ? 'bg-gray-900 text-white' 
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {type === 'ALL' ? 'All Activity' : type}
                            </button>
                        ))}
                    </div>

                    {/* LOG ENTRIES LIST */}
                    {filteredLogs.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50/60 rounded-2xl border border-dashed border-gray-200">
                            <i className="fa-solid fa-clock-rotate-left text-3xl text-gray-300 mb-2"></i>
                            <p className="text-gray-500 font-bold text-xs">No audit log entries match your search.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto pr-1">
                            {filteredLogs.map(log => {
                                const isEntered = log.type === 'ENTERED';
                                const isUpdated = log.type === 'UPDATED';
                                const isDeleted = log.type === 'DELETED';
                                const isSystem = log.type === 'SYSTEM';

                                return (
                                    <div key={log.id} className="py-3 px-2 hover:bg-gray-50/60 rounded-xl transition flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${
                                                isEntered ? 'bg-emerald-100 text-emerald-700' :
                                                isUpdated ? 'bg-blue-100 text-blue-700' :
                                                isDeleted ? 'bg-red-100 text-red-700' :
                                                'bg-amber-100 text-amber-700'
                                            }`}>
                                                <i className={`fa-solid ${
                                                    isEntered ? 'fa-plus' :
                                                    isUpdated ? 'fa-pen' :
                                                    isDeleted ? 'fa-trash' :
                                                    'fa-gear'
                                                }`}></i>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                                                        isEntered ? 'bg-emerald-100 text-emerald-800' :
                                                        isUpdated ? 'bg-blue-100 text-blue-800' :
                                                        isDeleted ? 'bg-red-100 text-red-800' :
                                                        'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {log.type}
                                                    </span>
                                                    <span className="text-xs font-semibold text-gray-900">{log.details}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap self-end sm:self-auto">
                                            {new Date(log.timestamp).toLocaleString('en-IN', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true, month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            {/* DELETE CONFIRM MODAL */}
            {deleteConfirmBid && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 text-center">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl sm:text-2xl mx-auto mb-4">
                            <i className="fa-solid fa-trash-can"></i>
                        </div>
                        <h3 className="font-black text-lg sm:text-xl text-gray-900 mb-2">Remove Bid?</h3>
                        <p className="text-gray-500 text-xs mb-6">
                            Are you sure you want to remove the bid for <strong>{deleteConfirmBid.playerName}</strong> ({deleteConfirmBid.team})? The player will return to the unsold pool.
                        </p>
                        <div className="flex gap-2.5 sm:gap-3">
                            <button
                                onClick={() => setDeleteConfirmBid(null)}
                                className="flex-1 py-2.5 sm:py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs sm:text-sm cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteBid}
                                className="flex-1 py-2.5 sm:py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer shadow-md shadow-red-500/20"
                            >
                                Delete Bid
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CLEAR ALL BIDS MODAL */}
            {showClearConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 text-center">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl sm:text-2xl mx-auto mb-4">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <h3 className="font-black text-lg sm:text-xl text-gray-900 mb-2">Clear All Bids?</h3>
                        <p className="text-gray-500 text-xs mb-6">
                            This will permanently delete all {teamBids.length} auction bids from the database and reset all franchise rosters.
                        </p>
                        <div className="flex gap-2.5 sm:gap-3">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="flex-1 py-2.5 sm:py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs sm:text-sm cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmClearAllBids}
                                className="flex-1 py-2.5 sm:py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs sm:text-sm cursor-pointer shadow-md shadow-red-500/20"
                            >
                                Yes, Clear All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SUPABASE CONFIG MODAL */}
            {showConfigModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-5 sm:mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold">
                                    <i className="fa-solid fa-database"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-lg sm:text-xl text-gray-900">Supabase Connection</h3>
                                    <p className="text-[10px] sm:text-xs text-gray-400 font-bold">Live PostgreSQL Database</p>
                                </div>
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1">
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>

                        <div className={`p-4 rounded-2xl mb-6 text-xs font-medium border ${dbStatus.connected ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                            <div className="flex items-center gap-2 font-bold">
                                <i className={`fa-solid ${dbStatus.connected ? 'fa-circle-check text-green-600' : 'fa-triangle-exclamation text-amber-600'}`}></i>
                                <span>{dbStatus.connected ? 'Connected to Supabase' : 'Status: ' + dbStatus.message}</span>
                            </div>
                        </div>

                        <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Supabase Project URL
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://xyzcompany.supabase.co"
                                    value={configInputUrl}
                                    onChange={(e) => setConfigInputUrl(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Supabase Anon Public API Key
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                    value={configInputKey}
                                    onChange={(e) => setConfigInputKey(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-xs font-mono focus:outline-none focus:border-orange-500"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowConfigModal(false)}
                                        className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm cursor-pointer">
                                    Cancel
                                </button>
                                <button type="submit"
                                        className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm cursor-pointer shadow-md shadow-orange-500/20">
                                    Save & Connect
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Admin;
