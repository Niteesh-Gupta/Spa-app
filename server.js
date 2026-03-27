const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get('/api/health', async (req, res) => {
  const { error } = await supabase.from('users').select('count');
  res.json({ status: 'ok', version: '2.0.0', db: error ? 'disconnected' : 'connected', ts: new Date().toISOString() });
});

app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('id, name, role, email, region');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const { data: users } = await supabase.from('users').select('*').eq('email', email).limit(1);
  if (!users || users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
  const user = users[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email, region: user.region } });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`SPA API listening on http://localhost:${PORT}`));
}

module.exports = app;
