import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export type PromptIO = {
  ask(question: string, signal?: AbortSignal): Promise<string | undefined>;
};

export type PromptChoice<T> = { label: string; value: T };

export function createPrompts(io: PromptIO) {
  return {
    text(question: string, signal?: AbortSignal): Promise<string | undefined> {
      return signal?.aborted ? Promise.resolve(undefined) : io.ask(question, signal);
    },
    async confirm(question: string, signal?: AbortSignal): Promise<boolean | undefined> {
      if (signal?.aborted) return undefined;
      const answer = await io.ask(`${question} [y/n]`, signal);
      if (answer === undefined) return undefined;
      const normalized = answer.trim().toLowerCase();
      if (normalized === "y" || normalized === "yes") return true;
      if (normalized === "n" || normalized === "no") return false;
      throw new Error("Invalid confirmation: expected y, yes, n, or no");
    },
    async select<const T>(question: string, choices: readonly PromptChoice<T>[], signal?: AbortSignal): Promise<T | undefined> {
      if (signal?.aborted) return undefined;
      if (choices.length === 0) throw new Error("A selection prompt requires at least one choice");
      const menu = choices.map(({ label }, index) => `${index + 1}) ${label}`).join("\n");
      const answer = await io.ask(`${question}\n${menu}\nChoice:`, signal);
      if (answer === undefined) return undefined;
      const normalized = answer.trim();
      if (!/^\d+$/.test(normalized)) throw new Error(`Invalid selection: choose a number from 1 to ${choices.length}`);
      const index = Number(normalized) - 1;
      if (index < 0 || index >= choices.length) throw new Error(`Invalid selection: choose a number from 1 to ${choices.length}`);
      return choices[index]!.value;
    },
  };
}

export function createReadlinePromptIO(input: Readable, output: Writable): PromptIO & { close(): void } {
  const readline = createInterface({ input, crlfDelay: Infinity, terminal: false });
  let pending: { resolve(value: string | undefined): void; signal?: AbortSignal; onAbort?: () => void } | undefined;
  let closed = false;
  const lines: string[] = [];

  readline.on("line", (line) => {
    if (!pending) {
      lines.push(line);
      readline.pause();
      return;
    }
    const current = pending;
    pending = undefined;
    if (current.signal && current.onAbort) current.signal.removeEventListener("abort", current.onAbort);
    readline.pause();
    current.resolve(line);
  });
  readline.on("close", () => {
    closed = true;
    if (!pending) return;
    const current = pending;
    pending = undefined;
    if (current.signal && current.onAbort) current.signal.removeEventListener("abort", current.onAbort);
    current.resolve(undefined);
  });

  return {
    ask(question, signal) {
      if (signal?.aborted) return Promise.resolve(undefined);
      if (pending) return Promise.reject(new Error("Only one prompt can be active at a time"));
      if (lines.length > 0) {
        output.write(`${question} `);
        return Promise.resolve(lines.shift()!);
      }
      if (closed) return Promise.resolve(undefined);
      return new Promise((resolve) => {
        const current: NonNullable<typeof pending> = { resolve, ...(signal ? { signal } : {}) };
        current.onAbort = () => {
          if (pending !== current) return;
          pending = undefined;
          readline.pause();
          current.resolve(undefined);
        };
        pending = current;
        signal?.addEventListener("abort", current.onAbort, { once: true });
        output.write(`${question} `);
        if (signal?.aborted) current.onAbort();
        else readline.resume();
      });
    },
    close() {
      readline.close();
    },
  };
}
