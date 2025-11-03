import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Sidebar from '../../components/sidebar/sidebar'
import './Cargos.css'

export default function Cargos() {
  const navigate = useNavigate()

  // ui e auth
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [appUser, setAppUser] = useState(null)

  // estado
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  // dados
  const [users, setUsers] = useState([])

  // selecao e edicao
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [novoCargo, setNovoCargo] = useState('')
  const [renameFrom, setRenameFrom] = useState('')
  const [renameTo, setRenameTo] = useState('')

  // permissao
  const isAdmin = useMemo(() => {
    const c = (appUser?.cargo || '').toLowerCase()
    return ['admin', 'chefe', 'super', 'superuser', 'gestor', 'manager'].includes(c)
  }, [appUser])

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        setError('')
        setSuccess('')

        // auth
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

        // usuarios
        const { data: us, error: uErr } = await supabase
          .from('users')
          .select('id, nome, email, cargo')
          .order('nome', { ascending: true })
        if (uErr) throw uErr
        setUsers(Array.isArray(us) ? us : [])
      } catch (e) {
        console.error(e)
        setError(e?.message ?? 'erro ao carregar dados.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // agregacao de cargos
  const cargosAgg = useMemo(() => {
    const map = new Map()
    users.forEach(u => {
      const c = u.cargo || '(Sem Cargo)'
      map.set(c, (map.get(c) || 0) + 1)
    })
    const list = Array.from(map.entries()).map(([cargo, count]) => ({ cargo, count }))
    list.sort((a, b) => a.cargo.localeCompare(b.cargo))
    return list
  }, [users])

  // selecao
  const toggleUser = (id) => {
    setSelectedUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const allSelected = selectedUserIds.length && selectedUserIds.length === users.length
  const toggleAll = () => {
    setSelectedUserIds(prev => prev.length === users.length ? [] : users.map(u => u.id))
  }

  // acoes
  const handleAtribuirCargo = async () => {
    try {
      setError('')
      setSuccess('')
      if (!isAdmin) {
        setError('sem permissao para alterar cargos.')
        return
      }
      const val = (novoCargo || '').trim()
      if (!val) {
        setError('informe um cargo para atribuir.')
        return
      }
      if (selectedUserIds.length === 0) {
        setError('selecione ao menos um funcionario.')
        return
      }

      setSaving(true)

      // usa select('id') para checar linhas afetadas (evita falso sucesso com rls)
      const { data: updatedRows, error: upErr } = await supabase
        .from('users')
        .update({ cargo: val })
        .in('id', selectedUserIds)
        .select('id')

      if (upErr) throw upErr

      const affectedIds = (updatedRows || []).map(r => r.id)
      if (!affectedIds.length) {
        setError('nenhuma linha foi atualizada. verifique suas permissoes de rls.')
        return
      }

      // atualiza estado somente com os ids realmente afetados
      const affectedSet = new Set(affectedIds)
      const updated = users.map(u => affectedSet.has(u.id) ? { ...u, cargo: val } : u)
      setUsers(updated)
      setSelectedUserIds([])
      setNovoCargo('')
      setSuccess('cargo atribuido com sucesso.')
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao atribuir cargo.')
    } finally {
      setSaving(false)
    }
  }

  const handleRenomearCargo = async () => {
    try {
      setError('')
      setSuccess('')
      if (!isAdmin) {
        setError('sem permissao para renomear cargos.')
        return
      }
      const from = (renameFrom || '').trim()
      const to = (renameTo || '').trim()
      if (!from || !to) {
        setError('preencha os campos de renomear cargo.')
        return
      }

      setSaving(true)

      const { data: updatedRows, error: upErr } = await supabase
        .from('users')
        .update({ cargo: to })
        .eq('cargo', from)
        .select('id')

      if (upErr) throw upErr

      const affectedIds = (updatedRows || []).map(r => r.id)
      if (!affectedIds.length) {
        setError('nenhuma linha foi atualizada. verifique se ha usuarios com esse cargo e as permissoes de rls.')
        return
      }

      const affectedSet = new Set(affectedIds)
      const updated = users.map(u => affectedSet.has(u.id) ? { ...u, cargo: to } : u)
      setUsers(updated)
      setRenameFrom('')
      setRenameTo('')
      setSuccess(`cargo "${from}" renomeado para "${to}".`)
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao renomear cargo.')
    } finally {
      setSaving(false)
    }
  }

  const handleLimparCargo = async (cargoAlvo) => {
    try {
      setError('')
      setSuccess('')
      if (!isAdmin) {
        setError('sem permissao para alterar cargos.')
        return
      }
      const ok = window.confirm(`remover cargo de todos com "${cargoAlvo}"?`)
      if (!ok) return

      setSaving(true)

      const { data: updatedRows, error: upErr } = await supabase
        .from('users')
        .update({ cargo: null })
        .eq('cargo', cargoAlvo)
        .select('id')

      if (upErr) throw upErr

      const affectedIds = (updatedRows || []).map(r => r.id)
      if (!affectedIds.length) {
        setError('nenhuma linha foi atualizada. verifique suas permissoes de rls.')
        return
      }

      const affectedSet = new Set(affectedIds)
      const updated = users.map(u => affectedSet.has(u.id) ? { ...u, cargo: null } : u)
      setUsers(updated)
      setSuccess(`cargo "${cargoAlvo}" removido dos funcionarios.`)
    } catch (e) {
      console.error(e)
      setError(e?.message ?? 'erro ao limpar cargo.')
    } finally {
      setSaving(false)
    }
  }

  const handleSair = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const nomeUsuario = appUser?.nome || authUser?.user_metadata?.name || authUser?.email || 'Usuário'

  return (
    <div className="cargos-page">
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
          {error && <div className="alert error">{error}</div>}
          {success && <div className="alert success">{success}</div>}

          <section className="cg-grid">
            <div className="cg-card">
              <div className="cg-card-head">
                <h3>Cargos</h3>
              </div>

              <div className="cg-cargos-list">
                {cargosAgg.map(item => (
                  <div className="cg-cargo-row" key={item.cargo}>
                    <div className="cg-cargo-name" title={item.cargo}>{item.cargo}</div>
                    <div className="cg-cargo-count">{item.count} Usuário(s)</div>
                    <div className="cg-cargo-actions">
                      <button
                        className="cg-btn-ghost"
                        onClick={() => handleLimparCargo(item.cargo)}
                        disabled={!isAdmin || saving}
                      >
                        Remover De Todos
                      </button>
                    </div>
                  </div>
                ))}
                {cargosAgg.length === 0 && <div className="cg-empty">Nenhum cargo encontrado.</div>}
              </div>

              <div className="cg-divider" />

              <div className="cg-rename">
                <div className="cg-field">
                  <label>Renomear De</label>
                  <input
                    type="text"
                    placeholder="Ex.: Atendente"
                    value={renameFrom}
                    onChange={(e) => setRenameFrom(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="cg-field">
                  <label>Para</label>
                  <input
                    type="text"
                    placeholder="Ex.: Suporte Nível 1"
                    value={renameTo}
                    onChange={(e) => setRenameTo(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <button className="cg-btn-primary" onClick={handleRenomearCargo} disabled={!isAdmin || saving}>
                  Renomear Cargo
                </button>
              </div>
            </div>

            <div className="cg-card">
              <div className="cg-card-head">
                <h3>Funcionários</h3>
              </div>

              <div className="cg-toolbar">
                <div className="cg-left">
                  <label className="cg-check">
                    <input
                      type="checkbox"
                      checked={!!allSelected}
                      onChange={toggleAll}
                      disabled={!isAdmin || saving}
                    />
                    <span>Selecionar Todos</span>
                  </label>
                </div>
                <div className="cg-right">
                  <input
                    type="text"
                    placeholder="Cargo para atribuir (Ex.: Chefe)"
                    value={novoCargo}
                    onChange={(e) => setNovoCargo(e.target.value)}
                    disabled={!isAdmin || saving}
                  />
                  <button className="cg-btn-primary" onClick={handleAtribuirCargo} disabled={!isAdmin || saving}>
                    Atribuir Cargo
                  </button>
                </div>
              </div>

              <div className="cg-table-scroll">
                <table className="cg-table">
                  <colgroup>
                    <col style={{ width: 56 }} />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Nome</th>
                      <th>Email</th>
                      <th>Cargo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <SkeletonRows rows={6} cols={4} />
                    ) : users.length === 0 ? (
                      <tr><td colSpan={4} className="cg-empty">Nenhum funcionário encontrado.</td></tr>
                    ) : (
                      users.map(u => (
                        <tr key={u.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={() => toggleUser(u.id)}
                              disabled={!isAdmin || saving}
                            />
                          </td>
                          <td className="cg-strong">{u.nome}</td>
                          <td>{u.email}</td>
                          <td>{u.cargo || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!isAdmin && (
                <div className="cg-alert info" style={{ marginTop: 10 }}>
                  Seu cargo não permite editar. Fale com um Chefe/Admin.
                </div>
              )}
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
        <tr key={i} className="cg-skeleton">
          {c.map((__, j) => (
            <td key={j}><span className="cg-skl" /></td>
          ))}
        </tr>
      ))}
    </>
  )
}