import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  version?: string;
};
const tauriConfig = JSON.parse(
  readFileSync("src-tauri/tauri.conf.json", "utf8"),
) as { version?: string };
const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoPackage = cargoToml.match(
  /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
);

const versions = {
  "package.json": packageJson.version,
  "src-tauri/Cargo.toml": cargoPackage?.[1],
  "src-tauri/tauri.conf.json": tauriConfig.version,
};

const missing = Object.entries(versions).filter(([, version]) => !version);
if (missing.length > 0) {
  throw new Error(
    `Missing version in: ${missing.map(([file]) => file).join(", ")}`,
  );
}

const uniqueVersions = new Set(Object.values(versions));
if (uniqueVersions.size !== 1) {
  throw new Error(
    `Application versions do not match:\n${Object.entries(versions)
      .map(([file, version]) => `  ${file}: ${version}`)
      .join("\n")}`,
  );
}

const version = packageJson.version!;
const semanticVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!semanticVersion.test(version)) {
  throw new Error(`Application version is not valid SemVer: ${version}`);
}

console.log(`Application versions match: ${version}`);
