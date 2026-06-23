const APP = {
  BASE_URL: '/taiwan-stock-radar',
  DATA_PREFIX: '/taiwan-stock-radar/data',

  // Config matching Next.js version
  DIMENSION_CONFIG: {
    technical: { max: 40, label: '技術面' },
    fundamental: { max: 40, label: '基本面' },
    news: { max: 10, label: '消息面' },
    sentiment: { max: 10, label: '市場情緒' },
    chips: { max: 10, label: '籌碼面' },
  },

  // State
  theme: 'light',
  
  // Theme utility
  initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.theme = savedTheme;
    } else {
      this.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', this.theme);
    
    // Setup toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
        localStorage.setItem('theme', this.theme);
      });
    });
  },

  // Formatting utilities
  formatNumber(n, decimals = 2) {
    if (n === null || n === undefined) return '—';
    return Number(n).toFixed(decimals);
  },

  formatPercent(n) {
    if (n === null || n === undefined) return '—';
    const val = Number(n);
    if (val === 0) return '0.00%';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  },

  getChangeClass(pct) {
    if (pct === null || pct === undefined || pct === 0) return 'text-muted';
    return pct > 0 ? 'text-up' : 'text-down';
  },

  getScoreColorClass(score, maxScore = 100) {
    const pct = (score / maxScore) * 100;
    if (pct >= 70) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-blue-500';
    if (pct >= 35) return 'bg-amber-500';
    return 'bg-red-500';
  },

  // Data fetching
  async fetchJSON(path, retries = 2) {
    const url = path.startsWith('http') ? path : `${window.location.origin}${path}`;
    // Add cache buster to bypass GitHub Pages aggressive caching
    const timestamp = new Date().getTime();
    const finalUrl = url.includes('?') ? `${url}&cb=${timestamp}` : `${url}?cb=${timestamp}`;
    
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(finalUrl, { cache: 'no-store' });
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Data not found (${path})`);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.warn(`Fetch attempt ${i + 1} failed for ${path}:`, error);
            if (i === retries) {
                throw error;
            }
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
        }
    }
  },

  // Draw Pentagon Radar Chart using Canvas API
  drawRadarChart(canvasId, scores) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 * 0.75; // Leave room for labels
    
    // Setup
    ctx.clearRect(0, 0, width, height);
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? '#374151' : '#e5e7eb';
    const labelColor = isDark ? '#9ca3af' : '#6b7280';
    const fillColor = 'rgba(14, 165, 233, 0.2)';
    const strokeColor = '#0ea5e9';
    
    const maxScores = [
      this.DIMENSION_CONFIG.technical.max,
      this.DIMENSION_CONFIG.fundamental.max,
      this.DIMENSION_CONFIG.news.max,
      this.DIMENSION_CONFIG.sentiment.max,
      this.DIMENSION_CONFIG.chips.max
    ];
    
    const labels = [
      this.DIMENSION_CONFIG.technical.label,
      this.DIMENSION_CONFIG.fundamental.label,
      this.DIMENSION_CONFIG.news.label,
      this.DIMENSION_CONFIG.sentiment.label,
      this.DIMENSION_CONFIG.chips.label
    ];
    
    const data = [
      scores.technical || 0,
      scores.fundamental || 0,
      scores.news || 0,
      scores.sentiment || 0,
      scores.chips || 0
    ];

    const angleStep = (Math.PI * 2) / 5;
    const offset = -Math.PI / 2; // Start from top
    
    // Draw Grid (Levels 1 to 4)
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let level = 1; level <= 4; level++) {
        const r = radius * (level / 4);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = i * angleStep + offset;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
    
    // Draw Axes & Labels
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < 5; i++) {
        const angle = i * angleStep + offset;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // Label position
        const labelRadius = radius + 15;
        const lx = centerX + Math.cos(angle) * labelRadius;
        const ly = centerY + Math.sin(angle) * labelRadius;
        ctx.fillText(labels[i], lx, ly);
    }
    
    // Draw Data Area
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const angle = i * angleStep + offset;
        const r = radius * (data[i] / maxScores[i]);
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw Data Points
    ctx.fillStyle = strokeColor;
    for (let i = 0; i < 5; i++) {
        const angle = i * angleStep + offset;
        const r = radius * (data[i] / maxScores[i]);
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
  },

  // Modal helpers
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
  },

  // Setup generic modal close handlers
  initModals() {
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) this.closeModal(modal.id);
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal(modal.id);
        });
    });
  }
};

// Initialize early
APP.initTheme();

// Expose globally
window.APP = APP;
