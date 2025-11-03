import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './ajuda.css'

export default function Help() {
  const navigate = useNavigate()

  // ui e auth
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // permissao para gerenciar cargos
  const canManageCargos = useMemo(() => {
    const c = String(appUser?.cargo || '').toLowerCase().trim()
    return ['admin', 'chefe', 'super', 'superuser', 'gestor', 'manager'].includes(c)
  }, [appUser])

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')
        // carrega usuario autenticado
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const u = userData?.user ?? null
        setAuthUser(u)

        // carrega linha do usuario na tabela users
        if (u?.id) {
          const { data: appRow, error: appErr } = await supabase
            .from('users')
            .select('id, nome, email, cargo, auth_id')
            .eq('auth_id', u.id)
            .maybeSingle()
          if (appErr) throw appErr
          setAppUser(appRow)
        }
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'erro ao carregar informacoes de ajuda.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'

  // handlers
  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // acoes rapidas
  const goNovoProcesso = () => navigate('/processos/novo')
  const goMeusProcessos = () => navigate('/processos')
  const goTemplates = () => navigate('/templates')
  const goCargos = () => navigate('/cargos')

  return (
    <div className="help-page">
      <Sidebar
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        onNavigate={navigate}
        userCargo={appUser?.cargo}
      />

      <header className="home-header">
        <div className="container">
          <div className="brand">
            <img src="https://i.imgur.com/BQxiVns.png" alt="Logo" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            <span className="brand-name">Flowa</span>
          </div>

          <div className="header-right">
            <div className="user-pill" title={authUser?.email || ''}>
              <div className="avatar">{iniciais(nomeUsuario)}</div>
              <span className="user-name">{nomeUsuario}</span>
            </div>
            <button className="btn-outline" onClick={handleSair}>Sair</button>
          </div>
        </div>
      </header>

      <main className={`home-main ${sidebarOpen ? 'shift' : ''}`}>
        <div className="container">
          {error && <div className="hp-alert error">{error}</div>}

          <section className="hp-hero">
            <div className="hp-hero-body">
              <h1>AJUDA E DOCUMENTAÇÃO</h1>
              <p>
                Bem-vindo ao Flowa! Somos uma plataforma para criar, executar e acompanhar processos.
              </p>
              <div className="hp-hero-actions">
                <button className="hp-btn primary" onClick={goNovoProcesso}>Criar Novo Processo</button>
                <button className="hp-btn" onClick={goMeusProcessos}>Ver Meus Processos</button>
              </div>
            </div>
          </section>

          <section className="hp-grid">
            <div className="hp-card">
              <div className="hp-card-head">
                <h3>O QUE É O FLOWA</h3>
              </div>
              <div className="hp-card-body">
                <p>
                  O Flowa é uma plataforma de gestão de processos baseada em templates e etapas. Você cria um template
                  com as etapas do seu fluxo, define responsabilidades e, a partir dele, inicia processos que
                  podem incluir atribuições, mensagens e documentos. O objetivo é padronizar tarefas, dar visibilidade
                  ao andamento e acelerar entregas com qualidade.
                </p>
                <ul className="hp-list">
                  <li>Padronização: transforme fluxos repetíveis em templates reutilizáveis</li>
                  <li>Execução guiada: etapas com responsáveis, prazos e status</li>
                  <li>Colaboração: troque mensagens e anexe documentos por etapa</li>
                  <li>Rastreabilidade: histórico e logs de tudo que acontece em cada processo</li>
                </ul>
              </div>
            </div>

            <div className="hp-card">
              <div className="hp-card-head">
                <h3>COMO FUNCIONA</h3>
              </div>
              <div className="hp-card-body">
                <ol className="hp-steps">
                  <li>Crie um Template com as etapas do seu fluxo</li>
                  <li>Inicie um Processo a partir do template</li>
                  <li>Atribua responsáveis para cada etapa</li>
                  <li>Anexe documentos e troque mensagens dentro das etapas</li>
                  <li>Conclua as etapas na ordem e finalize o processo</li>
                </ol>
                <div className="hp-tip">
                  Dica: apenas quem está atribuído pode concluir a etapa, garantindo responsabilidade clara.
                </div>
              </div>
            </div>

            <div className="hp-card">
              <div className="hp-card-head">
                <h3>DÚVIDAS FREQUENTES</h3>
              </div>
              <div className="hp-card-body">
                <div className="hp-faq">
                  <details>
                    <summary>Como crio um novo processo?</summary>
                    <p>Vá em “Novo processo”, escolha um template e confirme. O processo será criado com as etapas do template.</p>
                  </details>
                  <details>
                    <summary>Quem pode concluir uma etapa?</summary>
                    <p>Apenas o usuário atribuído à etapa. Perfis administrativos podem gerenciar atribuições quando necessário.</p>
                  </details>
                  <details>
                    <summary>Onde subo documentos?</summary>
                    <p>Dentro da etapa, na seção “Documentos”. É possível visualizar, abrir e baixar conforme permissões.</p>
                  </details>
                  <details>
                    <summary>Posso criar e editar templates?</summary>
                    <p>Sim. Na área de “Templates” você cria, edita e organiza os fluxos que viram processos.</p>
                  </details>
                  <details>
                    <summary>Como gerencio cargos e permissões?</summary>
                    <p>Perfis com permissão acessam “Gerenciar cargos” na sidebar. Lá é possível atribuir ou renomear cargos.</p>
                  </details>
                </div>
              </div>
            </div>

            <div className="hp-card">
              <div className="hp-card-head">
                <h3>ATALHOS E LINKS ÚTEIS</h3>
              </div>
              <div className="hp-card-body">
                <div className="hp-links">
                  <button className="hp-link primary" onClick={goNovoProcesso}>
                    + Novo Processo
                  </button>
                  <button className="hp-link" onClick={goMeusProcessos}>
                    Meus Processos
                  </button>
                  <button className="hp-link" onClick={goTemplates}>
                    Templates
                  </button>
                  {canManageCargos && (
                    <button className="hp-link" onClick={goCargos}>
                      Gerenciar Cargos
                    </button>
                  )}
                </div>
                <p className="hp-small">
                  Precisa de algo específico? Fale com um administrador ou com a equipe de suporte.
                </p>
              </div>
            </div>
          </section>

          {loading && <div className="hp-loading">Carregando...</div>}
        </div>
      </main>
    </div>
  )
}

function iniciais(nome = '') {
  // devolve iniciais do usuario
  const parts = String(nome).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (a + b).toUpperCase()
}