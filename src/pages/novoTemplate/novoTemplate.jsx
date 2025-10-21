import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './novoTemplate.css'

export default function TemplateNew() {
  const navigate = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auth + usuário da app (tabela public.users)
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // Formulário
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [etapas, setEtapas] = useState([
    { nome: '', descricao: '' }
  ])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
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
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'Não foi possível carregar informações do usuário.')
      }
    }
    init()
  }, [])

  const nomeUsuario = useMemo(() => {
    return appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'
  }, [appUser, authUser])

  // Helpers etapas
  const addEtapa = () => setEtapas(prev => [...prev, { nome: '', descricao: '' }])
  const removeEtapa = (idx) => setEtapas(prev => prev.filter((_, i) => i !== idx))
  const moveEtapa = (from, to) => {
    setEtapas(prev => {
      const arr = [...prev]
      if (to < 0 || to >= arr.length) return arr
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
  }
  const updateEtapa = (idx, field, value) => {
    setEtapas(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const validate = () => {
    if (!nome.trim()) return 'Informe um nome para o template.'
    const etapasValidas = etapas
      .map(e => ({ ...e, nome: (e.nome || '').trim(), descricao: (e.descricao || '').trim() }))
      .filter(e => e.nome.length > 0)

    if (etapasValidas.length === 0) return 'Inclua pelo menos uma etapa com nome.'
    return ''
  }

  const handleSalvar = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const v = validate()
    if (v) {
      setError(v)
      return
    }

    try {
      setSaving(true)

      // 1) Inserir template
      const payloadTemplate = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        criado_por: appUser?.id ?? null
      }

      const { data: newTemplate, error: tErr } = await supabase
        .from('templates')
        .insert(payloadTemplate)
        .select('id')
        .single()

      if (tErr) throw tErr
      const templateId = newTemplate?.id
      if (!templateId) throw new Error('Falha ao obter o ID do template.')

      // 2) Inserir etapas (stages)
      const cleanEtapas = etapas
        .map(e => ({ ...e, nome: (e.nome || '').trim(), descricao: (e.descricao || '').trim() }))
        .filter(e => e.nome.length > 0)

      const rowsStages = cleanEtapas.map((e, idx) => ({
        template_id: templateId,
        ordem: idx + 1,
        nome: e.nome,
        descricao: e.descricao || null
      }))

      if (rowsStages.length) {
        const { error: sErr } = await supabase
          .from('stages')
          .insert(rowsStages)
        if (sErr) throw sErr
      }

      setSuccess('Template criado com sucesso!')
      // Redireciona após curto delay
      setTimeout(() => navigate('/templates'), 600)
    } catch (e2) {
      console.error(e2)
      setError(e2?.message ?? 'Erro ao salvar template.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelar = () => navigate('/templates')
  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="template-new-page">
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
            <h1>Novo Template</h1>
            <p className="muted">Defina o nome, descrição e a sequência de etapas (stages).</p>
          </section>

          <section className="form-card">
            <form onSubmit={handleSalvar} className={saving ? 'is-saving' : ''}>
              <div className="grid-2">
                <div className="field">
                  <label>Nome do Template <span className="req">*</span></label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Onboarding de Cliente"
                    required
                  />
                </div>

                <div className="field">
                  <label>Descrição</label>
                  <input
                    type="text"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Descrição breve..."
                  />
                </div>
              </div>

              <div className="etapas-head">
                <h3>Etapas</h3>
                <button type="button" className="btn-secondary" onClick={addEtapa}>
                  + Adicionar etapa
                </button>
              </div>

              <ol className="etapas-list">
                {etapas.map((e, idx) => (
                  <li key={idx} className="etapa-item">
                    <div className="etapa-order" aria-hidden>{idx + 1}</div>

                    <div className="etapa-grid">
                      <div className="field">
                        <label>Nome da etapa {idx === 0 && <span className="req">*</span>}</label>
                        <input
                          type="text"
                          value={e.nome}
                          onChange={(ev) => updateEtapa(idx, 'nome', ev.target.value)}
                          placeholder="Ex.: Coleta de Documentos"
                          required={idx === 0}
                        />
                      </div>

                      <div className="field">
                        <label>Descrição da etapa</label>
                        <input
                          type="text"
                          value={e.descricao}
                          onChange={(ev) => updateEtapa(idx, 'descricao', ev.target.value)}
                          placeholder="Orientações opcionais"
                        />
                      </div>
                    </div>

                    <div className="etapa-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Mover para cima"
                        onClick={() => moveEtapa(idx, idx - 1)}
                        disabled={idx === 0}
                      >▲</button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Mover para baixo"
                        onClick={() => moveEtapa(idx, idx + 1)}
                        disabled={idx === etapas.length - 1}
                      >▼</button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remover etapa"
                        onClick={() => removeEtapa(idx)}
                        disabled={etapas.length === 1}
                      >✕</button>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={handleCancelar} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Template'}
                </button>
              </div>
            </form>
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