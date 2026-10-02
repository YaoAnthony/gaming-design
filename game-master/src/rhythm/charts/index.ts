// 所有谱面：按 id 取
import type { Chart } from '../chart';
import { MEGALOVANIA } from './megalovania';

export const CHARTS: Chart[] = [MEGALOVANIA];
export const chartById = (id: string): Chart | undefined => CHARTS.find(c => c.id === id);
