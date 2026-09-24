// Physics Bell Alert - Injected natively when CAPTCHA is detected

(function () {
    if (window._bellInitialized) return;
    window._bellInitialized = true;

    let bellContainer = null;
    let shadow = null;
    let isDragging = false;
    let physicsId = null;

    // Physics state
    let state = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        originX: window.innerWidth - 150,
        originY: -10,
        targetY: 100,
        k: 0.15,        // Spring stiffness
        damping: 0.95,  // Fiction / Energy loss
        mass: 0.8,
        restLength: 110 // Rope length
    };

    // Synthesize a beautiful crisp brass bell sound using Web Audio API
    function playBellSound(velocity) {
        if (velocity < 5) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();

            const vol = Math.min(velocity / 100, 1.0);

            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(vol, ctx.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 3);
            masterGain.connect(ctx.destination);

            // A typical brass bell has multiple metallic inharmonic partials
            const freqs = [523.25, 1046.50, 1480, 2093, 2605];

            freqs.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = idx === 0 ? 'sine' : 'square';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);

                // Higher frequencies decay much faster
                const decay = 3 / (idx + 1);
                gain.gain.setValueAtTime(1.0 / (idx + 1), ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + decay);

                osc.connect(gain);
                gain.connect(masterGain);

                osc.start();
                osc.stop(ctx.currentTime + decay);
            });
        } catch (e) {
            console.error("Audio failed", e);
        }
    }

    function createBellDOM() {
        if (bellContainer) return;

        bellContainer = document.createElement("div");
        bellContainer.id = "mdm-captcha-bell-wrapper";
        bellContainer.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            pointer-events: none;
            z-index: 2147483647;
            overflow: visible;
        `;

        shadow = bellContainer.attachShadow({ mode: 'open' });

        const styles = document.createElement("style");
        styles.textContent = `
            .bell-anchor {
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                overflow: visible;
            }
            .bell-img {
                position: absolute;
                width: 50px;
                height: 50px;
                cursor: grab;
                pointer-events: auto;
                transform-origin: top center;
                user-select: none;
                transition: transform 0.1s;
            }
            .bell-img:active {
                cursor: grabbing;
                filter: brightness(1.1);
            }
            .rope {
                fill: none;
                stroke: #2d3748;
                stroke-width: 1.5px;
                stroke-linecap: round;
                pointer-events: none;
            }
        `;

        const markup = document.createElement("div");
        markup.className = "bell-anchor";
        markup.innerHTML = `
            <svg id="rope-svg" style="position:absolute; top:0; left:0; width:100%; height:100%; overflow:visible;">
                <path id="rope-path" class="rope" d="M0,0 L0,0" />
            </svg>
            <div id="bell-wrapper" style="position:absolute; left:0; top:0; width:0; height:0;">
                <div id="bell-mesh" class="bell-img" style="margin-left:-25px; margin-top:-5px; background:radial-gradient(circle at 30% 30%, #ff6b6b, #ef4444); border-radius:50%; box-shadow:0 8px 20px rgba(239, 68, 68, 0.4); display:flex; justify-content:center; align-items:center;">
                    <div style="width:16px; height:16px; background:#fff; border-radius:50%; opacity:0.8; animation: pulse 2s infinite;"></div>
                </div>
            </div>
        `;

        shadow.appendChild(styles);
        shadow.appendChild(markup);
        document.documentElement.appendChild(bellContainer);

        const bell = shadow.getElementById("bell-mesh");
        const wrapper = shadow.getElementById("bell-wrapper");
        const rope = shadow.getElementById("rope-path");

        state.originX = window.innerWidth - 150;
        state.x = state.originX;
        state.y = -10;
        state.targetY = 100;

        // Interaction
        bell.addEventListener("pointerdown", (e) => {
            isDragging = true;
            state.vx = 0;
            state.vy = 0;
            let rect = wrapper.getBoundingClientRect();
            bell.setPointerCapture(e.pointerId);
        });

        bell.addEventListener("pointermove", (e) => {
            if (!isDragging) return;
            state.x += e.movementX;
            state.y += e.movementY;
        });

        bell.addEventListener("pointerup", (e) => {
            if (isDragging) {
                isDragging = false;
                bell.releasePointerCapture(e.pointerId);
                let currentVel = Math.sqrt(e.movementX ** 2 + e.movementY ** 2);
                state.vx = e.movementX * 1.5;
                state.vy = e.movementY * 1.5;
                playBellSound(currentVel * 3);
            }
        });

        function updatePhysics() {
            if (!isDragging) {
                // Return to rest
                const dx = state.originX - state.x;
                const dy = state.targetY - state.y;

                const ax = (dx * state.k) / state.mass;
                const ay = (dy * state.k) / state.mass;

                state.vx += ax;
                state.vy += ay;

                state.vx *= state.damping;
                state.vy *= state.damping;

                state.x += state.vx;
                state.y += state.vy;

                // Stop shivering
                if (Math.abs(state.vx) < 0.05 && Math.abs(state.vy) < 0.05 && Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
                    state.vx = 0; state.vy = 0;
                    state.x = state.originX;
                    state.y = state.targetY;
                }
            }

            // Draw
            wrapper.style.left = state.x + "px";
            wrapper.style.top = state.y + "px";

            // Calculate rotation for swing
            const swingAngle = (state.x - state.originX) / 10;
            bell.style.transform = "rotate(" + swingAngle + "deg)";

            // Update rope SVG strictly as a rigid straight line
            rope.setAttribute("d", "M " + state.originX + "," + state.originY + " L " + state.x + "," + state.y);

            physicsId = requestAnimationFrame(updatePhysics);
        }

        updatePhysics();
    }

    function destroyBell() {
        if (!bellContainer) return;
        cancelAnimationFrame(physicsId);
        bellContainer.remove();
        bellContainer = null;
        shadow = null;
    }

    // Window resize handling
    window.addEventListener("resize", () => {
        state.originX = window.innerWidth - 150;
    });

    // Message Hub
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "show_captcha_bell") {
            createBellDOM();
            sendResponse({ status: "mounted" });
        } else if (request.action === "hide_captcha_bell") {
            destroyBell();
            sendResponse({ status: "destroyed" });
        }
    });

})();
