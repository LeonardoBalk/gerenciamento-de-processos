import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/login/login';
import Home from './pages/home/home';
import Sidebar from './components/sidebar/sidebar';
import Templates from './pages/templates/templates';
import NovoTemplate from './pages/novoTemplate/novoTemplate';
import VisualizarTemplate from './pages/visualizarTemplate/visualizarTemplate';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/" element={<Home />} />
        <Route path="/sidebar" element={<Sidebar />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/novo" element={<NovoTemplate />} />
        <Route path="/templates/:id" element={<VisualizarTemplate />} />
      </Routes>
    </Router>
  );
}

export default App;