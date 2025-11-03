import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './visualizarProcesso.css'

const STORAGE_BUCKET = import.meta.env.VITE_STORAGE_BUCKET || 'documents'

export default function visualizarProcesso() {
  const navigate = useNavigate()
  const { id } = useParams()
  const processId = Number(id)

  // ui e auth
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // estado
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // dados principais
  const [processo, setProcesso] = useState(null)
  const [template, setTemplate] = useState(null)
  const [stageDefs, setStageDefs] = useState([])
  const [procStages, setProcStages] = useState([])
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])

  // selecao
  const [selectedStageId, setSelectedStageId] = useState(null)

  // mensagens e documentos
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [documents, setDocuments] = useState([])

  // preview
  const [previewDoc, setPreviewDoc] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      try {
        if (!processId) {
          setError('processo invalido.')
          return
        }

        setLoading(true)
        setError('')
        setSuccess('')

        // auth e usuario
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

        // processo
        const { data: p, error: pErr } = await supabase
          .from('processes')
          .select('id, template_id, status, criado_por, criado_em')
          .eq('id', processId)
          .single()
        if (pErr) throw pErr
        setProcesso(p)

        // template
        if (p?.template_id) {
          const { data: t, error: tErr } = await supabase
            .from('templates')
            .select('id, nome, descricao')
            .eq('id', p.template_id)
            .maybeSingle()
          if (tErr) throw tErr
          setTemplate(t)
        }

        // defs
        const { data: defs, error: dErr } = await supabase
          .from('stages')
          .select('id, ordem, nome, descricao')
          .eq('template_id', p.template_id)
          .order('ordem', { ascending: true })
        if (dErr) throw dErr
        setStageDefs(Array.isArray(defs) ? defs : [])

        // etapas do processo
        const { data: ps, error: psErr } = await supabase
          .from('process_stages')
          .select('id, process_id, stage_id, atribuido_para, status, iniciado_em, concluido_em, cargo_snapshot')
          .eq('process_id', processId)
        if (psErr) throw psErr
        const listPS = Array.isArray(ps) ? ps : []
        setProcStages(listPS)

        // selecao padrao
        const cur = pickCurrentStage(listPS, defs || [])
        setSelectedStageId(cur?.stage_id || listPS[0]?.stage_id || null)

        // usuarios
        const { data: us, error: uErr } = await supabase
          .from('users')
          .select('id, nome, email, cargo')
          .order('nome', { ascending: true })
        if (uErr) throw uErr
        setUsers(Array.isArray(us) ? us : [])

        // logs
        const { data: lg, error: lErr } = await supabase
          .from('logs')
          .select('id, process_id, acao, feito_por, data')
          .eq('process_id', processId)
          .order('data', { ascending: false })
          .limit(30)
        if (lErr) throw lErr
        setLogs(Array.isArray(lg) ? lg : [])
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'erro ao carregar processo.')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [processId])

  // realtime basico
  useEffect(() => {
    if (!processId) return
    const ch = supabase
      .channel(`process-view-${processId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'process_stages', filter: `process_id=eq.${processId}` },
        payload => {
          setProcStages(prev => {
            if (payload.eventType === 'DELETE') return prev.filter(r => r.id !== payload.old.id)
            if (payload.eventType === 'INSERT') return prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new]
            if (payload.eventType === 'UPDATE') return prev.map(r => (r.id === payload.new.id ? payload.new : r))
            return prev
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'processes', filter: `id=eq.${processId}` },
        payload => {
          setProcesso(prev => ({ ...(prev || {}), ...(payload.new || {}) }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [processId])

  // carrega mensagens e documentos ao trocar etapa selecionada
  useEffect(() => {
    const loadSide = async () => {
      try {
        if (!selectedStageId || !procStages.length) {
          setMessages([])
          setDocuments([])
          return
        }
        const psRow = procStages.find(x => x.stage_id === selectedStageId)
        if (!psRow) return

        const { data: msgs, error: mErr } = await supabase
          .from('messages')
          .select('id, process_stage_id, enviado_por, conteudo, enviado_em')
          .eq('process_stage_id', psRow.id)
          .order('enviado_em', { ascending: true })
        if (mErr) throw mErr
        setMessages(Array.isArray(msgs) ? msgs : [])

        const { data: docs, error: dErr } = await supabase
          .from('documents')
          .select('id, process_stage_id, nome_arquivo, caminho_arquivo, enviado_por, enviado_em')
          .eq('process_stage_id', psRow.id)
          .order('enviado_em', { ascending: false })
        if (dErr) throw dErr

        const docsWithUrls = await enrichWithSignedUrls(Array.isArray(docs) ? docs : [])
        setDocuments(docsWithUrls)
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'erro ao carregar dados da etapa.')
      }
    }
    loadSide()
  }, [selectedStageId, procStages])

  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'

  // mapas
  const defsById = useMemo(() => {
    const m = new Map()
    stageDefs.forEach(s => m.set(s.id, s))
    return m
  }, [stageDefs])

  const usersById = useMemo(() => {
    const m = new Map()
    users.forEach(u => m.set(u.id, u))
    return m
  }, [users])

  const procStagesSorted = useMemo(() => {
    const arr = [...procStages]
    arr.sort((a, b) => {
      const oa = defsById.get(a.stage_id)?.ordem ?? 0
      const ob = defsById.get(b.stage_id)?.ordem ?? 0
      return oa - ob
    })
    return arr
  }, [procStages, defsById])

  const currentStage = useMemo(() => pickCurrentStage(procStagesSorted, stageDefs), [procStagesSorted, stageDefs])

  // helpers
  function pickCurrentStage(listPS, defs) {
    const byId = new Map()
    defs.forEach(d => byId.set(d.id, d))
    const sorted = [...listPS].sort((a, b) => {
      const oa = byId.get(a.stage_id)?.ordem ?? 0
      const ob = byId.get(b.stage_id)?.ordem ?? 0
      return oa - ob
    })
    const notDone = sorted.find(s => normalizeStatus(s.status) !== 'Concluído')
    return notDone || sorted[sorted.length - 1] || null
  }

  function normalizeStatus(str) {
    if (!str) return '—'
    const v = String(str).toLowerCase()
    if (v.includes('andamento')) return 'Em andamento'
    if (v.includes('conclu')) return 'Concluído'
    if (v.includes('pendente')) return 'Pendente'
    if (v.includes('bloque')) return 'Bloqueado'
    return str
  }

  function formatDateTime(iso) {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return '—'
    }
  }

  const isFirstStage = (stageId) => {
    if (!stageId || !stageDefs.length) return false
    const minOrder = Math.min(...stageDefs.map(d => d.ordem ?? 0))
    const ord = stageDefs.find(d => d.id === stageId)?.ordem ?? 0
    return ord === minOrder
  }

  const getSelectedProcStageRow = () => {
    if (!selectedStageId) return null
    return procStages.find(x => x.stage_id === selectedStageId) || null
  }

  const canConcludeSelected = useMemo(() => {
    const row = getSelectedProcStageRow()
    if (!row || !appUser?.id) return false
    return row.atribuido_para === appUser.id
  }, [selectedStageId, procStages, appUser])

  // documentos: gerar urls e tratar erros
  async function enrichWithSignedUrls(list) {
    const out = await Promise.all(
      list.map(async (d) => {
        try {
          const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(d.caminho_arquivo, 60 * 10)
          if (error) {
            return { ...d, view_url: null, view_err: error.message || 'erro ao gerar url', mime: guessMime(d.nome_arquivo) }
          }
          return { ...d, view_url: data?.signedUrl || null, view_err: null, mime: guessMime(d.nome_arquivo) }
        } catch (e) {
          return { ...d, view_url: null, view_err: e?.message || 'erro ao gerar url', mime: guessMime(d.nome_arquivo) }
        }
      })
    )
    return out
  }

  function guessMime(name = '') {
    const ext = String(name).split('.').pop()?.toLowerCase() || ''
    const map = {
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
      mp3: 'audio/mpeg', wav: 'audio/wav',
      csv: 'text/csv', txt: 'text/plain',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }
    return map[ext] || 'application/octet-stream'
  }

  async function regenerateSignedUrl(docId) {
    try {
      const idx = documents.findIndex(d => d.id === docId)
      if (idx === -1) return
      const d = documents[idx]
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(d.caminho_arquivo, 60 * 10)
      setDocuments(prev => {
        const next = [...prev]
        next[idx] = { ...d, view_url: data?.signedUrl || null, view_err: error?.message || null }
        return next
      })
    } catch (e) {
      setDocuments(prev => {
        const i2 = prev.findIndex(x => x.id === docId)
        if (i2 === -1) return prev
        const d2 = prev[i2]
        const next = [...prev]
        next[i2] = { ...d2, view_url: null, view_err: e?.message || 'erro ao gerar url' }
        return next
      })
    }
  }

  // acoes principais (concluir/atribuir iguais ao que ja ajustei antes)
  const handleAdvanceStage = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const targetRow = getSelectedProcStageRow() || currentStage
      if (!targetRow) {
        setError('nenhuma etapa para concluir.')
        return
      }
      if (targetRow.atribuido_para !== appUser?.id) {
        setError('so o responsavel pode concluir esta etapa.')
        return
      }

      const nowIso = new Date().toISOString()
      const ordemAtual = defsById.get(targetRow.stage_id)?.ordem ?? 0

      const { error: upErr } = await supabase
        .from('process_stages')
        .update({ status: 'Concluído', concluido_em: nowIso })
        .eq('id', targetRow.id)
      if (upErr) throw upErr

      const proximo = procStages
        .filter(ps => (defsById.get(ps.stage_id)?.ordem ?? 0) > ordemAtual)
        .sort((a, b) => (defsById.get(a.stage_id)?.ordem ?? 0) - (defsById.get(b.stage_id)?.ordem ?? 0))[0]

      if (proximo) {
        const { error: nextErr } = await supabase
          .from('process_stages')
          .update({ status: 'Em andamento', iniciado_em: nowIso })
          .eq('id', proximo.id)
        if (nextErr) throw nextErr
      } else {
        const { error: pErr } = await supabase
          .from('processes')
          .update({ status: 'Concluído' })
          .eq('id', processId)
        if (pErr) throw pErr
      }

      await supabase.from('logs').insert({
        process_id: processId,
        acao: 'etapa concluida',
        feito_por: appUser?.id ?? null
      })

      await Promise.all([reloadProcStages(), reloadLogs()])
      setSuccess('etapa concluida.')
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao concluir etapa.')
    } finally {
      setSaving(false)
    }
  }

  const handleAssignToMe = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const targetRow = getSelectedProcStageRow() || currentStage
      if (!targetRow) {
        setError('nenhuma etapa selecionada.')
        return
      }
      if (isFirstStage(targetRow.stage_id)) {
        setError('a atribuicao da primeira etapa e fixa.')
        return
      }

      const { error: upErr } = await supabase
        .from('process_stages')
        .update({ atribuido_para: appUser?.id ?? null })
        .eq('id', targetRow.id)
      if (upErr) throw upErr

      await supabase.from('logs').insert({
        process_id: processId,
        acao: 'etapa atribuida para mim',
        feito_por: appUser?.id ?? null
      })

      await reloadProcStages()
      setSuccess('etapa atribuida.')
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao atribuir etapa.')
    } finally {
      setSaving(false)
    }
  }

  const handleClearAssignment = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const targetRow = getSelectedProcStageRow() || currentStage
      if (!targetRow) {
        setError('nenhuma etapa selecionada.')
        return
      }
      if (isFirstStage(targetRow.stage_id)) {
        setError('a atribuicao da primeira etapa e fixa.')
        return
      }

      const { error: upErr } = await supabase
        .from('process_stages')
        .update({ atribuido_para: null })
        .eq('id', targetRow.id)
      if (upErr) throw upErr

      await supabase.from('logs').insert({
        process_id: processId,
        acao: 'atribuicao removida',
        feito_por: appUser?.id ?? null
      })

      await reloadProcStages()
      setSuccess('atribuicao removida.')
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao remover atribuicao.')
    } finally {
      setSaving(false)
    }
  }

  const handleAssignToUser = async (userId) => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const targetRow = getSelectedProcStageRow() || currentStage
      if (!targetRow) {
        setError('nenhuma etapa selecionada.')
        return
      }
      if (isFirstStage(targetRow.stage_id)) {
        setError('a atribuicao da primeira etapa e fixa.')
        return
      }

      const targetUserId = userId === '' ? null : Number(userId) || null

      const { error: upErr } = await supabase
        .from('process_stages')
        .update({ atribuido_para: targetUserId })
        .eq('id', targetRow.id)
      if (upErr) throw upErr

      await supabase.from('logs').insert({
        process_id: processId,
        acao: targetUserId ? `etapa atribuida ao usuario id ${targetUserId}` : 'etapa sem responsavel',
        feito_por: appUser?.id ?? null
      })

      await reloadProcStages()
      setSuccess('atribuicao atualizada.')
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao atribuir ao usuario.')
    } finally {
      setSaving(false)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    try {
      setError('')
      setSuccess('')

      const content = (newMessage || '').trim()
      if (!content) return
      const psRow = getSelectedProcStageRow()
      if (!psRow) return

      const { error: insErr } = await supabase
        .from('messages')
        .insert({
          process_stage_id: psRow.id,
          enviado_por: appUser?.id ?? null,
          conteudo: content
        })
      if (insErr) throw insErr

      setNewMessage('')
      await reloadMessages(psRow.id)
    } catch (e2) {
      console.error(e2)
      setError(e2?.message ?? 'erro ao enviar mensagem.')
    }
  }

  const handleUploadDoc = async (e) => {
    try {
      const file = e.target.files?.[0]
      if (!file) return
      setSaving(true)
      setError('')
      setSuccess('')

      const psRow = getSelectedProcStageRow()
      if (!psRow) {
        setError('estagio invalido para upload.')
        return
      }

      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `${processId}/${psRow.stage_id}/${Date.now()}_${safeName}`

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type })
      if (upErr) {
        if (/bucket not found/i.test(upErr.message || '')) {
          setError(`bucket "${STORAGE_BUCKET}" nao encontrado. crie o bucket ou ajuste VITE_STORAGE_BUCKET.`)
        } else {
          setError(upErr.message || 'erro ao enviar arquivo.')
        }
        return
      }

      const { error: insErr } = await supabase
        .from('documents')
        .insert({
          process_stage_id: psRow.id,
          nome_arquivo: file.name,
          caminho_arquivo: path,
          enviado_por: appUser?.id ?? null
        })
      if (insErr) throw insErr

      await reloadDocuments(psRow.id)
      setSuccess('documento enviado.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e2) {
      console.error(e2)
      setError(e2?.message ?? 'erro ao enviar documento.')
    } finally {
      setSaving(false)
    }
  }

  const reloadProcStages = async () => {
    const { data: ps, error: psErr } = await supabase
      .from('process_stages')
      .select('id, process_id, stage_id, atribuido_para, status, iniciado_em, concluido_em, cargo_snapshot')
      .eq('process_id', processId)
    if (psErr) throw psErr
    setProcStages(Array.isArray(ps) ? ps : [])
  }

  const reloadLogs = async () => {
    const { data: lg, error: lErr } = await supabase
      .from('logs')
      .select('id, process_id, acao, feito_por, data')
      .eq('process_id', processId)
      .order('data', { ascending: false })
      .limit(30)
    if (lErr) throw lErr
    setLogs(Array.isArray(lg) ? lg : [])
  }

  const reloadMessages = async (procStageRowId) => {
    const { data: msgs, error: mErr } = await supabase
      .from('messages')
      .select('id, process_stage_id, enviado_por, conteudo, enviado_em')
      .eq('process_stage_id', procStageRowId)
      .order('enviado_em', { ascending: true })
    if (mErr) throw mErr
    setMessages(Array.isArray(msgs) ? msgs : [])
  }

  const reloadDocuments = async (procStageRowId) => {
    const { data: docs, error: dErr } = await supabase
      .from('documents')
      .select('id, process_stage_id, nome_arquivo, caminho_arquivo, enviado_por, enviado_em')
      .eq('process_stage_id', procStageRowId)
      .order('enviado_em', { ascending: false })
    if (dErr) throw dErr
    const docsWithUrls = await enrichWithSignedUrls(Array.isArray(docs) ? docs : [])
    setDocuments(docsWithUrls)
  }

  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }
  const handleBack = () => navigate(-1)

  return (
    <div className="process-view-page">
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
          {error && <div className="pv-alert error">{error}</div>}
          {success && <div className="pv-alert success">{success}</div>}

          <section className="pv-header">
            <div className="pv-title">
              <button className="pv-btn-ghost" onClick={handleBack}>← Voltar</button>
              <h1>
                {template?.nome || 'Processo'} <span className="pv-mono">#{processo?.id}</span>
              </h1>
              <span className={`pv-status ${normalizeStatus(processo?.status) === 'Concluído' ? 'ok' : 'run'}`}>
                {normalizeStatus(processo?.status || '')}
              </span>
            </div>
            <div className="pv-meta">
              <div><span className="pv-label">Criado em</span> {formatDateTime(processo?.criado_em)}</div>
              <div><span className="pv-label">Template</span> {template?.nome || '—'}</div>
            </div>
          </section>

          <section className="pv-content">
            <div className="pv-left">
              <div className="pv-card">
                <div className="pv-card-head">
                  <h3>Etapas</h3>
                </div>
                <ul className="pv-stages">
                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <li key={i} className="pv-stage skeleton">
                        <div className="pv-stage-order skl" />
                        <div className="pv-stage-body">
                          <div className="pv-stage-title skl" />
                          <div className="pv-stage-sub skl" />
                        </div>
                      </li>
                    ))
                  ) : procStagesSorted.length === 0 ? (
                    <li className="pv-empty">Nenhuma etapa criada para este processo.</li>
                  ) : (
                    procStagesSorted.map(ps => {
                      const def = defsById.get(ps.stage_id)
                      const att = ps.atribuido_para ? usersById.get(ps.atribuido_para) : null
                      const isSel = selectedStageId === ps.stage_id
                      const firstLock = isFirstStage(ps.stage_id)
                      return (
                        <li
                          key={ps.id}
                          className={`pv-stage ${isSel ? 'active' : ''}`}
                          onClick={() => setSelectedStageId(ps.stage_id)}
                        >
                          <div className={`pv-stage-order ${normalizeStatus(ps.status) === 'Concluído' ? 'done' : normalizeStatus(ps.status) === 'Em andamento' ? 'run' : ''}`}>
                            {def?.ordem ?? '—'}
                          </div>
                          <div className="pv-stage-body">
                            <div className="pv-stage-title">{def?.nome || '—'}</div>
                            <div className="pv-stage-sub">
                              <span className={`pv-chip ${normalizeStatus(ps.status) === 'Concluído' ? 'ok' : normalizeStatus(ps.status) === 'Em andamento' ? 'run' : ''}`}>
                                {normalizeStatus(ps.status)}
                              </span>
                              <span className="pv-dot">•</span>
                              <span className="pv-small">
                                {att ? (att.nome || att.email) : 'Sem responsável'}
                                {firstLock ? ' (fixo)' : ''}
                              </span>
                            </div>
                          </div>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            </div>

            <div className="pv-right">
              <div className="pv-card">
                <div className="pv-card-head pv-row">
                  <h3>Etapa Selecionada</h3>
                  <div className="pv-actions">
                    <button className="pv-btn" onClick={handleAssignToMe} disabled={saving || isFirstStage(selectedStageId)}>Atribuir para mim</button>
                    <button className="pv-btn" onClick={handleClearAssignment} disabled={saving || isFirstStage(selectedStageId)}>Remover atribuição</button>
                    <button className="pv-btn primary" onClick={handleAdvanceStage} disabled={saving || !canConcludeSelected}>Concluir etapa</button>
                  </div>
                </div>

                <div className="pv-stage-details">
                  {selectedStageId ? (
                    <>
                      <div className="pv-kv">
                        <div className="pv-k"><span>Ordem</span></div>
                        <div className="pv-v">{stageDefs.find(d => d.id === selectedStageId)?.ordem ?? '—'}</div>
                      </div>
                      <div className="pv-kv">
                        <div className="pv-k"><span>Nome</span></div>
                        <div className="pv-v">{stageDefs.find(d => d.id === selectedStageId)?.nome || '—'}</div>
                      </div>
                      <div className="pv-kv">
                        <div className="pv-k"><span>Descrição</span></div>
                        <div className="pv-v">{stageDefs.find(d => d.id === selectedStageId)?.descricao || '—'}</div>
                      </div>
                      <div className="pv-kv">
                        <div className="pv-k"><span>Atribuído para</span></div>
                        <div className="pv-v">
                          <select
                            className="pv-select"
                            onChange={(e) => handleAssignToUser(e.target.value)}
                            value={(() => {
                              const row = procStages.find(x => x.stage_id === selectedStageId)
                              return row?.atribuido_para ?? ''
                            })()}
                            disabled={isFirstStage(selectedStageId)}
                            title={isFirstStage(selectedStageId) ? 'atribuicao da primeira etapa e fixa (definida na criacao)' : ''}
                          >
                            <option value="">— Sem responsável —</option>
                            {users.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.nome || u.email} {u.cargo ? `(${u.cargo})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="pv-empty">Selecione uma etapa ao lado.</div>
                  )}
                </div>
              </div>

              <div className="pv-grid-2">
                <div className="pv-card">
                  <div className="pv-card-head"><h3>Mensagens</h3></div>
                  <div className="pv-panel">
                    <div className="pv-messages">
                      {messages.length === 0 ? (
                        <div className="pv-empty">Nenhuma mensagem.</div>
                      ) : (
                        messages.map(m => {
                          const u = usersById.get(m.enviado_por)
                          return (
                            <div className="pv-msg" key={m.id}>
                              <div className="pv-msg-head">
                                <span className="pv-msg-user">{u?.nome || u?.email || 'Usuário'}</span>
                                <span className="pv-msg-time">{formatDateTime(m.enviado_em)}</span>
                              </div>
                              <div className="pv-msg-body">{m.conteudo}</div>
                            </div>
                          )
                        })
                      )}
                    </div>
                    <form className="pv-msg-form" onSubmit={handleSendMessage}>
                      <input
                        type="text"
                        placeholder="Escreva uma mensagem..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                      />
                      <button className="pv-btn primary" type="submit" disabled={!selectedStageId || saving}>
                        Enviar
                      </button>
                    </form>
                  </div>
                </div>

                <div className="pv-card">
                  <div className="pv-card-head"><h3>Documentos</h3></div>
                  <div className="pv-panel">
                    <div className="pv-docs">
                      {documents.length === 0 ? (
                        <div className="pv-empty">Nenhum documento enviado.</div>
                      ) : (
                        <table className="pv-doc-table">
                          <thead>
                            <tr>
                              <th>Arquivo</th>
                              <th>Enviado por</th>
                              <th>Enviado em</th>
                              <th style={{ width: 220 }}>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {documents.map(d => {
                              const u = usersById.get(d.enviado_por)
                              const hasUrl = !!d.view_url
                              return (
                                <tr key={d.id}>
                                  <td className="pv-strong" title={d.nome_arquivo}>{d.nome_arquivo}</td>
                                  <td>{u?.nome || u?.email || '—'}</td>
                                  <td>{formatDateTime(d.enviado_em)}</td>
                                  <td className="pv-doc-actions">
    
                                    <a
                                      className="pv-btn"
                                      href={hasUrl ? d.view_url : '#'}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => { if (!hasUrl) e.preventDefault() }}
                                      title={hasUrl ? 'abrir em nova aba' : (d.view_err || 'gerar link para abrir')}
                                    >
                                      Abrir
                                    </a>
                                    {!hasUrl && (
                                      <button
                                        className="pv-btn"
                                        onClick={() => regenerateSignedUrl(d.id)}
                                        title="tentar gerar link novamente"
                                      >
                                        Gerar Link
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="pv-upload">
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleUploadDoc}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pv-card">
                <div className="pv-card-head"><h3>Logs</h3></div>
                <div className="pv-logs">
                  {logs.length === 0 ? (
                    <div className="pv-empty">Sem logs.</div>
                  ) : (
                    <ul className="pv-log-list">
                      {logs.map(l => {
                        const u = usersById.get(l.feito_por)
                        return (
                          <li key={l.id} className="pv-log-item">
                            <span className="pv-log-time">{formatDateTime(l.data)}</span>
                            <span className="pv-log-dot">•</span>
                            <span className="pv-log-text">{l.acao}</span>
                            <span className="pv-log-author">({u?.nome || u?.email || '—'})</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          </section>
        </div>

        {previewDoc && (
          <div className="pv-modal" role="dialog" aria-modal="true">
            <div className="pv-modal-content">
              <div className="pv-modal-head">
                <div className="pv-modal-title" title={previewDoc.nome_arquivo}>
                  {previewDoc.nome_arquivo}
                </div>
                <div className="pv-modal-actions">
                  <a className="pv-btn" href={previewDoc.view_url || '#'} target="_blank" rel="noreferrer">Abrir em nova aba</a>
                  <a className="pv-btn primary" href={previewDoc.view_url || '#'} download>Baixar</a>
                  <button className="pv-btn" onClick={() => setPreviewDoc(null)}>Fechar</button>
                </div>
              </div>
              <div className="pv-modal-body">
                {(() => {
                  const url = previewDoc.view_url
                  const mime = previewDoc.mime || ''
                  if (!url) return <div className="pv-empty">sem url para visualizar.</div>
                  if (mime.startsWith('image/')) return <img className="pv-preview-img" src={url} alt={previewDoc.nome_arquivo} />
                  if (mime === 'application/pdf') return <iframe className="pv-preview-frame" src={url} title="preview-pdf" />
                  if (mime.startsWith('video/')) return <video className="pv-preview-media" src={url} controls />
                  if (mime.startsWith('audio/')) return <audio className="pv-preview-audio" src={url} controls />
                  return (
                    <div className="pv-preview-fallback">
                      <p>visualizacao inline nao suportada para este tipo de arquivo.</p>
                      <a className="pv-btn" href={url} target="_blank" rel="noreferrer">Abrir</a>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
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