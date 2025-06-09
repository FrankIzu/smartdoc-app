const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors({
  origin: [
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8083',
    'http://localhost:8084',
    'http://localhost:8085',
    'http://localhost:8086',
    'http://localhost:8087',
    'http://localhost:8088',
  ],
  credentials: true
}));

// Proxy middleware options
const proxyOptions = {
  target: 'http://localhost:5000',
  changeOrigin: true,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying request: ${req.method} ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
};

// Proxy all /api requests to backend
app.use('/api', createProxyMiddleware(proxyOptions));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Proxy server running', target: 'http://localhost:5000' });
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`📡 Forwarding /api requests to http://localhost:5000`);
  console.log(`🌐 Use http://localhost:${PORT} as your API_BASE_URL for development`);
}); 