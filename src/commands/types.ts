export type Command = {
  // Dispatch tokens, e.g. ["metrics", "core-usage", "current"].
  name: string[];
  method: string;
  // Path with :param placeholders, e.g. /api/user/github/orgs/:org/team.
  path: string;
  // Ordered path params, e.g. ["org"]. Filled from --flags (org also from config).
  pathParams: string[];
  // Query keys observed in the HAR, surfaced in help so users know what --query to pass.
  query: string[];
  bodyContentType?: string;
  description?: string;
};

export function commandKey(c: Command): string {
  return c.name.join(" ");
}

export function findCommand(commands: Command[], tokens: string[]): Command | undefined {
  return commands.find(
    (c) => c.name.length === tokens.length && c.name.every((n, i) => n === tokens[i]),
  );
}
