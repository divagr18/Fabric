import { Pipeline } from '../forge/pipeline';

/**
 * WebMCP tool registry — every document.modelContext call in Fabric lives in this
 * directory. Tools register via the standard API; revoke/hot-swap = abort the
 * registration's AbortController and (for swaps) re-register under the same name,
 * which fires the spec's `toolchange` so connected agents refresh their tool list.
 */

export interface WebMcpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface RegisteredTool {
  def: WebMcpToolDef;
  controller: AbortController;
  origin: 'core' | 'forged';
  pipeline?: Pipeline;
  version: number;
}

interface ModelContext {
  registerTool(def: unknown, opts?: { signal?: AbortSignal }): void | Promise<void>;
  addEventListener?(type: string, cb: () => void): void;
}

export function getModelContext(): ModelContext | null {
  const d = document as Document & { modelContext?: ModelContext };
  const n = navigator as Navigator & { modelContext?: ModelContext };
  return d.modelContext ?? n.modelContext ?? null;
}

export type RegistryEvent =
  | { type: 'registered'; name: string; origin: 'core' | 'forged'; version: number }
  | { type: 'revoked'; name: string }
  | { type: 'swapped'; name: string; version: number }
  | { type: 'unavailable' };

export class WebMcpRegistry {
  private tools = new Map<string, RegisteredTool>();
  private listeners: Array<(e: RegistryEvent) => void> = [];
  readonly available: boolean;

  constructor() {
    this.available = getModelContext() !== null;
  }

  on(cb: (e: RegistryEvent) => void) {
    this.listeners.push(cb);
  }

  private emit(e: RegistryEvent) {
    for (const cb of this.listeners) cb(e);
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  async register(def: WebMcpToolDef, origin: 'core' | 'forged', pipeline?: Pipeline): Promise<void> {
    const mc = getModelContext();
    if (!mc) {
      this.emit({ type: 'unavailable' });
      throw new Error('WebMCP not available — open this page in ChatGPT\'s browser or Chrome with WebMCP enabled');
    }
    const existing = this.tools.get(def.name);
    const version = (existing?.version ?? 0) + 1;
    existing?.controller.abort(); // hot-swap path: unregister the old implementation first

    const controller = new AbortController();
    await mc.registerTool(
      {
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          const result = await def.execute(args ?? {});
          return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
        },
      },
      { signal: controller.signal },
    );
    this.tools.set(def.name, { def, controller, origin, pipeline, version });
    this.emit(version > 1 ? { type: 'swapped', name: def.name, version } : { type: 'registered', name: def.name, origin, version });
  }

  revoke(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    tool.controller.abort();
    this.tools.delete(name);
    this.emit({ type: 'revoked', name });
    return true;
  }
}
