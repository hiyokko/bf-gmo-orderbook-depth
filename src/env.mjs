import { readFile } from "node:fs/promises";

export async function loadEnvFile(filePath, {
  environment = process.env,
} = {}) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const loadedKeys = [];
  for (const [key, value] of parseEnv(contents)) {
    if (key in environment) continue;
    environment[key] = value;
    loadedKeys.push(key);
  }
  return loadedKeys;
}

export function parseEnv(contents) {
  const entries = [];
  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(separator + 1).trim();
    const quoted = (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    );
    if (quoted) value = value.slice(1, -1);
    entries.push([key, value]);
  }
  return entries;
}
