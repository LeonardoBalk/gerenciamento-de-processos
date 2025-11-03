import './Sidebar.css'

export default function Sidebar({ open, setOpen, onNavigate, canManageCargos, userCargo }) {
  // decide permissao: usa boolean se vier, senao deriva do cargo textual
  const decidePermissaoCargos = () => {
    if (typeof canManageCargos === 'boolean') return canManageCargos
    const c = String(userCargo || '').toLowerCase().trim()
    const perfis = ['admin', 'chefe', 'super', 'superuser', 'gestor', 'manager']
    return perfis.includes(c)
  }

  const showCargos = decidePermissaoCargos()

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
            <img src="https://i.imgur.com/qP379fb.png" alt="Templates" className="icon" />
            Templates
          </li>

          {showCargos && (
            <li onClick={() => onNavigate('/cargos')}>
              <img src="https://i.imgur.com/tX90vZd.png" alt="Gerenciar Cargos" className="icon" />
              Gerenciar cargos
            </li>
          )}

          <li onClick={() => onNavigate('/perfil')}>
            <img src="https://i.imgur.com/OGhdKs0.png" alt="Perfil" className="icon" />
            Perfil
          </li>

          <li onClick={() => onNavigate('/ajuda')}>
            <img src="https://i.imgur.com/iee4IVh.png" alt="Ajuda" className="icon" />
            Ajuda
          </li>
        </ul>
      </nav>
    </div>
  )
}