/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

export type GameState = 'menu' | 'playing' | 'gameover';
export type EntityState = 'active' | 'disabled';

export interface EnemyData {
  id: string;
  position: [number, number, number];
  color: string;
  state: EntityState;
  disabledUntil: number;
}

export interface HealthPackData {
  id: string;
  position: [number, number, number];
}

export interface PlayerData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: EntityState;
  disabledUntil: number;
  score: number;
  color: string;
}

export interface LaserData {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  timestamp: number;
  color: string;
}

export interface ParticleData {
  id: string;
  position: [number, number, number];
  timestamp: number;
  color: string;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

interface GameStore {
  gameState: GameState;
  score: number;
  timeLeft: number;
  playerHealth: number;
  playerState: EntityState;
  playerDisabledUntil: number;
  enemies: EnemyData[];
  healthPacks: HealthPackData[];
  lasers: LaserData[];
  particles: ParticleData[];
  events: GameEvent[];
  
  // Floor logic
  floorColor: string;
  floorFlashing: boolean;
  colorCycleTimer: number;
  
  // Spawning timers
  botSpawnTimer: number;
  healthPackTimer: number;
  
  // Multiplayer
  socket: Socket | null;
  otherPlayers: Record<string, PlayerData>;

  startGame: () => void;
  endGame: () => void;
  leaveGame: () => void;
  updateTime: (delta: number) => void;
  hitPlayer: () => void;
  collectHealthPack: (id: string) => void;
  hitEnemy: (id: string, byPlayer?: boolean) => void;
  addLaser: (start: [number, number, number], end: [number, number, number], color: string) => void;
  addParticles: (position: [number, number, number], color: string) => void;
  addEvent: (message: string) => void;
  updateEnemies: (time: number) => void;
  cleanupEffects: (time: number) => void;
  setPlayerState: (state: EntityState) => void;
  
  // Multiplayer actions
  updatePlayerPosition: (position: [number, number, number], rotation: number) => void;

  // Mobile Controls
  mobileInput: {
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
  };
  setMobileInput: (input: Partial<{
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
  }>) => void;
}

const FLOOR_COLORS = ['#00ffff', '#ff00ff', '#00ff00', '#ff8800'];
const BOT_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: 'menu',
  score: 0,
  timeLeft: 120,
  playerHealth: 3,
  playerState: 'active',
  playerDisabledUntil: 0,
  enemies: [],
  healthPacks: [],
  lasers: [],
  particles: [],
  events: [],
  
  floorColor: FLOOR_COLORS[0],
  floorFlashing: false,
  colorCycleTimer: 0,
  botSpawnTimer: 0,
  healthPackTimer: 0,
  
  socket: null,
  otherPlayers: {},

  mobileInput: {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    shooting: false
  },

  setMobileInput: (input) => set((state) => ({
    mobileInput: { ...state.mobileInput, ...input }
  })),

  startGame: () => {
    const { socket } = get();
    if (socket) socket.disconnect();

    set({
      gameState: 'playing',
      score: 0,
      timeLeft: 120,
      playerHealth: 3,
      playerState: 'active',
      playerDisabledUntil: 0,
      enemies: [],
      healthPacks: [],
      lasers: [],
      particles: [],
      events: [],
      floorColor: FLOOR_COLORS[0],
      floorFlashing: false,
      colorCycleTimer: 0,
      botSpawnTimer: 0,
      healthPackTimer: 0,
      socket: null, // Reset socket for now to focus on single player logic if needed
      otherPlayers: {},
    });
  },

  endGame: () => {
    const { socket } = get();
    if (socket) socket.disconnect();
    set({ gameState: 'gameover', socket: null });
  },

  leaveGame: () => {
    const { socket } = get();
    if (socket) socket.disconnect();
    set({
      gameState: 'menu',
      socket: null,
      otherPlayers: {},
      enemies: [],
      healthPacks: [],
      lasers: [],
      particles: [],
      events: [],
      score: 0,
      timeLeft: 120,
      playerState: 'active',
      playerHealth: 3
    });
  },

