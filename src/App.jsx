import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/login/login';
import Home from './pages/home/home';
import Sidebar from './components/sidebar/sidebar';
import Templates from './pages/templates/templates';
import NovoTemplate from './pages/novoTemplate/novoTemplate';
import VisualizarTemplate from './pages/visualizarTemplate/visualizarTemplate';
import NovoProcesso from './pages/novoProcesso/novoProcesso';
import MeusProcessos from './pages/meusProcessos/meusProcessos';
import Cargos from './pages/cargos/cargos';
import VisualizarProcesso from './pages/visualizarProcesso/visualizarProcesso';
import Ajuda from './pages/ajuda/ajuda';
import Perfil from './pages/perfil/perfil';

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
        <Route path="/processos/novo" element={<NovoProcesso />} />
        <Route path="/processos" element={<MeusProcessos />} />
        <Route path="/cargos" element={<Cargos />} />
        <Route path="/processos/:id" element={<VisualizarProcesso />} />
        <Route path="/ajuda" element={<Ajuda />} />
        <Route path="/perfil" element={<Perfil />} />
      </Routes>
    </Router>
  );
}

export default App;