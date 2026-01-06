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
      y: Math.random() * 70, // Keep stars in upper 70% to not overlap planet
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
    <div class="absolute bottom-0 left-0 right-0 h-32 planet-surface">
      <div class="absolute inset-0 planet-glow" />
      <!-- Landing pad -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div class="landing-pad">
          <div class="landing-pad-lights" />
        </div>
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
            <stop offset="0%" style="stop-color:#4a5568" />
            <stop offset="50%" style="stop-color:#2d3748" />
            <stop offset="100%" style="stop-color:#1a202c" />
          </linearGradient>
          <linearGradient id="wingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#2d3748" />
            <stop offset="100%" style="stop-color:#4a5568" />
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

/* Landing pad */
.landing-pad {
  width: 100px;
  height: 8px;
  background: linear-gradient(to right, #374151, #4b5563, #374151);
  border-radius: 2px;
  position: relative;
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

/* Spaceship container and animation */
.spaceship-container {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  animation: landing 8s ease-in-out infinite;
}

@keyframes landing {
  0% {
    top: -150px;
    transform: translateX(-50%) rotate(0deg);
  }
  20% {
    top: 10%;
    transform: translateX(-50%) rotate(-2deg);
  }
  40% {
    top: 30%;
    transform: translateX(-50%) rotate(2deg);
  }
  60% {
    top: 50%;
    transform: translateX(-50%) rotate(-1deg);
  }
  80% {
    top: calc(100% - 200px);
    transform: translateX(-50%) rotate(0deg);
  }
  90% {
    top: calc(100% - 180px);
    transform: translateX(-50%) rotate(0deg);
  }
  100% {
    top: calc(100% - 180px);
    transform: translateX(-50%) rotate(0deg);
    opacity: 0;
  }
}

/* Engine glow pulse */
.engine-glow {
  animation: glow-pulse 0.3s ease-in-out infinite alternate;
}

@keyframes glow-pulse {
  0% {
    opacity: 0.6;
    transform: scale(1, 0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1, 1.2);
  }
}

/* Engine thrust flames */
.thrust-container {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
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
