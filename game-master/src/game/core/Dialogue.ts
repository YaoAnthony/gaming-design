// ===== 对话服务 =====
// 两种对话共用一个对话框（hud.dialogue）：
// - talk：角色对话，按一下（平台层 = 跳一下）翻一句，说完回调
// - cutscene：剧情对话，每句按 autoMs 自动翻页
import type { DialogueLine } from '@/type';
import { store } from '@/redux/store';
import { setDialogue } from '@/redux/slices/hudSlice';

export interface Speaker { name: string; avatar?: string; lines: DialogueLine[] }

export class Dialogue {
  private talk_: { who: Speaker; index: number; onDone?: () => void } | null = null;
  private scene_: { speaker: string; lines: DialogueLine[]; index: number; until: number; onDone?: () => void } | null = null;

  /** @param playerScreen 玩家在屏幕上的 y 和屏幕高：对话框要躲开玩家 */
  constructor(private playerScreen: () => { y: number; h: number }) {}

  /** 正在进行按键翻页的对话（期间玩家不能左右走） */
  get talking(): boolean { return !!this.talk_; }

  talk(who: Speaker, onDone?: () => void): void {
    this.talk_ = { who, index: 0, onDone };
    this.showTalk();
  }

  /** 下一句；最后一句之后结束并回调 */
  advance(): void {
    const t = this.talk_; if (!t) return;
    t.index++;
    if (t.index < t.who.lines.length) { this.showTalk(); return; }
    this.talk_ = null;
    store.dispatch(setDialogue(null));
    t.onDone?.();
  }

  cutscene(speaker: string, lines: DialogueLine[], now: number, onDone?: () => void): void {
    this.scene_ = { speaker, lines, index: 0, until: 0, onDone };
    this.showScene(now);
  }

  /** 剧情自动翻页；每帧调 */
  update(now: number): void {
    const c = this.scene_; if (!c || now < c.until) return;
    c.index++;
    if (c.index < c.lines.length) { this.showScene(now); return; }
    this.scene_ = null;
    store.dispatch(setDialogue(null));
    c.onDone?.();
  }

  /** 打断角色对话（死亡、换层、重置）：下次走近从第一句重来。剧情对话不受影响 */
  end(): void {
    if (!this.talk_) return;
    this.talk_ = null;
    store.dispatch(setDialogue(null));
  }

  /** 对话框放哪：台词指定了就听台词的，否则躲开玩家（人在下半屏就放上面） */
  private pos(line: DialogueLine): 'top' | 'bottom' {
    if (line.pos) return line.pos;
    const p = this.playerScreen();
    return p.y > p.h / 2 ? 'top' : 'bottom';
  }

  private showTalk(): void {
    const t = this.talk_; if (!t) return;
    const line = t.who.lines[t.index];
    store.dispatch(setDialogue({ speaker: t.who.name, text: line.text, avatar: line.avatar ?? t.who.avatar, index: t.index, total: t.who.lines.length, pos: this.pos(line) }));
  }

  private showScene(now: number): void {
    const c = this.scene_; if (!c) return;
    const line = c.lines[c.index];
    c.until = now + (line.autoMs ?? 2500);
    store.dispatch(setDialogue({ speaker: c.speaker, text: line.text, avatar: line.avatar ?? 'default', index: c.index, total: c.lines.length, auto: true, pos: this.pos(line) }));
  }
}
