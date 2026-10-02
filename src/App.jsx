import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Auction from './pages/Auction';
import Admin from './pages/Admin';
import DataImportExport from './pages/DataImportExport';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auction" element={<Auction />} />
        <Route path="/doremon" element={<Admin />} />
        <Route path="/doremon/import-export" element={<DataImportExport />} />
        <Route path="/doremon/players" element={<DataImportExport />} />
        <Route path="/admin" element={<Navigate to="/doremon" replace />} />
        <Route path="/admin/import-export" element={<Navigate to="/doremon/import-export" replace />} />
        <Route path="/admin/players" element={<Navigate to="/doremon/import-export" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
