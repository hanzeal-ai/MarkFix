import type { InlineNote, InlineNoteAction } from '../inline-note';

export class InlineNoteEditor {
  private state: InlineNote | null = null;
  private readonly form = document.createElement('form');
  private readonly input = document.createElement('input');
  private composing = false;
  private readonly submit = document.createElement('button');
  constructor(
    root: ShadowRoot,
    private readonly send: (action: InlineNoteAction) => void,
  ) {
    this.form.setAttribute('aria-label', '备注输入');
    Object.assign(this.form.style, {
      display: 'none',
      position: 'fixed',
      zIndex: '2147483647',
      pointerEvents: 'auto',
      boxSizing: 'border-box',
      padding: '5px 8px',
      gap: '8px',
      alignItems: 'center',
      background: '#fff',
      border: '1px solid #d4d4d8',
      borderRadius: '10px',
      boxShadow: '0 4px 18px #0002',
      font: '13px system-ui',
    });
    this.input.setAttribute('aria-label', '备注');
    this.input.placeholder = '填写备注';
    this.input.maxLength = 2000;
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    Object.assign(this.input.style, {
      flex: '1',
      minWidth: '0',
      resize: 'none',
      border: 'none',
      outline: 'none',
      background: '#fff',
      color: '#202023',
      font: '13px system-ui',
      lineHeight: '20px',
      height: '20px',
      padding: '0',
    });
    this.submit.type = 'submit';
    this.submit.textContent = '提交';
    Object.assign(this.submit.style, {
      border: 'none',
      borderRadius: '6px',
      padding: '6px 12px',
      background: '#202023',
      color: '#fff',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '×';
    cancel.setAttribute('aria-label', '取消备注');
    Object.assign(cancel.style, { border: 'none', background: 'transparent', cursor: 'pointer' });
    cancel.addEventListener('click', (event) => {
      if (event.isTrusted) this.emit('cancel');
    });
    this.input.addEventListener('compositionstart', () => {
      this.composing = true;
      this.updateButton();
    });
    this.input.addEventListener('compositionend', () => {
      this.composing = false;
      this.updateButton();
      this.emit('change');
    });
    this.input.addEventListener('input', (event) => {
      if (!event.isTrusted) return;
      this.updateButton();
      if (!this.composing && !(event as InputEvent).isComposing) this.emit('change');
    });
    this.input.addEventListener('keydown', (event) => {
      if (!event.isTrusted) return;
      event.stopPropagation();
      if (this.composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        if (!this.submit.disabled) this.emit('submit');
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.emit('cancel');
      }
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (event.isTrusted && !this.submit.disabled) this.emit('submit');
    });
    for (const name of ['pointerdown', 'mousedown', 'click', 'dblclick']) {
      this.form.addEventListener(name, (event) => event.stopPropagation());
    }
    this.form.append(this.input, this.submit, cancel);
    root.append(this.form);
  }
  private emit(action: InlineNoteAction['action']): void {
    if (!this.state) return;
    this.send({
      action,
      mode: this.state.mode,
      documentUrl: this.state.anchor.documentUrl,
      note: this.input.value,
    });
  }
  private updateButton(): void {
    this.submit.textContent = this.state?.saving ? '保存中…' : '提交';
    this.submit.disabled =
      this.composing ||
      Boolean(this.state?.saving) ||
      !this.state?.ready ||
      !this.input.value.trim();
    this.submit.style.opacity = this.submit.disabled ? '0.45' : '1';
  }
  setState(state: InlineNote | null): void {
    const opening =
      !this.state ||
      this.state.mode !== state?.mode ||
      JSON.stringify(this.state.anchor) !== JSON.stringify(state?.anchor);
    this.state = state;
    if (!state || state.anchor.documentUrl !== location.href) {
      this.composing = false;
      this.form.style.display = 'none';
      return;
    }
    // The active editor owns its value. IPC echoes may arrive after newer keystrokes.
    if (
      opening ||
      (!this.composing &&
        this.input.getRootNode() instanceof ShadowRoot &&
        (this.input.getRootNode() as ShadowRoot).activeElement !== this.input)
    ) {
      if (this.input.value !== state.note) this.input.value = state.note;
    }
    this.form.style.display = 'flex';
    this.updateButton();
    this.position();
    if (opening) this.input.focus({ preventScroll: true });
  }
  position(toolbar?: HTMLElement): void {
    const state = this.state;
    if (!state) return;
    let x = 12,
      y = 12,
      bottom = 12;
    if (state.anchor.kind === 'region') {
      x = state.anchor.xCssPx;
      y = state.anchor.yCssPx;
      bottom = y + state.anchor.heightCssPx;
    } else if (state.anchor.kind === 'element') {
      let rect: DOMRect | undefined;
      try {
        rect = document.querySelector(state.anchor.cssSelector)?.getBoundingClientRect();
      } catch {
        /* Recovery uses the recorded quad. */
      }
      const quad = state.anchor.quadsCssPx[0];
      x = rect?.left ?? quad?.[0] ?? 12;
      y = rect?.top ?? quad?.[1] ?? 12;
      bottom = rect?.bottom ?? quad?.[5] ?? y;
    }
    let width = Math.min(420, Math.max(160, innerWidth - 24));
    let top = bottom + 10;
    this.form.style.height =
      toolbar && toolbar.style.display !== 'none'
        ? `${toolbar.getBoundingClientRect().height}px`
        : '44px';
    if (toolbar && toolbar.style.display !== 'none') {
      const rect = toolbar.getBoundingClientRect();
      if (innerWidth - rect.right - 20 >= 260) {
        width = Math.min(width, innerWidth - rect.right - 20);
        x = rect.right + 10;
        top = rect.top;
      } else {
        top = rect.bottom + 8;
      }
    }
    const height = this.form.offsetHeight || 66;
    if (top + height > innerHeight - 8) top = Math.max(8, y - height - 10);
    Object.assign(this.form.style, {
      width: `${width}px`,
      left: `${Math.max(8, Math.min(x, innerWidth - width - 8))}px`,
      top: `${Math.max(8, Math.min(top, innerHeight - height - 8))}px`,
    });
  }
}
