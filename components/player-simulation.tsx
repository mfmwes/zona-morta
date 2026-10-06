'use client';
import { createContext, useContext } from 'react';
import type { PlayerPreviewSession } from '@/lib/player-preview';
export type PlayerSimulation = Pick<PlayerPreviewSession, 'spotlight' | 'damage' | 'target'>;
export const PlayerSimulationContext = createContext<PlayerSimulation | null>(null);
export function usePlayerSimulation() { return useContext(PlayerSimulationContext); }
