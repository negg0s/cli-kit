export type StringOption = {
  type: "string";
  description?: string;
  alias?: string;
  required?: boolean;
  default?: string;
};

export type BooleanOption = {
  type: "boolean";
  description?: string;
  alias?: string;
  default?: boolean;
};

export type NumberOption = {
  type: "number";
  description?: string;
  alias?: string;
  required?: boolean;
  default?: number;
};

export type EnumOption<T extends readonly string[] = readonly string[]> = {
  type: "enum";
  values: T;
  description?: string;
  alias?: string;
  required?: boolean;
  default?: T[number];
};

export type OptionDefinition = StringOption | BooleanOption | NumberOption | EnumOption;
export type OptionMap = Record<string, OptionDefinition>;
export type OptionValue<D> = D extends StringOption
  ? string
  : D extends BooleanOption
    ? boolean
    : D extends NumberOption
      ? number
      : D extends EnumOption<infer V>
        ? V[number]
        : never;

type RequiredOptionKeys<T extends OptionMap> = {
  [K in keyof T]: T[K] extends { required: true } | { default: unknown } ? K : never;
}[keyof T];

type OptionalOptionKeys<T extends OptionMap> = Exclude<keyof T, RequiredOptionKeys<T>>;

export type ParsedOptions<T extends OptionMap> = {
  [K in RequiredOptionKeys<T>]: OptionValue<T[K]>;
} & {
  [K in OptionalOptionKeys<T>]?: OptionValue<T[K]>;
};

export type ArgumentDefinition = {
  name: string;
  description?: string;
  required?: boolean;
};

export type ParsedArguments<T extends readonly ArgumentDefinition[]> = {
  [K in keyof T]: string;
};

export type CommandContext<
  TOptions extends OptionMap,
  TArgs extends readonly ArgumentDefinition[] = readonly ArgumentDefinition[],
> = {
  options: ParsedOptions<TOptions>;
  args: ParsedArguments<TArgs>;
  stdout: { write(text: string): void };
  stderr: { write(text: string): void };
};

export type CommandDefinition<
  TOptions extends OptionMap = OptionMap,
  TArgs extends readonly ArgumentDefinition[] = readonly ArgumentDefinition[],
> = {
  name: string;
  description: string;
  options?: TOptions;
  args?: TArgs;
  run: (context: CommandContext<TOptions, TArgs>) => number | void | Promise<number | void>;
};

export const option = {
  string: <const T extends Omit<StringOption, "type"> = {}>(config: T = {} as T): { type: "string" } & T => ({ type: "string", ...config }),
  boolean: <const T extends Omit<BooleanOption, "type"> = {}>(config: T = {} as T): { type: "boolean" } & T => ({ type: "boolean", ...config }),
  number: <const T extends Omit<NumberOption, "type"> = {}>(config: T = {} as T): { type: "number" } & T => ({ type: "number", ...config }),
  enum: <const V extends readonly string[], const T extends Omit<EnumOption<V>, "type" | "values"> = {}>(
    values: V,
    config: T = {} as T,
  ): { type: "enum"; values: V } & T => ({ type: "enum", values, ...config }),
};
