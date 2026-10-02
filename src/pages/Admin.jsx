import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { supabase } from '../supabaseClient';

const getFormattedTimestamp = () => {
    const d = new Date();
    return d.toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
};

function Admin() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('adminAuth') === 'true');
    const [passwordInput, setPasswordInput] = useState('');
    const [loginError, setLoginError] = useState(false);

    const [players, setPlayers] = useState([]);
    const [showSuccess, setShowSuccess] = useState(false);

    // Supabase Logs state
    const [adminLogs, setAdminLogs] = useState([]);
    const [eventLogs, setEventLogs] = useState([]);

    const [activeLogTab, setActiveLogTab] = useState('events'); // 'events' | 'admin'
    const [logSearchQuery, setLogSearchQuery] = useState('');

    // Autocomplete state
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsRef = useRef(null);
    const fileInputRef = useRef(null);
    
    // Form state
    const [formData, setFormData] = useState({
        team: 'ONE EIGHT CHALLENGERS',
        role: 'Player',
        playerName: '',
        gender: 'M',
        year: '',
        section: '',
        sports: '',
        bidAmount: '',
        photoUrl: ''
    });

    // Edit state
    const [editPlayerId, setEditPlayerId] = useState(null);
    const [duplicateError, setDuplicateError] = useState(null);

    // Logging helpers - Writes DIRECTLY to Supabase
    const addAdminLog = async (action, details) => {
        const formattedTime = getFormattedTimestamp();
        const tempLog = {
            id: Date.now() + Math.random(),
            timestamp: formattedTime,
            action,
            details,
            user: 'Admin'
        };
        setAdminLogs(prev => [tempLog, ...prev]);

        try {
            await supabase.from('admin_logs').insert([{
                action,
                details,
                user_name: 'Admin'
            }]);
        } catch (err) {
            console.error("Supabase Admin Log Sync Error:", err);
        }
    };

    const addEventLog = async (eventType, playerName, description, team, bidAmount, diffSummary) => {
        const formattedTime = getFormattedTimestamp();
        const tempLog = {
            id: Date.now() + Math.random(),
            timestamp: formattedTime,
            eventType,
            playerName: playerName || '-',
            description,
            team: team || '-',
            bidAmount: Number(bidAmount) || 0,
            diffSummary
        };
        setEventLogs(prev => [tempLog, ...prev]);

        try {
            await supabase.from('event_logs').insert([{
                event_type: eventType,
                player_name: playerName || '-',
                description,
                team: team || '-',
                bid_amount: Number(bidAmount) || 0,
                diff_summary: diffSummary
            }]);
        } catch (err) {
            console.error("Supabase Event Log Sync Error:", err);
        }
    };

    const loadPlayers = async () => {
        const { data, error } = await supabase.from('players').select('*');
        if (data && !error) {
            const mapped = data.map(dbPlayer => ({
                id: dbPlayer.id,
                team: dbPlayer.team,
                role: dbPlayer.role,
                name: dbPlayer.name,
                gender: dbPlayer.gender,
                year: dbPlayer.year,
                section: dbPlayer.section,
                sports: dbPlayer.sports,
                bidAmount: dbPlayer.bid_amount,
                photoUrl: dbPlayer.photo_url
            }));
            setPlayers(mapped);
        }
    };

    const loadLogs = async () => {
        try {
            const { data: aData } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false });
            if (aData) {
                setAdminLogs(aData.map(l => ({
                    id: l.id,
                    timestamp: new Date(l.created_at || l.timestamp).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
                    action: l.action,
                    details: l.details,
                    user: l.user_name || 'Admin'
                })));
            }
        } catch (e) {
            console.error("Supabase admin_logs fetch error:", e);
        }

        try {
            const { data: eData } = await supabase.from('event_logs').select('*').order('created_at', { ascending: false });
            if (eData) {
                setEventLogs(eData.map(l => ({
                    id: l.id,
                    timestamp: new Date(l.created_at || l.timestamp).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
                    eventType: l.event_type,
                    playerName: l.player_name || '-',
                    description: l.description,
                    team: l.team || '-',
                    bidAmount: Number(l.bid_amount || 0),
                    diffSummary: l.diff_summary
                })));
            }
        } catch (e) {
            console.error("Supabase event_logs fetch error:", e);
        }
    };

    useEffect(() => {
        loadPlayers();
        loadLogs();

        // Subscribe to real-time updates from Supabase tables
        const playersChannel = supabase
            .channel('admin_players_live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
                loadPlayers();
            })
            .subscribe();

        const logsChannel = supabase
            .channel('admin_logs_live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_logs' }, () => {
                loadLogs();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'event_logs' }, () => {
                loadLogs();
            })
            .subscribe();

        const pollInterval = setInterval(() => {
            loadPlayers();
            loadLogs();
        }, 5000);

        return () => {
            clearInterval(pollInterval);
            supabase.removeChannel(playersChannel);
            supabase.removeChannel(logsChannel);
        };
    }, []);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rawData = results.data;
                const normalized = rawData.map(row => {
                    const obj = {};
                    for (const key of Object.keys(row)) {
                        const k = key.trim().toLowerCase();
                        if (k === 'name' || k === 'player name' || k === 'playername') obj.name = String(row[key]).trim();
                        else if (k === 'gender' || k === 'sex') obj.gender = String(row[key]).trim().toUpperCase().charAt(0);
                        else if (k === 'year' || k === 'yr') obj.year = String(row[key]).trim();
                        else if (k === 'section' || k === 'sec') obj.section = String(row[key]).trim();
                        else if (k === 'sport 1' || k === 'sport1' || k === 'sports') obj.sport1 = String(row[key]).trim();
                        else if (k === 'sport 2' || k === 'sport2') obj.sport2 = String(row[key]).trim();
                        else if (k === 'photo' || k === 'photo url' || k === 'photourl' || k === 'image') obj.photo = String(row[key]).trim();
                    }
                    const sports = [obj.sport1, obj.sport2].filter(Boolean).join(', ');
                    return {
                        team: 'UNSOLD',
                        role: 'Player',
                        name: obj.name,
                        gender: obj.gender || 'M',
                        year: obj.year || '',
                        section: obj.section || '',
                        sports: sports,
                        bid_amount: 0,
                        photo_url: obj.photo || ''
                    };
                }).filter(row => row.name);

                const uniqueNewPlayers = [];
                const seenNames = new Set(players.map(p => p.name.toLowerCase()));

                for (const p of normalized) {
                    const lowerName = p.name.toLowerCase();
                    if (!seenNames.has(lowerName)) {
                        uniqueNewPlayers.push(p);
                        seenNames.add(lowerName);
                    }
                }

                if (uniqueNewPlayers.length === 0) {
                    alert("No new players found in the CSV. All players already exist in Supabase.");
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                try {
                    const { error } = await supabase.from('players').insert(uniqueNewPlayers);
                    if (error) throw error;
                    
                    const ignoredCount = normalized.length - uniqueNewPlayers.length;
                    const ignoreMsg = ignoredCount > 0 ? ` (${ignoredCount} duplicates ignored)` : '';
                    alert(`Successfully imported ${uniqueNewPlayers.length} new players to Supabase!${ignoreMsg}`);
                    
                    // Log events directly to Supabase
                    addAdminLog('CSV_UPLOAD', `Uploaded CSV file with ${uniqueNewPlayers.length} new players`);
                    addEventLog('BULK_IMPORT', 'CSV Upload', `Imported ${uniqueNewPlayers.length} new players to database as UNSOLD`, 'UNSOLD', 0, `CSV Import: ${uniqueNewPlayers.length} players inserted (${ignoredCount} duplicates skipped)`);

                    loadPlayers();
                    loadLogs();
                } catch (err) {
                    alert('Error importing to Supabase: ' + err.message);
                }
            },
            error: (error) => {
                alert("Error parsing CSV: " + error.message);
            }
        });
        
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleNameChange = (e) => {
        setDuplicateError(null);
        const value = e.target.value;
        setFormData(prev => ({ ...prev, playerName: value }));

        if (value.length >= 2) {
            const matches = players.filter(p =>
                p.team === 'UNSOLD' && p.name.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 8);
            setSuggestions(matches);
            setShowSuggestions(matches.length > 0);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const selectSuggestion = (player) => {
        setFormData(prev => ({
            ...prev,
            playerName: player.name || prev.playerName,
            gender: (player.gender === 'M' || player.gender === 'F') ? player.gender : prev.gender,
            year: player.year || prev.year,
            section: player.section || prev.section,
            sports: player.sports || prev.sports,
            photoUrl: player.photoUrl || prev.photoUrl
        }));
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleChange = (e) => {
        setDuplicateError(null);
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const existingPlayer = players.find(p => p.name.toLowerCase() === formData.playerName.trim().toLowerCase());
        const isUpdate = editPlayerId || (existingPlayer && existingPlayer.team === 'UNSOLD');
        const targetId = editPlayerId || (existingPlayer ? existingPlayer.id : null);

        if (isUpdate) {
            const oldTeam = existingPlayer ? existingPlayer.team : 'UNSOLD';
            const oldBid = existingPlayer ? existingPlayer.bidAmount : 0;
            const photoUrl = formData.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(formData.playerName) + '&background=random';

            const { error } = await supabase.from('players').update({
                team: formData.team,
                role: formData.role,
                name: formData.playerName,
                gender: formData.gender,
                year: formData.year,
                section: formData.section,
                sports: formData.sports,
                bid_amount: formData.bidAmount,
                photo_url: photoUrl
            }).eq(targetId ? 'id' : 'name', targetId || formData.playerName);

            if (!error) {
                setEditPlayerId(null);
                addAdminLog('EDIT_BID', `Updated player "${formData.playerName}" (Team: ${oldTeam} -> ${formData.team}, Bid: ₹${Number(oldBid).toLocaleString('en-IN')} -> ₹${Number(formData.bidAmount).toLocaleString('en-IN')})`);
                addEventLog('UPDATED', formData.playerName, `Updated bid/player info for "${formData.playerName}"`, formData.team, Number(formData.bidAmount), `Player "${formData.playerName}" updated. Team: ${oldTeam} -> ${formData.team} | Bid: ₹${Number(oldBid).toLocaleString('en-IN')} -> ₹${Number(formData.bidAmount).toLocaleString('en-IN')}`);
            } else {
                alert("Supabase Update Error: " + error.message);
            }
        } else {
            if (existingPlayer) {
                setDuplicateError(`Cannot add duplicate! ${formData.playerName} has already been drafted to ${existingPlayer.team}.`);
                return;
            }

            const photoUrl = formData.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(formData.playerName) + '&background=random';

            const { error } = await supabase.from('players').insert([{
                team: formData.team,
                role: formData.role,
                name: formData.playerName,
                gender: formData.gender,
                year: formData.year,
                section: formData.section,
                sports: formData.sports,
                bid_amount: formData.bidAmount,
                photo_url: photoUrl
            }]);

            if (!error) {
                addAdminLog('ADD_BID', `Drafted player "${formData.playerName}" to ${formData.team} with bid ₹${Number(formData.bidAmount).toLocaleString('en-IN')}`);
                addEventLog('CREATED', formData.playerName, `Drafted player "${formData.playerName}" to ${formData.team}`, formData.team, Number(formData.bidAmount), `New player "${formData.playerName}" drafted to ${formData.team} for ₹${Number(formData.bidAmount).toLocaleString('en-IN')}`);
            } else {
                alert("Supabase Insert Error: " + error.message);
            }
        }

        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        
        setFormData({
            team: 'ONE EIGHT CHALLENGERS',
            role: 'Player',
            playerName: '',
            gender: 'M',
            year: '',
            section: '',
            sports: '',
            bidAmount: '',
            photoUrl: ''
        });

        loadPlayers();
        loadLogs();
    };

    const handleEdit = (player) => {
        setFormData({
            team: player.team,
            role: player.role,
            playerName: player.name,
            gender: player.gender,
            year: player.year,
            section: player.section,
            sports: player.sports,
            bidAmount: player.bidAmount,
            photoUrl: (player.photoUrl && player.photoUrl.includes('ui-avatars')) ? '' : (player.photoUrl || '')
        });
        setEditPlayerId(player.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (playerId) => {
        if (window.confirm("Are you sure you want to remove this player from Supabase?")) {
            const playerToDelete = players.find(p => p.id === playerId);
            if (playerToDelete) {
                const { error } = await supabase.from('players').delete().eq('id', playerId);
                if (!error) {
                    addAdminLog('DELETE_PLAYER', `Deleted player "${playerToDelete.name}" from team ${playerToDelete.team}`);
                    addEventLog('DELETED', playerToDelete.name, `Removed player "${playerToDelete.name}" from ${playerToDelete.team}`, playerToDelete.team, Number(playerToDelete.bidAmount || 0), `Player "${playerToDelete.name}" removed from Supabase database`);
                    loadPlayers();
                    loadLogs();
                } else {
                    alert("Supabase Delete Error: " + error.message);
                }
            }
        }
    };

    const clearData = async () => {
        if (window.confirm("Are you sure you want to reset all drafted players in Supabase?")) {
            try {
                // Update drafted players back to UNSOLD or delete them
                const { error } = await supabase.from('players').update({ team: 'UNSTAGE_CLEAR', bid_amount: 0 }).neq('team', 'UNSOLD');
                if (error) {
                    await supabase.from('players').delete().neq('name', '___NON_EXISTENT___');
                }
                addAdminLog('CLEAR_ALL', 'Reset all drafted auction players in Supabase');
                addEventLog('CLEAR_ALL', 'All Players', 'Full reset of auction player data executed', 'ALL TEAMS', 0, 'Admin reset all player bid data in Supabase');
                loadPlayers();
                loadLogs();
            } catch (err) {
                alert("Error resetting data in Supabase: " + err.message);
            }
        }
    };

    const handleLogin = (e) => {
        e.preventDefault();
        if (passwordInput === import.meta.env.VITE_ADMIN_PASSWORD) {
            setIsAuthenticated(true);
            sessionStorage.setItem('adminAuth', 'true');
            setLoginError(false);
            addAdminLog('LOGIN', 'Admin authenticated and logged in successfully');
            addEventLog('LOGIN', 'Admin', 'Admin logged into control panel', 'N/A', 0, 'Admin session authenticated successfully');
        } else {
            setLoginError(true);
            setPasswordInput('');
        }
    };

    const handleLogout = () => {
        addAdminLog('LOGOUT', 'Admin logged out');
        sessionStorage.removeItem('adminAuth');
        setIsAuthenticated(false);
    };

    const clearAdminLogs = async () => {
        if (window.confirm("Are you sure you want to clear all admin logs in Supabase?")) {
            try {
                await supabase.from('admin_logs').delete().neq('id', 0);
            } catch (e) {}
            setAdminLogs([]);
        }
    };

    const clearEventLogs = async () => {
        if (window.confirm("Are you sure you want to clear all event logs in Supabase?")) {
            try {
                await supabase.from('event_logs').delete().neq('id', 0);
            } catch (e) {}
            setEventLogs([]);
        }
    };

    const exportLogsToCSV = (dataList, filename) => {
        if (!dataList || dataList.length === 0) {
            alert("No logs available to export.");
            return;
        }
        const csvContent = Papa.unparse(dataList);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${filename}_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl max-w-md w-full text-center border border-gray-100">
                    <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 text-orange-500 text-3xl shadow-inner">
                        <i className="fa-solid fa-shield-halved"></i>
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Admin Access</h1>
                    <p className="text-gray-500 text-sm mb-8">Enter the master password to access auction controls & Supabase logs.</p>
                    
                    <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div>
                            <input 
                                type="password" 
                                value={passwordInput}
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    setLoginError(false);
                                }}
                                placeholder="Enter Admin Password" 
                                className={`w-full bg-gray-50 border ${loginError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'} rounded-xl p-4 text-center font-medium focus:outline-none transition`}
                                required
                                autoFocus
                            />
                            {loginError && <p className="text-red-500 text-xs font-bold mt-2">Incorrect password. Please try again.</p>}
                        </div>
                        <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg py-4 rounded-xl transition shadow-lg shadow-orange-200 mt-2 flex items-center justify-center gap-2">
                            <i className="fa-solid fa-key"></i> Unlock Dashboard
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    const filteredEventLogs = eventLogs.filter(log => {
        if (!logSearchQuery) return true;
        const q = logSearchQuery.toLowerCase();
        return (
            log.playerName?.toLowerCase().includes(q) ||
            log.team?.toLowerCase().includes(q) ||
            log.eventType?.toLowerCase().includes(q) ||
            log.diffSummary?.toLowerCase().includes(q)
        );
    });

    const filteredAdminLogs = adminLogs.filter(log => {
        if (!logSearchQuery) return true;
        const q = logSearchQuery.toLowerCase();
        return (
            log.action?.toLowerCase().includes(q) ||
            log.details?.toLowerCase().includes(q) ||
            log.user?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="p-4 md:p-10 text-gray-800 bg-gray-50 min-h-screen">
            <div className="max-w-6xl mx-auto space-y-8">
                
                {/* HEADER */}
                <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-200 mb-1">
                            <i className="fa-solid fa-[#10B981] fa-circle text-[8px] animate-pulse"></i> Supabase Live Database
                        </div>
                        <h1 className="text-2xl md:text-4xl font-black tracking-tight">Sports Spectra 4.0 Admin</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="bg-black/20 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 backdrop-blur">
                            <i className="fa-solid fa-database text-emerald-400"></i> Connected to Supabase
                        </span>
                        <button 
                            onClick={handleLogout}
                            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 backdrop-blur"
                        >
                            <i className="fa-solid fa-right-from-bracket"></i> Logout
                        </button>
                    </div>
                </div>

                {/* FORM & IMPORT CARD */}
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
                    <div className="px-6 md:px-8 pt-6">
                        <div className="flex flex-col sm:flex-row items-center justify-between bg-blue-50 border border-blue-100 p-4 rounded-2xl gap-4 text-center sm:text-left">
                            <div>
                                <h3 className="text-sm font-bold text-blue-900 flex items-center justify-center sm:justify-start gap-2">
                                    <i className="fa-solid fa-file-csv text-blue-600"></i> Import Players List to Supabase (CSV)
                                </h3>
                                <p className="text-xs text-blue-600 mt-1">Upload a CSV file to add available players directly into Supabase database.</p>
                            </div>
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                id="csvUpload"
                            />
                            <label
                                htmlFor="csvUpload"
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-3 rounded-xl cursor-pointer transition shadow-md w-full sm:w-auto shrink-0 flex items-center justify-center gap-2"
                            >
                                <i className="fa-solid fa-upload"></i> Upload CSV
                            </label>
                        </div>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-6 md:p-8 flex flex-col gap-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Team</label>
                                <select id="team" value={formData.team} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500" required>
                                    {['ONE EIGHT CHALLENGERS', 'TEAM 2', 'ASTRA', 'BRAVO', 'HELLFIRE', 'AUREX', 'TITANS', 'NEMESIS'].map(teamName => (
                                        <option key={teamName} value={teamName}>{teamName}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Player Role</label>
                                <select id="role" value={formData.role} onChange={handleChange} className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none" disabled>
                                    <option value="Player">Player</option>
                                </select>
                            </div>
                        </div>

                        {/* Player Name with Autocomplete */}
                        <div className="relative" ref={suggestionsRef}>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Player Name</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    id="playerName"
                                    value={formData.playerName}
                                    onChange={handleNameChange}
                                    onFocus={() => {
                                        if (formData.playerName.length >= 2 && suggestions.length > 0) {
                                            setShowSuggestions(true);
                                        }
                                    }}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500"
                                    placeholder="Start typing to search available players in Supabase..."
                                    required
                                    autoComplete="off"
                                />
                                {players.some(p => p.team === 'UNSOLD') && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-400 pointer-events-none">
                                        <i className="fa-solid fa-magnifying-glass text-sm"></i>
                                    </div>
                                )}
                            </div>

                            {/* Autocomplete Dropdown */}
                            {showSuggestions && (
                                <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-2xl max-h-64 overflow-y-auto">
                                    {suggestions.map((s, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => selectSuggestion(s)}
                                            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-orange-50 transition border-b border-gray-50 last:border-b-0 group"
                                        >
                                            <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-black text-xs shrink-0">
                                                {s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">{s.name}</p>
                                                <p className="text-xs text-gray-400 truncate">
                                                    {[s.gender, s.year && `Year ${s.year}`, s.section && `Sec ${s.section}`, s.sports].filter(Boolean).join(' • ')}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gender</label>
                                <select id="gender" value={formData.gender} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500" required>
                                    <option value="M">M</option>
                                    <option value="F">F</option>
                                </select>
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Year</label>
                                <input type="text" id="year" value={formData.year} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. 2nd" required />
                            </div>
                            <div className="col-span-2 md:col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Section</label>
                                <input type="text" id="section" value={formData.section} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. A" required />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sports Played</label>
                            <input type="text" id="sports" value={formData.sports} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. Cricket, Football" required />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bid Amount (₹)</label>
                                <input type="number" id="bidAmount" value={formData.bidAmount} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="e.g. 1000" required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Photo URL (Optional)</label>
                                <input type="text" id="photoUrl" value={formData.photoUrl} onChange={handleChange} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-orange-500" placeholder="https://..." />
                            </div>
                        </div>

                        {duplicateError && (
                            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-xl shadow-sm">
                                <p className="font-bold text-sm flex items-center gap-2">
                                    <i className="fa-solid fa-triangle-exclamation text-red-500"></i> Error
                                </p>
                                <p className="text-sm mt-1">{duplicateError}</p>
                            </div>
                        )}

                        <button type="submit" className={`mt-2 ${editPlayerId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'} text-white font-bold text-base py-4 rounded-xl transition shadow-lg flex items-center justify-center gap-2`}>
                            <i className={`fa-solid ${editPlayerId ? 'fa-pen-to-square' : 'fa-gavel'}`}></i>
                            {editPlayerId ? "Update Player Bid in Supabase" : "Save Bid to Supabase"}
                        </button>
                        
                        {editPlayerId && (
                            <button type="button" onClick={() => {
                                setEditPlayerId(null);
                                setFormData({ team: 'ONE EIGHT CHALLENGERS', role: 'Player', playerName: '', gender: 'M', year: '', section: '', sports: '', bidAmount: '', photoUrl: '' });
                            }} className="mt-1 text-gray-500 font-bold text-sm hover:text-gray-700 transition">Cancel Edit</button>
                        )}
                        {showSuccess && <p className="text-green-600 font-bold text-center text-sm mt-1 animate-bounce">Saved directly to Supabase!</p>}
                    </form>
                </div>

                {/* RECENT ENTRIES LIST */}
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                <i className="fa-solid fa-database text-orange-500"></i> Supabase Drafted Squad
                            </h2>
                            <p className="text-xs text-gray-400 font-medium">Currently drafted players stored in Supabase</p>
                        </div>
                        <button onClick={clearData} className="text-xs bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-xl font-bold hover:bg-red-100 transition flex items-center gap-1.5">
                            <i className="fa-solid fa-trash-can"></i> Reset All Drafted Players
                        </button>
                    </div>
                    
                    <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                        {players.filter(p => p.team !== 'UNSOLD').length === 0 ? (
                            <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 font-medium text-sm">
                                <i className="fa-solid fa-box-open text-3xl mb-2 text-gray-300 block"></i>
                                No players drafted in Supabase yet. Use the form above to add bids.
                            </div>
                        ) : (
                            players.filter(p => p.team !== 'UNSOLD').slice().reverse().map(p => (
                                <div key={p.id} className="flex justify-between items-center p-4 bg-gray-50/80 hover:bg-orange-50/40 rounded-2xl border border-gray-100 transition group">
                                    <div className="flex items-center gap-3">
                                        <img src={p.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name)} className="w-10 h-10 rounded-full object-cover shadow-sm bg-gray-200" alt="" />
                                        <div>
                                            <span className="font-bold text-gray-900 block leading-snug">{p.name}</span>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{p.gender} • {p.year} / {p.section}</span>
                                        </div>
                                    </div>
                                    <div className="text-right flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="font-black text-orange-600 text-base">₹{Number(p.bidAmount).toLocaleString('en-IN')}</div>
                                            <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest bg-gray-200/60 px-2 py-0.5 rounded-md">{p.team}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEdit(p)} title="Edit Bid" className="w-9 h-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition shadow-sm border border-blue-100"><i className="fa-solid fa-pen text-xs"></i></button>
                                            <button onClick={() => handleDelete(p.id)} title="Delete Player" className="w-9 h-9 flex items-center justify-center bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition shadow-sm border border-red-100"><i className="fa-solid fa-trash text-xs"></i></button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* AUDIT LOGS SECTION - SUPABASE DIRECT */}
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6">
                    
                    {/* Log Header & Controls */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-6">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-orange-600 mb-1">
                                <i className="fa-solid fa-[#FF6B00] fa-shield-halved"></i> Supabase Audit Logs
                            </div>
                            <h2 className="text-2xl font-black text-gray-900">System Logs & Event History</h2>
                        </div>

                        {/* Search & Export Buttons */}
                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                            <div className="relative flex-1 md:w-64">
                                <input
                                    type="text"
                                    value={logSearchQuery}
                                    onChange={(e) => setLogSearchQuery(e.target.value)}
                                    placeholder="Search logs..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 pl-9 text-xs font-medium focus:outline-none focus:border-orange-500"
                                />
                                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                            </div>

                            {activeLogTab === 'events' ? (
                                <>
                                    <button
                                        onClick={() => exportLogsToCSV(eventLogs, 'supabase_event_logs')}
                                        className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition flex items-center gap-1.5"
                                    >
                                        <i className="fa-solid fa-file-export"></i> Export CSV
                                    </button>
                                    <button
                                        onClick={clearEventLogs}
                                        className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 transition flex items-center gap-1.5"
                                    >
                                        <i className="fa-solid fa-broom"></i> Clear
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => exportLogsToCSV(adminLogs, 'supabase_admin_logs')}
                                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 transition flex items-center gap-1.5"
                                    >
                                        <i className="fa-solid fa-file-export"></i> Export CSV
                                    </button>
                                    <button
                                        onClick={clearAdminLogs}
                                        className="bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 transition flex items-center gap-1.5"
                                    >
                                        <i className="fa-solid fa-broom"></i> Clear
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Log Tabs */}
                    <div className="flex border-b border-gray-100 gap-2">
                        <button
                            onClick={() => setActiveLogTab('events')}
                            className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition ${activeLogTab === 'events' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            <i className="fa-solid fa-bolt"></i> Bid & Player Event Logs
                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px]">{eventLogs.length}</span>
                        </button>

                        <button
                            onClick={() => setActiveLogTab('admin')}
                            className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition ${activeLogTab === 'admin' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                        >
                            <i className="fa-solid fa-user-gear"></i> Admin Activity & Auth Logs
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px]">{adminLogs.length}</span>
                        </button>
                    </div>

                    {/* TABLE 1: EVENT LOGS */}
                    {activeLogTab === 'events' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="text-[10px] uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Timestamp</th>
                                        <th className="px-4 py-3 font-bold">Event Type</th>
                                        <th className="px-4 py-3 font-bold">Player Name</th>
                                        <th className="px-4 py-3 font-bold">Team</th>
                                        <th className="px-4 py-3 font-bold text-right">Bid (₹)</th>
                                        <th className="px-4 py-3 font-bold">Event Diff Summary</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredEventLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-12 text-center text-gray-400 italic bg-gray-50/50">
                                                No bid event logs found in Supabase. Actions like creating, updating, or deleting bids will record audit logs here.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredEventLogs.map(log => {
                                            let badgeStyle = 'bg-gray-100 text-gray-700 border-gray-200';
                                            if (log.eventType === 'CREATED') badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                                            else if (log.eventType === 'UPDATED') badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
                                            else if (log.eventType === 'DELETED') badgeStyle = 'bg-rose-100 text-rose-800 border-rose-200';
                                            else if (log.eventType === 'BULK_IMPORT') badgeStyle = 'bg-amber-100 text-amber-800 border-amber-200';
                                            else if (log.eventType === 'CLEAR_ALL') badgeStyle = 'bg-purple-100 text-purple-800 border-purple-200';

                                            return (
                                                <tr key={log.id} className="hover:bg-orange-50/30 transition">
                                                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-500">{log.timestamp}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${badgeStyle}`}>
                                                            {log.eventType}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-bold text-gray-900">{log.playerName}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-600">{log.team}</td>
                                                    <td className="px-4 py-3 font-black text-orange-600 text-right whitespace-nowrap">
                                                        {log.bidAmount > 0 ? `₹${log.bidAmount.toLocaleString('en-IN')}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 font-medium">{log.diffSummary}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* TABLE 2: ADMIN ACTIVITY LOGS */}
                    {activeLogTab === 'admin' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="text-[10px] uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Timestamp</th>
                                        <th className="px-4 py-3 font-bold">Action</th>
                                        <th className="px-4 py-3 font-bold">Details</th>
                                        <th className="px-4 py-3 font-bold">Admin User</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredAdminLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="px-4 py-12 text-center text-gray-400 italic bg-gray-50/50">
                                                No admin activity logs recorded in Supabase yet. Admin login sessions and actions will be tracked here.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAdminLogs.map(log => {
                                            let badgeStyle = 'bg-gray-100 text-gray-700 border-gray-200';
                                            if (log.action === 'LOGIN') badgeStyle = 'bg-teal-100 text-teal-800 border-teal-200';
                                            else if (log.action === 'LOGOUT') badgeStyle = 'bg-gray-200 text-gray-800 border-gray-300';
                                            else if (log.action === 'CSV_UPLOAD') badgeStyle = 'bg-indigo-100 text-indigo-800 border-indigo-200';
                                            else if (log.action === 'ADD_BID') badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                                            else if (log.action === 'EDIT_BID') badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
                                            else if (log.action === 'DELETE_PLAYER') badgeStyle = 'bg-rose-100 text-rose-800 border-rose-200';
                                            else if (log.action === 'CLEAR_ALL') badgeStyle = 'bg-purple-100 text-purple-800 border-purple-200';

                                            return (
                                                <tr key={log.id} className="hover:bg-indigo-50/30 transition">
                                                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-500">{log.timestamp}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${badgeStyle}`}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-800 font-medium">{log.details}</td>
                                                    <td className="px-4 py-3 font-bold text-gray-600 whitespace-nowrap">{log.user}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Admin;
