// 所有谱面：按 id 取
import type { Chart } from '../chart';
import { MEGALOVANIA } from './megalovania';

export const CHARTS: Chart[] = [MEGALOVANIA];
/** 在这一层打的那张谱（进了这一层就开打）；没有就是 undefined */
export const chartOfArena = (floorId: string): Chart | undefined => CHARTS.find(c => c.arena === floorId);
export const chartById = (id: string): Chart | undefined => CHARTS.find(c => c.id === id);
