<script setup lang="ts">
import { useRouter } from 'vue-router';
import { onMounted, ref } from 'vue';

const router = useRouter();

function goToLogin() {
  router.push('/login');
}

// Generate random stars
const stars = ref<{ x: number; y: number; size: number; delay: number }[]>([]);

onMounted(() => {
  // Create 100 stars with random positions
  for (let i = 0; i < 100; i++) {
    stars.value.push({
      x: Math.random() * 100,
      y: Math.random() * 70,
      size: Math.random() * 2 + 1,
      delay: Math.random() * 3,
    });
  }
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-gray-950">
    <!-- Starfield background -->
    <div class="absolute inset-0">
      <div
        v-for="(star, index) in stars"
        :key="index"
        class="star absolute rounded-full bg-white"
        :style="{
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: `${star.size}px`,
          height: `${star.size}px`,
          animationDelay: `${star.delay}s`,
        }"
      />
    </div>

    <!-- Planet surface at bottom -->
    <div class="planet-surface absolute bottom-0 left-0 right-0 h-32">
      <div class="planet-glow absolute inset-0" />

      <!-- Space Complex Container -->
      <div class="complex-container absolute bottom-8 left-1/2 -translate-x-1/2">
        <!-- Landing pad (always visible) -->
        <div class="landing-pad">
          <div class="landing-pad-lights" />
        </div>

        <!-- Central Hub Dome - builds first -->
        <div class="building central-hub">
          <div class="dome" />
          <div class="dome-glow" />
        </div>

        <!-- Left Wing Buildings - Ring 1 -->
        <div class="building habitat-left-1">
          <div class="habitat-module" />
          <div class="habitat-window" />
        </div>
        <!-- Left Wing Buildings - Ring 2 -->
        <div class="building habitat-left-2">
          <div class="habitat-module small" />
          <div class="habitat-window small" />
        </div>
        <!-- Left Wing Buildings - Ring 3 -->
        <div class="building solar-left">
          <div class="solar-panel" />
          <div class="solar-panel" />
          <div class="solar-panel" />
        </div>
        <!-- Left Wing Buildings - Ring 4 -->
        <div class="building antenna-left">
          <div class="antenna-tower" />
          <div class="antenna-dish" />
          <div class="antenna-signal" />
        </div>
        <!-- Left Wing Buildings - Ring 5 -->
        <div class="building habitat-left-3">
          <div class="habitat-module" />
          <div class="habitat-window" />
        </div>
        <!-- Left Wing - Glass Dome (Ring 5) -->
        <div class="building glass-dome-left">
          <div class="glass-dome">
            <div class="glass-dome-shine" />
            <div class="glass-dome-plants" />
          </div>
        </div>
        <!-- Left Wing Buildings - Ring 6 -->
        <div class="building storage-left">
          <div class="storage-tank" />
          <div class="storage-tank" />
        </div>
        <!-- Left Wing - Crane (Ring 6) -->
        <div class="building crane-left">
          <div class="crane-base" />
          <div class="crane-tower" />
          <div class="crane-arm" />
          <div class="crane-cable" />
          <div class="crane-hook" />
        </div>
        <!-- Left Wing Buildings - Ring 7 (far) -->
        <div class="building outpost-left">
          <div class="outpost-dome" />
          <div class="outpost-antenna" />
        </div>

        <!-- Right Wing Buildings - Ring 1 -->
        <div class="building habitat-right-1">
          <div class="habitat-module" />
          <div class="habitat-window" />
        </div>
        <!-- Right Wing Buildings - Ring 2 -->
        <div class="building habitat-right-2">
          <div class="habitat-module small" />
          <div class="habitat-window small" />
        </div>
        <!-- Right Wing Buildings - Ring 3 -->
        <div class="building solar-right">
          <div class="solar-panel" />
          <div class="solar-panel" />
          <div class="solar-panel" />
        </div>
        <!-- Right Wing Buildings - Ring 4 -->
        <div class="building reactor-right">
          <div class="reactor-core" />
          <div class="reactor-glow" />
        </div>
        <!-- Right Wing Buildings - Ring 5 -->
        <div class="building habitat-right-3">
          <div class="habitat-module" />
          <div class="habitat-window" />
        </div>
        <!-- Right Wing - Glass Dome (Ring 5) -->
        <div class="building glass-dome-right">
          <div class="glass-dome large">
            <div class="glass-dome-shine" />
            <div class="glass-dome-plants" />
          </div>
        </div>
        <!-- Right Wing Buildings - Ring 6 -->
        <div class="building solar-right-2">
          <div class="solar-panel" />
          <div class="solar-panel" />
          <div class="solar-panel" />
          <div class="solar-panel" />
        </div>
        <!-- Right Wing - Crane (Ring 6) -->
        <div class="building crane-right">
          <div class="crane-base" />
          <div class="crane-tower" />
          <div class="crane-arm" />
          <div class="crane-counterweight" />
          <div class="crane-cable-right" />
          <div class="crane-hook-right" />
        </div>
        <!-- Right Wing Buildings - Ring 7 (far) -->
        <div class="building outpost-right">
          <div class="outpost-dome" />
          <div class="outpost-flag" />
        </div>

        <!-- Defense Systems - Final Ring -->
        <!-- Laser Turret (Left) -->
        <div class="building laser-turret">
          <div class="turret-platform" />
          <div class="turret-body" />
          <div class="turret-cannon" />
          <div class="turret-cannon-tip" />
        </div>

        <!-- Missile Battery (Right) -->
        <div class="building missile-battery">
          <div class="battery-platform" />
          <div class="battery-launcher" />
          <div class="battery-missile battery-missile-1" />
          <div class="battery-missile battery-missile-2" />
          <div class="battery-missile battery-missile-3" />
        </div>

        <!-- Connecting walkways -->
        <div class="walkway walkway-left-1" />
        <div class="walkway walkway-left-2" />
        <div class="walkway walkway-left-3" />
        <div class="walkway walkway-left-4" />
        <div class="walkway walkway-right-1" />
        <div class="walkway walkway-right-2" />
        <div class="walkway walkway-right-3" />
        <div class="walkway walkway-right-4" />
      </div>


      <!-- Flying Missiles (originate from battery) -->
      <div class="flying-missile flying-missile-1" />
      <div class="flying-missile flying-missile-2" />

      <!-- Enemy Spaceships (large, distinct, flying high) -->
      <div class="enemy-ship enemy-ship-left">
        <svg width="80" height="45" viewBox="0 0 80 45" fill="none">
          <!-- Enemy bomber - chunky aggressive design, flying right -->
          <path d="M80 22 L65 5 L20 8 L0 22 L20 37 L65 40 Z" fill="#b91c1c" stroke="#7f1d1d" stroke-width="2" />
          <!-- Cockpit -->
          <ellipse cx="55" cy="22" rx="8" ry="10" fill="#1f2937" stroke="#4b5563" stroke-width="1" />
          <ellipse cx="55" cy="22" rx="4" ry="6" fill="#374151" />
          <!-- Wing details -->
          <path d="M30 8 L30 0 L45 5 L45 8" fill="#991b1b" stroke="#7f1d1d" stroke-width="1" />
          <path d="M30 37 L30 45 L45 40 L45 37" fill="#991b1b" stroke="#7f1d1d" stroke-width="1" />
          <!-- Engine pods -->
          <ellipse cx="10" cy="12" rx="8" ry="4" fill="#7f1d1d" stroke="#450a0a" stroke-width="1" />
          <ellipse cx="10" cy="32" rx="8" ry="4" fill="#7f1d1d" stroke="#450a0a" stroke-width="1" />
          <!-- Engine glow -->
          <ellipse cx="2" cy="12" rx="4" ry="3" fill="#f97316" opacity="0.9" />
          <ellipse cx="2" cy="32" rx="4" ry="3" fill="#f97316" opacity="0.9" />
          <!-- Hostile markings -->
          <circle cx="40" cy="22" r="5" fill="none" stroke="#fbbf24" stroke-width="2" />
          <line x1="37" y1="19" x2="43" y2="25" stroke="#fbbf24" stroke-width="2" />
          <line x1="43" y1="19" x2="37" y2="25" stroke="#fbbf24" stroke-width="2" />
        </svg>
      </div>
      <div class="enemy-ship enemy-ship-right">
        <svg width="80" height="45" viewBox="0 0 80 45" fill="none">
          <!-- Enemy bomber - chunky aggressive design, flying left -->
          <path d="M0 22 L15 5 L60 8 L80 22 L60 37 L15 40 Z" fill="#b91c1c" stroke="#7f1d1d" stroke-width="2" />
          <!-- Cockpit -->
          <ellipse cx="25" cy="22" rx="8" ry="10" fill="#1f2937" stroke="#4b5563" stroke-width="1" />
          <ellipse cx="25" cy="22" rx="4" ry="6" fill="#374151" />
          <!-- Wing details -->
          <path d="M50 8 L50 0 L35 5 L35 8" fill="#991b1b" stroke="#7f1d1d" stroke-width="1" />
          <path d="M50 37 L50 45 L35 40 L35 37" fill="#991b1b" stroke="#7f1d1d" stroke-width="1" />
          <!-- Engine pods -->
          <ellipse cx="70" cy="12" rx="8" ry="4" fill="#7f1d1d" stroke="#450a0a" stroke-width="1" />
          <ellipse cx="70" cy="32" rx="8" ry="4" fill="#7f1d1d" stroke="#450a0a" stroke-width="1" />
          <!-- Engine glow -->
          <ellipse cx="78" cy="12" rx="4" ry="3" fill="#f97316" opacity="0.9" />
          <ellipse cx="78" cy="32" rx="4" ry="3" fill="#f97316" opacity="0.9" />
          <!-- Hostile markings -->
          <circle cx="40" cy="22" r="5" fill="none" stroke="#fbbf24" stroke-width="2" />
          <line x1="37" y1="19" x2="43" y2="25" stroke="#fbbf24" stroke-width="2" />
          <line x1="43" y1="19" x2="37" y2="25" stroke="#fbbf24" stroke-width="2" />
        </svg>
      </div>
    </div>

    <!-- Spaceship -->
    <div class="spaceship-container">
      <svg
        class="spaceship"
        width="80"
        height="120"
        viewBox="0 0 80 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <!-- Main body -->
        <path
          d="M40 0 L55 40 L55 80 L50 95 L30 95 L25 80 L25 40 Z"
          fill="url(#bodyGradient)"
          stroke="#4a5568"
          stroke-width="1"
        />
        <!-- Cockpit window -->
        <ellipse cx="40" cy="35" rx="8" ry="12" fill="#63b3ed" opacity="0.8" />
        <ellipse cx="40" cy="35" rx="5" ry="8" fill="#90cdf4" opacity="0.6" />
        <!-- Left wing -->
        <path d="M25 50 L5 75 L5 85 L25 70 Z" fill="url(#wingGradient)" stroke="#4a5568" stroke-width="1" />
        <!-- Right wing -->
        <path d="M55 50 L75 75 L75 85 L55 70 Z" fill="url(#wingGradient)" stroke="#4a5568" stroke-width="1" />
        <!-- Landing legs -->
        <path d="M30 95 L25 115 L30 115" stroke="#718096" stroke-width="2" fill="none" />
        <path d="M50 95 L55 115 L50 115" stroke="#718096" stroke-width="2" fill="none" />
        <!-- Engine glow -->
        <ellipse cx="40" cy="95" rx="8" ry="3" fill="#f6ad55" class="engine-glow" />

        <!-- Gradients -->
        <defs>
          <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color: #4a5568" />
            <stop offset="50%" style="stop-color: #2d3748" />
            <stop offset="100%" style="stop-color: #1a202c" />
          </linearGradient>
          <linearGradient id="wingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color: #2d3748" />
            <stop offset="100%" style="stop-color: #4a5568" />
          </linearGradient>
        </defs>
      </svg>

      <!-- Engine thrust flame -->
      <div class="thrust-container">
        <div class="thrust thrust-1" />
        <div class="thrust thrust-2" />
        <div class="thrust thrust-3" />
      </div>
    </div>

    <!-- Content overlay -->
    <div class="relative z-10 flex min-h-screen flex-col items-center justify-center text-white">
      <h1 class="title mb-4 text-7xl font-bold tracking-wider text-orange-500">NOVA FALL</h1>
      <p class="mb-8 text-xl tracking-wide text-gray-400">Colonize. Build. Conquer.</p>
      <button
        class="enter-button rounded-lg bg-orange-600 px-8 py-3 text-lg font-semibold transition-all hover:bg-orange-500 hover:shadow-lg hover:shadow-orange-500/30"
        @click="goToLogin"
      >
        Enter the Colony
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Animation timing - 18 second total loop */
/* 0-7.5s: Ship descends and lands */
/* 7.5s: Engines off, ship settled */
/* 8-8.5s: Central hub constructs */
/* 9-9.5s: First ring - closest habitats + walkways */
/* 10-10.5s: Second ring - outer habitats + walkways */
/* 11-11.5s: Third ring - solar arrays */
/* 12-12.5s: Fourth ring - antenna + reactor */
/* 13-16s: Hold complete colony */
/* 16-18s: Fade out, reset */

/* Star twinkling animation */
.star {
  animation: twinkle 3s ease-in-out infinite;
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* Planet surface */
.planet-surface {
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(194, 65, 12, 0.1) 30%,
    rgba(194, 65, 12, 0.3) 60%,
    rgba(154, 52, 18, 0.6) 100%
  );
  border-top: 2px solid rgba(251, 146, 60, 0.3);
}

.planet-glow {
  background: radial-gradient(ellipse at 50% 100%, rgba(251, 146, 60, 0.2) 0%, transparent 60%);
}

/* Complex container - hidden during ship descent, visible during construction */
.complex-container {
  position: relative;
  width: 900px;
  height: 100px;
  animation: complex-fade 18s linear infinite;
}

@keyframes complex-fade {
  0%,
  43% {
    /* 0-7.7s: Hidden while ship descends */
    opacity: 0;
  }
  44% {
    /* ~8s: Fade in as buildings start */
    opacity: 1;
  }
  88% {
    /* Hold visible */
    opacity: 1;
  }
  95%,
  100% {
    /* Fade out at end */
    opacity: 0;
  }
}

/* Landing pad */
.landing-pad {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 100px;
  height: 8px;
  background: linear-gradient(to right, #374151, #4b5563, #374151);
  border-radius: 2px;
}

.landing-pad-lights {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  height: 2px;
  background: repeating-linear-gradient(to right, transparent, transparent 8px, #f59e0b 8px, #f59e0b 12px);
  animation: pad-lights 1s steps(2) infinite;
}

@keyframes pad-lights {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

/* Base building style */
.building {
  position: absolute;
  opacity: 0;
  transform: scale(0) translateY(20px);
}

/* Central Hub - builds at 8s (44.4% of 18s) */
.central-hub {
  left: 50%;
  bottom: 8px;
  transform-origin: bottom center;
  animation: build-central 18s ease-out infinite;
}

@keyframes build-central {
  0%, 43% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  44% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  48% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  50%, 88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

.dome {
  width: 60px;
  height: 35px;
  margin-left: -30px;
  background: linear-gradient(to bottom, #4b5563 0%, #374151 50%, #1f2937 100%);
  border-radius: 30px 30px 0 0;
  border: 2px solid #6b7280;
  border-bottom: none;
  box-shadow: inset 0 -10px 20px rgba(0, 0, 0, 0.3);
}

.dome-glow {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 15px;
  background: radial-gradient(ellipse, rgba(99, 179, 237, 0.6) 0%, transparent 70%);
  animation: dome-glow-anim 18s ease-in-out infinite;
}

@keyframes dome-glow-anim {
  0%, 50% {
    opacity: 0;
  }
  52%, 88% {
    opacity: 0.8;
  }
  95%, 100% {
    opacity: 0;
  }
}

/* Habitat modules */
.habitat-module {
  width: 50px;
  height: 25px;
  background: linear-gradient(to bottom, #4b5563, #374151);
  border: 2px solid #6b7280;
  border-radius: 5px;
  position: relative;
}

.habitat-module.small {
  width: 35px;
  height: 20px;
}

.habitat-window {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  width: 30px;
  height: 10px;
  background: linear-gradient(to bottom, #63b3ed, #3182ce);
  border-radius: 2px;
  opacity: 0;
  animation: lights-on 0.3s ease-out forwards;
}

.habitat-window.small {
  width: 20px;
  height: 8px;
}

/* First ring - closest habitats (9s = 50%) */
.habitat-left-1,
.habitat-right-1 {
  bottom: 8px;
  animation: build-ring1 18s ease-out infinite;
}

.habitat-left-1 {
  left: calc(50% - 90px);
}

.habitat-right-1 {
  left: calc(50% + 40px);
}

@keyframes build-ring1 {
  0%, 49% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  50% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  53% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  55%, 88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

.habitat-left-1 .habitat-window,
.habitat-right-1 .habitat-window {
  animation: window-ring1 18s ease-out infinite;
}

@keyframes window-ring1 {
  0%, 52% {
    opacity: 0;
  }
  55%, 88% {
    opacity: 0.8;
  }
  95%, 100% {
    opacity: 0;
  }
}

/* Second ring - outer habitats (10s = 55.5%) */
.habitat-left-2,
.habitat-right-2 {
  bottom: 8px;
  animation: build-ring2 18s ease-out infinite;
}

.habitat-left-2 {
  left: calc(50% - 140px);
}

.habitat-right-2 {
  left: calc(50% + 105px);
}

@keyframes build-ring2 {
  0%, 54% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  55% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  58% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  60%, 88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

.habitat-left-2 .habitat-window,
.habitat-right-2 .habitat-window {
  animation: window-ring2 18s ease-out infinite;
}

@keyframes window-ring2 {
  0%, 58% {
    opacity: 0;
  }
  60%, 88% {
    opacity: 0.8;
  }
  95%, 100% {
    opacity: 0;
  }
}

/* Third ring - solar arrays (11s = 61%) */
.solar-left,
.solar-right {
  display: flex;
  gap: 3px;
  bottom: 8px;
  animation: build-ring3 18s ease-out infinite;
}

.solar-left {
  left: calc(50% - 200px);
}

.solar-right {
  left: calc(50% + 155px);
}

@keyframes build-ring3 {
  0%, 60% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  61% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  64% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  66%, 88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

.solar-panel {
  width: 15px;
  height: 30px;
  background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e40af 100%);
  border: 1px solid #3b82f6;
  transform: skewX(-5deg);
}

/* Fourth ring - antenna (12s = 67%) */
.antenna-left {
  left: calc(50% - 230px);
  bottom: 8px;
  animation: build-ring4 18s ease-out infinite;
}

@keyframes build-ring4 {
  0%, 66% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  67% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  70% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  72%, 88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

.antenna-tower {
  width: 4px;
  height: 45px;
  background: linear-gradient(to bottom, #9ca3af, #6b7280);
  margin: 0 auto;
}

.antenna-dish {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 10px;
  background: #9ca3af;
  border-radius: 0 0 20px 20px;
  border: 2px solid #d1d5db;
  border-top: none;
}

.antenna-signal {
  position: absolute;
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  animation: signal-anim 18s ease-in-out infinite;
}

@keyframes signal-anim {
  0%, 72% {
    opacity: 0;
    box-shadow: 0 0 5px #22c55e;
  }
  73%, 75%, 77%, 79%, 81%, 83%, 85%, 87% {
    opacity: 1;
    box-shadow: 0 0 15px #22c55e;
  }
  74%, 76%, 78%, 80%, 82%, 84%, 86%, 88% {
    opacity: 0.3;
    box-shadow: 0 0 5px #22c55e;
  }
  95%, 100% {
    opacity: 0;
    box-shadow: 0 0 5px #22c55e;
  }
}

/* Fourth ring - reactor (12s = 67%) */
.reactor-right {
  left: calc(50% + 200px);
  bottom: 8px;
  animation: build-ring4 18s ease-out infinite;
}

.reactor-core {
  width: 30px;
  height: 40px;
  background: linear-gradient(to bottom, #4b5563, #374151);
  border: 2px solid #6b7280;
  border-radius: 5px 5px 0 0;
  position: relative;
}

.reactor-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 15px;
  height: 15px;
  background: radial-gradient(circle, #f59e0b 0%, #f97316 50%, transparent 70%);
  border-radius: 50%;
  animation: reactor-glow-anim 18s ease-in-out infinite;
}

@keyframes reactor-glow-anim {
  0%, 72% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  73%, 74%, 76%, 78%, 80%, 82%, 84%, 86%, 88% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.2);
  }
  75%, 77%, 79%, 81%, 83%, 85%, 87% {
    opacity: 0.6;
    transform: translate(-50%, -50%) scale(0.8);
  }
  95%, 100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
}

/* Fifth ring - additional habitats (13s = 72%) */
.habitat-left-3,
.habitat-right-3 {
  bottom: 8px;
  animation: build-ring5 18s ease-out infinite;
}

.habitat-left-3 {
  left: calc(50% - 280px);
}

.habitat-right-3 {
  left: calc(50% + 245px);
}

@keyframes build-ring5 {
  0%, 71% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  72% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  75% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  77%, 88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

.habitat-left-3 .habitat-window,
.habitat-right-3 .habitat-window {
  animation: window-ring5 18s ease-out infinite;
}

@keyframes window-ring5 {
  0%, 75% {
    opacity: 0;
  }
  77%, 88% {
    opacity: 0.8;
  }
  95%, 100% {
    opacity: 0;
  }
}

/* Sixth ring - storage/solar (14s = 78%) */
.storage-left {
  left: calc(50% - 340px);
  bottom: 8px;
  display: flex;
  gap: 5px;
  animation: build-ring6 18s ease-out infinite;
}

.storage-tank {
  width: 20px;
  height: 35px;
  background: linear-gradient(to right, #4b5563, #6b7280, #4b5563);
  border: 2px solid #9ca3af;
  border-radius: 10px 10px 5px 5px;
}

.solar-right-2 {
  left: calc(50% + 310px);
  bottom: 8px;
  display: flex;
  gap: 3px;
  animation: build-ring6 18s ease-out infinite;
}

@keyframes build-ring6 {
  0%, 77% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  78% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  81% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  83%, 88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

/* Seventh ring - outposts (15s = 83%) */
.outpost-left,
.outpost-right {
  bottom: 8px;
  animation: build-ring7 18s ease-out infinite;
}

.outpost-left {
  left: calc(50% - 420px);
}

.outpost-right {
  left: calc(50% + 400px);
}

.outpost-dome {
  width: 30px;
  height: 18px;
  background: linear-gradient(to bottom, #6b7280, #4b5563);
  border: 2px solid #9ca3af;
  border-radius: 15px 15px 0 0;
  border-bottom: none;
}

.outpost-antenna {
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 15px;
  background: #9ca3af;
}

.outpost-antenna::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 6px;
  height: 6px;
  background: #ef4444;
  border-radius: 50%;
  animation: outpost-blink 18s ease-in-out infinite;
}

@keyframes outpost-blink {
  0%, 85% {
    opacity: 0;
  }
  86%, 87%, 88% {
    opacity: 1;
  }
  86.5%, 87.5% {
    opacity: 0.3;
  }
  95%, 100% {
    opacity: 0;
  }
}

.outpost-flag {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 20px;
  background: #9ca3af;
}

.outpost-flag::after {
  content: '';
  position: absolute;
  top: 0;
  left: 2px;
  width: 12px;
  height: 8px;
  background: linear-gradient(to bottom, #f97316, #ea580c);
  clip-path: polygon(0 0, 100% 25%, 100% 75%, 0 100%);
}

@keyframes build-ring7 {
  0%, 82% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  83% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  86% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  88% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

/* Glass Domes - biodomes/greenhouses */
.glass-dome-left,
.glass-dome-right {
  bottom: 8px;
  animation: build-ring5 18s ease-out infinite;
}

.glass-dome-left {
  left: calc(50% - 220px);
}

.glass-dome-right {
  left: calc(50% + 290px);
}

.glass-dome {
  width: 40px;
  height: 25px;
  background: linear-gradient(
    135deg,
    rgba(147, 197, 253, 0.3) 0%,
    rgba(191, 219, 254, 0.5) 30%,
    rgba(147, 197, 253, 0.3) 60%,
    rgba(96, 165, 250, 0.4) 100%
  );
  border: 2px solid rgba(147, 197, 253, 0.6);
  border-radius: 20px 20px 0 0;
  border-bottom: 2px solid #6b7280;
  position: relative;
  overflow: hidden;
}

.glass-dome.large {
  width: 50px;
  height: 30px;
  border-radius: 25px 25px 0 0;
}

.glass-dome-shine {
  position: absolute;
  top: 3px;
  left: 5px;
  width: 12px;
  height: 8px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.6) 0%,
    rgba(255, 255, 255, 0.2) 100%
  );
  border-radius: 50%;
}

.glass-dome-plants {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 8px;
  background: linear-gradient(to top, #22c55e 0%, #4ade80 50%, transparent 100%);
  border-radius: 2px 2px 0 0;
  animation: plants-grow 18s ease-out infinite;
}

.glass-dome.large .glass-dome-plants {
  height: 12px;
}

@keyframes plants-grow {
  0%, 75% {
    opacity: 0;
    transform: translateX(-50%) scaleY(0);
  }
  77% {
    opacity: 1;
    transform: translateX(-50%) scaleY(0.5);
  }
  80%, 88% {
    opacity: 1;
    transform: translateX(-50%) scaleY(1);
  }
  95%, 100% {
    opacity: 0;
    transform: translateX(-50%) scaleY(1);
  }
}

/* Construction Cranes */
.crane-left,
.crane-right {
  bottom: 8px;
  animation: build-ring6 18s ease-out infinite;
}

.crane-left {
  left: calc(50% - 380px);
}

.crane-right {
  left: calc(50% + 365px);
}

.crane-base {
  width: 20px;
  height: 8px;
  background: linear-gradient(to bottom, #fbbf24, #d97706);
  border: 1px solid #92400e;
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.crane-tower {
  width: 6px;
  height: 55px;
  background: linear-gradient(to right, #fbbf24, #f59e0b, #fbbf24);
  border: 1px solid #d97706;
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.crane-tower::before {
  content: '';
  position: absolute;
  top: 0;
  left: -2px;
  right: -2px;
  height: 100%;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 4px,
    rgba(0, 0, 0, 0.2) 4px,
    rgba(0, 0, 0, 0.2) 5px
  );
}

/* Left crane arm - extends to the left */
.crane-left .crane-arm {
  width: 45px;
  height: 4px;
  background: linear-gradient(to bottom, #fbbf24, #d97706);
  border: 1px solid #92400e;
  position: absolute;
  bottom: 60px;
  right: 50%;
  transform-origin: right center;
  animation: crane-swing-left 18s ease-in-out infinite;
}

.crane-left .crane-arm::after {
  content: '';
  position: absolute;
  left: -3px;
  top: -2px;
  width: 6px;
  height: 8px;
  background: #ef4444;
  border-radius: 1px;
}

/* Right crane arm - extends to the right */
.crane-right .crane-arm {
  width: 45px;
  height: 4px;
  background: linear-gradient(to bottom, #fbbf24, #d97706);
  border: 1px solid #92400e;
  position: absolute;
  bottom: 60px;
  left: 50%;
  transform-origin: left center;
  animation: crane-swing-right 18s ease-in-out infinite;
}

.crane-right .crane-arm::after {
  content: '';
  position: absolute;
  right: -3px;
  top: -2px;
  width: 6px;
  height: 8px;
  background: #ef4444;
  border-radius: 1px;
}

/* Counterweight for right crane */
.crane-counterweight {
  width: 12px;
  height: 10px;
  background: linear-gradient(to bottom, #78716c, #57534e);
  border: 1px solid #44403c;
  position: absolute;
  bottom: 58px;
  right: calc(50% + 2px);
}

@keyframes crane-swing-left {
  0%, 78% {
    transform: rotate(0deg);
  }
  82% {
    transform: rotate(-5deg);
  }
  85% {
    transform: rotate(3deg);
  }
  88% {
    transform: rotate(-2deg);
  }
  95%, 100% {
    transform: rotate(0deg);
  }
}

@keyframes crane-swing-right {
  0%, 78% {
    transform: rotate(0deg);
  }
  82% {
    transform: rotate(5deg);
  }
  85% {
    transform: rotate(-3deg);
  }
  88% {
    transform: rotate(2deg);
  }
  95%, 100% {
    transform: rotate(0deg);
  }
}

/* Left crane cable and hook */
.crane-cable {
  width: 1px;
  height: 20px;
  background: #78716c;
  position: absolute;
  bottom: 40px;
  left: calc(50% - 15px);
  animation: cable-move 18s ease-in-out infinite;
}

.crane-hook {
  width: 6px;
  height: 6px;
  border: 2px solid #78716c;
  border-top: none;
  border-radius: 0 0 3px 3px;
  position: absolute;
  bottom: 34px;
  left: calc(50% - 18px);
  animation: hook-move 18s ease-in-out infinite;
}

/* Right crane cable and hook */
.crane-cable-right {
  width: 1px;
  height: 20px;
  background: #78716c;
  position: absolute;
  bottom: 40px;
  left: calc(50% + 40px);
  animation: cable-move 18s ease-in-out infinite;
}

.crane-hook-right {
  width: 6px;
  height: 6px;
  border: 2px solid #78716c;
  border-top: none;
  border-radius: 0 0 3px 3px;
  position: absolute;
  bottom: 34px;
  left: calc(50% + 37px);
  animation: hook-move 18s ease-in-out infinite;
}

@keyframes cable-move {
  0%, 78% {
    height: 20px;
    bottom: 40px;
  }
  82% {
    height: 30px;
    bottom: 30px;
  }
  85% {
    height: 15px;
    bottom: 45px;
  }
  88% {
    height: 25px;
    bottom: 35px;
  }
  95%, 100% {
    height: 20px;
    bottom: 40px;
  }
}

@keyframes hook-move {
  0%, 78% {
    bottom: 34px;
  }
  82% {
    bottom: 24px;
  }
  85% {
    bottom: 39px;
  }
  88% {
    bottom: 29px;
  }
  95%, 100% {
    bottom: 34px;
  }
}

/* Defense Systems - Laser Turret */
.laser-turret {
  left: calc(50% - 160px);
  bottom: 8px;
  animation: build-defense 18s ease-out infinite;
}

.turret-platform {
  width: 40px;
  height: 12px;
  background: linear-gradient(to bottom, #6b7280, #4b5563);
  border: 2px solid #9ca3af;
  border-radius: 4px;
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.turret-body {
  width: 28px;
  height: 24px;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #1e40af 100%);
  border: 2px solid #60a5fa;
  border-radius: 6px 6px 4px 4px;
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
}

.turret-body::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 10px;
  height: 10px;
  background: radial-gradient(circle, #22d3ee 0%, #0891b2 100%);
  border-radius: 50%;
  box-shadow: 0 0 8px #22d3ee;
}

.turret-cannon {
  width: 35px;
  height: 8px;
  background: linear-gradient(to bottom, #60a5fa, #3b82f6, #1d4ed8);
  border: 2px solid #93c5fd;
  border-radius: 4px;
  position: absolute;
  bottom: 28px;
  left: calc(50% - 35px);
  transform-origin: right center;
  animation: turret-aim 18s ease-in-out infinite;
}

/* Laser beam attached to cannon - fires from the tip */
.turret-cannon::after {
  content: '';
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 4px;
  background: linear-gradient(to left, #22d3ee, #06b6d4, #0891b2);
  border-radius: 2px;
  box-shadow:
    0 0 8px #22d3ee,
    0 0 16px #06b6d4,
    0 0 24px rgba(34, 211, 238, 0.5);
  opacity: 0;
  animation: cannon-beam 18s linear infinite;
}

@keyframes cannon-beam {
  0%, 87.5% {
    opacity: 0;
    width: 0;
  }
  88% {
    opacity: 1;
    width: 320px;
  }
  90% {
    opacity: 1;
    width: 380px;
  }
  92% {
    opacity: 0.8;
    width: 420px;
  }
  93% {
    opacity: 0;
    width: 450px;
  }
  94%, 100% {
    opacity: 0;
    width: 0;
  }
}


.turret-cannon-tip {
  width: 8px;
  height: 12px;
  background: linear-gradient(to right, #22d3ee, #06b6d4);
  border-radius: 2px;
  position: absolute;
  bottom: 26px;
  left: calc(50% - 42px);
  animation: turret-tip-aim 18s ease-in-out infinite;
}

@keyframes turret-aim {
  0%, 86% {
    transform: rotate(0deg);
  }
  87% {
    transform: rotate(20deg);
  }
  88% {
    transform: rotate(35deg);
  }
  90% {
    transform: rotate(45deg);
  }
  92% {
    transform: rotate(55deg);
  }
  94%, 100% {
    transform: rotate(0deg);
  }
}

@keyframes turret-tip-aim {
  0%, 86% {
    left: calc(50% - 42px);
    bottom: 26px;
  }
  87% {
    left: calc(50% - 38px);
    bottom: 38px;
  }
  88% {
    left: calc(50% - 32px);
    bottom: 48px;
  }
  90% {
    left: calc(50% - 26px);
    bottom: 58px;
  }
  92% {
    left: calc(50% - 20px);
    bottom: 68px;
  }
  94%, 100% {
    left: calc(50% - 42px);
    bottom: 26px;
  }
}

/* Defense Systems - Missile Battery */
.missile-battery {
  left: calc(50% + 130px);
  bottom: 8px;
  animation: build-defense 18s ease-out infinite;
}

.battery-platform {
  width: 50px;
  height: 12px;
  background: linear-gradient(to bottom, #6b7280, #4b5563);
  border: 2px solid #9ca3af;
  border-radius: 4px;
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.battery-launcher {
  width: 40px;
  height: 30px;
  background: linear-gradient(135deg, #4b5563 0%, #374151 50%, #1f2937 100%);
  border: 2px solid #6b7280;
  border-radius: 4px;
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%) rotate(30deg);
  transform-origin: bottom center;
}

.battery-launcher::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  right: 2px;
  bottom: 2px;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 6px,
    #1f2937 6px,
    #1f2937 8px
  );
  border-radius: 2px;
}

.battery-missile {
  width: 6px;
  height: 18px;
  background: linear-gradient(to top, #dc2626, #ef4444, #fbbf24);
  border-radius: 3px 3px 1px 1px;
  position: absolute;
  bottom: 22px;
}

.battery-missile::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-bottom: 6px solid #fbbf24;
}

.battery-missile-1 {
  left: calc(50% - 10px);
  transform: rotate(30deg);
}

.battery-missile-2 {
  left: calc(50% - 2px);
  transform: rotate(30deg);
}

.battery-missile-3 {
  left: calc(50% + 6px);
  transform: rotate(30deg);
}

/* Flying missiles - originate from battery position */
.flying-missile {
  position: absolute;
  width: 10px;
  height: 24px;
  background: linear-gradient(to top, #dc2626, #ef4444, #fbbf24);
  border-radius: 5px 5px 2px 2px;
  opacity: 0;
  z-index: 10;
}

.flying-missile::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 10px solid #fbbf24;
}

.flying-missile::after {
  content: '';
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 25px;
  background: linear-gradient(to top, transparent, #f97316, #fbbf24);
  border-radius: 4px;
  opacity: 0.9;
}

.flying-missile-1 {
  animation: missile-fly-1 18s ease-out infinite;
}

.flying-missile-2 {
  animation: missile-fly-2 18s ease-out infinite;
}

/* Missiles start from battery and arc toward right ship - nose points in direction of travel */
@keyframes missile-fly-1 {
  0%, 88.5% {
    /* Start at missile battery - pointing up-left toward target */
    right: calc(50% - 145px);
    bottom: 75px;
    opacity: 0;
    transform: rotate(-30deg);
  }
  89% {
    /* Launch from battery */
    right: calc(50% - 145px);
    bottom: 95px;
    opacity: 1;
    transform: rotate(-35deg);
  }
  90.5% {
    /* Arc upward toward target */
    right: calc(50% - 80px);
    bottom: 200px;
    opacity: 1;
    transform: rotate(-40deg);
  }
  92% {
    /* Chasing target - more vertical now */
    right: calc(50% - 20px);
    bottom: 320px;
    opacity: 1;
    transform: rotate(-50deg);
  }
  94% {
    /* Miss as ship flees - tracking upward */
    right: calc(50% + 50px);
    bottom: 480px;
    opacity: 0;
    transform: rotate(-60deg);
  }
  95%, 100% {
    right: calc(50% - 145px);
    bottom: 75px;
    opacity: 0;
    transform: rotate(-30deg);
  }
}

@keyframes missile-fly-2 {
  0%, 89.5% {
    /* Start at missile battery - second missile launches slightly later */
    right: calc(50% - 140px);
    bottom: 75px;
    opacity: 0;
    transform: rotate(-25deg);
  }
  90% {
    /* Launch from battery */
    right: calc(50% - 140px);
    bottom: 100px;
    opacity: 1;
    transform: rotate(-32deg);
  }
  91.5% {
    /* Arc upward toward target */
    right: calc(50% - 60px);
    bottom: 230px;
    opacity: 1;
    transform: rotate(-42deg);
  }
  93% {
    /* Chasing target - more vertical */
    right: calc(50%);
    bottom: 380px;
    opacity: 1;
    transform: rotate(-55deg);
  }
  95% {
    /* Miss as ship flees - tracking upward */
    right: calc(50% + 60px);
    bottom: 540px;
    opacity: 0;
    transform: rotate(-65deg);
  }
  96%, 100% {
    right: calc(50% - 140px);
    bottom: 75px;
    opacity: 0;
    transform: rotate(-25deg);
  }
}

@keyframes build-defense {
  0%, 84% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  85% {
    opacity: 0;
    transform: scale(0) translateY(20px);
  }
  87% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  88%, 93% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  95%, 100% {
    opacity: 0;
    transform: scale(1) translateY(0);
  }
}

/* Enemy Spaceships - large, slow, flying HIGH in the sky */
.enemy-ship {
  position: absolute;
  opacity: 0;
  z-index: 5;
}

.enemy-ship-left {
  animation: enemy-fly-left 18s linear infinite;
}

.enemy-ship-right {
  animation: enemy-fly-right 18s linear infinite;
}

/* Left ship: approaches from left, gets shot at, veers away and flees - SLOWER */
@keyframes enemy-fly-left {
  0%, 78% {
    /* Off screen left */
    left: -100px;
    bottom: 380px;
    opacity: 0;
    transform: rotate(5deg);
  }
  80% {
    /* Entering from left, flying right */
    left: -5%;
    bottom: 375px;
    opacity: 1;
    transform: rotate(5deg);
  }
  83% {
    /* Approaching colony slowly */
    left: 10%;
    bottom: 360px;
    opacity: 1;
    transform: rotate(5deg);
  }
  86% {
    /* Getting closer */
    left: 22%;
    bottom: 340px;
    opacity: 1;
    transform: rotate(5deg);
  }
  88% {
    /* Close - laser fires! */
    left: 30%;
    bottom: 310px;
    opacity: 1;
    transform: rotate(5deg);
  }
  90% {
    /* Takes evasive action - starts banking */
    left: 35%;
    bottom: 340px;
    opacity: 1;
    transform: rotate(-20deg);
  }
  93% {
    /* Fleeing upward and away */
    left: 42%;
    bottom: 450px;
    opacity: 1;
    transform: rotate(-35deg);
  }
  96% {
    /* Escaping off screen top-right */
    left: 52%;
    bottom: 580px;
    opacity: 0.5;
    transform: rotate(-40deg);
  }
  98%, 100% {
    /* Gone */
    left: 60%;
    bottom: 700px;
    opacity: 0;
    transform: rotate(-45deg);
  }
}

/* Right ship: approaches from right, missiles fire, veers away and flees - SLOWER */
@keyframes enemy-fly-right {
  0%, 79% {
    /* Off screen right */
    right: -100px;
    bottom: 420px;
    opacity: 0;
    transform: rotate(-5deg);
  }
  81% {
    /* Entering from right, flying left */
    right: -5%;
    bottom: 415px;
    opacity: 1;
    transform: rotate(-5deg);
  }
  84% {
    /* Approaching colony slowly */
    right: 10%;
    bottom: 400px;
    opacity: 1;
    transform: rotate(-5deg);
  }
  87% {
    /* Getting closer */
    right: 22%;
    bottom: 375px;
    opacity: 1;
    transform: rotate(-5deg);
  }
  89% {
    /* Close - missiles launch! */
    right: 30%;
    bottom: 350px;
    opacity: 1;
    transform: rotate(-5deg);
  }
  91% {
    /* Takes evasive action - starts banking */
    right: 35%;
    bottom: 380px;
    opacity: 1;
    transform: rotate(20deg);
  }
  94% {
    /* Fleeing upward and away */
    right: 42%;
    bottom: 490px;
    opacity: 1;
    transform: rotate(35deg);
  }
  97% {
    /* Escaping off screen top-left */
    right: 52%;
    bottom: 620px;
    opacity: 0.5;
    transform: rotate(40deg);
  }
  99%, 100% {
    /* Gone */
    right: 60%;
    bottom: 750px;
    opacity: 0;
    transform: rotate(45deg);
  }
}

/* Walkways */
.walkway {
  position: absolute;
  height: 4px;
  background: linear-gradient(to right, #4b5563, #6b7280, #4b5563);
  bottom: 12px;
  opacity: 0;
}

/* First ring walkways (9.3s = 52%) */
.walkway-left-1,
.walkway-right-1 {
  animation: walkway-ring1 18s ease-out infinite;
}

.walkway-left-1 {
  left: calc(50% - 65px);
  width: 35px;
}

.walkway-right-1 {
  left: calc(50% + 30px);
  width: 35px;
}

@keyframes walkway-ring1 {
  0%, 51% {
    opacity: 0;
    transform: scaleX(0);
  }
  52% {
    opacity: 0;
    transform: scaleX(0);
  }
  54%, 88% {
    opacity: 1;
    transform: scaleX(1);
  }
  95%, 100% {
    opacity: 0;
    transform: scaleX(1);
  }
}

/* Second ring walkways (10.3s = 57%) */
.walkway-left-2,
.walkway-right-2 {
  animation: walkway-ring2 18s ease-out infinite;
}

.walkway-left-2 {
  left: calc(50% - 140px);
  width: 25px;
}

.walkway-right-2 {
  left: calc(50% + 90px);
  width: 25px;
}

@keyframes walkway-ring2 {
  0%, 56% {
    opacity: 0;
    transform: scaleX(0);
  }
  57% {
    opacity: 0;
    transform: scaleX(0);
  }
  59%, 88% {
    opacity: 1;
    transform: scaleX(1);
  }
  95%, 100% {
    opacity: 0;
    transform: scaleX(1);
  }
}

/* Third/Fourth ring walkways (connects to ring 5) */
.walkway-left-3,
.walkway-right-3 {
  animation: walkway-ring3 18s ease-out infinite;
}

.walkway-left-3 {
  left: calc(50% - 280px);
  width: 50px;
}

.walkway-right-3 {
  left: calc(50% + 195px);
  width: 50px;
}

@keyframes walkway-ring3 {
  0%, 73% {
    opacity: 0;
    transform: scaleX(0);
  }
  74% {
    opacity: 0;
    transform: scaleX(0);
  }
  76%, 88% {
    opacity: 1;
    transform: scaleX(1);
  }
  95%, 100% {
    opacity: 0;
    transform: scaleX(1);
  }
}

/* Fifth/Sixth ring walkways (connects to ring 6/7) */
.walkway-left-4,
.walkway-right-4 {
  animation: walkway-ring4 18s ease-out infinite;
}

.walkway-left-4 {
  left: calc(50% - 370px);
  width: 90px;
}

.walkway-right-4 {
  left: calc(50% + 295px);
  width: 105px;
}

@keyframes walkway-ring4 {
  0%, 79% {
    opacity: 0;
    transform: scaleX(0);
  }
  80% {
    opacity: 0;
    transform: scaleX(0);
  }
  82%, 88% {
    opacity: 1;
    transform: scaleX(1);
  }
  95%, 100% {
    opacity: 0;
    transform: scaleX(1);
  }
}


/* Spaceship container and animation - adjusted for 18s loop */
.spaceship-container {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  animation: landing 18s ease-in-out infinite;
}

@keyframes landing {
  0% {
    top: -150px;
    opacity: 1;
    transform: translateX(-50%) rotate(0deg);
  }
  15% {
    top: 10%;
    transform: translateX(-50%) rotate(-2deg);
  }
  25% {
    top: 30%;
    transform: translateX(-50%) rotate(2deg);
  }
  32% {
    top: 50%;
    transform: translateX(-50%) rotate(-1deg);
  }
  38% {
    top: calc(100% - 200px);
    transform: translateX(-50%) rotate(0deg);
  }
  42%,
  88% {
    top: calc(100% - 180px);
    transform: translateX(-50%) rotate(0deg);
    opacity: 1;
  }
  95%,
  100% {
    top: calc(100% - 180px);
    transform: translateX(-50%) rotate(0deg);
    opacity: 0;
  }
}

/* Engine glow - simple opacity pulse, no transform */
.engine-glow {
  animation: glow-pulse 0.2s ease-in-out infinite alternate;
}

@keyframes glow-pulse {
  0% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* Engine thrust flames - fade out after landing */
.thrust-container {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  animation: thrust-fade 18s ease-in-out infinite;
}

@keyframes thrust-fade {
  0%,
  38% {
    opacity: 1;
  }
  42%,
  100% {
    opacity: 0;
  }
}

.thrust {
  width: 8px;
  background: linear-gradient(to bottom, #f59e0b, #ef4444, transparent);
  border-radius: 0 0 4px 4px;
  animation: thrust-flicker 0.1s ease-in-out infinite alternate;
}

.thrust-1 {
  height: 30px;
  animation-delay: 0s;
}

.thrust-2 {
  height: 45px;
  width: 12px;
  animation-delay: 0.05s;
}

.thrust-3 {
  height: 30px;
  animation-delay: 0.1s;
}

@keyframes thrust-flicker {
  0% {
    opacity: 0.7;
    transform: scaleY(0.9);
  }
  100% {
    opacity: 1;
    transform: scaleY(1.1);
  }
}

/* Title glow effect */
.title {
  text-shadow:
    0 0 20px rgba(249, 115, 22, 0.5),
    0 0 40px rgba(249, 115, 22, 0.3),
    0 0 60px rgba(249, 115, 22, 0.1);
  animation: title-glow 3s ease-in-out infinite alternate;
}

@keyframes title-glow {
  0% {
    text-shadow:
      0 0 20px rgba(249, 115, 22, 0.5),
      0 0 40px rgba(249, 115, 22, 0.3),
      0 0 60px rgba(249, 115, 22, 0.1);
  }
  100% {
    text-shadow:
      0 0 30px rgba(249, 115, 22, 0.7),
      0 0 60px rgba(249, 115, 22, 0.5),
      0 0 90px rgba(249, 115, 22, 0.2);
  }
}

/* Button hover enhancement */
.enter-button {
  position: relative;
  overflow: hidden;
}

.enter-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.enter-button:hover::before {
  left: 100%;
}
</style>
