import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './Templates.css'

export default function Templates() {
  const navigate = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auth + usuário da app (tabela public.users)
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // Estado básico
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Dados
  const [templates, setTemplates] = useState([]) // [{id, nome, descricao, criado_por, criado_em}]
  const [stages, setStages] = useState([]) // [{id, template_id, ordem, nome}]
  const [creators, setCreators] = useState([]) // [{id, nome, email}]

  // Filtros
  const [dataFiltro, setDataFiltro] = useState('all') // all | today | 7d | month
  const [busca, setBusca] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')

        // 1) Usuário autenticado (Supabase Auth)
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const u = userData?.user ?? null
        setAuthUser(u)

        // 2) Usuário da app (public.users) mapeado por auth_id
        if (u?.id) {
          const { data: appRow, error: appErr } = await supabase
            .from('users')
            .select('id, nome, email, cargo, auth_id')
            .eq('auth_id', u.id)
            .maybeSingle()
          if (appErr) throw appErr
          setAppUser(appRow)
        }

        // 3) Templates
        const { data: tmpl, error: tmplErr } = await supabase
          .from('templates')
          .select('id, nome, descricao, criado_por, criado_em')
          .order('nome', { ascending: true })
        if (tmplErr) throw tmplErr
        const listTemplates = Array.isArray(tmpl) ? tmpl : []
        setTemplates(listTemplates)

        // 4) Stages (para contagem por template)
        const { data: stg, error: stgErr } = await supabase
          .from('stages')
          .select('id, template_id, ordem, nome')
        if (stgErr) throw stgErr
        setStages(Array.isArray(stg) ? stg : [])

        // 5) Criadores dos templates
        const creatorIds = Array.from(new Set(listTemplates.map(t => t.criado_por).filter(Boolean)))
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

  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'

  // Mapas auxiliares
  const creatorsById = useMemo(() => {
    const m = new Map()
    creators.forEach(c => m.set(c.id, c))
    return m
  }, [creators])

  const stagesByTemplateId = useMemo(() => {
    const m = new Map()
    stages.forEach(s => {
      if (!m.has(s.template_id)) m.set(s.template_id, [])
      m.get(s.template_id).push(s)
    })
    m.forEach(list => list.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)))
    return m
  }, [stages])

  // Enriquecimento
  const templatesDecorados = useMemo(() => {
    return templates.map(t => {
      const etapas = stagesByTemplateId.get(t.id) || []
      const criador = t.criado_por ? creatorsById.get(t.criado_por) : null
      return {
        ...t,
        etapas_qtd: etapas.length,
        criador_nome: criador?.nome || criador?.email || '—',
      }
    })
  }, [templates, stagesByTemplateId, creatorsById])

  // Filtragem
  const templatesFiltrados = useMemo(() => {
    let list = [...templatesDecorados]

    if (dataFiltro !== 'all') {
      const now = new Date()
      list = list.filter(t => {
        const d = t.criado_em ? new Date(t.criado_em) : null
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
      list = list.filter(t =>
        (t.nome || '').toLowerCase().includes(q) ||
        (t.descricao || '').toLowerCase().includes(q) ||
        (t.criador_nome || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [templatesDecorados, dataFiltro, busca])

  // Ações
  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }
  const handleNovoTemplate = () => navigate('/templates/novo')
  const handleAbrirTemplate = (id) => navigate(`/templates/${id}`)

  return (
    <div className="templates-page">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} onNavigate={navigate} />

      <header className="home-header">
        <div className="container">
          <div className="brand">
            <img src="/logo.svg" alt="Logo" onError={(e) => { e.currentTarget.style.display = 'none' }} />
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

          <section className="toolbar-top">
            <button className="btn-primary" onClick={handleNovoTemplate}>
              <span className="plus">+</span> Novo Template
            </button>
          </section>

          <section className="filtros">
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
                  placeholder="Buscar por nome, descrição ou criador..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <span className="search-ico"></span>
              </div>
            </div>
          </section>

          <section className="tabela-card">
            <div className="tabela-head">
              <h3>Templates</h3>
              {!loading && <span className="badge">{templatesFiltrados.length}</span>}
            </div>

            <div className="tabela-scroll">
              <table className="tabela">
                <colgroup>
                  <col className="col-name" />
                  <col className="col-desc" />
                  <col className="col-steps" />
                  <col className="col-author" />
                  <col className="col-date" />
                  <col className="col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Desc</th>
                    <th>Etapas</th>
                    <th>Criado por</th>
                    <th>Criado em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonRows rows={6} cols={6} />
                  ) : templatesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">Nenhum template encontrado.</td>
                    </tr>
                  ) : (
                    templatesFiltrados.map(t => (
                      <tr key={t.id}>
                        <td
                          className="col-strong"
                          data-label="Nome"
                          title={t.nome}
                        >
                          {t.nome}
                        </td>
                        <td
                          className="col-desc"
                          data-label="Descrição"
                          title={t.descricao || ''}
                        >
                          {t.descricao || '—'}
                        </td>
                        <td
                          className="col-steps"
                          data-label="Etapas"
                        >
                          <span className="chip">{t.etapas_qtd}</span>
                        </td>
                        <td
                          className="col-author"
                          data-label="Criado por"
                          title={t.criador_nome}
                        >
                          {t.criador_nome}
                        </td>
                        <td
                          className="col-date"
                          data-label="Criado em"
                          title={formataDataHora(t.criado_em)}
                        >
                          {formataDataCurta(t.criado_em)}
                        </td>
                        <td className="col-actions" data-label="Ações">
                          <button className="btn-small" onClick={() => handleAbrirTemplate(t.id)}>
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
        <tr key={i} className="skeleton">
          {c.map((__, j) => (
            <td key={j}><span className="skl" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}