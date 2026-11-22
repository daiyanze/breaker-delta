/** `import path from "./x.woff2" with { type: "file" }`: Bun gives the file's path. */
declare module "*.woff2" {
  const path: string;
  export default path;
}
