const express = require('express');
const path = require('path');
const auth = require('./api/auth');
const verify = require('./api/verify');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.post('/api/auth', auth);
app.get('/api/verify', verify);

app.listen(PORT, () => console.log(`Vortex running on port ${PORT}`));
