import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './MeusProcessos.css'

export default function MeusProcessos() {
  const navigate = useNavigate()

  // ui e auth
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // estado
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // dados
  const [templates, setTemplates] = useState([])
  const [stages, setStages] = useState([])
  const [processes, setProcesses] = useState([])
  const [processStages, setProcessStages] = useState([])

  // filtros
  const [statusFiltro, setStatusFiltro] = useState('todos')   // todos | em_andamento | concluido
  const [templateFiltro, setTemplateFiltro] = useState('todos')
  const [dataFiltro, setDataFiltro] = useState('all')         // all | today | 7d | month
  const [busca, setBusca] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')

        // auth supabase
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const u = userData?.user ?? null
        setAuthUser(u)

        // usuario do app
        if (u?.id) {
          const { data: appRow, error: appErr } = await supabase
            .from('users')
            .select('id, nome, email, cargo, auth_id')
            .eq('auth_id', u.id)
            .maybeSingle()
          if (appErr) throw appErr
          setAppUser(appRow)
        }

        // templates
        const { data: tmpl, error: tmplErr } = await supabase
          .from('templates')
          .select('id, nome')
          .order('nome', { ascending: true })
        if (tmplErr) throw tmplErr
        setTemplates(Array.isArray(tmpl) ? tmpl : [])

        // stages
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
        const allProcs = Array.isArray(procs) ? procs : []

        // process_stages
        const procIds = allProcs.map(p => p.id)
        let psList = []
        if (procIds.length) {
          const { data: ps, error: psErr } = await supabase
            .from('process_stages')
            .select('id, process_id, stage_id, atribuido_para, status, iniciado_em, concluido_em')
            .in('process_id', procIds)
          if (psErr) throw psErr
          psList = Array.isArray(ps) ? ps : []
        }

        // filtra apenas os "meus" processos
        const myId = appUser?.id || (await getAppUserIdFallback()).id || null
        const meusProcIdsSet = new Set([
          ...allProcs.filter(p => myId && p.criado_por === myId).map(p => p.id),
          ...psList.filter(ps => myId && ps.atribuido_para === myId).map(ps => ps.process_id)
        ])
        const meusProcs = allProcs.filter(p => meusProcIdsSet.has(p.id))

        setProcesses(meusProcs)
        setProcessStages(psList.filter(ps => meusProcIdsSet.has(ps.process_id)))
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'Erro ao carregar dados.')
      } finally {
        setLoading(false)
      }
    }

    // fallback local
    const getAppUserIdFallback = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const u = userData?.user
        if (!u?.id) return {}
        const { data: appRow } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', u.id)
          .maybeSingle()
        return appRow || {}
      } catch {
        return {}
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'

  // mapas
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

  const processStagesByProcessId = useMemo(() => {
    const m = new Map()
    processStages.forEach(ps => {
      if (!m.has(ps.process_id)) m.set(ps.process_id, [])
      m.get(ps.process_id).push(ps)
    })
    m.forEach(list => {
      list.sort((a, b) => {
        const oa = stagesById.get(a.stage_id)?.ordem ?? 0
        const ob = stagesById.get(b.stage_id)?.ordem ?? 0
        return oa - ob
      })
    })
    return m
  }, [processStages, stagesById])

  // helpers
  function normalizaStatus(str) {
    if (!str) return '—'
    const v = String(str).toLowerCase()
    if (v.includes('andamento')) return 'Em andamento'
    if (v.includes('conclu')) return 'Concluído'
    if (v.includes('pendente')) return 'Pendente'
    return str
  }

  function etapaAtual(proc) {
    const list = processStagesByProcessId.get(proc.id) || []
    if (!list.length) return '—'
    const notDone = list.filter(ps => normalizaStatus(ps.status) !== 'Concluído')
    if (notDone.length) {
      const stage = stagesById.get(notDone[0].stage_id)
      return stage?.nome || '—'
    }
    const last = list[list.length - 1]
    const stage = stagesById.get(last.stage_id)
    return stage?.nome || '—'
  }

  const handleAbrir = (id) => navigate(`/processos/${id}`)
  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // decoracao + filtros
  const meusDecorados = useMemo(() => {
    return processes.map(p => {
      const t = templatesById.get(p.template_id)
      return {
        ...p,
        template_nome: t?.nome || '—',
        etapa_atual: etapaAtual(p),
        status_norm: normalizaStatus(p.status),
      }
    })
  }, [processes, templatesById, processStagesByProcessId, stagesById])

  const filtrados = useMemo(() => {
    let list = [...meusDecorados]

    if (statusFiltro !== 'todos') {
      list = list.filter(p => statusFiltro === 'em_andamento'
        ? p.status_norm === 'Em andamento'
        : p.status_norm === 'Concluído'
      )
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
        (p.etapa_atual || '').toLowerCase().includes(q) ||
        (p.status_norm || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [meusDecorados, statusFiltro, templateFiltro, dataFiltro, busca])

  return (
    <div className="meus-processos-page">
      <Sidebar
  open={sidebarOpen}
  setOpen={setSidebarOpen}
  onNavigate={navigate}
  userCargo={appUser?.cargo} // habilita o item "Gerenciar cargos" quando meu cargo permitir
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

          {/* filtros */}
          <section className="mp-filtros">
            <div className="mp-field">
              <label>Status</label>
              <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
              </select>
            </div>

            <div className="mp-field">
              <label>Template</label>
              <select value={templateFiltro} onChange={(e) => setTemplateFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>

            <div className="mp-field">
              <label>Data</label>
              <select value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)}>
                <option value="all">Todo Período</option>
                <option value="today">Hoje</option>
                <option value="7d">Últimos 7 Dias</option>
                <option value="month">Este Mês</option>
              </select>
            </div>

            <div className="mp-field mp-field-search">
              <label>Buscar</label>
              <div className="mp-search-wrap">
                <input
                  type="text"
                  placeholder="Buscar por template, etapa ou status..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <span className="mp-search-ico"></span>
              </div>
            </div>
          </section>

          {/* tabela */}
          <section className="mp-table-card">
            <div className="mp-table-head">
              <h3>Meus Processos</h3>
              {!loading && <span className="mp-badge">{filtrados.length}</span>}
            </div>

            <div className="mp-table-scroll">
              <table className="mp-table">
                <colgroup>
                  <col className="mp-col-template" />
                  <col className="mp-col-stage" />
                  <col className="mp-col-status" />
                  <col className="mp-col-date" />
                  <col className="mp-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Etapa Atual</th>
                    <th>Status</th>
                    <th>Criado Em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows rows={6} cols={5} />
                  ) : filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="mp-empty">Nenhum processo encontrado.</td>
                    </tr>
                  ) : (
                    filtrados.map(p => (
                      <tr key={p.id}>
                        <td className="mp-strong" title={p.template_nome}>{p.template_nome}</td>
                        <td title={p.etapa_atual}>{p.etapa_atual}</td>
                        <td>
                          <span className={`mp-status-pill ${p.status_norm === 'Concluído' ? 'ok' : p.status_norm === 'Em andamento' ? 'run' : ''}`}>
                            {p.status_norm}
                          </span>
                        </td>
                        <td title={formataDataHora(p.criado_em)}>{formataDataCurta(p.criado_em)}</td>
                        <td>
                          <button className="mp-btn-small" onClick={() => handleAbrir(p.id)}>Abrir</button>
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

function formataDataHora(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}
function formataDataCurta(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return '—'
  }
}

function SkeletonRows({ rows = 4, cols = 4 }) {
  const r = Array.from({ length: rows })
  const c = Array.from({ length: cols })
  return (
    <>
      {r.map((_, i) => (
        <tr key={i} className="mp-skeleton">
          {c.map((__, j) => (
            <td key={j}><span className="mp-skl" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}