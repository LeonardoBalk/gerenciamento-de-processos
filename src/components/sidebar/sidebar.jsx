import './Sidebar.css'

export default function Sidebar({ open, setOpen, onNavigate }) {
  return (
    <div className={`sidebar ${open ? 'open' : ''}`}>
      <button className="toggle-btn" onClick={() => setOpen(!open)}>
        ☰
      </button>

      <nav className="sidebar-content">
        <h2>Flowa</h2>
        <ul>
          <li onClick={() => onNavigate('/')}>
            <img src="https://i.imgur.com/egdzdv0.png" alt="Início" className="icon" />
            Início
          </li>
          <li onClick={() => onNavigate('/processos/novo')}>
            <img src="https://i.imgur.com/ucn8Cyq.png" alt="Novo" className="icon" />
            Novo processo
          </li>
          <li onClick={() => onNavigate('/processos')}>
            <img src="https://i.imgur.com/NLO8Avm.png" alt="Meus Processos" className="icon" />
            Meus processos
          </li>
           <li onClick={() => onNavigate('/templates')}>
            <img src="https://i.imgur.com/qP379fb.png" alt="Meus Processos" className="icon" />
            Templates
          </li>
          <li onClick={() => onNavigate('/perfil')}>
            <img src="https://i.imgur.com/OGhdKs0.png" alt="Perfil" className="icon" />
            Perfil
          </li>
          <li onClick={() => onNavigate('/ajuda')}>
            <img src="https://imgur.com/a/CZs7A5a" alt="Ajuda" className="icon" />
            Ajuda
          </li>
        </ul>
      </nav>
    </div>
  )
}
