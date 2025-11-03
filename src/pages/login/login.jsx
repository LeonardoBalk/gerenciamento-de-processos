import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import './login.css'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState('login') // 'login' ou 'registro'
  const [carregando, setCarregando] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    if (carregando) return

    try {
      setCarregando(true)
      const emailNorm = String(email || '').trim().toLowerCase()

      if (modo === 'login') {
        // login
        const { error } = await supabase.auth.signInWithPassword({
          email: emailNorm,
          password: senha
        })
        if (error) throw error

        navigate('/home')
      } else {
        // registro
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: emailNorm,
          password: senha,
          options: { data: { name: '' } }
        })
        if (signUpError) throw signUpError

        const user = signUpData?.user || null

        // se o projeto exige confirmacao por email, o user pode vir nulo aqui
        if (!user) {
          alert('conta criada! verifique seu e-mail para confirmar.')
          setModo('login')
          return
        }

        // passo 1: tenta associar auth_id a um perfil existente pelo email (case-insensitive) se nao tiver auth_id ainda
        const { data: linkedRows, error: linkErr } = await supabase
          .from('users')
          .update({ auth_id: user.id })
          .is('auth_id', null)
          .ilike('email', emailNorm)
          .select('id')
          .limit(1)

        if (linkErr) throw linkErr
        if (Array.isArray(linkedRows) && linkedRows.length > 0) {
          alert('conta criada! verifique seu e-mail para confirmar.')
          setModo('login')
          return
        }

        // passo 2: se nao havia perfil com esse email, faz upsert por auth_id
        const { error: upErr } = await supabase
          .from('users')
          .upsert(
            { auth_id: user.id, email: emailNorm, nome: emailNorm.split('@')[0] },
            { onConflict: 'auth_id' }
          )

        if (upErr) {
          // trata unique_violation: email ja vinculado a outro auth_id
          if (upErr.code === '23505') {
            const { data: existente, error: selErr } = await supabase
              .from('users')
              .select('id, auth_id')
              .ilike('email', emailNorm)
              .maybeSingle()

            if (!selErr && existente?.auth_id && existente.auth_id !== user.id) {
              throw new Error('este e-mail ja esta vinculado a outra conta')
            }
          }
          throw upErr
        }

        alert('conta criada! verifique seu e-mail para confirmar.')
        setModo('login')
      }
    } catch (err) {
      alert(err?.message || 'erro ao autenticar')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="login-container">
      <h2>{modo === 'login' ? 'Entrar' : 'Registrar'}</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={carregando}
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          disabled={carregando}
        />
        <button type="submit" disabled={carregando}>
          {carregando ? 'Aguarde...' : (modo === 'login' ? 'Entrar' : 'Registrar')}
        </button>
      </form>

      <p>
        {modo === 'login' ? (
          <span onClick={() => !carregando && setModo('registro')} className="switch-mode">
            Criar nova conta
          </span>
        ) : (
          <span onClick={() => !carregando && setModo('login')} className="switch-mode">
            Já tenho uma conta
          </span>
        )}
      </p>
    </div>
  )
}