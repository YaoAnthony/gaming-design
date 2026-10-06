import { Colors } from '@/shared/palette';
// 迷雾区的区号与颜色（编辑器显示用；游戏里揭开前伪装成周围的墙）
export const FOG_ZONES = ['1', '2', '3', '4'] as const;
export const FOG_ZONE_COLORS: Record<string, number> = { '1': Colors.sky, '2': Colors.green, '3': Colors.violet, '4': Colors.orange };
export const fogBrush = (zone: string) => `fog:${zone}`;
export const isFogBrush = (brush: string) => brush.startsWith('fog:');