  updateTime: (delta) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    const newTime = state.timeLeft - delta;
    if (newTime <= 0) {
      return { timeLeft: 0, gameState: 'gameover', socket: null };
    }

    // Floor color logic
    let { colorCycleTimer, floorColor, floorFlashing } = state;
    colorCycleTimer += delta;
    
    if (!floorFlashing && colorCycleTimer >= 10) {
      floorFlashing = true;
      colorCycleTimer = 0;
    } else if (floorFlashing && colorCycleTimer >= 5) {
      floorFlashing = false;
      colorCycleTimer = 0;
      const currentIndex = FLOOR_COLORS.indexOf(floorColor);
      floorColor = FLOOR_COLORS[(currentIndex + 1) % FLOOR_COLORS.length];
    }

    // Bot spawning logic
    let { botSpawnTimer, enemies } = state;
    botSpawnTimer += delta;
    if (botSpawnTimer >= 5) {
      botSpawnTimer = 0;
      const id = `bot-${Math.random().toString(36).substr(2, 5)}`;
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      const color = BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];
      enemies = [...enemies, { id, position: [x, 1, z], color, state: 'active', disabledUntil: 0 }];
    }

    // Health pack spawning logic
    let { healthPackTimer, healthPacks } = state;
    healthPackTimer += delta;
    if (healthPackTimer >= 30) {
      healthPackTimer = 0;
      const id = `hp-${Math.random().toString(36).substr(2, 5)}`;
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      healthPacks = [...healthPacks, { id, position: [x, 0.5, z] }];
    }

    return { 
      timeLeft: newTime, 
      colorCycleTimer, 
      floorColor, 
      floorFlashing, 
      botSpawnTimer, 
      enemies,
      healthPackTimer,
      healthPacks
    };
  }),

  hitPlayer: () => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    const newHealth = state.playerHealth - 1;
    if (newHealth <= 0) {
      return {
        playerHealth: 0,
        gameState: 'gameover'
      };
    }
    return {
      playerHealth: newHealth,
      playerState: 'disabled',
      playerDisabledUntil: Date.now() + 2000,
    };
  }),

  collectHealthPack: (id) => set((state) => ({
    healthPacks: state.healthPacks.filter(hp => hp.id !== id),
    playerHealth: Math.min(3, state.playerHealth + 1),
    events: [...state.events, { id: Math.random().toString(), message: "Health Restored!", timestamp: Date.now() }]
  })),

  hitEnemy: (id, byPlayer = false) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    const enemies = state.enemies.filter(e => e.id !== id);
    return {
      enemies,
      score: byPlayer ? state.score + 100 : state.score,
      events: byPlayer ? [...state.events, { id: Math.random().toString(), message: `Bot destroyed!`, timestamp: Date.now() }] : state.events
    };
  }),

  addLaser: (start, end, color) => {
    const { socket } = get();
    if (socket) {
      socket.emit('shoot', { start, end, color });
    }
    set((state) => ({
      lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start, end, timestamp: Date.now(), color }]
    }));
  },

  addParticles: (position, color) => set((state) => ({
    particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position, timestamp: Date.now(), color }]
  })),

  addEvent: (message) => set((state) => ({
    events: [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }]
  })),

  updateEnemies: (time) => set((state) => {
    if (state.playerState === 'disabled' && time > state.playerDisabledUntil) {
      return { playerState: 'active' };
    }
    return state;
  }),

  cleanupEffects: (time) => set((state) => {
    const lasers = state.lasers.filter(l => time - l.timestamp < 200);
    const particles = state.particles.filter(p => time - p.timestamp < 500);
    const events = state.events.filter(e => time - e.timestamp < 5000);
    if (lasers.length !== state.lasers.length || particles.length !== state.particles.length || events.length !== state.events.length) {
      return { lasers, particles, events };
    }
    return state;
  }),

  setPlayerState: (playerState) => set({ playerState }),

  updatePlayerPosition: (position, rotation) => {
    const { socket } = get();
    if (socket) {
      socket.emit('updatePosition', { position, rotation });
    }
  }
}));
