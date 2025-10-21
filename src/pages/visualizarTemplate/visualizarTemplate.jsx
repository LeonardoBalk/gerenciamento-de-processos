import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './visualizarTemplate.css'

export default function TemplateView() {
  const { id } = useParams()
  const templateId = Number(id)
  const navigate = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auth + usuário da app
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // Dados
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [template, setTemplate] = useState(null) // {id, nome, descricao, criado_por, criado_em}
  const [stages, setStages] = useState([]) // [{id, ordem, nome, descricao}]
  const [creator, setCreator] = useState(null) // {id, nome, email}
  const [processesCount, setProcessesCount] = useState(0)

  useEffect(() => {
    if (!templateId) {
      setError('Template inválido.')
      setLoading(false)
      return
    }

    const init = async () => {
      try {
        setLoading(true)
        setError('')
        setSuccess('')

        // Auth
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const u = userData?.user ?? null
        setAuthUser(u)

        if (u?.id) {
          const { data: appRow, error: appErr } = await supabase
            .from('users')
            .select('id, nome, email, cargo, auth_id')
            .eq('auth_id', u.id)
            .maybeSingle()
          if (appErr) throw appErr
          setAppUser(appRow)
        }

        // Template
        const { data: t, error: tErr } = await supabase
          .from('templates')
          .select('id, nome, descricao, criado_por, criado_em')
          .eq('id', templateId)
          .single()
        if (tErr) throw tErr
        setTemplate(t)

        // Stages
        const { data: stg, error: stgErr } = await supabase
          .from('stages')
          .select('id, ordem, nome, descricao')
          .eq('template_id', templateId)
          .order('ordem', { ascending: true })
        if (stgErr) throw stgErr
        setStages(Array.isArray(stg) ? stg : [])

        // Creator
        if (t?.criado_por) {
          const { data: cr, error: crErr } = await supabase
            .from('users')
            .select('id, nome, email')
            .eq('id', t.criado_por)
            .maybeSingle()
          if (crErr) throw crErr
          setCreator(cr)
        } else {
          setCreator(null)
        }

        // Processes count que usam este template
        const { count, error: pcErr } = await supabase
          .from('processes')
          .select('id', { count: 'exact', head: true })
          .eq('template_id', templateId)
        if (pcErr) throw pcErr
        setProcessesCount(count ?? 0)
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'Erro ao carregar template.')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [templateId])

  const nomeUsuario = useMemo(() => {
    return appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'
  }, [appUser, authUser])

  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // Ação: Iniciar processo a partir do template
  const handleIniciarProcesso = async () => {
    try {
      setError('')
      setSuccess('')

      if (!stages.length) {
        setError('Este template não possui etapas. Adicione etapas antes de iniciar um processo.')
        return
      }

      // 1) criar processo
      const { data: proc, error: pErr } = await supabase
        .from('processes')
        .insert({
          template_id: templateId,
          status: 'Em andamento',
          criado_por: appUser?.id ?? null
        })
        .select('id')
        .single()
      if (pErr) throw pErr
      const processId = proc?.id
      if (!processId) throw new Error('Não foi possível obter o ID do processo.')

      // 2) criar process_stages copiando stages
      const nowIso = new Date().toISOString()
      const psRows = stages.map((s, idx) => ({
        process_id: processId,
        stage_id: s.id,
        atribuido_para: null,
        status: idx === 0 ? 'Em andamento' : 'Pendente',
        iniciado_em: idx === 0 ? nowIso : null,
        concluido_em: null
      }))
      const { error: psErr } = await supabase.from('process_stages').insert(psRows)
      if (psErr) throw psErr

      // 3) log (opcional mas recomendado)
      await supabase.from('logs').insert({
        process_id: processId,
        acao: `Processo criado a partir do template "${template?.nome ?? templateId}"`,
        feito_por: appUser?.id ?? null
      })

      // 4) navegar para o processo
      navigate(`/processos/${processId}`)
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Erro ao iniciar processo.')
    }
  }

  // Ação: Duplicar template
  const handleDuplicar = async () => {
    try {
      setError('')
      setSuccess('')

      if (!template) return
      const { data: newT, error: tErr } = await supabase
        .from('templates')
        .insert({
          nome: `${template.nome} (cópia)`,
          descricao: template.descricao ?? null,
          criado_por: appUser?.id ?? null
        })
        .select('id')
        .single()
      if (tErr) throw tErr
      const newTemplateId = newT?.id
      if (!newTemplateId) throw new Error('Falha ao duplicar template.')

      if (stages.length) {
        const newStages = stages.map(s => ({
          template_id: newTemplateId,
          ordem: s.ordem,
          nome: s.nome,
          descricao: s.descricao ?? null
        }))
        const { error: sErr } = await supabase.from('stages').insert(newStages)
        if (sErr) throw sErr
      }

      setSuccess('Template duplicado com sucesso.')
      // Redireciona para o novo template
      setTimeout(() => navigate(`/templates/${newTemplateId}`), 400)
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Erro ao duplicar template.')
    }
  }

  // Ação: Excluir template (bloqueia se já existirem processos)
  const handleExcluir = async () => {
    try {
      setError('')
      setSuccess('')

      if (processesCount > 0) {
        setError('Não é possível excluir: existem processos vinculados a este template.')
        return
      }

      const ok = window.confirm('Tem certeza que deseja excluir este template? Essa ação não pode ser desfeita.')
      if (!ok) return

      // apagar stages primeiro por causa da FK
      const { error: delStagesErr } = await supabase
        .from('stages')
        .delete()
        .eq('template_id', templateId)
      if (delStagesErr) throw delStagesErr

      // apagar template
      const { error: delTemplateErr } = await supabase
        .from('templates')
        .delete()
        .eq('id', templateId)
      if (delTemplateErr) throw delTemplateErr

      setSuccess('Template excluído.')
      setTimeout(() => navigate('/templates'), 400)
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Erro ao excluir template.')
    }
  }

  return (
    <div className="template-view-page">
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
          {success && <div className="alert success">{success}</div>}

          <section className="page-header">
            <div className="title-wrap">
              <h1>{loading ? 'Carregando…' : (template?.nome || 'Template')}</h1>
              {template?.descricao && <p className="muted">{template.descricao}</p>}
            </div>
            <div className="actions-right">
              <button className="btn-primary" onClick={handleIniciarProcesso} disabled={loading}>
                Iniciar processo
              </button>
              <button className="btn-secondary" onClick={handleDuplicar} disabled={loading}>
                Duplicar
              </button>
              <button className="btn-danger-outline" onClick={handleExcluir} disabled={loading}>
                Excluir
              </button>
            </div>
          </section>

          <section className="meta-card">
            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Criado por</span>
                <span className="meta-value">{creator?.nome || creator?.email || '—'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Criado em</span>
                <span className="meta-value">{formataDataHora(template?.criado_em)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Processos vinculados</span>
                <span className="meta-value">{processesCount}</span>
              </div>
            </div>
          </section>

          <section className="stages-card">
            <div className="tabela-head">
              <h3>Etapas do Template</h3>
              <span className="badge">{stages.length}</span>
            </div>

            {loading ? (
              <ul className="stages-list skeleton">
                {[...Array(3)].map((_, i) => (
                  <li key={i} className="stage-item">
                    <div className="stage-order skl" />
                    <div className="stage-body">
                      <div className="stage-title skl" />
                      <div className="stage-desc skl" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : stages.length === 0 ? (
              <div className="empty">Nenhuma etapa cadastrada.</div>
            ) : (
              <ol className="stages-list">
                {stages.map((s, idx) => (
                  <li key={s.id} className="stage-item">
                    <div className="stage-order" aria-hidden>{idx + 1}</div>
                    <div className="stage-body">
                      <div className="stage-title">{s.nome}</div>
                      {s.descricao ? (
                        <div className="stage-desc" title={s.descricao}>{s.descricao}</div>
                      ) : (
                        <div className="stage-desc muted">Sem descrição</div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
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