type OptionCommon = {
  description?: string;
  alias?: string;
  env?: string;
};

type ScalarConfig<T> = OptionCommon & {
  multiple?: false;
  required?: boolean;
  default?: T;
};

type MultipleConfig<T> = OptionCommon & {
  multiple: true;
  required?: boolean;
  default?: T[];
};

export type StringOption = { type: "string" } & (ScalarConfig<string> | MultipleConfig<string>);
export type BooleanOption = { type: "boolean" } & OptionCommon & { default?: boolean };
export type NumberOption = { type: "number" } & (ScalarConfig<number> | MultipleConfig<number>);
export type EnumOption<T extends readonly string[] = readonly string[]> = {
  type: "enum";
  values: T;
} & (ScalarConfig<T[number]> | MultipleConfig<T[number]>);

export type OptionDefinition = StringOption | BooleanOption | NumberOption | EnumOption;
export type OptionMap = Record<string, OptionDefinition>;

type ScalarOptionValue<D> = D extends { type: "string" }
  ? string
  : D extends { type: "boolean" }
    ? boolean
    : D extends { type: "number" }
      ? number
      : D extends { type: "enum"; values: infer V extends readonly string[] }
        ? V[number]
        : never;

export type OptionValue<D> = D extends { multiple: true }
  ? ScalarOptionValue<D>[]
  : ScalarOptionValue<D>;

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
  variadic?: boolean;
};

type ArgumentValue<A> = A extends { variadic: true }
  ? string[]
  : A extends { required: true }
    ? string
    : string | undefined;

export type ParsedArguments<T extends readonly ArgumentDefinition[]> = {
  [K in keyof T]: T[K] extends ArgumentDefinition ? ArgumentValue<T[K]> : T[K];
};

export type CommandContext<
  TOptions extends OptionMap,
  TArgs extends readonly ArgumentDefinition[] = readonly ArgumentDefinition[],
  TGlobalOptions extends OptionMap = {},
> = {
  options: ParsedOptions<TOptions>;
  args: ParsedArguments<TArgs>;
  globalOptions: ParsedOptions<TGlobalOptions>;
  stdout: { write(text: string): void };
  stderr: { write(text: string): void };
};

export type CommandDefinition<
  TOptions extends OptionMap = OptionMap,
  TArgs extends readonly ArgumentDefinition[] = readonly ArgumentDefinition[],
  TGlobalOptions extends OptionMap = {},
> = {
  name: string;
  description: string;
  options?: TOptions;
  args?: TArgs;
  run: (context: CommandContext<TOptions, TArgs, TGlobalOptions>) => number | void | Promise<number | void>;
};

export type CommandGroupDefinition<TCommands extends readonly CommandNode[] = readonly CommandNode[]> = {
  name: string;
  description: string;
  commands: TCommands;
};

export type CommandNode = CommandDefinition<any, any, any> | CommandGroupDefinition<any>;

type StringConfig = ScalarConfig<string> | MultipleConfig<string>;
type BooleanConfig = OptionCommon & { default?: boolean };
type NumberConfig = ScalarConfig<number> | MultipleConfig<number>;

function enumOption<const V extends readonly string[]>(values: V): { type: "enum"; values: V; multiple?: false };
function enumOption<
  const V extends readonly string[],
  const T extends ScalarConfig<V[number]> | MultipleConfig<V[number]>,
>(values: V, config: T): { type: "enum"; values: V } & T;
function enumOption<const V extends readonly string[]>(
  values: V,
  config: ScalarConfig<V[number]> | MultipleConfig<V[number]> = {},
): { type: "enum"; values: V } & (ScalarConfig<V[number]> | MultipleConfig<V[number]>) {
  return { type: "enum", values, ...config } as { type: "enum"; values: V } & (ScalarConfig<V[number]> | MultipleConfig<V[number]>);
}

export const option = {
  string: <const T extends StringConfig = ScalarConfig<string>>(config: T = {} as T): { type: "string" } & T => ({ type: "string", ...config }),
  boolean: <const T extends BooleanConfig = {}>(config: T = {} as T): { type: "boolean" } & T => ({ type: "boolean", ...config }),
  number: <const T extends NumberConfig = ScalarConfig<number>>(config: T = {} as T): { type: "number" } & T => ({ type: "number", ...config }),
  enum: enumOption,
};
