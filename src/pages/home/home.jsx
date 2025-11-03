import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './home.css'
import Sidebar from '../../components/sidebar/sidebar'

export default function Home() {
  const navigate = useNavigate()

  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null) // linha da tabela public.users
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Data
  const [templates, setTemplates] = useState([]) 
  const [stages, setStages] = useState([]) 
  const [processes, setProcesses] = useState([]) 
  const [processStages, setProcessStages] = useState([]) 
  const [creators, setCreators] = useState([]) 

  // Filtros
  const [statusFiltro, setStatusFiltro] = useState('todos') 
  const [templateFiltro, setTemplateFiltro] = useState('todos') // id ou 'todos'
  const [dataFiltro, setDataFiltro] = useState('all') 
  const [busca, setBusca] = useState('')

  const [sidebarOpen, setSidebarOpen] = useState(false)


  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')

        // usuário autenticado do Supabase Auth
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const u = userData?.user ?? null
        setAuthUser(u)

        // linha do usuário na tabela public.users
        let appUserRow = null
        if (u?.id) {
          const { data: appU, error: appUErr } = await supabase
            .from('users')
            .select('id, nome, email, cargo, auth_id')
            .eq('auth_id', u.id)
            .maybeSingle()
          if (appUErr) throw appUErr
          appUserRow = appU
          setAppUser(appU)
        }

        // templates
        const { data: tmpl, error: tmplErr } = await supabase
          .from('templates')
          .select('id, nome')
          .order('nome', { ascending: true })
        if (tmplErr) throw tmplErr
        setTemplates(Array.isArray(tmpl) ? tmpl : [])

        // etapas
        const { data: stg, error: stgErr } = await supabase
          .from('stages')
          .select('id, template_id, ordem, nome')
        if (stgErr) throw stgErr
        setStages(Array.isArray(stg) ? stg : [])

        // processos
        const { data: procs, error: procsErr } = await supabase
          .from('processes')
          .select('id, template_id, status, criado_por, criado_em')
          .order('criado_em', { ascending: false })
        if (procsErr) throw procsErr
        const listProcs = Array.isArray(procs) ? procs : []
        setProcesses(listProcs)

        // process stages
        const procIds = listProcs.map(p => p.id)
        let listPS = []
        if (procIds.length) {
          const { data: ps, error: psErr } = await supabase
            .from('process_stages')
            .select('id, process_id, stage_id, atribuido_para, status, iniciado_em, concluido_em')
            .in('process_id', procIds)
          if (psErr) throw psErr
          listPS = Array.isArray(ps) ? ps : []
        }
        setProcessStages(listPS)

        // criadores dos processos
        const creatorIds = Array.from(new Set(listProcs.map(p => p.criado_por).filter(Boolean)))
        if (creatorIds.length) {
          const { data: usersRows, error: usersErr } = await supabase
            .from('users')
            .select('id, nome, email')
            .in('id', creatorIds)
          if (usersErr) throw usersErr
          setCreators(Array.isArray(usersRows) ? usersRows : [])
        } else {
          setCreators([])
        }
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'Erro ao carregar dados.')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const myUserId = appUser?.id ?? null
  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'

  // mapas auxiliares
  const templatesById = useMemo(() => {
    const m = new Map()
    templates.forEach(t => m.set(t.id, t))
    return m
  }, [templates])

  const stagesById = useMemo(() => {
    const m = new Map()
    stages.forEach(s => m.set(s.id, s))
    return m
  }, [stages])

  const creatorsById = useMemo(() => {
    const m = new Map()
    creators.forEach(c => m.set(c.id, c))
    return m
  }, [creators])

  const processStagesByProcessId = useMemo(() => {
    const m = new Map()
    processStages.forEach(ps => {
      if (!m.has(ps.process_id)) m.set(ps.process_id, [])
      m.get(ps.process_id).push(ps)
    })
    // ordenar cada lista pela ordem da etapa (stages.ordem)
    m.forEach(list => {
      list.sort((a, b) => {
        const oa = stagesById.get(a.stage_id)?.ordem ?? 0
        const ob = stagesById.get(b.stage_id)?.ordem ?? 0
        return oa - ob
      })
    })
    return m
  }, [processStages, stagesById])

  // status normalizado
  function normalizaStatus(str) {
    if (!str) return '—'
    const v = String(str).toLowerCase()
    if (v.includes('andamento')) return 'Em andamento'
    if (v.includes('conclu')) return 'Concluído'
    if (v.includes('pendente')) return 'Pendente'
    return str
  }

  // etapa atual do processo
  function etapaAtualDoProcesso(proc) {
    const list = processStagesByProcessId.get(proc.id) || []
    if (!list.length) return '—'

    // se houver etapas não concluídas, retorna a primeira não concluída
    const notDone = list.filter(ps => normalizaStatus(ps.status) !== 'Concluído')
    if (notDone.length) {
      const stage = stagesById.get(notDone[0].stage_id)
      return stage?.nome || '—'
    }
    // se todas concluídas, retorna a última etapa pelo maior 'ordem'
    const last = list[list.length - 1]
    const stage = stagesById.get(last.stage_id)
    return stage?.nome || '—'
  }

  function acaoRotulo(proc) {
    const s = normalizaStatus(proc.status)
    return s === 'Concluído' ? 'Ver' : 'Abrir'
  }

  const handleNovoProcesso = () => navigate('/processos/novo')
  const handleAbrirProcesso = (id) => navigate(`/processos/${id}`)
  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // resumo
  const { emAndamentoCount, concluidosCount, meusCount } = useMemo(() => {
    const emAndamento = processes.filter(p => normalizaStatus(p.status) === 'Em andamento').length
    const concluidos = processes.filter(p => normalizaStatus(p.status) === 'Concluído').length

    const meus = processes.filter(p => {
      // considera meus se fui criador ou tenho alguma etapa atribuída para mim
      const souCriador = myUserId && p.criado_por === myUserId
      const tenhoEtapa = myUserId && (processStagesByProcessId.get(p.id) || []).some(ps => ps.atribuido_para === myUserId)
      return souCriador || tenhoEtapa
    }).length

    return { emAndamentoCount: emAndamento, concluidosCount: concluidos, meusCount: meus }
  }, [processes, myUserId, processStagesByProcessId])

  // filtragem principal
  const processosDecorados = useMemo(() => {
    // enriquecidos com nomes
    return processes.map(p => {
      const template = templatesById.get(p.template_id)
      return {
        ...p,
        template_nome: template?.nome || '—',
        etapa_atual_nome: etapaAtualDoProcesso(p),
      }
    })
  }, [processes, templatesById, processStagesByProcessId, stagesById])

  const processosFiltrados = useMemo(() => {
    let list = [...processosDecorados]

    if (statusFiltro !== 'todos') {
      list = list.filter(p => {
        const s = normalizaStatus(p.status)
        return statusFiltro === 'em_andamento' ? s === 'Em andamento' : s === 'Concluído'
      })
    }

    if (templateFiltro !== 'todos') {
      const tid = Number(templateFiltro)
      list = list.filter(p => p.template_id === tid)
    }

    if (dataFiltro !== 'all') {
      const now = new Date()
      list = list.filter(p => {
        const d = p.criado_em ? new Date(p.criado_em) : null
        if (!d) return false
        if (dataFiltro === 'today') {
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
        }
        if (dataFiltro === '7d') {
          return (now - d) <= 7 * 24 * 60 * 60 * 1000
        }
        if (dataFiltro === 'month') {
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        }
        return true
      })
    }

    if (busca.trim()) {
      const q = busca.toLowerCase()
      list = list.filter(p =>
        (p.template_nome || '').toLowerCase().includes(q) ||
        (p.etapa_atual_nome || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [processosDecorados, statusFiltro, templateFiltro, dataFiltro, busca])

  // atribuídos a mim
  const atribuídosParaMim = useMemo(() => {
    if (!myUserId) return []
    const meusPS = processStages.filter(ps => ps.atribuido_para === myUserId && normalizaStatus(ps.status) !== 'Concluído')

    return meusPS.map(ps => {
      const proc = processes.find(p => p.id === ps.process_id)
      const stage = stagesById.get(ps.stage_id)
      const template = templatesById.get(proc?.template_id || -1)
      const criador = proc ? creatorsById.get(proc.criado_por) : null
      return {
        process_id: proc?.id,
        template_nome: template?.nome || '—',
        etapa_nome: stage?.nome || '—',
        criado_por_nome: criador?.nome || criador?.email || '—',
      }
    })
  }, [myUserId, processStages, processes, stagesById, templatesById, creatorsById])

  return (
    <div className="home-page">
        <Sidebar
  open={sidebarOpen}
  setOpen={setSidebarOpen}
  onNavigate={navigate}
  userCargo={appUser?.cargo} // habilita "Gerenciar cargos" quando meu cargo permitir
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
          {error && <div className="alert error">{error}</div>}

          {/* resumo */}
          <section className="resumo">
            <div className="resumo-card">
              <span className="dot dot-yellow" aria-hidden>●</span>
              <div className="resumo-meta">
                <span className="resumo-label">Em andamento</span>
                <span className="resumo-value">{loading ? '—' : emAndamentoCount}</span>
              </div>
            </div>
            <div className="resumo-card">
              <span className="dot dot-green" aria-hidden>●</span>
              <div className="resumo-meta">
                <span className="resumo-label">Concluídos</span>
                <span className="resumo-value">{loading ? '—' : concluidosCount}</span>
              </div>
            </div>
            <div className="resumo-card">
              <span className="dot dot-accent" aria-hidden>●</span>
              <div className="resumo-meta">
                <span className="resumo-label">Meus</span>
                <span className="resumo-value">{loading ? '—' : meusCount}</span>
              </div>
            </div>
          </section>

          {/* ações */}
          <section className="toolbar-top">
            <button className="btn-primary" onClick={handleNovoProcesso}>
              <span className="plus">+</span> Novo Processo
            </button>
          </section>

          {/* filtros */}
          <section className="filtros">
            <div className="field">
              <label>Status</label>
              <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
              </select>
            </div>

            <div className="field">
              <label>Template</label>
              <select value={templateFiltro} onChange={(e) => setTemplateFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Data</label>
              <select value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)}>
                <option value="all">Todo período</option>
                <option value="today">Hoje</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="month">Este mês</option>
              </select>
            </div>

            <div className="field field-search">
              <label>Buscar</label>
              <div className="search-wrap">
                <input
                  type="text"
                  placeholder="Buscar por template, etapa ou status..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <span className="search-ico"></span>
              </div>
            </div>
          </section>

          {/* tabela principal */}
          <section className="tabela-card">
            <div className="tabela-head">
              <h3>Processos</h3>
              {!loading && <span className="badge">{processosFiltrados.length}</span>}
            </div>

            <div className="tabela-scroll">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome do Template</th>
                    <th>Etapa Atual</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows rows={5} cols={4} />
                  ) : processosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">Nenhum processo encontrado.</td>
                    </tr>
                  ) : (
                    processosFiltrados.map(p => (
                      <tr key={p.id}>
                        <td className="col-strong">{p.template_nome}</td>
                        <td>{p.etapa_atual_nome}</td>
                        <td>
                          <span className={`status-pill ${normalizaStatus(p.status) === 'Concluído' ? 'ok' : normalizaStatus(p.status) === 'Em andamento' ? 'run' : ''}`}>
                            {normalizaStatus(p.status)}
                          </span>
                        </td>
                        <td>
                          <button className="btn-small" onClick={() => handleAbrirProcesso(p.id)}>
                            {acaoRotulo(p)}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* atribuídos a mim */}
          <section className="extra-section">
            <div className="section-title">
              <span className="bell"></span>
              <h3>Processos atribuídos a mim</h3>
            </div>

            <div className="tabela-scroll">
              <table className="tabela compact">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Etapa</th>
                    <th>Criado por</th>
                    <th style={{ width: 120 }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows rows={3} cols={4} />
                  ) : atribuídosParaMim.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">Nenhum processo atribuído a você.</td>
                    </tr>
                  ) : (
                    atribuídosParaMim.map((row, idx) => (
                      <tr key={idx}>
                        <td className="col-strong">{row.template_nome}</td>
                        <td>{row.etapa_nome}</td>
                        <td>{row.criado_por_nome}</td>
                        <td>
                          <button className="btn-small" onClick={() => handleAbrirProcesso(row.process_id)}>
                            Abrir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function iniciais(nome = '') {
  const parts = String(nome).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (a + b).toUpperCase()
}

function SkeletonRows({ rows = 4, cols = 4 }) {
  const r = Array.from({ length: rows })
  const c = Array.from({ length: cols })
  return (
    <>
      {r.map((_, i) => (
        <tr key={i} className="skeleton">
          {c.map((__, j) => (
            <td key={j}><span className="skl" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}