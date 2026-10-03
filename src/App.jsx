import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Auction from './pages/Auction';
import Admin from './pages/Admin';
import DataImportExport from './pages/DataImportExport';
import { ADMIN_BASE, ADMIN_IMPORT, ADMIN_PLAYERS } from './utils/paths';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auction" element={<Auction />} />
        <Route path={ADMIN_BASE} element={<Admin />} />
        <Route path={ADMIN_IMPORT} element={<DataImportExport />} />
        <Route path={ADMIN_PLAYERS} element={<DataImportExport />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
