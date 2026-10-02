// ===== 技术验证编辑器（开发工具）：做技术验证时用的小工具都放这，一个按钮一个工具 =====
import { useState } from 'react';
import { ChartRecorder } from './ChartRecorder';

type Tool = 'chart';

export default function LabView() {
  const [tool, setTool] = useState<Tool | null>(null);
  return (
    <div className="view lab">
      {tool === 'chart'
        ? <ChartRecorder onBack={() => setTool(null)} />
        : <div className="lab-panel"><div className="lab-row"><button className="btn primary" onClick={() => setTool('chart')}>谱面编辑</button></div></div>}
    </div>
  );
}
