import { Kbd, KbdGroup } from '@markfix/ui';
import './shortcut-guide.css';

const shortcuts = [
  ['新建标注', ['⌘', 'N'], '打开新建标注页面。'],
  ['显示或隐藏项目侧栏', ['⌘', 'B'], '在主窗口切换项目侧栏。'],
  ['聚焦地址栏', ['⌘', 'L'], '在标注页面聚焦并选中地址栏内容。'],
  ['切换元素批注', ['⌥', 'W'], '打开网站后切换批注模式。'],
  ['切换截图标注', ['⌥', 'A'], '打开网站后切换截图模式。'],
  ['保存当前批注', ['⌘', 'Enter'], '在备注输入区中，选中元素或建立截图选区并填写非空备注后保存。'],
  ['取消选区或退出标注', ['Esc'], '优先取消当前元素或截图选区；无选区时回到浏览模式。'],
  ['显示或隐藏调试面板', ['⌘', '⇧', 'C'], '在主窗口切换调试面板。'],
  ['打开设置', ['⌘', ','], '打开桌面端设置窗口。'],
  ['最小化或关闭窗口', ['⌘', 'W'], 'macOS 主窗口最小化；Windows 主窗口和各平台子窗口关闭。'],
  ['退出 MarkFix', ['⌘', 'Q'], '退出桌面应用。'],
] as const;

function ShortcutKeys({ keys }: { keys: readonly string[] }) {
  return (
    <KbdGroup>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

export function AnnotationShortcutHint({ mode }: { mode: 'element' | 'capture' }) {
  return (
    <p className="annotation-shortcut-hint">
      <span>macOS 快捷键</span>
      <ShortcutKeys keys={['⌥', mode === 'element' ? 'W' : 'A']} /> 切换模式
      <span className="shortcut-hint-divider">·</span>
      <ShortcutKeys keys={['⌘', 'Enter']} /> 保存批注
      <a href="#shortcuts">查看全部快捷键</a>
    </p>
  );
}

export function ShortcutGuide() {
  return (
    <article id="shortcuts" className="shortcut-guide">
      <span>04</span>
      <h2>快捷键</h2>
      <p>
        以下快捷键适用于桌面端，需在 MarkFix 窗口内使用；官网在线体验不提供这些桌面快捷键。⌘ 表示
        Command，⌥ 表示 Option，⇧ 表示 Shift。
      </p>
      <div className="shortcut-table-scroll" role="region" aria-label="桌面快捷键表" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">操作</th>
              <th scope="col">macOS</th>
              <th scope="col">Windows</th>
              <th scope="col">使用说明</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map(([action, keys, description]) => (
              <tr key={action}>
                <th scope="row">{action}</th>
                <td>
                  <ShortcutKeys keys={keys} />
                </td>
                <td>
                  <ShortcutKeys
                    keys={keys.map((key) =>
                      key === '⌘' ? 'Ctrl' : key === '⌥' ? 'Alt' : key === '⇧' ? 'Shift' : key,
                    )}
                  />
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        保存批注只保存当前记录。要交接给团队或
        Agent，请继续点击右上角提交按钮，在预览窗口勾选记录并确认提交。
      </p>
    </article>
  );
}
