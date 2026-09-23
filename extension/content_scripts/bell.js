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
        originY: -50,
        targetY: 200,
        k: 0.05,        // Spring stiffness
        damping: 0.92,  // Fiction / Energy loss
        mass: 1.5,
        restLength: 250 // Rope length
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
                width: 80px;
                height: 80px;
                cursor: grab;
                pointer-events: auto;
                transform-origin: top center;
                user-select: none;
                filter: drop-shadow(0 10px 15px rgba(0,0,0,0.5));
                transition: filter 0.2s;
            }
            .bell-img:active {
                cursor: grabbing;
                filter: drop-shadow(0 15px 25px rgba(0,0,0,0.7)) brightness(1.2);
            }
            .rope {
                fill: none;
                stroke: rgba(255, 255, 255, 0.4);
                stroke-width: 2px;
                stroke-linecap: round;
                pointer-events: none;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            }
        `;

        const extURL = chrome.runtime.getURL("icons/bell.png");

        const markup = document.createElement("div");
        markup.className = "bell-anchor";
        markup.innerHTML = `
            <svg id="rope-svg" style="position:absolute; top:0; left:0; width:100%; height:100%; overflow:visible;">
                <path id="rope-path" class="rope" d="M0,0 L0,0" />
            </svg>
            <div id="bell-wrapper" style="position:absolute; left:0; top:0; transform: translate(-50%, -10px);">
                <img id="bell-mesh" class="bell-img" src="${extURL}" draggable="false" />
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
        state.y = -50;
        state.targetY = 250;

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

            // Update rope SVG
            const cpX = state.originX;
            const cpY = state.originY + (state.y - state.originY) / 2;
            rope.setAttribute("d", "M " + state.originX + "," + state.originY + " Q " + cpX + "," + cpY + " " + state.x + "," + state.y);

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
