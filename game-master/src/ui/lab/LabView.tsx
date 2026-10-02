// ===== 技术验证编辑器（开发工具）：打开就是节奏关卡试玩（下面是游戏画面，随时从某处开始）；谱面录制是另一个工具 =====
import { useState } from 'react';
import { ChartRecorder } from './ChartRecorder';
import { RhythmLab } from './RhythmLab';

type Tool = 'play' | 'chart';

export default function LabView() {
  const [tool, setTool] = useState<Tool>('play');
  return tool === 'chart'
    ? <div className="view lab"><ChartRecorder onBack={() => setTool('play')} /></div>
    : <RhythmLab onRecorder={() => setTool('chart')} />;
}
