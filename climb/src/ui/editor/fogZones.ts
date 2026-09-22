// 迷雾区的区号与颜色（编辑器显示用；游戏里所有区都是黑的）
export const FOG_ZONES = ['1', '2', '3', '4'] as const;
export const FOG_ZONE_COLORS: Record<string, number> = { '1': 0x4cc9f0, '2': 0x06d6a0, '3': 0x9b5de5, '4': 0xff9f1c };
export const fogBrush = (zone: string) => `fog:${zone}`;
export const isFogBrush = (brush: string) => brush.startsWith('fog:');
