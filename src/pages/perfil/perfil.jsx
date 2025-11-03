import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './perfil.css'

export default function Perfil() {
  const navigate = useNavigate()

  // ui e auth
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // estado de pagina
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // formulario: nome
  const [nomeEdit, setNomeEdit] = useState('')

  // formulario: senha
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')

  // permissao cargos (so exibe atalho se tiver)
  const canManageCargos = useMemo(() => {
    const c = String(appUser?.cargo || '').toLowerCase().trim()
    return ['admin', 'chefe', 'super', 'superuser', 'gestor', 'manager'].includes(c)
  }, [appUser])

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')
        setSuccess('')

        // pega usuario autenticado
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const u = userData?.user ?? null
        setAuthUser(u)

        // pega linha do usuario na tabela users
        if (u?.id) {
          const { data: appRow, error: appErr } = await supabase
            .from('users')
            .select('id, nome, email, cargo, auth_id')
            .eq('auth_id', u.id)
            .maybeSingle()
          if (appErr) throw appErr
          setAppUser(appRow || null)
          setNomeEdit(appRow?.nome || u?.user_metadata?.name || '')
        }
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'erro ao carregar dados do perfil.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'

  // acoes
  const handleSalvarNome = async () => {
    try {
      setError('')
      setSuccess('')
      if (!appUser?.id) return
      const v = (nomeEdit || '').trim()
      if (!v) {
        setError('informe um nome valido.')
        return
      }

      setSaving(true)

      // atualiza users.nome e checa linhas afetadas
      const { data: rows, error: upErr } = await supabase
        .from('users')
        .update({ nome: v })
        .eq('id', appUser.id)
        .select('id, nome')
        .limit(1)

      if (upErr) throw upErr
      if (!rows || !rows.length) {
        setError('nenhuma linha atualizada. verifique permissoes de rls.')
        return
      }

      // reflete no estado local
      setAppUser(prev => prev ? { ...prev, nome: v } : prev)
      setSuccess('nome atualizado.')
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao salvar nome.')
    } finally {
      setSaving(false)
    }
  }

  const handleAlterarSenha = async () => {
    try {
      setError('')
      setSuccess('')

      const a = (newPass || '').trim()
      const b = (confirmPass || '').trim()

      // validacoes basicas
      if (!a || !b) {
        setError('preencha os campos de senha.')
        return
      }
      if (a !== b) {
        setError('as senhas nao conferem.')
        return
      }
      if (a.length < 8) {
        setError('a senha precisa ter pelo menos 8 caracteres.')
        return
      }

      setSaving(true)

      // supabase auth: atualiza senha do usuario atual
      const { error: upErr } = await supabase.auth.updateUser({ password: a })
      if (upErr) throw upErr

      setNewPass('')
      setConfirmPass('')
      setSuccess('senha alterada.')
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao alterar senha.')
    } finally {
      setSaving(false)
    }
  }

  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // atalhos
  const goCargos = () => navigate('/cargos')
  const goMeusProcessos = () => navigate('/processos')
  const goTemplates = () => navigate('/templates')

  return (
    <div className="profile-page">
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
          {error && <div className="pf-alert error">{error}</div>}
          {success && <div className="pf-alert success">{success}</div>}

          <section className="pf-hero">
            <div className="pf-hero-left">
              <div className="pf-avatar lg">{iniciais(nomeUsuario)}</div>
              <div className="pf-hero-meta">
                <div className="pf-hero-name">{appUser?.nome || authUser?.user_metadata?.name || '—'}</div>
                <div className="pf-hero-sub">{authUser?.email || appUser?.email || '—'}</div>
                <div className="pf-hero-chip">{appUser?.cargo || '(Sem Cargo)'}</div>
              </div>
            </div>
            <div className="pf-hero-right">
              <button className="pf-btn" onClick={goMeusProcessos}>Meus Processos</button>
              <button className="pf-btn" onClick={goTemplates}>Templates</button>
              {canManageCargos && <button className="pf-btn" onClick={goCargos}>Gerenciar Cargos</button>}
            </div>
          </section>

          <section className="pf-grid">
            <div className="pf-card">
              <div className="pf-card-head"><h3>MEU PERFIL</h3></div>
              <div className="pf-card-body">
                {loading ? (
                  <div className="pf-skeleton">
                    <div className="skl" style={{ width: '60%', height: 14 }} />
                    <div className="skl" style={{ width: '80%', height: 14 }} />
                    <div className="skl" style={{ width: '40%', height: 14 }} />
                  </div>
                ) : (
                  <>
                    <div className="pf-row">
                      <div className="pf-k">Nome</div>
                      <div className="pf-v">
                        <input
                          type="text"
                          value={nomeEdit}
                          placeholder="Seu nome"
                          onChange={(e) => setNomeEdit(e.target.value)}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    <div className="pf-row">
                      <div className="pf-k">E-mail</div>
                      <div className="pf-v"><span className="pf-readonly">{authUser?.email || '—'}</span></div>
                    </div>
                    <div className="pf-row">
                      <div className="pf-k">Cargo</div>
                      <div className="pf-v"><span className="pf-readonly">{appUser?.cargo || '(Sem Cargo)'}</span></div>
                    </div>
                    <div className="pf-actions">
                      <button className="pf-btn primary" onClick={handleSalvarNome} disabled={saving}>Salvar</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="pf-card">
              <div className="pf-card-head"><h3>SEGURANÇA</h3></div>
              <div className="pf-card-body">
                <div className="pf-row">
                  <div className="pf-k">Nova senha</div>
                  <div className="pf-v">
                    <input
                      type="password"
                      value={newPass}
                      placeholder="Digite a nova senha"
                      onChange={(e) => setNewPass(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="pf-row">
                  <div className="pf-k">Confirmar senha</div>
                  <div className="pf-v">
                    <input
                      type="password"
                      value={confirmPass}
                      placeholder="Confirme a nova senha"
                      onChange={(e) => setConfirmPass(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="pf-actions">
                  <button className="pf-btn" onClick={() => { setNewPass(''); setConfirmPass('') }} disabled={saving}>Limpar</button>
                  <button className="pf-btn primary" onClick={handleAlterarSenha} disabled={saving}>Alterar senha</button>
                </div>
                <div className="pf-note">
                  dica: use no minimo 8 caracteres com letras e numeros.
                </div>
              </div>
            </div>

            <div className="pf-card">
              <div className="pf-card-head"><h3>SESSÃO</h3></div>
              <div className="pf-card-body">
                <p className="pf-text">Encerre sua sessão atual neste dispositivo.</p>
                <div className="pf-actions">
                  <button className="pf-btn" onClick={handleSair}>Sair da sessão</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function iniciais(nome = '') {
  // gera iniciais do nome
  const parts = String(nome).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (a + b).toUpperCase()
}