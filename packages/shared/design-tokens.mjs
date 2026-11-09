export function resolveAlias(tokens, value) {
  if (typeof value !== "string" || !value.startsWith("{")) return value;
  const target = value
    .slice(1, -1)
    .split(".")
    .reduce((node, key) => node[key], tokens);
  return resolveAlias(tokens, target.$value);
}
