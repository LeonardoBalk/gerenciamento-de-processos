import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './NovoProcesso.css'

export default function NovoProcesso() {
  const navigate = useNavigate()

  // sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // auth + usuario da app
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // estado basico
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // dados formulario
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [stages, setStages] = useState([])
  const [users, setUsers] = useState([])
  const [assignee, setAssignee] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])

  const fileInputRef = useRef(null)

  // garante que exista uma linha em public.users para o auth atual
  async function ensureAppUserFromAuth(u) {
    if (!u?.id) return null
    // tenta pegar a linha existente
    const { data: appRow, error: appErr } = await supabase
      .from('users')
      .select('id, nome, email, cargo, auth_id')
      .eq('auth_id', u.id)
      .maybeSingle()
    if (appErr) throw appErr
    if (appRow) return appRow

    // se nao existir, cria (precisa da policy "users ins self"; ver sql no passo 1)
    const nome = u.user_metadata?.name || u.email || 'usuario'
    const email = u.email || `user-${u.id}@example.com`
    const { data: inserted, error: insErr } = await supabase
      .from('users')
      .insert({
        auth_id: u.id,
        nome,
        email,
        senha: 'managed-by-auth'
      })
      .select('id, nome, email, cargo, auth_id')
      .single()
    if (insErr) throw insErr
    return inserted
  }

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')

        // autentica
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const u = userData?.user ?? null
        setAuthUser(u)

        // garante usuario da app (cria se nao existir)
        const ensured = await ensureAppUserFromAuth(u)
        setAppUser(ensured)

        // templates
        const { data: tmpl, error: tmplErr } = await supabase
          .from('templates')
          .select('id, nome')
          .order('nome', { ascending: true })
        if (tmplErr) throw tmplErr
        setTemplates(Array.isArray(tmpl) ? tmpl : [])

        // usuarios para atribuicao
        const { data: usersRows, error: usersErr } = await supabase
          .from('users')
          .select('id, nome, email')
          .order('nome', { ascending: true })
        if (usersErr) throw usersErr
        setUsers(Array.isArray(usersRows) ? usersRows : [])
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'Erro ao carregar dados.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    const loadStages = async () => {
      try {
        setStages([])
        if (!templateId) return
        const { data: stg, error: stgErr } = await supabase
          .from('stages')
          .select('id, ordem, nome, descricao')
          .eq('template_id', Number(templateId))
          .order('ordem', { ascending: true })
        if (stgErr) throw stgErr
        setStages(Array.isArray(stg) ? stg : [])
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'Erro ao carregar etapas do template.')
      }
    }
    loadStages()
  }, [templateId])

  const usersById = useMemo(() => {
    const m = new Map()
    users.forEach(u => m.set(u.id, u))
    return m
  }, [users])

  const firstStage = useMemo(() => (stages.length ? stages[0] : null), [stages])

  const onPickFiles = (e) => {
    const list = Array.from(e.target.files || [])
    setFiles(list)
  }
  const clearFiles = () => {
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCreateProcess = async () => {
    try {
      setError('')
      setSuccess('')

      if (!templateId) { setError('Selecione um template para continuar.'); return }
      if (!stages.length) { setError('Este template não possui etapas. Adicione etapas antes de iniciar um processo.'); return }
      if (!appUser?.id) { setError('Usuário da aplicação não encontrado. Recarregue a página.'); return }

      setSubmitting(true)

      // 1) cria processo (rls: with check exige criado_por = meu id)
      const { data: proc, error: pErr } = await supabase
        .from('processes')
        .insert({
          template_id: Number(templateId),
          status: 'Em andamento',
          criado_por: appUser.id
        })
        .select('id')
        .single()
      if (pErr) throw pErr
      const processId = proc?.id
      if (!processId) throw new Error('Não foi possível criar o processo.')

      // 2) cria etapas do processo
      const nowIso = new Date().toISOString()
      const psRows = stages.map((s, idx) => ({
        process_id: processId,
        stage_id: s.id,
        atribuido_para: idx === 0 && assignee ? Number(assignee) : null,
        status: idx === 0 ? 'Em andamento' : 'Pendente',
        iniciado_em: idx === 0 ? nowIso : null,
        concluido_em: null
      }))
      const { data: insertedPS, error: psErr } = await supabase
        .from('process_stages')
        .insert(psRows)
        .select('id, stage_id, status')
      if (psErr) throw psErr

      const firstStageId = firstStage?.id ?? null
      const firstPsRow =
        (firstStageId && insertedPS?.find(r => r.stage_id === firstStageId)) ||
        insertedPS?.find(r => r.status === 'Em andamento') ||
        null
      if (!firstPsRow?.id) throw new Error('Não foi possível identificar a primeira etapa do processo.')

      // 3) mensagem inicial (messages.process_stage_id)
      if (message.trim()) {
        const { error: msgErr } = await supabase.from('messages').insert({
          process_stage_id: firstPsRow.id,
          enviado_por: appUser.id,
          conteudo: message.trim()
        })
        if (msgErr) throw msgErr
      }

      // 4) anexos -> storage bucket + tabela documents
      if (files.length) {
        const STORAGE_BUCKET = import.meta.env.VITE_STORAGE_BUCKET || 'documents'
        const storage = supabase.storage.from(STORAGE_BUCKET)
        const metaRows = []
        for (const f of files) {
          const safe = String(f.name).replace(/[^\w.\-]+/g, '_')
          const path = `process/${processId}/stage/${firstPsRow.id}/${Date.now()}-${safe}`
          const { error: upErr } = await storage.upload(path, f, {
            cacheControl: '3600',
            upsert: true,
            contentType: f.type || 'application/octet-stream'
          })
          if (upErr) {
            const msg = (upErr.message || '').toLowerCase()
            if (msg.includes('bucket not found')) {
              throw new Error(`Bucket "${STORAGE_BUCKET}" não encontrado no Storage. Crie este bucket no Supabase Studio ou defina VITE_STORAGE_BUCKET para um bucket existente.`)
            }
            throw upErr
          }
          metaRows.push({
            process_stage_id: firstPsRow.id,
            nome_arquivo: f.name,
            caminho_arquivo: path,
            enviado_por: appUser.id
          })
        }
        const { error: docsErr } = await supabase.from('documents').insert(metaRows)
        if (docsErr) throw docsErr
      }

      // 5) log
      await supabase.from('logs').insert({
        process_id: processId,
        acao: `Processo criado a partir do template ${templateId}`,
        feito_por: appUser.id
      })

      setSuccess('Processo criado com sucesso.')
      setTimeout(() => navigate(`/processos/${processId}`), 450)
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'Erro ao criar processo.')
    } finally {
      setSubmitting(false)
    }
  }

  // utils
  function iniciais(nome = '') {
    const parts = String(nome).trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return 'U'
    const a = parts[0]?.[0] || ''
    const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
    return (a + b).toUpperCase()
  }

  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'
  const firstStageName = firstStage?.nome || '—'
  const assigneeName = assignee ? (usersById.get(Number(assignee))?.nome || usersById.get(Number(assignee))?.email || '—') : '—'

  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="novo-processo-page">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} onNavigate={navigate} />

      <header className={`home-header ${sidebarOpen ? 'shift' : ''}`}>
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

          <section className="np-header">
            <div className="title-wrap">
              <h1>Novo Processo</h1>
              <p className="muted">Inicie um processo a partir de um template, adicione uma mensagem inicial e anexos se precisar</p>
            </div>
          </section>

          <section className="np-card">
            <div className="np-grid">
              <div className="field">
                <label>Template</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={loading || submitting}>
                  <option value="">Selecione...</option>
                  {templates.map(t => (<option key={t.id} value={t.id}>{t.nome}</option>))}
                </select>
              </div>

              <div className="field">
                <label>Primeira Etapa</label>
                <div className="readonly">{loading ? 'Carregando...' : firstStageName}</div>
              </div>

              <div className="field">
                <label>Atribuir para</label>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={loading || submitting || !templateId}>
                  <option value="">Deixar sem atribuição</option>
                  {users.map(u => (<option key={u.id} value={u.id}>{u.nome || u.email}</option>))}
                </select>
              </div>

              <div className="field span-2">
                <label>Mensagem Inicial</label>
                <textarea rows={4} placeholder="Descreva o contexto ou detalhe a solicitação..." value={message} onChange={(e) => setMessage(e.target.value)} disabled={submitting || !templateId} />
              </div>

              <div className="field span-2">
                <label>Anexos</label>
                <div className="file-row">
                  <input ref={fileInputRef} type="file" multiple onChange={onPickFiles} disabled={submitting || !templateId} />
                  {files.length > 0 && (
                    <button type="button" className="btn-outline" onClick={clearFiles} disabled={submitting}>Limpar</button>
                  )}
                </div>
                {files.length > 0 && (
                  <ul className="files-list">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`}>
                        <span className="file-name">{f.name}</span>
                        <span className="file-meta">{(f.size / 1024).toFixed(1)} KB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="np-hint">
              <div className="hint-block">
                <div className="hint-title">Resumo</div>
                <div className="hint-line"><span className="muted">Template:</span> <b>{templateId ? (templates.find(t => t.id === Number(templateId))?.nome || '—') : '—'}</b></div>
                <div className="hint-line"><span className="muted">Primeira etapa:</span> <b>{firstStageName}</b></div>
                <div className="hint-line"><span className="muted">Atribuído para:</span> <b>{assignee ? (usersById.get(Number(assignee))?.nome || usersById.get(Number(assignee))?.email || '—') : '—'}</b></div>
              </div>

              {stages.length > 0 && (
                <div className="hint-block">
                  <div className="hint-title">Etapas do Template</div>
                  <ol className="hint-stages">
                    {stages.map((s, idx) => (
                      <li key={s.id}>
                        <span className="bubble">{idx + 1}</span>
                        <span className="stage-name" title={s.nome}>{s.nome}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="np-actions">
              <button className="btn-primary" onClick={handleCreateProcess} disabled={submitting || loading}>
                {submitting ? 'Criando...' : 'Criar Processo'}
              </button>
              <button className="btn-outline" onClick={() => navigate(-1)} disabled={submitting}>Cancelar</button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}