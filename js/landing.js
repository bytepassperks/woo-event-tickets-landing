/**
 * Woo Event Tickets — Landing Page JavaScript
 * Hand-coded, zero framework dependencies
 * 60fps animations, accessibility-first
 */

(function() {
    'use strict';

    // ==========================================================================
    // Utility Functions
    // ==========================================================================

    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const lerp = (a, b, t) => a + (b - a) * t;

    // ==========================================================================
    // Scroll Reveal (IntersectionObserver)
    // ==========================================================================

    function initScrollReveal() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: '0px 0px -10% 0px',
            threshold: 0.1
        });

        $$('[data-reveal]').forEach(el => observer.observe(el));
    }

    // ==========================================================================
    // Navigation
    // ==========================================================================

    function initNavigation() {
        const nav = $('.nav');
        const toggle = $('.nav-toggle');
        const links = $('.nav-links');

        // Scroll state
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            nav.classList.toggle('scrolled', scrollY > 20);
            lastScroll = scrollY;
        }, { passive: true });

        // Mobile toggle
        if (toggle && links) {
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', !expanded);
                links.classList.toggle('open');
                document.body.style.overflow = expanded ? '' : 'hidden';
            });

            // Close on link click
            $$('.nav-link', links).forEach(link => {
                link.addEventListener('click', () => {
                    toggle.setAttribute('aria-expanded', 'false');
                    links.classList.remove('open');
                    document.body.style.overflow = '';
                });
            });

            // Close on escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && links.classList.contains('open')) {
                    toggle.setAttribute('aria-expanded', 'false');
                    links.classList.remove('open');
                    document.body.style.overflow = '';
                }
            });
        }

        // Smooth scroll for anchor links
        $$('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const targetId = anchor.getAttribute('href');
                if (targetId === '#') return;
                const target = $(targetId);
                if (target) {
                    e.preventDefault();
                    const offset = nav.offsetHeight;
                    const targetPos = target.getBoundingClientRect().top + window.scrollY - offset;
                    window.scrollTo({ top: targetPos, behavior: 'smooth' });
                }
            });
        });
    }

    // ==========================================================================
    // Showcase Tabs
    // ==========================================================================

    function initShowcaseTabs() {
        const tabs = $$('.tab-btn');
        const panels = $$('.tab-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.getAttribute('aria-controls');
                
                tabs.forEach(t => {
                    t.setAttribute('aria-selected', 'false');
                    t.classList.remove('active');
                });
                panels.forEach(p => p.classList.remove('active'));

                tab.setAttribute('aria-selected', 'true');
                tab.classList.add('active');
                const targetPanel = $(`#${targetId}`);
                if (targetPanel) targetPanel.classList.add('active');
            });

            // Keyboard navigation
            tab.addEventListener('keydown', (e) => {
                const index = tabs.indexOf(tab);
                let newIndex = index;
                if (e.key === 'ArrowRight') newIndex = (index + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') newIndex = (index - 1 + tabs.length) % tabs.length;
                else return;
                e.preventDefault();
                tabs[newIndex].click();
                tabs[newIndex].focus();
            });
        });
    }

    // ==========================================================================
    // Live QR Scanner (using html5-qrcode)
    // ==========================================================================

    let html5QrcodeScanner = null;
    let currentStream = null;
    let facingMode = 'environment';
    let scanCooldown = false;

    const scannerElements = {
        video: $('#scannerVideo'),
        canvas: $('#scannerCanvas'),
        placeholder: $('#scannerPlaceholder'),
        startBtn: $('#scannerStart'),
        stopBtn: $('#scannerStop'),
        switchBtn: $('#scannerSwitch'),
        result: $('#scannerResult'),
        qrCode: $('#qrCode'),
        qrTicketId: $('#qrTicketId'),
        qrStatus: $('[data-status]'),
        scenarioBtns: $$('.scenario-btn')
    };

    const qrScenarios = {
        valid: {
            ticketId: 'WET-2026-000123',
            event: 'Grand RAAS Garba 2026',
            type: 'Couple Pass',
            attendee: 'Priya Sharma',
            allows: '2 People',
            status: 'VALID',
            statusClass: 'status-valid',
            token: 'wETv1_2026_000123_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
        },
        used: {
            ticketId: 'WET-2026-000123',
            event: 'Grand RAAS Garba 2026',
            type: 'Couple Pass',
            attendee: 'Priya Sharma',
            allows: '2 People',
            status: 'ALREADY USED',
            statusClass: 'status-used',
            token: 'wETv1_2026_000123_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
        },
        invalid: {
            ticketId: 'INVALID-QR-CODE',
            event: '—',
            type: '—',
            attendee: '—',
            allows: '—',
            status: 'INVALID',
            statusClass: 'status-invalid',
            token: 'not-a-real-token-xyz123'
        },
        cancelled: {
            ticketId: 'WET-2026-000456',
            event: 'Grand RAAS Garba 2026',
            type: 'Stag Entry',
            attendee: 'Rahul Verma',
            allows: '1 Person',
            status: 'CANCELLED',
            statusClass: 'status-cancelled',
            token: 'wETv1_2026_000456_z9y8x7w6v5u4t3s2r1q0p9o8n7m6'
        }
    };

    let currentScenario = 'valid';

    function initQRCodeDisplay() {
        updateQRDisplay(currentScenario);
        initScenarioButtons();
    }

    function updateQRDisplay(scenario) {
        const data = qrScenarios[scenario];
        if (!data) return;

        currentScenario = scenario;

        // Update QR code
        if (scannerElements.qrCode) {
            const qrUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(data.token)}&choe=UTF-8`;
            scannerElements.qrCode.innerHTML = `<img src="${qrUrl}" alt="QR Code for ${data.ticketId}" loading="lazy">`;
        }

        // Update details
        if (scannerElements.qrTicketId) scannerElements.qrTicketId.textContent = data.ticketId;
        if (scannerElements.qrStatus) {
            scannerElements.qrStatus.textContent = data.status;
            scannerElements.qrStatus.className = `qr-status ${data.statusClass}`;
        }

        // Update scenario buttons
        $$('.scenario-btn').forEach(btn => {
            const isActive = btn.dataset.scenario === scenario;
            btn.setAttribute('aria-pressed', isActive);
            if (isActive) btn.classList.add('active'); else btn.classList.remove('active');
        });
    }

    function initScenarioButtons() {
        $$('.scenario-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                updateQRDisplay(btn.dataset.scenario);
            });
        });
    }

    async function loadQRScannerLibrary() {
        if (window.Html5QrcodeScanner) return;
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function initScanner() {
        if (!scannerElements.video) return;

        scannerElements.startBtn?.addEventListener('click', startScanner);
        scannerElements.stopBtn?.addEventListener('click', stopScanner);
        scannerElements.switchBtn?.addEventListener('click', switchCamera);
    }

    async function startScanner() {
        scannerElements.startBtn.hidden = true;
        scannerElements.stopBtn.hidden = false;
        scannerElements.switchBtn.hidden = false;
        scannerElements.placeholder.classList.add('hidden');

        try {
            await loadQRScannerLibrary();
            
            html5QrcodeScanner = new Html5QrcodeScanner(
                'scannerVideo',
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.333
                },
                false
            );

            html5QrcodeScanner.render(
                onScanSuccess.bind(this),
                onScanFailure.bind(this)
            );

        } catch (err) {
            console.error('Scanner init failed:', err);
            fallbackToNativeCamera();
        }
    }

    function fallbackToNativeCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            showScannerResult('invalid', 'Camera API not supported in this browser');
            return;
        }

        navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        }).then(stream => {
            currentStream = stream;
            scannerElements.video.srcObject = stream;
            scannerElements.video.play();
            startScanLoop();
        }).catch(err => {
            console.error('Camera access denied:', err);
            showScannerResult('invalid', 'Camera access denied. Please allow camera permission.');
        });
    }

    function stopScanner() {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().catch(() => {});
            html5QrcodeScanner = null;
        }
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        scannerElements.video.srcObject = null;
        
        scannerElements.startBtn.hidden = false;
        scannerElements.stopBtn.hidden = true;
        scannerElements.switchBtn.hidden = true;
        scannerElements.placeholder.classList.remove('hidden');
        scannerElements.result.hidden = true;
    }

    function switchCamera() {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        stopScanner();
        setTimeout(startScanner, 300);
    }

    function onScanSuccess(decodedText, decodedResult) {
        if (scanCooldown) return;
        scanCooldown = true;
        setTimeout(() => { scanCooldown = false; }, 1500);

        stopScanner();
        processScannedToken(decodedText);
    }

    function onScanFailure(err) {
        // Ignore - happens frequently
    }

    let scanFrameId = null;
    function startScanLoop() {
        if (!scannerElements.video || scannerElements.video.readyState < 2) {
            scanFrameId = requestAnimationFrame(startScanLoop);
            return;
        }
        
        if (scanFrameId) cancelAnimationFrame(scanFrameId);
        
        // For native camera fallback, we'd use jsQR here
        // But html5-qrcode handles it, so this is just a placeholder
        scanFrameId = requestAnimationFrame(startScanLoop);
    }

    function processScannedToken(token) {
        // Check which scenario this token matches
        let matchedScenario = 'invalid';
        for (const [key, data] of Object.entries(qrScenarios)) {
            if (token.includes(data.token) || token === data.token) {
                matchedScenario = key;
                break;
            }
        }

        // Also check if it's a valid format but not in our test set
        if (matchedScenario === 'invalid' && token.startsWith('wETv1_')) {
            matchedScenario = 'valid';
        }

        showScannerResult(matchedScenario, qrScenarios[matchedScenario]);
    }

    function showScannerResult(scenario, data = qrScenarios[scenario]) {
        const result = scannerElements.result;
        if (!result) return;

        result.hidden = false;
        
        if (scenario === 'valid') {
            result.className = 'scanner-result valid';
            result.innerHTML = `
                <div class="result-header">
                    <div class="result-icon">✓</div>
                    <h3 class="result-title">VALID TICKET</h3>
                </div>
                <div class="result-details">
                    <div><span class="result-label">Ticket ID</span><span class="result-value">${data.ticketId}</span></div>
                    <div><span class="result-label">Event</span><span class="result-value">${data.event}</span></div>
                    <div><span class="result-label">Type</span><span class="result-value">${data.type}</span></div>
                    <div><span class="result-label">Attendee</span><span class="result-value">${data.attendee}</span></div>
                    <div><span class="result-label">Allows</span><span class="result-value">${data.allows}</span></div>
                    <div><span class="result-label">Checked In</span><span class="result-value">${new Date().toLocaleTimeString()}</span></div>
                </div>
                <button class="btn btn--primary" style="margin-top: 1rem;" onclick="window.landingScanner?.startScanner()">Scan Next</button>
            `;
        } else {
            result.className = 'scanner-result invalid';
            const icon = scenario === 'used' ? '⚠' : '✕';
            const title = scenario === 'used' ? 'ALREADY USED' : 'ENTRY DENIED';
            
            result.innerHTML = `
                <div class="result-header">
                    <div class="result-icon">${icon}</div>
                    <h3 class="result-title">${title}</h3>
                </div>
                <div class="result-details">
                    <div><span class="result-label">Ticket ID</span><span class="result-value">${data.ticketId}</span></div>
                    <div><span class="result-label">Reason</span><span class="result-value">${data.status}</span></div>
                    ${data.firstUsed ? `<div><span class="result-label">First Used</span><span class="result-value">${data.firstUsed}</span></div>` : ''}
                </div>
                <button class="btn btn--primary" style="margin-top: 1rem;" onclick="window.landingScanner?.startScanner()">Scan Next</button>
            `;
        }

        // Update the demo QR to match
        updateQRDisplay(scenario);

        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(scenario === 'valid' ? [50, 30, 50] : [200, 100, 200]);
        }

        // Play sound (if we had sound files)
        // playSound(scenario === 'valid' ? 'success' : 'error');
    }

    // Expose for inline onclick
    window.landingScanner = {
        startScanner,
        stopScanner,
        switchCamera
    };

    // ==========================================================================
    // Pricing Toggle
    // ==========================================================================

    function initPricingToggle() {
        const toggle = $('#billingToggle');
        if (!toggle) return;

        const amounts = $$('.price-amount');
        const periods = $$('.price-period');

        const prices = {
            monthly: [0, 2999, 'Custom'],
            yearly: [0, 2399, 'Custom']
        };

        toggle.addEventListener('change', () => {
            const isYearly = toggle.checked;
            const period = isYearly ? 'yearly' : 'monthly';
            const suffix = isYearly ? '/ year' : '/ month';

            amounts.forEach((el, i) => {
                el.textContent = prices[period][i];
            });
            periods.forEach(el => {
                el.textContent = suffix;
            });
        });
    }

    // ==========================================================================
    // Download Button
    // ==========================================================================

    function initDownloadButton() {
        const btn = $('#downloadBtn');
        if (!btn) return;

        btn.addEventListener('click', (e) => {
            // The link goes to GitHub releases, but we can add analytics here
            console.log('Download initiated');
        });
    }

    // ==========================================================================
    // Particle Background (CTA section)
    // ==========================================================================

    function initParticles() {
        const container = $('.cta-particles');
        if (!container) return;

        const particleCount = 30;
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'cta-particle';
            particle.style.cssText = `
                position: absolute;
                width: ${Math.random() * 4 + 2}px;
                height: ${Math.random() * 4 + 2}px;
                background: ${Math.random() > 0.5 ? 'var(--accent)' : 'var(--success)'};
                border-radius: 50%;
                opacity: ${Math.random() * 0.5 + 0.1};
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                pointer-events: none;
            `;
            container.appendChild(particle);
            particles.push({
                el: particle,
                x: parseFloat(particle.style.left),
                y: parseFloat(particle.style.top),
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                life: Math.random() * 100
            });
        }

        function animateParticles() {
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.life--;

                if (p.life <= 0 || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) {
                    p.x = Math.random() * 100;
                    p.y = Math.random() * 100;
                    p.vx = (Math.random() - 0.5) * 0.3;
                    p.vy = (Math.random() - 0.5) * 0.3;
                    p.life = Math.random() * 100 + 50;
                }

                p.el.style.left = p.x + '%';
                p.el.style.top = p.y + '%';
            });
            requestAnimationFrame(animateParticles);
        }

        animateParticles();
    }

    // ==========================================================================
    // Canvas Background (Hero)
    // ==========================================================================

    function initHeroCanvas() {
        const canvas = $('.hero-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width = 0, height = 0;
        let particles = [];
        const particleCount = 60;
        const connectionDistance = 150;

        function resize() {
            const rect = canvas.parentElement.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            canvas.width = width * devicePixelRatio;
            canvas.height = height * devicePixelRatio;
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            ctx.scale(devicePixelRatio, devicePixelRatio);

            // Recreate particles
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    radius: Math.random() * 2 + 1,
                    opacity: Math.random() * 0.5 + 0.1
                });
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);

            // Update and draw particles
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                p.x = clamp(p.x, 0, width);
                p.y = clamp(p.y, 0, height);

                // Draw particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 102, 204, ${p.opacity})`;
                ctx.fill();
            });

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < connectionDistance) {
                        const opacity = (1 - dist / connectionDistance) * 0.15;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(0, 102, 204, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', resize);
        resize();
        animate();
    }

    // ==========================================================================
    // Preview Charts (Simple Canvas Charts)
    // ==========================================================================

    function initPreviewCharts() {
        // Dashboard chart
        const dashCanvas = $('.dashboard-preview .chart-canvas');
        if (dashCanvas) drawBarChart(dashCanvas, [12, 19, 35, 52, 78, 95, 110, 125, 118, 95, 67, 42, 28, 15, 8, 3]);

        // Reports chart
        const reportCanvas = $('.reports-preview .chart-canvas');
        if (reportCanvas) drawLineChart(reportCanvas, [2.1, 3.4, 5.2, 8.9, 12.3, 15.8, 18.2, 16.5, 13.1, 9.4, 6.2, 3.8]);
    }

    function drawBarChart(canvas, data) {
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height;
        const padding = 20;
        const barW = (w - padding * 2) / data.length;
        const maxVal = Math.max(...data);
        const scale = (h - padding * 2) / maxVal;

        ctx.clearRect(0, 0, w, h);

        data.forEach((val, i) => {
            const x = padding + i * barW + barW * 0.1;
            const barWidth = barW * 0.8;
            const barH = val * scale;
            const y = h - padding - barH;

            const gradient = ctx.createLinearGradient(0, h - padding, 0, h - padding - barH);
            gradient.addColorStop(0, 'rgba(0, 102, 204, 0.3)');
            gradient.addColorStop(1, 'rgba(0, 102, 204, 0.9)');

            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barH);
        });
    }

    function drawLineChart(canvas, data) {
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height;
        const padding = 20;
        const maxVal = Math.max(...data);
        const minVal = Math.min(...data);
        const range = maxVal - minVal || 1;
        const scale = (h - padding * 2) / range;

        ctx.clearRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (h - padding * 2) * i / 4;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(w - padding, y);
            ctx.stroke();
        }

        // Area fill
        const gradient = ctx.createLinearGradient(0, padding, 0, h - padding);
        gradient.addColorStop(0, 'rgba(0, 102, 204, 0.15)');
        gradient.addColorStop(1, 'rgba(0, 102, 204, 0)');

        ctx.beginPath();
        ctx.moveTo(padding, h - padding);
        data.forEach((val, i) => {
            const x = padding + (w - padding * 2) * i / (data.length - 1);
            const y = h - padding - (val - minVal) * scale;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(w - padding, h - padding);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        data.forEach((val, i) => {
            const x = padding + (w - padding * 2) * i / (data.length - 1);
            const y = h - padding - (val - minVal) * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Points
        data.forEach((val, i) => {
            const x = padding + (w - padding * 2) * i / (data.length - 1);
            const y = h - padding - (val - minVal) * scale;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#0066cc';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        });
    }

    // ==========================================================================
    // Parallax Hero Orbs
    // ==========================================================================

    function initParallaxOrbs() {
        const orbs = $$('.orb');
        if (!orbs.length) return;

        let mouseX = 0, mouseY = 0;
        let currentX = 0, currentY = 0;

        window.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
            mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        });

        function animate() {
            currentX = lerp(currentX, mouseX, 0.05);
            currentY = lerp(currentY, mouseY, 0.05);

            orbs.forEach((orb, i) => {
                const factor = (i + 1) * 15;
                orb.style.transform = `translate(${currentX * factor}px, ${currentY * factor}px)`;
            });

            requestAnimationFrame(animate);
        }

        animate();
    }

    // ==========================================================================
    - Smooth Counter Animation for Trust Numbers
    // ==========================================================================

    function initCounterAnimation() {
        const counters = $$('.trust-number');
        if (!counters.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseFloat(el.textContent.replace(/[^\d.]/g, ''));
                    const suffix = el.textContent.replace(/[\d.]/g, '');
                    animateCounter(el, target, suffix);
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        counters.forEach(el => observer.observe(el));
    }

    function animateCounter(el, target, suffix) {
        const duration = 2000;
        const startTime = performance.now();
        const isDecimal = target % 1 !== 0;

        function update(time) {
            const progress = clamp((time - startTime) / duration, 0, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            const current = target * eased;
            el.textContent = (isDecimal ? current.toFixed(1) : Math.floor(current)) + suffix;
            if (progress < 1) requestAnimationFrame(update);
            else el.textContent = target + suffix;
        }
        requestAnimationFrame(update);
    }

    // ==========================================================================
    - Initialize Everything
    // ==========================================================================

    function init() {
        // Core
        initScrollReveal();
        initNavigation();
        initShowcaseTabs();
        initScanner();
        initQRCodeDisplay();
        initPricingToggle();
        initDownloadButton();
        initCounterAnimation();

        // Visual effects
        initHeroCanvas();
        initParallaxOrbs();
        initParticles();
        initPreviewCharts();

        // Mark page as loaded for any CSS transitions
        document.documentElement.classList.add('loaded');
    }

    // DOM Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();