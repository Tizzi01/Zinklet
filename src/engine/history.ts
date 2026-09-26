export interface Command {
  label: string;
  undo(): void;
  redo(): void;
}

export class History {
  private stack: Command[] = [];
  private index = 0;

  constructor(private limit = 60) {}

  push(cmd: Command) {
    this.stack.length = this.index;
    this.stack.push(cmd);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length;
  }

  undo(): Command | null {
    if (!this.canUndo) return null;
    const cmd = this.stack[--this.index];
    cmd.undo();
    return cmd;
  }

  redo(): Command | null {
    if (!this.canRedo) return null;
    const cmd = this.stack[this.index++];
    cmd.redo();
    return cmd;
  }

  clear() {
    this.stack = [];
    this.index = 0;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.stack.length;
  }
}
