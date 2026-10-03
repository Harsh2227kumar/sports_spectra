import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { ADMIN_BASE } from '../utils/paths';
import {
  supabase,
  checkDatabaseConnection,
  getLocalPlayersRegistry,
  saveLocalPlayersRegistry,
  getLocalTeamBids,
  getLocalTeams,
  saveLocalTeams,
  updateCustomSupabaseCredentials,
  getSupabaseConfig,
  sanitizeCsvCell,
  logActivityToSupabase,
  SUPABASE_SETUP_SQL
} from '../supabaseClient';

export default function DataImportExport() {
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

  // Database status
  const [dbStatus, setDbStatus] = useState({ loading: true, connected: false, latency: 0, message: '' });
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configInputUrl, setConfigInputUrl] = useState(() => getSupabaseConfig().url);
  const [configInputKey, setConfigInputKey] = useState(() => getSupabaseConfig().key);

  // Master Players List (lazy initialized from cache)
  const [allPlayers, setAllPlayers] = useState(() => {
    return getLocalPlayersRegistry().map(p => ({
      id: p.id,
      name: p.name,
      gender: p.gender || 'M',
      year: p.year || '',
      section: p.section || '',
      sports: p.sports || '',
      phone: p.phone_no || p.phone || p.phone_number || '',
      phone_no: p.phone_no || p.phone || p.phone_number || '',
      photo_url: p.photo_url || p.photoUrl || ''
    }));
  });

  // CSV Import State
  const [csvFile, setCsvFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validationReport, setValidationReport] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  const [updateExistingOption, setUpdateExistingOption] = useState(true);
  const [showImportConfirmModal, setShowImportConfirmModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importNotification, setImportNotification] = useState(null);
  const fileInputRef = useRef(null);

  // Edit Player State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    gender: 'M',
    year: '',
    section: '',
    sports: '',
    phone_no: '',
    photo_url: ''
  });
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [editSuccessMessage, setEditSuccessMessage] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Franchise Teams Management State
  const [teamsList, setTeamsList] = useState(() => getLocalTeams());
  const [selectedTeamConfig, setSelectedTeamConfig] = useState(null);
  const [teamConfigSuccessMsg, setTeamConfigSuccessMsg] = useState(null);

  // Check DB Connection & load players
  const refreshDbStatus = async () => {
    setDbStatus(prev => ({ ...prev, loading: true }));
    const status = await checkDatabaseConnection();
    setDbStatus({ ...status, loading: false });
  };

  const loadTeamsFromDb = async () => {
    try {
      const { data, error } = await supabase.from('teams').select('*').order('display_order');
      if (!error && data && data.length > 0) {
        setTeamsList(data);
        saveLocalTeams(data);
      } else {
        setTeamsList(getLocalTeams());
      }
    } catch {
      setTeamsList(getLocalTeams());
    }
  };

  const handleSaveTeamConfig = async (e) => {
    e.preventDefault();
    if (!selectedTeamConfig) return;

    try {
      const updateData = {
        total_purse: Number(selectedTeamConfig.total_purse || 10000),
        captain_name: selectedTeamConfig.captain_name || '',
        captain_gender: selectedTeamConfig.captain_gender || 'M',
        captain_photo: selectedTeamConfig.captain_photo || '',
        vice_captain_name: selectedTeamConfig.vice_captain_name || '',
        vice_captain_gender: selectedTeamConfig.vice_captain_gender || 'F',
        vice_captain_photo: selectedTeamConfig.vice_captain_photo || '',
        color: selectedTeamConfig.color || 'bg-orange-500'
      };

      await supabase.from('teams').update(updateData).eq('name', selectedTeamConfig.name);

      const nextTeams = teamsList.map(t => {
        if (t.name === selectedTeamConfig.name) {
          return { ...t, ...updateData };
        }
        return t;
      });
      setTeamsList(nextTeams);
      saveLocalTeams(nextTeams);

      await logActivityToSupabase({
        action_type: 'UPDATED',
        category: 'FRANCHISE',
        details: `Updated team configuration for ${selectedTeamConfig.name}`
      });

      setTeamConfigSuccessMsg(`Configuration for ${selectedTeamConfig.name} saved to database!`);
      setTimeout(() => setTeamConfigSuccessMsg(null), 4000);
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      alert(`Error saving team: ${err.message}`);
    }
  };

  const loadPlayersFromDb = async () => {
    try {
      const { data, error } = await supabase.from('players').select('*');
      if (!error && data) {
        const mapped = data.map(p => ({
          id: p.id,
          name: p.name,
          gender: p.gender || 'M',
          year: p.year || '',
          section: p.section || '',
          sports: p.sports || '',
          phone: p.phone_no || p.phone || p.phone_number || '',
          phone_no: p.phone_no || p.phone || p.phone_number || '',
          photo_url: p.photo_url || p.photoUrl || ''
        }));
        setAllPlayers(mapped);
        saveLocalPlayersRegistry(mapped);
      }
    } catch (err) {
      console.warn('[Sports Spectra] Error loading players from DB:', err);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const init = async () => {
      if (isAuthenticated && !isCancelled) {
        await refreshDbStatus();
        await loadPlayersFromDb();
        await loadTeamsFromDb();
      }
    };
    init();
    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated]);

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

  // CSV Upload & Pre-import Validation
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    processCsvFile(file);
  };

  const processCsvFile = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const raw = results.data;
        const normalized = [];
        const seenInFile = new Set();
        const existingNamesInDb = new Set(allPlayers.map(p => p.name.trim().toLowerCase()));

        let validCount = 0;
        let duplicateInFileCount = 0;
        let existingInDbCount = 0;
        let errorCount = 0;

        raw.forEach((row, index) => {
          const obj = {
            _rowNumber: index + 2,
            name: '',
            gender: 'M',
            year: '',
            section: '',
            sports: '',
            phone: '',
            photo_url: '',
            status: 'valid',
            messages: []
          };

          for (const key of Object.keys(row)) {
            const k = key.trim().toLowerCase();
            const val = String(row[key] || '').trim();
            if (k === 'name' || k === 'player name' || k === 'playername' || k === 'player') obj.name = val;
            else if (k === 'gender' || k === 'sex') {
              const char = val.toUpperCase().charAt(0);
              obj.gender = (char === 'F' || char === 'FEMALE') ? 'F' : 'M';
            }
            else if (k === 'year' || k === 'yr' || k === 'batch') obj.year = val;
            else if (k === 'section' || k === 'sec') obj.section = val;
            else if (k === 'phone' || k === 'phone no' || k === 'phone_no' || k === 'phoneno' || k === 'phone number' || k === 'mobile' || k === 'mobile no' || k === 'contact' || k === 'contact no') {
              obj.phone = val;
            }
            else if (k === 'sport' || k === 'sport 1' || k === 'sport1' || k === 'sports') {
              obj.sports = obj.sports ? `${obj.sports}, ${val}` : val;
            }
            else if (k === 'sport 2' || k === 'sport2') {
              obj.sports = obj.sports ? `${obj.sports}, ${val}` : val;
            }
            else if (k === 'photo' || k === 'photo url' || k === 'photourl' || k === 'image') obj.photo_url = val;
          }

          // Duplicate & Error checks
          if (!obj.name) {
            obj.status = 'error';
            obj.messages.push('Missing player name');
            errorCount++;
          } else {
            const lowerName = obj.name.toLowerCase();
            if (seenInFile.has(lowerName)) {
              obj.status = 'duplicate_file';
              obj.messages.push('Duplicate entry within this CSV file');
              duplicateInFileCount++;
            } else {
              seenInFile.add(lowerName);
              if (existingNamesInDb.has(lowerName)) {
                obj.status = 'existing_db';
                obj.messages.push('Already exists in database registry');
                existingInDbCount++;
              } else {
                obj.status = 'valid';
                validCount++;
              }
            }
          }

          normalized.push(obj);
        });

        setParsedRows(normalized);
        setValidationReport({
          totalRows: normalized.length,
          validCount,
          duplicateInFileCount,
          existingInDbCount,
          errorCount,
          canImport: validCount > 0 || (existingInDbCount > 0 && updateExistingOption)
        });
      },
      error: (err) => {
        setImportNotification({ type: 'error', message: `CSV Parsing Error: ${err.message}` });
      }
    });
  };

  const handleConfirmImport = async () => {
    setIsImporting(true);
    setShowImportConfirmModal(false);

    try {
      const rowsToInsert = [];
      const rowsToUpdate = [];

      parsedRows.forEach(row => {
        if (row.status === 'valid') {
          rowsToInsert.push({
            name: row.name,
            gender: row.gender,
            year: row.year,
            section: row.section,
            sports: row.sports,
            phone_no: row.phone || '',
            photo_url: row.photo_url,
            team: 'UNSOLD',
            role: 'Player',
            bid_amount: 0
          });
        } else if (row.status === 'existing_db' && updateExistingOption) {
          rowsToUpdate.push({
            name: row.name,
            gender: row.gender,
            year: row.year,
            section: row.section,
            sports: row.sports,
            phone_no: row.phone || '',
            photo_url: row.photo_url
          });
        }
      });

      let insertedCount = 0;
      let updatedCount = 0;

      if (rowsToInsert.length > 0) {
        const { error: insErr } = await supabase.from('players').insert(rowsToInsert);
        if (insErr) throw insErr;
        insertedCount = rowsToInsert.length;
      }

      if (rowsToUpdate.length > 0) {
        for (const r of rowsToUpdate) {
          const updatePayload = {
            gender: r.gender,
            year: r.year,
            section: r.section,
            sports: r.sports,
            photo_url: r.photo_url
          };
          if (r.phone_no) {
            updatePayload.phone_no = r.phone_no;
          }
          await supabase.from('players').update(updatePayload).eq('name', r.name);
          updatedCount++;
        }
      }

      // Log to Supabase Activity Logs table
      await logActivityToSupabase({
        action_type: 'ENTERED',
        category: 'IMPORT',
        details: `Imported ${insertedCount} new players and updated ${updatedCount} players via CSV`
      });

      // Reload database
      await loadPlayersFromDb();
      window.dispatchEvent(new Event('storage'));

      setImportNotification({
        type: 'success',
        message: `Successfully processed CSV! Inserted ${insertedCount} new players and updated ${updatedCount} existing records.`
      });

      // Reset file input and preview
      setCsvFile(null);
      setParsedRows([]);
      setValidationReport(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setImportNotification({
        type: 'error',
        message: `Import failed: ${err.message || 'Unknown database error'}`
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Export handlers
  const exportPlayersCsv = () => {
    if (allPlayers.length === 0) {
      alert('No player data available to export.');
      return;
    }
    const csv = Papa.unparse(allPlayers.map(p => ({
      ID: sanitizeCsvCell(p.id),
      Name: sanitizeCsvCell(p.name),
      Gender: sanitizeCsvCell(p.gender),
      Year: sanitizeCsvCell(p.year),
      Section: sanitizeCsvCell(p.section),
      Sports: sanitizeCsvCell(p.sports),
      Phone_No: sanitizeCsvCell(p.phone_no || p.phone || ''),
      Photo_URL: sanitizeCsvCell(p.photo_url || '')
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sports_spectra_players_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportBidsCsv = () => {
    const bids = getLocalTeamBids();
    if (bids.length === 0) {
      alert('No auction bid data available to export.');
      return;
    }
    const csv = Papa.unparse(bids.map(b => ({
      Bid_ID: sanitizeCsvCell(b.id),
      Player_Name: sanitizeCsvCell(b.player_name),
      Team: sanitizeCsvCell(b.team),
      Role: sanitizeCsvCell(b.role),
      Bid_Amount: sanitizeCsvCell(b.bid_amount),
      Created_At: sanitizeCsvCell(b.created_at || '')
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sports_spectra_bids_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Edit Player Personal Details
  const handleSelectPlayerForEdit = (player) => {
    setSelectedPlayer(player);
    setEditFormData({
      name: player.name,
      gender: player.gender || 'M',
      year: player.year || '',
      section: player.section || '',
      sports: player.sports || '',
      phone_no: player.phone_no || player.phone || '',
      photo_url: player.photo_url || ''
    });
    setEditSuccessMessage(null);
  };

  const handleEditFormSubmit = (e) => {
    e.preventDefault();
    setShowEditConfirmModal(true);
  };

  const confirmPushPlayerUpdate = async () => {
    if (!selectedPlayer) return;
    setIsUpdating(true);
    setShowEditConfirmModal(false);

    try {
      const updatedFields = {
        name: editFormData.name.trim(),
        gender: editFormData.gender,
        year: editFormData.year.trim(),
        section: editFormData.section.trim(),
        sports: editFormData.sports.trim(),
        phone_no: editFormData.phone_no.trim(),
        photo_url: editFormData.photo_url.trim()
      };

      // Push to Supabase
      const { error } = await supabase
        .from('players')
        .update(updatedFields)
        .eq('name', selectedPlayer.name);

      if (error) throw error;

      // Log to Supabase Activity Logs table
      await logActivityToSupabase({
        action_type: 'UPDATED',
        category: 'REGISTRY',
        details: `Updated personal details for player ${updatedFields.name}`
      });

      // Update local storage
      const currentList = getLocalPlayersRegistry();
      const nextList = currentList.map(p => {
        if (p.name.toLowerCase() === selectedPlayer.name.toLowerCase()) {
          return { ...p, ...updatedFields };
        }
        return p;
      });
      saveLocalPlayersRegistry(nextList);
      setAllPlayers(nextList);
      setSelectedPlayer({ ...selectedPlayer, ...updatedFields });

      setEditSuccessMessage(`Personal details for "${updatedFields.name}" have been updated successfully!`);
      setTimeout(() => setEditSuccessMessage(null), 5000);
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Filtered preview rows
  const filteredPreviewRows = parsedRows.filter(row => {
    if (filterTab === 'valid') return row.status === 'valid';
    if (filterTab === 'duplicates') return row.status === 'duplicate_file' || row.status === 'existing_db';
    if (filterTab === 'errors') return row.status === 'error';
    return true;
  });

  // Filtered players search for edit
  const searchResults = searchQuery.trim().length >= 1
    ? allPlayers.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10)
    : [];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 text-orange-500 text-3xl shadow-inner">
            <i className="fa-solid fa-file-import"></i>
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">Import / Export Access</h1>
          <p className="text-gray-500 text-sm mb-8">Enter admin password to manage player data, CSV imports, and database schemas.</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="space-y-3">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setLoginError(false);
                }}
                placeholder="Admin Email"
                className={`w-full bg-gray-50 border ${loginError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'} rounded-xl p-4 text-center font-medium focus:outline-none transition`}
                required
                autoFocus
              />
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setLoginError(false);
                }}
                placeholder="Password"
                className={`w-full bg-gray-50 border ${loginError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-orange-500'} rounded-xl p-4 text-center font-medium focus:outline-none transition`}
                required
              />
              {loginError && <p className="text-red-500 text-xs font-bold mt-2">Invalid email or password.</p>}
            </div>
            <button type="submit" disabled={loginLoading} className={`w-full text-white font-bold text-lg py-4 rounded-xl transition shadow-lg mt-2 cursor-pointer ${loginLoading ? 'bg-gray-400 cursor-not-allowed shadow-none' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-200'}`}>
              {loginLoading ? 'Authenticating...' : 'Access Data Manager'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* TOP NAVIGATION BAR */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="bg-orange-500 text-white p-2 sm:p-2.5 rounded-xl shadow-xs shrink-0">
              <i className="fa-solid fa-database text-base sm:text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-gray-900 text-base sm:text-lg tracking-tight">SPORTS SPECTRA 4.0</span>
                <span className="bg-orange-100 text-orange-700 text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full">Data Center</span>
              </div>
              <p className="text-[11px] sm:text-xs text-gray-500">Player Data Import/Export & Registry Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full sm:w-auto">
            <Link to={ADMIN_BASE} className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-1.5 sm:gap-2">
              <i className="fa-solid fa-gavel text-orange-500"></i> Bidding Desk
            </Link>
            <Link to="/auction" className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center gap-1.5 sm:gap-2">
              <i className="fa-solid fa-trophy text-orange-500"></i> Live Dashboard
            </Link>
            <button onClick={handleLogout} className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition flex items-center gap-1 cursor-pointer ml-auto sm:ml-0">
              <i className="fa-solid fa-right-from-bracket"></i> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3.5 sm:px-6 pt-4 sm:pt-8 flex flex-col gap-6 sm:gap-8">
        {/* DATABASE STATUS BAR */}
        <section className="bg-white rounded-2xl p-4 sm:p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-lg sm:text-xl shrink-0 ${dbStatus.loading ? 'bg-blue-50 text-blue-500' :
              dbStatus.connected ? 'bg-emerald-50 text-emerald-600' :
                'bg-amber-50 text-amber-600'
              }`}>
              <i className={`fa-solid ${dbStatus.loading ? 'fa-spinner fa-spin' :
                dbStatus.connected ? 'fa-check-circle' :
                  'fa-hard-drive'
                }`}></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">Database Status</h3>
                {dbStatus.loading ? (
                  <span className="bg-blue-100 text-blue-800 text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span> Testing...
                  </span>
                ) : dbStatus.connected ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Supabase Connected
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-800 text-[10px] sm:text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Local Storage / Mock Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {dbStatus.connected
                  ? `Fast response time enabled. ${allPlayers.length} players registered in database.`
                  : dbStatus.message || 'Using in-browser local storage mock with real-time capabilities.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto flex-wrap">
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3 sm:px-4 py-2 text-xs font-bold bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-xl transition flex items-center gap-1.5 sm:gap-2 cursor-pointer shadow-xs"
            >
              <i className="fa-solid fa-gear text-orange-500"></i>
              Configure
            </button>
            <button
              onClick={() => { refreshDbStatus(); loadPlayersFromDb(); }}
              disabled={dbStatus.loading}
              className="px-3 sm:px-4 py-2 text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition flex items-center gap-1.5 sm:gap-2 cursor-pointer disabled:opacity-50"
            >
              <i className={`fa-solid fa-arrows-rotate ${dbStatus.loading ? 'fa-spin' : ''}`}></i>
              Refresh
            </button>
            <button
              onClick={() => setShowSqlModal(true)}
              className="px-3 sm:px-4 py-2 text-xs font-bold bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 rounded-xl transition flex items-center gap-1.5 sm:gap-2 cursor-pointer"
            >
              <i className="fa-solid fa-code"></i>
              SQL Helper
            </button>
          </div>
        </section>

        {/* NOTIFICATION BANNER */}
        {importNotification && (
          <div className={`p-4 rounded-2xl flex items-center justify-between border ${importNotification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
            }`}>
            <div className="flex items-center gap-3">
              <i className={`fa-solid text-lg ${importNotification.type === 'success' ? 'fa-circle-check text-emerald-500' : 'fa-triangle-exclamation text-red-500'}`}></i>
              <span className="text-sm font-semibold">{importNotification.message}</span>
            </div>
            <button onClick={() => setImportNotification(null)} className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT COLUMN: IMPORT & EXPORT */}
          <div className="lg:col-span-7 flex flex-col gap-8">

            {/* 1. CSV IMPORT SECTION */}
            <section className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <i className="fa-solid fa-file-csv text-orange-500"></i> Import Players from CSV
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Upload CSV roster with pre-import validation for duplicate detection and formatting.</p>
                </div>
                <span className="text-xs font-bold bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
                  Step 1
                </span>
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-orange-400 rounded-2xl p-8 text-center cursor-pointer transition bg-gray-50/50 hover:bg-orange-50/20 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-400 group-hover:text-orange-500 group-hover:scale-110 transition shadow-sm border border-gray-200">
                  <i className="fa-solid fa-cloud-arrow-up text-2xl"></i>
                </div>
                <h4 className="text-sm font-bold text-gray-800">
                  {csvFile ? csvFile.name : 'Click to upload or drag & drop CSV file'}
                </h4>
                <p className="text-xs text-gray-400 mt-1">
                  Supported columns: <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Name</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Gender</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Phone No</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Year</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Section</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Sports</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">Photo URL</code>
                </p>
              </div>

              {/* Validation Summary Cards */}
              {validationReport && (
                <div className="mt-6 flex flex-col gap-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                      <span className="text-[10px] uppercase font-bold text-gray-500">Total Rows</span>
                      <p className="text-lg font-black text-gray-800">{validationReport.totalRows}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <span className="text-[10px] uppercase font-bold text-emerald-600">New & Ready</span>
                      <p className="text-lg font-black text-emerald-700">{validationReport.validCount}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                      <span className="text-[10px] uppercase font-bold text-amber-600">In Database</span>
                      <p className="text-lg font-black text-amber-700">{validationReport.existingInDbCount}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <span className="text-[10px] uppercase font-bold text-red-600">Issues / Errors</span>
                      <p className="text-lg font-black text-red-700">{validationReport.errorCount + validationReport.duplicateInFileCount}</p>
                    </div>
                  </div>

                  {/* Filter tabs */}
                  <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-2 pt-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFilterTab('all')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition ${filterTab === 'all' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        All ({parsedRows.length})
                      </button>
                      <button
                        onClick={() => setFilterTab('valid')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition ${filterTab === 'valid' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
                      >
                        Ready ({validationReport.validCount})
                      </button>
                      <button
                        onClick={() => setFilterTab('duplicates')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition ${filterTab === 'duplicates' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-50'}`}
                      >
                        Duplicates ({validationReport.existingInDbCount + validationReport.duplicateInFileCount})
                      </button>
                      <button
                        onClick={() => setFilterTab('errors')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition ${filterTab === 'errors' ? 'bg-red-600 text-white' : 'text-red-700 hover:bg-red-50'}`}
                      >
                        Errors ({validationReport.errorCount})
                      </button>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="max-h-[260px] overflow-y-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 font-bold text-gray-600 uppercase text-[10px]">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">Name</th>
                          <th className="p-3">Gender</th>
                          <th className="p-3">Contact / Phone</th>
                          <th className="p-3">Yr/Sec</th>
                          <th className="p-3">Sports</th>
                          <th className="p-3">Validation Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {filteredPreviewRows.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="p-6 text-center text-gray-400">No rows matching this filter.</td>
                          </tr>
                        ) : (
                          filteredPreviewRows.map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="p-3 text-gray-400">{r._rowNumber}</td>
                              <td className="p-3 font-bold text-gray-900">{r.name || '<Empty>'}</td>
                              <td className="p-3">{r.gender}</td>
                              <td className="p-3">
                                {r.phone ? (
                                  <span className="font-mono text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1">
                                    <i className="fa-solid fa-phone text-[9px]"></i> {r.phone}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 italic text-[11px]">None</span>
                                )}
                              </td>
                              <td className="p-3">{r.year || '-'} / {r.section || '-'}</td>
                              <td className="p-3 max-w-[140px] truncate">{r.sports || '-'}</td>
                              <td className="p-3">
                                {r.status === 'valid' && (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                    Ready
                                  </span>
                                )}
                                {r.status === 'existing_db' && (
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                    Exists in DB
                                  </span>
                                )}
                                {r.status === 'duplicate_file' && (
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                    File Duplicate
                                  </span>
                                )}
                                {r.status === 'error' && (
                                  <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                    {r.messages[0] || 'Error'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Overwrite option & Action buttons */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={updateExistingOption}
                        onChange={(e) => setUpdateExistingOption(e.target.checked)}
                        className="rounded text-orange-500 focus:ring-orange-500 w-4 h-4"
                      />
                      <span>Update details for players already in database</span>
                    </label>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setCsvFile(null);
                          setParsedRows([]);
                          setValidationReport(null);
                        }}
                        className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setShowImportConfirmModal(true)}
                        disabled={!validationReport.canImport || isImporting}
                        className="px-6 py-2.5 text-xs font-bold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl transition shadow-md shadow-orange-200 flex items-center gap-2 cursor-pointer"
                      >
                        <i className="fa-solid fa-cloud-arrow-up"></i>
                        {isImporting ? 'Importing...' : 'Confirm & Import to Database'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 2. EXPORT SECTION */}
            <section className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <i className="fa-solid fa-file-export text-orange-500"></i> Export Data
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Download live player rosters and franchise auction data as CSV files.</p>
                </div>
                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                  Exports
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-2xl p-5 flex flex-col justify-between hover:border-orange-300 transition bg-gray-50/30">
                  <div>
                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center text-lg mb-3">
                      <i className="fa-solid fa-users"></i>
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Player Master Registry</h3>
                    <p className="text-xs text-gray-500 mt-1">Contains all registered players with personal details ({allPlayers.length} total).</p>
                  </div>
                  <button
                    onClick={exportPlayersCsv}
                    className="mt-4 w-full py-2.5 px-4 text-xs font-bold bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-download"></i> Download Players CSV
                  </button>
                </div>

                <div className="border border-gray-200 rounded-2xl p-5 flex flex-col justify-between hover:border-orange-300 transition bg-gray-50/30">
                  <div>
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-lg mb-3">
                      <i className="fa-solid fa-gavel"></i>
                    </div>
                    <h3 className="font-bold text-gray-900 text-sm">Auction Bids & Squads</h3>
                    <p className="text-xs text-gray-500 mt-1">Export drafted team rosters and winning bid records across all 8 franchises.</p>
                  </div>
                  <button
                    onClick={exportBidsCsv}
                    className="mt-4 w-full py-2.5 px-4 text-xs font-bold bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-download"></i> Download Bids CSV
                  </button>
                </div>
              </div>
            </section>

            {/* 3. FRANCHISES & TEAMS CONFIGURATION SECTION */}
            <section className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <i className="fa-solid fa-shield-halved text-orange-500"></i> Franchise Teams & Budgets
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Configure franchise total purse, captain and vice-captain retained leaders in the database.</p>
                </div>
                <span className="text-xs font-bold bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                  Franchises ({teamsList.length})
                </span>
              </div>

              {teamConfigSuccessMsg && (
                <div className="mb-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                  <i className="fa-solid fa-check-circle text-emerald-500"></i>
                  {teamConfigSuccessMsg}
                </div>
              )}

              {/* Franchise Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {teamsList.map(t => (
                  <div
                    key={t.name}
                    onClick={() => setSelectedTeamConfig({ ...t })}
                    className={`p-3 rounded-xl border text-center cursor-pointer transition flex flex-col items-center justify-between ${selectedTeamConfig?.name === t.name
                      ? 'border-orange-500 bg-orange-50/50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-gray-50/30'
                      }`}
                  >
                    <div className="w-10 h-10 mb-2">
                      <img src={t.logo_url || '/logo1.png'} alt="" className="w-full h-full object-contain" />
                    </div>
                    <span className="font-bold text-gray-900 text-xs">{t.name}</span>
                    <span className="text-[10px] font-bold text-green-600 mt-1">₹{Number(t.total_purse || 10000).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>

              {/* Selected Franchise Config Editor */}
              {selectedTeamConfig ? (
                <form onSubmit={handleSaveTeamConfig} className="bg-gray-50/70 rounded-2xl p-5 border border-gray-200 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-gray-200 pb-3">
                    <span className="text-sm font-black text-gray-900">Editing {selectedTeamConfig.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTeamConfig(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Close Editor
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Total Franchise Purse (₹)</label>
                      <input
                        type="number"
                        value={selectedTeamConfig.total_purse}
                        onChange={(e) => setSelectedTeamConfig({ ...selectedTeamConfig, total_purse: Number(e.target.value) })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-bold"
                        required
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Theme Color Class</label>
                      <input
                        type="text"
                        value={selectedTeamConfig.color || ''}
                        onChange={(e) => setSelectedTeamConfig({ ...selectedTeamConfig, color: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-medium"
                        placeholder="bg-orange-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Captain Name</label>
                      <input
                        type="text"
                        value={selectedTeamConfig.captain_name || ''}
                        onChange={(e) => setSelectedTeamConfig({ ...selectedTeamConfig, captain_name: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-medium"
                        placeholder="e.g. Atharva Anil Masharkar"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Captain Gender</label>
                      <select
                        value={selectedTeamConfig.captain_gender || 'M'}
                        onChange={(e) => setSelectedTeamConfig({ ...selectedTeamConfig, captain_gender: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-medium"
                      >
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Vice-Captain Name</label>
                      <input
                        type="text"
                        value={selectedTeamConfig.vice_captain_name || ''}
                        onChange={(e) => setSelectedTeamConfig({ ...selectedTeamConfig, vice_captain_name: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-medium"
                        placeholder="e.g. SHRIYA YERANE"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Vice-Captain Gender</label>
                      <select
                        value={selectedTeamConfig.vice_captain_gender || 'F'}
                        onChange={(e) => setSelectedTeamConfig({ ...selectedTeamConfig, vice_captain_gender: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-medium"
                      >
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="submit"
                      className="px-5 py-2.5 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition shadow-sm cursor-pointer"
                    >
                      Save Team to Database
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">Click any franchise card above to edit its total budget or leaders.</p>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN: EDIT PERSONAL DETAILS */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            <section className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200 shadow-sm sticky top-24">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    <i className="fa-solid fa-user-pen text-orange-500"></i> Edit Personal Details
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">Correct typos or personal info for imported players.</p>
                </div>
                <span className="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                  Editor
                </span>
              </div>

              {/* Protected Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-6 flex items-start gap-2.5">
                <i className="fa-solid fa-shield-halved text-amber-500 text-sm mt-0.5 shrink-0"></i>
                <span>
                  <strong>Strict Security:</strong> Only personal details (name, gender, batch, section, sports, photo) can be edited here. Bid amounts & franchise drafting must be managed on the <strong>Auction Bidding</strong> panel.
                </span>
              </div>

              {/* Player Search Bar */}
              <div className="mb-6 relative">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Search Player to Edit</label>
                <div className="relative">
                  <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-3.5 text-gray-400 text-xs"></i>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by player name..."
                    className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-orange-500 transition"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 text-xs cursor-pointer">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>

                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto z-30 divide-y divide-gray-100">
                    {searchResults.map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          handleSelectPlayerForEdit(p);
                          setSearchQuery('');
                        }}
                        className="p-3 hover:bg-orange-50/50 cursor-pointer flex items-center justify-between transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 overflow-hidden">
                            {p.photo_url ? <img src={p.photo_url} alt="" className="w-full h-full object-cover" /> : p.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-xs">{p.name}</p>
                            <p className="text-[10px] text-gray-400">{p.gender} • {p.year || 'N/A'} • {p.section || 'N/A'}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-orange-500 uppercase">Select</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit Form */}
              {selectedPlayer ? (
                <form onSubmit={handleEditFormSubmit} className="flex flex-col gap-4">
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Editing Record ID:</span>
                    <span className="text-xs font-mono font-bold text-gray-800">{selectedPlayer.id}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Player Full Name</label>
                    <input
                      type="text"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      required
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Gender</label>
                      <select
                        value={editFormData.gender}
                        onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-orange-500"
                      >
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Year</label>
                      <input
                        type="text"
                        value={editFormData.year}
                        onChange={(e) => setEditFormData({ ...editFormData, year: e.target.value })}
                        placeholder="e.g. 2nd"
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Section</label>
                      <input
                        type="text"
                        value={editFormData.section}
                        onChange={(e) => setEditFormData({ ...editFormData, section: e.target.value })}
                        placeholder="e.g. A"
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Sports Played</label>
                    <input
                      type="text"
                      value={editFormData.sports}
                      onChange={(e) => setEditFormData({ ...editFormData, sports: e.target.value })}
                      placeholder="e.g. Cricket, Football"
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={editFormData.phone_no}
                      onChange={(e) => setEditFormData({ ...editFormData, phone_no: e.target.value })}
                      placeholder="e.g. +91 9876543210"
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Photo URL</label>
                    <input
                      type="url"
                      value={editFormData.photo_url}
                      onChange={(e) => setEditFormData({ ...editFormData, photo_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {editSuccessMessage && (
                    <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                      <i className="fa-solid fa-check-circle text-emerald-500"></i>
                      {editSuccessMessage}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(null)}
                      className="flex-1 py-3 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="flex-2 py-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition shadow-md shadow-blue-200 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className="fa-solid fa-paper-plane"></i>
                      {isUpdating ? 'Saving...' : 'Push Update to DB'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="py-12 px-6 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                  <i className="fa-solid fa-user-gear text-3xl mb-3 text-gray-300"></i>
                  <p className="text-xs font-bold text-gray-600">No Player Selected</p>
                  <p className="text-[11px] text-gray-400 mt-1">Search for any player above to inspect and edit their personal information.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* CONFIRM IMPORT MODAL */}
      {showImportConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl">
            <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
              <i className="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <h3 className="text-xl font-black text-center text-gray-900 mb-2">Confirm CSV Import</h3>
            <p className="text-xs text-gray-500 text-center mb-6">
              You are about to import <strong className="text-gray-800">{validationReport?.validCount}</strong> new players
              {updateExistingOption && validationReport?.existingInDbCount > 0 ? ` and update ${validationReport.existingInDbCount} existing players` : ''}.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowImportConfirmModal(false)}
                className="flex-1 py-3 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 py-3 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition shadow-lg shadow-orange-200 cursor-pointer"
              >
                Proceed with Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM PUSH EDIT MODAL */}
      {showEditConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl">
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4">
              <i className="fa-solid fa-user-check"></i>
            </div>
            <h3 className="text-xl font-black text-center text-gray-900 mb-2">Confirm Personal Details Update</h3>
            <p className="text-xs text-gray-500 text-center mb-6">
              Are you sure you want to push these changes for <strong>{editFormData.name}</strong> to the database? This updates personal records across all dashboards.
            </p>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs mb-6 flex flex-col gap-1.5">
              <div><span className="text-gray-400">Gender:</span> <strong className="text-gray-800">{editFormData.gender}</strong></div>
              <div><span className="text-gray-400">Phone No:</span> <strong className="text-gray-800">{editFormData.phone_no || 'None'}</strong></div>
              <div><span className="text-gray-400">Batch / Section:</span> <strong className="text-gray-800">{editFormData.year || '-'} / {editFormData.section || '-'}</strong></div>
              <div><span className="text-gray-400">Sports:</span> <strong className="text-gray-800">{editFormData.sports || '-'}</strong></div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEditConfirmModal(false)}
                className="flex-1 py-3 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmPushPlayerUpdate}
                className="flex-1 py-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition shadow-lg shadow-blue-200 cursor-pointer"
              >
                Confirm & Push Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL SCHEMA HELPER MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-database text-orange-500"></i>
                <h3 className="font-bold text-gray-900 text-base">Supabase SQL Schema Script</h3>
              </div>
              <button onClick={() => setShowSqlModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1 text-xs">
              <p className="text-gray-500 mb-3">
                Run this SQL in your Supabase SQL Editor for the fastest response times, dedicated table separation, and realtime synchronization:
              </p>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-[11px] overflow-x-auto selection:bg-orange-500 max-h-[60vh]">
                {SUPABASE_SETUP_SQL}
              </pre>
            </div>

            <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                  setImportNotification({ type: 'success', message: 'Official SQL schema & team commands copied to clipboard!' });
                  setShowSqlModal(false);
                }}
                className="px-4 py-2.5 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-copy"></i> Copy SQL Commands
              </button>
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPABASE CONNECTION CONFIG MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-5 sm:mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold">
                  <i className="fa-solid fa-database"></i>
                </div>
                <div>
                  <h3 className="font-black text-lg sm:text-xl text-gray-900">Database Connection</h3>
                  <p className="text-[10px] sm:text-xs text-gray-400 font-bold">Supabase PostgreSQL Integration</p>
                </div>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              updateCustomSupabaseCredentials(configInputUrl, configInputKey);
              setShowConfigModal(false);
              setTimeout(() => {
                refreshDbStatus();
                loadPlayersFromDb();
                loadTeamsFromDb();
              }, 200);
            }} className="space-y-4">
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
