const express = require('express');
const app = express();
const port = 3000;
const { createClient } = require("@supabase/supabase-js");

dotenv = require('dotenv');
require("dotenv").config();

const supabase = createClient(process.env.SUPABASEURL, process.env.SUPABASEKEY);

app.use(express.json());

// gera token jwt
function gerarToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "1h" });
}

// autenticar token jwt
function autenticarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ erro: "Token não fornecido" });
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.status(403).json({ erro: "Token inválido" });
    req.user = user;
    next();
  });
}

// rota para registrar usuário
app.post("/users", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: "Nome, email e senha são obrigatórios" });
  }
  try {
    const { data, error } = await supabase
      .from("users")
      .insert([{ nome, email, senha }]) 
      .select();
    if (error) throw error;
    const user = data[0];
    const token = gerarToken({ id: user.id, email: user.email, nome: user.nome });
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ erro: error.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: "Email e senha são obrigatórios" });
  try {
    const { data, error } = await supabase
      .from("user")
      .select("*")
      .eq("email", email)
      .single();
    if (error || !data || data.senha !== senha) {
      return res.status(401).json({ erro: "Credenciais inválidas" });
    }
    const token = gerarToken({ id: data.id, nome: data.nome, email: data.email });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});


app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});