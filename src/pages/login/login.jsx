import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import './Login.css'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState('login') // 'login' ou 'registro'
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()

    try {
      if (modo === 'login') {
        // LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: senha
        })
        if (error) throw error

        navigate('/home') // redireciona para a home
      } else {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: senha
  })
  if (signUpError) throw signUpError

  // Insere no banco sem erro 400
  const { error: dbError } = await supabase
    .from('users')
    .insert([{
      auth_id: signUpData.user.id,
      email: signUpData.user.email,
      nome: '',          // opcional
      senha: senha,      // opcional
      criado_em: new Date()
    }])
  if (dbError) throw dbError

  alert('Conta criada! Verifique seu e-mail para confirmar.')
  setModo('login')
      }
    } catch (err) {
      alert(err.message)
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
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
        <button type="submit">
          {modo === 'login' ? 'Entrar' : 'Registrar'}
        </button>
      </form>

      <p>
        {modo === 'login' ? (
          <span onClick={() => setModo('registro')} className="switch-mode">
            Criar nova conta
          </span>
        ) : (
          <span onClick={() => setModo('login')} className="switch-mode">
            Já tenho uma conta
          </span>
        )}
      </p>
    </div>
  )
}
